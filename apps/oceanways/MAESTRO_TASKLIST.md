# Ocean Ways — MAESTRO TASKLIST

**Para:** Maestro (Vertex Pro)  
**De:** Arquiteto (scaffold R1)  
**Data:** 2026-05-30  
**Branch:** `feat/oceanways-mvp`  

A "casa está pronta". Este checklist guia a implementação do miolo de código em ordem de dependência.  
Cada item referencia o arquivo scaffold com TODOs detalhados.

---

## FASE 0 — Setup e credenciais (pré-requisito para tudo)

- [ ] **0.1** Registrar conta developer em `developer.united.com` → obter API key
- [ ] **0.2** Registrar conta developer em `developer.airfranceklm.com` → obter client_id/secret
- [ ] **0.3** Registrar conta em `developers.amadeus.com` (fallback GDS) → obter client_id/secret
- [ ] **0.4** Contatar `seek.travel` e `point.me` sobre API/affiliate (verificar TOS)
- [ ] **0.5** Criar conta Stripe Business + KYB em `stripe.com/br` → obter sk_live + webhook secret
- [ ] **0.6** Criar conta MercadoPago Business em `mercadopago.com.br` → obter access_token
- [ ] **0.7** Gravar TODOS os secrets no GCP Secret Manager (projeto: `projeto-codex-br`)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_TOPUP`
  - `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`
  - `UNITED_API_KEY`, `AF_CLIENT_ID`, `AF_CLIENT_SECRET`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`
- [ ] **0.8** Criar dataset BigQuery `oceanways` no projeto `projeto-codex-br`
  ```bash
  bq mk --dataset --location=US projeto-codex-br:oceanways
  ```
- [ ] **0.9** Executar DDL: `apps/oceanways/schemas/bigquery_oceanways.sql`
- [ ] **0.10** Configurar Firebase Hosting target `oceanways` no `firebase.json`

---

## FASE 1 — Infraestrutura GCP

- [ ] **1.1** Criar Artifact Registry repo `oceanways` em `southamerica-east1`
  ```bash
  gcloud artifacts repositories create oceanways \
    --repository-format=docker --location=southamerica-east1
  ```
- [ ] **1.2** Criar Service Account `oceanways-backend@projeto-codex-br.iam.gserviceaccount.com`
  - Roles: `roles/bigquery.dataEditor`, `roles/datastore.user`, `roles/secretmanager.secretAccessor`
- [ ] **1.3** Criar Pub/Sub topics: `oceanways-alerts-tick`, `oceanways-alert-hits`
- [ ] **1.4** Configurar Workload Identity Federation para GitHub Actions (CI/CD)

---

## FASE 2 — Backend FastAPI

**Arquivo principal:** `apps/oceanways/backend/src/main.py`

- [ ] **2.1** Inicializar `firebase_admin.initialize_app()` com credenciais do Secret Manager
  - Arquivo: `apps/oceanways/backend/src/main.py` seção `startup_event`
- [ ] **2.2** Implementar `middleware/auth.py` → `verify_firebase_token()` com `firebase_admin.auth`
- [ ] **2.3** Adicionar middleware de auth como FastAPI Dependency em todas as rotas protegidas
- [ ] **2.4** Implementar rate limiter:
  - 10 req/min por IP no `/api/v1/search`
  - 60 buscas/h para Pro; 10/h para Free
  - Sugestão: `slowapi` com Redis ou Firestore como backend
- [ ] **2.5** Implementar health check completo em `/healthz` (ping Firestore + BQ)
- [ ] **2.6** Primeiro build Docker + push para Artifact Registry:
  ```bash
  docker build -f apps/oceanways/backend/Dockerfile \
    -t southamerica-east1-docker.pkg.dev/projeto-codex-br/oceanways/api:latest .
  ```
- [ ] **2.7** Deploy Cloud Run service `oceanways-api`:
  ```bash
  gcloud run deploy oceanways-api \
    --image southamerica-east1-docker.pkg.dev/projeto-codex-br/oceanways/api:latest \
    --region southamerica-east1 --project projeto-codex-br \
    --service-account oceanways-backend@projeto-codex-br.iam.gserviceaccount.com \
    --no-allow-unauthenticated
  ```

---

## FASE 3 — Billing (créditos + pagamentos)

**Arquivo:** `apps/oceanways/billing/src/credits.py`

- [ ] **3.1** Implementar `check_credits(uid, required)` — lê Firestore `users/{uid}`
- [ ] **3.2** Implementar `debit(uid, amount, reason, reference_id)` com Firestore transaction
  - Garantir atomicidade: debitar crédito e registrar evento BQ na mesma operação lógica
  - Implementar `InsufficientCreditsError`
