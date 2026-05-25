#!/bin/bash
# ============================================================
# AURORA Forensic v1.0 — QUICKDEPLOY via Cloud Shell
# ============================================================
# Uso (no Cloud Shell em https://shell.cloud.google.com):
#   git clone https://github.com/mmbaesso1980/transparenciabr.git
#   cd transparenciabr
#   bash cloud_shell_quickdeploy.sh
#
# Pré-requisitos automáticos (Cloud Shell já tem):
#   - gcloud, gsutil, firebase, npm
#   - Auth ativa do Comandante
# ============================================================

set -euo pipefail

PROJECT_ID="transparenciabr"
COMPUTE_PROJECT="projeto-codex-br"
REGION_BR="southamerica-east1"
SA="queima-vertex@projeto-codex-br.iam.gserviceaccount.com"
FUNCTION_SA="transparenciabr@appspot.gserviceaccount.com"

echo "═══════════════════════════════════════════════════════"
echo "🚀 AURORA Forensic v1.0 — QUICKDEPLOY"
echo "═══════════════════════════════════════════════════════"
echo "  Firebase project: ${PROJECT_ID}"
echo "  Compute project:  ${COMPUTE_PROJECT}"
echo "  Region:           ${REGION_BR}"
echo "  Service Account:  ${SA}"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 1 — Validação de pré-requisitos
# ─────────────────────────────────────────────────────────────
echo "🔍 [1/6] Validando pré-requisitos..."

for cmd in gcloud gsutil firebase npm node; do
  if ! command -v $cmd >/dev/null 2>&1; then
    echo "❌ ERRO: '$cmd' não está instalado. Abortando."
    exit 1
  fi
done
echo "   ✅ gcloud / gsutil / firebase / npm / node OK"

# Verifica auth ativa
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
if [ -z "$ACTIVE_ACCOUNT" ]; then
  echo "❌ ERRO: nenhuma conta gcloud ativa. Execute: gcloud auth login"
  exit 1
fi
echo "   ✅ gcloud auth ativa: ${ACTIVE_ACCOUNT}"

# Verifica acesso a ambos os projetos
for proj in $PROJECT_ID $COMPUTE_PROJECT; do
  if gcloud projects describe $proj --format="value(projectId)" >/dev/null 2>&1; then
    echo "   ✅ Acesso a ${proj} OK"
  else
    echo "   ❌ Sem acesso a ${proj}. Verifique IAM."
    exit 1
  fi
done

# Verifica APIs habilitadas em codex-br
echo "   Verificando APIs em ${COMPUTE_PROJECT}..."
REQUIRED_APIS=(
  "pubsub.googleapis.com"
  "run.googleapis.com"
  "eventarc.googleapis.com"
  "aiplatform.googleapis.com"
  "artifactregistry.googleapis.com"
  "cloudbuild.googleapis.com"
)
for api in "${REQUIRED_APIS[@]}"; do
  if gcloud services list --enabled --project=$COMPUTE_PROJECT --filter="config.name:$api" --format="value(config.name)" | grep -q "$api"; then
    echo "      ✅ $api"
  else
    echo "      ⚠️  $api não habilitada — habilitando..."
    gcloud services enable $api --project=$COMPUTE_PROJECT
  fi
done
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 2 — IAM cross-project
# ─────────────────────────────────────────────────────────────
echo "🔐 [2/6] Configurando IAM cross-project..."

# SA queima-vertex precisa de Firestore + Storage em transparenciabr
echo "   Concedendo roles/datastore.user a ${SA} em ${PROJECT_ID}..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  --quiet 2>&1 | grep -E "Updated|already" || true

echo "   Concedendo roles/storage.objectAdmin a ${SA} em ${PROJECT_ID}..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectAdmin" \
  --condition=None \
  --quiet 2>&1 | grep -E "Updated|already" || true

# Cloud Function SA precisa publicar no Pub/Sub de codex-br
echo "   Concedendo roles/pubsub.publisher a ${FUNCTION_SA} em ${COMPUTE_PROJECT}..."
gcloud projects add-iam-policy-binding $COMPUTE_PROJECT \
  --member="serviceAccount:${FUNCTION_SA}" \
  --role="roles/pubsub.publisher" \
  --condition=None \
  --quiet 2>&1 | grep -E "Updated|already" || true

