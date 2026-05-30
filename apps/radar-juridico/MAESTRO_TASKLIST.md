# MAESTRO_TASKLIST.md — Radar Jurídico INSS

**Para:** Maestro Gemini 2.5 Pro (Vertex AI)  
**De:** Arquiteto (Computer/Perplexity)  
**Data do scaffold:** 2026-05-30  
**Senha de execução (F2):** `aurora-cartman-2026`  
**Projeto GCP:** `transparenciabr`  
**Branch:** `feat/radar-juridico-exclusivo`

---

## Contexto

A estrutura completa foi criada pelo Arquiteto. O Maestro precisa implementar
**apenas o miolo de negócio** — as funções marcadas com `TODO(maestro)`.
Nenhum arquivo novo precisa ser criado (exceto os marcados explicitamente).
Nenhuma pasta nova precisa ser criada.

**Princípio:** "Não denunciamos, mostramos." LGPD sempre em primeiro lugar.

---

## Checklist de implementação

### Fase 0 — Pré-requisitos GCP

- [ ] **0.1** Criar dataset BigQuery `radar_juridico` na região `southamerica-east1`:
  ```bash
  bq mk --location=southamerica-east1 --dataset transparenciabr:radar_juridico
  ```

- [ ] **0.2** Executar DDL das tabelas:
  ```bash
  bq query --location=southamerica-east1 --use_legacy_sql=false \
    < apps/radar-juridico/schemas/bigquery_radar_juridico.sql
  ```

- [ ] **0.3** Criar Service Account para o backend:
  ```bash
  gcloud iam service-accounts create radar-juridico-api \
    --display-name="Radar Juridico API"
  gcloud projects add-iam-policy-binding transparenciabr \
    --member=serviceAccount:radar-juridico-api@transparenciabr.iam.gserviceaccount.com \
    --role=roles/bigquery.dataViewer
  gcloud projects add-iam-policy-binding transparenciabr \
    --member=serviceAccount:radar-juridico-api@transparenciabr.iam.gserviceaccount.com \
    --role=roles/bigquery.dataEditor  # para lgpd_audit_radar
  gcloud projects add-iam-policy-binding transparenciabr \
    --member=serviceAccount:radar-juridico-api@transparenciabr.iam.gserviceaccount.com \
    --role=roles/datastore.user
  gcloud projects add-iam-policy-binding transparenciabr \
    --member=serviceAccount:radar-juridico-api@transparenciabr.iam.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor
  ```

- [ ] **0.4** Integrar regras Firestore delta:
  Copiar conteúdo de `apps/radar-juridico/schemas/firestore_radar_juridico.rules`
  para o `firestore.rules` raiz (antes do catch-all `match /{document=**}`).

- [ ] **0.5** Configurar TTL policy no Firestore:
  ```bash
  gcloud firestore fields ttls update \
    --collection-group=radar_juridico_pje_cache \
    --field-path=expira_em --enable-ttl
  ```

---

### Fase 1 — Backend FastAPI

#### 1.1 — Infraestrutura do servidor

- [ ] **1.1.1** `apps/radar-juridico/backend/src/main.py`
  - Implementar `lifespan()`: inicializar `BQService`, `FirestoreService` e `firebase_admin`
  - Implementar `auth_middleware()`: verificar Bearer token Firebase com `firebase_auth.verify_id_token()`
  - Descomentar `app.include_router()` para todas as rotas
  - Implementar métricas Prometheus em `/metrics`

#### 1.2 — Services

- [ ] **1.2.1** `apps/radar-juridico/backend/src/services/bq_service.py`
  - Implementar `query_leads()` com query paginada em `vw_leads_scored_safe`
  - Implementar `get_lead_by_id()`
  - Implementar `get_pje_cache()` e `set_pje_cache()`
  - Implementar `log_lgpd()` via streaming insert
  - **Criar** a view `vw_leads_scored_safe` (DDL em schema → seção TODO)

- [ ] **1.2.2** `apps/radar-juridico/backend/src/services/firestore_service.py`
  - Implementar `get_creditos()` com leitura de `usuarios/{uid}.creditos`
  - Implementar `debitar_credito()` com transação atômica Firestore
  - Implementar `create_alerta()`, `list_alertas()`, `cancel_alerta()`

