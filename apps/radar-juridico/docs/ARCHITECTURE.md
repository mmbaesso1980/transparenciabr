# ARCHITECTURE.md — Radar Jurídico INSS

**Versão:** 1.0 scaffold  
**Última revisão:** 2026-05-30  
**Autor:** Arquiteto (Computer/Perplexity) · Implementação: Maestro Gemini 2.5 Pro

---

## 1. Visão geral do sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    RADAR JURÍDICO INSS                          │
│                    apps/radar-juridico/                         │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────────┐
         │           INTERNET / USUÁRIO             │
         │    (advogado, escritório jurídico)        │
         └───────────────┬──────────────────────────┘
                         │ HTTPS
                         ▼
         ┌───────────────────────────────────────────┐
         │   Firebase Hosting                        │
         │   apps/radar-juridico/frontend/           │
         │   React 19 + Vite 8 + Tailwind            │
         │   paleta teal #01696F, DM Sans/Inter       │
         └──────────────┬────────────────────────────┘
                        │ REST calls (JSON)
                        │ → backend Cloud Run URL
                        ▼
         ┌──────────────────────────────────────────────────────┐
         │   Cloud Run — radar-juridico-api                    │
         │   apps/radar-juridico/backend/                       │
         │   Python 3.12 + FastAPI + Gunicorn                   │
         │   Region: southamerica-east1                         │
         │   Auth: Firebase ID Token (Bearer)                   │
         │                                                      │
         │   Rotas:                                             │
         │     GET  /leads                (Paywall 1)           │
         │     GET  /leads/{id}           (Paywall 1)           │
         │     POST /alertas              (Paywall 2)           │
         │     GET  /alertas              (Paywall 2)           │
         │     POST /pje/check            (Paywall 2 anti-waste)│
         │     POST /creditos/debitar     (interna, admin SDK)  │
         │     GET  /healthz                                    │
         └──┬───────────────┬────────────────┬──────────────────┘
            │               │                │
            ▼               ▼                ▼
   ┌──────────────┐ ┌─────────────┐ ┌──────────────────────┐
   │  BigQuery    │ │  Firestore  │ │  Secret Manager      │
   │  (dataset    │ │  (coleções  │ │  - PJE_TOKEN         │
   │  radar_      │ │  radar_     │ │  - AURORA_ADMIN_TOKEN│
   │  juridico.*) │ │  juridico_*)│ │  - TELEGRAM_BOT_TOKEN│
   │  southamerica│ │             │ │                      │
   │  -east1      │ │             │ │                      │
   └──────────────┘ └─────────────┘ └──────────────────────┘
            │
            │ (APENAS backend — nunca exposto ao frontend)
            ▼
   ┌──────────────────────────────────────────────────────────────┐
   │   Cloud Run Job — publicou-pegamos-alarme                   │
   │   apps/radar-juridico/pipelines/                            │
   │   Trigger: Cloud Scheduler 2x/dia (06:00 + 18:00 BRT)      │
   │   Pub/Sub topic: radar-juridico-alertas                     │
   │                                                             │
   │   Fluxo interno do job:                                     │
   │     1. Lê watchlist de alertas do Firestore                 │
   │     2. Consulta DOU/Querido Diário (Caminho DOU)            │
   │     3. Consulta PJe TRF3 (anti-waste, Caminho PJe)          │
   │     4. Enriquece via AURORA (caminhos A/B/C/D)              │
   │     5. Notifica via FCM + Telegram Bot                      │
   │     6. Grava resultado em Firestore + BQ audit log          │
   └──────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo de dados — Consulta de leads (Paywall 1)

```
Usuário                 Frontend              Backend              BigQuery
   │                       │                     │                    │
   │── busca leads ────────►│                     │                    │
   │                       │── POST /leads ───────►│                    │
   │                       │   (Bearer: ID token) │                    │
   │                       │                     │── verifica claims ─►│
   │                       │                     │◄─ tier/créditos ───│
   │                       │                     │                    │
   │                       │                     │── debita crédito ──►│ (Firestore)
   │                       │                     │                    │
   │                       │                     │── SELECT leads ────►│
   │                       │                     │   (sem PII raw,    │
   │                       │                     │   CPF mascarado)   │
   │                       │                     │◄── JSON leads ─────│
   │                       │◄── leads[] ──────────│                    │
   │◄── renderiza tabela ──│                     │                    │
```

---

## 3. Fluxo de dados — Alerta "publicou-pegamos" (Paywall 2)

