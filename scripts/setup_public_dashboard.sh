#!/bin/bash
# Cria bucket dedicado tbr-public-dashboard com leitura pública TOTAL.
# Bucket separado preserva isolamento físico do datalake privado.
#
# Por que separado: GCP não aceita IAM condition em binding com allUsers
# (LintValidationUnits/PublicResourceAllowConditionCheck). Solução oficial
# Google: bucket dedicado pra conteúdo público.

set -e

BUCKET="tbr-public-dashboard"
LOCATION="${LOCATION:-us-central1}"

echo "📦 Criando bucket público dedicado: gs://$BUCKET"

if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "   Já existe — ok."
else
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$LOCATION" \
    --uniform-bucket-level-access \
    --public-access-prevention=inherited
fi

echo "🔓 Liberando leitura pública"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member=allUsers \
  --role=roles/storage.objectViewer

echo ""
echo "✅ Bucket público pronto."
echo ""
echo "Teste:"
echo "  echo '{\"test\":\"ok\"}' | gcloud storage cp - gs://$BUCKET/test.json"
echo "  curl -sI https://storage.googleapis.com/$BUCKET/test.json"
