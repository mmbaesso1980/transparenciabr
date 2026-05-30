# Ocean Ways

**Buscador de award flights para programas de fidelidade.**

> Encontre disponibilidade de voos com milhas em Star Alliance, SkyTeam e Oneworld de uma só vez.

**Status:** Scaffold R1 · Em desenvolvimento  
**Branch:** `feat/oceanways-mvp`  
**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30  

---

## Estrutura

```
apps/oceanways/
├── frontend/              # Vite + React · Firebase Hosting
├── backend/               # FastAPI · Cloud Run · southamerica-east1
├── search-engine/         # Módulo de busca multi-source (async)
├── billing/               # Créditos + Stripe + MercadoPago
├── schemas/               # BigQuery DDL (dataset: oceanways)
└── docs/
    ├── ARCHITECTURE.md    # Componentes, fluxos, paleta visual, decisão monorepo
    ├── MONETIZATION.md    # Planos, créditos, projeções
    ├── COVERAGE.md        # Rotas, alianças, fontes de dados
    └── TOS_LEGAL.md       # TOS de fontes, LGPD, isenção de responsabilidade
```

---

## Quick start — Desenvolvimento local

### Backend

```bash
cd apps/oceanways/backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8080
# Docs: http://localhost:8080/docs
```

### Frontend

```bash
cd apps/oceanways/frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## Deploy

| Módulo | Plataforma | Comando |
|--------|------------|---------|
| frontend | Firebase Hosting | `npm run build && firebase deploy --only hosting:oceanways` |
| backend | Cloud Run | `docker build + gcloud run deploy oceanways-api` |
| alert-checker | Cloud Run Job | `gcloud run jobs create oceanways-alert-checker ...` |

Detalhes completos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Variáveis de ambiente (`.env.local` para dev)

```
# Firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=projeto-codex-br
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Backend URL (dev: proxy via Vite; prod: Cloud Run URL)
VITE_OCEANWAYS_API_URL=http://localhost:8080/api/v1

# Backend (Cloud Run env / Secret Manager)
FIREBASE_PROJECT_ID=projeto-codex-br
OCEANWAYS_BQ_DATASET=oceanways
STRIPE_WEBHOOK_SECRET=whsec_...
MP_ACCESS_TOKEN=APP_USR-...
ALLOWED_ORIGINS=https://oceanways.transparenciabr.web.app
```

---

## Documentação

- [Arquitetura completa](docs/ARCHITECTURE.md) — decisão monorepo, componentes, fluxo de busca, paleta visual
- [Monetização](docs/MONETIZATION.md) — planos, créditos, projeções
- [Cobertura de rotas e fontes](docs/COVERAGE.md) — R1 e roadmap
- [TOS e LGPD](docs/TOS_LEGAL.md) — compliance, direitos do usuário
- [MAESTRO_TASKLIST.md](MAESTRO_TASKLIST.md) — checklist de implementação para o Maestro (Vertex Pro)

---

## Paleta visual

Ocean Ways usa identidade visual própria ("Deep Ocean") — não o teal do TransparênciaBR.

| Token | Hex | Uso |
|-------|-----|-----|
| `ocean-950` | `#020B18` | Background principal |
| `ocean-500` | `#1565C0` | Primário (botões) |
| `ocean-300` | `#42A5F5` | Hover, highlights |
| `gold-400`  | `#FFCA28` | Accent premium |

Paleta completa em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#visual).
