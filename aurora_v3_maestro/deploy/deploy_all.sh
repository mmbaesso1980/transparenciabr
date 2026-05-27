#!/usr/bin/env bash
# =============================================================================
# MAESTRO v1.0 — Script de deploy completo
# =============================================================================
# Cria infra GCP, deploya o worker em Cloud Run (projeto-codex-br) e instala o
# listener systemd na VM aurora-cacador-br. Idempotente — pode rodar várias
# vezes; só cria recurso se não existir.
#
# Rodar no Cloud Shell autenticado como Comandante OPERADOR:
#   bash deploy_all.sh
#
# Variáveis sobrescrevíveis:
#   PROJECT_MAIN=transparenciabr
#   PROJECT_VERTEX=projeto-codex-br
#   REGION=us-east1
#   VM_NAME=aurora-cacador-br
#   VM_ZONE=southamerica-east1-a
# =============================================================================
set -euo pipefail

PROJECT_MAIN="${PROJECT_MAIN:-transparenciabr}"
PROJECT_VERTEX="${PROJECT_VERTEX:-projeto-codex-br}"
REGION="${REGION:-us-east1}"
VM_NAME="${VM_NAME:-aurora-cacador-br}"
VM_ZONE="${VM_ZONE:-southamerica-east1-a}"
TOPIC="maestro-commands"
SUB="maestro-commands-sub"
SERVICE_NAME="maestro-worker"

SA_WORKER="maestro-worker@${PROJECT_VERTEX}.iam.gserviceaccount.com"
SA_LISTENER="maestro-listener@${PROJECT_MAIN}.iam.gserviceaccount.com"

echo "=== MAESTRO v1.0 deploy ==="
echo "PROJECT_MAIN   = ${PROJECT_MAIN}"
echo "PROJECT_VERTEX = ${PROJECT_VERTEX}"
echo "REGION         = ${REGION}"
echo "VM             = ${VM_NAME} (${VM_ZONE})"
echo

# -----------------------------------------------------------------------------
# 1) APIs habilitadas
# -----------------------------------------------------------------------------
echo "[1/9] Habilitando APIs..."
for p in "${PROJECT_MAIN}" "${PROJECT_VERTEX}"; do
  gcloud services enable \
    aiplatform.googleapis.com \
    firestore.googleapis.com \
    pubsub.googleapis.com \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    iam.googleapis.com \
    --project="${p}" --quiet
done

# -----------------------------------------------------------------------------
# 2) Service accounts
# -----------------------------------------------------------------------------
echo "[2/9] Criando service accounts..."
gcloud iam service-accounts create maestro-worker \
  --project="${PROJECT_VERTEX}" \
  --display-name="MAESTRO Worker (Cloud Run + Vertex)" 2>/dev/null || true

gcloud iam service-accounts create maestro-listener \
  --project="${PROJECT_MAIN}" \
  --display-name="MAESTRO Telegram Listener (VM)" 2>/dev/null || true

# -----------------------------------------------------------------------------
# 3) IAM — worker em projeto-codex-br
# -----------------------------------------------------------------------------
echo "[3/9] IAM worker..."
for role in \
    roles/aiplatform.user \
    roles/pubsub.subscriber \
    roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT_VERTEX}" \
    --member="serviceAccount:${SA_WORKER}" --role="${role}" --condition=None --quiet >/dev/null
done

# Worker também acessa Firestore + Secret Manager em transparenciabr
for role in \
    roles/datastore.user \
    roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT_MAIN}" \
    --member="serviceAccount:${SA_WORKER}" --role="${role}" --condition=None --quiet >/dev/null
done

# -----------------------------------------------------------------------------
# 4) IAM — listener na VM
# -----------------------------------------------------------------------------
echo "[4/9] IAM listener..."
for role in \
    roles/datastore.user \
    roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT_MAIN}" \
    --member="serviceAccount:${SA_LISTENER}" --role="${role}" --condition=None --quiet >/dev/null
done
gcloud projects add-iam-policy-binding "${PROJECT_VERTEX}" \
  --member="serviceAccount:${SA_LISTENER}" --role="roles/pubsub.publisher" --condition=None --quiet >/dev/null

# -----------------------------------------------------------------------------
# 5) Pub/Sub
# -----------------------------------------------------------------------------
echo "[5/9] Pub/Sub..."
gcloud pubsub topics create "${TOPIC}" --project="${PROJECT_VERTEX}" 2>/dev/null || true
gcloud pubsub subscriptions create "${SUB}" \
  --project="${PROJECT_VERTEX}" \
  --topic="${TOPIC}" \
  --ack-deadline=600 \
  --message-retention-duration=1d 2>/dev/null || true

# -----------------------------------------------------------------------------
# 6) Secrets (precisa ser feito UMA VEZ manualmente)
# -----------------------------------------------------------------------------
echo "[6/9] Verificando secrets..."
for secret in maestro-github-pat maestro-telegram-bot-token maestro-directdata-token; do
  if ! gcloud secrets describe "${secret}" --project="${PROJECT_MAIN}" >/dev/null 2>&1; then
    echo "  ⚠️  Secret '${secret}' ainda não existe em ${PROJECT_MAIN}."
    echo "      Crie manualmente com:"
    echo "        echo -n '<VALOR>' | gcloud secrets create ${secret} --project=${PROJECT_MAIN} --data-file=-"
  else
    echo "  ✓ ${secret}"
  fi
