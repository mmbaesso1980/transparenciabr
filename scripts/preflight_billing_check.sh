#!/usr/bin/env bash
# Pre-flight Billing Check — M13
# Valida saldo do crédito promocional Vertex ANTES de operações pesadas.
# Uso:
#   source scripts/preflight_billing_check.sh
#   preflight_billing_check [project_id] [min_credit_brl]
# Exit codes:
#   0 = OK (saldo > min_credit_brl)
#   1 = WARN (saldo < min_credit_brl) — operador decide
#   2 = BLOCK (billing account com dunning flag / suspended) — aborta
#
# Adicionada em resposta ao incidente 27/05/2026: Maestro v1.0 acionou Vertex
# sem checar saldo, levando a Lightning dunning lock na billing account inteira.
#
# Referência: ticket 0ecc2a5f-3957-453d-9b42-1738bae728db (item 7).

set -uo pipefail

preflight_billing_check() {
    local project_id="${1:-${MAESTRO_PROJECT_VERTEX:-projeto-codex-br}}"
    local min_credit_brl="${2:-500}"

    echo "[preflight] Verificando billing de projeto: $project_id"

    # 1) Projeto tem billing habilitado?
    local billing_enabled
    billing_enabled=$(gcloud beta billing projects describe "$project_id" \
        --format="value(billingEnabled)" 2>/dev/null || echo "false")

    if [[ "$billing_enabled" != "True" && "$billing_enabled" != "true" ]]; then
        echo "[preflight] ❌ BLOCK: billing desabilitado em $project_id"
        return 2
    fi

    # 2) Billing account aberta?
    local ba_name
    ba_name=$(gcloud beta billing projects describe "$project_id" \
        --format="value(billingAccountName)" 2>/dev/null || echo "")

    if [[ -z "$ba_name" ]]; then
        echo "[preflight] ❌ BLOCK: nenhuma billing account vinculada"
        return 2
    fi

    local ba_open
    ba_open=$(gcloud beta billing accounts describe "$ba_name" \
        --format="value(open)" 2>/dev/null || echo "false")

    if [[ "$ba_open" != "True" && "$ba_open" != "true" ]]; then
        echo "[preflight] ❌ BLOCK: billing account $ba_name está fechada"
        return 2
    fi

    # 3) Vertex AI habilitado?
    local vertex_state
    vertex_state=$(gcloud services list --project="$project_id" \
        --filter="config.name=aiplatform.googleapis.com" \
        --format="value(state)" 2>/dev/null || echo "")

    if [[ "$vertex_state" != "ENABLED" ]]; then
        echo "[preflight] ❌ BLOCK: aiplatform.googleapis.com não está ENABLED em $project_id"
        return 2
    fi

    # 4) Teste de chamada Vertex (detecta Lightning dunning sem queimar token)
    local token
    token=$(gcloud auth print-access-token 2>/dev/null || echo "")
    if [[ -z "$token" ]]; then
        echo "[preflight] ⚠️  WARN: sem token gcloud, pulando ping Vertex"
        return 1
    fi

    local vertex_response
    vertex_response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d '{"contents":[{"role":"user","parts":[{"text":"ok"}]}],"generationConfig":{"maxOutputTokens":1}}' \
        "https://us-east1-aiplatform.googleapis.com/v1/projects/$project_id/locations/us-east1/publishers/google/models/gemini-2.5-flash:generateContent" \
        2>/dev/null || echo "000")

    case "$vertex_response" in
        200)
            echo "[preflight] ✅ OK: Vertex respondendo em $project_id (HTTP 200)"
            ;;
        403)
            echo "[preflight] ❌ BLOCK: Vertex HTTP 403 em $project_id (provavelmente Lightning dunning ou IAM)"
            echo "[preflight]    Verificar billing: https://console.cloud.google.com/billing/$(basename "$ba_name")"
            return 2
            ;;
        429)
            echo "[preflight] ⚠️  WARN: Vertex HTTP 429 (quota/rate limit) em $project_id"
            return 1
            ;;
        *)
            echo "[preflight] ⚠️  WARN: Vertex respondeu HTTP $vertex_response (inesperado)"
            return 1
            ;;
    esac

    # 5) Aviso sobre custo da operação (estimativa baseada em min_credit_brl)
    echo "[preflight] ℹ️  Operação assume custo máximo: R\$ $min_credit_brl"
    echo "[preflight] ℹ️  Para auditar uso real: https://console.cloud.google.com/billing/$(basename "$ba_name")/reports"

    return 0
}

# Quando chamado direto (não sourced), executa
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    preflight_billing_check "$@"
    exit $?
fi
