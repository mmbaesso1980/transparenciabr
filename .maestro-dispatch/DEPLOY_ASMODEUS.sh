#!/usr/bin/env bash
# Ocean Ways — Deploy Standalone via GCS (sem precisar git clone)
# Asmodeus roda este script na VM aurora-cacador-br
# Bundle origem: gs://transparenciabr-deploy/oceanways/oceanways_bundle.tar.gz

set -euo pipefail

PROJECT="projeto-codex-br"
REGION="us-east1"
REPO="oceanways"
SERVICE="oceanways-api"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api:r1-stripe-$(date +%Y%m%d-%H%M)"
BUCKET="transparenciabr-deploy"
BUNDLE_URL="https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/.maestro-dispatch/oceanways_bundle.tar.gz"
WORKDIR="/tmp/oceanways_deploy_$(date +%s)"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# === FASE 0: download bundle do GCS ===
log "FASE 0 — baixando bundle do GCS"
mkdir -p "${WORKDIR}"
cd "${WORKDIR}"
curl -fsSL -o oceanways_bundle.tar.gz "${BUNDLE_URL}"
tar -xzf oceanways_bundle.tar.gz
ls oceanways/

# === FASE 1: garantir Artifact Registry ===
log "FASE 1 — Artifact Registry"
gcloud artifacts repositories describe "${REPO}" \
    --location="${REGION}" --project="${PROJECT}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --description="Ocean Ways production images"

# === FASE 2: build via Cloud Build (sem precisar Docker local) ===
log "FASE 2 — Cloud Build"
cd "${WORKDIR}/oceanways"
gcloud builds submit \
    --tag="${IMAGE_TAG}" \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --timeout=20m \
    -f backend/Dockerfile \
    . || {
    # fallback se -f não suportado nessa versão
    cp backend/Dockerfile ./Dockerfile
    gcloud builds submit \
        --tag="${IMAGE_TAG}" \
        --project="${PROJECT}" \
        --region="${REGION}" \
        --timeout=20m \
        .
}

# === FASE 3: garantir secrets Stripe disponíveis no Secret Manager do projeto-codex-br ===
log "FASE 3 — verificando secrets Stripe"
for SEC in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
    if ! gcloud secrets describe "${SEC}" --project="${PROJECT}" >/dev/null 2>&1; then
        log "AVISO: secret ${SEC} não existe em ${PROJECT}. Criando placeholder vazio (modo mock será ativado)."
        echo -n "PLACEHOLDER_$(date +%s)" | gcloud secrets create "${SEC}" \
            --data-file=- --project="${PROJECT}" \
            --replication-policy=automatic
    fi
done

# === FASE 4: deploy Cloud Run ===
log "FASE 4 — gcloud run deploy"
gcloud run deploy "${SERVICE}" \
    --image="${IMAGE_TAG}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=3 \
    --port=8080 \
    --set-env-vars="FEATURE_FLAG_FLIGHT_API=mock,STRIPE_MODE=live,FIREBASE_PROJECT=transparenciabr,PYTHONUNBUFFERED=1" \
    --set-secrets="STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest"

# === FASE 5: validação ===
URL=$(gcloud run services describe "${SERVICE}" \
    --region="${REGION}" --project="${PROJECT}" \
    --format='value(status.url)')

log "URL publica: ${URL}"
log "=== validação /healthz ==="
curl -fsS "${URL}/healthz" | head -5 || log "WARN: /healthz falhou"
log "=== validação /api/v1/payments/products ==="
curl -fsS "${URL}/api/v1/payments/products" | head -5 || log "WARN: products falhou"

echo ""
echo "============================================================"
echo "OCEAN WAYS LIVE"
echo "URL: ${URL}"
echo "Imagem: ${IMAGE_TAG}"
echo "============================================================"
