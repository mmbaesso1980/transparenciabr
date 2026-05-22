# Enrichment PII — motor AURORA (`functions/enrichment`)

Pipeline multi-fonte com caminhos **A** (DATAPREV), **B** (bureau), **C** (consentimento na landing `/sou-indeferido`) e **D** (petição DOCX).

## Deploy

1. Aplicar DDL: `functions/enrichment/sql/schema_extensions.sql` (BigQuery).
2. Configurar segredos (`BUREAU_API_KEY`, `BUREAU_API_KEY_QUOD`, `TELEGRAM_BOT_TOKEN`, …) e variáveis (`BUREAU_HTTP_BASE_URL`, `BUREAU_PROVIDER`, `BUDGET_DIARIO_BRL`, `TELEGRAM_ALERT_CHAT_ID`, `DATAPREV_ENABLED`, `BQ_LOCATION` — default `southamerica-east1` para o dataset `tbr_leads_prev`).
3. `firebase deploy --only functions:enrichment`

## Service account

Recomenda-se executar a função com a conta de serviço **`tbr-enricher@transparenciabr.iam.gserviceaccount.com`** (criar no IAM e associar na configuração da Cloud Function). Não versionar chaves JSON.

## Testes

Na pasta `functions/`:

```bash
npm run test:enrichment
```
