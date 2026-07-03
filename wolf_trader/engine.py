"""
Motor WOLF-Trader: liga a leitura do Polymarket a doutrina WOLF e a execucao,
com FREIOS (limites de risco + gate de valor no Telegram).

Fluxo:
  mercados -> mapear sinais (tecnico/macro/politico) -> wolf_doctrine.avaliar()
  -> dimensionar (respeitando limites) -> gate de valor -> executar/pedir aprovacao
  -> auditar + notificar.

LEIS: R2 (sem dado) nao opera; R1 corta se estourar exposicao; execucao acima do
gate exige aprovacao do Comandante; nada de promessa de retorno; tudo auditado.
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Optional

from devin_bridge import wolf_doctrine
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
    """Freios duros do Comandante (a Onca)."""
    gate_usdc: float = field(default_factory=lambda: _envf("WOLF_ORDER_GATE_USDC", 25.0))
    max_por_ordem_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_ORDER_USDC", 50.0))
    max_diario_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_DAILY_USDC", 200.0))
    max_por_mercado_usdc: float = field(default_factory=lambda: _envf("WOLF_MAX_MARKET_USDC", 75.0))


@dataclass
class Proposta:
    mercado: Mercado
    token_id: str
    veredito: wolf_doctrine.Veredito
    lado: str                 # BUY | SELL
    preco: float
    size_usdc: float
    precisa_gate: bool
    motivo_corte: Optional[str] = None


# mapa sinal WOLF -> lado de mercado
_LADO = {
    wolf_doctrine.Sinal.COMPRAR_FORTE: "BUY",
    wolf_doctrine.Sinal.COMPRAR: "BUY",
    wolf_doctrine.Sinal.VENDER: "SELL",
    wolf_doctrine.Sinal.REDUZIR: "SELL",
}


class WolfTraderEngine:
    def __init__(self, reader: PolymarketReader, trader: PolymarketTrader,
                 limites: Optional[LimitesRisco] = None,
                 audit=None, telegram=None, gate_register=None):
        self.reader = reader
        self.trader = trader
        self.limites = limites or LimitesRisco()
        self.audit = audit
        self.telegram = telegram
        # callback para registrar gate aprovavel via /aprovar (listener)
        self.gate_register = gate_register
        self._gasto_dia_usdc = 0.0

    # ---- mapeamento de sinais (interface plugavel) ----
    def mapear_sinais(self, mercado: Mercado, cot: Cotacao,
                      contexto: Optional[dict] = None) -> dict[str, bool]:
        """
        Converte dados observados em gatilhos das linhas WOLF (F/M/T/P/J/R).
        `contexto` pode trazer sinais externos ja computados (momentum, fluxo,
        noticia, pesquisa). Sem dado confiavel -> R2 (regra 9).
        """
        obs: dict[str, bool] = {}
        ctx = contexto or {}

        if cot.mid is None:
            obs["R2"] = True   # sem preco confiavel -> sem convccao
            return obs

        # Tecnico (dominante na doutrina v2) — vem de indicadores externos calculados.
        for lid in ("T1", "T2", "T3", "T4", "T5"):
            if ctx.get(lid):
                obs[lid] = True
        # Fundamento / macro / politico / juridico / risco — tambem via contexto.
        for lid in ("F1", "F2", "M1", "M2", "P1", "P2", "P3", "J1", "R1"):
            if ctx.get(lid):
                obs[lid] = True
        return obs

    # ---- dimensionamento com limites ----
    def _dimensionar(self, veredito: wolf_doctrine.Veredito) -> float:
        base = self.limites.max_por_ordem_usdc * veredito.convccao
        base = min(base, self.limites.max_por_ordem_usdc,
                   self.limites.max_por_mercado_usdc)
        restante_dia = self.limites.max_diario_usdc - self._gasto_dia_usdc
        return max(0.0, min(base, restante_dia))

    def avaliar_mercado(self, mercado: Mercado, token_id: str,
                        contexto: Optional[dict] = None) -> Optional[Proposta]:
        cot = self.reader.cotacao(token_id)
        obs = self.mapear_sinais(mercado, cot, contexto)
        veredito = wolf_doctrine.avaliar(obs)

        if veredito.sinal in (wolf_doctrine.Sinal.SEM_CONVICCAO,
                              wolf_doctrine.Sinal.SEGURAR):
            return None
        lado = _LADO.get(veredito.sinal)
        if not lado or cot.mid is None:
            return None

        size = self._dimensionar(veredito)
        if size <= 0:
            return Proposta(mercado, token_id, veredito, lado, cot.mid, 0.0,
                            precisa_gate=False, motivo_corte="limite diario/risco atingido (R1)")
        precisa_gate = size > self.limites.gate_usdc
        return Proposta(mercado, token_id, veredito, lado, cot.mid, size, precisa_gate)

    # ---- execucao com gate ----
    def executar(self, prop: Proposta) -> str:
        if prop.motivo_corte:
            self._log("wolf.ordem.cortada", prop, extra={"motivo": prop.motivo_corte})
            return f"Ordem nao enviada: {prop.motivo_corte}"

        # shares ~ usdc / preco (preco em probabilidade 0..1)
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
                    f"Sinal {prop.veredito.sinal.value} ({prop.veredito.convccao:.0%})"
                    f"{' [OVERRIDE TECNICO]' if prop.veredito.override_tecnico else ''}\n"
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
                               "sinal": prop.veredito.sinal.value,
                               "conviccao": round(prop.veredito.convccao, 3),
                               "override_tecnico": prop.veredito.override_tecnico,
                               "size_usdc": round(prop.size_usdc, 2),
                               **(extra or {}),
                           })
        except Exception as e:  # noqa: BLE001
            logger.warning("Falha ao auditar %s: %s", event, e)
