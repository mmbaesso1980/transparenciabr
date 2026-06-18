#!/bin/bash
set -e

SERVICE_NAME="pdf-renderer"
REGION="southamerica-east1"
PROJECT_ID="projeto-codex-br"
GCS_BUCKET_NAME="transparenciabr-dossies"

echo "Submitting build using the repository root as context..."
# This command must be run from the root of the repository.
gcloud builds submit . --tag "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" --project="${PROJECT_ID}" --dockerfile="services/pdf_renderer/Dockerfile"

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" \
  --platform "managed" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --set-env-vars "GCS_BUCKET=${GCS_BUCKET_NAME}" \
  --service-account "maestro-worker@projeto-codex-br.iam.gserviceaccount.com" \
  --allow-unauthenticated

echo " "
echo "---- DEPLOYMENT COMPLETE ----"
URL=$(gcloud run services describe "${SERVICE_NAME}" --platform "managed" --region "${REGION}" --project "${PROJECT_ID}" --format 'value(status.url)')
echo "Service URL: ${URL}"
