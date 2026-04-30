#!/bin/bash
# scripts/run_dayfull.sh
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  SPRINT DIA INTEIRO — TransparênciaBR                                 ║
# ║  Roda ~22h: 30/04 manhã → 01/05 manhã                                 ║
# ║  Pulo do gato: decifrar QUEM recebeu Emendas PIX                      ║
# ║  Auto-shutdown ao final pra não queimar VM acesa                      ║
# ╚══════════════════════════════════════════════════════════════════════╝

set -u  # NÃO use set -e — queremos continuar mesmo com falhas pontuais

# ─────────── CONFIG ───────────
AUTO_SHUTDOWN="${AUTO_SHUTDOWN:-1}"
VM_NAME="${VM_NAME:-tbr-mainframe}"
VM_ZONE="${VM_ZONE:-us-central1-a}"

# Anos
YEARS_PIX="2026 2025 2024 2023 2022 2021 2020"
YEARS_CEAP="2026 2025 2024 2023 2022 2021 2020 2019 2018 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008"
YEARS_EMENDAS="2026 2025 2024 2023 2022 2021 2020 2019 2018"
YEARS_PNCP="2026 2025 2024"
SNAPSHOT_DATE=$(date +%Y-%m-%d)

LOG_DIR="$HOME/transparenciabr/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dayfull_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  SPRINT DIA INTEIRO INICIADO                                          ║"
echo "║  $(date)                              ║"
echo "║  Log: $LOG_FILE          ║"
echo "║  Auto-shutdown: $AUTO_SHUTDOWN                                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# ─────────── DEPENDÊNCIAS ───────────
cd "$HOME/transparenciabr/engines"
if [ ! -d node_modules ] || [ ! -d node_modules/iconv-lite ]; then
  echo "→ npm install em engines/"
  npm install --silent
fi

# ─────────── BUILD STATUS HEARTBEAT (a cada 5 min, em background) ───────────
heartbeat_loop() {
  while true; do
    cd "$HOME/transparenciabr/engines/vertex" 2>/dev/null && \
      node build_status.js >/dev/null 2>&1 || true
    sleep 300
  done
}
heartbeat_loop &
HEARTBEAT_PID=$!
echo "💓 Heartbeat status iniciado (PID=$HEARTBEAT_PID, refresh 5min)"
trap "kill $HEARTBEAT_PID 2>/dev/null || true" EXIT

# Helper de log de fase
phase() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "  $(date)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

ingest() {
  # uso: ingest <source> [<flag1> <val1> ...]
  local src=$1; shift
  cd "$HOME/transparenciabr/engines/ingestor"
  if node universal_ingestor.js --source "$src" "$@"; then
    echo "✅ $src $@ OK"
  else
    echo "❌ $src $@ falhou — segue"
  fi
}

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 1 — CEAP CÂMARA (lastro do CEAP completo, 2008+)                ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "📊 FASE 1/9 — CEAP Câmara (recente primeiro)"
for YEAR in $YEARS_CEAP; do
  ingest ceap_camara --year "$YEAR"
done

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 2 — EMENDAS PIX (valores brutos por emenda)                     ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "💸 FASE 2/9 — Emendas PIX (valores brutos)"
for YEAR in $YEARS_PIX; do
  ingest emendas_pix --year "$YEAR"
done

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 3 — 🎯 PULO DO GATO: PLANO DE AÇÃO + EXECUTOR                   ║
# ║ Quem recebeu (CNPJ, banco, conta) e pra quê (objeto, valor)         ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "🎯 FASE 3/9 — PULO DO GATO: Quem recebeu Emendas PIX"

echo "→ Plano de Ação Especial (por ano)"
for YEAR in $YEARS_PIX; do
  ingest emendas_pix_planos --year "$YEAR"
done

echo "→ Executor Especial (snapshot universal — quem está recebendo)"
ingest emendas_pix_executor --snapshot "$SNAPSHOT_DATE"

echo "→ Relatório de Gestão (situação execução)"
ingest transferegov_relatorio_gestao --snapshot "$SNAPSHOT_DATE"

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 4 — EMENDAS PARLAMENTARES (CGU base completa)                   ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "🏛️ FASE 4/9 — Emendas Parlamentares (CGU)"
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  echo "⚠️ PORTAL_TRANSPARENCIA_API_KEY não definida (G.O.A.T.: nunca usar chave no repositório)."
  echo "   Cadastre em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email"
  echo "   e exporte: export PORTAL_TRANSPARENCIA_API_KEY=\"seu-token\""
  echo "   Pulando FASE 4 (Emendas Parlamentares + localidade CGU)."
