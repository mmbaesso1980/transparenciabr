#!/usr/bin/env bash
# Provisiona segredos (sem valores padrão sensíveis), tópico Pub/Sub, SQL BigQuery e deploy das functions.
# Uso: export TELEGRAM_BOT_TOKEN=... ; export COMANDANTE_CHAT_ID=... ; ./deploy-telegram-bot.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-transparenciabr}"
REGION="${REGION:-us-east1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "Defina TELEGRAM_BOT_TOKEN (nunca commite este valor)." >&2
  exit 1
fi
if [[ -z "${COMANDANTE_CHAT_ID:-}" ]]; then
  echo "Defina COMANDANTE_CHAT_ID (whitelist de chat_id autorizados)." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"

WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-$(openssl rand -hex 32)}"

echo "Habilitando APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

echo "Pub/Sub topic lead-pipeline-jobs"
gcloud pubsub topics create lead-pipeline-jobs --project="$PROJECT_ID" 2>/dev/null || echo "  (já existe)"

echo "Bucket gs://transparenciabr-leads"
gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://transparenciabr-leads" 2>/dev/null || echo "  (já existe)"

create_or_update_secret() {
  local NAME="$1"
  local VALUE="$2"
  if gcloud secrets describe "$NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$VALUE" | gcloud secrets versions add "$NAME" --data-file=- --project="$PROJECT_ID"
  else
    printf '%s' "$VALUE" | gcloud secrets create "$NAME" --data-file=- --project="$PROJECT_ID" --replication-policy="automatic"
  fi
}

echo "Secret Manager (tokens via stdin/env — sem defaults no repositório)"
create_or_update_secret TELEGRAM_BOT_TOKEN "$TELEGRAM_BOT_TOKEN"
create_or_update_secret TELEGRAM_WEBHOOK_SECRET "$WEBHOOK_SECRET"
create_or_update_secret ALLOWED_CHAT_IDS "$COMANDANTE_CHAT_ID"

if [[ -n "${SHODAN_API_KEY:-}" ]]; then
  create_or_update_secret SHODAN_API_KEY "$SHODAN_API_KEY"
fi

for S in BIGDATA_TOKEN_ID BIGDATA_ACCESS_TOKEN CPFCNPJ_TOKEN TRUECALLER_INSTALLATION_ID GOOGLE_CSE_ID GOOGLE_CSE_KEY; do
  if ! gcloud secrets describe "$S" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "PLACEHOLDER_RECONFIGURE" | gcloud secrets create "$S" --data-file=- --project="$PROJECT_ID" --replication-policy="automatic" || true
    echo "  ⚠️  $S criado com placeholder"
  fi
done

echo "Dataset BigQuery tbr_leads_prev (US — alinhado ao padrão multi-região do prompt)"
bq mk --dataset --location=US "$PROJECT_ID:tbr_leads_prev" 2>/dev/null || echo "  (dataset existe)"

echo "Aplicando DDL (view + tabelas) — requer indeferimentos_brasil_raw para a view"
bq query --use_legacy_sql=false --project_id="$PROJECT_ID" <"$REPO_ROOT/functions-telegram/sql/bq_tbr_leads_prev.sql"

echo "Instala dependências e faz deploy (raiz do repositório)"
cd "$REPO_ROOT"
npm install --prefix functions-telegram
firebase deploy --only "functions:telegram-bot:telegramWebhook,functions:telegram-bot:pipelineWorker" --project="$PROJECT_ID"

WEBHOOK_URL="$(gcloud functions describe telegramWebhook --region="$REGION" --gen2 --project="$PROJECT_ID" --format='value(serviceConfig.uri)' || true)"

if [[ -n "$WEBHOOK_URL" ]]; then
  echo "Registrando webhook Telegram..."
  WH_BODY="$(python3 -c 'import json,sys; print(json.dumps({"url":sys.argv[1],"secret_token":sys.argv[2],"allowed_updates":["message"]}))' "$WEBHOOK_URL" "$WEBHOOK_SECRET")"
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "$WH_BODY"
  echo ""
fi

echo "Publicar job bootstrap (150 leads) — opcional"
if [[ "${BOOTSTRAP_150:-}" == "1" ]]; then
  export _TBR_BOOT_CID="$COMANDANTE_CHAT_ID"
  export _TBR_BOOT_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  BOOT_MSG="$(python3 <<'PY'
import json, os
print(json.dumps({
  "job_id": "bootstrap-150",
  "comando": "/report",
  "args": {"municipios": ["Valinhos", "Vitória", "Belém"], "limite_por_municipio": 50, "categorias": "all"},
  "chat_id": os.environ["_TBR_BOOT_CID"],
  "oab": "BOOTSTRAP",
  "timestamp": os.environ["_TBR_BOOT_TS"],
}))
PY
)"
  gcloud pubsub topics publish lead-pipeline-jobs --project="$PROJECT_ID" --message="$BOOT_MSG"
fi

echo ""
echo "Concluído. Valide com: bash functions-telegram/test/smoke.sh"
echo "Rotacione qualquer token exposto em documentos locais e use apenas Secret Manager em produção."
