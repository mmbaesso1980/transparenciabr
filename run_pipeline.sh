#!/bin/bash
# ============================================================
# run_pipeline.sh — GO-LIVE TransparênciaBR (v3 — definitivo)
# VM: tbr-mainframe-us-east1-d
# Uso: bash run_pipeline.sh
#
# Combina: correções Manus + sugestões Grok + fallbacks
# ============================================================

# NÃO usar set -e — queremos continuar mesmo se uma etapa falhar
set -uo pipefail

LOGFILE="/tmp/golive_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOGFILE") 2>&1

echo "🚀 TransparênciaBR — GO-LIVE Pipeline v3"
echo "=========================================="
echo "Log: $LOGFILE"
echo "Início: $(date)"
echo ""

# ============================================
# CONFIGURAÇÃO
# ============================================
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-/home/manusalt13/transparenciabr/key.json}"
export CGU_API_TOKEN="${CGU_API_TOKEN:-717a95e01b072090f41940282eab700a}"
export EMENDAS_START_YEAR="${EMENDAS_START_YEAR:-2023}"
export EMENDAS_START_PAGE="1"
export EMENDAS_PAGE_SLEEP="2.5"
export EMENDAS_MAX_PAGES_PER_YEAR="800"
export GCP_PROJECT_ID="transparenciabr"
export BQ_DATASET="transparenciabr"
export VERTEX_PROJECT="projeto-codex-br"
export VERTEX_LOCATION="us-east1"

cd "$(dirname "$0")"

echo "📋 Configuração:"
echo "   Credenciais: $GOOGLE_APPLICATION_CREDENTIALS"
echo "   GCP Project: $GCP_PROJECT_ID"
echo "   BQ Dataset:  $BQ_DATASET"
echo "   Vertex:      $VERTEX_PROJECT ($VERTEX_LOCATION)"
echo "   Emendas:     $EMENDAS_START_YEAR+ (página $EMENDAS_START_PAGE)"
echo "   CGU Token:   ${CGU_API_TOKEN:0:8}..."
echo ""

# ============================================
# 0. DEPENDÊNCIAS PYTHON (ponto do Grok)
# ============================================
echo "📦 [0/7] Instalando dependências Python..."
pip install --quiet --upgrade \
    firebase-admin \
    google-cloud-bigquery \
    google-cloud-aiplatform \
    google-cloud-firestore \
    requests \
    2>/dev/null && echo "✅ Dependências Python OK" || echo "⚠️  Algumas deps falharam (pode já estar instalado)"
echo ""

# ============================================
# 1. VERIFICAÇÃO DE AUTH
# ============================================
echo "🔑 [1/7] Verificando autenticação GCP..."
if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "❌ key.json não encontrado em $GOOGLE_APPLICATION_CREDENTIALS"
    echo "   Coloque o arquivo key.json na raiz do projeto."
    exit 1
fi

gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS" 2>/dev/null && \
    echo "✅ Service account ativada." || \
    echo "⚠️  gcloud auth falhou (GOOGLE_APPLICATION_CREDENTIALS ainda funciona para Python)"

# Smoke test BigQuery
python3 engines/99_gcp_smoke_check.py && echo "✅ BigQuery OK!" || {
    echo "❌ BigQuery auth falhou. Verifique key.json e permissões."
    echo "   Continuando mesmo assim..."
}
echo ""

# ============================================
# 2. GIT PULL
# ============================================
echo "📥 [2/7] Atualizando repositório..."
git pull origin main 2>/dev/null || echo "⚠️  git pull falhou (pode estar sem remote ou conflito)"
echo ""

# ============================================
# 3. NPM INSTALL (limpa cache como Grok sugeriu)
# ============================================
echo "📦 [3/7] Instalando dependências Node.js..."
cd functions
rm -rf node_modules 2>/dev/null
npm install --legacy-peer-deps 2>/dev/null && echo "✅ npm install OK" || echo "⚠️  npm install falhou"
cd ..
echo ""