else
  for YEAR in $YEARS_EMENDAS; do
    ingest emendas_parlamentares --year "$YEAR"
  done

  echo ""
  echo "→ CGU Emendas com localidade do gasto (para casar com PIX por município)"
  for YEAR in 2026 2025 2024; do
    ingest cgu_emendas_localidade --year "$YEAR"
  done
fi

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 5 — FOLHAS (Câmara + Senado) — pré-req do F.L.A.V.I.O.          ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "👥 FASE 5/9 — Folhas Câmara + Senado"
ingest funcionarios_camara --snapshot "$SNAPSHOT_DATE"
ingest servidores_senado --snapshot "$SNAPSHOT_DATE"
for YEAR in 2026 2025 2024 2023 2022 2021 2020; do
  ingest ceaps_senado --year "$YEAR"
done

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 6 — PNCP CONTRATOS (varre 2024-2026 mês a mês)                  ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "📜 FASE 6/9 — PNCP contratos públicos"
for YEAR in $YEARS_PNCP; do
  ingest pncp_contratos --year "$YEAR"
done

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 7 — FORENSE F.L.A.V.I.O. (gabinete familiar / endereço)         ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "🕵️ FASE 7/9 — F.L.A.V.I.O."
cd "$HOME/transparenciabr/engines/forensic"
node flavio.js --years 2024,2025,2026 || echo "❌ FLAVIO falhou"

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 8 — SANGUE E PODER (modo degradado: heurística sobrenome)       ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "🩸 FASE 8/9 — SANGUE E PODER (modo degradado, fallback sobrenome)"
cd "$HOME/transparenciabr/engines/forensic"
SANGUE_PODER_DEGRADED=1 node sangue_poder.js --years 2024,2025,2026 || \
  echo "❌ SANGUE E PODER falhou"

# ╔══════════════════════════════════════════════════════════════════════╗
# ║ FASE 9 — VERTEX CALIBRADA (classify CEAP 2025 — texto público apenas)║
# ║ R$ ~2 — só processa txtdescricao do CEAP                             ║
# ╚══════════════════════════════════════════════════════════════════════╝
phase "🤖 FASE 9/9 — Vertex classify CEAP 2025"
cd "$HOME/transparenciabr/engines/vertex"
node classify_ceap.js --year 2025 || echo "❌ Vertex classify falhou"

# ─────────── BUILD STATUS FINAL ───────────
phase "📊 Build status final"
node build_status.js || echo "❌ build_status falhou"

# ─────────── RESUMO ───────────
phase "🏁 SPRINT CONCLUÍDA — Resumo do Data Lake"
for src in ceap_camara emendas_pix emendas_pix_planos emendas_pix_executor \
           transferegov_relatorio_gestao emendas_parlamentares cgu_emendas_localidade \
           pncp_contratos funcionarios_camara servidores_senado ceaps_senado; do
  size=$(gsutil du -sh "gs://datalake-tbr-clean/$src/" 2>/dev/null | awk '{print $1, $2}')
  echo "  $src: ${size:-(vazio)}"
done

echo ""
echo "→ Forensic outputs:"
gsutil ls -lh "gs://datalake-tbr-clean/forensic/" 2>/dev/null || echo "  (vazio)"

echo ""
echo "→ Vertex outputs:"
gsutil ls -lh "gs://datalake-tbr-clean/vertex/" 2>/dev/null || echo "  (vazio)"

echo ""
echo "→ Painel mobile: https://transparenciabr.web.app/sprint"

# ─────────── AUTO-SHUTDOWN ───────────
kill $HEARTBEAT_PID 2>/dev/null || true

if [ "$AUTO_SHUTDOWN" = "1" ]; then
  echo ""
  echo "🛑 Auto-shutdown em 10 min — última chance pra cancelar (Ctrl+C ou kill $$)"
  sleep 600
  echo "💤 Stop agora."
  gcloud compute instances stop "$VM_NAME" --zone="$VM_ZONE" --quiet 2>&1 || \
    sudo shutdown -h now
else
  echo ""
  echo "⏸️ AUTO_SHUTDOWN=0 — VM permanece ligada."
fi

echo ""
echo "FIM: $(date)"
