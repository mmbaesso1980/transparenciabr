# AURORA Forensic v1.0 — Variáveis de Ambiente

Tabela única para Cloud Function `iniciarDossieV1`, Cloud Run Job `dossie-v1-pipeline`,
e frontend (`/escritorio`).

## Estratégia cross-project (queima crédito GenAI App Builder)

| Projeto | Papel | Recursos |
|---|---|---|
| **`transparenciabr`** | Firebase / DataLake | Firestore, Hosting, Cloud Function `iniciarDossieV1`, BigQuery, GCS `datalake-tbr-clean` |
| **`projeto-codex-br`** | Compute / IA (paga com crédito R$ 5.677,28 → 03/05/2027) | Pub/Sub `dossie-v1-pipeline`, Cloud Run Job, Artifact Registry, Vertex AI, Eventarc |

A Cloud Function callable publica no topic do `projeto-codex-br`; o Job consome de lá e escreve de volta no Firestore do `transparenciabr` via SA `queima-vertex@projeto-codex-br`.

## Variáveis

| Variável | Onde | Valor padrão | Notas |
|---|---|---|---|
| `GEMINI_API_KEY` | Cloud Run Job env (Secret Manager em `codex-br`) | (secret) | Chave Gemini para os 110 agentes paralelos e Maestro. |
| `GCP_PROJECT_ID` | **Cloud Function env** | `projeto-codex-br` | **CRÍTICO**: aponta o cliente Pub/Sub da function para o topic em `codex-br`. |
| `BQ_PROJECT_ID` | Cloud Run Job env | `transparenciabr` | Project com BigQuery + Firestore. |
| `VERTEX_PROJECT_ID` | Cloud Run Job env | `projeto-codex-br` | Projeto de faturação Vertex/Gemini. |
| `VERTEX_LOCATION` | Cloud Run Job env | `us-central1` | Região Vertex AI. |
| `GEMINI_MODEL_FAST` | Cloud Run Job env | `gemini-2.5-flash` | Modelo rápido (triagem de notícias, news_realtime, agentes paralelos). |
| `GEMINI_MODEL_PRO` | Cloud Run Job env | `gemini-2.5-pro` | Modelo principal (Maestro + síntese). |
| `DOSSIE_V1_BUCKET` | Cloud Run Job env | `datalake-tbr-clean` | Bucket GCS para PDFs em `dossies_v1/`. Bucket vive em `transparenciabr`; SA do `codex-br` tem `storage.objectAdmin` cross-project. |
| `DOSSIE_V1_TOPIC` | Cloud Function env / Cloud Run Job env | `dossie-v1-pipeline` | Pub/Sub topic (em `projeto-codex-br`). |
| `DOSSIE_V1_REGION` | scripts / Cloud Run Job | `southamerica-east1` | Região BR. |
| `MANUS_INTERNET_TOOLS` | Cloud Run Job env | `true` | Liga DuckDuckGo / OSINT nos agentes. |
| `VITE_API_URL` | frontend `.env.production` | `https://southamerica-east1-transparenciabr.cloudfunctions.net` | Base URL para httpsCallable. |
| `VITE_FIREBASE_*` | frontend `.env.production` | (config Firebase já em `frontend/src/firebase.js`) | Mantém-se. |

## Service Account

Cloud Run Job + Eventarc trigger devem usar:
```
queima-vertex@projeto-codex-br.iam.gserviceaccount.com
```

Permissões mínimas necessárias (algumas são **cross-project**):

### Em `projeto-codex-br` (projeto da SA)
- `roles/run.invoker` (auto-invocação do Job via Eventarc)
- `roles/eventarc.eventReceiver`
- `roles/aiplatform.user` (Vertex / Gemini)
- `roles/pubsub.subscriber` (recebe via Eventarc)
- `roles/artifactregistry.reader`

### Em `transparenciabr` (cross-project)
- `roles/datastore.user` (Firestore writes em `dossies_v1/`)
- `roles/storage.objectAdmin` em `gs://datalake-tbr-clean/dossies_v1/`
- `roles/bigquery.dataViewer` (consulta vw_* internas)
- `roles/bigquery.jobUser`

### Cloud Function callable em `transparenciabr` precisa de:
- `roles/pubsub.publisher` na SA da function, **em `projeto-codex-br`** (para publicar no topic de lá)

Comando para conceder:
```bash
FUNCTION_SA="transparenciabr@appspot.gserviceaccount.com"  # ou a SA custom da function
gcloud projects add-iam-policy-binding projeto-codex-br \
  --member="serviceAccount:${FUNCTION_SA}" \
  --role="roles/pubsub.publisher"
```

## Onde definir

| Camada | Mecanismo |
|---|---|
| Cloud Function | `firebase functions:secrets:set GEMINI_API_KEY` ou `--set-env-vars` no deploy. |
| Cloud Run Job | `gcloud run jobs deploy --set-env-vars` + `--set-secrets` (Secret Manager). |
| Frontend | `frontend/.env.production` (commitado sem segredos). |

## Verificação

```bash
gcloud run jobs describe dossie-v1-pipeline \
  --region=southamerica-east1 \
  --project=transparenciabr \
  --format='value(spec.template.spec.template.spec.containers[0].env)'
```
