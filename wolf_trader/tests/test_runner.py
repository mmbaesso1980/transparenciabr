"""Testes do runner de produção do WOLF-Trader.

Cobre:
  - Leitura de configuração de ambiente (DRY_RUN, kill-switch, intervalos, freios).
  - Extração de token_ids de mercados em formatos variados.
  - Um ciclo do loop não envia ordem real em DRY_RUN e não derruba o processo
    em caso de erro pontual.
  - Kill-switch WOLF_ENABLED suspende a operação.

Nenhum teste acessa rede, chave privada ou Secret Manager.
"""
from __future__ import annotations

import os
from unittest import mock

import pytest

from wolf_trader import runner as runner_mod
from wolf_trader.runner import RunnerConfig, Runner
from wolf_trader.engine import WolfTraderEngine, LimitesRisco
from wolf_trader.polymarket_client import Mercado, Cotacao
from devin_bridge.wolf_doctrine import Acao, Decisao


# ---------------------------------------------------------------------------
# RunnerConfig — parsing de ambiente
# ---------------------------------------------------------------------------
class TestRunnerConfig:
    def test_defaults_seguros(self, monkeypatch):
        # Sem env: DRY_RUN deve ser True (seguro) e enabled True.
        for k in ("DRY_RUN", "WOLF_ENABLED", "WOLF_LOOP_INTERVAL_S",
                  "WOLF_SIGNATURE_TYPE", "WOLF_MARKETS_PER_CYCLE"):
            monkeypatch.delenv(k, raising=False)
        cfg = RunnerConfig()
        assert cfg.dry_run is True
        assert cfg.enabled is True
        assert cfg.intervalo_s == 15
        assert cfg.signature_type == 1

    def test_dry_run_false_explicito(self, monkeypatch):
        monkeypatch.setenv("DRY_RUN", "false")
        assert RunnerConfig().dry_run is False

    def test_kill_switch(self, monkeypatch):
        monkeypatch.setenv("WOLF_ENABLED", "false")
        assert RunnerConfig().enabled is False

    def test_intervalo_customizado(self, monkeypatch):
        monkeypatch.setenv("WOLF_LOOP_INTERVAL_S", "60")
        assert RunnerConfig().intervalo_s == 60

    def test_intervalo_invalido_cai_no_default(self, monkeypatch):
        monkeypatch.setenv("WOLF_LOOP_INTERVAL_S", "abc")
        assert RunnerConfig().intervalo_s == 15


# ---------------------------------------------------------------------------
# Extração de tokens
# ---------------------------------------------------------------------------
class TestTokens:
    def _runner(self):
        cfg = RunnerConfig()
        engine = WolfTraderEngine(reader=mock.MagicMock(), trader=mock.MagicMock(),
                                  limites=LimitesRisco())
        return Runner(cfg, engine)

    def test_tokens_dict_token_id(self):
        r = self._runner()
        m = Mercado("cid", "pergunta?", True,
                    [{"token_id": "tok1"}, {"token_id": "tok2"}], [])
        assert r._tokens_do_mercado(m) == ["tok1", "tok2"]

    def test_tokens_string(self):
        r = self._runner()
        m = Mercado("cid", "pergunta?", True, ["tokA", "tokB"], [])
        assert r._tokens_do_mercado(m) == ["tokA", "tokB"]

    def test_tokens_vazio(self):
        r = self._runner()
        m = Mercado("cid", "pergunta?", True, [], [])
        assert r._tokens_do_mercado(m) == []

    def test_tokens_string_json_regressao(self):
        """REGRESSAO do bug de producao: clobTokenIds como STRING JSON.

        Antes o loop iterava caractere-a-caractere sobre a string, gerando
        token_id='[', '\"', '7', etc. e um enxame de 404 no book. Agora deve
        decodificar o JSON e devolver os 2 token_ids reais.
        """
        r = self._runner()
        m = Mercado("cid", "pergunta?", True,
                    '["72123456789", "99876543210"]', [])
        assert r._tokens_do_mercado(m) == ["72123456789", "99876543210"]


