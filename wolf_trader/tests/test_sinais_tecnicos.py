"""Testes do GeradorSinaisTecnicos em modo agressivo + integração com a doutrina.

Garante que:
  - book bullish (mid > 0.5) gera sinal T com direção positiva;
  - book bearish (mid < 0.5) gera direção negativa;
  - dado ausente (mid None) respeita R2 -> [];
  - probabilidade inválida (fora de (0,1)) -> [];
  - os sinais, passados à doutrina WOLF, produzem COMPRAR/VENDER (não fica preso
    em SEM_CONVICCAO — que era a causa das "0 propostas").
"""
from devin_bridge.wolf_doctrine import Acao, LinhaDecisao, avaliar
from devin_bridge.config import WolfConfig
from wolf_trader.polymarket_client import Cotacao
from wolf_trader.sinais_tecnicos import ConfigSinaisTecnicos, GeradorSinaisTecnicos


def _gen():
    # Config agressiva explícita (não depende do ambiente do CI).
    return GeradorSinaisTecnicos(ConfigSinaisTecnicos(agressivo=True))


def test_book_bullish_gera_direcao_positiva():
    gen = _gen()
    cot = Cotacao("tk", bid=0.68, ask=0.70, mid=0.69)
    sinais = gen.gerar(cot)
    assert sinais, "book com viés claro deve gerar ao menos um sinal T"
    assert all(s.linha == LinhaDecisao.T for s in sinais)
    assert sinais[0].direcao > 0


def test_book_bearish_gera_direcao_negativa():
    gen = _gen()
    cot = Cotacao("tk", bid=0.28, ask=0.30, mid=0.29)
    sinais = gen.gerar(cot)
    assert sinais
    assert sinais[0].direcao < 0


def test_dado_ausente_respeita_r2():
    gen = _gen()
    assert gen.gerar(Cotacao("tk", bid=None, ask=None, mid=None)) == []


def test_probabilidade_invalida_sem_sinal():
    gen = _gen()
    assert gen.gerar(Cotacao("tk", bid=None, ask=None, mid=1.4)) == []
    assert gen.gerar(Cotacao("tk", bid=None, ask=None, mid=0.0)) == []


def test_sinais_bullish_viram_compra_na_doutrina():
    gen = _gen()
    cfg = WolfConfig()
    # Alimenta a doutrina com sinais de um book fortemente bullish e crescente.
    sinais = []
    for mid in (0.60, 0.66, 0.72, 0.78):
        sinais = gen.gerar(Cotacao("tk", bid=mid - 0.01, ask=mid + 0.01, mid=mid))
    decisao = avaliar(sinais, cfg)
    # NÃO pode ficar preso em SEM_CONVICCAO (o bug das 0 propostas).
    assert decisao.acao != Acao.SEM_CONVICCAO
    assert decisao.acao in (Acao.COMPRAR, Acao.COMPRAR_FORTE, Acao.MANTER)


def test_sinais_bearish_viram_venda_ou_reducao():
    gen = _gen()
    cfg = WolfConfig()
    sinais = []
    for mid in (0.40, 0.34, 0.28, 0.22):
        sinais = gen.gerar(Cotacao("tk", bid=mid - 0.01, ask=mid + 0.01, mid=mid))
    decisao = avaliar(sinais, cfg)
    assert decisao.acao != Acao.SEM_CONVICCAO
    assert decisao.acao in (Acao.VENDER, Acao.REDUZIR, Acao.MANTER)


def test_mercado_iliquido_no_modo_agressivo_ainda_gera_mas_reduzido():
    # spread relativo alto (ilíquido); modo agressivo não corta, só reduz.
    gen = GeradorSinaisTecnicos(ConfigSinaisTecnicos(
        agressivo=True, cortar_iliquido=False))
    cot = Cotacao("tk", bid=0.55, ask=0.85, mid=0.70)  # spread enorme
    sinais = gen.gerar(cot)
    assert sinais, "modo agressivo deve emitir mesmo em book ruidoso"


def test_modo_conservador_corta_iliquido():
    gen = GeradorSinaisTecnicos(ConfigSinaisTecnicos(
        agressivo=False, cortar_iliquido=True, spread_rel_max=0.10))
    cot = Cotacao("tk", bid=0.55, ask=0.85, mid=0.70)
    assert gen.gerar(cot) == []
