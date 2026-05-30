#!/usr/bin/env bash
# ============================================================
# FORÇA reload PAT v2 — TODOS os comandos com --project explícito
# Comandante Baesso · 30/mai/2026 16:50 BRT
#
# Lição do v1: gcloud config set project transparenciabr fez o
# lookup do secret cair em transparenciabr (89728155070) em vez
# de projeto-codex-br (282847675243). v2 nunca confia no config.
# ============================================================
set -euo pipefail

# IDENTIFICADORES IMUTÁVEIS — não dependem de gcloud config
PROJECT_CODEX="projeto-codex-br"          # 282847675243 — worker, vertex, pubsub, secret
PROJECT_TBR="transparenciabr"             # 89728155070  — dados, vm aurora-cacador-br, firestore
WORKER="maestro-worker"
REGION="us-east1"                          # Cloud Run
TOPIC="maestro-commands"
SECRET="maestro-github-pat"

echo "==[ 0. Cenário cross-project ]=="
echo "    Worker/Secret/PubSub/Vertex → $PROJECT_CODEX (282847675243)"
echo "    Firestore/VM/BQ dados        → $PROJECT_TBR (89728155070)"
echo ""

echo "==[ 1. Conta autenticada ]=="
gcloud auth list --filter=status:ACTIVE --format='value(account)'
echo ""

echo "==[ 2. Secret $SECRET em $PROJECT_CODEX ]=="
gcloud secrets versions list $SECRET --project=$PROJECT_CODEX --limit=5 2>&1 || {
  echo ""
  echo "❌ Sem permissão IAM no secret em $PROJECT_CODEX."
  echo "   Conta atual: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
  echo "   Precisa de: roles/secretmanager.secretAccessor + roles/secretmanager.viewer"
  echo ""
  echo "   Fix: peça ao Comandante para rodar (com conta owner):"
  echo "   gcloud projects add-iam-policy-binding $PROJECT_CODEX \\"
  echo "     --member=user:$(gcloud auth list --filter=status:ACTIVE --format='value(account)') \\"
  echo "     --role=roles/secretmanager.secretAccessor"
  exit 1
}
echo ""

