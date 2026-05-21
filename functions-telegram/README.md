# TransparênciaBR — Telegram (`functions-telegram`)

Codebase Firebase separado (**`telegram-bot`**) com duas Cloud Functions Gen2 em **`us-east1`**:

- **`telegramWebhook`**: HTTP POST do Telegram (`X-Telegram-Bot-Api-Secret-Token`), whitelist `ALLOWED_CHAT_IDS`, checagem de hard-stop e publicação no tópico Pub/Sub `lead-pipeline-jobs`.
- **`pipelineWorker`**: assina `lead-pipeline-jobs`, lê a view `leads_quentes_hoje`, enriquece (BigData credencial + OSINT em cascata), grava audit em BigQuery, CSV LGPD no bucket `transparenciabr-leads` e envia o arquivo ao chat.

## Segurança

- **Não commite** `TELEGRAM_BOT_TOKEN`, chaves Shodan, BigData nem PII.
- Use **Secret Manager** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ALLOWED_CHAT_IDS`, `SHODAN_API_KEY`, etc.).
- Mensagens visíveis usam o motor **AURORA** (evite nomes internos proibidos em produção).

## Deploy

Na raiz do repositório (há `.firebaserc` com o projeto padrão):

```bash
export TELEGRAM_BOT_TOKEN="…"
export COMANDANTE_CHAT_ID="…"
./deploy-telegram-bot.sh
```

Opcional: `BOOTSTRAP_150=1` publica o job dos 150 leads após o deploy.

Apenas functions deste codebase:

```bash
firebase deploy --only "functions:telegram-bot:telegramWebhook,functions:telegram-bot:pipelineWorker"
```

## BigQuery

DDL em `sql/bq_tbr_leads_prev.sql`. A view depende da tabela `indeferimentos_brasil_raw` no mesmo dataset.

## Smoke

```bash
bash functions-telegram/test/smoke.sh
```
