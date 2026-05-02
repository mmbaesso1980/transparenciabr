#!/bin/bash
# scripts/run_l4_overnight.sh
# Orquestrador NOTURNO ÚNICO — usa toda a L4 + Vertex calibrado.
# Encadeia: Ollama warmup → seed roster → overnight (CEAP/Emendas/Folha/Forense) → Vertex → shutdown.
#
# Uso na VM tbr-mainframe:
#   cd ~/transparenciabr
#   nohup bash scripts/run_l4_overnight.sh > /dev/null 2>&1 &
#   disown
#
# Diretivas supremas:
#   - ZERO Firestore. Destino exclusivo: GCS Data Lake.
#   - L4 nunca ociosa: Gemma 27B local pra forensics.
#   - Vertex Gemini 2.5 Pro apenas pra texto público (CEAP txtdescricao; Líder Supremo agent_1777236402725).
#   - Auto-shutdown ao final (economia).

set -e

LOG_DIR="$HOME/transparenciabr/logs"
mkdir -p "$LOG_DIR"
MASTER_LOG="$LOG_DIR/l4_overnight_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$MASTER_LOG") 2>&1

VM_NAME="${VM_NAME:-tbr-mainframe}"
VM_ZONE="${VM_ZONE:-us-central1-a}"
PROJECT="${PROJECT:-transparenciabr}"

echo "════════════════════════════════════════════════════════════"
echo "🌙 L4 OVERNIGHT — INÍCIO: $(date)"
echo "Master log: $MASTER_LOG"
echo "════════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────
# FASE 0 — WARMUP L4 / OLLAMA / GEMMA 27B
# ─────────────────────────────────────────────────────────────
echo ""
echo "🔥 FASE 0 — Warmup L4 + Gemma 27B"
nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu --format=csv || echo "⚠️ nvidia-smi falhou"

# Garante Ollama rodando
if ! curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  echo "→ Ollama não responde — startando…"
  nohup ollama serve > "$LOG_DIR/ollama.log" 2>&1 &
  sleep 5
fi

# Pull do Gemma 27B se ainda não existir (uma vez só, ~16GB)
if ! ollama list 2>/dev/null | grep -q "gemma2:27b"; then
  echo "→ Pulling gemma2:27b (primeira vez, ~16GB, ~10-15min)…"
  ollama pull gemma2:27b || echo "⚠️ pull falhou — forenses cairão pro fallback CPU"
fi

# Pré-carrega o modelo na VRAM (warmup query)
echo "→ Warmup query…"
curl -s http://127.0.0.1:11434/api/generate -d '{"model":"gemma2:27b","prompt":"ok","stream":false}' \
  | head -c 200 || echo "⚠️ warmup falhou"
echo ""

# ─────────────────────────────────────────────────────────────
# FASE 0.5 — SEED UNIVERSE ROSTER (594 parlamentares → GCS)
# ─────────────────────────────────────────────────────────────
echo ""
echo "🪐 FASE 0.5 — Seed roster universo"
curl -s -X POST "https://us-central1-${PROJECT}.cloudfunctions.net/seedUniverseRoster" \
  -H "Content-Type: application/json" -d '{}' --max-time 240 \
  | head -c 500 || echo "⚠️ seed falhou — /universo seguirá vazio"
echo ""

# ─────────────────────────────────────────────────────────────
# FASE 1-5 — INGESTÃO + FORENSES (delega pro run_overnight.sh, SEM auto-shutdown)
# ─────────────────────────────────────────────────────────────
echo ""
echo "📥 FASE 1-5 — Ingestão + Folha + Forenses (delegando run_overnight.sh)"
AUTO_SHUTDOWN=0 bash "$HOME/transparenciabr/scripts/run_overnight.sh" || \
  echo "⚠️ run_overnight teve falhas — seguindo pra Vertex mesmo assim"

# ─────────────────────────────────────────────────────────────
# FASE 6 — VERTEX CALIBRADO (Gemini 2.5 Pro classifica CEAP público)
# ─────────────────────────────────────────────────────────────
echo ""
echo "🤖 FASE 6 — Vertex classify_ceap (anos 2024-2026)"
for YEAR in 2026 2025 2024; do
  echo "→ Vertex classify CEAP $YEAR (max 10k notas, batch 50)"
  MAX=10000 bash "$HOME/transparenciabr/scripts/run_vertex.sh" "$YEAR" || \
    echo "⚠️ Vertex $YEAR falhou — continuando"
done

# ─────────────────────────────────────────────────────────────
# FASE 7 — RESUMO + AUTO-SHUTDOWN
# ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "🏁 L4 OVERNIGHT — FIM: $(date)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📊 Data Lake snapshot:"
for prefix in ceap_camara emendas_pix emendas_parlamentares ceaps_senado funcionarios_camara servidores_senado forensic universe dashboard; do
  echo "  gs://datalake-tbr-clean/$prefix/"
  gsutil du -sh "gs://datalake-tbr-clean/$prefix/" 2>/dev/null || echo "    (vazio)"
done

echo ""
echo "📱 Painel: https://transparenciabr.web.app/sprint.html"
echo "🪐 Universo: https://transparenciabr.web.app/universo"

# Auto-shutdown — economia
echo ""
echo "🛑 Auto-shutdown da VM em 5min ($(date))…"
sleep 300
gcloud compute instances stop "$VM_NAME" --zone="$VM_ZONE" --project="$PROJECT" --quiet || sudo shutdown -h now
