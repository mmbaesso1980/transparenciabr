#!/bin/bash
# scripts/run_overnight.sh
# Sprint noturno — ingere CEAP Câmara + Emendas Parlamentares + Emendas PIX
# Roda no background com log; pode rodar enquanto Comandante dorme.

set -e

# Auto-shutdown ao final (evita VM ligada custando $$)
AUTO_SHUTDOWN="${AUTO_SHUTDOWN:-1}"
VM_NAME="${VM_NAME:-tbr-mainframe}"
VM_ZONE="${VM_ZONE:-us-central1-a}"

LOG_DIR="$HOME/transparenciabr/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/overnight_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "🌙 SPRINT NOTURNO INICIADO: $(date)"
echo "Log: $LOG_FILE"
echo "============================================================"

# Garantir deps na raiz engines/ (onde Node ESM resolve packages dos submódulos)
cd "$HOME/transparenciabr/engines"
if [ ! -d node_modules ] || [ ! -d node_modules/iconv-lite ]; then
  echo "Instalando dependências em engines/ ..."
  npm install --silent
fi

cd "$HOME/transparenciabr/engines/ingestor"

# Anos a ingerir (mais recentes primeiro — falha rápido se algo quebrar)
YEARS_RECENT="2026 2025 2024 2023"
YEARS_HISTORIC="2022 2021 2020 2019 2018 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008"

# ─────────────────────────────────────────────────────────────────────
# FASE 1 — CEAP CÂMARA (sem auth, file-based, mais rápido)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 FASE 1/3 — CEAP Câmara dos Deputados"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for YEAR in $YEARS_RECENT $YEARS_HISTORIC; do
  echo ""
  echo "→ CEAP ano $YEAR"
  if node universal_ingestor.js --source ceap_camara --year $YEAR; then
    echo "✅ CEAP $YEAR OK"
  else
    echo "❌ CEAP $YEAR falhou — continuando próximo"
  fi
done

# ─────────────────────────────────────────────────────────────────────
# FASE 2 — EMENDAS PIX (Transferegov — sem auth)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💸 FASE 2/3 — Emendas PIX (Transferegov)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# EC 105 é de 2019; só faz sentido a partir de 2020
for YEAR in 2026 2025 2024 2023 2022 2021 2020; do
  echo ""
  echo "→ Emendas PIX ano $YEAR"
  if node universal_ingestor.js --source emendas_pix --year $YEAR; then
    echo "✅ Emendas PIX $YEAR OK"
  else
    echo "❌ Emendas PIX $YEAR falhou — continuando próximo"
  fi
done

# ─────────────────────────────────────────────────────────────────────
# FASE 3 — EMENDAS PARLAMENTARES (CGU — REQUER API KEY)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏛️ FASE 3/3 — Emendas Parlamentares (CGU)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -z "$PORTAL_TRANSPARENCIA_API_KEY" ]; then
  echo "⚠️ PORTAL_TRANSPARENCIA_API_KEY não configurada."
  echo "   Cadastre email em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email"
  echo "   e exporte a chave: export PORTAL_TRANSPARENCIA_API_KEY=\"seu-token\""
  echo "   Pulando Fase 3."
else
  for YEAR in 2026 2025 2024 2023 2022 2021 2020 2019 2018; do
    echo ""
    echo "→ Emendas Parlamentares ano $YEAR"
    if node universal_ingestor.js --source emendas_parlamentares --year $YEAR; then
      echo "✅ Emendas Parlamentares $YEAR OK"
    else
      echo "❌ Emendas Parlamentares $YEAR falhou — continuando próximo"
    fi
  done
fi

echo ""
echo "============================================================"
echo "🏁 SPRINT NOTURNO CONCLUÍDO: $(date)"
echo "============================================================"
echo ""
echo "📊 RESUMO DO DATA LAKE:"
gsutil du -sh gs://datalake-tbr-raw/ceap_camara/ 2>/dev/null || echo "(CEAP raw vazio)"
gsutil du -sh gs://datalake-tbr-clean/ceap_camara/ 2>/dev/null || echo "(CEAP clean vazio)"
gsutil du -sh gs://datalake-tbr-raw/emendas_pix/ 2>/dev/null || echo "(Emendas PIX raw vazio)"
gsutil du -sh gs://datalake-tbr-clean/emendas_pix/ 2>/dev/null || echo "(Emendas PIX clean vazio)"
gsutil du -sh gs://datalake-tbr-raw/emendas_parlamentares/ 2>/dev/null || echo "(Emendas Parlamentares raw vazio)"
gsutil du -sh gs://datalake-tbr-clean/emendas_parlamentares/ 2>/dev/null || echo "(Emendas Parlamentares clean vazio)"

# ─────────────────────────────────────────────────────────────────────
# FASE 4 — FOLHA DE GABINETE (Câmara + Senado snapshots + CEAPS Senado)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 FASE 4/5 — Folha de Gabinete (Câmara + Senado)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$HOME/transparenciabr/engines/ingestor"

# Snapshot único — funcionários Câmara
if node universal_ingestor.js --source funcionarios_camara --snapshot $(date +%Y-%m-%d); then
  echo "✅ Funcionários Câmara OK"
else
  echo "❌ Funcionários Câmara falhou"
fi

# Snapshot único — servidores comissionados Senado
if node universal_ingestor.js --source servidores_senado --snapshot $(date +%Y-%m-%d); then
  echo "✅ Servidores Senado OK"
else
  echo "❌ Servidores Senado falhou"
fi

# CEAPS Senado anuais
for YEAR in 2026 2025 2024 2023 2022 2021 2020; do
  echo ""
  echo "→ CEAPS Senado ano $YEAR"
  if node universal_ingestor.js --source ceaps_senado --year $YEAR; then
    echo "✅ CEAPS Senado $YEAR OK"
  else
    echo "❌ CEAPS Senado $YEAR falhou"
  fi
done

# ─────────────────────────────────────────────────────────────────────
# FASE 5 — MOTORES FORENSES (F.L.A.V.I.O. + SANGUE E PODER)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕵️  FASE 5/5 — Motores Forenses"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$HOME/transparenciabr/engines/forensic"

echo ""
echo "→ F.L.A.V.I.O."
node flavio.js --years 2024,2025,2026 || echo "❌ FLAVIO falhou"

echo ""
echo "→ SANGUE E PODER"
node sangue_poder.js --years 2024,2025,2026 || echo "❌ SANGUE E PODER falhou"

echo ""
echo "📊 Output forense:"
gsutil ls -lh "gs://datalake-tbr-clean/forensic/" 2>/dev/null || echo "(forensic vazio)"

# ─────────────────────────────────────────────────────────────────────
# AUTO-SHUTDOWN
# ─────────────────────────────────────────────────────────────────────
if [ "$AUTO_SHUTDOWN" = "1" ]; then
  echo ""
  echo "🛑 Auto-shutdown habilitado. Desligando VM ($VM_NAME, zona $VM_ZONE) em 5min..."
  sleep 300
  echo "💤 Stop agora."
  gcloud compute instances stop "$VM_NAME" --zone="$VM_ZONE" --quiet 2>&1 || sudo shutdown -h now
else
  echo ""
  echo "⏸️  AUTO_SHUTDOWN=0 — VM permanecerá ligada."
fi