# ============================================
# 4. INGESTÃO DE EMENDAS 2023-2025
# ============================================
echo "📊 [4/7] Bug 2: Ingestão de Emendas $EMENDAS_START_YEAR+..."
echo "   Tentativa 1: API CGU paginada..."
API_OK=false
if [ -n "$CGU_API_TOKEN" ]; then
    python3 engines/02_ingest_emendas.py && API_OK=true || API_OK=false
else
    echo "⚠️  CGU_API_TOKEN não definido. Pulando API."
fi

if [ "$API_OK" = false ]; then
    echo ""
    echo "   Tentativa 2: CSV Bulk do Portal da Transparência (sem API key)..."
    python3 engines/02b_ingest_emendas_bulk.py --ano-min ${EMENDAS_START_YEAR:-2023} && \
        echo "✅ Emendas ingeridas via CSV bulk!" || \
        echo "❌ Ambas as fontes falharam. Verifique conexão e permissões."
else
    echo "✅ Emendas ingeridas via API!"
fi
echo ""

# ============================================
# 5. CLASSIFICAÇÃO CEAP (Pulso CEAP)
# ============================================
echo "🔬 [5/7] Bug 3: Classificação CEAP..."

# Primeiro tenta Erika Hilton (220645) como piloto
echo "   Piloto: Erika Hilton (220645)..."
python3 engines/27_ceap_prisma_piloto.py \
    --deputado-id 220645 \
    --gravar-alertas \
    --merge-report 2>&1 && \
    echo "✅ CEAP Prisma classificado (Erika Hilton)!" || {
    echo "⚠️  Classificação CEAP falhou."
    echo "   Se for erro de Firestore 403, rode como OWNER:"
    echo "   gcloud projects add-iam-policy-binding transparenciabr \\"
    echo "     --member='serviceAccount:tbr-ingestor@transparenciabr.iam.gserviceaccount.com' \\"
    echo "     --role='roles/datastore.user'"
}
echo ""

# ============================================
# 6. SYNC BigQuery → Firestore
# ============================================
echo "🔄 [6/7] Bug 5: Sincronizando alertas BigQuery → Firestore..."
python3 engines/05_sync_bodes.py 2>&1 && \
    echo "✅ Sync concluído!" || \
    echo "⚠️  Sync falhou (view vw_alertas_bodes_export pode estar vazia)"
echo ""

# ============================================
# 7. DEPLOY CLOUD FUNCTIONS
# ============================================
echo "🚀 [7/7] Deploy das Cloud Functions..."
firebase deploy --only functions --force --project transparenciabr 2>&1 && \
    echo "✅ Functions deployed!" || {
    echo "❌ Deploy falhou."
    echo "   Se for erro de iam.serviceAccounts.ActAs, rode como OWNER:"
    echo "   bash fix_iam_permissions.sh"
    echo "   Ou no Console IAM: adicione 'Service Account User' ao seu email"
}
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
echo "--- Alertas por UF ---"
bq query --project_id=transparenciabr --use_legacy_sql=false \
    'SELECT uf, COUNT(*) as alertas 
     FROM `transparenciabr.transparenciabr.alertas_bodes` 
     GROUP BY uf ORDER BY alertas DESC LIMIT 10' 2>/dev/null || \
    echo "⚠️  Query alertas falhou (tabela pode não existir ainda)"

echo ""
echo "=========================================="
echo "🏁 GO-LIVE Pipeline v3 concluído!"
echo "Fim: $(date)"
echo "Log salvo em: $LOGFILE"
echo ""
echo "Próximos passos:"
echo "  1. Acesse https://transparenciabr.web.app e verifique os dados"
echo "  2. Para mais deputados: python3 engines/27_ceap_prisma_piloto.py --deputado-id <ID>"
echo "  3. Para classificação em massa: python3 engines/40_gemma_classifier_ceap.py"
echo "  4. Para Gemini: export VERTEX_PROJECT=projeto-codex-br && python3 engines/07_gemini_translator.py"
echo "=========================================="
