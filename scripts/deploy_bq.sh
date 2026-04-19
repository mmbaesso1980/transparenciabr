#!/usr/bin/env bash
# Deploy ordenado DDL/views BigQuery (dataset transparenciabr).
set -euo pipefail
PROJECT_ID="${GCP_PROJECT:-${GOOGLE_CLOUD_PROJECT:-${GCLOUD_PROJECT:-}}}"
if [[ -z "${PROJECT_ID}" ]]; then
  echo "Erro: defina GCP_PROJECT ou GOOGLE_CLOUD_PROJECT." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_DIR="${ROOT}/sql"

run_sql() {
  local f="$1"
  echo ">>> ${f}"
  bq query --project_id="${PROJECT_ID}" --use_legacy_sql=false < "${SQL_DIR}/${f}"
}

echo "Projeto: ${PROJECT_ID}"
bq mk --project_id="${PROJECT_ID}" --dataset --location=US transparenciabr 2>/dev/null || true

run_sql "ddl_transparenciabr_core.sql"
run_sql "ddl_ceap_geo_extension.sql"
run_sql "vw_ceap_zscore_roll.sql"
run_sql "benford_audit.sql"
run_sql "vw_alertas_bodes_export.sql"
run_sql "vw_correlacao_gastos_idh.sql"
run_sql "ml_ceap_anomalies_detect.sql"

echo "Deploy SQL concluído."
