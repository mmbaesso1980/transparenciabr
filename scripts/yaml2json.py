#!/usr/bin/env python3
"""Converte ficheiros YAML para JSON (indentado, chaves ordenadas).

Requer: pip install -r dev-requirements.txt

Uso:
  python scripts/yaml2json.py engines/incident/sentinels.yaml engines/incident/severity_map.yaml
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError as e:
        print("PyYAML não instalado. Instale com: pip install -r dev-requirements.txt", file=sys.stderr)
        raise SystemExit(1) from e

    if len(sys.argv) < 2:
        print("Uso: yaml2json.py <ficheiro.yaml> [outro.yaml ...]", file=sys.stderr)
        return 1

    for yaml_path in sys.argv[1:]:
        src = Path(yaml_path)
        if not src.is_file():
            print(f"Ficheiro inexistente: {src}", file=sys.stderr)
            return 1
        data = yaml.safe_load(src.read_text(encoding="utf-8"))
        dst = src.with_suffix(".json")
        dst.write_text(
            json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"OK {src} -> {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
