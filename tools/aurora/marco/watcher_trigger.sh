#!/bin/bash
# ============================================================
# WATCHER TRIGGER — encadeia regional → Brasil
# ============================================================
# Monitora o burner regional. Quando ele terminar:
# 1. Sobe leads regionais classificados pra BQ (tabela carpes_classificados)
# 2. Dispara burner_brasil.py
#
# Uso:
#   nohup bash watcher_trigger.sh > /home/manusalt13/watcher.log 2>&1 &
# ============================================================

set -u

REGIONAL_PID_FILE="/home/manusalt13/leads_prev_marco/burner.pid"
REGIONAL_DIR="/home/manusalt13/leads_prev_marco"
BRASIL_DIR="/home/manusalt13/leads_prev_brasil"
TBR_NERO="/home/manusalt13/tbr_nero"

mkdir -p "$BRASIL_DIR/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "============================================================"
log "WATCHER TRIGGER iniciado — aguardando regional terminar"
log "============================================================"

if [ ! -f "$REGIONAL_PID_FILE" ]; then
  log "❌ PID file regional não encontrado: $REGIONAL_PID_FILE"
  exit 1
fi

REGIONAL_PID=$(cat "$REGIONAL_PID_FILE")
log "Regional PID alvo: $REGIONAL_PID"

