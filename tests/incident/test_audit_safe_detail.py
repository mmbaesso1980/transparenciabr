from __future__ import annotations

from engines.incident.audit import safe_detail
from engines.incident.detector import SentinelHit


def test_safe_detail_operator_redacts():
    h = SentinelHit("OPERATOR_PII", "operator_pii", "SecretName", 0, 10)
    d = safe_detail(h)
    assert d.startswith("[PII_REDACTED_")
    assert d.endswith("]")
    assert "Secret" not in d


def test_safe_detail_truncates_and_strips_newlines():
    long = "a" * 200 + "\nline"
    h = SentinelHit("STRUCT_NONE", "struct_none", long, 0, len(long))
    d = safe_detail(h)
    assert "\n" not in d
    assert len(d) <= 80
