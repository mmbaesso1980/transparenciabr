#!/bin/bash
# scripts/run_vertex.sh
# Roda pipeline Vertex AI (Rota Calibrada): classificador CEAP + build_status.
# Diretiva: APENAS texto público vai pro Vertex. Inferência sensível fica local.

set -e

LOG_DIR="$HOME/transparenciabr/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/vertex_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

YEAR="${1:-2025}"
MAX="${MAX:-10000}"  # piloto seguro: 10k notas, ~R$ 1-2

echo "============================================================"
echo "🤖 VERTEX PIPELINE — $(date)"
echo "Year: $YEAR  |  Max notas: $MAX"
echo "============================================================"

cd "$HOME/transparenciabr/engines"
[ ! -d node_modules/iconv-lite ] && npm install --silent

cd "$HOME/transparenciabr/engines/vertex"

echo ""
echo "▶ Classificador CEAP (Gemini 2.5 Flash)"
node classify_ceap.js --year "$YEAR" --max "$MAX" --batch-size 50 || echo "❌ classify falhou"

echo ""
echo "▶ Build status JSON pro dashboard mobile"
node build_status.js || echo "❌ build_status falhou"

echo ""
echo "📱 Painel mobile: https://transparenciabr.web.app/sprint.html"
echo "📊 JSON: https://storage.googleapis.com/datalake-tbr-clean/dashboard/sprint_status.json"
echo ""
echo "============================================================"
echo "🏁 VERTEX CONCLUÍDO: $(date)"
echo "============================================================"
