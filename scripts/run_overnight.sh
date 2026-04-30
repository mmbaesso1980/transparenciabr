#!/bin/bash
# scripts/run_overnight.sh
# Sprint noturno — ingere CEAP Câmara + Emendas Parlamentares + Emendas PIX
# Roda no background com log; pode rodar enquanto Comandante dorme.

set -e

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
