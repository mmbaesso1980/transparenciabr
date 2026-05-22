#!/usr/bin/env bash
# Carga real INSS indeferidos → BigQuery (dados.gov.br via engines/26).
# Requer: Python 3 + pandas, openpyxl, google-cloud-bigquery, requests
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export GCP_PROJECT="${GCP_PROJECT:-transparenciabr}"
export BQ_LOCATION="${BQ_LOCATION:-southamerica-east1}"

START="${START:-2024-01}"
END="${END:-2026-05}"
EXTRA=()
if [[ "${TRUNCATE:-0}" == "1" ]]; then
  EXTRA+=(--truncate-all)
fi
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  EXTRA+=(--dry-run)
fi

echo "AURORA: a usar projeto=${GCP_PROJECT} location=${BQ_LOCATION}"
echo "Intervalo: ${START} … ${END}"

exec python3 "${ROOT}/engines/26_inss_indeferimentos_bq_load.py" \
  --project "${GCP_PROJECT}" \
  --start "${START}" \
  --end "${END}" \
  "${EXTRA[@]:-}"
