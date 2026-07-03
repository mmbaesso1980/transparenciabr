#!/usr/bin/env bash
# =============================================================================
# Deploy da VM WOLF-Trader (Polymarket) — RODAR NO CLOUD SHELL do Comandante.
# O sandbox do agente NAO tem gcloud; este script e para o Cloud Shell.
# Projeto: transparenciabr | Regiao: us-east1 (fora do Brasil).
#
# Seguranca: NAO grava chave privada em disco. A chave da carteira e cadastrada
# no Secret Manager por VOCE (passo 3), interativo, e lida so em memoria na VM.
# =============================================================================
set -euo pipefail

PROJECT="${PROJECT:-transparenciabr}"
ZONE="${ZONE:-us-east1-b}"
REGION="${REGION:-us-east1}"
VM="${VM:-wolf-trader-us-east1}"
SA="${SA:-wolf-trader}"
SA_EMAIL="${SA}@${PROJECT}.iam.gserviceaccount.com"
CODEX="${CODEX:-projeto-codex-br}"

echo "== Fase 0: contexto =="
gcloud config set project "$PROJECT"
echo "Projeto=$PROJECT Zona=$ZONE VM=$VM SA=$SA_EMAIL"

echo "== Fase 1: IP estatico =="
gcloud compute addresses create "${VM}-ip" --region="$REGION" 2>/dev/null || echo "IP ja existe"
IP=$(gcloud compute addresses describe "${VM}-ip" --region="$REGION" --format='value(address)')
echo "IP externo: $IP"

echo "== Fase 2: Service Account + IAM minimo =="
gcloud iam service-accounts create "$SA" \
  --display-name="WOLF Trader (Polymarket)" 2>/dev/null || echo "SA ja existe"
# Secret Manager + KMS (chave da carteira)
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --condition=None
# Firestore (estado/gate) no projeto principal
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/datastore.user" --condition=None
# Auditoria BigQuery + Vertex no projeto codex
gcloud projects add-iam-policy-binding "$CODEX" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/bigquery.dataEditor" --condition=None
gcloud projects add-iam-policy-binding "$CODEX" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/bigquery.jobUser" --condition=None
gcloud projects add-iam-policy-binding "$CODEX" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/aiplatform.user" --condition=None

echo "== Fase 3: SEGREDOS (INTERATIVO — cole quando pedir; nada fica no historico) =="
create_secret () {
  local name="$1" prompt="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo "Secret $name ja existe — pulando (use 'gcloud secrets versions add' para atualizar)."
  else
    gcloud secrets create "$name" --replication-policy=automatic
    echo -n "$prompt: "; read -rs VAL; echo
    printf '%s' "$VAL" | gcloud secrets versions add "$name" --data-file=-
    unset VAL
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" --condition=None >/dev/null
}
create_secret WOLF_WALLET_PK       "Chave privada L1 da carteira (cole; nao ecoa)"
create_secret WOLF_DEPOSIT_ADDRESS "Endereco da carteira/deposit (0x...)"
create_secret TELEGRAM_BOT_TOKEN   "Token do bot Telegram (@Asmodeuswebforgebot)"

echo "== Fase 4: criar a VM (SSH so via IAP; sem porta 22 publica) =="
gcloud compute instances create "$VM" \
  --zone="$ZONE" --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --service-account="$SA_EMAIL" \
  --scopes=cloud-platform \
  --address="$IP" \
  --tags=wolf-trader \
  --metadata=enable-oslogin=TRUE 2>/dev/null || true
# regra de firewall IAP (SSH via tunel) — restrita à tag wolf-trader
gcloud compute firewall-rules create allow-iap-ssh-wolf-trader \
  --direction=INGRESS --action=ALLOW --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=wolf-trader 2>/dev/null || echo "regra IAP ja existe"

echo "== Fase 5: instalar codigo + systemd (via IAP) =="
cat <<'REMOTE' > /tmp/wolf_bootstrap.sh
set -euo pipefail
sudo apt-get update -y && sudo apt-get install -y python3-venv git
sudo mkdir -p /opt/wolf && sudo chown "$USER" /opt/wolf
cd /opt/wolf
git clone https://github.com/mmbaesso1980/transparenciabr.git repo || (cd repo && git pull)
cd repo/bridge 2>/dev/null || cd repo   # ajuste conforme onde a ponte foi versionada
python3 -m venv .venv && . .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
pip install "py-clob-client" "web3"     # execucao Polymarket real
echo "Bootstrap WOLF-Trader concluido."
REMOTE
gcloud compute scp /tmp/wolf_bootstrap.sh "${VM}:/tmp/" --zone="$ZONE" --tunnel-through-iap
gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command="bash /tmp/wolf_bootstrap.sh"

echo "== Fase 6: smoke test (SO LEITURA — nao posta ordem) =="
gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command='
  cd /opt/wolf/repo/bridge 2>/dev/null || cd /opt/wolf/repo; . .venv/bin/activate
  DRY_RUN=true python3 -c "from wolf_trader.polymarket_client import PolymarketReader as R; print(\"mercados lidos:\", len(R().listar_mercados(limit=5)))"
'
echo "== DONE. VM $VM em $ZONE (IP $IP). DRY_RUN ativo ate voce liberar execucao real. =="
echo "Proximo: instalar wolf-trader.service (systemd) apontando para wolf_trader.engine com DRY_RUN=false, apos revisar limites."
