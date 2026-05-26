#!/usr/bin/env bash
# Cria tópico DLQ e associa à subscrição principal (max 5 tentativas).
# Uso: GCP_PROJECT=projeto-codex-br DOSSIE_SUB=dossie-v1-pipeline-sub ./scripts/provision_dossie_v1_dlq.sh
set -euo pipefail

PROJECT="${GCP_PROJECT:-projeto-codex-br}"
SUB="${DOSSIE_SUB:-dossie-v1-pipeline-sub}"
DLQ_TOPIC="${DOSSIE_DLQ_TOPIC:-dossie-v1-pipeline-dlq}"

gcloud pubsub topics describe "${DLQ_TOPIC}" --project="${PROJECT}" >/dev/null 2>&1 \
  || gcloud pubsub topics create "${DLQ_TOPIC}" --project="${PROJECT}"

if gcloud pubsub subscriptions describe "${SUB}" --project="${PROJECT}" >/dev/null 2>&1; then
  gcloud pubsub subscriptions update "${SUB}" \
    --project="${PROJECT}" \
    --dead-letter-topic="projects/${PROJECT}/topics/${DLQ_TOPIC}" \
    --max-delivery-attempts=5 \
    --dead-letter-topic-project="${PROJECT}"
  echo "DLQ ligada: ${SUB} → ${DLQ_TOPIC} (project=${PROJECT})"
else
  echo "Subscrição '${SUB}' não encontrada — criar push subscription manualmente." >&2
  exit 1
fi
