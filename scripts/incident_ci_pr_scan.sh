#!/usr/bin/env bash
# Varre ficheiros de texto alterados no PR com o detector M11 (falha se ≥ HIGH).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE="${GITHUB_BASE_REF:-main}"
git fetch origin "$BASE" --depth=1 2>/dev/null || true
mapfile -t FILES < <(git diff --name-only "origin/${BASE}...HEAD" 2>/dev/null || git diff --name-only HEAD~1...HEAD)
TARGETS=()
for f in "${FILES[@]}"; do
  case "$f" in
    *.md|*.txt|*.json) TARGETS+=("$f") ;;
    *) ;;
  esac
done
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "Nenhum .md/.txt/.json alterado — skip incident scan."
  exit 0
fi
export PYTHONPATH="$ROOT"
# Só ficheiros existentes (renames/removals)
EXIST=()
for f in "${TARGETS[@]}"; do
  [[ -f "$f" ]] && EXIST+=("$f")
done
if [[ ${#EXIST[@]} -eq 0 ]]; then
  echo "Sem ficheiros texto presentes no checkout."
  exit 0
fi
exec python3 -m engines.incident "${EXIST[@]}"
