from __future__ import annotations

from engines.sanitization.operator_pii_filter import (
    LGPD_CLASS_C_PLACEHOLDER,
    sanitize_for_public_output,
    sanitize_structure,
)


def test_sanitize_replaces_session_token() -> None:
    raw = "Relatório para OPERADOR_SINTETICO_TESTE_001 — fim."
    out = sanitize_for_public_output(raw)
    assert "OPERADOR_SINTETICO_TESTE_001" not in out
    assert LGPD_CLASS_C_PLACEHOLDER in out


def test_sanitize_case_insensitive() -> None:
    raw = "operador_sintetico_teste_001 aparece aqui."
    out = sanitize_for_public_output(raw)
    assert "operador_sintetico_teste_001" not in out.casefold()
    assert LGPD_CLASS_C_PLACEHOLDER in out


def test_sanitize_structure_nested() -> None:
    doc = {"findings": [{"fato": "citou OPERADOR_SINTETICO_TESTE_001"}]}
    out = sanitize_structure(doc)
    assert "OPERADOR_SINTETICO_TESTE_001" not in str(out)
    assert LGPD_CLASS_C_PLACEHOLDER in out["findings"][0]["fato"]


def test_pep_cpf_mask_not_altered_without_env_token(monkeypatch) -> None:
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    masked = "CPF ***.693.221-** na base."
    assert sanitize_for_public_output(masked) == masked


def test_chr_built_token_antiregression(monkeypatch) -> None:
    token = "".join(map(chr, [77, 65, 85, 82, 73, 76, 73, 79, 95, 67, 72, 82, 95, 49]))
    monkeypatch.setenv("TBR_OPERATOR_PII_TOKENS", token)
    sample = f"Contratante: {token} assinou."
    out = sanitize_for_public_output(sample)
    assert token not in out
    assert LGPD_CLASS_C_PLACEHOLDER in out
