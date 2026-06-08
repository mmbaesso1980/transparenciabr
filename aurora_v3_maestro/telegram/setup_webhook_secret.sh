#!/usr/bin/env bash
# =============================================================================
# MAESTRO — Setup do header secreto do webhook (X-Telegram-Bot-Api-Secret-Token)
# =============================================================================
# Fecha o buraco de segurança do /webhook: gera um token aleatorio, guarda no
# Secret Manager (lido pelo listener.py no boot) e registra o MESMO token no
# Telegram via setWebhook. A partir daí, qualquer POST sem o header correto
# recebe 401 imediato.
#
# Pre-requisitos (rode antes, UMA vez):
#   gcloud auth login
#   gcloud config set project transparenciabr
#
# Uso:
#   bash setup_webhook_secret.sh <CLOUD_RUN_URL>
#   ex.: bash setup_webhook_secret.sh https://transparenciabr-xxxxx-uc.a.run.app
#
# Idempotente: pode rodar de novo para rotacionar o token.
# =============================================================================
set -euo pipefail

PROJECT="${MAESTRO_PROJECT_MAIN:-transparenciabr}"
SECRET_NAME="${MAESTRO_WEBHOOK_SECRET_NAME:-maestro-telegram-webhook-secret}"
BOT_TOKEN_SECRET="${MAESTRO_BOT_TOKEN_SECRET:-maestro-telegram-bot-token}"
RUN_SERVICE="${MAESTRO_RUN_SERVICE:-transparenciabr}"
RUN_REGION="${MAESTRO_RUN_REGION:-us-central1}"

CLOUD_RUN_URL="${1:-}"
if [[ -z "${CLOUD_RUN_URL}" ]]; then
  echo "ERRO: informe a URL do Cloud Run. Ex.: bash setup_webhook_secret.sh https://servico-xxxx.run.app" >&2
  echo "Descubra com: gcloud run services describe ${RUN_SERVICE} --region ${RUN_REGION} --format='value(status.url)'" >&2
  exit 1
fi

echo "==> [1/5] Gerando token secreto aleatorio (1-256 chars, A-Z a-z 0-9 _ -)"
# Telegram aceita 1-256 chars do conjunto A-Za-z0-9_- ; usamos 48 bytes hex.
WEBHOOK_SECRET="$(openssl rand -hex 32)"

echo "==> [2/5] Criando/atualizando secret ${SECRET_NAME} no projeto ${PROJECT}"
if gcloud secrets describe "${SECRET_NAME}" --project "${PROJECT}" >/dev/null 2>&1; then
  printf '%s' "${WEBHOOK_SECRET}" | gcloud secrets versions add "${SECRET_NAME}" --project "${PROJECT}" --data-file=-
else
  printf '%s' "${WEBHOOK_SECRET}" | gcloud secrets create "${SECRET_NAME}" --project "${PROJECT}" --replication-policy=automatic --data-file=-
fi

echo "==> [3/5] Garantindo acesso do runtime SA do Cloud Run ao secret"
RUN_SA="$(gcloud run services describe "${RUN_SERVICE}" --region "${RUN_REGION}" --project "${PROJECT}" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [[ -z "${RUN_SA}" ]]; then
  PROJ_NUM="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
  RUN_SA="${PROJ_NUM}-compute@developer.gserviceaccount.com"
  echo "    (usando SA de compute padrao: ${RUN_SA})"
fi
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --project "${PROJECT}" \
  --member "serviceAccount:${RUN_SA}" \
  --role roles/secretmanager.secretAccessor >/dev/null

echo "==> [4/5] Lendo bot token do Secret Manager (${BOT_TOKEN_SECRET})"
BOT_TOKEN="$(gcloud secrets versions access latest --secret "${BOT_TOKEN_SECRET}" --project "${PROJECT}")"

echo "==> [5/5] Registrando webhook no Telegram com secret_token"
RESP="$(curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${CLOUD_RUN_URL%/}/webhook" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "drop_pending_updates=true")"
echo "    Telegram resp: ${RESP}"

echo ""
echo "OK. Proximos passos:"
echo "  - REDEPLOY do Cloud Run (para o listener carregar o novo secret no boot):"
echo "      gcloud run services update ${RUN_SERVICE} --region ${RUN_REGION} --project ${PROJECT} --no-traffic >/dev/null 2>&1 || true"
echo "    (ou um novo build/deploy normal)"
echo "  - Teste: um POST sem header deve retornar 401; o Telegram, com header, deve funcionar."
echo "  - Verifique: curl -s ${CLOUD_RUN_URL%/}/healthz"
