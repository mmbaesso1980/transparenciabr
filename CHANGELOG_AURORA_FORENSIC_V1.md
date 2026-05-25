# CHANGELOG — AURORA Forensic v1.0 (Legião 100 Integrada)

> Branch: `feat/aurora-forensic-v1-legion100-integrated`
> Data: 2026-05-25
> Objetivo: integrar a skill **dossiê forense parlamentar v1.0** ao fluxo cívico
> (frontend `/escritorio` → Pub/Sub → Cloud Run Job paralelo de 10 agentes →
> PDF tom INFORMATIVO em GCS), reaproveitando a Legião 100 (`manus_office/`) e
> a infra Firebase já existente.

## Otimização de custos (cross-project billing)

O deploy distribui compute e dados em dois projetos GCP para queimar o crédito **GenAI App Builder Trial** (R$ 5.677,28 em `projeto-codex-br`, expira 03/05/2027):

| Projeto | Recursos |
|---|---|
| `transparenciabr` | Firebase Hosting, Firestore, Cloud Function `iniciarDossieV1`, BigQuery, GCS `datalake-tbr-clean` |
| `projeto-codex-br` | Pub/Sub `dossie-v1-pipeline`, Cloud Run Job `dossie-v1-pipeline`, Artifact Registry, Vertex AI (Gemini 2.5 Pro/Flash), Eventarc trigger |

A SA `queima-vertex@projeto-codex-br` tem permissões cross-project (`roles/datastore.user` + `roles/storage.objectAdmin` em `transparenciabr`) para escrever de volta no Firestore e fazer upload do PDF no bucket de dados. A Cloud Function callable (em `transparenciabr`) tem `roles/pubsub.publisher` em `projeto-codex-br` para enfileirar jobs.

Ver detalhes em `infrastructure/env_dossie_v1.md`.

### Custo estimado por dossiê
- Cloud Run Job (30 min, 2vCPU/2Gi): ~R$ 0,40
- Vertex AI Gemini Pro (~50 chamadas Maestro/síntese): ~R$ 0,60
- Vertex AI Gemini Flash (~500 chamadas dos 10 agentes paralelos + news_realtime): ~R$ 0,40
- Pub/Sub + Firestore + GCS: ~R$ 0,10
- **Total: ~R$ 1,50/dossiê** (debitado do crédito GenAI em `projeto-codex-br`)

## Adicionado

### Functions (HTTP callable)
- `functions/src/dossie/iniciarDossieV1.js` — callable que valida Firebase Auth,
  cria documento `dossies_v1/{slug}` no Firestore e publica em Pub/Sub
  `dossie-v1-pipeline`.

### Manus Office (orquestrador headless + crew especializada)
- `manus_office/dossie_v1/dossie_pipeline.py` — orquestrador headless dos 10
  agentes forenses paralelos + Maestro Supremo (consolidação, validação de tom,
  geração JSON v1.0 + chamada ao gerador PDF).
- `manus_office/dossie_v1/agents/news_realtime.py` — coletor de notícias em
  tempo real (Google News RSS + GDELT 2.0 + dorks Folha/UOL/G1/CNN) com
  triagem Gemini Flash. Addon não conta nos 100.
- 11ª crew `crew-dossie-forense-v1` em `manus_office/agent_registry.py`
  (append-only; 10 crews originais intactas). 10 agentes 1:1 com os eixos da
  skill v1.0: identificacao, ceap_anomalias, emendas, judicial, eixo5_empresas,
  osint, contraditorio, falso_positivo, fonte_primaria, decisao_judicial.

### Cloud Run Job
- `cloudrun/dossieV1Pipeline/Dockerfile`
- `cloudrun/dossieV1Pipeline/main.py` — consumidor Pub/Sub que executa
  `dossie_pipeline.py` em modo `--firestore-doc dossies_v1/<slug>`, faz upload
  do PDF para GCS e atualiza Firestore com `pdf_url` + status `done`.
- `cloudrun/dossieV1Pipeline/requirements.txt`
- `cloudrun/dossieV1Pipeline/cloudbuild.yaml`

### Frontend (página /escritorio)
- `frontend/src/hooks/useDossieV1Status.js` — listener Firestore em tempo real.
- `frontend/src/pages/EscritorioPage.jsx` — UI dos 10 avatares + barra de
  progresso + link de download.
- componentes auxiliares em `frontend/src/components/escritorio/`.

### Infra
- `infrastructure/setup_dossie_v1.sh` — provisiona Pub/Sub topic +
  subscription + GCS prefix `dossies_v1/`.
- `infrastructure/deploy_aurora_forensic_v1.sh` — deploy completo
  (hosting + function + Cloud Run Job + Eventarc trigger).
- `infrastructure/env_dossie_v1.md` — tabela de variáveis de ambiente.

