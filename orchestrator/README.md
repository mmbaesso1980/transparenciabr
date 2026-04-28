# transparenciabr — Sprint 2 Orchestrator

Vertex AI Reasoning Engine brain + Cloud Run muscle for parallelised government data ingestion.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             transparenciabr S2 Architecture                       │
└──────────────────────────────────────────────────────────────────────────────────┘

  Cloud Scheduler (05:00 UTC / 02:00 Brasília)
       │  POST ?priority=imediata
       ▼
  ┌────────────────────────────┐
  │  orchestrator_trigger      │  HTTP Cloud Function gen2
  │  (Cloud Function)          │  • Reads arsenal_apis.json from GCS
  │                            │  • Filters by priority flag
  │                            │  • Greedy bin-packing (12 bins, σ < 15%)
  │                            │  • Generates ULID run_id
  └────────────┬───────────────┘
               │ Publish 12 messages
               ▼
  ┌────────────────────────────┐
  │  Pub/Sub topic: ingest-fan │  1 topic, 12 push subscriptions
  │  (fan-out)                 │  Filter: attributes.agent_id = "N"
  └──┬──┬──┬──┬──┬──┬──┬──┬──┘
     │  │  │  │  │  │  │  │  │  ... (12 subscription push deliveries)
     ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼
  ┌────────────────────────────────┐
  │  agent_worker (Cloud Run)      │  12 concurrent instances (max_instances=12)
  │  • Verifies OIDC JWT           │  • min=0, max=12, CPU=2, Mem=2Gi, timeout=900s
  │  • Decodes Pub/Sub payload     │
  │  • Invokes Vertex agent        │
  └────────────────┬───────────────┘
                   │ queryReasoningEngine / streamQueryReasoningEngine
                   ▼
  ┌────────────────────────────────┐
  │  Vertex AI Reasoning Engine    │  Resource: projects/89728155070/
  │  (brain — plans & routes)      │  locations/us-west1/
  │                                │  reasoningEngines/4398310393894666240
  │  agent_id 1..12                │
  └────────────────┬───────────────┘
                   │ Tool call: runIngestion(api_id)
                   ▼
  ┌────────────────────────────────┐
  │  ingestor_proxy.js             │  Local module in agent_worker container
  │  (executes ingestion)          │  • Loads catalog entry from GCS
  │                                │  • Builds Hive GCS prefix
  │                                │  • Dispatches specialized OR universal runner
  └────────────────┬───────────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
  ┌──────────────┐   ┌──────────────────────────────────┐
  │  Specialized  │   │  engines/ingestors/              │
  │  Runners      │   │  universal_ingestor.js           │
  │  (cursor,     │   │  processSingleApi(api, ctx)      │
  │  graphql,     │   │                                  │
  │  soap, sftp)  │   └──────────────────────────────────┘
  └──────┬────────┘               │
         └─────────────┬──────────┘
                       ▼
  ┌────────────────────────────────────────────────────────┐
  │  GCS: DATALAKE_BUCKET_RAW                              │
  │  raw/source={fonte}/dataset={api_id}/                  │
  │       ingestion_date=YYYY-MM-DD/run_id={ULID}/         │
  │       *.ndjson.gz  +  _MANIFEST.json  +  _SUCCESS      │
  └────────────────────────────────────────────────────────┘

  Dead-letter: ingest-dlq (5 failed deliveries → DLQ, 7-day retention)
  OpenLineage: emitted on START and COMPLETE to OPENLINEAGE_URL (stdout if unset)
```

---

## DIRETIVA SUPREMA (non-negotiable)

- **ZERO** Firestore writes anywhere in ingestion code
- **ZERO** Câmara dos Deputados (`dadosabertos.camara.leg.br`) endpoints
- All raw data lands in `DATALAKE_BUCKET_RAW` with Hive partitioning
- `_MANIFEST.json` + `_SUCCESS` written in every run
- **LGPD**: CPF and related PII SHA-256 hashed with salt from Secret Manager

---

## Local Development

### Prerequisites

```bash
node --version  # >= 22
gcloud auth application-default login
export ARSENAL_BUCKET=tbr-arsenal-dev
export DATALAKE_BUCKET_RAW=tbr-datalake-raw-dev
export GCP_PROJECT_ID=your-project-id
export LGPD_SALT=dev-only-test-salt   # never use in prod
export SKIP_JWT_VERIFICATION=true     # dev only
```

### Run the agent worker locally

```bash
cd orchestrator/workers/agent_worker
npm install
npm run dev
# → Listening on port 8080
```

### Test a Pub/Sub push locally

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "'$(echo -n '{"api_ids":["api_001"],"agent_id":1,"batch_id":"test.1","run_id":"01HZ00000000000000000000","priority":"imediata"}' | base64)'",
      "messageId": "test-message-id"
    }
  }'
```

### Run the orchestrator trigger locally

```bash
cd orchestrator/functions/orchestrator_trigger
npm install
npm start
# → Functions Framework listening on :8080
curl "http://localhost:8080/?priority=imediata"
```

---

## Running Tests

```bash
# From orchestrator/ root
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## Deploy

### 1. Build & push Docker image

```bash
cd orchestrator/workers/agent_worker
docker build -t gcr.io/$GCP_PROJECT_ID/agent-worker:$(git rev-parse --short HEAD) .
docker push gcr.io/$GCP_PROJECT_ID/agent-worker:$(git rev-parse --short HEAD)
```

### 2. Package Cloud Function

```bash
cd orchestrator
npm run build:zip
# → dist/orchestrator-trigger.zip
gsutil cp dist/orchestrator-trigger.zip gs://$ARSENAL_BUCKET/functions/
```

### 3. Apply Terraform

```bash
cd orchestrator/infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with real values
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### 4. Deploy manually (non-Terraform)

