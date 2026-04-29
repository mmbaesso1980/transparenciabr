# Ingestor Universal — TransparênciaBR

Ingestor declarativo de fonte única: um script (`universal_ingestor.js`) configurado por um JSON (`arsenal_apis.json`) que ingere **52 fontes públicas brasileiras** e grava **exclusivamente no GCS** (`gs://datalake-tbr-raw/`).

> **Câmara dos Deputados (`dadosabertos.camara.leg.br`) — EXCLUÍDA** por diretiva do projeto. Jamais será processada por este ingestor.

---

## Visão geral da arquitetura

```
arsenal_apis.json          ← mapa declarativo de fontes (editável)
       │
       ▼
universal_ingestor.js      ← único ponto de entrada Node.js
       │
       ├── loadArsenal()        lê e valida o JSON de fontes
       ├── selectSources()      filtra por prioridade ou ID
       ├── resolveAuthHeaders() injeta API keys dos envs
       ├── fetchWithRetry()     HTTP com backoff exponencial 429/5xx
       ├── blobExists()         idempotência via GCS
       ├── writeToGcs()         grava JSON com metadata
       └── log()                logger estruturado (Cloud Logging)
              │
              ▼
   gs://datalake-tbr-raw/<fonte>/<ano>/<mes>/<entidade>/<id>.json
```

### Regras de design
| Regra | Detalhe |
|---|---|
| **Destino exclusivo** | `gs://datalake-tbr-raw/` — zero Firestore na ingestão |
| **Idempotência** | Skip automático se blob já existe no GCS (flag `--force` para re-ingerir) |
| **Retry backoff** | 429/500/502/503/504 → 1s → 2s → 4s → 8s → 16s (máx 5 tentativas) |
| **Worker pool** | `pLimit(5)` por fonte — máx 5 requisições paralelas por fonte |
| **Exclusão de domínio** | `dadosabertos.camara.leg.br` bloqueado por código (não configurável) |
| **Auth por env** | Nenhuma chave hardcoded — tudo via variáveis de ambiente |

---

## Fontes cadastradas (`arsenal_apis.json`)

| Prioridade | Quantidade | Fontes |
|---|---|---|
| **P0** — Imediato | 5 | CGU Portal Transparência, PNCP, Transferegov, TCU Sanções/CADIRREG, TCU Acórdãos |
| **P1** — Sprint 2 | 14 | Senado Federal, TSE (dados abertos + DivulgaCand), Receita CNPJ, INLABS DOU, Querido Diário, IBGE (localidades, malhas, SIDRA), DATASUS/CNES, CNES FTP DBC, INEP (Censo, IDEB, Catálogo) |
| **P2** — Sprint 3 | 22 | BrasilAPI, OpenCNPJ, MinhaReceita, Brasil.IO, SIOP, SIAFI, SNIS/SINISA, ANA Hidroweb, Atlas Brasil, RAIS, CAGED, OCDS BR, Base dos Dados (BQ), dados.gov.br, DATASUS TabNet, ElastiCNES, OpenDataSUS, IBGE projeções, Base dos Dados RAIS/IDEB/SNIS |
| **P3** — Futuro | 11 | OCP Registry, Banco Mundial, FMI, OCDE, Transparency Intl, OCDS UK, NewsAPI, Mediastack, APITube, Conecta.gov.br, INEP API 3rd party |

**Total**: 52 fontes · 128 endpoints

---

## Como adicionar uma nova fonte

1. Abra `engines/ingestors/arsenal_apis.json`
2. Adicione um objeto ao array `sources` seguindo o schema:

```json
{
  "id": "minha_nova_fonte",
  "name": "Nome legível da fonte",
  "category": "categoria",
  "priority": "P1",
  "base_url": "https://api.exemplo.gov.br",
  "auth": { "type": "none" },
  "rate_limit": { "requests": 60, "per": "minute", "concurrent": 3 },
  "endpoints": [
    {
      "path": "/dados/consulta",
      "name": "consulta_dados",
      "params_required": ["data"],
      "params_optional": ["pagina"]
    }
  ],
  "gcs_path": "nova_fonte/{endpoint_name}/{ano}/{mes}",
  "format": "json",
  "frequency": "daily"
}
```

3. Teste com dry-run antes de executar de verdade:
```bash
node universal_ingestor.js --source minha_nova_fonte --dry-run
```

### Tipos de autenticação suportados

| `auth.type` | Descrição | Campos adicionais |
|---|---|---|
| `none` | Sem auth | — |
| `api_key_header` | API key no header HTTP | `header`, `env` |
| `api_key_query` | API key como query param | `param`, `env` |
| `oauth` | Application Default Credentials (Google) | `env: GOOGLE_APPLICATION_CREDENTIALS` |
| `cert` | Certificado digital (SIAFI) | `env: SIAFI_CERT_PATH` |

---

## Como rodar localmente

### Pré-requisitos
```bash
node --version   # ≥ 20
npm install      # na raiz de engines/
```

### Variáveis de ambiente obrigatórias
```bash
export DATALAKE_BUCKET_RAW="datalake-tbr-raw"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

### Variáveis opcionais (por fonte)
```bash
export CGU_API_KEY="sua-chave-cgu"
export INLABS_API_KEY="sua-chave-inlabs"
export NEWSAPI_KEY="sua-chave-newsapi"
export MEDIASTACK_API_KEY="sua-chave-mediastack"
export APITUBE_API_KEY="sua-chave-apitube"
export SIAFI_CERT_PATH="/path/to/cert.p12"
```

### Exemplos de execução

```bash
# Ingerir apenas fontes P0 (recomendado para primeiro deploy)
node universal_ingestor.js --priority P0

