#!/bin/bash
# Torna a pasta gs://datalake-tbr-clean/dashboard/ publicamente legível via IAM
# (compatível com Uniform Bucket-Level Access — UBLA).
#
# Uso: bash scripts/setup_public_dashboard.sh
#
# Por que: o painel mobile (https://transparenciabr.web.app/sprint.html) precisa
# fazer fetch do sprint_status.json sem auth. Como o bucket TBR-clean é UBLA,
# não dá pra usar `gsutil acl ch` — tem que usar IAM em condition path.

set -e

BUCKET="datalake-tbr-clean"

echo "🔓 Liberando leitura pública APENAS de gs://$BUCKET/dashboard/*"

# IAM condition: só objetos cujo nome começa com 'dashboard/'
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member=allUsers \
  --role=roles/storage.objectViewer \
  --condition='^expression=resource.name.startsWith("projects/_/buckets/'"$BUCKET"'/objects/dashboard/"),title=public_dashboard,description=Painel mobile sprint TBR'

echo ""
echo "✅ Leitura pública liberada SOMENTE em gs://$BUCKET/dashboard/"
echo "   Resto do bucket continua privado."
echo ""
echo "Teste rápido:"
echo "  curl -sI https://storage.googleapis.com/$BUCKET/dashboard/sprint_status.json | head -3"
