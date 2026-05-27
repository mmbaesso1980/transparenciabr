from __future__ import annotations

from engines.incident.detector import SentinelHit
from engines.incident.triage import load_severity_map, triage_hit


def test_operator_pii_always_critical_any_slug():
    m = load_severity_map()
    for slug in ("operator_pii", "operator_pii_alt", "x"):
        h = SentinelHit("OPERATOR_PII", slug, "x", 0, 1)
        assert triage_hit(h, m) == "CRITICAL"


def test_slug_lookup_from_map():
    h = SentinelHit("BLOCKLIST", "blocklist_fraude", "fraude", 0, 6)
    m = {"blocklist_fraude": "HIGH"}
    assert triage_hit(h, m) == "HIGH"


def test_severity_map_codename_aurora_360_critical():
    m = load_severity_map()
    h = SentinelHit("CODENAME", "codename_aurora_360", "AURORA 360", 0, 10)
    assert triage_hit(h, m) == "CRITICAL"


def test_severity_map_blocklist_bigquery_interno_critical():
    m = load_severity_map()
    h = SentinelHit("BLOCKLIST", "blocklist_bigquery_interno", "bigquery interno", 0, 20)
    assert triage_hit(h, m) == "CRITICAL"


def test_severity_map_struct_none_high():
    m = load_severity_map()
    h = SentinelHit("STRUCT_NONE", "struct_none", "None", 0, 4)
    assert triage_hit(h, m) == "HIGH"