- [ ] **3.3** Implementar `credit(uid, amount, reason, reference_id)` com idempotência
- [ ] **3.4** Implementar `expire_monthly(uid)` com rollover (máx 200 credits levados)

**Arquivo:** `apps/oceanways/billing/src/payments_stripe.py`

- [ ] **3.5** `pip install stripe` → adicionar ao `requirements.txt`
- [ ] **3.6** Implementar `create_checkout_session()` para PLAN_PRO (subscription) e TOPUP_100
- [ ] **3.7** Implementar `handle_webhook_event()`:
  - Validar `Stripe-Signature` com `stripe.Webhook.construct_event`
  - Chamar `billing.credits.credit()` após pagamento confirmado
  - Atualizar Firestore `users/{uid}.plan` para PRO
  - Gravar em BQ `oceanways.transactions`
- [ ] **3.8** Configurar webhook URL no Stripe Dashboard: `POST /api/v1/payments/stripe/webhook`
- [ ] **3.9** Testar com Stripe CLI: `stripe listen --forward-to localhost:8080/api/v1/payments/stripe/webhook`

**Arquivo:** `apps/oceanways/billing/src/payments_mercadopago.py`

- [ ] **3.10** `pip install mercadopago` → adicionar ao `requirements.txt`
- [ ] **3.11** Implementar `create_preference()` para Pix/boleto
- [ ] **3.12** Implementar `handle_webhook()` com validação de assinatura MP
- [ ] **3.13** Decidir estratégia de assinatura recorrente MP (ver nota em `payments_mercadopago.py`)

---

## FASE 4 — Search Engine

**Arquivo:** `apps/oceanways/search-engine/src/sources/direct_airlines.py`

- [ ] **4.1** Implementar `UnitedSource.search()` após obter API key (FASE 0.1)
  - Mapear campos: ver comentário `_normalize()` no arquivo
- [ ] **4.2** Implementar `AirFranceSource.search()` após obter credenciais OAuth2 (FASE 0.2)
- [ ] **4.3** Implementar `AmadeusSource.search()` como fallback (FASE 0.3)
- [ ] **4.4** Implementar `DirectAirlinesSource.search()` com `asyncio.gather` interno

**Arquivo:** `apps/oceanways/search-engine/src/aggregator.py`

- [ ] **4.5** Implementar `aggregate_search()` com `asyncio.gather(*tasks)` e timeout por source
- [ ] **4.6** Implementar `_deduplicate()` por `(operating_carrier, flight_number, dep_datetime, cabin)`
- [ ] **4.7** Implementar cache Firestore TTL 4h em `search-engine/src/cache/`
  - Chave: `{origin}_{dest}_{dep_date}_{cabin}`
  - TTL: 4h via `expireAt` field no Firestore

---

## FASE 5 — Rotas Backend (conectar tudo)

**Arquivo:** `apps/oceanways/backend/src/routes/search.py`

- [ ] **5.1** Extrair `uid` do Firebase JWT via `verify_firebase_token` dependency
- [ ] **5.2** Implementar check de créditos antes de buscar
- [ ] **5.3** Conectar ao `aggregate_search()` do search-engine
- [ ] **5.4** Implementar gravação em BQ `oceanways.searches` + `oceanways.results`
- [ ] **5.5** Implementar débito de 1 crédito após busca bem-sucedida
- [ ] **5.6** Implementar histórico de buscas (`GET /search/history`)

**Arquivo:** `apps/oceanways/backend/src/routes/alerts.py`

- [ ] **5.7** Implementar `POST /alerts` — verificar limite de plano antes de criar
- [ ] **5.8** Implementar `GET /alerts` — ler Firestore `users/{uid}/alerts`
- [ ] **5.9** Implementar `DELETE /alerts/{id}` — soft delete + verificar ownership

**Arquivo:** `apps/oceanways/backend/src/routes/auth.py`

- [ ] **5.10** Implementar `GET /me` — ler Firestore `users/{uid}`
- [ ] **5.11** Criar doc Firestore `users/{uid}` no primeiro login (trigger ou endpoint `/me/init`)
- [ ] **5.12** Implementar `DELETE /me` — sequência de erasure LGPD completa
- [ ] **5.13** Implementar `GET /me/data` — portabilidade de dados LGPD

---

## FASE 6 — Alert Checker (Cloud Run Job)

- [ ] **6.1** Criar `apps/oceanways/backend/src/jobs/alert_checker.py`
  - Lê `oceanways.alerts WHERE active=TRUE AND next_check_at <= NOW()`
  - Chama `aggregate_search()` para cada alerta
  - Se hit: publica em Pub/Sub `oceanways-alert-hits`
  - Atualiza `last_checked_at` e `next_check_at` (+6h)
  - Se créditos < 2: desativa alerta e notifica usuário
