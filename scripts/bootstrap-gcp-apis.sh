#!/usr/bin/env bash
set -euo pipefail
PROJECT="${PROJECT:-transparenciabr}"

APIS=(
  aiplatform.googleapis.com
  generativelanguage.googleapis.com
  documentai.googleapis.com
  bigquery.googleapis.com
  bigqueryconnection.googleapis.com
  cloudscheduler.googleapis.com
  firestore.googleapis.com
  firebase.googleapis.com
  firebasehosting.googleapis.com
  firebasestorage.googleapis.com
  secretmanager.googleapis.com
  cloudtrace.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
  run.googleapis.com
)

for api in "${APIS[@]}"; do
  echo "→ Habilitando $api"
  gcloud services enable "$api" --project="$PROJECT"
done
