# Dossiê v1 pipeline — Cloud Run (AURORA Forensic)

Serviço HTTP acionado por **Pub/Sub push** (`dossie-v1-pipeline`). Executa `manus_office/dossie_v1/dossie_pipeline.py`, publica PDF em GCS e atualiza Firestore em **`transparenciabr`** (cross-project).

Tom **INFORMATIVO** (TransparênciaBR): sem imputações criminais nem verbos proibidos na camada editorial — ver `manus_office/dossie_v1/prompts/`.

## Checklist pós-deploy (PR / operação)

- [ ] Logs Cloud Run **sem** `403 Missing or insufficient permissions` no Firestore (confirmar `FIRESTORE_PROJECT=transparenciabr` + IAM `datastore.user` na SA `queima-vertex@projeto-codex-br`).
- [ ] Pub/Sub: fila principal **sem** redelivery infinito (`subscription/num_undelivered_messages` ≈ 0 após ACK).
- [ ] Dossiê `erika-hilton` v1.1: revisor `[F-SEV-002]` com contagens não zeradas (gold fallback se agentes falharem — ver `dossie_pipeline.py`).
- [ ] `GET /health` retorna **200** com `gemini_key_set` e `pipeline_script_exists` verdadeiros no ambiente real.
- [ ] `GET /metrics` expõe séries Prometheus (`dossie_pipeline_jobs_total`, …); dashboard guia em `infrastructure/monitoring/aurora-dossie-dashboard.json`.

## Variáveis de ambiente (resumo)

| Variável | Descrição |
|----------|-------------|
| `FIRESTORE_PROJECT` | Default `transparenciabr` — destino das escritas Firestore. |
| `GEMINI_API_KEY` | Secret Manager (Cloud Run `--set-secrets`). |
| `GEMINI_TIMEOUT_SEC` | Segundos por `llm.invoke` (default `120`). |
| `GCS_BUCKET` / `GCS_PREFIX` | Destino do PDF. |
| `PUBSUB_PROJECT_ID` | Projeto onde vivem tópicos/subscrições (ex.: `projeto-codex-br`). |
| `DOSSIE_V1_TOPIC` / `DOSSIE_V1_DLQ_SUB` | Tópico principal e subscrição DLQ para `/admin/replay`. |
| `AURORA_ADMIN_TOKEN` ou secret `aurora-admin-token` | Autenticação `X-Aurora-Token` no replay. |

Lista completa: `infrastructure/env_dossie_v1.md`.

## Pub/Sub — payload

Compatível com mensagens **só com `slug`**; `alvo` é derivado (`SLUG_TO_ALVO` ou capitalização do kebab-case).

```json
{"slug": "erika-hilton", "alvo": "Erika Hilton", "versao": "1.1"}
```

Erros **não recuperáveis** (ex.: `slug` ausente) respondem **HTTP 200** para ACK e evitar redelivery infinito.

## Dead-letter queue (DLQ)

1. Terraform opcional: `cloudrun/dossieV1Pipeline/dlq.tf`.
2. Shell: `scripts/provision_dossie_v1_dlq.sh` (cria tópico DLQ e liga `dead_letter_policy` na subscrição push).
3. Firebase Function `dlqAlertFn` (`functions/src/maestro/dlqAlertFn.js`): exige `TELEGRAM_BOT_TOKEN` e `TELEGRAM_DLQ_CHAT_ID` no deploy.

## Endpoints

| Rota | Uso |
|------|-----|
| `POST /` | Push Pub/Sub (corpo envelope GCP). |
| `GET /health` | Readiness (script + Gemini). |
| `GET /healthz` | Alias de `/health`. |
| `GET /metrics` | Prometheus text. |
| `POST /admin/replay` | Header `X-Aurora-Token`; republica até `max` mensagens da DLQ para o tópico principal. |

## Build e deploy

```bash
gcloud builds submit cloudrun/dossieV1Pipeline \
  --config=cloudrun/dossieV1Pipeline/cloudbuild.yaml \
  --project=projeto-codex-br --region=southamerica-east1
```

Teste manual de mensagem:

```bash
gcloud pubsub topics publish dossie-v1-pipeline \
  --message='{"slug":"erika-hilton","alvo":"Erika Hilton","versao":"1.1"}' \
  --project=projeto-codex-br
```

## Observabilidade auxiliar

- `manus_office/agents_autonomos/agent_log_watcher.py` — cron 10 min; `DISCORD_WEBHOOK_URL`, `GCP_PROJECT`, `DOSSIE_RUN_SERVICE`.

## Segurança

- Não logar CPF, telefone ou endereço integral; mascarar conforme skill LGPD.
- Não versionar `AURORA_ADMIN_TOKEN` nem webhooks Discord no Git.
