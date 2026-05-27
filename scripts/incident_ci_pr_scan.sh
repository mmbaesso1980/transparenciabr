#!/usr/bin/env bash
# NÃO varrer fixtures de teste — elas contêm bugs propositais
# para validar o detector (golden fixtures).
#
# Varre ficheiros de texto (e binários relevantes) alterados no PR com o
# detector M11 (falha se severidade máxima ≥ HIGH). Exclui explicitamente
# `tests/**/fixtures/**` e `tests/incident/fixtures/**`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BASE="${GITHUB_BASE_REF:-main}"
git fetch origin "$BASE" --depth=1 2>/dev/null || true
mapfile -t FILES < <(git diff --name-only "origin/${BASE}...HEAD" 2>/dev/null || git diff --name-only HEAD~1...HEAD)

# Exclui golden fixtures e qualquer árvore tests/**/fixtures/** (bugs intencionais).
should_skip_fixture() {
  local f="$1"
  if [[ "$f" =~ ^tests/(.*/)?fixtures/ ]]; then
    return 0
  fi
  return 1
}

should_scan_path() {
  local f="$1"
  if should_skip_fixture "$f"; then
    return 1
  fi
  case "$f" in
    *.md|*.txt|*.json)
      return 0
      ;;
    *.pdf)
      case "$f" in
        frontend/*|docs/*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    *.py)
      case "$f" in
        manus_office/*|engines/dossie*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac
}

TARGETS=()
for f in "${FILES[@]}"; do
  if should_scan_path "$f"; then
    TARGETS+=("$f")
  fi
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "Nenhum ficheiro relevante alterado (ou só fixtures/tests ignoradas) — skip incident scan."
  exit 0
fi

export PYTHONPATH="$ROOT"
EXIST=()
for f in "${TARGETS[@]}"; do
  [[ -f "$f" ]] && EXIST+=("$f")
done
if [[ ${#EXIST[@]} -eq 0 ]]; then
  echo "Sem ficheiros presentes no checkout para varrer."
  exit 0
fi

# Artefatos de saída: todas as regras. Código-fonte .py: sem struct_* sintáticas (None é Python legítimo).
PY_FILES=()
OUT_FILES=()
for f in "${EXIST[@]}"; do
  case "$f" in
    *.py) PY_FILES+=("$f") ;;
    *) OUT_FILES+=("$f") ;;
  esac
done

run_scan() {
  local mode="$1"
  shift
  [[ $# -eq 0 ]] && return 0
  python3 -m engines.incident --mode="$mode" "$@"
}

run_scan output "${OUT_FILES[@]}" || exit $?
run_scan source "${PY_FILES[@]}" || exit $?
echo "OK incident scan (${#OUT_FILES[@]} output, ${#PY_FILES[@]} source)"
