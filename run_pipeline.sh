#!/bin/bash
# ============================================================
# run_pipeline.sh — GO-LIVE TransparênciaBR
# VM: tbr-mainframe-us-east1-d
# Uso: bash run_pipeline.sh
# ============================================================

set -euo pipefail

echo "🚀 TransparênciaBR — GO-LIVE Pipeline"
echo "======================================"
echo ""

# ============================================
# CONFIGURAÇÃO
# ============================================
# Key.json na raiz do projeto (conforme enviado pelo usuário)
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-/home/manusalt13/transparenciabr/key.json}"
export CGU_API_TOKEN="${CGU_API_TOKEN:-717a95e01b072090f41940282eab700a}"

# Forçar início da página 1 para evitar 405 em páginas altas
export EMENDAS_START_YEAR="${EMENDAS_START_YEAR:-2023}"
export EMENDAS_START_PAGE="1"
export EMENDAS_PAGE_SLEEP="2.5"
export EMENDAS_MAX_PAGES_PER_YEAR="800"

# Projeto GCP
export GCP_PROJECT_ID="transparenciabr"
export BQ_DATASET="transparenciabr"

# Vertex AI (créditos em projeto-codex-br)
export VERTEX_PROJECT="projeto-codex-br"
export VERTEX_LOCATION="us-east1"

cd "$(dirname "$0")"

echo "📋 Configuração:"
echo "   Credenciais: $GOOGLE_APPLICATION_CREDENTIALS"
echo "   GCP Project: $GCP_PROJECT_ID"
echo "   BQ Dataset:  $BQ_DATASET"
echo "   Emendas:     $EMENDAS_START_YEAR+ (página $EMENDAS_START_PAGE)"
echo "   CGU Token:   ${CGU_API_TOKEN:0:8}..."
echo ""

# ============================================
# 0. VERIFICAÇÃO DE AUTH
# ============================================
echo "🔑 [0/6] Verificando autenticação GCP..."
if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "❌ key.json não encontrado em $GOOGLE_APPLICATION_CREDENTIALS"
    echo "   Coloque o arquivo key.json na raiz do projeto."
    exit 1
fi

# Ativa service account
gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS" 2>/dev/null && \
    echo "✅ Service account ativada." || \
    echo "⚠️  gcloud auth falhou (pode não ter gcloud instalado, mas GOOGLE_APPLICATION_CREDENTIALS funciona)"

# Smoke test BigQuery
python3 engines/99_gcp_smoke_check.py && echo "✅ BigQuery OK!" || {
    echo "❌ BigQuery auth falhou. Verifique key.json e permissões."
    exit 1
}
echo ""

# ============================================
# 1. IAM FIXES (se tiver gcloud)
# ============================================
echo "🔐 [1/6] Verificando permissões IAM..."
SA_EMAIL=$(python3 -c "import json; d=json.load(open('$GOOGLE_APPLICATION_CREDENTIALS')); print(d.get('client_email',''))" 2>/dev/null || echo "")
if [ -n "$SA_EMAIL" ]; then
    echo "   Service Account: $SA_EMAIL"
    # Tenta adicionar roles necessárias (pode falhar se já existem ou sem permissão)
    gcloud projects add-iam-policy-binding transparenciabr \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/datastore.user" \
        --quiet 2>/dev/null && echo "   ✅ Firestore role OK" || echo "   ⚠️  Firestore role: já existe ou sem permissão admin"
    gcloud projects add-iam-policy-binding transparenciabr \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/iam.serviceAccountUser" \
        --quiet 2>/dev/null && echo "   ✅ ServiceAccountUser role OK" || echo "   ⚠️  ServiceAccountUser role: já existe ou sem permissão admin"
else
    echo "   ⚠️  Não foi possível extrair email da SA. Pule se as roles já foram configuradas."
fi
echo ""

