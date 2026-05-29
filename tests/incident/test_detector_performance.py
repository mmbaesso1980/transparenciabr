from __future__ import annotations

import time

import pytest

from engines.incident.detector import load_sentinels_config, scan_text


def test_detector_100kb_under_2s(monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    chunk = "Parágrafo informativo sem sentinelas. Dados públicos do portal.\n"
    text = chunk * (100_000 // len(chunk) + 5)
    assert len(text.encode("utf-8")) >= 100_000
    cfg = load_sentinels_config()
    t0 = time.perf_counter()
    scan_text(text, cfg)
    elapsed = time.perf_counter() - t0
    assert elapsed < 2.0, f"scan demorou {elapsed:.3f}s (limite 2s / 100KB)"
