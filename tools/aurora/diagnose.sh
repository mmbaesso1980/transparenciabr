#!/bin/bash
# 01_diagnose.sh — coleta diagnóstico real do burner ATUAL
# Roda na VM tbr-mainframe via Cloud Shell (gcloud compute ssh tbr-mainframe --zone=us-central1-a)
# Tempo: ~30 segundos. Output curto.
# Cole o output INTEIRO de volta pro Computer pra ele decidir o patch certo.

set -uo pipefail
echo "=========================================="
echo " DIAGNÓSTICO BURNER L4 — $(date -u +%FT%TZ)"
echo "=========================================="

echo
echo "## 1. PROCESSOS"
ps -eo pid,etime,pcpu,pmem,rss,cmd --sort=-pcpu | grep -iE "burner|aurora|asmodeus|classifier|gemma|ollama|llama" | grep -v grep | head -20

echo
echo "## 2. GPU L4"
nvidia-smi --query-gpu=name,driver_version,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>&1
echo "Top procs na GPU:"
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>&1

echo
echo "## 3. CONFIGURAÇÃO DO BURNER (procura nos suspeitos comuns)"
for d in ~/tbr/burner ~/tbr/aurora ~/tbr/asmodeus ~/tbr/scripts ~/burner ~/aurora; do
  if [ -d "$d" ]; then
    echo ">>> $d <<<"
    ls -la "$d" 2>/dev/null | head -20
    grep -rEn "WORKERS|BATCH|MODEL|TEMPERATURE|MAX_TOKENS|model.*=" "$d" 2>/dev/null | grep -v ".pyc" | head -20
    echo
  fi
done

echo
echo "## 4. SUPERVISORES (systemd / cron / tmux)"
systemctl list-units --type=service --no-legend 2>/dev/null | grep -iE "burner|aurora|tbr|classifier" | head -10
crontab -l 2>/dev/null | grep -iE "burner|aurora|tbr" | head -5
tmux ls 2>/dev/null

echo
echo "## 5. THROUGHPUT REAL — quantas notas classificadas nos últimos 60min"
LATEST_LOG=$(ls -t /var/log/tbr/*.log 2>/dev/null | head -1)
if [ -n "${LATEST_LOG:-}" ]; then
  echo "Log mais recente: $LATEST_LOG"
  echo "Linhas no log: $(wc -l < "$LATEST_LOG")"
  echo "Últimas 5 linhas:"
  tail -5 "$LATEST_LOG"
  echo "Notas classificadas no último hora (heurística — busca palavras 'classified' / 'score'):"
  grep -cE "classified|score=|score_risco" "$LATEST_LOG" 2>/dev/null || echo "0"
else
  echo "Nenhum log em /var/log/tbr/"
  echo "Busca alternativa:"
  find ~ -maxdepth 4 -name "*.log" -newer /tmp -mmin -120 2>/dev/null | head -5
fi

echo
echo "## 6. DATA LAKE — última escrita em ceap_classified"
gsutil ls -l "gs://datalake-tbr-clean/ceap_classified/**/notas.jsonl" 2>&1 | sort -k2 | tail -10

echo
echo "## 7. OLLAMA / VLLM / TGI — qual servidor de modelo está rodando?"
curl -s --max-time 2 http://localhost:11434/api/tags 2>/dev/null | head -5
curl -s --max-time 2 http://localhost:8000/v1/models 2>/dev/null | head -5
curl -s --max-time 2 http://localhost:8080/v1/models 2>/dev/null | head -5
echo "(se nada respondeu acima, o modelo não tá num server REST padrão)"

echo
echo "## 8. ESPAÇO E MEMÓRIA"
df -h / /tmp 2>/dev/null
free -h

echo
echo "=========================================="
echo " FIM DO DIAGNÓSTICO"
echo " Cola TUDO acima de volta pro Computer."
echo "=========================================="
