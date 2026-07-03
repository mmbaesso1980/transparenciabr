#!/bin/bash
# =============================================================================
# QuickDeploy Bridge — TransparênciaBR / AURORA
# Executar no Cloud Shell do Comandante (NÃO em sandbox Devin).
#
# Pré-requisitos:
#   - gcloud autenticado no projeto correto
#   - Variáveis CODEX_PROJECT e TBR_PROJECT definidas
#
# Fases:
#   1. Criar segredos no Secret Manager
#   2. Criar dataset/tabela BigQuery (audit)
#   3. Criar VM devin-bridge-listener em us-east1
#   4. Instalar serviços systemd
# =============================================================================

set -euo pipefail

# --- Configuração ---
CODEX_PROJECT="${CODEX_PROJECT:-projeto-codex-br}"
TBR_PROJECT="${TBR_PROJECT:-transparenciabr}"
REGION="us-east1"
ZONE="us-east1-b"
VM_NAME="devin-bridge-listener"
SERVICE_ACCOUNT="devin-bridge@${CODEX_PROJECT}.iam.gserviceaccount.com"

echo "=== TransparênciaBR Bridge Deploy ==="
echo "Projeto: ${CODEX_PROJECT}"
echo "Região: ${REGION}"
echo "VM: ${VM_NAME}"
echo ""

# --- Fase 1: Segredos no Secret Manager ---
echo "[1/4] Criando segredos no Secret Manager..."

SECRETS=(
  "DEVIN_API_KEY"
  "DEVIN_ORG_ID"
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_COMMANDER_CHAT_ID"
)

for SECRET_NAME in "${SECRETS[@]}"; do
  if ! gcloud secrets describe "${SECRET_NAME}" --project="${CODEX_PROJECT}" &>/dev/null; then
    echo "  Criando segredo: ${SECRET_NAME}"
    gcloud secrets create "${SECRET_NAME}" \
      --project="${CODEX_PROJECT}" \
      --replication-policy="user-managed" \
      --locations="${REGION}"
    echo "  ATENÇÃO: Adicione o valor com:"
    echo "    echo -n 'VALOR' | gcloud secrets versions add ${SECRET_NAME} --data-file=-"
  else
    echo "  Segredo já existe: ${SECRET_NAME}"
  fi
done

# --- Fase 2: BigQuery Dataset + Tabela ---
echo ""
echo "[2/4] Configurando BigQuery..."

DATASET="bridge_audit"
if ! bq show --project_id="${CODEX_PROJECT}" "${DATASET}" &>/dev/null; then
  echo "  Criando dataset: ${DATASET}"
  bq mk --project_id="${CODEX_PROJECT}" \
    --location="${REGION}" \
    --dataset "${DATASET}"
fi

echo "  Aplicando schema da tabela events..."
bq query --project_id="${CODEX_PROJECT}" --use_legacy_sql=false < sql/audit_schema.sql

# --- Fase 3: Criar VM ---
echo ""
echo "[3/4] Criando VM ${VM_NAME}..."

if ! gcloud compute instances describe "${VM_NAME}" --zone="${ZONE}" --project="${CODEX_PROJECT}" &>/dev/null; then
  gcloud compute instances create "${VM_NAME}" \
    --project="${CODEX_PROJECT}" \
    --zone="${ZONE}" \
    --machine-type="e2-small" \
    --image-family="debian-12" \
    --image-project="debian-cloud" \
    --boot-disk-size="20GB" \
    --service-account="${SERVICE_ACCOUNT}" \
    --scopes="cloud-platform" \
    --tags="devin-bridge" \
    --metadata="enable-oslogin=TRUE"
  echo "  VM criada."
else
  echo "  VM já existe."
fi

# --- Fase 4: Instalar na VM ---
echo ""
echo "[4/4] Instalando serviços na VM..."

gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" --project="${CODEX_PROJECT}" --command="
  sudo apt-get update -q && sudo apt-get install -y python3 python3-venv python3-pip
  sudo useradd -r -s /bin/false devin-bridge 2>/dev/null || true
  sudo mkdir -p /opt/devin-bridge/logs
  sudo chown -R devin-bridge:devin-bridge /opt/devin-bridge
"

echo "  Copiando código..."
gcloud compute scp --zone="${ZONE}" --project="${CODEX_PROJECT}" --recurse \
  ../bridge/ "${VM_NAME}:/tmp/bridge-deploy/"

gcloud compute ssh "${VM_NAME}" --zone="${ZONE}" --project="${CODEX_PROJECT}" --command="
  sudo cp -r /tmp/bridge-deploy/* /opt/devin-bridge/
  cd /opt/devin-bridge
  sudo -u devin-bridge python3 -m venv venv
  sudo -u devin-bridge venv/bin/pip install -r requirements.txt

  # Instalar serviços systemd
  sudo cp systemd/*.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable devin-bridge-listener devin-bridge-monitor

  # Gerar .env a partir do Secret Manager (permissões restritas desde o início)
  echo 'Gerando .env com segredos do Secret Manager...'
  install -m 600 -o devin-bridge -g devin-bridge /dev/null /opt/devin-bridge/.env
  for SECRET in DEVIN_API_KEY DEVIN_ORG_ID TELEGRAM_BOT_TOKEN TELEGRAM_COMMANDER_CHAT_ID; do
    VALUE=\$(gcloud secrets versions access latest --secret=\"\${SECRET}\" --project=\"${CODEX_PROJECT}\")
    echo \"\${SECRET}=\${VALUE}\" >> /opt/devin-bridge/.env
  done
  echo \"CODEX_PROJECT=${CODEX_PROJECT}\" >> /opt/devin-bridge/.env
  echo \"TBR_PROJECT=${TBR_PROJECT}\" >> /opt/devin-bridge/.env
  # Permissões já definidas na criação via install(1)

  echo 'Iniciando serviços...'
  sudo systemctl start devin-bridge-listener devin-bridge-monitor
  sudo systemctl status devin-bridge-listener --no-pager
"

echo ""
echo "=== Deploy concluído ==="
echo "Verifique: gcloud compute ssh ${VM_NAME} --zone=${ZONE} -- journalctl -u devin-bridge-listener -f"
