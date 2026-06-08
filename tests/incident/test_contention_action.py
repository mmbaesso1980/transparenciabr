"""Unit tests for engines.incident.contention — contention_action (45% → 100%)."""
from __future__ import annotations

import pytest

from engines.incident.contention import contention_action


@pytest.mark.parametrize(
    "sev,expected",
    [
        ("LOW", "log"),
        ("low", "log"),
        ("  low  ", "log"),
        ("MEDIUM", "warn"),
        ("medium", "warn"),
        ("  Medium ", "warn"),
        ("HIGH", "block"),
        ("high", "block"),
        ("CRITICAL", "block"),
        ("critical", "block"),
        ("", "log"),
        (None, "log"),
        ("UNKNOWN", "log"),
    ],
)
def test_contention_action(sev, expected):
    assert contention_action(sev) == expected
