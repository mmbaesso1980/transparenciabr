"""Triagem de severidade a partir de ``severity_map.json`` (gerado do YAML)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .detector import SentinelHit

PACKAGE_DIR = Path(__file__).resolve().parent


def load_severity_map(path: Path | None = None) -> dict[str, Any]:
    p = path or (PACKAGE_DIR / "severity_map.json")
    data = json.loads(p.read_text(encoding="utf-8"))
    return data.get("by_slug", data)


def triage_hit(hit: SentinelHit, severity_by_slug: dict[str, str] | None = None) -> str:
    if severity_by_slug is None:
        severity_by_slug = load_severity_map()
    if hit.code == "OPERATOR_PII" or hit.slug == "operator_pii":
        return "CRITICAL"
    sev = severity_by_slug.get(hit.slug)
    if sev:
        return str(sev).upper()
    if hit.slug.startswith("struct_"):
        return "MEDIUM"
    if hit.slug.startswith("codename_") or hit.slug.startswith("blocklist_"):
        return "HIGH"
    return "MEDIUM"


def triage_hits(hits: list[SentinelHit], severity_by_slug: dict[str, str] | None = None) -> list[tuple[SentinelHit, str]]:
    return [(h, triage_hit(h, severity_by_slug)) for h in hits]


def max_severity(hits: list[SentinelHit], severity_by_slug: dict[str, str] | None = None) -> str | None:
    if not hits:
        return None
    order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    ranked = [order.index(triage_hit(h, severity_by_slug)) for h in hits]
    return order[max(ranked)]
