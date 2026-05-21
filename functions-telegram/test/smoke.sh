#!/usr/bin/env bash
# Smoke checks pós-deploy (requer gcloud autenticado e APIs habilitadas).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-transparenciabr}"
REGION="${REGION:-us-east1}"

TOKEN="$(gcloud secrets versions access latest --secret=TELEGRAM_BOT_TOKEN --project="$PROJECT_ID")"
WEBHOOK="$(gcloud functions describe telegramWebhook --region="$REGION" --gen2 --project="$PROJECT_ID" --format='value(serviceConfig.uri)' || true)"

echo "=== Webhook URL ==="
echo "${WEBHOOK:-<não encontrado — ajuste REGION ou nome da function>}"
echo ""
echo "=== getWebhookInfo ==="
curl -sS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | (command -v jq >/dev/null && jq . || cat)

echo ""
echo "=== Últimos logs (telegramWebhook) ==="
gcloud functions logs read telegramWebhook --region="$REGION" --gen2 --limit=30 --project="$PROJECT_ID" || true

echo ""
echo "=== Eventos de audit hoje (BigQuery) ==="
bq query --use_legacy_sql=false --project_id="$PROJECT_ID" \
  "SELECT COUNT(*) AS eventos_hoje FROM \`transparenciabr.tbr_leads_prev.leads_enriquecidos_log\`
   WHERE DATE(timestamp, 'America/Sao_Paulo') = CURRENT_DATE('America/Sao_Paulo')" || true
