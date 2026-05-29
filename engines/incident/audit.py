"""Redação segura de detalhes antes de persistência (Firestore / logs)."""
from __future__ import annotations

import hashlib
import re

from .detector import SentinelHit


def sha256_prefix8(value: str) -> str:
    """Prefixo SHA-256 (8 hex) para redação de PII em logs (M11/M12)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]


def redact_operator_token_for_log(token: str) -> str:
    """Redação de token de operador para audit/log (mesmo esquema que :func:`safe_detail`)."""
    return f"[PII_REDACTED_{sha256_prefix8(token)}]"


def safe_detail(hit: SentinelHit) -> str:
    """OPERATOR_PII → placeholder hash; demais → 80 chars sem newline."""
    if hit.code == "OPERATOR_PII" or hit.slug == "operator_pii":
        return redact_operator_token_for_log(hit.detail)
    flat = re.sub(r"\s+", " ", hit.detail or "").strip()
    return flat[:80]


def hit_to_audit_dict(hit: SentinelHit) -> dict:
    return {
        "code": hit.code,
        "slug": hit.slug,
        "detail": safe_detail(hit),
        "start": hit.start,
        "end": hit.end,
    }
