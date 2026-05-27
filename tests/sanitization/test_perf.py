from __future__ import annotations

import time

from engines.sanitization.operator_pii_filter import sanitize_for_public_output


def test_sanitize_100kb_under_100ms() -> None:
    chunk = "Parágrafo público sem token do operador. Dados do portal.\n"
    text = chunk * (100_000 // len(chunk) + 5)
    assert len(text.encode("utf-8")) >= 100_000
    t0 = time.perf_counter()
    sanitize_for_public_output(text)
    elapsed = time.perf_counter() - t0
    assert elapsed < 0.1, f"sanitize demorou {elapsed:.3f}s (limite 100ms / 100KB)"