```
Scheduler (2x/dia)
       │
       │── Pub/Sub: radar-juridico-alertas
       │
       ▼
  Cloud Run Job (publicou_pegamos_alarme.py)
       │
       ├── [1] Lê watchlist Firestore: radar_juridico_alertas/{uid}/watches/
       │
       ├── [2] Caminho DOU: Inlabs API / Querido Diário
       │         └── grep número_processo | cpf_hash
       │
       ├── [3] Caminho PJe (anti-waste):
       │         └── pje_checker.py → TRF3 API
       │         └── se litispendência ATIVA → skip, descarta lead
       │
       ├── [4] Caminho AURORA enrichment (opcional, se PII autorizado):
       │         ├── A: DATAPREV convênio (status: 503 até convênio)
       │         ├── B: Serasa/Quod bureau (requer credenciais)
       │         ├── C: /sou-indeferido consentimento (auto-coleta)
       │         └── D: petição template DOCX
       │
       └── [5] Notificação:
                 ├── FCM push notification (app)
                 └── Telegram Bot (fallback)
                 └── Grava em radar_juridico_alertas_log (BQ)
```

---

## 4. Sequência de autenticação e autorização

```
┌─────────┐       ┌──────────────┐      ┌──────────────┐     ┌──────────┐
│ Browser │       │Firebase Auth │      │ Backend CR   │     │Firestore │
└────┬────┘       └──────┬───────┘      └──────┬───────┘     └────┬─────┘
     │                   │                     │                   │
     │── Google OAuth ──►│                     │                   │
     │◄── ID Token ──────│                     │                   │
     │                   │                     │                   │
     │── GET /leads ─────────────────────────►│                   │
     │   Authorization: Bearer {IDToken}      │                   │
     │                   │                     │── verify token ──►│
     │                   │                     │◄─ uid + claims ──│
     │                   │                     │   (tier, creditos)│
     │                   │                     │                   │
     │                   │  [se tier=free]     │                   │
     │                   │  check diario limit │                   │
     │                   │                     │── debit credito ─►│
     │◄────────── 200 leads[] ────────────────│                   │
```

---

## 5. Isolamento de datasets BigQuery

```
projeto: transparenciabr
região: southamerica-east1

datasets EXISTENTES (outros projetos):
  tbr_leads_prev.*        ← leads previdenciários genéricos (motor 26)
  transparenciabr.*       ← dados parlamentares (região US — NÃO usar aqui)
  tbr_ceap.*              ← CEAP (região US — NÃO usar aqui)

dataset NOVO (Radar Jurídico):
  radar_juridico.*        ← ISOLADO, apenas este app lê/escreve
    ├── leads_radar_raw         particionado por dt_indeferimento
    ├── alertas_watchlist       watchlist por uid
    ├── alertas_log             auditoria de disparos
    ├── pje_litispendencia_cache TTL 48h por processo
    └── lgpd_audit_radar        log imutável (CPF apenas como hash SHA256)
```

---

## 6. Componentes UI reutilizados do monorepo

Os seguintes componentes do `frontend/src/` principal **devem ser copiados ou importados**
pelo Maestro ao implementar o frontend isolado:

| Componente original | Uso no Radar Jurídico |
|---|---|
| `components/PremiumGate.jsx` | PaywallGate.jsx (adaptar para 2 paywalls) |
| `components/dossie/UnlockGate.jsx` | Modal de crédito insuficiente |
| `components/dossie/PanelSkeleton.jsx` | Loading states |
| `context/AuthContext.jsx` | Reutilizar idêntico |
| `lib/firebase.js` | Reutilizar idêntico (mesma config) |
| `src/index.css` (paleta teal) | Copiar variáveis CSS |
| `pages/RadarJuridico.jsx` | **MODELO** — refatorar como ponto de partida |

---

## 7. Decisões arquiteturais tomadas pelo Arquiteto

1. **Backend Python (FastAPI) em vez de Node.js** — consistente com os Cloud Run Jobs
   em Python (`cloudrun/dossieV1Pipeline/main.py`, `engines/26_inss_indeferimentos_bq_load.py`).
   O Node.js é usado nos Cloud Functions do monorepo principal; para Cloud Run pesado,
   o padrão já estabelecido é Python + Flask/FastAPI.

2. **Dataset isolado `radar_juridico.*`** — não contamina `tbr_leads_prev` que pertence
   ao pipeline de enrichment PII genérico (motor 26 / PR #230/#231).

3. **Sem acesso direto ao BigQuery pelo frontend** — toda query passa pelo backend.
   Isso evita expor credenciais de SA e garante que filtros LGPD sejam aplicados
   server-side antes de retornar dados ao cliente.

4. **Pipeline "publicou-pegamos" como Cloud Run Job** — não como Cloud Function,
   pois pode exceder 9 minutos se o corpus de processos for grande. O padrão
   `cloudrun/dossieV1Pipeline/` confirma essa escolha.

5. **Frontend como app Vite+React isolado** — serve em subdomínio dedicado via
   Firebase Hosting target `radar-juridico`, sem conflito com o frontend principal.
   Paleta teal `#01696F` + DM Sans/Inter (mesmo design system do ConsentForm.tsx).
