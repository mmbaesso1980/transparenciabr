"""Testes da ponte relógio-lento -> linha P (banca + Comandante com Curie)."""
from __future__ import annotations

import time

from devin_bridge.wolf_doctrine import LinhaDecisao
from wolf_trader.banca_politica import VetorPolitico
from wolf_trader.comando_telegram import SinalComandante
from wolf_trader.doutrina_mestres import ConfigMestres, DoutrinaMestres
from wolf_trader.panorama_sinais import (
    montar_sinais_politicos,
    sinal_da_banca,
    sinal_do_comandante,
)


def _doutrina(meia_vida=45.0):
    return DoutrinaMestres(ConfigMestres(curie_meia_vida_s=meia_vida))


def test_sinal_da_banca_fresco_vira_linha_P():
    agora = time.time()
    v = VetorPolitico(0.5, 0.6, gerado_em=agora, n_manchetes=10, resumo="")
    s = sinal_da_banca(v, doutrina=_doutrina(), agora=agora)
    assert s is not None
    assert s.linha == LinhaDecisao.P
    assert s.codigo == "P-BANCA"
    assert s.direcao == 0.5
    assert s.conviccao > 0.5  # fresco: quase sem decaimento


def test_sinal_da_banca_neutro_retorna_none():
    v = VetorPolitico.neutro("sem dados")
    assert sinal_da_banca(v) is None


def test_sinal_da_banca_none_retorna_none():
    assert sinal_da_banca(None) is None


def test_banca_decai_via_curie():
    d = _doutrina(meia_vida=45.0)
    gerado = 1000.0
    v = VetorPolitico(0.8, 0.6, gerado_em=gerado, n_manchetes=10, resumo="")
    fresco = sinal_da_banca(v, doutrina=d, agora=gerado)
    meia = sinal_da_banca(v, doutrina=d, agora=gerado + 45.0)  # 1 meia-vida
    assert fresco is not None and meia is not None
    assert meia.conviccao < fresco.conviccao
    assert abs(meia.conviccao - fresco.conviccao / 2) < 0.05


def test_banca_muito_velha_some():
    d = _doutrina(meia_vida=45.0)
    v = VetorPolitico(0.8, 0.6, gerado_em=0.0, n_manchetes=10, resumo="")
    # 1 hora depois com meia-vida de 45s -> convicção ~ 0.
    s = sinal_da_banca(v, doutrina=d, agora=3600.0)
    assert s is None


def test_sinal_do_comandante_vira_linha_P_alta():
    agora = time.time()
    sc = SinalComandante("Lula vai subir", direcao=0.9, conviccao=0.85,
                         recebido_em=agora)
    s = sinal_do_comandante(sc, doutrina=_doutrina(), agora=agora)
    assert s is not None
    assert s.linha == LinhaDecisao.P
    assert s.codigo == "P-COMANDANTE"
    assert s.conviccao > 0.8


def test_montar_sinais_combina_banca_e_comandante():
    agora = time.time()
    v = VetorPolitico(0.4, 0.5, gerado_em=agora, n_manchetes=8, resumo="")
    sc = SinalComandante("mercado cai", direcao=-0.8, conviccao=0.85,
                         recebido_em=agora)
    sinais = montar_sinais_politicos(v, [sc], doutrina=_doutrina(), agora=agora)
    codigos = {s.codigo for s in sinais}
    assert codigos == {"P-BANCA", "P-COMANDANTE"}
    assert all(s.linha == LinhaDecisao.P for s in sinais)


def test_montar_sinais_sem_nada():
    assert montar_sinais_politicos(None, []) == []


def test_comandante_e_membro_nao_override():
    """Sinal do Comandante é linha P (somável), nunca linha R/override."""
    agora = time.time()
    sc = SinalComandante("subir", direcao=1.0, conviccao=0.95, recebido_em=agora)
    s = sinal_do_comandante(sc, doutrina=_doutrina(), agora=agora)
    assert s.linha == LinhaDecisao.P
    assert s.conviccao < 1.0  # sujeito a Curie/override, nunca absoluto
