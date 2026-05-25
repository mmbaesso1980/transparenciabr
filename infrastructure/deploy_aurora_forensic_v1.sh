#!/bin/bash
# AURORA Forensic v1.0 — deploy completo (Legião 100 integrada)
# Frontend → Cloud Function iniciarDossieV1 → Pub/Sub → Cloud Run Job → PDF em GCS
set -euo pipefail

# transparenciabr → Firestore, Hosting, Cloud Function callable (Firebase locked)
PROJECT_ID="${PROJECT_ID:-transparenciabr}"
# projeto-codex-br → compute + Vertex (queima crédito GenAI App Builder R$ 5.677,28 → expira 03/05/2027)
COMPUTE_PROJECT="${COMPUTE_PROJECT:-projeto-codex-br}"
VERTEX_PROJECT="${VERTEX_PROJECT:-projeto-codex-br}"
REGION_BR="${REGION_BR:-southamerica-east1}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-queima-vertex@projeto-codex-br.iam.gserviceaccount.com}"
TOPIC="${DOSSIE_V1_TOPIC:-dossie-v1-pipeline}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
# Imagem do Cloud Run Job vai para Artifact Registry do COMPUTE_PROJECT (codex-br)
IMAGE="gcr.io/${COMPUTE_PROJECT}/dossie-v1-pipeline:${IMAGE_TAG}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "▶ AURORA Forensic v1.0 — deploy (cross-project billing optimization)"
echo "  root=${ROOT}"
echo "  firebase project = ${PROJECT_ID}    (Hosting, Functions, Firestore)"
echo "  compute project  = ${COMPUTE_PROJECT}  (Cloud Run Job, Pub/Sub, Vertex AI)"
echo "  region=${REGION_BR}  sa=${SERVICE_ACCOUNT}"
echo

echo "📦 1/4 · Frontend (build + Firebase Hosting)"
cd "${ROOT}/frontend"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm build
else
  npm install
  npm run build
fi
cd "${ROOT}"
firebase deploy --only hosting --project "${PROJECT_ID}"

echo
echo "☁️  2/4 · Cloud Function iniciarDossieV1 (não toca outras functions)"
cd "${ROOT}"
firebase deploy --only functions:iniciarDossieV1 --project "${PROJECT_ID}"

echo
echo "🚢 3/4 · Cloud Run Job dossie-v1-pipeline (em ${COMPUTE_PROJECT} para queimar crédito GenAI)"
cd "${ROOT}/cloudrun/dossieV1Pipeline"
gcloud builds submit \
  --tag "${IMAGE}" \
  --project="${COMPUTE_PROJECT}"
gcloud run jobs deploy dossie-v1-pipeline \
  --image "${IMAGE}" \
  --region "${REGION_BR}" \
  --memory 2Gi \
  --cpu 2 \
  --task-timeout 30m \
  --max-retries 1 \
  --service-account "${SERVICE_ACCOUNT}" \
  --set-env-vars="BQ_PROJECT_ID=${PROJECT_ID},VERTEX_PROJECT_ID=${VERTEX_PROJECT},DOSSIE_V1_TOPIC=${TOPIC},DOSSIE_V1_BUCKET=datalake-tbr-clean,GEMINI_MODEL_FAST=gemini-2.5-flash,GEMINI_MODEL_PRO=gemini-2.5-pro,MANUS_INTERNET_TOOLS=true" \
  --project "${COMPUTE_PROJECT}"

echo
echo "📡 4/4 · Eventarc trigger Pub/Sub → Cloud Run Job (mesmo projeto = ${COMPUTE_PROJECT})"
gcloud eventarc triggers create dossie-v1-pipeline-trigger \
  --location="${REGION_BR}" \
  --destination-run-job=dossie-v1-pipeline \
  --destination-run-region="${REGION_BR}" \
  --event-filters="type=google.cloud.pubsub.topic.v1.messagePublished" \
  --event-filters="topic=projects/${COMPUTE_PROJECT}/topics/${TOPIC}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --project="${COMPUTE_PROJECT}" 2>/dev/null \
  && echo "   ✅ trigger criado" \
  || echo "   ↺ trigger já existe"

echo
echo "✅ AURORA Forensic v1.0 deployed!"
echo "   Frontend:        https://${PROJECT_ID}.web.app/escritorio"
echo "   Cloud Function:  https://${REGION_BR}-${PROJECT_ID}.cloudfunctions.net/iniciarDossieV1  (em ${PROJECT_ID})"
echo "   Pipeline:        gcloud run jobs executions list --job=dossie-v1-pipeline --region=${REGION_BR} --project=${COMPUTE_PROJECT}"
echo "   Firestore live:  collection dossies_v1/{slug} em ${PROJECT_ID}"
echo "   Billing:         Compute em ${COMPUTE_PROJECT} (R\$ 5.677,28 crédito GenAI até 03/05/2027)"
