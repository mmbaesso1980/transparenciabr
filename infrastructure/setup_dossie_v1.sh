#!/bin/bash
# AURORA Forensic v1.0 — provisionamento Pub/Sub + GCS para Legião 100
# Idempotente: pode ser executado múltiplas vezes sem efeitos colaterais.
set -euo pipefail

# Firebase project (Firestore, Hosting, Functions) — não mexe
PROJECT_ID="${PROJECT_ID:-transparenciabr}"
# Compute project (Pub/Sub, Cloud Run Job, GCR) — queima crédito GenAI App Builder
COMPUTE_PROJECT="${COMPUTE_PROJECT:-projeto-codex-br}"
TOPIC="${DOSSIE_V1_TOPIC:-dossie-v1-pipeline}"
SUBSCRIPTION="${DOSSIE_V1_SUBSCRIPTION:-dossie-v1-pipeline-sub}"
BUCKET="${DOSSIE_V1_BUCKET:-datalake-tbr-clean}"
PREFIX="${DOSSIE_V1_PREFIX:-dossies_v1/}"

echo "▶ AURORA Forensic v1.0 — setup Pub/Sub + GCS (cross-project)"
echo "  firebase project = ${PROJECT_ID}    (Firestore, Hosting, Function callable)"
echo "  compute project  = ${COMPUTE_PROJECT}  (Pub/Sub, Cloud Run Job)"
echo "  topic=${TOPIC}  bucket=${BUCKET}  prefix=${PREFIX}"
echo

echo "1️⃣  Pub/Sub topic em ${COMPUTE_PROJECT}"
gcloud pubsub topics create "${TOPIC}" --project="${COMPUTE_PROJECT}" 2>/dev/null \
  && echo "   ✅ topic criado: ${TOPIC}" \
  || echo "   ↺ topic já existe: ${TOPIC}"

echo "2️⃣  Pub/Sub subscription (Cloud Run Job via Eventarc) em ${COMPUTE_PROJECT}"
gcloud pubsub subscriptions create "${SUBSCRIPTION}" \
  --topic="${TOPIC}" \
  --ack-deadline=600 \
  --message-retention-duration=1d \
  --project="${COMPUTE_PROJECT}" 2>/dev/null \
  && echo "   ✅ subscription criada: ${SUBSCRIPTION}" \
  || echo "   ↺ subscription já existe: ${SUBSCRIPTION}"

echo "3️⃣  GCS prefix ${PREFIX} em gs://${BUCKET}/"
if gsutil ls "gs://${BUCKET}/${PREFIX}" >/dev/null 2>&1; then
  echo "   ↺ prefix já existe"
else
  TMP_KEEP="$(mktemp)"
  : > "${TMP_KEEP}"
  gsutil cp "${TMP_KEEP}" "gs://${BUCKET}/${PREFIX}.keep" \
    && echo "   ✅ prefix criado (.keep marker em gs://${BUCKET}/${PREFIX})"
  rm -f "${TMP_KEEP}"
fi

echo
echo "✅ Pub/Sub + GCS prontos para AURORA Forensic v1.0"
echo "   próximo passo: bash infrastructure/deploy_aurora_forensic_v1.sh"