# Ingerir apenas a CGU com dados desde 2024-01-01
node universal_ingestor.js --source cgu_portal_transparencia --since 2024-01-01

# Dry-run para ver o que seria processado sem gravar no GCS
node universal_ingestor.js --priority P1 --dry-run

# Re-ingestão forçada (ignora idempotência)
node universal_ingestor.js --source pncp --force

# Ver lista de todas as fontes disponíveis
node universal_ingestor.js --list

# Usar arsenal.json alternativo (ex: staging)
node universal_ingestor.js --priority P0 --arsenal /tmp/arsenal_staging.json

# Ativar logs de debug verbose
LOG_VERBOSE=1 node universal_ingestor.js --source tcu_acordaos --dry-run
```

Ou via npm scripts (definidos em `engines/package.json`):
```bash
npm run ingest:universal    # todas as fontes
npm run ingest:imediata     # fontes P0
npm run ingest:sprint2      # fontes P0+P1
npm run ingest:dry          # dry-run geral
```

---

## Como rodar em GCP VM (produção)

### 1. Configurar service account
```bash
# Permissões mínimas necessárias
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:tbr-ingestor@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 2. Deploy como Cloud Run Job
```bash
gcloud run jobs create ingestor-p0 \
  --image=gcr.io/$PROJECT_ID/universal-ingestor \
  --region=us-central1 \
  --set-env-vars="DATALAKE_BUCKET_RAW=datalake-tbr-raw" \
  --args="--priority,P0" \
  --max-retries=3 \
  --task-timeout=3600s
```

### 3. Agendar via Cloud Scheduler
```bash
# Ingestão contínua P0 a cada 6 horas
gcloud scheduler jobs create http ingestor-p0-cron \
  --schedule="0 */6 * * *" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/us-central1/jobs/ingestor-p0:run" \
  --oauth-service-account-email="tbr-ingestor@$PROJECT_ID.iam.gserviceaccount.com"
```

---

## Como rodar os testes

```bash
cd engines/
npm test           # roda toda a suite Vitest
npm run test:watch # modo watch para desenvolvimento
```

Os testes estão em `engines/__tests__/` e cobrem:
- Carregamento e validação do arsenal
- Lógica de backoff exponencial
- Construção de paths GCS
- Filtragem por prioridade
- Verificação de exclusão de domínios

---

## Convenções de logging

O ingestor emite logs estruturados em JSON, compatíveis com Google Cloud Logging:

```json
{
  "timestamp": "2026-04-29T18:00:00.123Z",
  "severity": "INFO",
  "event": "endpoint_ok",
  "source_id": "cgu_portal_transparencia",
  "endpoint": "contratos_federais",
  "gcs_path": "cgu/contratos_federais/2026/04/run_20260429T180000_p1.json",
  "bytes": 45231,
  "latency_ms": 342,
  "status": 200
}
```

### Eventos principais

| Evento | Severity | Descrição |
|---|---|---|
| `arsenal_carregado` | INFO | Arsenal JSON lido com sucesso |
| `fonte_inicio` | INFO | Início da ingestão de uma fonte |
| `fonte_concluida` | INFO | Fonte concluída (ok/skip/erro) |
| `endpoint_ok` | INFO | Endpoint ingerido e gravado no GCS |
| `endpoint_skip_ja_existe` | INFO | Blob já existe — skip por idempotência |
| `endpoint_skip_parametrizado` | DEBUG | Endpoint com params obrigatórios não fornecidos |
| `endpoint_skip_ftp` | INFO | FTP detectado — requer runner especializado |
| `endpoint_skip_bigquery` | INFO | BigQuery detectado — requer runner especializado |
| `http_retry` | WARN | Retry disparado (429/5xx) |
| `http_network_error` | WARN | Erro de rede com retry |
| `endpoint_falha_http` | ERROR | Falha definitiva após todos os retries |
| `fonte_excecao` | ERROR | Exceção inesperada na fonte |
| `erro_fatal` | ERROR | Erro fatal que encerra o processo |

---

## Estrutura de paths GCS

```
gs://datalake-tbr-raw/
├── cgu/
│   ├── contratos_federais/2026/04/run_20260429T180000_p1.json
│   ├── viagens_servidores/2026/04/run_20260429T180000_p1.json
│   └── ceis/2026/04/run_20260429T180000_p1.json
├── pncp/
│   ├── contratos_pncp/2026/04/run_20260429T180000_p1.json
│   └── pca_plano_anual/2026/04/run_20260429T180000_p1.json
├── tcu/
│   ├── tcu_sancoes/2026/04/...
│   └── tcu_cadirreg/2026/04/...
├── senado/
├── tse/
├── ibge/
├── datasus/
├── inep/
└── ...
```

Cada blob contém:
```json
{
  "_meta": {
    "ingested_at": "2026-04-29T18:00:00.123Z",
    "bucket": "datalake-tbr-raw",
    "path": "cgu/contratos_federais/2026/04/run_20260429T180000_p1.json",
    "source_id": "cgu_portal_transparencia",
    "endpoint_name": "contratos_federais",
    "url": "https://api.portaldatransparencia.gov.br/api-de-dados/contratos?...",
    "priority": "P0"
  },
  "data": { ... }
}
```

---

## Referências

- [Documento mestre — Projeto Soberania](/projeto_soberania_arquitetura.md) (seção 6)
- [CGU Portal da Transparência](https://api.portaldatransparencia.gov.br)
- [PNCP API](https://pncp.gov.br/api/pncp/v1)
- [TCU Dados Abertos](https://dados-abertos.apps.tcu.gov.br)
- [Senado Federal Dados Abertos](https://legis.senado.leg.br/dadosabertos/)
- [Google Cloud Storage Node.js SDK](https://cloud.google.com/nodejs/docs/reference/storage/latest)
