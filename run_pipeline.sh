#!/bin/bash
# run_pipeline.sh — Script de automação para VM tbr-mainframe-us-east1-d
# Resolve Bugs 2, 3, 5 em sequência e faz deploy
# Uso: bash run_pipeline.sh

set -e

echo "🚀 TransparênciaBR — Pipeline de Correção de Bugs"
echo "=================================================="
echo ""

# ============================================
# CONFIGURAÇÃO
# ============================================
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/keys/vertex-key.json}"
export CGU_API_TOKEN="${CGU_API_TOKEN:-}"
export EMENDAS_START_YEAR="${EMENDAS_START_YEAR:-2023}"
export EMENDAS_END_YEAR="${EMENDAS_END_YEAR:-2025}"

# Projeto Vertex AI (crédito GenAI App Builder)
export VERTEX_PROJECT="projeto-codex-br"
export VERTEX_LOCATION="us-east1"

# Projeto BigQuery (dados)
export BQ_PROJECT="fiscallizapa"

cd "$(dirname "$0")"

echo "📋 Configuração:"
echo "   Vertex AI: $VERTEX_PROJECT ($VERTEX_LOCATION)"
echo "   BigQuery:  $BQ_PROJECT"
echo "   Emendas:   $EMENDAS_START_YEAR-$EMENDAS_END_YEAR"
echo ""

# ============================================
# 0. GIT PULL (pegar correções recentes)
# ============================================
echo "📥 [0/5] Atualizando repositório..."
git pull origin main 2>/dev/null || echo "⚠️  git pull falhou (pode estar sem remote)"
echo ""

# ============================================
# 1. BUG 2: Ingestão de Emendas 2023-2025
# ============================================
echo "📊 [1/5] Bug 2: Ingestão de Emendas $EMENDAS_START_YEAR-$EMENDAS_END_YEAR..."
if [ -z "$CGU_API_TOKEN" ]; then
    echo "⚠️  CGU_API_TOKEN não definido. Pulando ingestão de emendas."
    echo "   Para obter: https://portaldatransparencia.gov.br/api-de-dados"
    echo "   Depois: export CGU_API_TOKEN='seu_token' && bash run_pipeline.sh"
else
    python3 engines/02_ingest_emendas.py && echo "✅ Emendas ingeridas!" || echo "❌ Falha na ingestão de emendas"
fi
echo ""

# ============================================
# 2. BUG 3: Classificação CEAP (Pulso CEAP)
# ============================================
echo "🤖 [2/5] Bug 3: Classificação CEAP via Gemini..."
if [ -f "engines/27_ceap_prisma_piloto.py" ]; then
    python3 engines/27_ceap_prisma_piloto.py && echo "✅ CEAP classificado!" || echo "❌ Falha na classificação CEAP"
else
    echo "⚠️  Engine 27 não encontrado. Tentando engine alternativo..."
    # Tenta o classificador batch se existir
    find engines/ -name "*classif*" -o -name "*ceap*" | head -3
fi
echo ""

# ============================================
# 3. BUG 5: Mata UF (classificação por UF)
# ============================================
echo "🗺️  [3/5] Bug 5: Populando classificação CEAP por UF..."
if [ -f "engines/mata_uf_populate.py" ]; then
    python3 engines/mata_uf_populate.py && echo "✅ Mata UF populada!" || echo "❌ Falha no Mata UF"
else
    echo "⚠️  Engine mata_uf não encontrado. Criando query BigQuery direta..."
    # Query direta para popular mata_uf a partir dos dados CEAP classificados
    bq query --project_id=$BQ_PROJECT --use_legacy_sql=false '
    CREATE OR REPLACE TABLE `fiscallizapa.dadosBrutos.ceap_por_uf` AS
    SELECT 
        sgUF,
        categoria_classificada,
        COUNT(*) as total_notas,
        SUM(vlrDocumento) as valor_total,
        ROUND(SUM(vlrDocumento) / SUM(SUM(vlrDocumento)) OVER(PARTITION BY sgUF) * 100, 2) as pct_uf
    FROM `fiscallizapa.dadosBrutos.ceap_classificado`
    WHERE categoria_classificada IS NOT NULL
    GROUP BY sgUF, categoria_classificada
    ORDER BY sgUF, valor_total DESC
    ' 2>/dev/null && echo "✅ Mata UF populada via BQ!" || echo "⚠️  Tabela ceap_classificado pode não existir ainda"
fi
echo ""

# ============================================
# 4. DEPLOY CLOUD FUNCTIONS
# ============================================
echo "🚀 [4/5] Deploy das Cloud Functions..."
cd functions
npm install --legacy-peer-deps 2>/dev/null
cd ..
firebase deploy --only functions --force 2>/dev/null && echo "✅ Functions deployed!" || echo "❌ Deploy falhou (verifique firebase login)"
echo ""

# ============================================
# 5. VERIFICAÇÃO FINAL
# ============================================
echo "🔍 [5/5] Verificação final..."
echo ""
echo "Checklist:"
echo "  [ ] Score concentração: curl https://transparenciabr.web.app/api/getRiscoKPIs"
echo "  [ ] Emendas 2023+: bq query 'SELECT ano, COUNT(*) FROM fiscallizapa.dadosBrutos.emendas GROUP BY ano ORDER BY ano'"
echo "  [ ] Pulso CEAP: curl https://transparenciabr.web.app/api/getDashboardKPIs"
echo "  [ ] Score 594: bq query 'SELECT COUNT(DISTINCT id_deputado) FROM fiscallizapa.dadosBrutos.score_risco_parlamentar'"
echo "  [ ] Mata UF: bq query 'SELECT COUNT(*) FROM fiscallizapa.dadosBrutos.ceap_por_uf'"
echo ""
echo "🏁 Pipeline concluído!"