```bash
# Cloud Function
gcloud functions deploy orchestrator-trigger \
  --gen2 --runtime=nodejs22 --region=us-west1 \
  --source=gs://$ARSENAL_BUCKET/functions/orchestrator-trigger.zip \
  --entry-point=orchestratorTrigger \
  --trigger-http \
  --set-env-vars ARSENAL_BUCKET=$ARSENAL_BUCKET,PUBSUB_TOPIC=ingest-fan,GCP_PROJECT_ID=$GCP_PROJECT_ID

# Cloud Run
gcloud run deploy agent-worker \
  --image=gcr.io/$GCP_PROJECT_ID/agent-worker:latest \
  --region=us-west1 --platform=managed \
  --no-allow-unauthenticated \
  --concurrency=1 --max-instances=12 \
  --memory=2Gi --cpu=2 --timeout=900 \
  --service-account=agent-worker-sa@$GCP_PROJECT_ID.iam.gserviceaccount.com
```

---

## Monitoring

### Cloud Logging traces

Filter by run_id or correlation_id in Logs Explorer:

```
jsonPayload.run_id="01HZ..."
jsonPayload.correlation_id="01HZ....1.3"
```

All log entries are structured JSON with fields: `severity`, `message`, `timestamp`, plus context fields.

### Pub/Sub metrics (Cloud Console → Pub/Sub → Topics → ingest-fan)

- **Undelivered message count** — should approach 0 after each run
- **Oldest unacked message age** — alert if > 15 min
- **Dead-letter (ingest-dlq) message count** — alert if > 0

### Reasoning Engine logs

```
gcloud logging read 'resource.type="aiplatform.googleapis.com/ReasoningEngine"' \
  --project=$GCP_PROJECT_ID --limit=50
```

### Cloud Run instance metrics

- **Container instance count** — peaks at 12 during runs, drops to 0 after
- **Request latency p99** — typical ~300–600s for heavy batches

---

## Cost Estimate (monthly, steady-state daily runs)

| Service | Estimate | Notes |
|---|---|---|
| Cloud Run | ~$8–$20 | 12 instances × 900s × daily, 2 vCPU, 2 Gi |
| Pub/Sub | < $1 | ~12 messages/day × 31 days = negligible |
| Vertex Reasoning Engine | ~$30–$80 | Dependent on token usage per agent query |
| Cloud Functions | < $1 | One trigger invocation/day, 512 MB, < 60s |
| GCS (raw lake storage) | ~$5–$15 | Depends on volume; NDJSON.gz compressed |
| BigQuery (cost-guarded) | ~$0–$20 | capped at 100 GB/day; actual depends on queries |
| Cloud Scheduler | < $1 | 3 jobs/month included in free tier |
| **Total** | **~$45–$140** | Highly dependent on Vertex token usage |

Vertex Reasoning Engine charges are the dominant variable cost.  Monitor via
`aiplatform.googleapis.com/prediction/online/character_count` metric.

---

## Security

### Service Account permissions

`agent-worker-sa@PROJECT.iam.gserviceaccount.com` holds:

| Role | Scope |
|---|---|
| `roles/aiplatform.user` | Project (invoke Reasoning Engine) |
| `roles/storage.objectAdmin` | `DATALAKE_BUCKET_RAW` (write raw data) |
| `roles/storage.objectViewer` | `ARSENAL_BUCKET` (read catalog/contracts) |
| `roles/secretmanager.secretAccessor` | Project (read LGPD salt) |
| `roles/run.invoker` | Project (Pub/Sub → Cloud Run push) |

### OIDC verification on push

Pub/Sub push subscriptions send an OIDC JWT in the `Authorization: Bearer` header.
The agent worker validates:
- Token is a valid 3-part JWT
- `aud` claim matches the Cloud Run service URL
- Token is not expired

Set `SKIP_JWT_VERIFICATION=true` only in development.

### LGPD shield

Every ingestion worker **must** call `redactRecord(record, salt)` from
`lib/lgpd_shield.js` before writing any record containing CPF, `nu_cpf`,
`num_cpf`, or `cnpj_responsavel` to GCS.  The salt is loaded from Secret Manager
at runtime — never from code or environment variables in production.

Fields automatically hashed: `cpf`, `nu_cpf`, `num_cpf`, `cnpj_responsavel`,
`cpf_cnpj`, `nr_cpf`, `cpf_servidor`.

---

## File Structure

```
orchestrator/
├── __tests__/
│   ├── cost_guard.test.js
│   ├── data_contracts.test.js
│   ├── lgpd_shield.test.js
│   └── partition.test.js
├── functions/
│   └── orchestrator_trigger/
│       ├── index.js          ← HTTP Cloud Function entry point
│       └── package.json
├── infra/
│   ├── main.tf               ← All GCP resources
│   ├── variables.tf
│   └── terraform.tfvars.example
├── lib/
│   ├── cost_guard.js         ← BigQuery budget enforcement
│   ├── data_contracts.js     ← JSON Schema contract validation
│   ├── lgpd_shield.js        ← LGPD PII hashing
│   └── openlineage.js        ← Lineage event emission
├── workers/
│   └── agent_worker/
│       ├── Dockerfile
│       ├── ingestor_proxy.js ← Bridges Vertex tool calls → engines/
│       ├── package.json
│       ├── server.js         ← Express Cloud Run server
│       └── vertex_client.js  ← Vertex Reasoning Engine gRPC client
└── package.json              ← Workspace root (vitest, eslint, deploy scripts)
```
