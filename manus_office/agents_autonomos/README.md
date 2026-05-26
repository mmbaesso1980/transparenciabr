# AURORA · Agentes Autônomos v1.0

Quartel-general dos 5 agentes autônomos do Comandante Baesso.
Todos imperativo INFORMATIVO (skill `transparenciabr-lei`).

| # | Agente | Cadência | Função | Trigger |
|---|---|---|---|---|
| 1 | `agent_self_healer.py` | 6h | Cura plataforma | Cloud Scheduler → Pub/Sub `agent-self-healer` |
| 2 | `telegramBot.js` | sob demanda | Bot bidirecional /dossie /status /leads /skill | Webhook HTTPS |
| 3 | `agent_lead_hunter.py` | Diário 06h-BRT | Caça leads INSS qualificados | Cloud Scheduler |
| 4 | `agent_dossie_comparativo.py` | sob demanda | Dossiê A_vs_B (R$ 2k/un) | Pub/Sub `dossie-comparativo` |
| 5 | `memoria_maestro.py` | reflect 24h, prune 7d | Memória persistente Maestro | Cloud Scheduler |
| 6 | `agent_log_watcher.py` | 10 min | Erros Cloud Run dossie-v1-pipeline → Discord | Cloud Scheduler |

## Deploy (Cloud Shell)

```bash
# Container compartilhado (Dockerfile abaixo)
gcloud builds submit \
  --tag southamerica-east1-docker.pkg.dev/projeto-codex-br/aurora/agents-autonomos:v1.0 \
  --project=projeto-codex-br

# Cloud Run Jobs
for AGENT in self_healer lead_hunter dossie_comparativo memoria_reflect; do
  gcloud run jobs create agent-${AGENT/_/-} \
    --image=southamerica-east1-docker.pkg.dev/projeto-codex-br/aurora/agents-autonomos:v1.0 \
    --region=southamerica-east1 \
    --command=python3 \
    --args=/app/agent_${AGENT}.py \
    --service-account=queima-vertex@projeto-codex-br.iam.gserviceaccount.com \
    --set-env-vars=GOOGLE_CLOUD_PROJECT=transparenciabr,TELEGRAM_BOT_TOKEN=$$TELEGRAM_BOT_TOKEN \
    --project=projeto-codex-br
done

# Schedulers
gcloud scheduler jobs create http aurora-self-healer-6h \
  --schedule="0 */6 * * *" --time-zone="America/Sao_Paulo" \
  --uri="https://southamerica-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/projeto-codex-br/jobs/agent-self-healer:run" \
  --http-method=POST --oauth-service-account-email=queima-vertex@projeto-codex-br.iam.gserviceaccount.com \
  --project=projeto-codex-br

gcloud scheduler jobs create http aurora-lead-hunter-daily \
  --schedule="0 6 * * *" --time-zone="America/Sao_Paulo" \
  --uri="https://southamerica-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/projeto-codex-br/jobs/agent-lead-hunter:run" \
  --http-method=POST --oauth-service-account-email=queima-vertex@projeto-codex-br.iam.gserviceaccount.com \
  --project=projeto-codex-br

# Telegram webhook
curl "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/setWebhook?url=https://southamerica-east1-transparenciabr.cloudfunctions.net/telegramWebhook"
```

## Dependências

```
google-cloud-firestore
google-cloud-pubsub
google-cloud-storage
google-cloud-run
google-cloud-aiplatform
reportlab
requests
numpy
```

## Custos estimados (Comandante)

- self_healer: ~R$ 0,02/execução × 4/dia = R$ 2,40/mês
- lead_hunter: ~R$ 0,15/dia (NewsAPI free tier + Vertex) = R$ 4,50/mês
- dossie_comparativo: R$ 0,80/un (produto R$ 2.000) — margem 99,96%
- memoria_maestro: R$ 0,10/reflect = R$ 3,00/mês

Total infra: <R$ 10/mês. Crédito codex-br R$ 5.677,28 cobre 47 anos.
