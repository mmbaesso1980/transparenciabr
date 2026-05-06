#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# AURORA DEVASTADOR — ORCHESTRATOR (Risco R$3.000 | Hard kill R$3.500)
# ════════════════════════════════════════════════════════════════════════
# Coordena 7 jobs (A-G) em tmux, monitora billing a cada 5min, mata tudo
# se gasto Aurora > R$ 3.500. Reentrável: cada job é idempotente.
#
# Uso (Cloud Shell ou GCE com SA queima-vertex@projeto-codex-br):
#     bash aurora_orchestrator.sh start
#     bash aurora_orchestrator.sh status
#     bash aurora_orchestrator.sh stop
#     bash aurora_orchestrator.sh tail <job>
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── CONFIG ──────────────────────────────────────────────────────────────
PROJECT_BQ="transparenciabr"
PROJECT_VERTEX="projeto-codex-br"
SESSION="aurora"
LOG_DIR="${HOME}/aurora_logs"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARD_LIMIT_BRL=3500
SOFT_LIMIT_BRL=3000
CHECK_INTERVAL_SEC=300

mkdir -p "${LOG_DIR}"

# Credencial obrigatória
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-${HOME}/queima-vertex-key.json}"

# ── HELPERS ─────────────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*"; }

billing_total() {
  bq --project_id="${PROJECT_BQ}" query --nouse_legacy_sql --format=csv \
    "SELECT IFNULL(SUM(cost_brl),0) FROM \`${PROJECT_BQ}.transparenciabr.aurora_billing_log\`" \
    2>/dev/null | tail -1 | awk '{printf "%.2f", $1}'
}

ensure_billing_table() {
  bq --project_id="${PROJECT_BQ}" query --nouse_legacy_sql \
    "CREATE TABLE IF NOT EXISTS \`${PROJECT_BQ}.transparenciabr.aurora_billing_log\` (
       ts TIMESTAMP, job STRING, cost_brl FLOAT64, units INT64, note STRING
     )" 2>/dev/null || true
}

# ── COMMANDS ────────────────────────────────────────────────────────────
cmd_start() {
  ensure_billing_table

  if tmux has-session -t "${SESSION}" 2>/dev/null; then
    log "Sessão tmux '${SESSION}' já existe. Use 'stop' antes."
    exit 1
  fi

  log "Iniciando Aurora Devastador em tmux:${SESSION}"
  log "Logs: ${LOG_DIR}"
  log "Hard kill: R\$ ${HARD_LIMIT_BRL} | Soft alert: R\$ ${SOFT_LIMIT_BRL}"

  tmux new-session -d -s "${SESSION}" -n monitor

  # Janela 0: monitor billing kill-switch
  tmux send-keys -t "${SESSION}:monitor" \
    "bash '${SCRIPT_DIR}/aurora_orchestrator.sh' monitor 2>&1 | tee '${LOG_DIR}/monitor.log'" C-m

  # Job A — CEAP backfill leg 56 (gratuito, 6-8h)
  tmux new-window -t "${SESSION}" -n job_a
  tmux send-keys -t "${SESSION}:job_a" \
    "python3 '${SCRIPT_DIR}/job_a_ceap_backfill.py' 2>&1 | tee '${LOG_DIR}/job_a.log'; echo '=== A DONE ==='" C-m

  # Job B — Emendas autoria (gratuito, 3-4h)
  tmux new-window -t "${SESSION}" -n job_b
  tmux send-keys -t "${SESSION}:job_b" \
    "python3 '${SCRIPT_DIR}/job_b_emendas_autoria.py' 2>&1 | tee '${LOG_DIR}/job_b.log'; echo '=== B DONE ==='" C-m

  # Job C — Senado completo (R$200, 10-12h)
  tmux new-window -t "${SESSION}" -n job_c
  tmux send-keys -t "${SESSION}:job_c" \
    "python3 '${SCRIPT_DIR}/job_c_senado_completo.py' 2>&1 | tee '${LOG_DIR}/job_c.log'; echo '=== C DONE ==='" C-m

  # Job D — Flags PIX × Diários (gratuito, 4-6h) — depende de A+B
  tmux new-window -t "${SESSION}" -n job_d
  tmux send-keys -t "${SESSION}:job_d" \
    "echo 'Aguardando A+B (12min)...'; sleep 720; \
     while ! grep -q '=== A DONE ===' '${LOG_DIR}/job_a.log' 2>/dev/null; do sleep 120; done; \
     while ! grep -q '=== B DONE ===' '${LOG_DIR}/job_b.log' 2>/dev/null; do sleep 120; done; \
     python3 '${SCRIPT_DIR}/job_d_emendas_pix_diarios.py' 2>&1 | tee '${LOG_DIR}/job_d.log'; echo '=== D DONE ==='" C-m

  # Job E — Document AI batch (R$1.200, 4-6h) — independente
  tmux new-window -t "${SESSION}" -n job_e
  tmux send-keys -t "${SESSION}:job_e" \
    "python3 '${SCRIPT_DIR}/job_e_docai_batch_ceap.py' --max-docs 40000 2>&1 | tee '${LOG_DIR}/job_e.log'; echo '=== E DONE ==='" C-m

  # Job F — Embeddings massa (R$600, 8-10h) — após A (CEAP completo)
  tmux new-window -t "${SESSION}" -n job_f
  tmux send-keys -t "${SESSION}:job_f" \
    "echo 'Aguardando A (15min mín)...'; sleep 900; \
     while ! grep -q '=== A DONE ===' '${LOG_DIR}/job_a.log' 2>/dev/null; do sleep 180; done; \
     python3 '${SCRIPT_DIR}/job_f_embeddings_massa.py' --batch 250 2>&1 | tee '${LOG_DIR}/job_f.log'; echo '=== F DONE ==='" C-m

  # Job G — Dossiês grounded 500 (R$800, 4-5h) — após A+D
  tmux new-window -t "${SESSION}" -n job_g
  tmux send-keys -t "${SESSION}:job_g" \
    "echo 'Aguardando A+D (20min mín)...'; sleep 1200; \
     while ! grep -q '=== A DONE ===' '${LOG_DIR}/job_a.log' 2>/dev/null; do sleep 180; done; \
     while ! grep -q '=== D DONE ===' '${LOG_DIR}/job_d.log' 2>/dev/null; do sleep 180; done; \
     python3 '${SCRIPT_DIR}/job_g_dossie_grounded_massa.py' --top 500 2>&1 | tee '${LOG_DIR}/job_g.log'; echo '=== G DONE ==='" C-m

  log "Todas as 7 janelas iniciadas."
  log "Acompanhe: tmux attach -t ${SESSION}"
  log "Status:    bash $0 status"
}

