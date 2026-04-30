#!/bin/bash
# scripts/setup_budget.sh
# Cria orçamento R$ 500/mês com alertas em 50/90/100% via Cloud Billing API.
#
# Pré-requisito: gcloud auth login + billing API habilitada.
# Uso: bash scripts/setup_budget.sh

set -e

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-$(gcloud beta billing projects describe $PROJECT_ID --format='value(billingAccountName)' | sed 's|billingAccounts/||')}"
BUDGET_AMOUNT_BRL="${BUDGET_AMOUNT_BRL:-500}"

echo "🛡️  Configurando orçamento de proteção"
echo "   Projeto: $PROJECT_ID"
echo "   Conta: $BILLING_ACCOUNT"
echo "   Valor: R$ $BUDGET_AMOUNT_BRL/mês"

# Habilitar APIs necessárias
gcloud services enable billingbudgets.googleapis.com cloudbilling.googleapis.com --project="$PROJECT_ID" 2>&1 | tail -3

# Criar orçamento
cat > /tmp/budget.json <<EOF
{
  "displayName": "TBR — Proteção Vertex/Compute (R\$ ${BUDGET_AMOUNT_BRL})",
  "budgetFilter": {
    "projects": ["projects/${PROJECT_ID}"],
    "calendarPeriod": "MONTH"
  },
  "amount": {
    "specifiedAmount": {
      "currencyCode": "BRL",
      "units": "${BUDGET_AMOUNT_BRL}"
    }
  },
  "thresholdRules": [
    {"thresholdPercent": 0.5,  "spendBasis": "CURRENT_SPEND"},
    {"thresholdPercent": 0.9,  "spendBasis": "CURRENT_SPEND"},
    {"thresholdPercent": 1.0,  "spendBasis": "CURRENT_SPEND"},
    {"thresholdPercent": 1.2,  "spendBasis": "CURRENT_SPEND"}
  ],
  "notificationsRule": {
    "disableDefaultIamRecipients": false
  }
}
EOF

TOKEN=$(gcloud auth print-access-token)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/budget.json \
  "https://billingbudgets.googleapis.com/v1/billingAccounts/${BILLING_ACCOUNT}/budgets" \
  | tee /tmp/budget_response.json

echo ""
echo "✅ Orçamento criado. Alertas em 50/90/100/120% irão pro email do billing admin."
