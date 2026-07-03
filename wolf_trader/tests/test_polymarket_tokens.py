"""Testes de normalizacao de token_ids do cliente Polymarket.

Foco: o helper `_parse_token_ids` e a integracao em `listar_mercados`.

Motivacao (bug de producao 2026-07-03): a Gamma API retorna `clobTokenIds`
como STRING JSON (ex.: '["7212...","9987..."]'). O codigo antigo colocava essa
string em `Mercado.tokens` e o runner iterava caractere-a-caractere, gerando
token_id='[', '"', '7', etc. e um enxame de 404 no book do CLOB.

Nenhum teste acessa rede. `listar_mercados` e testado com o HTTP mockado.
"""
from __future__ import annotations

from unittest import mock

from wolf_trader.polymarket_client import (
    PolymarketReader,
    Mercado,
    _parse_token_ids,
)


# ---------------------------------------------------------------------------
# _parse_token_ids — todos os formatos
# ---------------------------------------------------------------------------
class TestParseTokenIds:
    def test_string_json_lista(self):
        # O caso do bug: string JSON de token_ids.
        raw = '["72123456789", "99876543210"]'
        assert _parse_token_ids(raw) == ["72123456789", "99876543210"]

    def test_string_json_com_espacos(self):
        raw = '  ["a1", "b2"]  '
        assert _parse_token_ids(raw) == ["a1", "b2"]

    def test_lista_de_dicts(self):
        raw = [{"token_id": "tok1", "outcome": "Yes"},
               {"token_id": "tok2", "outcome": "No"}]
        assert _parse_token_ids(raw) == ["tok1", "tok2"]

    def test_lista_de_dicts_camelcase(self):
        raw = [{"tokenId": "tokA"}, {"id": "tokB"}]
        assert _parse_token_ids(raw) == ["tokA", "tokB"]

    def test_lista_de_strings(self):
        raw = ["tokX", "tokY"]
        assert _parse_token_ids(raw) == ["tokX", "tokY"]

    def test_token_id_unico_sem_colchetes(self):
        # String que nao e estrutura JSON: tratada como token_id unico.
        assert _parse_token_ids("72123456789") == ["72123456789"]

    def test_dict_isolado(self):
        assert _parse_token_ids({"token_id": "solo"}) == ["solo"]

    def test_vazios_e_nulos(self):
        assert _parse_token_ids(None) == []
        assert _parse_token_ids("") == []
        assert _parse_token_ids("   ") == []
        assert _parse_token_ids([]) == []
        assert _parse_token_ids("[]") == []

    def test_json_malformado_nao_quebra(self):
        # JSON invalido -> [] (regra 9: sem dado confiavel, nao inventa).
        assert _parse_token_ids('["a", "b"') == []

    def test_descarta_ruido_de_caracteres_soltos(self):
        # Mesmo que chegue lista com lixo, nunca vira token_id '[' ou '"'.
        raw = ["[", '"', ",", "]", "tokReal"]
        assert _parse_token_ids(raw) == ["tokReal"]

    def test_nunca_itera_char_a_char(self):
        # Blindagem explicita contra o bug: uma string JSON de 1 token
        # NAO pode virar uma lista de caracteres.
        raw = '["7212"]'
        out = _parse_token_ids(raw)
        assert out == ["7212"]
        assert "[" not in out and '"' not in out and "7" not in out


# ---------------------------------------------------------------------------
# listar_mercados — parsing na origem
# ---------------------------------------------------------------------------
class TestListarMercados:
    def _reader_com_resposta(self, payload):
        reader = PolymarketReader()
        reader._get = mock.MagicMock(return_value=payload)
        return reader

    def test_clobtokenids_string_json(self):
        # Formato real da Gamma API que causou o bug.
        payload = [{
            "conditionId": "0xabc",
            "question": "Vai chover amanha?",
            "closed": False,
            "clobTokenIds": '["72123456789", "99876543210"]',
        }]
        reader = self._reader_com_resposta(payload)
        mercados = reader.listar_mercados()
        assert len(mercados) == 1
        m = mercados[0]
        assert isinstance(m.tokens, list)
        assert m.tokens == ["72123456789", "99876543210"]

    def test_tokens_lista_de_dicts(self):
        payload = [{
            "condition_id": "0xdef",
            "title": "Mercado X",
            "closed": False,
            "tokens": [{"token_id": "t1"}, {"token_id": "t2"}],
        }]
        reader = self._reader_com_resposta(payload)
        m = reader.listar_mercados()[0]
        assert m.tokens == ["t1", "t2"]

    def test_resposta_data_wrapper(self):
        payload = {"data": [{
            "conditionId": "0x1",
            "question": "?",
            "closed": False,
            "clobTokenIds": '["z9"]',
        }]}
        reader = self._reader_com_resposta(payload)
        m = reader.listar_mercados()[0]
        assert m.tokens == ["z9"]

    def test_mercado_sem_tokens(self):
        payload = [{"conditionId": "0x2", "question": "?", "closed": False}]
        reader = self._reader_com_resposta(payload)
        m = reader.listar_mercados()[0]
        assert m.tokens == []
