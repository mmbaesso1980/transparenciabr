#!/usr/bin/env bash
# Piloto 200 leads — executar na VM aurora-cacador-br (projeto transparenciabr, sa-east1).
# Não imprime segredos (DD_TOKEN, TG_TOKEN, BIGDATA_TOKEN).
#
# Variáveis esperadas (exemplo — valores reais só na VM, nunca no Git):
#   export DD_TOKEN="…"
#   export TG_TOKEN="…"
#   export TG_CHAT="…"
#   export GCP_PROJECT="transparenciabr"
#   export BQ_LOCATION="southamerica-east1"
# Opcional enriquecimento BigData (contrato em functions/src/leads/adapters/bigDataAdapter.js):
#   export BIGDATA_TOKEN="…"
#   export BIGDATA_TOKEN_ID="…"
# Opcional DirectData (URL completa + corpo — fora do repo até documentação oficial):
#   export DD_CPF_URL="https://…"
#   export DD_CPF_BODY_JSON='{"…":…}'
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export GCP_PROJECT="${GCP_PROJECT:-transparenciabr}"
export BQ_LOCATION="${BQ_LOCATION:-southamerica-east1}"
export PILOTO_OUT="${PILOTO_OUT:-/tmp/piloto_200_FINAL.csv}"
export PILOTO_SUMMARY="${PILOTO_SUMMARY:-/tmp/piloto_200_summary.json}"

command -v bq >/dev/null 2>&1 || { echo "bq CLI ausente — instalar Google Cloud SDK." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 ausente." >&2; exit 1; }

echo "AURORA piloto_200: projeto=${GCP_PROJECT} location=${BQ_LOCATION}"
python3 "${ROOT}/scripts/piloto_200_worker.py"
EC_PY=$?
if [[ "$EC_PY" -ne 0 ]]; then
  echo "Worker Python falhou (exit $EC_PY)." >&2
  exit "$EC_PY"
fi

TS="$(date +%Y%m%d_%H%M)"
DEST="gs://tbr-leads-staging/piloto_200/piloto_200_FINAL_${TS}.csv"
GCS_OK=0
if command -v gsutil >/dev/null 2>&1; then
  set +e
  gsutil cp "${PILOTO_OUT}" "${DEST}"
  GCS_EC=$?
  set -e
  if [[ "$GCS_EC" -eq 0 ]]; then
    GCS_OK=1
    echo "Upload OK: ${DEST}"
  else
    echo "gsutil falhou (exit ${GCS_EC}) — CSV local mantido em ${PILOTO_OUT}." >&2
  fi
else
  echo "gsutil ausente — não foi possível subir para GCS." >&2
fi

if [[ "$GCS_OK" -eq 1 ]]; then
  export PILOTO_GCS_DEST="${DEST}"
else
  export PILOTO_GCS_DEST="(upload GCS falhou ou gsutil ausente — ver /tmp/piloto_200_FINAL.csv na VM)"
fi

if [[ -n "${TG_TOKEN:-}" && -n "${TG_CHAT:-}" ]]; then
  MSG="$(python3 <<'PY'
import json, os
path = os.environ.get("PILOTO_SUMMARY", "/tmp/piloto_200_summary.json")
with open(path, "r", encoding="utf-8") as f:
    d = json.load(f)
dest = os.environ.get("PILOTO_GCS_DEST", "(upload falhou ou gsutil ausente)")
lines = [
    "PILOTO 200 — AURORA (TransparênciaBR)",
    f"Total linhas CSV: {d.get('total')}",
    f"Por cidade: {json.dumps(d.get('por_cidade'), ensure_ascii=False)}",
    f"GCS: {dest}",
    "Console: https://console.cloud.google.com/storage/browser/tbr-leads-staging/piloto_200",
]
print("\n".join(lines))
PY
)"
  URL="https://api.telegram.org/bot${TG_TOKEN}/sendMessage"
  set +e
  curl -sS -X POST "$URL" --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=${MSG}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); assert r.get('ok'), r" 2>/dev/null || echo "Telegram: falha ao enviar (ver token/chat)." >&2
  set -e
else
  echo "TG_TOKEN/TG_CHAT ausentes — resumo Telegram não enviado." >&2
fi

echo "Concluído. CSV: ${PILOTO_OUT}"
exit 0
