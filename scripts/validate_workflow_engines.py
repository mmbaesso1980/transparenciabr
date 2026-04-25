#!/usr/bin/env python3
"""Validate GitHub Actions references to numbered Python engines.

This intentionally checks only local repository files. It prevents workflows
from silently drifting to names like ``engines/10_score_geral.py`` when the
actual engine is ``engines/10_universal_crawler.py``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ENGINE_REF_RE = re.compile(
    r"python(?:3)?\s+((?:engines/)?[0-9][A-Za-z0-9_.\-/]*\.py)"
)


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    workflows_dir = repo / ".github" / "workflows"
    engines_dir = repo / "engines"

    existing = {
        path.relative_to(repo).as_posix()
        for path in engines_dir.glob("*.py")
    }

    missing: list[tuple[Path, str]] = []

    for workflow in sorted(workflows_dir.glob("*.yml")):
        text = workflow.read_text(encoding="utf-8")
        for match in ENGINE_REF_RE.finditer(text):
            ref = match.group(1)
            normalized = ref if ref.startswith("engines/") else f"engines/{ref}"
            if normalized not in existing:
                missing.append((workflow.relative_to(repo), ref))

    if missing:
        print("Workflow references to missing engine files detected:")
        for workflow, ref in missing:
            print(f"  - {workflow}: {ref}")
        return 1

    print("All numbered engine references in workflows point to existing files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