### Docs
- `CHANGELOG_AURORA_FORENSIC_V1.md` — este arquivo.
- `manus_office/dossie_v1/README.md` — fluxo end-to-end + diagrama ASCII.

## Modificado

- `functions/index.js` — adicionado **uma linha** de export:
  `exports.iniciarDossieV1 = require("./src/dossie/iniciarDossieV1");`.
  Nenhuma function existente foi tocada.
- `functions/package.json` — adicionada dep `@google-cloud/pubsub` e
  inclusão de `iniciarDossieV1.js` no `node --check` do script de build.
- `frontend/src/App.jsx` — adicionada rota `/escritorio` (sub-agente frontend).

## Stack técnico

```
Frontend (React)                         GCP (transparenciabr + projeto-codex-br)
─────────────────                        ──────────────────────────────────────
/escritorio  ──httpsCallable──▶  iniciarDossieV1 (Functions, southamerica-east1)
   ▲                                       │
   │ onSnapshot                            ▼
   │                                  Firestore: dossies_v1/{slug}
   │                                       │
   │                                       ▼
   │                                  Pub/Sub topic: dossie-v1-pipeline
   │                                       │
   │                                       ▼  (Eventarc)
   │                                  Cloud Run Job: dossie-v1-pipeline
   │                                       │
   │            ┌────────────────┐         │  asyncio.gather(10 agentes Gemini 2.5 Pro)
   │            │   Firestore    │◀────────┤  + addon news_realtime (Gemini Flash)
   │            │ agents.<id>=   │         │
   │            │  {status,...}  │         ▼
   │            └────────────────┘  Maestro consolida + valida tom (regex blocklist)
   │                                       │
   │                                       ▼
   │                                  gerar_dossie_v1.py → PDF (ReportLab)
   │                                       │
   │                                       ▼
   │                                  GCS: gs://datalake-tbr-clean/dossies_v1/<slug>.pdf
   │                                       │
   └───────── pdf_url + status=done ───────┘
```

## Como usar

1. Usuário autenticado acessa `https://transparenciabr.web.app/escritorio`.
2. Digita o nome do parlamentar (ex: "Kim Kataguiri") e clica em
   **"Ativar Legião 100"**.
3. Frontend chama `iniciarDossieV1` → cria doc `dossies_v1/kim-kataguiri` e
   enfileira no Pub/Sub.
4. Eventarc dispara `dossie-v1-pipeline` Cloud Run Job.
5. Job carrega `lei_transparenciabr.md` + `skill_dossie_v1_0.md` + few-shots
   gold, roda 10 agentes em paralelo (asyncio.gather). Cada agente atualiza
   `agents.<id>.status` no Firestore.
6. Maestro consolida findings, valida tom (rejeita "fraudou/desviou/roubou/
   corrupto/BigQuery/vw_"), garante 40-55 findings.
7. `gerar_dossie_v1.py` produz PDF; Job sobe para GCS e atualiza Firestore
   com `pdf_url` + `status="done"`.
8. Frontend (onSnapshot) mostra avatares vivos durante a execução e link de
   download ao final.

## Custo estimado

| Item | Custo unitário (BRL) | Notas |
|---|---|---|
| 10× Gemini 2.5 Pro (forenses) | ~R$ 0,90 | 5-15k tokens cada, prompt cache reutilizado. |
| 1× Gemini 2.5 Pro (Maestro) | ~R$ 0,30 | Consolidação ~40-55 findings. |
| 1× Gemini 2.5 Flash (news triage) | ~R$ 0,05 | Triagem 30-50 notícias. |
| Cloud Run Job (2 CPU, 2 GiB, ~3 min) | ~R$ 0,10 | Tier free quase absorve. |
| Pub/Sub + Eventarc + GCS | ~R$ 0,01 | Desprezível. |
| **Total por dossiê** | **~R$ 1,50** | Sweet-spot 40-55 findings. |

## Como reverter

```bash
# 1. Reverter código
git revert <hash do merge da branch>

# 2. Remover Cloud Run Job
gcloud run jobs delete dossie-v1-pipeline \
  --region=southamerica-east1 --project=transparenciabr

# 3. Remover Eventarc trigger
gcloud eventarc triggers delete dossie-v1-pipeline-trigger \
  --location=southamerica-east1 --project=transparenciabr

# 4. Remover subscription (mantém topic se quiseres reativar)
gcloud pubsub subscriptions delete dossie-v1-pipeline-sub --project=transparenciabr

# 5. Remover function (mantém as outras)
firebase functions:delete iniciarDossieV1 --region=southamerica-east1 --project=transparenciabr
```

Documentos já gerados em `dossies_v1/{slug}` no Firestore e PDFs em
`gs://datalake-tbr-clean/dossies_v1/` ficam preservados a menos que sejam
removidos manualmente.
