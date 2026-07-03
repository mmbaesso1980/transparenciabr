"""
Motor WOLF-Trader: liga a leitura do Polymarket à doutrina WOLF e à execução,
com FREIOS (limites de risco + gate de valor no Telegram).

Fluxo:
  mercados -> mapear sinais (técnico/macro/político) -> wolf_doctrine.avaliar()
  -> dimensionar (respeitando limites) -> gate de valor -> executar/pedir aprovação
  -> auditar + notificar.

LEIS: R2 (sem dado) não opera; R1 corta se estourar exposição; execução acima do
gate exige aprovação do Comandante; nada de promessa de retorno; tudo auditado.

INTEGRAÇÃO: consome bridge/devin_bridge/wolf_doctrine.py (já mergeado no main).
Não duplica a doutrina — apenas converte observações de mercado em Sinal[] e
chama avaliar().
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Optional

from devin_bridge.wolf_doctrine import (
    Acao,
    Decisao,
    LinhaDecisao,
    Sinal,
    avaliar,
)
from devin_bridge.config import WolfConfig
from wolf_trader.polymarket_client import (
    PolymarketReader, PolymarketTrader, OrdemRequest, Mercado, Cotacao,
)

logger = logging.getLogger("wolf_trader.engine")


def _envf(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


@dataclass
class LimitesRisco:
    """Freios duros do Comandante (a Onça)."""
    gate_usdc: float = field(default_factory=lambda: _envf("WOLF_ORDER_GATE_USDC", 25.0))
    max_por_ordem_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_ORDER_USDC", 50.0))
    max_diario_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_DAILY_USDC", 200.0))
    max_por_mercado_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_MARKET_USDC", 75.0))


@dataclass
class Proposta:
    mercado: Mercado
    token_id: str
    decisao: Decisao
    lado: str                 # BUY | SELL
    preco: float
    size_usdc: float
    precisa_gate: bool
    motivo_corte: Optional[str] = None


# Mapa ação WOLF -> lado de mercado
_LADO = {
    Acao.COMPRAR_FORTE: "BUY",
    Acao.COMPRAR: "BUY",
    Acao.VENDER: "SELL",
    Acao.REDUZIR: "SELL",
}

# Mapa código de observação -> (LinhaDecisao, direção default)
_CODIGO_LINHA: dict[str, LinhaDecisao] = {
    "T1": LinhaDecisao.T, "T2": LinhaDecisao.T, "T3": LinhaDecisao.T,
    "T4": LinhaDecisao.T, "T5": LinhaDecisao.T,
    "F1": LinhaDecisao.F, "F2": LinhaDecisao.F,
    "M1": LinhaDecisao.M, "M2": LinhaDecisao.M,
    "P1": LinhaDecisao.P, "P2": LinhaDecisao.P, "P3": LinhaDecisao.P,
    "J1": LinhaDecisao.J,
    "R1": LinhaDecisao.R, "R2": LinhaDecisao.R,
}


def observacoes_para_sinais(obs: dict[str, float | bool],
                            default_conviccao: float = 0.8) -> list[Sinal]:
    """Converte dict de observações em lista de Sinal para wolf_doctrine.avaliar().

    Cada chave é um código (T1, F1, R2, etc.). O valor pode ser:
    - bool (True = direção +0.7, False ignorado)
    - float (interpretado como direção; convicção = default_conviccao)
    - tuple(direcao, conviccao)
    """
    sinais: list[Sinal] = []
    for codigo, valor in obs.items():
        linha = _CODIGO_LINHA.get(codigo)
        if linha is None:
            continue
        if isinstance(valor, bool):
            if not valor:
                continue
            direcao = -0.7 if codigo in ("R1", "R2") else 0.7
            conviccao = default_conviccao
        elif isinstance(valor, (int, float)):
            direcao = float(valor)
            conviccao = default_conviccao
        else:
            continue
        sinais.append(Sinal(
            linha=linha,
            codigo=codigo,
            direcao=direcao,
            conviccao=conviccao,
        ))
    return sinais


class WolfTraderEngine:
    def __init__(self, reader: PolymarketReader, trader: PolymarketTrader,
                 limites: Optional[LimitesRisco] = None,
                 wolf_config: Optional[WolfConfig] = None,
                 audit=None, telegram=None, gate_register=None):
        self.reader = reader
        self.trader = trader
        self.limites = limites or LimitesRisco()
        self.wolf_config = wolf_config or WolfConfig()
        self.audit = audit
        self.telegram = telegram
        self.gate_register = gate_register
        self._gasto_dia_usdc = 0.0

    # ---- mapeamento de sinais (interface plugável) ----
    def mapear_sinais(self, mercado: Mercado, cot: Cotacao,
                      contexto: Optional[dict] = None) -> dict[str, float | bool]:
        """
        Converte dados observados em gatilhos das linhas WOLF (F/M/T/P/J/R).
        `contexto` pode trazer sinais externos já computados (momentum, fluxo,
        notícia, pesquisa). Sem dado confiável -> R2 (regra 9).
        """
        obs: dict[str, float | bool] = {}
        ctx = contexto or {}

        if cot.mid is None:
            obs["R2"] = True
            return obs

        for lid in ("T1", "T2", "T3", "T4", "T5",
                    "F1", "F2", "M1", "M2", "P1", "P2", "P3", "J1", "R1"):
            if ctx.get(lid) is not None:
                obs[lid] = ctx[lid]
        return obs

    # ---- dimensionamento com limites ----
    def _dimensionar(self, decisao: Decisao) -> float:
        base = self.limites.max_por_ordem_usdc * decisao.conviccao
        base = min(base, self.limites.max_por_ordem_usdc,
                   self.limites.max_por_mercado_usdc)
        restante_dia = self.limites.max_diario_usdc - self._gasto_dia_usdc
        return max(0.0, min(base, restante_dia))

    def avaliar_mercado(self, mercado: Mercado, token_id: str,
                        contexto: Optional[dict] = None) -> Optional[Proposta]:
        cot = self.reader.cotacao(token_id)
        obs = self.mapear_sinais(mercado, cot, contexto)
        sinais = observacoes_para_sinais(obs)
        decisao = avaliar(sinais, self.wolf_config)

        if decisao.acao in (Acao.SEM_CONVICCAO, Acao.MANTER):
            return None
        lado = _LADO.get(decisao.acao)
        if not lado or cot.mid is None:
            return None

        size = self._dimensionar(decisao)
        if size <= 0:
            return Proposta(mercado, token_id, decisao, lado, cot.mid, 0.0,
                            precisa_gate=False, motivo_corte="limite diario/risco atingido (R1)")
        precisa_gate = size > self.limites.gate_usdc
        return Proposta(mercado, token_id, decisao, lado, cot.mid, size, precisa_gate)

    # ---- execução com gate ----
    def executar(self, prop: Proposta) -> str:
        if prop.motivo_corte:
            self._log("wolf.ordem.cortada", prop, extra={"motivo": prop.motivo_corte})
            return f"Ordem nao enviada: {prop.motivo_corte}"

        size_shares = round(prop.size_usdc / prop.preco, 4) if prop.preco else 0.0
        req = OrdemRequest(token_id=prop.token_id, lado=prop.lado,
                           preco=round(prop.preco, 4), size=size_shares)

        if prop.precisa_gate:
            gate_id = uuid.uuid4().hex[:8]
            if self.gate_register:
                self.gate_register(gate_id, prop, req)
            self._log("wolf.ordem.gate", prop, extra={"gate_id": gate_id})
            if self.telegram:
                self.telegram(
                    f"\U0001F43A Gate de ordem <code>{gate_id}</code>\n"
                    f"{prop.lado} US$ {prop.size_usdc:.2f} em: {prop.mercado.pergunta[:80]}\n"
                    f"Ação {prop.decisao.acao.value} ({prop.decisao.conviccao:.0%})"
                    f"{' [OVERRIDE TÉCNICO]' if prop.decisao.override_tecnico else ''}\n"
                    f"Aprovar: /aprovar {gate_id}  |  Negar: /negar {gate_id}"
                )
            return f"Aguardando gate {gate_id} (ordem acima de US$ {self.limites.gate_usdc:.0f})."

        res = self.trader.postar_ordem(req)
        if res.ok:
            self._gasto_dia_usdc += prop.size_usdc
        self._log("wolf.ordem.enviada", prop, extra={"ok": res.ok, "detalhe": res.detalhe})
        return res.detalhe

    def aprovar_gate(self, prop: Proposta, req: OrdemRequest) -> str:
        res = self.trader.postar_ordem(req)
        if res.ok:
            self._gasto_dia_usdc += prop.size_usdc
        self._log("wolf.ordem.aprovada", prop, extra={"ok": res.ok, "detalhe": res.detalhe})
        return res.detalhe

    def _log(self, event: str, prop: Proposta, extra: dict | None = None) -> None:
        if not self.audit:
            return
        try:
            self.audit.log(event_type=event, actor="wolf-trader", action=prop.lado,
                           payload={
                               "mercado": prop.mercado.pergunta[:120],
                               "condition_id": prop.mercado.condition_id,
                               "acao": prop.decisao.acao.value,
                               "conviccao": round(prop.decisao.conviccao, 3),
                               "override_tecnico": prop.decisao.override_tecnico,
                               "size_usdc": round(prop.size_usdc, 2),
                               **(extra or {}),
                           })
        except Exception as e:  # noqa: BLE001
            logger.warning("Falha ao auditar %s: %s", event, e)