cmd_monitor() {
  log "Monitor billing iniciado (intervalo ${CHECK_INTERVAL_SEC}s)"
  while true; do
    total=$(billing_total 2>/dev/null || echo "0.00")
    log "Aurora gasto acumulado: R\$ ${total}"

    # Comparação numérica via awk
    over=$(awk -v t="${total}" -v lim="${HARD_LIMIT_BRL}" 'BEGIN{print (t>lim)?1:0}')
    if [[ "${over}" == "1" ]]; then
      log "🚨 KILL-SWITCH: R\$ ${total} > R\$ ${HARD_LIMIT_BRL}"
      log "Encerrando todas as janelas Aurora..."
      tmux kill-session -t "${SESSION}" 2>/dev/null || true
      exit 99
    fi

    # Soft alert R$ 3.000
    over_soft=$(awk -v t="${total}" -v lim="${SOFT_LIMIT_BRL}" 'BEGIN{print (t>lim)?1:0}')
    if [[ "${over_soft}" == "1" ]]; then
      log "⚠️  ALERTA: R\$ ${total} > R\$ ${SOFT_LIMIT_BRL} (limite operacional)"
    fi

    sleep "${CHECK_INTERVAL_SEC}"
  done
}

cmd_status() {
  ensure_billing_table
  total=$(billing_total)
  echo "════════════════════════════════════════════════════════════════"
  echo " AURORA DEVASTADOR — STATUS"
  echo "════════════════════════════════════════════════════════════════"
  echo " Sessão tmux : ${SESSION}"
  echo " Gasto total : R\$ ${total}"
  echo " Soft limit  : R\$ ${SOFT_LIMIT_BRL}"
  echo " Hard limit  : R\$ ${HARD_LIMIT_BRL}"
  echo "────────────────────────────────────────────────────────────────"
  if tmux has-session -t "${SESSION}" 2>/dev/null; then
    echo " Janelas ativas:"
    tmux list-windows -t "${SESSION}" -F " - #W (#{?window_active,active,idle})"
  else
    echo " (Sessão tmux NÃO está rodando)"
  fi
  echo "────────────────────────────────────────────────────────────────"
  echo " Logs por job:"
  for j in monitor job_a job_b job_c job_d job_e job_f job_g; do
    f="${LOG_DIR}/${j}.log"
    if [[ -f "${f}" ]]; then
      lines=$(wc -l < "${f}")
      done_marker=$(grep -c "DONE ===" "${f}" 2>/dev/null || echo "0")
      echo "  ${j}: ${lines} linhas, done=${done_marker}, $(tail -1 "${f}" 2>/dev/null | cut -c1-80)"
    else
      echo "  ${j}: (sem log ainda)"
    fi
  done
  echo "════════════════════════════════════════════════════════════════"
}

cmd_tail() {
  local j="${1:?Use: tail <job_a|job_b|...|monitor>}"
  tail -f "${LOG_DIR}/${j}.log"
}

cmd_stop() {
  log "Parando sessão Aurora..."
  tmux kill-session -t "${SESSION}" 2>/dev/null && log "Sessão derrubada." || log "Sessão não existia."
}

# ── DISPATCH ────────────────────────────────────────────────────────────
case "${1:-}" in
  start)   cmd_start ;;
  monitor) cmd_monitor ;;
  status)  cmd_status ;;
  tail)    cmd_tail "${2:-}" ;;
  stop)    cmd_stop ;;
  *)
    cat <<EOF
Uso: $0 {start|status|tail <job>|stop}

  start    Inicia 7 jobs em tmux + monitor kill-switch
  status   Mostra gasto + estado das janelas
  tail X   Acompanha log de um job (job_a..job_g, monitor)
  stop     Mata sessão tmux completa

Pré-condições:
  - SA queima-vertex@projeto-codex-br com bigquery.dataEditor + jobUser em ${PROJECT_BQ}
  - GOOGLE_APPLICATION_CREDENTIALS apontando para chave da SA
  - Variáveis: PORTAL_TRANSPARENCIA_KEY, DOCAI_PROCESSOR_ID (opcional)
  - Tabela aurora_billing_log será criada automaticamente
EOF
    exit 1
    ;;
esac
