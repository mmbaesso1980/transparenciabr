"""Garante que ficheiros versionados de configuração/fixtures não contêm PII do operador."""
from __future__ import annotations

import json
import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_INCIDENT = _REPO_ROOT / "engines" / "incident"
_FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _forbidden_pattern() -> re.Pattern[str]:
    # Construído sem literais do nome (evita falso positivo em greps de revisão).
    a = "".join(map(chr, [98, 97, 101, 115, 115, 111]))
    b = "".join(map(chr, [109, 97, 117, 114, 105, 108, 105, 111]))
    c = "".join(map(chr, [109, 101, 115, 113, 117, 105, 116, 97]))
    d = "".join(map(chr, [109, 109, 98, 97, 101, 115, 115, 111]))
    return re.compile("(?i)" + "|".join([a, b, c, d]))


def _assert_clean(label: str, text: str) -> None:
    m = _forbidden_pattern().search(text)
    assert m is None, f"PII/padrão proibido em {label!r}: match={m.group(0)!r}"


def test_no_operator_pii_in_sentinels_yaml_and_json() -> None:
    for name in ("sentinels.yaml", "sentinels.json"):
        p = _INCIDENT / name
        _assert_clean(str(p), p.read_text(encoding="utf-8"))


def test_no_operator_pii_in_severity_map_yaml_and_json() -> None:
    for name in ("severity_map.yaml", "severity_map.json"):
        p = _INCIDENT / name
        _assert_clean(str(p), p.read_text(encoding="utf-8"))


def test_no_operator_pii_in_incident_json_fixtures() -> None:
    for p in sorted(_FIXTURES.glob("*.json")):
        raw = p.read_text(encoding="utf-8")
        _assert_clean(str(p), raw)
        json.loads(raw)
