#!/usr/bin/env python3
"""Gera `arsenal_apis.json` a partir de `arsenal_source_data.all_endpoints()`."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from arsenal_source_data import all_endpoints  # noqa: E402


def main() -> int:
    endpoints = all_endpoints()
    payload = {
        "schema_version": 1,
        "namespace": "transparenciabr",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "gen_arsenal_apis.py",
        "source_module": "arsenal_source_data.all_endpoints",
        "endpoint_count": len(endpoints),
        "endpoints": endpoints,
        "indices": _build_indices(endpoints),
    }
    out_path = ROOT / "arsenal_apis.json"
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Escrito {out_path} com {len(endpoints)} endpoints.")
    return 0


def _build_indices(endpoints: list) -> dict:
    by_grupo: dict[str, list[str]] = {}
    by_prioridade: dict[str, list[str]] = {}
    by_tipo: dict[str, list[str]] = {}
    for ep in endpoints:
        gid = ep.get("grupo_id") or ""
        pr = ep.get("prioridade") or ""
        ta = ep.get("tipo_acesso") or ""
        by_grupo.setdefault(gid, []).append(ep["id"])
        by_prioridade.setdefault(pr, []).append(ep["id"])
        by_tipo.setdefault(ta, []).append(ep["id"])
    return {
        "by_grupo_id": by_grupo,
        "by_prioridade": by_prioridade,
        "by_tipo_acesso": by_tipo,
    }


if __name__ == "__main__":
    raise SystemExit(main())
