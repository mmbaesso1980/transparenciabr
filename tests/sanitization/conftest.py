"""Configuração partilhada dos testes M12 / sanitization."""

from __future__ import annotations

import os

import pytest

_ENV_KEY = "TBR_OPERATOR_PII_TOKENS"
_ENV_VALUE = "OPERADOR_SINTETICO_TESTE_001"


@pytest.fixture(scope="session", autouse=True)
def synthetic_operator_pii_tokens_session() -> None:
    previous = os.environ.get(_ENV_KEY)
    os.environ[_ENV_KEY] = _ENV_VALUE
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(_ENV_KEY, None)
        else:
            os.environ[_ENV_KEY] = previous
