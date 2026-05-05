#!/usr/bin/env bash
# Orquestra crawlers/ingestões num único run (timer systemd pode chamar isto a cada 4h).
# Uso na raiz do repo: ./scripts/crawler_run.sh
# CRAWLER_DRY_RUN=1 ./scripts/crawler_run.sh — apenas imprime comandos
#
# Variável opcional: GOOGLE_APPLICATION_CREDENTIALS

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
RUN_TS="${RUN_TS:-$(date +%Y%m%d_%H%M)}"
LOG="logs/crawler_${RUN_TS}.log"

run_py() {
  local script="$1"
  shift
  if [[ "${CRAWLER_DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] python3 $script $*" | tee -a "$LOG"
    return 0
  fi
  python3 "$script" "$@" 2>&1 | tee -a "$LOG"
}

echo "[$(date -Iseconds)] Início crawler_run RUN_TS=$RUN_TS CRAWLER_DRY_RUN=${CRAWLER_DRY_RUN:-0}" | tee -a "$LOG"

# Querido Diário — por defeito dry-run (sem escrita Firestore)
QD_EXTRA=(--batch --dry-run --max-politicos "${CRAWLER_MAX_POLITICOS:-50}")
if [[ "${CRAWLER_APPLY_QUERIDO:-}" == "1" ]]; then
  QD_EXTRA=(--batch --max-politicos "${CRAWLER_MAX_POLITICOS:-50}")
fi
run_py engines/10_universal_crawler.py "${QD_EXTRA[@]}"

# Senado → Firestore: só com bandeira explícita (evita escrita acidental em cron)
if [[ "${CRAWLER_ALLOW_FIRESTORE_WRITE:-}" == "1" ]]; then
  run_py engines/14_ingest_senadores.py || true
else
  echo "[skip] engines/14_ingest_senadores.py (defina CRAWLER_ALLOW_FIRESTORE_WRITE=1)" | tee -a "$LOG"
fi

run_py engines/15_ingest_pncp.py --dry-run --max-pages 2 || true

run_py engines/17_ingest_siop_budget.py --dry-run || true

run_py engines/18_ingest_pncp_pca.py --dry-run || true

run_py engines/11_ghost_hunter.py --dry-run || true

echo "[$(date -Iseconds)] Fim crawler_run" | tee -a "$LOG"
