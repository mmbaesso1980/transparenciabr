"""Testes do input do Comandante via Telegram — polling, comandos e sinais."""
from __future__ import annotations

from wolf_trader.comando_telegram import (
    ConfigComando,
    OuvinteTelegram,
    TipoComando,
    interpretar_comando,
    interpretar_sinal,
)


def test_interpretar_comando_com_barra():
    c = interpretar_comando("/pausar")
    assert c is not None and c.tipo == TipoComando.PAUSAR


def test_interpretar_comando_sem_barra():
    assert interpretar_comando("status").tipo == TipoComando.STATUS
    assert interpretar_comando("agressivo").tipo == TipoComando.AGRESSIVO
    assert interpretar_comando("banca").tipo == TipoComando.BANCA


def test_interpretar_comando_ingles():
    assert interpretar_comando("/resume").tipo == TipoComando.RETOMAR
    assert interpretar_comando("/stop").tipo == TipoComando.PAUSAR


def test_interpretar_comando_texto_livre_nao_e_comando():
    assert interpretar_comando("acho que Lula vai subir") is None


def test_interpretar_sinal_positivo():
    s = interpretar_sinal("acho que o mercado vai subir forte, otimista", 0.85)
    assert s is not None
    assert s.direcao > 0
    assert 0 < s.conviccao <= 0.95


def test_interpretar_sinal_negativo():
    s = interpretar_sinal("vai cair, crise à vista, pessimista", 0.85)
    assert s is not None
    assert s.direcao < 0


def test_interpretar_sinal_sem_direcao_retorna_none():
    assert interpretar_sinal("bom dia equipe", 0.85) is None


def test_conviccao_comandante_nunca_chega_a_um():
    s = interpretar_sinal("subir subir subir alta alta otimista comprar", 0.85)
    assert s.conviccao < 1.0


# ---- polling getUpdates ----
def _update(uid, chat_id, texto):
    return {"update_id": uid, "message": {"chat": {"id": chat_id}, "text": texto}}


def _fetch_com(updates):
    return lambda url, params, timeout: {"ok": True, "result": updates}


def test_poll_reconhece_comando_e_sinal():
    cfg = ConfigComando(commander_chat_id="6483072695")
    updates = [
        _update(1, 6483072695, "/pausar"),
        _update(2, 6483072695, "acho que vai subir, otimista"),
    ]
    ouvinte = OuvinteTelegram(cfg, bot_token="tok", fetch=_fetch_com(updates))
    leitura = ouvinte.poll()
    assert len(leitura.comandos) == 1
    assert leitura.comandos[0].tipo == TipoComando.PAUSAR
    assert len(leitura.sinais) == 1
    assert leitura.sinais[0].direcao > 0
    assert leitura.novo_offset == 3  # maior update_id + 1


def test_poll_ignora_chat_nao_autorizado():
    cfg = ConfigComando(commander_chat_id="6483072695")
    updates = [_update(1, 99999999, "/pausar")]
    ouvinte = OuvinteTelegram(cfg, bot_token="tok", fetch=_fetch_com(updates))
    leitura = ouvinte.poll()
    assert leitura.comandos == []
    assert leitura.sinais == []
    # offset ainda avança para não reprocessar.
    assert leitura.novo_offset == 2


def test_poll_offset_avanca_entre_chamadas():
    cfg = ConfigComando(commander_chat_id="6483072695")
    estado = {"lote": [_update(10, 6483072695, "/status")]}

    def fetch(url, params, timeout):
        # Na segunda chamada, exige offset avançado e devolve vazio.
        if params.get("offset") == 11:
            return {"ok": True, "result": []}
        return {"ok": True, "result": estado["lote"]}

    ouvinte = OuvinteTelegram(cfg, bot_token="tok", fetch=fetch)
    l1 = ouvinte.poll()
    assert l1.comandos[0].tipo == TipoComando.STATUS
    l2 = ouvinte.poll()  # deve usar offset=11 e não repetir
    assert l2.comandos == []


def test_poll_sem_token_retorna_vazio():
    ouvinte = OuvinteTelegram(ConfigComando(), bot_token="")
    leitura = ouvinte.poll()
    assert leitura.comandos == [] and leitura.sinais == []


def test_poll_erro_de_rede_nao_derruba():
    def fetch_erro(url, params, timeout):
        raise RuntimeError("timeout")
    ouvinte = OuvinteTelegram(
        ConfigComando(), bot_token="tok", fetch=fetch_erro)
    leitura = ouvinte.poll()
    assert leitura.comandos == [] and leitura.sinais == []


def test_poll_ok_false_nao_derruba():
    def fetch(url, params, timeout):
        return {"ok": False, "description": "unauthorized"}
    ouvinte = OuvinteTelegram(
        ConfigComando(), bot_token="tok", fetch=fetch)
    assert ouvinte.poll().comandos == []
