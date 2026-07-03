"""Testes B3: Limiares WOLF calibráveis via variáveis de ambiente."""

import os

import pytest

from devin_bridge.config import WolfConfig
from devin_bridge.wolf_doctrine import Acao, LinhaDecisao, Sinal, avaliar


class TestWolfConfigFromEnv:
    """WolfConfig lê limiares de env vars com defaults corretos."""

    def test_defaults(self):
        """Valores padrão quando env não está setada."""
        config = WolfConfig()
        assert config.override_tecnico_limiar == 0.75
        assert config.override_massa_minima == 3
        assert config.fator_fundamento_sob_override == 0.3

    def test_override_limiar_via_env(self, monkeypatch):
        """WOLF_OVERRIDE_TECNICO_LIMIAR via env."""
        monkeypatch.setenv("WOLF_OVERRIDE_TECNICO_LIMIAR", "0.6")
        config = WolfConfig()
        assert config.override_tecnico_limiar == 0.6

    def test_massa_minima_via_env(self, monkeypatch):
        """WOLF_OVERRIDE_MASSA_MINIMA via env."""
        monkeypatch.setenv("WOLF_OVERRIDE_MASSA_MINIMA", "5")
        config = WolfConfig()
        assert config.override_massa_minima == 5

    def test_fator_fundamento_via_env(self, monkeypatch):
        """WOLF_FATOR_FUNDAMENTO_SOB_OVERRIDE via env."""
        monkeypatch.setenv("WOLF_FATOR_FUNDAMENTO_SOB_OVERRIDE", "0.1")
        config = WolfConfig()
        assert config.fator_fundamento_sob_override == 0.1

    def test_avaliar_respeita_env_config(self, monkeypatch):
        """avaliar() usa WolfConfig com valores de env."""
        monkeypatch.setenv("WOLF_OVERRIDE_TECNICO_LIMIAR", "0.5")
        monkeypatch.setenv("WOLF_OVERRIDE_MASSA_MINIMA", "2")
        config = WolfConfig()
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.8, conviccao=0.55),
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=0.7, conviccao=0.60),
        ]
        decisao = avaliar(sinais, config)
        assert decisao.override_tecnico is True

    def test_compatibilidade_sem_env(self):
        """Funciona identicamente sem nenhuma env setada (100% compat)."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.9, conviccao=0.85),
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=0.8, conviccao=0.90),
            Sinal(linha=LinhaDecisao.T, codigo="T3", direcao=0.7, conviccao=0.80),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is True
        assert decisao.acao in (Acao.COMPRAR_FORTE, Acao.COMPRAR)
