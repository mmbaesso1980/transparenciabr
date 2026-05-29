from __future__ import annotations

from pathlib import Path

import pytest

from engines.incident.detector import load_sentinels_config, scan_text
from engines.incident.triage import max_severity, triage_hit

CLEAN_DIR = Path(__file__).resolve().parent / "fixtures" / "clean"


@pytest.mark.parametrize(
    "fname",
    [
        "erika_excerpt.txt",
        "kataguiri_excerpt.txt",
        "andreia_excerpt.txt",
        "paulo_excerpt_clean.txt",
    ],
)
def test_clean_excerpts_no_high_or_critical(fname, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    text = (CLEAN_DIR / fname).read_text(encoding="utf-8")
    cfg = load_sentinels_config()
    hits = scan_text(text, cfg)
    worst = max_severity(hits)
    assert worst is None or worst in ("LOW", "MEDIUM")
    for h in hits:
        assert triage_hit(h) not in ("HIGH", "CRITICAL")
