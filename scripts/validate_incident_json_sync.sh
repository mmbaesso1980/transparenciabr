#!/usr/bin/env bash
# Valida que sentinels.json e severity_map.json estão em sync com os YAML.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
python3 scripts/yaml2json.py engines/incident/sentinels.yaml engines/incident/severity_map.yaml
git diff --exit-code -- engines/incident/sentinels.json engines/incident/severity_map.yaml