# ---------------------------------------------------------------------------
# Ciclo
# ---------------------------------------------------------------------------
class TestCiclo:
    def _engine_fake(self, mercados, prop=None, acao=Acao.COMPRAR):
        reader = mock.MagicMock()
        reader.listar_mercados.return_value = mercados
        # cotacao é chamada pelo runner antes de decidir; devolve book neutro.
        reader.cotacao.return_value = Cotacao("t1", bid=0.49, ask=0.51, mid=0.50)
        engine = WolfTraderEngine(reader=reader, trader=mock.MagicMock(),
                                  limites=LimitesRisco())
        # decidir_mercado agora precede avaliar_mercado: controla se vira ordem.
        decisao = Decisao(acao=acao, conviccao=0.7, override_tecnico=False,
                          racional="fake", sinais_usados=["T1"])
        engine.decidir_mercado = mock.MagicMock(return_value=(decisao, None))
        engine.avaliar_mercado = mock.MagicMock(return_value=prop)
        engine.executar = mock.MagicMock(return_value="ok simulado")
        return engine

    def test_ciclo_sem_mercados_nao_quebra(self):
        engine = self._engine_fake([])
        r = Runner(RunnerConfig(), engine)
        r._um_ciclo()  # não deve levantar
        engine.avaliar_mercado.assert_not_called()

    def test_ciclo_hold_nao_executa(self):
        # Decisão MANTER (HOLD): reage, mas não vira ordem.
        m = Mercado("cid", "p?", True, [{"token_id": "t1"}], [])
        engine = self._engine_fake([m], prop=None, acao=Acao.MANTER)
        r = Runner(RunnerConfig(), engine)
        r._um_ciclo()
        engine.decidir_mercado.assert_called_once()
        engine.avaliar_mercado.assert_not_called()
        engine.executar.assert_not_called()

    def test_ciclo_sem_proposta_nao_executa(self):
        # Decisão COMPRAR, mas avaliar_mercado devolve None (cortado por freio).
        m = Mercado("cid", "p?", True, [{"token_id": "t1"}], [])
        engine = self._engine_fake([m], prop=None, acao=Acao.COMPRAR)
        r = Runner(RunnerConfig(), engine)
        r._um_ciclo()
        engine.avaliar_mercado.assert_called_once()
        engine.executar.assert_not_called()

    def test_ciclo_com_proposta_executa(self):
        m = Mercado("cid", "p?", True, [{"token_id": "t1"}], [])
        engine = self._engine_fake([m], prop=object(), acao=Acao.COMPRAR)
        r = Runner(RunnerConfig(), engine)
        r._um_ciclo()
        engine.executar.assert_called_once()


# ---------------------------------------------------------------------------
# Kill-switch no run()
# ---------------------------------------------------------------------------
class TestKillSwitch:
    def test_run_respeita_kill_switch_e_para(self, monkeypatch):
        monkeypatch.setenv("WOLF_ENABLED", "false")
        cfg = RunnerConfig()
        cfg.intervalo_s = 0  # não dormir de verdade
        engine = WolfTraderEngine(reader=mock.MagicMock(), trader=mock.MagicMock(),
                                  limites=LimitesRisco())
        engine.reader.listar_mercados = mock.MagicMock()
        r = Runner(cfg, engine)

        # Para o loop após a primeira iteração via time.sleep.
        chamadas = {"n": 0}

        def fake_sleep(_s):
            chamadas["n"] += 1
            if chamadas["n"] >= 1:
                r.solicitar_parada()

        monkeypatch.setattr(runner_mod.time, "sleep", fake_sleep)
        r.run()
        # Kill-switch ativo: nunca deve ter listado mercados.
        engine.reader.listar_mercados.assert_not_called()
