"""CLI: varre ficheiros de texto e falha se severidade máxima ≥ HIGH."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .contention import blocks_publication
from .detector import ScanMode, load_sentinels_config, scan_text
from .triage import max_severity, triage_hit


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="M11 incident scan (CI)")
    p.add_argument(
        "--mode",
        choices=("output", "source"),
        default="output",
        help="output: todas as regras (artefatos MD/JSON/PDF); "
        "source: sem struct_none/null/undefined/nan/obj em código",
    )
    p.add_argument("files", nargs="*", help="Ficheiros a varrer")
    args = p.parse_args(argv)
    scan_mode: ScanMode = args.mode  # type: ignore[assignment]
    cfg = load_sentinels_config()
    worst: str | None = None
    for fp in args.files:
        path = Path(fp)
        if not path.is_file():
            print(f"SKIP missing: {path}", file=sys.stderr)
            continue
        if path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            text = data.get("body") or data.get("text") or ""
        else:
            text = path.read_text(encoding="utf-8", errors="replace")
        hits = scan_text(text, cfg, mode=scan_mode)
        sev = max_severity(hits)
        if sev is None:
            continue
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        if worst is None or order.index(sev) > order.index(worst):
            worst = sev
        if blocks_publication(sev):
            print(f"FAIL {path}: max_severity={sev} hits={len(hits)}", file=sys.stderr)
            for h in hits[:20]:
                print(f"  - {h.slug} {triage_hit(h)} {h.detail!r}", file=sys.stderr)
            return 1
    print(f"OK worst={worst or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
