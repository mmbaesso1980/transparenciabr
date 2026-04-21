#!/usr/bin/env bash
#
# Guia de deploy — Artifact Registry + Cloud Run Job + Cloud Scheduler
# Projeto: transparenciabr · Região sugerida: southamerica-east1
#
# Pré-requisitos: gcloud instalado e autenticado; APIs:
#   artifactregistry.googleapis.com run.googleapis.com cloudscheduler.googleapis.com
#
# Descomente e adapte PROJECT_ID / REPO_NAME conforme o seu GCP.

set -euo pipefail

# PROJECT_ID="${PROJECT_ID:-transparenciabr}"
# REGION="${REGION:-southamerica-east1}"
# AR_REPO="${AR_REPO:-asmodeus}"
# IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/engines-night:latest"

# --- 1) Artifact Registry (uma vez por projeto/repo) ---
# gcloud artifacts repositories create "${AR_REPO}" \
#   --repository-format=docker \
#   --location="${REGION}" \
#   --description="Imagens dos engines A.S.M.O.D.E.U.S."

# --- 2) Build & push da imagem (executar na raiz do repositório) ---
# docker build -f engines/Dockerfile -t "${IMAGE}" .
# gcloud auth configure-docker "${REGION}-docker.pkg.dev"
# docker push "${IMAGE}"

# --- 3) Cloud Run Job (execução batch; substitua o comando pelo motor desejado) ---
# gcloud run jobs create asmodeus-night-shift \
#   --image="${IMAGE}" \
#   --region="${REGION}" \
#   --project="${PROJECT_ID}" \
#   --tasks=1 \
#   --max-retries=1 \
#   --task-timeout=3600 \
#   --set-env-vars="GCP_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
#   --execute-now=false \
#   --command=python \
#   --args="engines/05_sync_bodes.py","--dry-run"
#
# Atualização da imagem:
# gcloud run jobs update asmodeus-night-shift --image="${IMAGE}" --region="${REGION}"

# --- 4) Cloud Scheduler — disparar o Job todos os dias às 03:00 America/Sao_Paulo ---
# SCHEDULER_SA="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
#
# gcloud scheduler jobs create http asmodeus-night-shift-trigger \
#   --location="${REGION}" \
#   --schedule="0 3 * * *" \
#   --time-zone="America/Sao_Paulo" \
#   --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/asmodeus-night-shift:run" \
#   --http-method=POST \
#   --oauth-service-account-email="${SCHEDULER_SA}"
#
# Nota: URI exata da API Run Jobs pode variar; prefira también:
#   gcloud run jobs execute asmodeus-night-shift --region="${REGION}" --wait
# agendado via Scheduler com OAuth para a API Cloud Run Admin.

echo "Este ficheiro é um guia — descomente e preencha PROJECT_ID, região e comando do motor."
