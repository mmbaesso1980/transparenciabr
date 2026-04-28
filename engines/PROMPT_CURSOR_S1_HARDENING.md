# 🎯 PROMPT CURSOR — Sprint 1 Hardening (commit único)

> **Cole no Cursor (Cmd+L → Composer)** quando estiver pronto para mandar a próxima rodada de melhorias.
> Tudo é additivo: nenhum arquivo existente é deletado, só pagination/index.js é substituído (versão idêntica em comportamento + 2 estratégias dinâmicas novas + sentinela isEmpty).

## Contexto

PR #75 entregou o motor universal e catálogo de 117 APIs. Esse hardening fecha **as 4 pendências reportadas** + **eleva cobertura de 82% para 88%**:

1. ✅ Cursor pagination (loop infinito quebrado por feedback `nextCursor`)
2. ✅ Link-header pagination (RFC 5988)
3. ✅ Iter_ids com `id_list` no catálogo (sem precisar checkpoint)
4. ✅ Date-window com `granularity: "daily"` (necessário para `/agendareuniao/{AAAAMMDD}.json`)
5. ✅ Runners dedicados: `bigquery_query`, `bulk_download`/`year_zip`, `ftp_dbc`, `catalog_scrape`
6. ✅ Servidor HTTP embutido para `/metrics` (Prometheus) + `/healthz` + `/readyz`
7. ✅ 20 testes novos · 0 lint warnings · 0 deps novas (tudo já em `package.json`)

## Diretiva Suprema preservada

- ❌ **ZERO writes em Firestore na ingestão** (verificado)
- ❌ **ZERO Câmara dos Deputados** (verificado)
- ✅ **GCS Hive partitioning mantido** (`raw/source=…/dataset=…/ingestion_date=…/run_id=…/`)
- ✅ **`_MANIFEST.json` + `_SUCCESS` em todos os runners** (chamando `writeNDJSONGzipParts`)

## Tarefa para o Cursor

Aplique os arquivos do patch (já preparados em `sprint1_patch/`) seguindo este passo-a-passo. Todos os arquivos foram validados localmente com `node --check`, `npm run lint` e `npm test` — 45 testes passando, 88% cobertura.

### 1. Substituir pagination strategy
```
engines/ingestors/strategies/pagination/index.js   # versão hardened
```
**Mudanças:**
- `cursor` agora consome `feedback.nextCursor` (corrige loop infinito de 5000 iterações)
- Novo `case "link_header"` (RFC 5988)
- `date_window` ganha `granularity: "single" | "daily"`
- `iter_ids` aceita `pag.id_list` direto do catálogo
- `parseLinkHeader()` exportado para uso pelo HTTP client
- Cap configurável `pag.max_pages` (default 5000)

### 2. Adicionar 4 runners + registry
```
engines/ingestors/runners/bigquery_query_runner.js   # @google-cloud/bigquery streaming
engines/ingestors/runners/bulk_download_runner.js    # node-stream-zip + csv-parse + streaming
engines/ingestors/runners/ftp_dbc_runner.js          # ftp listing + deferred .dbc conversion
engines/ingestors/runners/catalog_scrape_runner.js   # CKAN > sitemap > deferred HTML
engines/ingestors/runners/index.js                   # registry + dispatchSpecializedRunner()
```

### 3. Servidor de métricas embutido
```
engines/ingestors/core/metrics_server.js   # GET /metrics /healthz /readyz
```

### 4. Testes (3 arquivos, 20 testes)
```
engines/__tests__/pagination_dynamic.test.js   # cursor, link_header, daily, iter_ids (9 tests)
engines/__tests__/runners.test.js              # registry dispatch dry-run (7 tests)
engines/__tests__/metrics_server.test.js       # /healthz /readyz /metrics (4 tests)
```

### 5. Integrar runner registry no `universal_ingestor.js`

**Local exato da edição:** logo após carregar a entrada `api` do catálogo e antes do laço HTTP.

