"""Gerador de sinais TÉCNICOS (linha T da doutrina WOLF) a partir do book do
Polymarket — sem depender de fonte externa, credencial ou crédito Vertex.

Motivação: o motor WOLF (`devin_bridge.wolf_doctrine.avaliar`) só decide operar
quando recebe sinais. O runner rodava chamando `avaliar_mercado` SEM contexto,
então `mapear_sinais` só via o preço e nunca preenchia gatilho -> SEM_CONVICCAO
-> 0 propostas para sempre. Este módulo produz sinais técnicos calibrados a
partir do próprio dado de mercado que o robô já lê (bid/ask/mid + histórico),
alimentando as linhas T1-T3.

MODO AGRESSIVO (WOLF_TEC_AGRESSIVO=true, padrão): limiares baixíssimos para que
qualquer viés no book gere sinal e o robô reaja a 100% das atualizações com uma
direção. HOLD só sobra em empate perfeito (mid == 0.5 sem momentum). Diretriz do
Comandante Baesso: "reagir a 100% das atualizações com compra, vende ou hold".

DOUTRINA respeitada mesmo no modo agressivo:
  - R2 (regra 9): dado ausente (mid None) ou probabilidade inválida -> [].
    Mercado ilíquido só corta se WOLF_TEC_CORTAR_ILIQUIDO=true (padrão false no
    modo agressivo — ainda emite sinal, mas com convicção reduzida pela liquidez).
  - Neutralidade de lado: direção pode ser + (bullish) ou - (bearish).
  - Convicção sempre em [0,1]; o gate de valor e os freios continuam na engine.
"""
from __future__ import annotations

import os
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict

from devin_bridge.wolf_doctrine import Sinal, LinhaDecisao
from wolf_trader.polymarket_client import Cotacao
from wolf_trader.doutrina_mestres import DoutrinaMestres, agora_s