# Loop de espera
CHECK_INTERVAL=60
ELAPSED=0
while kill -0 "$REGIONAL_PID" 2>/dev/null; do
  if [ $((ELAPSED % 600)) -eq 0 ]; then
    LATEST_LOG=$(ls -t "$REGIONAL_DIR/logs/"burner_*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_LOG" ]; then
      LAST_LINE=$(tail -1 "$LATEST_LOG" 2>/dev/null | head -c 120)
      log "Regional vivo (${ELAPSED}s elapsed) — última: $LAST_LINE"
    else
      log "Regional vivo (${ELAPSED}s elapsed)"
    fi
  fi
  sleep $CHECK_INTERVAL
  ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

log "============================================================"
log "✅ Regional TERMINOU após ${ELAPSED}s"
log "============================================================"

# Verifica se completou com sucesso
sleep 5
LATEST_REGIONAL_JSONL=$(ls -t "$REGIONAL_DIR"/leads_prev_marco_classificados_*.jsonl 2>/dev/null | head -1)
if [ -n "$LATEST_REGIONAL_JSONL" ]; then
  REGIONAL_COUNT=$(wc -l < "$LATEST_REGIONAL_JSONL")
  log "📂 Regional output: $LATEST_REGIONAL_JSONL ($REGIONAL_COUNT linhas)"
else
  log "⚠️  Regional output não encontrado — pode ter crashed"
fi

# Sobe regional pra BQ (tabela própria, pra não conflitar com Brasil ainda não rodado)
if [ -n "$LATEST_REGIONAL_JSONL" ] && [ "${REGIONAL_COUNT:-0}" -gt 0 ]; then
  log "📥 Carregando regional pra BQ tabela carpes_classificados..."
  PROJECT=$(gcloud config get-value project 2>/dev/null)
  bq --location=southamerica-east1 mk -d --description "TBR Leads Previdenciários" tbr_leads_prev 2>/dev/null || true

  # Cria tabela carpes_classificados (schema simples flat)
  bq --location=southamerica-east1 query --use_legacy_sql=false "
    CREATE TABLE IF NOT EXISTS \`tbr_leads_prev.carpes_classificados\` (
      mes_arquivo STRING, competencia STRING, especie_cod INT64, especie STRING,
      motivo STRING, dt_nasc STRING, sexo STRING, clientela STRING, filiacao STRING,
      uf STRING, dt_indef STRING, ramo STRING, aps_cod INT64, aps STRING,
      dt_der STRING, aps_match STRING,
      sub_vertical STRING, tese_juridica_curta STRING, score_conversao_0_100 INT64,
      urgencia STRING, ticket_estimado_brl INT64, fundamentos_chave ARRAY<STRING>,
      rationale STRING, gemma_ok BOOL, gemma_err STRING,
      ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )" 2>&1 | tail -5

  # Achata o JSONL (top-level fields _gemma.* viram colunas)
  FLAT="$BRASIL_DIR/carpes_classificados_flat.jsonl"
  python3 <<PYEOF
import json
inf = "$LATEST_REGIONAL_JSONL"
out = "$FLAT"
n = 0
with open(inf) as fi, open(out, 'w') as fo:
    for line in fi:
        try: l = json.loads(line)
        except: continue
        g = l.get('_gemma') or {}
        row = {k: l.get(k) for k in ['mes_arquivo','competencia','especie_cod','especie','motivo','dt_nasc','sexo','clientela','filiacao','uf','dt_indef','ramo','aps_cod','aps','dt_der','aps_match']}
        row.update({
            'sub_vertical': g.get('sub_vertical'),
            'tese_juridica_curta': g.get('tese_juridica_curta'),
            'score_conversao_0_100': int(g.get('score_conversao_0_100') or 0),
            'urgencia': g.get('urgencia'),
            'ticket_estimado_brl': int(g.get('ticket_estimado_brl') or 0),
            'fundamentos_chave': g.get('fundamentos_chave') or [],
            'rationale': g.get('rationale'),
            'gemma_ok': bool(l.get('_gemma_ok')),
            'gemma_err': l.get('_gemma_err'),
        })
        for k in ['especie_cod','aps_cod']:
            try: row[k] = int(row[k]) if row[k] is not None else None
            except: row[k] = None
        fo.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')
        n += 1
print(f"flattened {n} rows")
PYEOF

  bq load \
    --location=southamerica-east1 \
    --source_format=NEWLINE_DELIMITED_JSON \
    --write_disposition=WRITE_TRUNCATE \
    --ignore_unknown_values \
    --max_bad_records=1000 \
    "${PROJECT}:tbr_leads_prev.carpes_classificados" \
    "$FLAT" 2>&1 | tail -10
  log "✅ Regional carregado em BQ: tbr_leads_prev.carpes_classificados"
fi

# Garante DDLs Brasil aplicadas
log "📋 Aplicando DDL Brasil..."
bq query --use_legacy_sql=false --location=southamerica-east1 < "$TBR_NERO/tools/aurora/marco/sql/01_dataset_e_tabelas.sql" 2>&1 | tail -5
bq query --use_legacy_sql=false --location=southamerica-east1 < "$TBR_NERO/tools/aurora/marco/sql/02_views_demo_marco.sql" 2>&1 | tail -5

# Dispara Brasil
log "============================================================"
log "🇧🇷 DISPARANDO BURNER BRASIL"
log "============================================================"

cd "$TBR_NERO"
git fetch origin main && git reset --hard origin/main 2>&1 | tail -3
log "Git OK: $(git log -1 --oneline)"

export BQ_PROJECT=$(gcloud config get-value project)
log "BQ_PROJECT=$BQ_PROJECT"

BRASIL_LOG="$BRASIL_DIR/logs/brasil_$(date +%Y%m%dT%H%M%S).log"
nohup python3 -u tools/aurora/marco/burner_brasil.py \
  --workers 8 \
  --top-pct-gemma 30 \
  --top-pct-flash 10 \
  --top-pct-pro 1 \
  > "$BRASIL_LOG" 2>&1 &
disown
BRASIL_PID=$!
echo "$BRASIL_PID" > "$BRASIL_DIR/brasil.pid"

log "✅ Brasil PID=$BRASIL_PID"
log "✅ Brasil LOG=$BRASIL_LOG"

sleep 8
if kill -0 "$BRASIL_PID" 2>/dev/null; then
  log "✅ Brasil VIVO após 8s"
  log "Últimas linhas log:"
  tail -15 "$BRASIL_LOG" | while read l; do log "  | $l"; done
else
  log "❌ Brasil MORREU em 8s — investigar:"
  tail -30 "$BRASIL_LOG" | while read l; do log "  | $l"; done
fi

log "============================================================"
log "WATCHER TRIGGER concluído"
log "============================================================"
