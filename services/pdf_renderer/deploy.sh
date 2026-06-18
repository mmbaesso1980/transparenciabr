#!/bin/bash

set -e

SERVICE_NAME="pdf-renderer"
REGION="southamerica-east1"
# Deploying on the project with credits and run capabilities
PROJECT_ID="projeto-codex-br"
GCS_BUCKET_NAME="transparenciabr-dossies"

echo "Building the Docker image..."
# The command must be run from the root of the repository
# The Dockerfile is in a subdirectory, so we specify the path to it.
gcloud builds submit . --config=services/pdf_renderer/cloudbuild.yaml --project="${PROJECT_ID}"

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest" \
  --platform "managed" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --set-env-vars "GCS_BUCKET=${GCS_BUCKET_NAME}" \
  --allow-unauthenticated

echo " "
echo "---- DEPLOYMENT COMPLETE ----"
URL=$(gcloud run services describe "${SERVICE_NAME}" --platform "managed" --region "${REGION}" --project "${PROJECT_ID}" --format 'value(status.url)')
echo "Service URL: ${URL}"
