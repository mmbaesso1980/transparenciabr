#!/usr/bin/env bash
# scripts/run_onda15_ceap_classify.sh
#
# Onda 15 — Classificar via Vertex/Gemini todas as notas CEAP que hoje
# caem em SEM_CATEGORIA (5.787 notas no painel atual).
#
# Pré-requisitos (Cloud Shell autenticado como Comandante):
#   - gcloud auth application-default login (ADC válida)
#   - Acesso de leitura/escrita ao bucket gs://datalake-tbr-clean
#   - Vertex AI API habilitada no projeto transparenciabr
#
# Custo estimado (gemini-2.5-flash batch):
#   ~5.787 notas × ~250 tokens entrada × ~80 tokens saída ≈ R$ 1–2 por ano
#   2024 + 2025 + 2026 → R$ 3–6 total.
#
# Saída: gs://datalake-tbr-clean/vertex/ceap_classified/year=YYYY/snapshot=YYYY-MM-DD/
#        (parte-NNNN.ndjson + parte-final.ndjson + summary.json)
#
# Próximo passo: re-rodar agregação (getDashboardKPIs faz on-demand,
# então basta cache invalidate ou aguardar TTL).

set -euo pipefail

LOG_DIR="${HOME}/transparenciabr/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/onda15_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

PROJ_DIR="${PROJ_DIR:-$HOME/transparenciabr}"
ENGINE="$PROJ_DIR/engines/vertex/classify_ceap.js"
[ ! -f "$ENGINE" ] && { echo "❌ engine não encontrado: $ENGINE"; exit 1; }

# Modelo: gemini-2.5-flash (10x mais barato que pro, suficiente p/ taxonomia fixa)
export VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-flash}"
export CEAP_VERTEX_CLASSIFY_MODEL="$VERTEX_MODEL"
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-transparenciabr}"
export VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"

echo "════════════════════════════════════════════════════════════"
echo "  ONDA 15 — Classificação Vertex sobre SEM_CATEGORIA"
echo "  Início: $(date)"
echo "  Modelo:  $VERTEX_MODEL"
echo "  Projeto: $GCP_PROJECT_ID"
echo "════════════════════════════════════════════════════════════"

# Anos a classificar — diretiva: CEAP só legislatura atual (2023+).
YEARS=("${@:-2023 2024 2025 2026}")
[ "${#YEARS[@]}" -eq 0 ] && YEARS=(2023 2024 2025 2026)

cd "$PROJ_DIR/engines/vertex"
[ ! -d node_modules ] && [ -f package.json ] && npm ci --silent 2>/dev/null || true

for YEAR in "${YEARS[@]}"; do
  echo ""
  echo "▶ Year=$YEAR — disparando classify..."
  # Sem MAX = processa todas as notas do ano
  node classify_ceap.js --year "$YEAR" --batch-size 50 \
    || { echo "❌ classify $YEAR falhou — seguindo próximo ano"; continue; }
  echo "✓ Year=$YEAR concluído"
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ONDA 15 — fim: $(date)"
echo ""
echo "  Pós-passos:"
echo "  1) gsutil ls gs://datalake-tbr-clean/vertex/ceap_classified/year=*/snapshot=*/"
echo "  2) Aguardar TTL do cache de getDashboardKPIs (~5min) ou:"
echo "     curl -X POST https://southamerica-east1-transparenciabr.cloudfunctions.net/getDashboardKPIs?refresh=1"
echo "  3) Validar painel: https://transparenciabr.web.app/painel"
echo "     → 'Top categorias risco' deve mostrar TRANSPORTE_AEREO, COMBUSTIVEL, etc"
echo "     → 'top_categorias_risco' não deve mais ter SEM_CATEGORIA = 5787"
echo "════════════════════════════════════════════════════════════"
