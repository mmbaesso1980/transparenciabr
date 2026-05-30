# Projeto A — Radar Jurídico INSS

**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30 12:03 BRT  
**Branch:** `feat/radar-juridico-exclusivo`  
**Maestro:** v2.1.4 Cartman Edition — implementa o miolo após scaffold  
**Billing:** `transparenciabr` (GCP project)

---

## Visão geral

O Radar Jurídico INSS é uma **aplicação isolada** dentro do monorepo TransparênciaBR,
voltada exclusivamente ao mercado previdenciário: advogados e escritórios que monitoram
publicações no Diário Oficial, PJe e sistemas judiciais para identificar oportunidades
de contestação de indeferimentos INSS.

Princípio fundamental: **"Não denunciamos, mostramos"** — a plataforma exibe dados
públicos organizados de forma legível; a interpretação jurídica cabe ao profissional.

### Funcionalidades do R1

| Funcionalidade | Paywall |
|---|---|
| Listagem de indeferimentos recentes (UF + espécie) | Freemium (limite 50/dia) |
| Filtros avançados + match ICP | **Paywall 1** (crédito por consulta) |
| Monitor "publicou-pegamos-alarme" por CPF / número de processo | **Paywall 2** (crédito por alerta) |
| Checagem anti-waste PJe (litispendência TRF3) | Incluído no Paywall 2 |
| Enrichment PII via AURORA (caminhos A/B/C/D) | Somente backend, nunca exposto ao frontend |
| Export CSV com header LGPD | Paywall 1 |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind CSS 4 (paleta teal `#01696F`) |
| Backend | Python 3.12 + FastAPI + Gunicorn (Cloud Run) |
| Pipeline | Cloud Run Jobs (Python, Pub/Sub push) |
| Banco | BigQuery `radar_juridico.*` (southamerica-east1) + Firestore |
| Auth | Firebase Auth (Google + email/senha) |
| LLM | Vertex AI Gemini 2.5 Pro (apenas no Maestro worker) |
| Notificações | FCM + Telegram Bot |
| Secrets | Google Secret Manager |

> **Regra de ouro:** BigQuery **nunca é exposto ao frontend**. Toda query passa
> pelo backend Cloud Run, que devolve JSON sanitizado.

---

## Estrutura de pastas

```
apps/radar-juridico/
├── README.md                     ← este arquivo
├── MAESTRO_TASKLIST.md           ← checklist de implementação
├── docs/
│   ├── ARCHITECTURE.md           ← diagramas de fluxo
│   ├── PAYWALLS.md               ← definição das 2 paywalls
│   └── LGPD.md                   ← base legal e retenção
├── schemas/
│   ├── bigquery_radar_juridico.sql   ← DDL dos datasets
│   └── firestore_radar_juridico.rules ← delta de regras Firestore
├── backend/
│   ├── Dockerfile
│   ├── cloudbuild.yaml
│   ├── requirements.txt
│   └── src/
│       ├── main.py               ← FastAPI entry point
│       ├── routes/
│       │   ├── leads.py          ← /leads, /leads/{id}
│       │   ├── alertas.py        ← /alertas (publicou-pegamos)
│       │   ├── pje.py            ← /pje/check litispendência
│       │   └── creditos.py       ← /creditos/debitar
│       └── services/
│           ├── bq_service.py     ← wrapper BigQuery (southamerica-east1)
│           ├── firestore_service.py
│           ├── aurora_enricher.py ← 4 caminhos AURORA
│           └── pje_checker.py    ← anti-waste PJe
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── KpiCard.jsx
│       │   ├── LeadTable.jsx
│       │   ├── AlertModal.jsx
│       │   ├── PaywallGate.jsx
│       │   └── PjeStatusBadge.jsx
│       ├── hooks/
│       │   ├── useLeads.js
│       │   ├── useAlertas.js
│       │   └── useCreditos.js
│       ├── pages/
│       │   ├── DashboardPage.jsx
│       │   ├── LeadsPage.jsx
│       │   ├── AlertasPage.jsx
│       │   └── LoginPage.jsx
│       ├── lib/
│       │   ├── firebase.js
│       │   └── api.js            ← chamadas ao backend Cloud Run
│       └── context/
│           └── AuthContext.jsx
└── pipelines/
    ├── Dockerfile.job
    └── publicou_pegamos_alarme.py ← Cloud Run Job de monitoramento
```

---

## Como rodar local

### Backend

```bash
cd apps/radar-juridico/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Variáveis mínimas locais
export GOOGLE_CLOUD_PROJECT=transparenciabr
export BQ_LOCATION=southamerica-east1
export FIRESTORE_PROJECT=transparenciabr
export PORT=8080

uvicorn src.main:app --reload --port 8080
```

### Frontend

```bash
cd apps/radar-juridico/frontend
npm install
cp .env.example .env.local   # preencher Firebase config
npm run dev
```

### Pipeline (local test)

```bash
cd apps/radar-juridico/pipelines
pip install -r ../backend/requirements.txt
python publicou_pegamos_alarme.py --dry-run
```

---

## Deploy (Cloud Run)

```bash
# Backend
cd /tmp/trbr_work
gcloud builds submit \
  --config=apps/radar-juridico/backend/cloudbuild.yaml \
  --region=southamerica-east1

# Frontend — via Firebase Hosting
cd apps/radar-juridico/frontend
npm run build
firebase deploy --only hosting:radar-juridico
```

---

## Variáveis de ambiente (backend)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | sim | — | Projeto GCP |
| `BQ_LOCATION` | sim | `southamerica-east1` | Região BigQuery |
| `FIRESTORE_PROJECT` | sim | — | Projeto Firestore |
| `PJE_TOKEN` | não | — | Token advogado PJe TRF3 |
| `TELEGRAM_BOT_TOKEN` | não | Secret Manager | FCM fallback Telegram |
| `AURORA_ADMIN_TOKEN` | não | Secret Manager | Acesso admin aos caminhos A/B |
| `PORT` | não | `8080` | Porta Cloud Run |

---

## Contato / Suporte

Comandante Maurílio Baesso — `mmbaesso@hotmail.com`  
Telegram: `@Asmodeuswebforgebot` (chat_id: `6483072695`)

---

*Estrutura scaffold criada pelo Arquiteto em 2026-05-30.  
Implementação do miolo de negócio: responsabilidade do Maestro (Vertex AI Gemini 2.5 Pro).*