echo "   ✅ IAM cross-project configurado"
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 3 — Pub/Sub + GCS
# ─────────────────────────────────────────────────────────────
echo "📡 [3/6] Provisionando Pub/Sub + GCS..."
bash infrastructure/setup_dossie_v1.sh
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 4 — Validar GEMINI_API_KEY
# ─────────────────────────────────────────────────────────────
echo "🔑 [4/6] Validando GEMINI_API_KEY..."
if ! gcloud secrets describe gemini-api-key --project=$COMPUTE_PROJECT >/dev/null 2>&1; then
  echo "   ⚠️  Secret 'gemini-api-key' não existe em ${COMPUTE_PROJECT}."
  echo "   ⚠️  Crie agora com:"
  echo "        echo -n \"<SUA_CHAVE_GEMINI>\" | gcloud secrets create gemini-api-key \\"
  echo "          --project=${COMPUTE_PROJECT} --data-file=-"
  echo ""
  read -p "   Pressione ENTER quando o secret estiver criado, ou Ctrl+C para abortar..."
fi
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$COMPUTE_PROJECT \
  --quiet 2>&1 | grep -E "Updated|already" || true
echo "   ✅ GEMINI_API_KEY acessível pela SA"
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 5 — Deploy completo
# ─────────────────────────────────────────────────────────────
echo "🚢 [5/6] Disparando deploy AURORA Forensic v1.0..."
echo "   Tempo estimado: 8-12 minutos"
echo ""
bash infrastructure/deploy_aurora_forensic_v1.sh
echo ""

# ─────────────────────────────────────────────────────────────
# Fase 6 — Smoke test
# ─────────────────────────────────────────────────────────────
echo "🧪 [6/6] Smoke test..."

# 6a. Verificar Pub/Sub topic
gcloud pubsub topics describe dossie-v1-pipeline --project=$COMPUTE_PROJECT --format="value(name)" >/dev/null \
  && echo "   ✅ Pub/Sub topic ativo" \
  || echo "   ❌ Pub/Sub topic não encontrado"

# 6b. Verificar Cloud Run Job
gcloud run jobs describe dossie-v1-pipeline --region=$REGION_BR --project=$COMPUTE_PROJECT --format="value(name)" >/dev/null \
  && echo "   ✅ Cloud Run Job ativo" \
  || echo "   ❌ Cloud Run Job não encontrado"

# 6c. Verificar Cloud Function
gcloud functions describe iniciarDossieV1 --region=$REGION_BR --project=$PROJECT_ID --gen2 --format="value(name)" >/dev/null 2>&1 \
  || gcloud functions describe iniciarDossieV1 --region=$REGION_BR --project=$PROJECT_ID --format="value(name)" >/dev/null \
  && echo "   ✅ Cloud Function iniciarDossieV1 ativa" \
  || echo "   ❌ Cloud Function não encontrada"

# 6d. Verificar Eventarc trigger
gcloud eventarc triggers describe dossie-v1-pipeline-trigger --location=$REGION_BR --project=$COMPUTE_PROJECT --format="value(name)" >/dev/null \
  && echo "   ✅ Eventarc trigger ativo" \
  || echo "   ❌ Eventarc trigger não encontrado"

# 6e. Frontend
echo "   ✅ Frontend: https://${PROJECT_ID}.web.app/escritorio"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "🏁 AURORA Forensic v1.0 — DEPLOY CONCLUÍDO"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Como testar end-to-end:"
echo "  1. Abra https://${PROJECT_ID}.web.app/escritorio (logado)"
echo "  2. Digite 'Erika Hilton' ou 'Kim Kataguiri' e confirme"
echo "  3. Veja os 110 agentes mudando de estado em tempo real"
echo "  4. PDF aparecerá em gs://datalake-tbr-clean/dossies_v1/{slug}/dossie.pdf"
echo ""
echo "Monitorar execuções:"
echo "  gcloud run jobs executions list \\"
echo "    --job=dossie-v1-pipeline --region=${REGION_BR} --project=${COMPUTE_PROJECT}"
echo ""
echo "Acompanhar custos (queima do crédito GenAI App Builder em codex-br):"
echo "  https://console.cloud.google.com/billing/credits?project=${COMPUTE_PROJECT}"
echo ""
