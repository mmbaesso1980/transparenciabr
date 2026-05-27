"""Redação segura de detalhes antes de persistência (Firestore / logs)."""
from __future__ import annotations

import hashlib
import re

from .detector import SentinelHit


def safe_detail(hit: SentinelHit) -> str:
    """OPERATOR_PII → placeholder hash; demais → 80 chars sem newline."""
    if hit.code == "OPERATOR_PII" or hit.slug == "operator_pii":
        h = hashlib.sha256(hit.detail.encode("utf-8")).hexdigest()[:8]
        return f"[PII_REDACTED_{h}]"
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