# ============================================
# 2. GIT PULL (pegar correções recentes)
# ============================================
echo "📥 [2/6] Atualizando repositório..."
git pull origin main 2>/dev/null || echo "⚠️  git pull falhou (pode estar sem remote ou conflito)"
echo ""

# ============================================
# 3. BUG 2: Ingestão de Emendas 2023-2025
# ============================================
echo "📊 [3/6] Bug 2: Ingestão de Emendas $EMENDAS_START_YEAR+..."
echo "   (Página inicial forçada: $EMENDAS_START_PAGE para evitar 405)"
if [ -z "$CGU_API_TOKEN" ]; then
    echo "⚠️  CGU_API_TOKEN não definido. Pulando."
else
    python3 engines/02_ingest_emendas.py && \
        echo "✅ Emendas ingeridas!" || \
        echo "❌ Falha na ingestão (verifique logs acima)"
fi
echo ""

# ============================================
# 4. BUG 3: Classificação CEAP (Pulso CEAP)
# ============================================
echo "🔬 [4/6] Bug 3: Classificação CEAP — Erika Hilton (220645)..."
python3 engines/27_ceap_prisma_piloto.py \
    --deputado-id 220645 \
    --gravar-alertas \
    --merge-report && \
    echo "✅ CEAP Prisma classificado!" || \
    echo "⚠️  Classificação CEAP parcial (verifique Firestore permissions)"
echo ""

# ============================================
# 5. SYNC BigQuery → Firestore
# ============================================
echo "🔄 [5/6] Bug 5: Sincronizando alertas BigQuery → Firestore..."
python3 engines/05_sync_bodes.py && \
    echo "✅ Sync concluído!" || \
    echo "⚠️  Sync falhou (view vw_alertas_bodes_export pode não existir ainda)"
echo ""

# ============================================
# 6. DEPLOY CLOUD FUNCTIONS
# ============================================
echo "🚀 [6/6] Deploy das Cloud Functions..."
cd functions
npm install --legacy-peer-deps 2>/dev/null
cd ..
firebase deploy --only functions --force --project transparenciabr && \
    echo "✅ Functions deployed!" || \
    echo "❌ Deploy falhou. Tente: firebase login --no-localhost && firebase deploy --only functions --force"
echo ""

# ============================================
# VERIFICAÇÃO FINAL
# ============================================
echo "=========================================="
echo "🔍 VERIFICAÇÃO FINAL"
echo "=========================================="
echo ""

echo "--- Emendas por ano ---"
bq query --project_id=fiscallizapa --use_legacy_sql=false \
    'SELECT CAST(ano AS STRING) as ano, COUNT(*) as total 
     FROM `fiscallizapa.transparenciabr.emendas` 
     GROUP BY ano ORDER BY ano DESC LIMIT 10' 2>/dev/null || \
bq query --project_id=transparenciabr --use_legacy_sql=false \
    'SELECT CAST(ano AS STRING) as ano, COUNT(*) as total 
     FROM `transparenciabr.transparenciabr.emendas` 
     GROUP BY ano ORDER BY ano DESC LIMIT 10' 2>/dev/null || \
    echo "⚠️  Query de verificação falhou"

echo ""
echo "--- Total deputados com despesas ---"
bq query --project_id=fiscallizapa --use_legacy_sql=false \
    'SELECT COUNT(DISTINCT idDeputado) as total_deputados 
     FROM `fiscallizapa.dadosBrutos.ceap_deputados`' 2>/dev/null || \
    echo "⚠️  Query deputados falhou"

echo ""
echo "=========================================="
echo "🏁 GO-LIVE Pipeline concluído!"
echo ""
echo "Próximos passos manuais:"
echo "  1. Acesse https://transparenciabr.web.app e verifique os dados"
echo "  2. Para mais deputados: python3 engines/27_ceap_prisma_piloto.py --deputado-id <ID>"
echo "  3. Para Gemini classificador: export GEMINI_API_KEY=... && python3 engines/07_gemini_translator.py"
echo "=========================================="
