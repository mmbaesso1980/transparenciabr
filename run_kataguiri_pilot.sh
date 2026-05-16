#!/bin/bash
# ============================================================
# run_kataguiri_pilot.sh — Piloto Kim Kataguiri (204536)
# VM: tbr-mainframe-us-east1-d
# Uso: bash run_kataguiri_pilot.sh
#
# Executa engine 27 (CEAP Prisma) + engine 05 (sync bodes)
# para popular o painel com dados reais do deputado 204536.
# ============================================================
set -uo pipefail
echo "🎯 Piloto Kim Kataguiri (204536)"
echo "================================="
echo "Início: $(date)"
echo ""

# ============================================
# CONFIGURAÇÃO CROSS-PROJECT
# ============================================
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-/home/manusalt13/transparenciabr/key.json}"
export GCP_PROJECT_ID="transparenciabr"
export BQ_DATASET="transparenciabr"
export VERTEX_PROJECT="projeto-codex-br"
export VERTEX_LOCATION="us-east1"

cd "$(dirname "$0")"

echo "📋 Configuração:"
echo "   Credenciais: $GOOGLE_APPLICATION_CREDENTIALS"
echo "   Dados (BQ/Firestore): $GCP_PROJECT_ID"
echo "   IA (Vertex/Gemini):   $VERTEX_PROJECT @ $VERTEX_LOCATION"
echo ""

# ============================================
# 1. ATIVAR SERVICE ACCOUNT
# ============================================
echo "🔑 [1/4] Ativando service account..."
gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS" 2>&1 && \
    echo "✅ Service account ativada!" || {
    echo "❌ Falha na ativação. Verifique key.json."
    exit 1
}
echo ""

# ============================================
# 2. INSTALAR DEPS PYTHON (se necessário)
# ============================================
echo "📦 [2/4] Verificando dependências Python..."
pip3 install --quiet --upgrade google-cloud-bigquery google-cloud-firestore firebase-admin requests google-genai 2>&1 | tail -3
echo "✅ Deps OK"
echo ""

# ============================================
# 3. ENGINE 27 — CEAP PRISMA (Kim Kataguiri)
# ============================================
echo "🔬 [3/4] Engine 27: Classificação CEAP para Kim Kataguiri (204536)..."
python3 engines/27_ceap_prisma_piloto.py \
    --deputado-id 204536 \
    --gravar-alertas \
    --merge-report 2>&1 && \
    echo "✅ CEAP Prisma classificado (Kim Kataguiri)!" || {
    echo "⚠️  Classificação CEAP falhou."
    echo "   Se for erro Firestore 403, rode como OWNER no Cloud Shell:"
    echo "   gcloud projects add-iam-policy-binding transparenciabr \\"
    echo "     --member='serviceAccount:tbr-ingestor@transparenciabr.iam.gserviceaccount.com' \\"
    echo "     --role='roles/datastore.user'"
}
echo ""

# ============================================
# 4. ENGINE 05 — SYNC BODES (BigQuery → Firestore)
# ============================================
echo "🔄 [4/4] Engine 05: Sincronizando alertas BigQuery → Firestore..."
python3 engines/05_sync_bodes.py 2>&1 && \
    echo "✅ Sync concluído!" || \
    echo "⚠️  Sync falhou (view vw_alertas_bodes_export pode estar vazia)"
echo ""

# ============================================
# RESULTADO
# ============================================
echo "=========================================="
echo "🏁 Piloto Kim Kataguiri CONCLUÍDO!"
echo "=========================================="
echo ""
echo "Verifique em: https://transparenciabr.web.app/politico/204536"
echo ""
echo "Próximos passos:"
echo "  1. firebase deploy --only hosting (para subir frontend com links clicáveis)"
echo "  2. firebase deploy --only functions (para subir Cloud Functions corrigidas)"
echo "  3. Para mais deputados: python3 engines/27_ceap_prisma_piloto.py --deputado-id <ID>"
echo ""
echo "Fim: $(date)"
