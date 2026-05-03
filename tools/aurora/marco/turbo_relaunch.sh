#!/bin/bash
# ============================================================
# TURBO RELAUNCH — máximo gás na L4
# ============================================================
# 1. Mata regional + watcher
# 2. Reconfigura Ollama: NUM_PARALLEL=8 + KV cache quantizado
# 3. Restart Ollama (recarrega Gemma 27B com paralelismo)
# 4. Relança regional + watcher (Brasil ainda na fila)
# ============================================================

set -u

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "============================================================"
log "🔥 TURBO RELAUNCH — máxima saturação L4"
log "============================================================"

# 1. Mata processos antigos
log "Matando processos atuais..."
for pidfile in /home/manusalt13/leads_prev_marco/burner.pid \
               /home/manusalt13/watcher.pid \
               /home/manusalt13/leads_prev_brasil/brasil.pid; do
  if [ -f "$pidfile" ]; then
    PID=$(cat "$pidfile")
    if kill -0 "$PID" 2>/dev/null; then
      log "  kill $PID ($pidfile)"
      kill -TERM "$PID" 2>/dev/null
      sleep 2
      kill -KILL "$PID" 2>/dev/null
    fi
    rm -f "$pidfile"
  fi
done
log "Processos limpos"

# 2. Reconfigura Ollama systemd com env vars TURBO
log "Configurando Ollama TURBO..."
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/turbo.conf > /dev/null <<'EOF'
[Service]
# TURBO config — máxima saturação L4
Environment="OLLAMA_NUM_PARALLEL=8"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
Environment="OLLAMA_NUM_THREADS=8"
Environment="OLLAMA_MAX_QUEUE=512"
Environment="OLLAMA_HOST=127.0.0.1:11434"
EOF
log "  /etc/systemd/system/ollama.service.d/turbo.conf criado"

# 3. Restart Ollama
log "Reiniciando Ollama..."
sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 5
log "Ollama status:"
sudo systemctl is-active ollama
ps aux | grep -i ollama | grep -v grep | head -3

# 4. Pré-carrega Gemma (warm-up)
log "Pre-carregando Gemma 27B..."
curl -s http://127.0.0.1:11434/api/generate -d '{
  "model":"gemma2:27b-instruct-q4_K_M",
  "prompt":"ok",
  "stream":false,
  "keep_alive":-1,
  "options":{"num_predict":3,"num_ctx":2048}
}' | head -c 200
echo
sleep 3
log "VRAM após warm-up:"
nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader

# 5. Pull último código
cd /home/manusalt13/tbr_nero
git fetch origin main && git reset --hard origin/main 2>&1 | tail -3
log "Git: $(git log -1 --oneline)"

# 6. Relança regional TURBO (16 workers asyncio batendo no Ollama com 8 paralelos)
log "============================================================"
log "🚀 RELAUNCHING REGIONAL TURBO"
log "============================================================"
mkdir -p /home/manusalt13/leads_prev_marco/logs
LOG_REG=/home/manusalt13/leads_prev_marco/logs/burner_TURBO_$(date +%Y%m%dT%H%M%S).log
nohup python3 -u tools/aurora/marco/burner_prev_marco.py --workers 16 \
  > "$LOG_REG" 2>&1 &
disown
REG_PID=$!
echo $REG_PID > /home/manusalt13/leads_prev_marco/burner.pid
log "Regional PID=$REG_PID, log=$LOG_REG"

# 7. Relança watcher (vai disparar Brasil quando regional terminar)
sleep 3
log "Relaunch watcher..."
nohup bash tools/aurora/marco/watcher_trigger.sh \
  > /home/manusalt13/watcher.log 2>&1 &
disown
WATCHER_PID=$!
echo $WATCHER_PID > /home/manusalt13/watcher.pid
log "Watcher PID=$WATCHER_PID"

# 8. Monitora 30s pra confirmar throughput TURBO
log "============================================================"
log "Aguardando 30s pra medir throughput TURBO..."
log "============================================================"
sleep 30

log "Status pós-30s:"
ps -p $REG_PID -o pid,etime,pcpu,pmem,cmd 2>/dev/null
echo ""
log "L4:"
nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader
echo ""
log "Calls Gemma já feitos:"
grep -c "200 OK" "$LOG_REG" 2>/dev/null || echo 0
echo ""
log "Últimas linhas log:"
tail -15 "$LOG_REG"

log "============================================================"
log "✅ TURBO RELAUNCH CONCLUÍDO"
log "  Regional PID: $REG_PID"
log "  Watcher PID:  $WATCHER_PID"
log "  Brasil:       fila (após regional)"
log "============================================================"