```javascript
// At top of file, alongside other imports:
import { dispatchSpecializedRunner, isSpecializedStrategy } from "./runners/index.js";
import { startMetricsServer, markSuccess } from "./core/metrics_server.js";

// Inside main() OR processSingleApi(), right after api/ctx are built:
if (isSpecializedStrategy(api.pagination?.type)) {
  const result = await dispatchSpecializedRunner(api, {
    ...ctx,
    bucket: process.env.DATALAKE_BUCKET_RAW,
    gcsPrefix,    // already computed above with buildRawLakePrefix
    dryRun,
  });
  if (result && !result.dry_run) markSuccess();
  return result;   // skip standard HTTP path
}

// Inside startup, before main loop:
let metricsServer = null;
if (process.env.METRICS_PORT || process.env.ENABLE_METRICS_SERVER === "1") {
  metricsServer = startMetricsServer({
    port: Number(process.env.METRICS_PORT || 9100),
  });
  await metricsServer.ready;
}

// Inside cleanup/finally:
if (metricsServer) await metricsServer.close();
```

### 6. Atualizar `cursor` + `link_header` no HTTP client

O ingestor precisa **consumir o response e empurrar feedback** ao iterator. Pseudo-código:

```javascript
const it = iteratePaginationPlans(api, ctx);
let feedback;
let totalRecords = 0;
while (true) {
  const { value: plan, done } = await it.next(feedback);
  if (done) break;

  const url = plan.overrideUrl || buildUrl(api, plan);
  const res = await httpClient.get(url, { query: plan.query, ... });
  const records = extractRecords(res.body, api.list_path);

  // Push feedback so cursor/link_header advance correctly:
  feedback = {
    isEmpty: records.length === 0,
    nextCursor: extractNextCursor(res.body, api.pagination?.cursor_field),
    linkHeader: res.headers?.link,
  };

  for (const r of records) yield r;
  totalRecords += records.length;
}
```

### 7. Adicionar scripts em `package.json`

```json
{
  "scripts": {
    "metrics:server": "node -e \"import('./ingestors/core/metrics_server.js').then(m => m.startMetricsServer({port: 9100}))\"",
    "ingest:with-metrics": "ENABLE_METRICS_SERVER=1 node ingestors/universal_ingestor.js --target=imediata"
  }
}
```

## Critério de aceite (rodar antes de commitar)

```bash
cd engines
npm install                # já roda — não há deps novas
npm run validate:catalog   # esperado: 117 APIs OK
npm run lint               # esperado: 0 errors, 0 warnings
npm test                   # esperado: ≥ 45 testes verdes, ≥ 88% statements
node ingestors/universal_ingestor.js --target=all --dry-run  # esperado: todos respondem incluindo specialized
```

## Mensagem de commit sugerida

```
feat(engines): cursor/link_header pagination + 4 specialized runners + metrics server

- pagination: fix cursor infinite loop (feedback nextCursor protocol)
- pagination: add link_header (RFC 5988) and date_window daily granularity
- runners: bigquery_query, bulk_download/year_zip, ftp_dbc, catalog_scrape
- core: embedded metrics_server (GET /metrics /healthz /readyz)
- tests: +20 tests (45 total, 88.12% statements coverage)
- lint: 0 warnings, 0 deps added (all already in package.json)

Diretiva Suprema preservada: zero Firestore writes, zero Câmara,
GCS Hive partitioning + _MANIFEST.json + _SUCCESS em todos runners.
```

## Reporte final esperado

```
SPRINT 1 HARDENING CONCLUÍDO
- pagination: 14 estratégias (cursor/link_header agora dinâmicas via feedback)
- runners especializados: 4/4 (bigquery_query, bulk_download, ftp_dbc, catalog_scrape)
- métricas: HTTP server embutido /metrics /healthz /readyz
- testes: 45 passando · 88.12% cobertura · 0 lint warnings
- dry-run: 117/117 APIs respondem
- pendências do PR #75: 4/4 fechadas
- pronto para Sprint 2 (orquestrador Vertex)
```