- [ ] **6.2** Criar job notificador: `apps/oceanways/backend/src/jobs/alert_notifier.py`
  - Lê Pub/Sub `oceanways-alert-hits`
  - Envia notificação (e-mail via SendGrid ou Firebase push)
  - Debita 2 créditos via `billing.credits.debit()`
- [ ] **6.3** Dockerizar job (pode usar o mesmo Dockerfile do backend com `CMD` diferente)
- [ ] **6.4** Deploy Cloud Run Job `oceanways-alert-checker`
- [ ] **6.5** Criar Cloud Scheduler trigger: a cada 6h

---

## FASE 7 — Frontend

**Arquivo:** `apps/oceanways/frontend/src/App.jsx`

- [ ] **7.1** Inicializar Firebase App em `main.jsx` com variáveis VITE_FIREBASE_*
- [ ] **7.2** Implementar `useAuth` hook com `onAuthStateChanged`
- [ ] **7.3** Implementar `AuthContext + AuthProvider`
- [ ] **7.4** Ativar `ProtectedRoute` no App.jsx (substituir placeholder)
- [ ] **7.5** Implementar `services/api.js` com `getAuthToken()` real

**Páginas (ordem sugerida):**

- [ ] **7.6** `LoginPage.jsx` — Google OAuth + e-mail/senha + aceite LGPD
- [ ] **7.7** `PricingPage.jsx` — conectar botões ao `createCheckout()` real
- [ ] **7.8** `SearchPage.jsx` — implementar `SearchForm` completo com autocomplete IATA
- [ ] **7.9** `ResultsPage.jsx` — implementar listagem com filtros e skeleton loading
- [ ] **7.10** `Dashboard.jsx` — créditos em tempo real + alertas + histórico
- [ ] **7.11** `Home.jsx` — hero com SearchForm embutido + features + CTA

**Componentes:**

- [ ] **7.12** `SearchForm.jsx` — autocomplete aeroportos, date picker, multi-select programas
- [ ] **7.13** `ResultCard.jsx` — logos das cias (criar `public/airlines/`), badge de aliança
- [ ] **7.14** `CreditBadge.jsx` — conectar ao `useCredits()` hook
- [ ] **7.15** `Navbar.jsx` — implementar auth state + mobile hamburger

---

## FASE 8 — Testes

- [ ] **8.1** Backend: testes unitários para `billing/credits.py` (mock Firestore)
- [ ] **8.2** Backend: testes de integração para rotas principais (pytest-httpx)
- [ ] **8.3** Backend: teste de webhook Stripe (mock stripe.Webhook.construct_event)
- [ ] **8.4** Search engine: testes com fixtures de response mockado por source
- [ ] **8.5** Frontend: testes de componentes (Vitest + Testing Library)

---

## FASE 9 — CI/CD (ativar jobs comentados)

- [ ] **9.1** Descomentar jobs `deploy-backend` e `deploy-frontend` em `deploy_oceanways.yml`
- [ ] **9.2** Adicionar secrets do GitHub Actions:
  - `VITE_FIREBASE_*`, `VITE_OCEANWAYS_API_URL`
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
- [ ] **9.3** Gerar `package-lock.json` no frontend (`npm install`) para `npm ci` no CI

---

## FASE 10 — Checklist legal (antes de lançar publicamente)

- [ ] **10.1** TOS revisado por advogado digital (ver `docs/TOS_LEGAL.md`)
- [ ] **10.2** Política de Privacidade LGPD publicada e linkada no login/footer
- [ ] **10.3** Contratos assinados com APIs externas (United, AF/KLM, Amadeus)
- [ ] **10.4** Stripe KYB completo + MercadoPago Business verificado
- [ ] **10.5** Testes de pagamento end-to-end (Stripe test mode + MP sandbox)
- [ ] **10.6** CNPJ definido (Ocean Ways ou CNPJ existente do Comandante)

---

## Ordem de execução recomendada

```
FASE 0 (setup) → FASE 1 (GCP) → FASE 3 (billing) + FASE 4 (search engine) em paralelo
→ FASE 2 (backend deploy) → FASE 5 (conectar) → FASE 6 (alertas) → FASE 7 (frontend)
→ FASE 8 (testes) → FASE 9 (CI/CD) → FASE 10 (legal) → LAUNCH
```

---

## Billing guardrail

Custo estimado por busca real: R$ 0,02–0,05 (Cloud Run + BQ + APIs externas).  
**F5 hard-cap R$ 80/h aplicado.** Se custo exceder durante implementação, pausar e reportar.

---

*Scaffold criado por: Arquiteto (subagente) · 2026-05-30*  
*Implementação: Maestro (Vertex Pro)*  
*Aprovação: Comandante Maurílio Baesso*
