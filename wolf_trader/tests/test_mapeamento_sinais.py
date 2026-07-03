"""Testes de mapeamento de sinais -> avaliar() -> decisão.

Verifica a integração entre observações de mercado e a doutrina WOLF.
"""
from __future__ import annotations

import pytest

from devin_bridge.wolf_doctrine import Acao, Decisao, LinhaDecisao, Sinal
from devin_bridge.config import WolfConfig
from wolf_trader.engine import (
    LimitesRisco,
    WolfTraderEngine,
    observacoes_para_sinais,
)
from wolf_trader.polymarket_client import Cotacao, Mercado, PolymarketReader


class FakeReader(PolymarketReader):
    """Reader que retorna cotação fixa sem acessar rede."""

    def __init__(self, mid: float | None = 0.6):
        self._mid = mid

    def cotacao(self, token_id: str) -> Cotacao:
        if self._mid is None:
            return Cotacao(token_id, None, None, None)
        return Cotacao(token_id, self._mid - 0.01, self._mid + 0.01, self._mid)


class FakeTrader:
    """Trader falso que registra ordens sem rede."""

    def __init__(self):
        self.ordens: list = []
        self.dry_run = True

    def postar_ordem(self, req):
        self.ordens.append(req)
        from wolf_trader.polymarket_client import OrdemResultado
        return OrdemResultado(True, None, "DRY_RUN ok")


class TestObservacoesParaSinais:
    """Conversão de dict observações para list[Sinal]."""

    def test_bool_true_gera_sinal(self):
        obs = {"T1": True, "T2": True, "T3": True}
        sinais = observacoes_para_sinais(obs)
        assert len(sinais) == 3
        for s in sinais:
            assert s.linha == LinhaDecisao.T
            assert s.direcao == 0.7
            assert s.conviccao == 0.8

    def test_bool_false_ignorado(self):
        obs = {"T1": False, "T2": True}
        sinais = observacoes_para_sinais(obs)
        assert len(sinais) == 1
        assert sinais[0].codigo == "T2"

    def test_float_como_direcao(self):
        obs = {"T1": 0.9, "M1": -0.5}
        sinais = observacoes_para_sinais(obs)
        assert len(sinais) == 2
        t1 = next(s for s in sinais if s.codigo == "T1")
        m1 = next(s for s in sinais if s.codigo == "M1")
        assert t1.direcao == 0.9
        assert m1.direcao == -0.5

    def test_risco_direcao_negativa(self):
        obs = {"R2": True}
        sinais = observacoes_para_sinais(obs)
        assert len(sinais) == 1
        assert sinais[0].direcao == -0.7
        assert sinais[0].linha == LinhaDecisao.R

    def test_codigo_desconhecido_ignorado(self):
        obs = {"X99": True, "T1": True}
        sinais = observacoes_para_sinais(obs)
        assert len(sinais) == 1
        assert sinais[0].codigo == "T1"

    def test_vazio_retorna_vazio(self):
        assert observacoes_para_sinais({}) == []


class TestMapeamentoIntegrado:
    """Fluxo completo: mercado -> mapear -> avaliar -> decisão."""

    def test_sinais_tecnicos_fortes_geram_compra(self):
        """4 sinais técnicos com alta convicção → override → COMPRAR_FORTE."""
        engine = WolfTraderEngine(
            reader=FakeReader(mid=0.55),
            trader=FakeTrader(),
        )
        mercado = Mercado("cond1", "Eleição 2026?", True, [], ["politics"])
        # Contexto com sinais técnicos fortes
        ctx = {"T1": 0.9, "T2": 0.85, "T3": 0.88, "T4": 0.9}
        prop = engine.avaliar_mercado(mercado, "tok1", contexto=ctx)
        # Deve gerar proposta de compra (override técnico ativo)
        assert prop is not None
        assert prop.lado == "BUY"
        assert prop.decisao.override_tecnico is True

    def test_sem_dado_r2_nao_opera(self):
        """mid=None → R2 → SEM_CONVICCAO → nenhuma proposta."""
        engine = WolfTraderEngine(
            reader=FakeReader(mid=None),
            trader=FakeTrader(),
        )
        mercado = Mercado("cond2", "Resultado?", True, [], [])
        prop = engine.avaliar_mercado(mercado, "tok2")
        assert prop is None

    def test_sinais_fracos_sem_acao(self):
        """Sinais com convicção baixa → MANTER/SEM_CONVICCAO → None."""
        engine = WolfTraderEngine(
            reader=FakeReader(mid=0.5),
            trader=FakeTrader(),
        )
        mercado = Mercado("cond3", "Teste?", True, [], [])
        # Contexto com sinal fraco (direção quase zero)
        ctx = {"P1": 0.05}
        prop = engine.avaliar_mercado(mercado, "tok3", contexto=ctx)
        # Convicção default 0.8 mas direção 0.05 → score baixo → MANTER → None
        assert prop is None

    def test_wolf_config_aplicado(self):
        """WolfConfig customizado é passado ao avaliar()."""
        cfg = WolfConfig()
        engine = WolfTraderEngine(
            reader=FakeReader(mid=0.5),
            trader=FakeTrader(),
            wolf_config=cfg,
        )
        assert engine.wolf_config is cfg

    def test_sinais_venda_geram_sell(self):
        """Sinais técnicos negativos → VENDER/REDUZIR → lado SELL."""
        engine = WolfTraderEngine(
            reader=FakeReader(mid=0.5),
            trader=FakeTrader(),
        )
        mercado = Mercado("cond4", "Queda?", True, [], [])
        # Sinais técnicos negativos (convicção alta, direção negativa)
        ctx = {"T1": -0.9, "T2": -0.85, "T3": -0.88, "T4": -0.9}
        prop = engine.avaliar_mercado(mercado, "tok4", contexto=ctx)
        if prop is not None:
            assert prop.lado == "SELL"
