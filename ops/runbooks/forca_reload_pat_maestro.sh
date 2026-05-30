#!/usr/bin/env bash
# ============================================================
# FORÇA reload do PAT no maestro-worker Cloud Run + redespacha
# Comandante Baesso · 30/mai/2026 16:42 BRT
# Diagnóstico: Maestro reportou "401 Bad credentials" 16:38
# Causa raiz: secret latest não foi carregado pela revisão ativa
# ============================================================
set -euo pipefail

PROJECT_CODEX="projeto-codex-br"
WORKER="maestro-worker"
REGION="us-east1"
TOPIC="maestro-commands"

gcloud config set project "$PROJECT_CODEX" >/dev/null
echo "==[ 1. Estado atual do worker ]=="
gcloud run services describe "$WORKER" --region="$REGION" \
  --format='value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)' 2>&1
echo ""

echo "==[ 2. Versões do secret maestro-github-pat ]=="
gcloud secrets versions list maestro-github-pat --project="$PROJECT_CODEX" --limit=5 2>&1
echo ""

echo "==[ 3. Validando PAT novo localmente via GH API ]=="
TOKEN=$(gcloud secrets versions access latest --secret=maestro-github-pat --project="$PROJECT_CODEX" 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Secret vazio! Pare aqui."
  exit 1
fi
HTTP=$(curl -s -o /tmp/gh_user.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" https://api.github.com/user)
echo "    GET /user HTTP $HTTP"
if [[ "$HTTP" != "200" ]]; then
  echo "❌ Token inválido na origem! Comandante precisa gerar outro."
  cat /tmp/gh_user.json
  exit 2
fi
echo "    user: $(python3 -c "import json;print(json.load(open('/tmp/gh_user.json')).get('login'))")"
echo ""

echo "==[ 4. FORÇA redeploy da revisão com restart limpo ]=="
gcloud run services update "$WORKER" \
  --region="$REGION" \
  --update-secrets="GITHUB_PAT=maestro-github-pat:latest" \
  --update-env-vars="FORCE_RELOAD_TS=$(date +%s)" \
  --no-traffic 2>&1 | tail -5
echo ""

echo "==[ 5. Direciona 100% do tráfego para revisão mais nova ]=="
gcloud run services update-traffic "$WORKER" \
  --region="$REGION" --to-latest 2>&1 | tail -5
echo ""

echo "==[ 6. Aguardando 15s para health check estabilizar ]=="
sleep 15

echo "==[ 7. Validando que nova revisão está servindo ]=="
gcloud run services describe "$WORKER" --region="$REGION" \
  --format='value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)' 2>&1
echo ""

echo "==[ 8. Redespacha ordem ao Maestro: reload-secret + execute ]=="
MSG_ID=$(date +%s)
ORDEM='/maestro reload-secret-and-resume

Comandante Baesso, allow IRRESTRITO reconfirmado. PAT foi rotacionado, secret latest atualizado, worker Cloud Run forçado a recarregar. Você está autorizado a:

1. Re-ler secret GITHUB_PAT do ambiente (já atualizado)
2. Validar com GET /user
3. RETOMAR EXATAMENTE de onde parou às 16:38 (falha 401)
4. Projeto A (Radar Jurídico) e Projeto B (Ocean Ways) em paralelo
5. Não me pergunte mais. Não pare em nada. allow_all=true, max_turns=120

Se 401 voltar: NÃO PARE — abra issue no repo com label auth-broken e prossiga em sub-branches locais via git via shell_exec. Eu sincronizo manualmente depois.

senha=aurora-cartman-2026'

PAYLOAD=$(python3 -c "
import json
print(json.dumps({
    'chat_id': 6483072695,
    'message_id': $MSG_ID,
    'from_id': 6483072695,
    'senha': 'aurora-cartman-2026',
    'max_turns': 120,
    'allow_all': True,
    'text': '''$ORDEM'''
}, ensure_ascii=False))
")
ID=$(gcloud pubsub topics publish "$TOPIC" --project="$PROJECT_CODEX" --message="$PAYLOAD" --format="value(messageIds)")
echo "    ✅ Pub/Sub ID: $ID"
echo ""

echo "================================================================="
echo "✅ TUDO PRONTO. Maestro deve retomar em <60s."
echo "================================================================="
echo "Monitore:"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/radar-juridico-exclusivo"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/oceanways-mvp"
echo ""
echo "Cron 70e45707 vai te avisar quando aparecer SHA novo."
