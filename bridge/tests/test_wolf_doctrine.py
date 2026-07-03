"""Testes do motor de decisão WOLF — wolf_doctrine.avaliar().

Cenários obrigatórios:
- Override de alta (T1,T4,M2 → COMPRAR_FORTE, override=True)
- Override de baixa vs fundamento (T2,T5,F1 → REDUZIR/VENDER, override=True)
- Sem override (P1,M1)
- Massa técnica insuficiente (T3 isolado, override=False)
- R2 dominando (SEM_CONVICCAO)
- Limiares via WolfConfig (env)
"""

import pytest

from devin_bridge.config import WolfConfig
from devin_bridge.wolf_doctrine import (
    Acao,
    Decisao,
    LinhaDecisao,
    Sinal,
    avaliar,
)


class TestOverrideAlta:
    """Override técnico com sinais bullish fortes."""

    def test_t1_t4_m2_comprar_forte(self):
        """T1+T4+M2 (3 técnicos bullish) → COMPRAR_FORTE com override."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.9, conviccao=0.85),
            Sinal(linha=LinhaDecisao.T, codigo="T4", direcao=0.8, conviccao=0.90),
            Sinal(linha=LinhaDecisao.T, codigo="M2", direcao=0.7, conviccao=0.80),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is True
        assert decisao.acao == Acao.COMPRAR_FORTE
        assert decisao.conviccao >= 0.75
        assert "T1" in decisao.sinais_usados
        assert "T4" in decisao.sinais_usados

    def test_override_com_fundamento_modulador(self):
        """Override com fundamento presente — fundamento modula mas não domina."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.9, conviccao=0.85),
            Sinal(linha=LinhaDecisao.T, codigo="T4", direcao=0.8, conviccao=0.90),
            Sinal(linha=LinhaDecisao.T, codigo="T3", direcao=0.7, conviccao=0.80),
            Sinal(linha=LinhaDecisao.F, codigo="F1", direcao=0.5, conviccao=0.7),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is True
        assert decisao.acao in (Acao.COMPRAR_FORTE, Acao.COMPRAR)
        assert "F1" in decisao.sinais_usados


class TestOverrideBaixa:
    """Override técnico com sinais bearish."""

    def test_t2_t5_f1_reduzir_ou_vender(self):
        """T2+T5+F1 (técnicos bearish) → REDUZIR ou VENDER com override."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=-0.8, conviccao=0.85),
            Sinal(linha=LinhaDecisao.T, codigo="T5", direcao=-0.9, conviccao=0.90),
            Sinal(linha=LinhaDecisao.T, codigo="T6", direcao=-0.7, conviccao=0.80),
            Sinal(linha=LinhaDecisao.F, codigo="F1", direcao=0.3, conviccao=0.5),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is True
        assert decisao.acao in (Acao.REDUZIR, Acao.VENDER)
        assert decisao.conviccao >= 0.75


class TestSemOverride:
    """Cenários sem override técnico — ponderação normal."""

    def test_p1_m1_sem_override(self):
        """Apenas sinais político+macro → sem override, ponderação normal."""
        sinais = [
            Sinal(linha=LinhaDecisao.P, codigo="P1", direcao=0.4, conviccao=0.6),
            Sinal(linha=LinhaDecisao.M, codigo="M1", direcao=0.3, conviccao=0.5),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is False
        assert decisao.acao in (Acao.MANTER, Acao.COMPRAR, Acao.SEM_CONVICCAO)

    def test_massa_tecnica_insuficiente(self):
        """T3 isolado — massa < OVERRIDE_MASSA_MINIMA → sem override."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T3", direcao=0.9, conviccao=0.95),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is False

    def test_conviccao_tecnica_abaixo_limiar(self):
        """3 técnicos mas convicção média abaixo do limiar → sem override."""
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.8, conviccao=0.5),
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=0.7, conviccao=0.4),
            Sinal(linha=LinhaDecisao.T, codigo="T3", direcao=0.6, conviccao=0.6),
        ]
        decisao = avaliar(sinais)
        assert decisao.override_tecnico is False


class TestR2Dominando:
    """R2: sem dado → sem convicção."""

    def test_risco_alto_negativo_sem_conviccao(self):
        """Sinal de risco com convicção alta e direção negativa → SEM_CONVICCAO."""
        sinais = [
            Sinal(linha=LinhaDecisao.R, codigo="R2", direcao=-0.9, conviccao=0.9),
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.8, conviccao=0.85),
        ]
        decisao = avaliar(sinais)
        assert decisao.acao == Acao.SEM_CONVICCAO
        assert "R2" in decisao.sinais_usados

    def test_sem_sinais_sem_conviccao(self):
        """Nenhum sinal → SEM_CONVICCAO (R2 implícito)."""
        decisao = avaliar([])
        assert decisao.acao == Acao.SEM_CONVICCAO
        assert decisao.override_tecnico is False


class TestLimiaresViaConfig:
    """Limiares calibráveis via WolfConfig (env vars)."""

    def test_override_com_limiar_baixo(self):
        """Limiar baixo (0.5) permite override com convicção menor."""
        config = WolfConfig(
            override_tecnico_limiar=0.5,
            override_massa_minima=2,
            fator_fundamento_sob_override=0.3,
        )
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.7, conviccao=0.55),
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=0.6, conviccao=0.60),
        ]
        decisao = avaliar(sinais, config)
        assert decisao.override_tecnico is True

    def test_override_bloqueado_com_limiar_alto(self):
        """Limiar alto (0.95) bloqueia override mesmo com convicção razoável."""
        config = WolfConfig(
            override_tecnico_limiar=0.95,
            override_massa_minima=3,
            fator_fundamento_sob_override=0.3,
        )
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo="T1", direcao=0.9, conviccao=0.85),
            Sinal(linha=LinhaDecisao.T, codigo="T2", direcao=0.8, conviccao=0.90),
            Sinal(linha=LinhaDecisao.T, codigo="T3", direcao=0.7, conviccao=0.80),
        ]
        decisao = avaliar(sinais, config)
        assert decisao.override_tecnico is False

    def test_massa_minima_customizada(self):
        """Massa mínima = 5 requer 5 sinais técnicos para override."""
        config = WolfConfig(
            override_tecnico_limiar=0.75,
            override_massa_minima=5,
            fator_fundamento_sob_override=0.3,
        )
        sinais = [
            Sinal(linha=LinhaDecisao.T, codigo=f"T{i}", direcao=0.8, conviccao=0.85)
            for i in range(4)
        ]
        decisao = avaliar(sinais, config)
        assert decisao.override_tecnico is False

        sinais.append(
            Sinal(linha=LinhaDecisao.T, codigo="T4", direcao=0.8, conviccao=0.85)
        )
        decisao = avaliar(sinais, config)
        assert decisao.override_tecnico is True
