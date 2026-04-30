#!/bin/bash
# scripts/run_forensic.sh
# Orquestrador isolado dos motores forenses — F.L.A.V.I.O. + SANGUE E PODER.
# Uso: bash scripts/run_forensic.sh [YEARS]
#
# Diretivas supremas:
#   "Toda nota é suspeita até prova contrária"
#   "Não fazemos denúncia — apresentamos fatos"
#   "ZERO dados devem ir para o Firestore. O destino exclusivo é o nosso Data Lake no GCS"

set -e

YEARS="${1:-2024,2025,2026}"
LOG_DIR="$HOME/transparenciabr/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/forensic_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "🕵️  MOTORES FORENSES — $(date)"
echo "Years: $YEARS"
echo "Log: $LOG_FILE"
echo "============================================================"

cd "$HOME/transparenciabr/engines"
[ ! -d node_modules/iconv-lite ] && npm install --silent

cd "$HOME/transparenciabr/engines/forensic"

echo ""
echo "▶ F.L.A.V.I.O. — secretários fantasmas + cluster familiar"
node flavio.js --years "$YEARS" || echo "❌ FLAVIO falhou"

echo ""
echo "▶ SANGUE E PODER — QSA × árvore TSE"
node sangue_poder.js --years "$YEARS" || echo "❌ SANGUE E PODER falhou"

echo ""
echo "📊 Outputs no Data Lake:"
gsutil ls -lh "gs://datalake-tbr-clean/forensic/flavio/" 2>/dev/null | tail -10
gsutil ls -lh "gs://datalake-tbr-clean/forensic/sangue_poder/" 2>/dev/null | tail -10

echo ""
echo "============================================================"
echo "🏁 FORENSE CONCLUÍDO: $(date)"
echo "============================================================"
