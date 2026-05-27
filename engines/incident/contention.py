"""Contenção de publicação conforme severidade (M11)."""
from __future__ import annotations


def blocks_publication(severity: str) -> bool:
    s = (severity or "").strip().upper()
    return s in ("HIGH", "CRITICAL")


def contention_action(severity: str) -> str:
    """LOW → log; MEDIUM → warn; HIGH/CRITICAL → bloquear."""
    s = (severity or "").strip().upper()
    if s in ("HIGH", "CRITICAL"):
        return "block"
    if s == "MEDIUM":
        return "warn"
    return "log"