echo "==[ 3. Valida PAT na origem (GET /user) ]=="
TOKEN=$(gcloud secrets versions access latest --secret=$SECRET --project=$PROJECT_CODEX 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Secret vazio em latest. Comandante precisa salvar versão nova:"
  echo "   read -s -p 'PAT: ' PAT && echo \"\$PAT\" | gcloud secrets versions add $SECRET --project=$PROJECT_CODEX --data-file=-"
  exit 2
fi
HTTP=$(curl -s -o /tmp/gh_user.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" https://api.github.com/user)
echo "    GET /user → HTTP $HTTP"
if [[ "$HTTP" != "200" ]]; then
  echo "❌ Token na ORIGEM está inválido (401 vem do GitHub, não do Cloud Run):"
  cat /tmp/gh_user.json
  echo ""
  echo "Comandante: gere PAT novo em https://github.com/settings/tokens (scopes: repo, workflow)"
  echo "Salve com: echo \"<TOKEN>\" | gcloud secrets versions add $SECRET --project=$PROJECT_CODEX --data-file=-"
  exit 3
fi
LOGIN=$(python3 -c "import json;print(json.load(open('/tmp/gh_user.json'))['login'])")
SCOPES=$(curl -sI -H "Authorization: Bearer $TOKEN" https://api.github.com/user | grep -i 'x-oauth-scopes' || echo "(scopes não retornados)")
echo "    user: $LOGIN"
echo "    $SCOPES"
echo ""

echo "==[ 4. Estado atual do worker $WORKER em $PROJECT_CODEX/$REGION ]=="
gcloud run services describe $WORKER \
  --project=$PROJECT_CODEX --region=$REGION \
  --format='value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)'
echo ""

echo "==[ 5. FORÇA revisão nova com env var carimbo ]=="
TS=$(date +%s)
gcloud run services update $WORKER \
  --project=$PROJECT_CODEX --region=$REGION \
  --update-secrets="GITHUB_PAT=$SECRET:latest" \
  --update-env-vars="FORCE_RELOAD_TS=$TS" \
  --no-traffic 2>&1 | tail -3
echo ""

echo "==[ 6. Direciona 100% para revisão mais nova ]=="
gcloud run services update-traffic $WORKER \
  --project=$PROJECT_CODEX --region=$REGION --to-latest 2>&1 | tail -3
echo ""

echo "==[ 7. Aguarda 20s para boot ]=="
sleep 20

echo "==[ 8. Estado pós-redeploy ]=="
gcloud run services describe $WORKER \
  --project=$PROJECT_CODEX --region=$REGION \
  --format='value(status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)'
echo ""

echo "==[ 9. Últimos 30 logs do worker (procurando boot ok) ]=="
gcloud run services logs read $WORKER \
  --project=$PROJECT_CODEX --region=$REGION --limit=30 2>&1 | tail -30
echo ""

echo "==[ 10. Redespacha ordem ao Maestro: retomar de onde parou ]=="
MSG_ID=$(date +%s)
ORDEM='/maestro reload-secret-and-resume-v2

Comandante Baesso. ALLOW IRRESTRITO. Worker Cloud Run redeployado com secret latest carregado.

Você JÁ entregou (não recomece do zero — CONTINUE):

PROJETO A (transparenciabr) — branch feat/radar-juridico-exclusivo:
- apps/radar-juridico/backend/* (FastAPI, 7 services, 4 routes, ~1500 linhas)
- apps/radar-juridico/frontend/* (Vite+React, AuthContext, api.js, firebase.js)
- apps/radar-juridico/pipelines/publicou_pegamos_alarme.py (393 linhas)
- apps/radar-juridico/schemas/bigquery_radar_juridico.sql + firestore_radar_juridico.rules
- apps/radar-juridico/docs/{ARCHITECTURE,LGPD,PAYWALLS}.md
- apps/radar-juridico/MAESTRO_TASKLIST.md (333 linhas — sua própria checklist)

PROJETO B (projeto-codex-br) — branch feat/oceanways-mvp:
- apps/oceanways/backend/* (FastAPI, auth, alerts, credits, payments, search — ~900 linhas)
- apps/oceanways/billing/* (Stripe + Mercado Pago)
- apps/oceanways/frontend/* (Vite+React, 5 pages, 7 components)
- apps/oceanways/search-engine/* (aggregator, parsers, cache)
- apps/oceanways/schemas/bigquery_oceanways.sql
- apps/oceanways/docs/{ARCHITECTURE,COVERAGE,MONETIZATION,TOS_LEGAL}.md
- apps/oceanways/MAESTRO_TASKLIST.md (251 linhas)
- .github/workflows/deploy_oceanways.yml

TAREFA AGORA — alterne entre A e B a cada 3 commits:

PROJETO A próximos passos:
1. Implementar tests/ unitários para cada service (pje_checker, aurora_enricher, bq_service, firestore_service) — pelo menos 1 happy path + 1 erro por arquivo
2. Completar routes/leads.py com paginação + filtro por advogado_cpf
3. Adicionar Cloud Run deploy script em apps/radar-juridico/deploy/
4. Frontend: criar pages/Dashboard.jsx, pages/LeadDetalhe.jsx, components/LeadCard.jsx, components/AlertaBadge.jsx
5. Aplicar Fase 0 DDL via shell_exec na VM aurora-cacador-br se ainda não aplicada:
   curl -fsSL https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/ops/runbooks/aplicar_ddl_radar_juridico.sh -o /tmp/ddl.sh && bash /tmp/ddl.sh
6. Abrir PR draft para main com MAESTRO_TASKLIST atualizada

PROJETO B próximos passos:
1. Completar search-engine/aggregator com retry + circuit breaker
2. Implementar parsers para LATAM, GOL, Azul, Smiles em search-engine/src/parsers/
3. Testes unitários por componente (pelo menos 1 happy + 1 erro)
4. Webhook idempotência em payments_stripe + payments_mercadopago
5. Frontend: completar AlertaCard, ResultCard, fluxo de compra de créditos
6. Deploy script us-east1
7. Abrir PR draft

REGRAS INVIOLÁVEIS:
- Commits Conventional: feat(radar-juridico):..., feat(oceanways):..., test(...), docs(...)
- 1 commit a cada ~10min de trabalho — não acumule
- PRs DRAFT, nunca merge sem aval humano
- NÃO me pergunte. NÃO pare em 401. Se PAT falhar 5x: abra issue + continue em sub-branches locais
- Não denunciamos. Mostramos. PT-BR formal, tom INFORMATIVO
- Notificar Telegram só ao FECHAR uma Fase completa OU em emergência real (F5/F3)

senha=aurora-cartman-2026 · allow_all=true · max_turns=120'

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

ID=$(gcloud pubsub topics publish $TOPIC --project=$PROJECT_CODEX --message="$PAYLOAD" --format='value(messageIds)')
echo "    ✅ Pub/Sub ID: $ID"
echo ""

echo "================================================================="
echo "✅ FIX v2 APLICADO."
echo "================================================================="
echo "Worker em $PROJECT_CODEX/$REGION recarregou secret latest"
echo "Maestro foi instruído a CONTINUAR (não recomeçar) de onde parou"
echo "Monitore via cron 70e45707 ou:"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/radar-juridico-exclusivo"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/oceanways-mvp"