- [ ] **1.2.3** `apps/radar-juridico/backend/src/services/pje_checker.py`
  - Implementar `check()` com cascade: cache BQ → PJe API → Datajud CNJ
  - Implementar `_query_pje_api()` com token de advogado (httpx, timeout 10s)
  - Implementar `_query_datajud()` com key pública (cobertura TRF3, TJSP, TRF1, TRF2)

- [ ] **1.2.4** `apps/radar-juridico/backend/src/services/aurora_enricher.py`
  - Implementar `enrich()` com cascade A → B → C → D
  - Implementar `_caminho_a_dataprev()` (retorna 503 se DATAPREV_ENABLED=false)
  - Implementar `_caminho_b_bureau()` com circuit breaker por BUDGET_DIARIO_BRL
  - Implementar `_caminho_c_consent()` com leitura de `tbr_leads_prev.leads_finalizados`
  - Implementar `_caminho_d_peticao()` com python-docx + upload GCS

#### 1.3 — Rotas

- [ ] **1.3.1** `apps/radar-juridico/backend/src/routes/leads.py`
  - Implementar `list_leads()`: verificar auth → checar créditos → debitar → query BQ → retornar
  - Implementar `get_lead()`: mesma lógica, por lead_id
  - Implementar `export_leads_csv()`: 5 créditos, CSV com header LGPD obrigatório

- [ ] **1.3.2** `apps/radar-juridico/backend/src/routes/alertas.py`
  - Implementar `create_alerta()`: verificar limite 20 alertas → debitar 2 créditos → Firestore + BQ
  - Implementar `list_alertas()`: ler Firestore com filtro de status
  - Implementar `cancel_alerta()`: verificar propriedade (uid == alerta.uid)

- [ ] **1.3.3** `apps/radar-juridico/backend/src/routes/pje.py`
  - Implementar `check_litispendencia()`: chamar PjeChecker com cache BQ

- [ ] **1.3.4** `apps/radar-juridico/backend/src/routes/creditos.py`
  - Implementar `get_saldo()`: leitura Firestore
  - Implementar `get_historico()`: query BQ agrupada por data

---

### Fase 2 — BigQuery (Scoring)

- [ ] **2.1** **Criar** view `vw_leads_scored_safe` no BigQuery:
  Descomentar e adaptar o DDL no final de `schemas/bigquery_radar_juridico.sql`

- [ ] **2.2** **Criar ou adaptar** job de scoring de leads:
  Opção A: BQ Scheduled Query que roda `INSERT INTO leads_radar_scored SELECT ...` com scoring por espécie/motivo  
  Opção B: Cloud Run Job Python que usa Vertex AI Gemini 2.5 Pro para scoring em batch  
  **Recomendação Maestro:** escolher a opção mais custo-eficiente e justificar.

- [ ] **2.3** Definir rubrica de scoring ICP (0-100) por combinação:
  `especie_codigo + motivo_indeferimento + clientela → tipo_acao_id + score`
  Referência de tipos: `frontend/src/data/leadsPrevidenciario.js` (TIPOS_ACAO existentes)

---

### Fase 3 — Pipeline "publicou-pegamos"

- [ ] **3.1** `apps/radar-juridico/pipelines/publicou_pegamos_alarme.py`
  - Implementar `DouScanner.scan()` via Inlabs API (autenticação JWT)
  - Implementar `QueiridoDiarioScanner.scan()` via API Querido Diário
  - Implementar `PjeAntiwaste.check()` com os 4 caminhos AURORA (ver seção TODO no arquivo)
  - Implementar `Notificador.notificar_fcm()` via firebase_admin.messaging
  - Implementar `Notificador.notificar_telegram()` via httpx (chat_id: 8 dígitos `6483072695`)
  - Implementar `PublicouPegamosOrquestrador.run()` com loop de alertas

