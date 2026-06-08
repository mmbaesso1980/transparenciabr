"""Unit tests for engines.incident.incident_log — build_incident_document."""
from __future__ import annotations

from engines.incident.detector import SentinelHit
from engines.incident.incident_log import build_incident_document


def _make_hit(code="STRUCT_NONE", slug="struct_none", detail="None", start=0, end=4):
    return SentinelHit(code=code, slug=slug, detail=detail, start=start, end=end)


def test_build_incident_document_minimal():
    hit = _make_hit()
    doc = build_incident_document(
        incident_id="INC-001",
        severity="HIGH",
        detected_at="2025-04-01T00:00:00Z",
        dossie_id="dossie-abc",
        hits=[hit],
    )
    assert doc["incident_id"] == "INC-001"
    assert doc["severity"] == "HIGH"
    assert doc["detected_at"] == "2025-04-01T00:00:00Z"
    assert doc["dossie_id"] == "dossie-abc"
    assert doc["status"] == "open"
    assert doc["retraction_sent_to"] == []
    assert doc["postmortem_url"] is None
    assert doc["contained_at"] is None
    assert len(doc["sentinels"]) == 1
    assert doc["sentinels"][0]["code"] == "STRUCT_NONE"


def test_build_incident_document_with_optional_fields():
    hit = _make_hit(code="BLOCKLIST", slug="blocklist_fraudou", detail="fraudou")
    doc = build_incident_document(
        incident_id="INC-002",
        severity="CRITICAL",
        detected_at="2025-05-01T12:00:00Z",
        dossie_id="dossie-xyz",
        hits=[hit],
        contained_at="2025-05-01T12:05:00Z",
        retraction_sent_to=["advogado@example.com"],
        postmortem_url="https://wiki.example.com/postmortem/002",
        status="resolved",
    )
    assert doc["status"] == "resolved"
    assert doc["contained_at"] == "2025-05-01T12:05:00Z"
    assert doc["retraction_sent_to"] == ["advogado@example.com"]
    assert doc["postmortem_url"] == "https://wiki.example.com/postmortem/002"


def test_build_incident_document_multiple_hits():
    hits = [
        _make_hit(code="STRUCT_NONE", slug="struct_none", detail="None", start=0, end=4),
        _make_hit(code="BLOCKLIST", slug="blocklist_roubou", detail="roubou", start=10, end=16),
    ]
    doc = build_incident_document(
        incident_id="INC-003",
        severity="HIGH",
        detected_at="2025-06-01T00:00:00Z",
        dossie_id="dossie-multi",
        hits=hits,
    )
    assert len(doc["sentinels"]) == 2
    assert doc["sentinels"][0]["slug"] == "struct_none"
    assert doc["sentinels"][1]["slug"] == "blocklist_roubou"
