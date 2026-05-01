# ALERTA G.O.A.T. — Auditoria SecOps / QA (TransparênciaBR)

Auditoria automática dos 4 pilares após integração na `main`. **Pilar 1 em desconformidade**; **Pilar 3 tinha violação corrigida nesta branch** (`orchestrator/workers/agent_worker/vertex_client.js`).

---

## Pilar 1 — Arquitetura de Inteligência (EM ABERTO)

**Problema:** As Cloud Functions que chamam `@google/generative-ai` usam `GoogleGenerativeAI` + `getGenerativeModel({ model: "gemini-2.5-pro" })`. Isso é a **API Developer (Google AI Studio / API key)**, não a invocação do **Agent Builder / Reasoning Engine** do Líder Supremo `agent_1777236402725`. O ID aparece só em strings de *system instruction* e payload JSON — **não** como destino exclusivo da API de backend.

**Trechos atuais (corrigir rumo):**

`functions/index.js` — `analyzeCeapWithSupremeLeader` instancia o SDK genérico:

```javascript
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: ASMODEUS_GEMINI_MODEL,
  systemInstruction:
    "Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID agent_1777236402725). " +
    // ...
});
```

`functions/src/radar/diarioScanner.js` — mesmo padrão:

```javascript
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: SUPREME_GEMINI_MODEL,
  systemInstruction:
    `Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro). ` +
    // ...
});
```

**Direção obrigatória:** Alinhar estas rotas ao mesmo padrão Vertex já usado para o motor único — por exemplo `VertexReasoningClient` + `VERTEX_REASONING_ENGINE_ID` (deployment do `agent_1777236402725`), ou outro endpoint oficial do Agent Builder que **amarre** a chamada ao recurso do Líder Supremo, **sem** depender só de prompt. Referência interna: `functions/src/genkit.config.js` + `orchestrator/workers/agent_worker/vertex_client.js` (variável de ambiente obrigatória).

---

## Pilar 2 — Integridade do cofre (OK)

`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: GOD `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários com `DAILY_FREEMIUM_CREDITS` (300) e reset diário em `last_login_date`.

---

## Pilar 3 — Blindagem de infra (VIOLAÇÃO ENCONTRADA; CORREÇÃO APLICADA NESTA BRANCH)

**Problema:** Fallback hardcoded do nome do recurso Vertex (projeto + Reasoning Engine) em código — equivalente a infra sensível em repositório.

**Trecho incorreto (removido):**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção aplicada:** `REASONING_ENGINE_RESOURCE` passa a ser **apenas** `process.env.VERTEX_REASONING_ENGINE_ID` (trim); `init()` falha explicitamente se a variável estiver ausente. Nenhum fallback em código.

**Frontend:** chaves Firebase seguem `import.meta.env.VITE_FIREBASE_*` em `frontend/src/lib/firebase.js` (sem chaves reais no repo).

---

## Pilar 4 — UI/UX e CEAP (OK no escopo auditado)

- Sem `w-screen` no frontend; `overflow-x-hidden` presente em layout raiz / páginas principais.
- CEAP: `dataParsers.js` documenta proteção contra `[object Object]`; `CeapMonitorSection.jsx` mapeia `urlDocumento` para link ativo.

---

*G.O.A.T. — manter este ficheiro até o Pilar 1 estar resolvido e revalidado; depois pode remover-se com commit dedicado.*
