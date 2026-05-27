"""Esquema e payload para ``maestro_incident_log/{incident_id}`` (Firestore).

Campos:
  incident_id, severity, detected_at, dossie_id, sentinels[],
  contained_at, retraction_sent_to[], postmortem_url, status
"""
from __future__ import annotations

from typing import Any

from .audit import hit_to_audit_dict
from .detector import SentinelHit


def build_incident_document(
    *,
    incident_id: str,
    severity: str,
    detected_at: Any,
    dossie_id: str,
    hits: list[SentinelHit],
    contained_at: Any | None = None,
    retraction_sent_to: list[str] | None = None,
    postmortem_url: str | None = None,
    status: str = "open",
) -> dict[str, Any]:
    return {
        "incident_id": incident_id,
        "severity": severity,
        "detected_at": detected_at,
        "dossie_id": dossie_id,
        "sentinels": [hit_to_audit_dict(h) for h in hits],
        "contained_at": contained_at,
        "retraction_sent_to": retraction_sent_to or [],
        "postmortem_url": postmortem_url,
        "status": status,
    }