done

# -----------------------------------------------------------------------------
# 7) Build + Deploy do worker (Cloud Run)
# -----------------------------------------------------------------------------
echo "[7/9] Build do worker (Cloud Build)..."
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)/worker"
cp ../prompts/SYSTEM_PROMPT_v1.0.md "${WORKER_DIR}/SYSTEM_PROMPT_v1.0.md"

cd "${WORKER_DIR}"
IMAGE="gcr.io/${PROJECT_VERTEX}/${SERVICE_NAME}:v1.0.0"
gcloud builds submit . \
  --project="${PROJECT_VERTEX}" \
  --tag="${IMAGE}" \
  --quiet

echo "    Deploy Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_VERTEX}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${SA_WORKER}" \
  --no-allow-unauthenticated \
  --min-instances=1 \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=3600 \
  --set-env-vars="MAESTRO_PROJECT_MAIN=${PROJECT_MAIN},MAESTRO_PROJECT_VERTEX=${PROJECT_VERTEX},MAESTRO_REGION=${REGION},MAESTRO_SUB=${SUB},MAESTRO_MODEL=gemini-2.5-pro,MAESTRO_TEMP=0.1" \
  --quiet

# -----------------------------------------------------------------------------
# 8) Listener na VM
# -----------------------------------------------------------------------------
echo "[8/9] Instalando listener na VM ${VM_NAME}..."
LISTENER_DIR="$(cd "$(dirname "$0")/.." && pwd)/telegram"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

# Bundle local
TMP_BUNDLE="/tmp/maestro-listener-bundle.tar.gz"
tar -czf "${TMP_BUNDLE}" \
  -C "${LISTENER_DIR}" listener.py requirements.txt \
  -C "${DEPLOY_DIR}" maestro-listener.service

# Sobe via gcloud scp (IAP)
gcloud compute scp "${TMP_BUNDLE}" "${VM_NAME}":/tmp/maestro-listener-bundle.tar.gz \
  --zone="${VM_ZONE}" \
  --project="${PROJECT_MAIN}" \
  --tunnel-through-iap

# Instala (uso de PID file pra evitar pkill-armadilha — corpus 05)
gcloud compute ssh "${VM_NAME}" \
  --zone="${VM_ZONE}" \
  --project="${PROJECT_MAIN}" \
  --tunnel-through-iap \
  --command='
set -e
sudo mkdir -p /opt/maestro /var/lib/maestro
sudo tar -xzf /tmp/maestro-listener-bundle.tar.gz -C /tmp/maestro-listener-unpack || true
sudo mkdir -p /tmp/maestro-listener-unpack
sudo tar -xzf /tmp/maestro-listener-bundle.tar.gz -C /tmp/maestro-listener-unpack
sudo cp /tmp/maestro-listener-unpack/listener.py /opt/maestro/listener.py
sudo cp /tmp/maestro-listener-unpack/requirements.txt /opt/maestro/requirements.txt
sudo cp /tmp/maestro-listener-unpack/maestro-listener.service /etc/systemd/system/maestro-listener.service

if ! id maestro >/dev/null 2>&1; then
  sudo useradd -r -s /usr/sbin/nologin -d /opt/maestro maestro
fi
sudo chown -R maestro:maestro /opt/maestro /var/lib/maestro

if [ ! -d /opt/maestro/venv ]; then
  sudo -u maestro python3 -m venv /opt/maestro/venv
fi
sudo -u maestro /opt/maestro/venv/bin/pip install --upgrade pip
sudo -u maestro /opt/maestro/venv/bin/pip install -r /opt/maestro/requirements.txt

sudo systemctl daemon-reload
sudo systemctl enable maestro-listener
sudo systemctl restart maestro-listener
sleep 2
sudo systemctl --no-pager status maestro-listener || true
echo "--- journalctl últimas linhas ---"
sudo journalctl -u maestro-listener -n 20 --no-pager || true
'

# -----------------------------------------------------------------------------
# 9) Seed inicial de memória + healthcheck
# -----------------------------------------------------------------------------
echo "[9/9] Seed memory + healthcheck..."
cd "$(dirname "$0")/../memory"
GOOGLE_CLOUD_PROJECT="${PROJECT_MAIN}" python3 seed_initial_lessons.py || \
  echo "  (seed pode ser rodado manualmente depois)"

echo
echo "============================================================"
echo "✅ MAESTRO v1.0 deployado."
echo "Worker:   ${SERVICE_NAME} @ ${PROJECT_VERTEX} / ${REGION}"
echo "Listener: maestro-listener.service @ ${VM_NAME}"
echo "Topic:    projects/${PROJECT_VERTEX}/topics/${TOPIC}"
echo
echo "Próximo passo: mandar '/maestro status' no chat com o bot."
echo "============================================================"
