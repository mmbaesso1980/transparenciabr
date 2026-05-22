#!/usr/bin/env bash
# Envia resumo AURORA v3 ao Telegram (sendMessage + sendDocument dos CSVs gerados).
# Segredos apenas por variável de ambiente — nunca commitar token.
#
# Obrigatório: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
# Opcional: GCP_PROJECT, BQ_LOCATION, OUT_DIR (dir dos leads_*.csv),
#           TOTAL_RECORDS (evita COUNT no BQ), PARTITION_RANGE (texto livre),
#           SKIP_ATTACHMENTS=1 (só mensagem)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT}"
PROJECT="${GCP_PROJECT:-transparenciabr}"
LOC="${BQ_LOCATION:-southamerica-east1}"

TOKEN="${TELEGRAM_BOT_TOKEN:?defina TELEGRAM_BOT_TOKEN}"
CHAT="${TELEGRAM_CHAT_ID:?defina TELEGRAM_CHAT_ID}"

TMPQ=""
TMPQ2=""
cleanup() { rm -f "${TMPQ:-}" "${TMPQ2:-}"; }
trap cleanup EXIT

count_csv_rows() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "0"
    return
  fi
  awk '!/^#/ { if (!hdr) { hdr = 1; next } n++ } END { print n + 0 }' "$f"
}

br_int() {
  python3 -c "n=int('''$1'''); print('{0:,}'.format(n).replace(',','.'))"
}

if [[ -n "${TOTAL_RECORDS:-}" ]]; then
  TOTAL_BR="$(br_int "$TOTAL_RECORDS")"
else
  TMPQ="$(mktemp)"
  cat >"$TMPQ" <<SQL
SELECT COUNT(*) AS c FROM \`${PROJECT}.tbr_leads_prev.indeferimentos_brasil_raw\`;
SQL
  RAW="$(bq query --use_legacy_sql=false --project_id="$PROJECT" --location="$LOC" --format=csv --quiet <"$TMPQ" | tail -n1 | tr -d '\r')"
  RAW="${RAW//,/}"
  TOTAL_BR="$(br_int "${RAW:-0}")"
fi

if [[ -n "${PARTITION_RANGE:-}" ]]; then
  PARTS="$PARTITION_RANGE"
else
  TMPQ2="$(mktemp)"
  cat >"$TMPQ2" <<SQL
SELECT
  CONCAT(
    FORMAT_DATE('%Y-%m', MIN(mes_referencia)),
    ' … ',
    FORMAT_DATE('%Y-%m', MAX(mes_referencia))
  )
FROM \`${PROJECT}.tbr_leads_prev.indeferimentos_brasil_raw\`;
SQL
  PARTS="$(bq query --use_legacy_sql=false --project_id="$PROJECT" --location="$LOC" --format=csv --quiet <"$TMPQ2" | tail -n1 | tr -d '\r'")"
  PARTS="${PARTS:-n/d}"
fi

NV="$(count_csv_rows "${OUT_DIR}/leads_vitoria.csv")"
NVAL="$(count_csv_rows "${OUT_DIR}/leads_valinhos.csv")"
NC="$(count_csv_rows "${OUT_DIR}/leads_campinas.csv")"
NB="$(count_csv_rows "${OUT_DIR}/leads_belem.csv")"

MSG=$'AURORA v3 - Carga 6M COMPLETA\n'
MSG+="Total ingestido: ${TOTAL_BR} registros"$'\n'
MSG+="Particoes: ${PARTS}"$'\n'
MSG+=$'Tabela: tbr_leads_prev.indeferimentos_brasil_raw\n'
MSG+=$'Region: southamerica-east1\n\n'
MSG+=$'Leads por cidade (anexos):\n'
MSG+="- Vitoria/ES: ${NV} leads"$'\n'
MSG+="- Valinhos/SP: ${NVAL} leads"$'\n'
MSG+="- Campinas/SP: ${NC} leads"$'\n'
MSG+="- Belem/PA: ${NB} leads"

API="https://api.telegram.org/bot${TOKEN}"

curl -sS -X POST "${API}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=${MSG}" \
  --data-urlencode "disable_web_page_preview=true" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok'), d"

if [[ "${SKIP_ATTACHMENTS:-0}" != "1" ]]; then
  for doc in leads_vitoria.csv leads_valinhos.csv leads_campinas.csv leads_belem.csv; do
    p="${OUT_DIR}/${doc}"
    if [[ -f "$p" ]]; then
      curl -sS -X POST "${API}/sendDocument" \
        -F "chat_id=${CHAT}" \
        -F "document=@${p};filename=${doc}" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok'), d"
    fi
  done
fi

echo "Telegram: mensagem (e anexos) enviados."
