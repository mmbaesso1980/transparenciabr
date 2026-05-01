#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# scripts/run_gemma_worker.sh
# Orquestrador do Worker Contínuo Gemma 27B — TransparênciaBR
# ═══════════════════════════════════════════════════════════════════════════════
#
# Mantém a GPU L4 saturada 24/7 em paralelo ao run_l4_massive.sh.
# NÃO toca no job principal — apenas usa GPU ociosa (Fases 1-4).
# Detecta automaticamente Fase 5 (PaddleOCR) e cede VRAM (max_workers=1).
#
# Uso:
#   chmod +x scripts/run_gemma_worker.sh
#   nohup ./scripts/run_gemma_worker.sh > /dev/null 2>&1 &
#
#   # Teste rápido (100 notas por parlamentar):
#   CEAP_LIMIT_PER_PARLAMENTAR=100 ./scripts/run_gemma_worker.sh
#
#   # Apenas anos recentes:
#   CEAP_YEARS="2024,2025,2026" ./scripts/run_gemma_worker.sh
#
# Encerramento gracioso: kill -TERM <PID> ou kill $(cat ~/transparenciabr/gemma_worker.pid)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
PROJETO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${HOME}/transparenciabr/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/gemma_worker_${TIMESTAMP}.log"
PID_FILE="${HOME}/transparenciabr/gemma_worker.pid"
PYTHON="${PYTHON:-python3}"
VENV_DIR="${PROJETO_DIR}/.venv"

# ── Variáveis exportadas para o worker ───────────────────────────────────────
export GCS_CLEAN_BUCKET="${GCS_CLEAN_BUCKET:-datalake-tbr-clean}"
export GCS_RAW_BUCKET="${GCS_RAW_BUCKET:-datalake-tbr-raw}"
export CEAP_LIMIT_PER_PARLAMENTAR="${CEAP_LIMIT_PER_PARLAMENTAR:-}"
export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma2:27b-instruct-q4_K_M}"
export VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
export VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-pro}"
export LOG_LEVEL="${LOG_LEVEL:-INFO}"

# ── Pré-requisitos ─────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}"
mkdir -p "${HOME}/transparenciabr"

# Ativa virtualenv se existir
if [[ -f "${VENV_DIR}/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "${VENV_DIR}/bin/activate"
    echo "[run_gemma_worker] venv ativado: ${VENV_DIR}"
else
    echo "[run_gemma_worker] AVISO: venv não encontrado em ${VENV_DIR}. Usando Python do sistema."
fi

# ── Verifica disponibilidade do Gemma 27B no Ollama ──────────────────────────
echo "[run_gemma_worker] Verificando Ollama em ${OLLAMA_URL}..."
if ! curl -sf "${OLLAMA_URL}/api/tags" | grep -q "gemma2:27b"; then
    echo "❌ ERRO: Gemma 27B não disponível em ${OLLAMA_URL}/api/tags"
    echo "         Verifique: ollama list"
    exit 1
fi
echo "✅ Gemma 27B confirmado no Ollama."

# ── Verifica se já existe worker rodando ─────────────────────────────────────
if [[ -f "${PID_FILE}" ]]; then
    OLD_PID="$(cat "${PID_FILE}")"
    if kill -0 "${OLD_PID}" 2>/dev/null; then
        echo "⚠️  Worker já em execução (PID=${OLD_PID}). Abortando novo lançamento."
        echo "    Para forçar reinício: kill ${OLD_PID} && rm ${PID_FILE}"
        exit 1
    else
        echo "[run_gemma_worker] PID antigo ${OLD_PID} não existe mais. Limpando."
        rm -f "${PID_FILE}"
    fi
fi

# ── Informativo pré-lançamento ────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo " Worker Contínuo Gemma 27B — TransparênciaBR L4"
echo "═══════════════════════════════════════════════════════════════"
echo " GCS saída   : gs://${GCS_CLEAN_BUCKET}/ceap_classified/"
echo " Ollama URL  : ${OLLAMA_URL}"
echo " Modelo      : ${OLLAMA_MODEL}"
echo " Vertex      : ${VERTEX_MODEL}@${VERTEX_LOCATION}"
echo " Limite/par. : ${CEAP_LIMIT_PER_PARLAMENTAR:-sem limite}"
echo " Log         : ${LOG_FILE}"
echo "═══════════════════════════════════════════════════════════════"

# ── GPU — estado inicial ──────────────────────────────────────────────────────
echo ""
echo "=== GPU antes do lançamento ==="
nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total \
           --format=csv,noheader 2>/dev/null || echo "(nvidia-smi indisponível)"
echo ""

# ── Lança worker em background ────────────────────────────────────────────────
nohup "${PYTHON}" "${PROJETO_DIR}/engines/40_gemma_worker_continuo.py" \
    > "${LOG_FILE}" 2>&1 &
WORKER_PID=$!
disown "${WORKER_PID}"
echo "${WORKER_PID}" > "${PID_FILE}"

echo "🤖 Worker lançado — PID=${WORKER_PID}"
echo "   PID salvo em: ${PID_FILE}"
echo "   Encerramento: kill -TERM ${WORKER_PID}"
echo ""

# ── Aguarda 15s e exibe primeiras linhas do log ───────────────────────────────
echo "Aguardando 15s para verificar inicialização..."
sleep 15

if ! kill -0 "${WORKER_PID}" 2>/dev/null; then
    echo "❌ ERRO: worker encerrou prematuramente. Verifique o log:"
    echo "   ${LOG_FILE}"
    tail -30 "${LOG_FILE}" 2>/dev/null || true
    exit 1
fi

echo "=== Primeiras linhas do log (15s) ==="
tail -25 "${LOG_FILE}" 2>/dev/null || echo "(log ainda vazio)"
echo ""

# ── GPU — estado após inicialização ──────────────────────────────────────────
echo "=== GPU 15s após lançamento ==="
nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total \
           --format=csv,noheader 2>/dev/null || echo "(nvidia-smi indisponível)"
echo ""

echo "✅ Worker operacional. PID=${WORKER_PID}"
echo "   Monitorar: tail -f ${LOG_FILE}"
echo "   Parar:     kill -TERM ${WORKER_PID}"
