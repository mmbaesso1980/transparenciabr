#!/usr/bin/env bash
# Gera os 4 CSVs de triagem por cidade (Vitória/ES, Valinhos/SP, Campinas/SP, Belém/PA).
# Requer: gcloud auth + bq CLI. Região: BQ_LOCATION (default southamerica-east1).
# Uso: OUT_DIR=. ./scripts/export_leads_cidades.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT}"

mkdir -p "$OUT_DIR"

run_one() {
  local slug="$1" uf="$2" file="$3"
  echo "AURORA: export ${slug}/${uf} → ${file}"
  "${ROOT}/scripts/leads_por_cidade.sh" "$slug" "$uf" "${OUT_DIR}/${file}"
}

run_one vitoria ES leads_vitoria.csv
run_one valinhos SP leads_valinhos.csv
run_one campinas SP leads_campinas.csv
run_one belem PA leads_belem.csv

echo "Concluído. Ficheiros em: ${OUT_DIR}/leads_*.csv"
