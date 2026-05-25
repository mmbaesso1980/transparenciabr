#!/bin/bash
# AURORA Forensic v1.0 — deploy completo (Legião 100 integrada)
# Frontend → Cloud Function iniciarDossieV1 → Pub/Sub → Cloud Run Job → PDF em GCS
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-transparenciabr}"
VERTEX_PROJECT="${VERTEX_PROJECT:-projeto-codex-br}"
REGION_BR="${REGION_BR:-southamerica-east1}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-queima-vertex@projeto-codex-br.iam.gserviceaccount.com}"
TOPIC="${DOSSIE_V1_TOPIC:-dossie-v1-pipeline}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="gcr.io/${PROJECT_ID}/dossie-v1-pipeline:${IMAGE_TAG}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "▶ AURORA Forensic v1.0 — deploy"
echo "  root=${ROOT}"
echo "  project=${PROJECT_ID}  region=${REGION_BR}  sa=${SERVICE_ACCOUNT}"
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
echo "🚢 3/4 · Cloud Run Job dossie-v1-pipeline"
cd "${ROOT}/cloudrun/dossieV1Pipeline"
gcloud builds submit \
  --tag "${IMAGE}" \
  --project="${PROJECT_ID}"
gcloud run jobs deploy dossie-v1-pipeline \
  --image "${IMAGE}" \
  --region "${REGION_BR}" \
  --memory 2Gi \
  --cpu 2 \
  --task-timeout 30m \
  --max-retries 1 \
  --service-account "${SERVICE_ACCOUNT}" \
  --project "${PROJECT_ID}"

echo
echo "📡 4/4 · Eventarc trigger Pub/Sub → Cloud Run Job"
gcloud eventarc triggers create dossie-v1-pipeline-trigger \
  --location="${REGION_BR}" \
  --destination-run-job=dossie-v1-pipeline \
  --destination-run-region="${REGION_BR}" \
  --event-filters="type=google.cloud.pubsub.topic.v1.messagePublished" \
  --event-filters="topic=projects/${PROJECT_ID}/topics/${TOPIC}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" 2>/dev/null \
  && echo "   ✅ trigger criado" \
  || echo "   ↺ trigger já existe"

echo
echo "✅ AURORA Forensic v1.0 deployed!"
echo "   Frontend: https://${PROJECT_ID}.web.app/escritorio"
echo "   Pipeline: gcloud run jobs executions list --job=dossie-v1-pipeline --region=${REGION_BR} --project=${PROJECT_ID}"
echo "   Firestore live: collection dossies_v1/{slug}"
