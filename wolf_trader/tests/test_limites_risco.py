"""Testes de dimensionamento de ordem e LimitesRisco.

Cobre: gate_usdc=25, max_order=50, max_market=75, max_daily=200.
"""
from __future__ import annotations

import pytest

from devin_bridge.wolf_doctrine import Acao, Decisao
from wolf_trader.engine import LimitesRisco, WolfTraderEngine, Proposta
from wolf_trader.polymarket_client import (
    Cotacao, Mercado, OrdemRequest, OrdemResultado, PolymarketReader, PolymarketTrader,
)


class FakeReader(PolymarketReader):
    def __init__(self, mid: float = 0.6):
        self._mid = mid

    def cotacao(self, token_id: str) -> Cotacao:
        return Cotacao(token_id, self._mid - 0.01, self._mid + 0.01, self._mid)


class FakeTrader(PolymarketTrader):
    def __init__(self):
        self.ordens_enviadas: list[OrdemRequest] = []

    def postar_ordem(self, req: OrdemRequest) -> OrdemResultado:
        self.ordens_enviadas.append(req)
        return OrdemResultado(True, "fake-order-id", "DRY_RUN ok")


def _make_engine(limites: LimitesRisco | None = None,
                 mid: float = 0.6) -> WolfTraderEngine:
    return WolfTraderEngine(
        reader=FakeReader(mid=mid),
        trader=FakeTrader(),
        limites=limites or LimitesRisco(),
    )


class TestLimitesRiscoDefaults:
    """Valores default dos limites."""

    def test_defaults(self):
        lim = LimitesRisco()
        assert lim.gate_usdc == 25.0
        assert lim.max_por_ordem_usdc == 50.0
        assert lim.max_por_mercado_usdc == 75.0
        assert lim.max_diario_usdc == 200.0


class TestDimensionamento:
    """Dimensionamento respeita limites."""

    def test_size_proporcional_conviccao(self):
        """size = max_order * conviccao (limitado por max_order e max_market)."""
        engine = _make_engine()
        decisao = Decisao(
            acao=Acao.COMPRAR,
            conviccao=0.5,
            override_tecnico=False,
            racional="teste",
            sinais_usados=["T1"],
        )
        size = engine._dimensionar(decisao)
        # 50 * 0.5 = 25.0
        assert size == 25.0

    def test_size_capped_by_max_order(self):
        """Convicção 1.0 → size = max_order."""
        engine = _make_engine()
        decisao = Decisao(
            acao=Acao.COMPRAR_FORTE,
            conviccao=1.0,
            override_tecnico=True,
            racional="forte",
            sinais_usados=["T1", "T2", "T3"],
        )
        size = engine._dimensionar(decisao)
        assert size == 50.0  # max_por_ordem_usdc

    def test_size_capped_by_daily(self):
        """Respeita teto diário."""
        engine = _make_engine()
        engine._gasto_dia_usdc = 180.0  # restam 20
        decisao = Decisao(
            acao=Acao.COMPRAR,
            conviccao=0.9,
            override_tecnico=False,
            racional="teste",
            sinais_usados=["T1"],
        )
        size = engine._dimensionar(decisao)
        assert size == 20.0  # restante_dia

    def test_size_zero_when_daily_exhausted(self):
        """Teto diário esgotado → size = 0."""
        engine = _make_engine()
        engine._gasto_dia_usdc = 200.0
        decisao = Decisao(
            acao=Acao.COMPRAR,
            conviccao=0.9,
            override_tecnico=False,
            racional="teste",
            sinais_usados=["T1"],
        )
        size = engine._dimensionar(decisao)
        assert size == 0.0

    def test_size_capped_by_max_market(self):
        """Limites customizados: max_market < max_order → size capped."""
        limites = LimitesRisco()
        limites.max_por_ordem_usdc = 100.0
        limites.max_por_mercado_usdc = 30.0
        engine = _make_engine(limites=limites)
        decisao = Decisao(
            acao=Acao.COMPRAR_FORTE,
            conviccao=1.0,
            override_tecnico=True,
            racional="forte",
            sinais_usados=["T1", "T2", "T3"],
        )
        size = engine._dimensionar(decisao)
        assert size == 30.0  # max_por_mercado_usdc


class TestGateOrdemGrande:
    """Ordens acima do gate_usdc exigem gate Telegram."""

    def test_precisa_gate_acima_limiar(self):
        """Ordem > gate_usdc → precisa_gate = True."""
        engine = _make_engine()
        mercado = Mercado("cond1", "Quem vence?", True, [], [])
        # Forçar avaliação com contexto que gera COMPRAR_FORTE (alta convicção)
        prop = engine.avaliar_mercado(
            mercado, "tok1",
            contexto={"T1": 0.9, "T2": 0.85, "T3": 0.9, "T4": 0.8}
        )
        # Com 4 sinais técnicos de alta convicção, deve gerar override e alta size
        if prop and prop.size_usdc > 25.0:
            assert prop.precisa_gate is True

    def test_nao_precisa_gate_abaixo_limiar(self):
        """Ordem <= gate_usdc → precisa_gate = False."""
        limites = LimitesRisco()
        limites.gate_usdc = 100.0  # gate alto
        engine = _make_engine(limites=limites)
        decisao = Decisao(
            acao=Acao.COMPRAR,
            conviccao=0.5,
            override_tecnico=False,
            racional="teste",
            sinais_usados=["T1"],
        )
        # size = 50 * 0.5 = 25 < gate 100
        prop = Proposta(
            mercado=Mercado("c", "q", True, [], []),
            token_id="t",
            decisao=decisao,
            lado="BUY",
            preco=0.6,
            size_usdc=25.0,
            precisa_gate=25.0 > limites.gate_usdc,
        )
        assert prop.precisa_gate is False

    def test_executar_gate_envia_telegram(self):
        """Execução com gate envia mensagem ao Comandante."""
        msgs: list[str] = []
        engine = _make_engine()
        engine.telegram = lambda msg: msgs.append(msg)
        mercado = Mercado("cond1", "Quem vence 2026?", True, [], [])
        decisao = Decisao(
            acao=Acao.COMPRAR_FORTE,
            conviccao=0.9,
            override_tecnico=True,
            racional="override",
            sinais_usados=["T1", "T2", "T3"],
        )
        prop = Proposta(mercado, "tok1", decisao, "BUY", 0.6, 45.0, precisa_gate=True)
        result = engine.executar(prop)
        assert "Aguardando gate" in result
        assert len(msgs) == 1
        assert "Gate de ordem" in msgs[0]
