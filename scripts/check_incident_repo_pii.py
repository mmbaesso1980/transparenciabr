#!/usr/bin/env python3
"""Falha se ficheiros M11/fixtures contiverem padrões PII do operador (sem literais no código)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _pat() -> re.Pattern[str]:
    a = "".join(map(chr, [98, 97, 101, 115, 115, 111]))
    b = "".join(map(chr, [109, 97, 117, 114, 105, 108, 105, 111]))
    c = "".join(map(chr, [109, 101, 115, 113, 117, 105, 116, 97]))
    d = "".join(map(chr, [109, 109, 98, 97, 101, 115, 115, 111]))
    return re.compile("(?i)" + "|".join([a, b, c, d]))


def main() -> int:
    rx = _pat()
    roots = [
        ROOT / "engines" / "incident",
        ROOT / "tests" / "incident" / "fixtures",
    ]
    bad = False
    for base in roots:
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.suffix.lower() not in (".yaml", ".yml", ".json"):
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            if rx.search(text):
                print(f"❌ match in {p.relative_to(ROOT)}", file=sys.stderr)
                bad = True
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
