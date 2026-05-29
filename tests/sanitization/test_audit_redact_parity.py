from __future__ import annotations

from engines.incident.audit import redact_operator_token_for_log, safe_detail
from engines.incident.detector import SentinelHit


def redact_operator_token_via_safe_detail(token: str) -> str:
    hit = SentinelHit("OPERATOR_PII", "operator_pii", token, 0, len(token))
    return safe_detail(hit)


def test_redact_operator_token_for_log_matches_safe_detail() -> None:
    sample = "OPERADOR_SINTETICO_TESTE_001"
    assert redact_operator_token_for_log(sample) == redact_operator_token_via_safe_detail(sample)


def test_redact_operator_token_for_log_arbitrary() -> None:
    assert redact_operator_token_for_log("X") == redact_operator_token_via_safe_detail("X")
