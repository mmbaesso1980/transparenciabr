"""Ponte entre o relógio lento (banca 6h + input Telegram) e o relógio rápido
(ciclo 15s da doutrina WOLF).

A arquitetura de dois relógios do Comandante:

  - RELÓGIO RÁPIDO (15s): book -> sinais técnicos -> Doutrina dos Mestres -> decide.
  - RELÓGIO LENTO (6h):   banca política + inputs do Comandante -> vetor P em cache.

Este módulo converte o panorama do relógio lento em sinais da linha P (POLÍTICA)
para serem SOMADOS aos sinais técnicos em cada ciclo rápido. A convicção do vetor
político DECAI com a idade via CURIE (mesma matemática dos mestres): fresco pesa
cheio, velho pesa pouco — sem nunca zerar a doutrina técnica, que ainda pode
rebaixar o político via OVERRIDE TÉCNICO.
"""
from __future__ import annotations

import logging
from typing import Optional

from devin_bridge.wolf_doctrine import LinhaDecisao, Sinal

from wolf_trader.banca_politica import VetorPolitico
from wolf_trader.comando_telegram import SinalComandante
from wolf_trader.doutrina_mestres import DoutrinaMestres

logger = logging.getLogger("wolf_trader.panorama_sinais")


def sinal_da_banca(
    vetor: Optional[VetorPolitico],
    *,
    doutrina: Optional[DoutrinaMestres] = None,
    agora: Optional[float] = None,
    peso: float = 0.7,
) -> Optional[Sinal]:
    """Converte o VetorPolitico da banca em um Sinal linha=P, decaído por Curie.

    Retorna None quando não há vetor útil (neutro / convicção zero) — R2: sem
    dado, sem sinal. `peso < 1` porque o panorama é contexto macro, não leitura
    do book do mercado específico.
    """
    if vetor is None or vetor.conviccao <= 0.0 or vetor.n_manchetes <= 0:
        return None
    doutrina = doutrina or DoutrinaMestres()
    idade = vetor.idade_s(agora)
    conv_decaida = doutrina.curie(vetor.conviccao, idade)
    if conv_decaida <= 0.01:
        # Panorama velho demais — desprezível. R2.
        return None
    return Sinal(
        linha=LinhaDecisao.P,
        codigo="P-BANCA",
        direcao=vetor.direcao,
        conviccao=conv_decaida,
        peso=peso,
    )


def sinal_do_comandante(
    sinal: Optional[SinalComandante],
    *,
    doutrina: Optional[DoutrinaMestres] = None,
    agora: Optional[float] = None,
    peso: float = 1.0,
) -> Optional[Sinal]:
    """Converte um input político do Comandante em Sinal linha=P (alta convicção).

    O Comandante é MEMBRO da banca: peso cheio e convicção alta, mas decaída por
    Curie e ainda sujeita ao OVERRIDE TÉCNICO — nunca desliga os mestres.
    """
    if sinal is None or sinal.conviccao <= 0.0:
        return None
    doutrina = doutrina or DoutrinaMestres()
    idade = sinal.idade_s(agora)
    conv_decaida = doutrina.curie(sinal.conviccao, idade)
    if conv_decaida <= 0.01:
        return None
    return Sinal(
        linha=LinhaDecisao.P,
        codigo="P-COMANDANTE",
        direcao=sinal.direcao,
        conviccao=conv_decaida,
        peso=peso,
    )


def montar_sinais_politicos(
    vetor_banca: Optional[VetorPolitico],
    sinais_comandante: Optional[list[SinalComandante]] = None,
    *,
    doutrina: Optional[DoutrinaMestres] = None,
    agora: Optional[float] = None,
) -> list[Sinal]:
    """Junta banca + inputs do Comandante em sinais da linha P prontos p/ doutrina.

    Inputs do Comandante mais recentes que o meia-vida de Curie ainda pesam; os
    velhos somem sozinhos. Todos entram como linha P, somados aos técnicos no
    ciclo de 15s.
    """
    doutrina = doutrina or DoutrinaMestres()
    saida: list[Sinal] = []
    s_banca = sinal_da_banca(vetor_banca, doutrina=doutrina, agora=agora)
    if s_banca is not None:
        saida.append(s_banca)
    for sc in (sinais_comandante or []):
        s = sinal_do_comandante(sc, doutrina=doutrina, agora=agora)
        if s is not None:
            saida.append(s)
    return saida
