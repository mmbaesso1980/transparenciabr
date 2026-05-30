#!/usr/bin/env bash
# ============================================================================
# DEPLOY OCEAN WAYS — Firebase Hosting site "oceanways"
# Projeto: transparenciabr (89728155070)
# URL final: https://oceanways.web.app
# ============================================================================
# Execução: rodar dentro da VM aurora-cacador-br (tem gcloud + firebase + node)
# ============================================================================
set -euo pipefail

PROJECT="transparenciabr"
SITE="oceanways"
WORKDIR="/tmp/oceanways-hosting-$(date +%s)"

echo "[1/7] Preparando workdir: $WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

echo "[2/7] Clonando repo (raso, branch ops/wake-30mai)..."
# Se git clone direto falhar, baixar tarball
if ! git clone --depth=1 --branch=ops/wake-30mai https://github.com/mmbaesso1980/transparenciabr.git repo 2>/dev/null; then
  echo "  git clone falhou, tentando tarball..."
  curl -fsSL "https://codeload.github.com/mmbaesso1980/transparenciabr/tar.gz/refs/heads/ops/wake-30mai" -o repo.tgz
  mkdir -p repo
  tar -xzf repo.tgz -C repo --strip-components=1
fi

cd repo

echo "[3/7] Garantindo que site Firebase Hosting 'oceanways' exista..."
# Tenta criar; se já existir, ignora
firebase hosting:sites:create "$SITE" --project="$PROJECT" 2>&1 | grep -v "already exists" || true
firebase hosting:sites:list --project="$PROJECT" | grep -q "$SITE" && echo "  Site $SITE OK"

echo "[4/7] Aplicando firebase.oceanways.json (config separada do hosting principal)..."
curl -fsSL "https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/firebase.oceanways.json" \
  -o firebase.oceanways.json

echo "[5/7] Build do frontend Ocean Ways..."
cd apps/oceanways/frontend
npm ci --prefer-offline --no-audit --no-fund 2>&1 | tail -5
npm run build 2>&1 | tail -10

if [ ! -d "dist" ]; then
  echo "ERRO: build não gerou dist/"; exit 1
fi
echo "  dist/ gerado: $(du -sh dist/ | cut -f1)"

cd ../../..

echo "[6/7] Deploy Firebase Hosting site oceanways..."
firebase deploy \
  --only hosting:oceanways \
  --config firebase.oceanways.json \
  --project="$PROJECT" \
  --non-interactive 2>&1 | tail -20

echo "[7/7] Validando deploy..."
URL="https://${SITE}.web.app"
echo "  Testando $URL ..."
HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" "$URL")
echo "  HTTP status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "================================================================"
  echo "✅ OCEAN WAYS NO AR"
  echo "URL: $URL"
  echo "Alternativa: https://${SITE}.firebaseapp.com"
  echo "================================================================"
else
  echo "⚠️  HTTP $HTTP_CODE — verificar console Firebase"
fi
