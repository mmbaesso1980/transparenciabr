"""Tokens de identidade do operador/solicitante via ambiente (partilhado M11 + M12)."""
from __future__ import annotations

import os


def operator_tokens_from_env() -> list[str]:
    """Lê ``TBR_OPERATOR_PII_TOKENS`` (separador ``|``), strip e remove vazios."""
    raw = os.environ.get("TBR_OPERATOR_PII_TOKENS", "") or ""
    parts = [p.strip() for p in raw.split("|")]
    return [p for p in parts if p]
