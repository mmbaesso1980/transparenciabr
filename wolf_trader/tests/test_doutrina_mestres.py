"""Testes da Doutrina dos Mestres (Einstein/Wolf/Hawking/Curie).

Verifica que cada modulação matemática se comporta como o contrato promete e
que a composição respeita o teto. Determinístico, sem I/O.
"""
import math

from wolf_trader.doutrina_mestres import ConfigMestres, DoutrinaMestres


def _dm(**kw):
    cfg = ConfigMestres(
        agressividade=kw.get("agressividade", 1.0),
        wolf_ganho=kw.get("wolf_ganho", 0.6),
        curie_meia_vida_s=kw.get("curie_meia_vida_s", 45.0),
        hawking_k=kw.get("hawking_k", 3.0),
        einstein_expoente=kw.get("einstein_expoente", 1.4),
        musk_boost=kw.get("musk_boost", 0.8),
        musk_expoente=kw.get("musk_expoente", 2.0),
        teto=kw.get("teto", 0.92),
    )
    return DoutrinaMestres(cfg)


def test_einstein_nao_linear_premia_conviccao_forte():
    dm = _dm(einstein_expoente=2.0)
    # 0.9^2=0.81 (queda pequena); 0.3^2=0.09 (queda grande) -> não-linear.
    assert dm.einstein(0.9) > dm.einstein(0.3) * 2
    assert dm.einstein(1.0) == 1.0
    assert dm.einstein(0.0) == 0.0


def test_wolf_amplifica_com_momentum():
    dm = _dm(wolf_ganho=0.6)
    base = dm.wolf(0.5, momentum_abs=0.0)
    forte = dm.wolf(0.5, momentum_abs=1.0)
    assert base == 0.5                       # sem momentum, não amplifica
    assert forte == 0.5 * 1.6                # momentum máximo => +60%
    assert forte > base


def test_hawking_evapora_com_entropia():
    dm = _dm(hawking_k=3.0)
    limpo = dm.hawking(0.8, entropia=0.0)
    ruido = dm.hawking(0.8, entropia=1.0)
    assert limpo == 0.8                      # book limpo não corta
    assert ruido < limpo                     # ruído evapora convicção
    assert math.isclose(ruido, 0.8 * math.exp(-3.0), rel_tol=1e-6)


def test_curie_decai_com_idade():
    dm = _dm(curie_meia_vida_s=45.0)
    fresco = dm.curie(0.8, idade_s=0.0)
    uma_meia_vida = dm.curie(0.8, idade_s=45.0)
    assert fresco == 0.8
    assert math.isclose(uma_meia_vida, 0.4, rel_tol=1e-6)  # metade após meia-vida


def test_modular_respeita_teto():
    dm = _dm(agressividade=5.0, teto=0.92)
    # Mesmo com agressividade absurda, nunca ultrapassa o teto.
    c = dm.modular(0.99, momentum_abs=1.0, entropia=0.0, idade_s=0.0)
    assert c <= 0.92


def test_modular_zera_com_dado_ruidoso_e_velho():
    dm = _dm(hawking_k=3.0, curie_meia_vida_s=10.0)
    # Ruído alto + dado muito velho => convicção quase nula.
    c = dm.modular(0.8, momentum_abs=0.0, entropia=1.0, idade_s=100.0)
    assert c < 0.05


def test_musk_acelera_conviccao_alta_mais_que_media():
    dm = _dm(musk_boost=0.8, musk_expoente=2.0)
    # Ganho relativo em convicção alta > ganho relativo em convicção média.
    ganho_alto = dm.musk(0.9) / 0.9
    ganho_medio = dm.musk(0.4) / 0.4
    assert ganho_alto > ganho_medio
    assert dm.musk(0.0) == 0.0                # nada a acelerar
    # conv 1.0 => fator 1 + 0.8*1 = 1.8
    assert math.isclose(dm.musk(1.0), 1.8, rel_tol=1e-6)


def test_musk_boost_zero_e_neutro():
    dm = _dm(musk_boost=0.0)
    assert dm.musk(0.7) == 0.7                # sem boost, passthrough


def test_agressividade_aumenta_conviccao():
    conv, mom, ent, idade = 0.5, 0.5, 0.1, 0.0
    baixa = _dm(agressividade=1.0).modular(
        conv, momentum_abs=mom, entropia=ent, idade_s=idade)
    alta = _dm(agressividade=2.0).modular(
        conv, momentum_abs=mom, entropia=ent, idade_s=idade)
    assert alta > baixa
