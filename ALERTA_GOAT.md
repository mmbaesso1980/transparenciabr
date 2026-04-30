# ALERTA G.O.A.T. — Auditoria contínua (SecOps / QA)

Auditoria automática do estado atual do repositório face aos 4 pilares definidos pelo Comandante Baesso.  
**Data de geração:** 2026-04-30

---

## Pilar 1 — Arquitetura de Inteligência (motor único `agent_1777236402725` / Gemini 2.5)

### Falha 1.A — `engines/analysis/score_engine.js`

**Problema:** O caminho de alto risco (`score ≥ 85`) invoca **Vertex AI REST `generateContent`** com modelo padrão **`gemini-1.5-pro-002`**, sem qualquer vínculo ao **Agent Builder / Líder Supremo `agent_1777236402725`**. O system prompt genérico não incorpora o ID do agente mestre.

**Trechos atuais (referência):**

```43:44:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION          || 'us-central1';
```

```380:383:engines/analysis/score_engine.js
  const systemInstruction = (
    'Você é auditor forense de gastos públicos brasileiros. Analise a nota com máximo rigor. ' +
    'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}'
  );
```

**Correção exigida (direção):**

- Alterar o default de `VERTEX_MODEL` para **`gemini-2.5-pro`** (alinhado ao motor único).
- Incluir no `systemInstruction` (e/ou metadata da chamada) a identidade **`agent_1777236402725`**, no mesmo padrão de `functions/src/genkit.config.js` e `functions/src/radar/diarioScanner.js`.
- Preferencialmente **roteiar análises Cloud/backend** via **Genkit + Vertex** (`vertexai/gemini-2.5-pro`) já centralizado em `functions/src/genkit.config.js`, ou expor uma Cloud Function única que delegue ao deployment do Líder Supremo, evitando REST paralelo sem agent ID.

---

### Falha 1.B — `engines/vertex/classify_ceap.js` (opcional sob política estrita)

**Problema:** Classificação batch CEAP usa **`gemini-2.5-flash`** via API de predição em lote, **sem** referência ao **`agent_1777236402725`**. Se a política for “toda inferência Vertex deve passar pelo reasoning engine do Líder Supremo”, este fluxo precisa ser replanejado ou documentado como exceção aprovada.

**Trecho atual:**

```34:34:engines/vertex/classify_ceap.js
const MODEL = 'gemini-2.5-flash';
```

---

## Pilar 2 — Integridade do Cofre (GOD + 300/dia)

**Status:** Em **`frontend/src/lib/firebase.js`**, `ensureUsuarioDoc` aplica **`manusalt13@gmail.com`** com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"` e demais usuários com **`DAILY_FREEMIUM_CREDITS = 300`** e reset diário — **conforme**.

---

## Pilar 3 — Blindagem de Infraestrutura (sem segredos hardcoded)

### Falha 3.A — `orchestrator/workers/agent_worker/vertex_client.js`

**Problema:** Fallback **hardcoded** para nome completo do recurso Vertex Reasoning Engine (projeto + location + ID numérico). Isso fixa infraestrutura sensível no código e ignora ambientes/staging.

**Trecho atual:**

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção exigida:**

- Remover o literal; **exigir** `VERTEX_REASONING_ENGINE_ID` (fail fast em `init()` se ausente), ou carregar de **Secret Manager** / variável injetada no deploy.
- Manter **`SUPREME_AGENT_BUILDER_ID = 'agent_1777236402725'`** apenas como constante de identidade (não é secret), coerente com o deployment referenciado pela env.

**Frontend:** Chaves Firebase e demais segredos de cliente seguem **`import.meta.env.VITE_*`** em `frontend/src/lib/firebase.js` — **conforme** ao escopo Vite.

---

## Pilar 4 — UI/UX e dados forenses CEAP

**Status:**

- Não há **`w-screen`** no frontend pesquisado.
- **`CeapMonitorSection.jsx`** e **`frontend/src/utils/dataParsers.js`** tratam **`urlDocumento`** e evitam renderização crua de objetos como texto — **conforme** ao desenho atual.
- Margens negativas pontuais (ex.: **`-mx-1`** em `UniversePage.jsx` para strip mobile) estão em container com **`overflow-x-auto`** e padding compensando — risco de “corte lateral” baixo; monitorar em QA visual.

---

## Resumo executivo

| Pilar | Situação |
|-------|----------|
| 1 | **FALHA** — `score_engine.js` usa modelo legado e não ancora `agent_1777236402725`; revisar também política para `classify_ceap.js`. |
| 2 | **OK** — `firebase.js` GOD + 300/dia |
| 3 | **FALHA** — resource Vertex hardcoded em `vertex_client.js` |
| 4 | **OK** (com ressalva menor de QA mobile) |

---

*Gerado pelo fluxo G.O.A.T. para correção de rumo pelo Cursor.*
