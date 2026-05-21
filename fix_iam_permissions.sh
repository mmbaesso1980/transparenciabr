#!/bin/bash
# ============================================================
# fix_iam_permissions.sh — Corrige permissões IAM para go-live
# DEVE ser executado pelo OWNER do projeto (manusalt13)
# NÃO pela service account tbr-ingestor
# ============================================================
#
# Uso: bash fix_iam_permissions.sh
# Ou no Cloud Shell: gcloud auth list  (confirme que é o owner)
#
# ============================================================

set -euo pipefail

PROJECT="transparenciabr"
SA="tbr-ingestor@transparenciabr.iam.gserviceaccount.com"

echo "🔐 Corrigindo permissões IAM para $SA no projeto $PROJECT"
echo ""

# 1. Firestore / Datastore — necessário para engines 27, 05
echo "[1/4] Adicionando roles/datastore.user (Firestore)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" \
    --role="roles/datastore.user" \
    --quiet && echo "  ✅ OK" || echo "  ⚠️  Já existe ou erro"

# 2. Service Account User — necessário para firebase deploy
echo "[2/4] Adicionando roles/iam.serviceAccountUser (Firebase Deploy)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" \
    --role="roles/iam.serviceAccountUser" \
    --quiet && echo "  ✅ OK" || echo "  ⚠️  Já existe ou erro"

# 3. Cloud Functions Developer — necessário para firebase deploy --only functions
echo "[3/4] Adicionando roles/cloudfunctions.developer (Cloud Functions)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" \
    --role="roles/cloudfunctions.developer" \
    --quiet && echo "  ✅ OK" || echo "  ⚠️  Já existe ou erro"

# 4. ActAs na App Engine default service account
echo "[4/4] Adicionando ActAs na SA padrão do App Engine..."
gcloud iam service-accounts add-iam-policy-binding \
    "${PROJECT}@appspot.gserviceaccount.com" \
    --member="serviceAccount:$SA" \
    --role="roles/iam.serviceAccountUser" \
    --project="$PROJECT" \
    --quiet && echo "  ✅ OK" || echo "  ⚠️  Já existe ou erro"

echo ""
echo "=========================================="
echo "✅ Permissões IAM configuradas!"
echo ""
echo "Agora rode na VM:"
echo "  gcloud compute ssh tbr-mainframe-us-east1-d --zone=us-east1-d"
echo "  cd ~/transparenciabr && git pull && bash run_pipeline.sh"
echo "=========================================="
