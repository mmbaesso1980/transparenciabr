"""Testes da banca política — coleta pública, 5 analistas, vetor P e cache."""
from __future__ import annotations

import time

import pytest

from wolf_trader.banca_politica import (
    BancaPolitica,
    ConfigBanca,
    Manchete,
    VetorPolitico,
    _parse_rss,
    _sentimento_manchete,
    atualizar_panorama,
    carregar_cache,
    coletar_manchetes,
    salvar_cache,
)

RSS_EXEMPLO = """<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Markets rally as economy shows strong recovery and record growth</title>
        <link>https://example.com/a</link></item>
  <item><title>Senate approves deal, confidence rises across sectors</title>
        <link>https://example.com/b</link></item>
  <item><title>Fed eases policy amid optimism</title><link>https://example.com/c</link></item>
</channel></rss>"""

RSS_NEGATIVO = """<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Crisis deepens as markets crash and recession fears surge</title><link>x</link></item>
  <item><title>Scandal and turmoil: government faces collapse threat</title><link>y</link></item>
  <item><title>Sanctions warning triggers sharp decline and protests</title><link>z</link></item>
</channel></rss>"""


def test_parse_rss_extrai_titulos_e_links():
    manchetes = _parse_rss(RSS_EXEMPLO, "teste")
    assert len(manchetes) == 3
    assert manchetes[0].titulo.startswith("Markets rally")
    assert manchetes[0].link == "https://example.com/a"


def test_parse_rss_xml_invalido_nao_quebra():
    assert _parse_rss("<<< nao e xml", "teste") == []


def test_sentimento_positivo_e_negativo():
    dir_pos, _ = _sentimento_manchete(
        Manchete("f", "strong recovery growth rally gains rise"))
    dir_neg, _ = _sentimento_manchete(
        Manchete("f", "crash crisis collapse decline recession"))
    assert dir_pos > 0
    assert dir_neg < 0


def test_sentimento_manchete_vazia_e_neutra():
    assert _sentimento_manchete(Manchete("f", "")) == (0.0, 0.0)


def _fetch_fake(xml):
    return lambda url, timeout: xml


def test_coletar_manchetes_usa_fetch_injetado():
    fontes = [("f1", "http://x"), ("f2", "http://y")]
    manchetes = coletar_manchetes(fontes=fontes, fetch=_fetch_fake(RSS_EXEMPLO))
    assert len(manchetes) == 6  # 3 por fonte


def test_coletar_manchetes_fonte_com_erro_nao_derruba():
    def fetch_erro(url, timeout):
        raise RuntimeError("rede caiu")
    manchetes = coletar_manchetes(
        fontes=[("f", "http://x")], fetch=fetch_erro)
    assert manchetes == []


def test_banca_direcao_positiva_com_manchetes_boas():
    manchetes = _parse_rss(RSS_EXEMPLO, "teste")
    vetor = BancaPolitica().avaliar(manchetes)
    assert vetor.direcao > 0
    assert 0 < vetor.conviccao <= ConfigBanca().conviccao_max
    assert vetor.n_manchetes == 3
    assert set(vetor.por_analista.keys()) == set(BancaPolitica.ANALISTAS)


def test_banca_direcao_negativa_com_manchetes_ruins():
    manchetes = _parse_rss(RSS_NEGATIVO, "teste")
    vetor = BancaPolitica().avaliar(manchetes)
    assert vetor.direcao < 0
    assert vetor.conviccao > 0


def test_banca_poucas_manchetes_retorna_neutro():
    cfg = ConfigBanca()
    poucas = [Manchete("f", "strong growth")]  # < min_manchetes (3)
    vetor = BancaPolitica(cfg).avaliar(poucas)
    assert vetor.direcao == 0.0
    assert vetor.conviccao == 0.0


def test_banca_conviccao_respeita_teto():
    # 30 manchetes fortemente positivas e coerentes.
    manchetes = [
        Manchete("f", "strong record growth rally gains surge win victory")
        for _ in range(30)
    ]
    vetor = BancaPolitica().avaliar(manchetes)
    assert vetor.conviccao <= ConfigBanca().conviccao_max + 1e-9


def test_vetor_neutro_helper():
    v = VetorPolitico.neutro("teste")
    assert v.direcao == 0.0 and v.conviccao == 0.0 and v.n_manchetes == 0


def test_vetor_idade_cresce():
    v = VetorPolitico(0.5, 0.5, gerado_em=100.0, n_manchetes=5, resumo="")
    assert v.idade_s(agora=160.0) == pytest.approx(60.0)


def test_cache_roundtrip(tmp_path):
    caminho = str(tmp_path / "cache.json")
    v = VetorPolitico(0.42, 0.33, gerado_em=time.time(), n_manchetes=7,
                      resumo="ok", por_analista={"silver": 0.4})
    salvar_cache(v, caminho)
    lido = carregar_cache(caminho)
    assert lido is not None
    assert lido.direcao == pytest.approx(0.42)
    assert lido.n_manchetes == 7
    assert lido.por_analista["silver"] == pytest.approx(0.4)


def test_cache_ausente_retorna_none(tmp_path):
    assert carregar_cache(str(tmp_path / "nao_existe.json")) is None


def test_atualizar_panorama_persiste(tmp_path):
    caminho = str(tmp_path / "cache.json")
    vetor = atualizar_panorama(
        fontes=[("f", "http://x")], fetch=_fetch_fake(RSS_EXEMPLO),
        caminho=caminho)
    assert vetor.n_manchetes == 3
    # Persistiu no caminho indicado.
    lido = carregar_cache(caminho)
    assert lido is not None and lido.n_manchetes == 3


def test_analistas_produzem_votos_distintos():
    """Cada analista tem viés metodológico distinto — votos não são idênticos."""
    banca = BancaPolitica()
    manchetes = _parse_rss(RSS_EXEMPLO, "teste")
    vetor = banca.avaliar(manchetes)
    votos = list(vetor.por_analista.values())
    # Pelo menos dois analistas divergem (cohn encolhe, zogby amplifica, etc.).
    assert len(set(round(v, 3) for v in votos)) >= 2
