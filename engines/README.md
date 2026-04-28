# transparenciabr-engines (Node)

Camada de ingestão declarativa para o datalake (`NDJSON.gz` em GCS, partições Hive).

## Arquitetura

```mermaid
flowchart TB
  subgraph catalog["Camada 1 — Catálogo"]
    JSON["config/arsenal_apis.json"]
    SCHEMA["config/arsenal.schema.json"]
  end
  subgraph motor["Camada 2 — Motor universal"]
    U["ingestors/universal_ingestor.js"]
    AUTH["strategies/auth"]
    CORE["core/*"]
  end
  subgraph base["Camada 3 — Base"]
    B["ingestors/base_ingestor.js"]
  end
  subgraph gcs["Persistência"]
    RAW["GCS raw/source=*/dataset=*/ingestion_date=*/run_id=*/"]
  end
  JSON --> U
  SCHEMA --> U
  U --> AUTH
  U --> CORE
  U --> B
  CORE --> RAW
```

## Comandos

```bash
npm run validate:catalog   # ajv contra o schema
npm run ingest:dry         # plano sem gravar
npm run ingest:imediata    # prioridade imediata
TARGET=transferegov_emendas npm run ingest:one
```

Variáveis principais: `DATALAKE_BUCKET_RAW`, `DATALAKE_BUCKET_STATE`, `GOOGLE_CLOUD_PROJECT`, segredos por API (`CGU_API_KEY`, etc.).

## Qualidade

- `npm run lint`
- `npm run test` (cobertura nos módulos `ingestors/core` e `ingestors/strategies`)

Docker / Cloud Build: `engines/Dockerfile`, `engines/cloudbuild.yaml`.
