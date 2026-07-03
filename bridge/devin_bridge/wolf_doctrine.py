"""Doutrina WOLF — Motor de Decisão Econômica Determinístico.

Protocolo WOLF v2 (recalibração):
- A análise técnica de mercado sobrepõe notícias e macro via OVERRIDE TÉCNICO.
- Neutralidade de lado: meta = ganho máximo, opera qualquer candidato/lado.
- R2 (sem dado → sem convicção) e R1 (limite de exposição) NÃO sofrem override.
- Gate humano na execução SEMPRE. WOLF é ANALISTA, jamais executor.

Referência: Buffett/Berkshire, BlackRock, Bridgewater, Vanguard, JPMorgan AM,
Goldman AM, PIMCO, Fidelity, State Street, Amundi.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from .config import WolfConfig


class LinhaDecisao(str, Enum):
    """Linhas de decisão WOLF."""

    F = "FUNDAMENTO"
    M = "MACRO"
    T = "TECNICA"
    P = "POLITICA"
    J = "JURIDICA"
    R = "RISCO"


class Acao(str, Enum):
    """Ações possíveis da decisão WOLF."""

    COMPRAR_FORTE = "COMPRAR_FORTE"
    COMPRAR = "COMPRAR"
    MANTER = "MANTER"
    REDUZIR = "REDUZIR"
    VENDER = "VENDER"
    SEM_CONVICCAO = "SEM_CONVICCAO"


@dataclass
class Sinal:
    """Um sinal de entrada para o motor WOLF."""

    linha: LinhaDecisao
    codigo: str
    direcao: float  # -1.0 (bearish) a +1.0 (bullish)
    conviccao: float  # 0.0 a 1.0
    peso: float = 1.0


@dataclass
class Decisao:
    """Resultado da avaliação WOLF."""

    acao: Acao
    conviccao: float
    override_tecnico: bool
    racional: str
    sinais_usados: list[str]


WOLF_SYSTEM = """Você é WOLF — módulo de decisão econômica do sistema AURORA/TransparênciaBR.

REGRAS INVIOLÁVEIS:
R1. Limite de exposição: jamais recomendar alocação > 5% do patrimônio em posição única.
R2. Sem dado verificável = SEM_CONVICCAO. Nunca invente.
R3. Gate humano obrigatório na execução. Você é ANALISTA, não executor.
R4. CPF nunca em texto claro.
R5. Tom formal, informativo, nunca acusatório.
R6. Neutralidade de lado — meta é ganho máximo do Comandante.

OVERRIDE TÉCNICO: quando sinais técnicos agregados têm convicção >= limiar e massa
>= mínima, a técnica domina; político/macro são rebaixados; fundamento vira modulador.
"""


def avaliar(sinais: list[Sinal], config: WolfConfig | None = None) -> Decisao:
    """Motor determinístico de decisão WOLF.

    Args:
        sinais: Lista de sinais de entrada.
        config: Limiares calibráveis (defaults via env).

    Returns:
        Decisao com ação, convicção, override flag e racional.
    """
    cfg = config or WolfConfig()

    if not sinais:
        return Decisao(
            acao=Acao.SEM_CONVICCAO,
            conviccao=0.0,
            override_tecnico=False,
            racional="Nenhum sinal fornecido. R2: sem dado → sem convicção.",
            sinais_usados=[],
        )

    # Separar sinais por linha
    tecnicos = [s for s in sinais if s.linha == LinhaDecisao.T]
    risco = [s for s in sinais if s.linha == LinhaDecisao.R]
    outros = [s for s in sinais if s.linha not in (LinhaDecisao.T, LinhaDecisao.R)]

    # R2: Risco domina — se qualquer sinal de risco tem convicção alta e direção negativa
    for r in risco:
        if r.conviccao >= 0.8 and r.direcao < -0.5:
            return Decisao(
                acao=Acao.SEM_CONVICCAO,
                conviccao=r.conviccao,
                override_tecnico=False,
                racional=(
                    f"R2 dominante: sinal de risco '{r.codigo}' com convicção "
                    f"{r.conviccao:.0%} e direção negativa. Sem convicção para operar."
                ),
                sinais_usados=[r.codigo],
            )

    # Avaliar override técnico
    override_tecnico = False
    if len(tecnicos) >= cfg.override_massa_minima:
        media_conviccao_tec = sum(t.conviccao for t in tecnicos) / len(tecnicos)
        if media_conviccao_tec >= cfg.override_tecnico_limiar:
            override_tecnico = True

    # Calcular score agregado
    if override_tecnico:
        # Técnica domina; fundamento é modulador com fator reduzido
        fundamentos = [s for s in outros if s.linha == LinhaDecisao.F]
        score_tec = sum(
            t.direcao * t.conviccao * t.peso for t in tecnicos
        ) / len(tecnicos)
        score_fund = 0.0
        if fundamentos:
            score_fund = (
                sum(f.direcao * f.conviccao * f.peso for f in fundamentos)
                / len(fundamentos)
                * cfg.fator_fundamento_sob_override
            )
        score_total = score_tec + score_fund
        conviccao_final = sum(t.conviccao for t in tecnicos) / len(tecnicos)
        sinais_usados = [t.codigo for t in tecnicos] + [f.codigo for f in fundamentos]
        racional_extra = (
            "OVERRIDE TÉCNICO ativo: técnica domina, "
            "político/macro rebaixados, fundamento como modulador."
        )
    else:
        # Ponderação normal de todos os sinais (exceto risco já tratado)
        todos = tecnicos + outros
        if not todos:
            return Decisao(
                acao=Acao.SEM_CONVICCAO,
                conviccao=0.0,
                override_tecnico=False,
                racional="Apenas sinais de risco presentes sem trigger. Sem ação.",
                sinais_usados=[r.codigo for r in risco],
            )
        score_total = sum(
            s.direcao * s.conviccao * s.peso for s in todos
        ) / len(todos)
        conviccao_final = sum(s.conviccao for s in todos) / len(todos)
        sinais_usados = [s.codigo for s in todos]
        racional_extra = "Ponderação normal de todos os sinais."

    # Mapear score para ação
    acao = _score_to_acao(score_total, conviccao_final)

    return Decisao(
        acao=acao,
        conviccao=conviccao_final,
        override_tecnico=override_tecnico,
        racional=racional_extra,
        sinais_usados=sinais_usados,
    )


def _score_to_acao(score: float, conviccao: float) -> Acao:
    """Mapeia score e convicção para ação."""
    if conviccao < 0.3:
        return Acao.SEM_CONVICCAO
    if score >= 0.6:
        return Acao.COMPRAR_FORTE
    if score >= 0.2:
        return Acao.COMPRAR
    if score <= -0.6:
        return Acao.VENDER
    if score <= -0.2:
        return Acao.REDUZIR
    return Acao.MANTER
