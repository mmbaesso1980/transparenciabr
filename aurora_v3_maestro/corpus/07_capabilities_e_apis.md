# Capabilities e APIs do Maestro v1.0

## Capabilities ativas

### 1. Geração de dossiês forenses
- Carrega skill `dossie-forense-parlamentar` ou `due-diligence-pro`
- Pipeline em 10 fases (parlamentar) ou 9 fases (empresarial)
- Gera findings.json + PDF v2.3 Alta Inteligência + audit pdftotext
- Output em `gs://transparenciabr-dossies/<slug>/Dossie_<alvo>_v2-3.pdf`

### 2. Auto-edição de código TransparênciaBR
- Repositório: `mmbaesso1980/transparenciabr` (default branch `main`, público)
- Acesso via GitHub MCP connector ou token PAT
- Workflow:
  1. Clone shallow ou git API
  2. Edita arquivos (frontend React, functions Node, scripts Python, .py geradores)
  3. Snapshot em Firestore antes do commit
  4. `git commit -m "[maestro] <descrição>"` + push direto em main
  5. Log imutável em `maestro_audit_log`

### 3. Execução de comandos GCP
- `gcloud compute ssh aurora-cacador-br --tunnel-through-iap` (NUNCA `pkill -f` no command)
- `bq query --use_legacy_sql=false` em `transparenciabr` (US) ou `tbr_leads_prev` (sa-east1)
- `gcloud run deploy` em `projeto-codex-br`
- `firebase deploy --only hosting:fiscallizapa` (com FREIO 2)

### 4. Vertex AI / Gemini calls
- Modelo padrão: `gemini-2.5-pro` temperature=0.1 (forense determinístico)
- Modelo classificação leve: `gemini-2.5-flash` (CEAP triagem)
- Projeto: `projeto-codex-br`
- Region: `us-central1` (fine-tuning) ou `southamerica-east1` (inference)
- Custo médio dossiê: R$ 8-15 (gemini-2.5-pro, ~50k tokens in + ~30k tokens out)

### 5. Direct Data API
- Base URL: `https://apiv3.directd.com.br/api/`
- Token: `__SECRET_FROM_GCP_SECRET_MANAGER__` (em Secret Manager)
- Endpoints OK (v3): ReceitaFederalPessoaJuridica, BeneficiarioFinal, ProcessosJudiciaisSimplificada, CadastroPessoaFisicaPlus
- Endpoints 404 (v3): QuadroSocietarioReceitaFederal, PGFNListaDevedores, ProtestosCenprot

### 6. Telegram bidirecional
- Bot: `t.me/Asmodeuswebforgebot`
- Chat permitido: 6483072695 (Comandante Baesso) — APENAS
- Comandos suportados:
  - `/maestro status` — relatório de jobs em andamento
  - `/maestro dossie <nome>` — inicia novo dossiê
  - `/maestro stop` — kill-switch (FREIO 3)
  - `/maestro resume` — retoma após stop
  - `/maestro rollback <id>` — desfaz ação (FREIO 4)
  - `/maestro audit <N>` — últimas N entradas do log
  - `/maestro senha` — senha do dia (FREIO 2)
  - `/maestro override <FREIO> <razão>` — quebra de freio com log
  - `/maestro <texto livre>` — interpreta como instrução, chama Vertex pra planejar
- Modos de input: long-poll (VM) ou webhook (Cloud Run) — escolha: long-poll na VM aurora-cacador-br

### 7. Firestore (memória + auditoria)
- Database: `transparenciabr.firestore` (default)
- Coleções do Maestro:
  - `maestro_audit_log` — append-only, todo evento
  - `maestro_memory` — lições táticas (key-value)
  - `maestro_rollback` — snapshots pré-irreversível
  - `maestro_burn` — tracking de queima Vertex por hora
  - `maestro_intrusion` — tentativas não-autorizadas
  - `maestro_state` — estado atual (running | halted | tuning)

### 8. Cloud Storage
- Bucket dossiês: `gs://transparenciabr-dossies/` (public-read em URLs assinadas)
- Bucket findings JSON: `gs://transparenciabr-evidence/` (private)
- Bucket fine-tuning: `gs://projeto-codex-br-tuning/` (private)

### 9. Pub/Sub (orquestração interna)
- Topic `maestro-commands` — VM listener publica, Cloud Run worker subscreve
- Topic `maestro-events` — eventos para HQ Phaser dashboard (futuro)
- Subscription pull em Cloud Run worker

### 10. Aprendizado híbrido
- **Tático (memory)**: cada conclusão de tarefa, Maestro escreve em `maestro_memory` o que aprendeu (1-3 frases)
- **Estratégico (fine-tuning)**: trimestral, exporta últimos 10-30 dossiês do Cloud Storage como dataset JSONL e dispara fine-tuning de `gemini-2.5-pro` em `us-central1`. Custo estimado R$ 200-800 por ciclo.

## Stack tecnológico

```
Linguagens:
- Python 3.12 (worker, geradores PDF, Direct Data clients)
- Node.js 22 (Telegram listener, Cloud Functions)
- React 18 + Vite (HQ Phaser frontend — futuro)

Bibliotecas críticas:
- google-cloud-aiplatform (Vertex SDK)
- google-cloud-firestore
- google-cloud-storage
- google-cloud-pubsub
- python-telegram-bot ou requests para long-poll
- reportlab (PDF render)
- PyGithub (auto-edit)

Infra:
- VM aurora-cacador-br (sa-east1-a, IP 34.39.224.224, IAP-only) — Telegram listener + light jobs
- Cloud Run maestro-worker em projeto-codex-br — Vertex calls + auto-edit
- Firestore default database em transparenciabr
- Cloud Storage 3 buckets
- Pub/Sub 2 topics
```

## Service Accounts

| SA | Propósito | Permissões mínimas |
|---|---|---|
| `maestro-worker@projeto-codex-br.iam.gserviceaccount.com` | Cloud Run worker | aiplatform.user, firestore.user (transparenciabr), storage.objectAdmin, pubsub.subscriber |
| `maestro-listener@transparenciabr.iam.gserviceaccount.com` | VM listener | pubsub.publisher, firestore.user, secretmanager.secretAccessor |
| `tbr-reader@transparenciabr.iam.gserviceaccount.com` | BigQuery reads | bigquery.dataViewer (limited views) |
