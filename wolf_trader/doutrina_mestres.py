"""Doutrina dos Mestres — modulação quantitativa da agressividade WOLF.

Comandante Baesso pediu que quatro mentes orientem a "agressividade quântica"
das tendências. Aqui elas NÃO são citações decorativas: cada uma é uma função
matemática real que modula a convicção e o tamanho de cada sinal técnico. A voz
é temática; a matemática é honesta e verificável.

  WOLF     — Momentum & assimetria. O predador ataca o desequilíbrio do book:
             quanto mais forte o fluxo direcional, maior o multiplicador. Amplifica
             a convicção de tendências já em curso (fator >= 1).

  CURIE    — Decaimento radioativo. Convicção tem meia-vida: dado fresco pesa
             cheio; a cada ciclo sem atualização a convicção decai como
             c * 0.5**(dt/meia_vida). Sinal velho é sinal fraco.

  HAWKING  — Entropia / radiação de fronteira. Incerteza (spread largo, book
             raso) "evapora" convicção na fronteira: fator = exp(-k * entropia).
             Mais ruído => menos convicção. É o contrapeso que impede o robô de
             atacar fumaça.

  EINSTEIN — Relatividade & não-linearidade. Tudo é medido contra o referencial
             0.5. A "energia" da convicção escala com o QUADRADO do desvio
             (E ∝ desvio²), premiando convicção forte de forma não-linear —
             convicção alta fica ainda mais alta; ruído no meio do book é
             desprezado (curva suave perto de 0.5).

  MUSK     — Apetite convexo / risk-on de primeiros princípios. O acelerador:
             fator = 1 + boost * convicção**p. Convicção mediana quase não muda;
             convicção ALTA dispara o tamanho de forma desproporcional (aposta
             assimétrica estilo Kelly turbinado). É o contrapeso PROPOSITAL de
             Hawking/Curie — Musk empurra o foguete, eles são os airbags.

Composição (ordem importa): a convicção bruta de um sinal técnico passa por
Einstein (não-linearidade) -> Musk (aceleração convexa) -> Wolf (momentum) ->
Hawking (entropia) -> Curie (decaimento), todas moduladas por um DIAL global de
agressividade (WOLF_AGRESSIVIDADE, padrão 1.0; >1 mais agressivo). O resultado é
clampado em [0, teto]. NENHUM mestre remove os freios de risco — gate de US$1000,
limites diários e DRY_RUN continuam intactos na engine.
"""
from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field
from typing import Optional


def _envf(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class ConfigMestres:
    """Constantes calibráveis da doutrina (via env)."""
    # Dial global de agressividade. 1.0 = neutro; 2.0 = dobra o apetite.
    # Padrão 2.2 (modo agressivo máximo pedido pelo Comandante): viés claro no
    # book sempre cruza o limiar de ação da doutrina (0.3).
    agressividade: float = field(
        default_factory=lambda: _envf("WOLF_AGRESSIVIDADE", 2.2))
    # WOLF: ganho de momentum (quanto o fluxo direcional amplifica).
    wolf_ganho: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_WOLF_GANHO", 0.6))
    # CURIE: meia-vida da convicção, em segundos (dado mais velho decai).
    curie_meia_vida_s: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_CURIE_MEIA_VIDA_S", 45.0))
    # HAWKING: constante de evaporação por entropia (spread relativo).
    # Reduzido para 1.2: spread de 1-2 centavos é NORMAL no Polymarket e não deve
    # evaporar a convicção — só books realmente ruidosos sofrem corte forte.
    hawking_k: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_HAWKING_K", 1.2))
    # EINSTEIN: expoente da não-linearidade (2.0 = quadrático). Entre 1 e 2:
    # mistura linear/quadrático para não matar sinais fracos no modo agressivo.
    einstein_expoente: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_EINSTEIN_EXP", 1.4))
    # MUSK: ganho do acelerador convexo (quanto convicção alta dispara o tamanho).
    musk_boost: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_MUSK_BOOST", 0.8))
    # MUSK: expoente da convexidade (>1 concentra o efeito na convicção alta).
    musk_expoente: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_MUSK_EXP", 2.0))
    # Teto de convicção após modulação (humildade estatística; nunca 1.0).
    teto: float = field(
        default_factory=lambda: _envf("WOLF_MESTRE_TETO", 0.92))


class DoutrinaMestres:
    """Aplica as quatro modulações a uma convicção bruta de sinal técnico."""

    def __init__(self, config: Optional[ConfigMestres] = None) -> None:
        self.cfg = config or ConfigMestres()

    # -- EINSTEIN: não-linearidade relativística (desvio ao quadrado-ish) ----
    def einstein(self, conviccao: float) -> float:
        """Premia convicção forte de forma não-linear. conv em [0,1]."""
        c = _clamp(conviccao, 0.0, 1.0)
        return c ** self.cfg.einstein_expoente

    # -- MUSK: apetite convexo (acelera convicção alta) ----------------------
    def musk(self, conviccao: float) -> float:
        """fator = 1 + boost * conv**p. Convicção alta => tamanho desproporcional.

        Convicção baixa/média é quase intocada (conv**p ~ 0); convicção perto de
        1 recebe o empurrão cheio. É o acelerador de risco pedido pelo Comandante.
        """
        c = _clamp(conviccao, 0.0, 1.0)
        fator = 1.0 + self.cfg.musk_boost * (c ** self.cfg.musk_expoente)
        return conviccao * fator

    # -- WOLF: momentum amplifica tendência em curso -------------------------
    def wolf(self, conviccao: float, momentum_abs: float) -> float:
        """momentum_abs em [0,1] (magnitude do movimento recente do mid).

        Multiplicador >= 1: quanto mais forte o momentum, mais o predador
        aumenta a aposta na direção já vencedora.
        """
        fator = 1.0 + self.cfg.wolf_ganho * _clamp(momentum_abs, 0.0, 1.0)
        return conviccao * fator

    # -- HAWKING: entropia evapora convicção ---------------------------------
    def hawking(self, conviccao: float, entropia: float) -> float:
        """entropia em [0,1] (0 = book limpo/apertado; 1 = ruído/spread largo).

        fator = exp(-k * entropia): incerteza corta convicção exponencialmente.
        """
        fator = math.exp(-self.cfg.hawking_k * _clamp(entropia, 0.0, 1.0))
        return conviccao * fator

    # -- CURIE: decaimento radioativo pela idade do dado ---------------------
    def curie(self, conviccao: float, idade_s: float) -> float:
        """Convicção decai com meia-vida: c * 0.5 ** (idade / meia_vida)."""
        mv = max(1e-6, self.cfg.curie_meia_vida_s)
        fator = 0.5 ** (max(0.0, idade_s) / mv)
        return conviccao * fator

    # -- Composição completa --------------------------------------------------
    def modular(self, conviccao_bruta: float, *,
                momentum_abs: float = 0.0,
                entropia: float = 0.0,
                idade_s: float = 0.0) -> float:
        """Aplica Einstein -> Wolf -> Hawking -> Curie + dial de agressividade.

        Retorna convicção final em [0, teto]. Determinística e sem efeito
        colateral (não faz I/O, não chama rede).
        """
        c = self.einstein(conviccao_bruta)
        c = self.musk(c)                      # acelerador convexo (risk-on)
        c = self.wolf(c, momentum_abs)
        c = c * self.cfg.agressividade
        c = self.hawking(c, entropia)
        c = self.curie(c, idade_s)
        return _clamp(c, 0.0, self.cfg.teto)


def agora_s() -> float:
    """Relógio monotônico para medir idade de dado (Curie). Isolável em teste."""
    return time.monotonic()
