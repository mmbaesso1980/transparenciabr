# Manifesto de Arquitetura TransparênciaBR

> **Diretiva permanente para qualquer agente IA (Vertex, Cursor, Claude, Gemini, etc.) que atue sobre este projeto.** Lê antes de propor qualquer mudança.

## Princípio Soberano
Este projeto opera sobre **infraestrutura própria do Comandante Baesso**. Não sugira soluções de alto custo em nuvem para tarefas que a infraestrutura local resolve. Em caso de dúvida, escolha o caminho mais barato compatível com qualidade.

## Stack

### Camada 1 — VM Mainframe (Compute Engine)
- Nome: `tbr-mainframe`
- Zona: `us-central1-a`
- IP: 34.133.19.106
- Função: servidor seguro de ingestão e processamento. Crawlers (módulo CRAWLER) rodam aqui ininterruptamente.
- Acesso: SSH via `gcloud compute ssh tbr-mainframe --zone=us-central1-a --project=transparenciabr`
- Service Account: `tbr-ingestor@transparenciabr.iam.gserviceaccount.com` (storage.objectAdmin, sem permissão de compute)

### Camada 2 — NVIDIA L4 GPU (24 GB VRAM)
- Modelo local: **Ollama + Gemma 27B Q4_K_M** (16 GB residente)
- Função: processamento soberano sem custo por token. OCR + classificação forense em massa.
- Política: **95% dos casos rodam aqui**. Apenas casos críticos (nível ≥ 5) escalam para Vertex AI.

### Camada 3 — Data Lake GCS (3 buckets)

| Bucket | Função | Conteúdo atual |
|---|---|---|
| `gs://datalake-tbr-raw/` | Dados brutos públicos (pré-processamento) | Vazio (crawlers não disparados) |
| `gs://datalake-tbr-clean/` | Dados limpos pós-AURORA + roster + consents | 18 JSONLs CEAP + roster.json |
| `gs://datalake-tbr-quarantine/` | Rejeições (OCR falhou, score baixo, schema inválido) | Vazio |

### Camada 4 — BigQuery
- Projeto: `transparenciabr`
- Tabelas: `ceap_despesas`, `politicians_metadata`, `party_aggregates`, `audit_findings`
- **Status**: tabelas existem mas pipeline de carga ainda não foi acionado

### Camada 5 — Firestore (APENAS estado de aplicação)
> **REGRA RÍGIDA**: ZERO dados de auditoria no Firestore. Apenas:
> - `users/{uid}` (perfil mínimo)
> - `users/{uid}/meta/status` (flag de consentimento ativo)
> - `stripe_customers/{uid}`, `stripe_events/{eventId}`, `credits_balance/{uid}`

### Camada 6 — Frontend
- React + Vite + Tailwind + Three.js (`/universo` cosmos)
- Hosting: `transparenciabr.web.app` (Firebase Hosting)
- Auth: Firebase Auth

### Camada 7 — Vertex AI (escalonamento)
- Agent Builder principal / Líder Supremo: `agent_1777236402725` (motor único **Gemini 2.5 Pro** — G.O.A.T.)
- Reasoning engines para findings críticos
- Hard-stop financeiro: **US$ 50/dia**

## Fluxo de Dados Canônico

```
Fontes públicas (Câmara API, DOU, TSE, etc.)
   ↓ CRAWLER (Python na VM)
gs://datalake-tbr-raw/
   ↓ AURORA Engine (L4 + Gemma 27B local)
   ├─ 95% baixo/médio risco → gs://datalake-tbr-clean/
   └─ 5% alto risco → Vertex AI Gemini 2.5 Pro (`agent_1777236402725`) → laudo PDF → gs://datalake-tbr-clean/reports/
gs://datalake-tbr-clean/
   ↓ Cloud Functions (REST API)
Frontend React (transparenciabr.web.app)
   ↓ Firebase Auth + Stripe
Usuário final + paywall
```

## Regras de Decisão para Agente Vertex

1. **Volume massivo + repetitivo (OCR, classificação CEAP, etc.)** → use a L4 (Gemma local), nunca proponha Vertex pago.
2. **Análise profunda de caso isolado, redação jurídica** → escale para Vertex Gemini 2.5 Pro (Líder Supremo `agent_1777236402725`).
3. **Frontend, lógica de negócio, código React** → você executa diretamente, sem custo de inference.
4. **Acesso a dados** → sempre via GCS path canônico ou Cloud Function existente. Nunca proponha leitura direta do Firestore para dados de auditoria.
5. **Persistência de aceites/auditoria** → SEMPRE GCS, nunca Firestore.

## Convenção de Nomenclatura
- Engine: **AURORA**
- Módulos: 12 nomes técnicos (PRISMA-CORE, LEDGER, BENCHMARK, BIDDING, LEDGER-X, PATRIMONY, TRACE, EMENDA-AUDIT, PANOPTIC, MONITOR, NETWORK, VENDOR-X)
- Crawler: **CRAWLER** (genérico)
- Sem nomenclatura mística, religiosa ou pessoal em código novo ou docs públicas.

## Limites Financeiros
- Vertex AI: hard-stop US$ 50/dia
- Stripe: ambiente teste por enquanto (`sk_test_...`)
- GCS: monitorado, alerta em US$ 20/mês

---
**Aprovado pelo Comandante Maurílio Baesso · 01/05/2026**
