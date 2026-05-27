from __future__ import annotations

import os

from engines.sanitization.env_tokens import operator_tokens_from_env


def test_operator_tokens_from_env_split_strip(monkeypatch) -> None:
    monkeypatch.setenv("TBR_OPERATOR_PII_TOKENS", "  A  | B |  | C ")
    assert operator_tokens_from_env() == ["A", "B", "C"]


def test_operator_tokens_from_env_empty(monkeypatch) -> None:
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    assert operator_tokens_from_env() == []


def test_operator_tokens_matches_incident_conftest_default() -> None:
    assert "OPERADOR_SINTETICO_TESTE_001" in operator_tokens_from_env()