def _envf(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


def _envi(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


def _envb(key: str, default: bool) -> bool:
    return os.environ.get(key, str(default)).strip().lower() in (
        "1", "true", "yes", "on")


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class ConfigSinaisTecnicos:
    """Limiares calibráveis (via env WOLF_TEC_*).

    Padrões abaixo já refletem o modo AGRESSIVO pedido pelo Comandante: o robô
    reage a qualquer viés perceptível no book. Para voltar ao modo conservador,
    defina WOLF_TEC_AGRESSIVO=false (aumenta limiares automaticamente).
    """
    # Modo agressivo liga por padrão (diretriz "reagir a 100%").
    agressivo: bool = field(
        default_factory=lambda: _envb("WOLF_TEC_AGRESSIVO", True))
    # Quantos mids guardar por token (janela de momentum).
    janela: int = field(default_factory=lambda: _envi("WOLF_TEC_JANELA", 8))
    # Mínimo de amostras antes de emitir T2 (momentum).
    min_amostras_momentum: int = field(
        default_factory=lambda: _envi("WOLF_TEC_MIN_AMOSTRAS", 2))
    # Spread relativo (spread/mid) acima disto = ilíquido.
    spread_rel_max: float = field(
        default_factory=lambda: _envf("WOLF_TEC_SPREAD_REL_MAX", 0.20))
    # Se true, mercado ilíquido corta o sinal (retorna []). No modo agressivo o
    # padrão é NÃO cortar — apenas reduzir convicção pela liquidez.
    cortar_iliquido: bool = field(
        default_factory=lambda: _envb("WOLF_TEC_CORTAR_ILIQUIDO", False))
    # Desvio mínimo do mid vs 0.5 para T1 valer.
    t1_desvio_min: float = field(
        default_factory=lambda: _envf("WOLF_TEC_T1_DESVIO_MIN", 0.005))
    # Momentum mínimo (variação absoluta do mid na janela) para T2 valer.
    t2_momentum_min: float = field(
        default_factory=lambda: _envf("WOLF_TEC_T2_MOMENTUM_MIN", 0.002))
    # Teto de convicção por sinal (nunca 1.0 — humildade estatística).
    conviccao_max: float = field(
        default_factory=lambda: _envf("WOLF_TEC_CONVICCAO_MAX", 0.85))
    # Piso de convicção para o sinal T1 no modo agressivo (garante que um viés,
    # ainda que pequeno, ultrapasse o limiar de ação da doutrina).
    conviccao_piso: float = field(
        default_factory=lambda: _envf("WOLF_TEC_CONVICCAO_PISO", 0.30))

    def __post_init__(self) -> None:
        # No modo conservador, endurece limiares se o usuário não os fixou.
        if not self.agressivo:
            if "WOLF_TEC_T1_DESVIO_MIN" not in os.environ:
                self.t1_desvio_min = 0.08
            if "WOLF_TEC_T2_MOMENTUM_MIN" not in os.environ:
                self.t2_momentum_min = 0.02
            if "WOLF_TEC_MIN_AMOSTRAS" not in os.environ:
                self.min_amostras_momentum = 3
            if "WOLF_TEC_SPREAD_REL_MAX" not in os.environ:
                self.spread_rel_max = 0.10
            if "WOLF_TEC_CORTAR_ILIQUIDO" not in os.environ:
                self.cortar_iliquido = True
            if "WOLF_TEC_CONVICCAO_PISO" not in os.environ:
                self.conviccao_piso = 0.0


class GeradorSinaisTecnicos:
    """Mantém histórico de preço por token e emite sinais T calibrados.

    Uso (no runner, uma instância por processo, persistente entre ciclos):
        gen = GeradorSinaisTecnicos()
        sinais = gen.gerar(cotacao)          # list[Sinal] (pode ser [])
    """

    def __init__(self, config: ConfigSinaisTecnicos | None = None,
                 mestres: DoutrinaMestres | None = None) -> None:
        self.cfg = config or ConfigSinaisTecnicos()
        self._hist: Dict[str, Deque[float]] = {}
        # Último instante em que o mid MUDOU por token (para o decaimento de
        # Curie: dado estático há muito tempo perde convicção).
        self._ultimo_mov_s: Dict[str, float] = {}
        self._ultimo_mid: Dict[str, float] = {}
        # Doutrina dos Mestres (Einstein/Wolf/Hawking/Curie) — modula convicção.
        self.mestres = mestres or DoutrinaMestres()

    def _push(self, token_id: str, mid: float) -> Deque[float]:
        dq = self._hist.get(token_id)
        if dq is None:
            dq = deque(maxlen=self.cfg.janela)
            self._hist[token_id] = dq
        dq.append(mid)
        return dq

    def gerar(self, cot: Cotacao) -> list[Sinal]:
        # R2: sem mid confiável -> sem sinal (nunca inventa).
        if cot is None or cot.mid is None:
            return []
        mid = float(cot.mid)
        # Probabilidades válidas ficam estritamente em (0,1).
        if not (0.0 < mid < 1.0):
            return []

        dq = self._push(cot.token_id, mid)

        # --- rastreio de movimento (Curie): idade desde a última mudança de mid ---
        agora = agora_s()
        mid_ant = self._ultimo_mid.get(cot.token_id)
        if mid_ant is None or abs(mid - mid_ant) > 1e-9:
            self._ultimo_mov_s[cot.token_id] = agora
        self._ultimo_mid[cot.token_id] = mid
        idade_s = agora - self._ultimo_mov_s.get(cot.token_id, agora)

        # --- fator de liquidez (spread) — modula a convicção de todos os T ---
        # spread_rel também alimenta a ENTROPIA de Hawking (incerteza do book).
        liquidez_fator = 1.0
        entropia = 0.0
        if cot.bid is not None and cot.ask is not None and cot.ask > cot.bid:
            spread = cot.ask - cot.bid
            spread_rel = spread / mid if mid > 0 else 1.0
            # Entropia normalizada: 0 (book apertado) .. 1 (no limite de liquidez).
            entropia = _clamp(spread_rel / self.cfg.spread_rel_max, 0.0, 1.0)
            if spread_rel >= self.cfg.spread_rel_max:
                if self.cfg.cortar_iliquido:
                    # Modo conservador: R2 -> não opera em mercado ilíquido.
                    return []
                # Modo agressivo: ainda opera, mas com convicção bem reduzida.
                liquidez_fator = 0.35
            else:
                # spread apertado (->0) => fator ~1; perto do limite => menor.
                liquidez_fator = _clamp(
                    1.0 - (spread_rel / self.cfg.spread_rel_max), 0.35, 1.0)

        # Momentum absoluto (para Wolf): magnitude do movimento recente do mid.
        momentum_abs = 0.0
        if len(dq) >= 2:
            momentum_abs = _clamp(abs(dq[-1] - dq[0]) / 0.2, 0.0, 1.0)

        def _modular(conv: float) -> float:
            """Passa a convicção bruta pela Doutrina dos Mestres."""
            return self.mestres.modular(
                conv, momentum_abs=momentum_abs,
                entropia=entropia, idade_s=idade_s)

        sinais: list[Sinal] = []

        # --- T1: viés de consenso (distância do mid a 0.5) ---
        desvio = mid - 0.5  # >0 => mercado precifica "sim"; <0 => "não"
        if abs(desvio) >= self.cfg.t1_desvio_min:
            direcao = _clamp(desvio / 0.5, -1.0, 1.0)  # normaliza para [-1,1]
            conviccao = _clamp(abs(desvio) / 0.5, 0.0, 1.0) * liquidez_fator
            conviccao = _modular(conviccao)  # Doutrina dos Mestres
            # Piso de convicção: garante que um viés perceptível vire ação.
            conviccao = max(conviccao, self.cfg.conviccao_piso * liquidez_fator)
            conviccao = min(conviccao, self.cfg.conviccao_max)
            sinais.append(Sinal(
                linha=LinhaDecisao.T, codigo="T1",
                direcao=direcao, conviccao=conviccao,
            ))

        # --- T2: momentum (tendência recente do mid) ---
        if len(dq) >= self.cfg.min_amostras_momentum:
            delta = dq[-1] - dq[0]
            if abs(delta) >= self.cfg.t2_momentum_min:
                direcao = _clamp(delta / 0.2, -1.0, 1.0)  # 0.2 de mov => saturado
                conviccao = _clamp(abs(delta) / 0.2, 0.0, 1.0) * liquidez_fator
                conviccao = _modular(conviccao)  # Doutrina dos Mestres
                conviccao = max(conviccao,
                                self.cfg.conviccao_piso * liquidez_fator)
                conviccao = min(conviccao, self.cfg.conviccao_max)
                sinais.append(Sinal(
                    linha=LinhaDecisao.T, codigo="T2",
                    direcao=direcao, conviccao=conviccao,
                ))

        # --- T3: reforço de direção (modulador) ---
        # Emite T3 sempre que há direção (T1/T2). No modo agressivo, o T3 garante
        # massa mínima (>=3) para o OVERRIDE TÉCNICO da doutrina quando T1 e T2
        # concordam, empurrando a decisão para ação em vez de MANTER.
        if sinais and liquidez_fator >= 0.4:
            direcao_media = sum(s.direcao for s in sinais) / len(sinais)
            conv_media = sum(s.conviccao for s in sinais) / len(sinais)
            sinais.append(Sinal(
                linha=LinhaDecisao.T, codigo="T3",
                direcao=_clamp(direcao_media, -1.0, 1.0),
                conviccao=min(conv_media * liquidez_fator,
                              self.cfg.conviccao_max),
                peso=0.7,  # modulador, peso menor
            ))

        return sinais
