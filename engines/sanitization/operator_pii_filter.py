"""Filtro de PII do operador/solicitante para saídas públicas (dossiê, JSON, PDF)."""
from __future__ import annotations

from typing import Any

from .env_tokens import operator_tokens_from_env

LGPD_CLASS_C_PLACEHOLDER = "[DADO PROTEGIDO POR LGPD]"


def sanitize_for_public_output(text: str) -> str:
    """Substitui tokens do operador declarados em ``TBR_OPERATOR_PII_TOKENS``.

    Máscara **LGPD classe C** (identidade do solicitante/operador no produto final).
    Tokens de PEP em **classe B** (CPF mascarado ``***.XXX.XXX-**``) **não** passam por
    este sanitizer — fluxo separado em
    ``manus_office/dossie_v1/agents/revisores/revisor_mascara_pii.py``.
    """
    if not text:
        return text
    tokens = operator_tokens_from_env()
    if not tokens:
        return text

    out = text
    low = out.casefold()
    for token in sorted(tokens, key=len, reverse=True):
        needle = token.casefold()
        if not needle:
            continue
        start = 0
        while True:
            i = low.find(needle, start)
            if i < 0:
                break
            out = out[:i] + LGPD_CLASS_C_PLACEHOLDER + out[i + len(needle) :]
            low = out.casefold()
            start = i + len(LGPD_CLASS_C_PLACEHOLDER)
    return out


def sanitize_structure(value: Any) -> Any:
    """Aplica :func:`sanitize_for_public_output` recursivamente em dict/list/str."""
    if isinstance(value, str):
        return sanitize_for_public_output(value)
    if isinstance(value, dict):
        return {k: sanitize_structure(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_structure(item) for item in value]
    return value
