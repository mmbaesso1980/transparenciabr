# AURORA Forensic v1.0 — Variáveis de Ambiente

Tabela única para Cloud Function `iniciarDossieV1`, Cloud Run Job `dossie-v1-pipeline`,
e frontend (`/escritorio`).

| Variável | Onde | Valor padrão | Notas |
|---|---|---|---|
| `GEMINI_API_KEY` | Cloud Run Job env (Secret Manager) | (secret) | Chave Gemini para os 10 agentes paralelos e Maestro. |
| `BQ_PROJECT_ID` | Cloud Run Job env | `transparenciabr` | Project com BigQuery + Firestore. |
| `VERTEX_PROJECT_ID` | Cloud Run Job env | `projeto-codex-br` | Projeto de faturação Vertex/Gemini. |
| `VERTEX_LOCATION` | Cloud Run Job env | `us-central1` | Região Vertex AI. |
| `GEMINI_MODEL_FAST` | Cloud Run Job env | `gemini-2.5-flash` | Modelo rápido (triagem de notícias, news_realtime). |
| `GEMINI_MODEL_PRO` | Cloud Run Job env | `gemini-2.5-pro` | Modelo principal (agentes forenses + Maestro). |
| `DOSSIE_V1_BUCKET` | Cloud Run Job env | `datalake-tbr-clean` | Bucket GCS para PDFs em `dossies_v1/`. |
| `DOSSIE_V1_TOPIC` | Cloud Function env / Cloud Run Job env | `dossie-v1-pipeline` | Pub/Sub topic. |
| `DOSSIE_V1_REGION` | scripts / Cloud Run Job | `southamerica-east1` | Região BR. |
| `MANUS_INTERNET_TOOLS` | Cloud Run Job env | `true` | Liga DuckDuckGo / OSINT nos agentes. |
| `VITE_API_URL` | frontend `.env.production` | `https://southamerica-east1-transparenciabr.cloudfunctions.net` | Base URL para httpsCallable. |
| `VITE_FIREBASE_*` | frontend `.env.production` | (config Firebase já em `frontend/src/firebase.js`) | Mantém-se. |

## Service Account

Cloud Run Job + Eventarc trigger devem usar:
```
queima-vertex@projeto-codex-br.iam.gserviceaccount.com
```

Permissões mínimas necessárias:
- `roles/datastore.user` (Firestore writes em `dossies_v1/`)
- `roles/storage.objectAdmin` em `gs://datalake-tbr-clean/dossies_v1/`
- `roles/pubsub.subscriber` (recebe via Eventarc)
- `roles/aiplatform.user` (Vertex / Gemini)
- `roles/run.invoker` (auto-invocação do Job via Eventarc)
- `roles/eventarc.eventReceiver`

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
