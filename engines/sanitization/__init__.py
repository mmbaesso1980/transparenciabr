"""Sanitização de PII do operador/solicitante (LGPD classe C) antes de artefatos públicos."""

from .env_tokens import operator_tokens_from_env
from .operator_pii_filter import (
    LGPD_CLASS_C_PLACEHOLDER,
    sanitize_for_public_output,
    sanitize_structure,
)

__all__ = [
    "LGPD_CLASS_C_PLACEHOLDER",
    "operator_tokens_from_env",
    "sanitize_for_public_output",
    "sanitize_structure",
]
