# ALERTA G.O.A.T. — Auditoria contínua (push → main)

Auditoria automática pelos 4 pilares (SecOps / QA). **Violações encontradas no estado atual do repositório.**

---

## Pilar 1 — Arquitetura de Inteligência (REGRA ABSOLUTA)

**Status:** não conforme.

**Problema:** Existem caminhos de backend que invocam modelos Gemini via Vertex AI **diretamente** (`publishers/google/models/...`) sem passar pelo recurso do **Líder Supremo** `agent_1777236402725` (Reasoning Engine / orquestração única).

### Ocorrência A — `engines/analysis/score_engine.js`

Classificação de risco alto usa **`gemini-1.5-pro-002`** por REST Vertex (ADC), não o agente `agent_1777236402725`.

Trecho atual:

```43:43:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
```

```375:378:engines/analysis/score_engine.js
  const endpoint =
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
    `${VERTEX_MODEL}:generateContent`;
```

**Correção de rumo (objetivo):** Encaminhar essa análise para o **mesmo** motor que o restante do produto: Reasoning Engine correspondente ao Agent Builder `agent_1777236402725`, ou Genkit `vertexai/gemini-2.5-pro` já alinhado em `functions/src/genkit.config.js`. Se mantiver REST, o endpoint deve ser o da **execução do reasoning engine** configurado para esse agente, não `:generateContent` em modelo genérico 1.5.

### Ocorrência B — `engines/vertex/classify_ceap.js`

Pipeline batch CEAP usa **`gemini-2.5-flash`**, não o ID `agent_1777236402725`.

Trecho atual:

```31:34:engines/vertex/classify_ceap.js
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'transparenciabr';
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = 'gemini-2.5-flash';
```

**Correção de rumo (objetivo):** Classificação em lote deve ser orquestrada pelo deployment Vertex ligado ao **Líder Supremo** `agent_1777236402725` (ex.: batch prediction acoplada ao mesmo projeto de agente), ou o modelo único aprovado pela equipe Vertex (`gemini-2.5-pro` sob esse agente), eliminando **Flash** como caminho paralelo se a política for “um só motor”.

**Referência conforme no repositório (Cloud Functions):**

```31:32:functions/index.js
const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";
```

---

## Pilar 2 — Integridade do Cofre (Autenticação e modo GOD)

**Status:** conforme no cliente (`ensureUsuarioDoc`).

O perfil `manusalt13@gmail.com` recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários: cota diária **300** não cumulativa.

```166:186:frontend/src/lib/firebase.js
    if (isGodEmail(email)) {
      await setDoc(ref, {
        email,
        creditos: 9999,
        creditos_ilimitados: true,
        isAdmin: true,
        role: "admin",
        last_login_date: today,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        email: email || null,
        creditos: DAILY_FREEMIUM_CREDITS,
        creditos_ilimitados: false,
        isAdmin: false,
        role: "user",
```

---

## Pilar 3 — Blindagem de Infraestrutura (SecOps)

**Status:** conforme no frontend Firebase (`import.meta.env.VITE_FIREBASE_*`).

Não foram encontradas chaves Stripe/Firebase/GCP hardcoded no código pesquisado (padrões tipo `AIza…`, `sk_live`). Secrets referenciados por `process.env` nas Functions (ex.: `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`).

---

## Pilar 4 — Estabilidade UI/UX e dados forenses (CEAP)

**Status:** conforme no escopo verificado.

- Não há `w-screen` nem margens negativas problemáticas no `frontend` pesquisado; há `overflow-x-hidden` / `min-w-0` em layouts relevantes.
- CEAP: `dataParsers.js` documenta mitigação de `[object Object]`; componentes CEAP mapeiam `urlDocumento`.

---

**Emitido por:** fluxo G.O.A.T. (Diretor SecOps/QA) — 2026-04-30.