- [ ] **3.2** Configurar Cloud Scheduler:
  ```bash
  gcloud scheduler jobs create pubsub publicou-pegamos-06h \
    --location=southamerica-east1 \
    --schedule="0 9 * * *" \          # 06:00 BRT = 09:00 UTC
    --topic=radar-juridico-alertas \
    --message-body='{"trigger":"scheduler"}' \
    --time-zone="America/Sao_Paulo"

  gcloud scheduler jobs create pubsub publicou-pegamos-18h \
    --location=southamerica-east1 \
    --schedule="0 21 * * *" \          # 18:00 BRT = 21:00 UTC
    --topic=radar-juridico-alertas \
    --message-body='{"trigger":"scheduler"}' \
    --time-zone="America/Sao_Paulo"
  ```

- [ ] **3.3** Criar Cloud Run Job para o pipeline:
  ```bash
  gcloud run jobs create publicou-pegamos-alarme \
    --image=southamerica-east1-docker.pkg.dev/transparenciabr/transparenciabr/publicou-pegamos:latest \
    --region=southamerica-east1 \
    --service-account=radar-juridico-api@transparenciabr.iam.gserviceaccount.com \
    --set-env-vars=GOOGLE_CLOUD_PROJECT=transparenciabr,BQ_LOCATION=southamerica-east1
  ```

---

### Fase 4 — Frontend React

- [ ] **4.1** `apps/radar-juridico/frontend/src/App.jsx`
  - Envolver com `<AuthProvider>` (importar de `context/AuthContext.jsx`)
  - Substituir `<ScaffoldPage>` por componentes reais em cada rota
  - Implementar `<ProtectedRoute>` para rotas que exigem login

- [ ] **4.2** Implementar `context/AuthContext.jsx`
  - Lógica `onAuthStateChanged` (scaffold presente)
  - `getIdToken()` com refresh automático a cada 55 minutos

- [ ] **4.3** Implementar páginas (em `src/pages/`):
  - **Criar** `DashboardPage.jsx`: KPIs globais (total leads, alertas ativos, créditos)
  - **Criar** `LeadsPage.jsx`: tabela paginada + filtros (modelo: `frontend/src/pages/RadarJuridico.jsx`)
  - **Criar** `AlertasPage.jsx`: lista de alertas + criar/cancelar alerta
  - **Criar** `LoginPage.jsx`: Firebase Auth (Google + email/senha)

- [ ] **4.4** Implementar componentes (em `src/components/`):
  - **Criar** `KpiCard.jsx` (adaptar de `apps/aurora-comando/src/components/KpiCard.tsx`)
  - **Criar** `LeadTable.jsx` (adaptar de `RadarJuridico.jsx` — tabela existente)
  - **Criar** `AlertModal.jsx` (formulário de criação de alerta)
  - **Criar** `PaywallGate.jsx` (Paywall 1 e 2 — ver `docs/PAYWALLS.md`)
  - **Criar** `PjeStatusBadge.jsx` (LIVRE/VERIFICAR/DESCARTAR — adaptar de `LitispBadge` em RadarJuridico.jsx)

- [ ] **4.5** Implementar hooks (em `src/hooks/`):
  - **Criar** `useLeads.js` — wrapper de `fetchLeads()` com @tanstack/react-query
  - **Criar** `useAlertas.js` — wrapper de `fetchAlertas()` + mutation para create/cancel
  - **Criar** `useCreditos.js` — wrapper de `fetchSaldoCreditos()`

- [ ] **4.6** Criar `.env.example`:
  ```
  VITE_FIREBASE_API_KEY=...
  VITE_FIREBASE_AUTH_DOMAIN=transparenciabr.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=transparenciabr
  VITE_FIREBASE_STORAGE_BUCKET=transparenciabr.appspot.com
  VITE_FIREBASE_MESSAGING_SENDER_ID=...
  VITE_FIREBASE_APP_ID=...
  VITE_BACKEND_URL=https://radar-juridico-api-xxxxxx-uc.a.run.app
  ```

- [ ] **4.7** Criar `src/index.css` com variáveis de design:
  ```css
  :root {
    --color-teal: #01696F;
    --color-teal-dk: #014f54;
    --color-gold: #d4af37;
    --color-midnight: #0a1628;
    --font-sans: "DM Sans", "Inter", sans-serif;
  }
  ```

---

### Fase 5 — Deploy e CI/CD

- [ ] **5.1** Configurar Firebase Hosting target `radar-juridico` no `firebase.json` raiz:
  ```json
  {
    "hosting": [
      {
        "target": "radar-juridico",
        "public": "apps/radar-juridico/frontend/dist",
        "rewrites": [{"source": "**", "destination": "/index.html"}]
      }
    ]
  }
  ```

- [ ] **5.2** Adicionar rewrite Firebase Hosting para o backend Cloud Run:
  ```json
  {
    "rewrites": [
      {"source": "/api/**", "run": {"serviceId": "radar-juridico-api", "region": "southamerica-east1"}},
      {"source": "**", "destination": "/index.html"}
    ]
  }
  ```

- [ ] **5.3** Criar Cloud Build trigger para deploy automático:
  Arquivo: `apps/radar-juridico/backend/cloudbuild.yaml` (já criado pelo Arquiteto)

- [ ] **5.4** Deploy inicial manual (validação):
  ```bash
  # Backend
  gcloud builds submit --config=apps/radar-juridico/backend/cloudbuild.yaml .

  # Frontend
  cd apps/radar-juridico/frontend && npm install && npm run build
  firebase deploy --only hosting:radar-juridico
  ```

---

### Fase 6 — Testes e validação

- [ ] **6.1** Smoke test backend:
  ```bash
  curl https://radar-juridico-api-xxx.a.run.app/healthz
  # Esperado: { "ok": true, "checks": {...} }
  ```

- [ ] **6.2** Validar log LGPD após primeiro enriquecimento:
  ```sql
  SELECT * FROM `transparenciabr.radar_juridico.lgpd_audit_radar`
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
  ORDER BY timestamp DESC LIMIT 10;
  ```

- [ ] **6.3** Testar Paywall 1 com usuário freemium:
  - Criar usuário de teste no Firebase Auth
  - Fazer GET /leads com Bearer token
  - Verificar que crédito foi debitado em `usuarios/{uid}.creditos`
  - Verificar que CPF não aparece na resposta

- [ ] **6.4** Testar pipeline "publicou-pegamos" em modo dry-run:
  ```bash
  python apps/radar-juridico/pipelines/publicou_pegamos_alarme.py --dry-run
  ```

- [ ] **6.5** Testar alerta ponta-a-ponta:
  - Criar alerta (POST /alertas)
  - Executar pipeline manual
  - Verificar notificação FCM/Telegram
  - Verificar log em `alertas_log` BQ

---

## Restrições (não negociáveis)

1. **CPF NUNCA em claro** no frontend, nos logs Cloud Run, ou no BigQuery (exceto `leads_finalizados` do Caminho C com consentimento)
2. **BigQuery nunca exposto ao frontend** — toda query passa pelo backend
3. **DATAPREV_ENABLED=false** por padrão — não ativar sem convênio formal
4. **Log LGPD obrigatório** antes de qualquer enriquecimento PII (caminhos A/B/C/D)
5. **Anti-waste PJe** sempre antes de notificar alerta Paywall 2
6. **Chat ID Telegram: `6483072695`** (8 dígitos — não usar `643072695`)
7. **Região BQ: southamerica-east1** — nunca US para o dataset `radar_juridico`
8. **Paleta teal `#01696F`** — design system obrigatório no frontend

---

## Critério de "pronto" (aprovação do Comandante)

O Radar Jurídico está pronto quando o Comandante Baesso consegue:
1. Fazer login com a conta Google
2. Ver a lista de indeferimentos INSS qualificados (com score ICP)
3. Filtrar por UF, espécie, score
4. Detalhar um lead (1 crédito debitado, CPF mascarado)
5. Configurar alerta para um número de processo (2 créditos debitados)
6. Receber notificação Telegram quando houver publicação
7. Verificar no painel que o PJe foi checado (anti-waste)

**Senha de execução:** `aurora-cartman-2026`  
**Audit collection:** `maestro_audit_log` (com tag `project:radar-juridico`)  
**Snapshot collection:** `maestro_rollback`
