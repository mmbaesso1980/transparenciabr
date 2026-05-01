# ALERTA G.O.A.T. — Auditoria pós-push `main` (SecOps / QA)

Auditoria automática dos 4 pilares após integração de documentação (commit docs Sobre + Metodologia).  
**Status:** falhas encontradas — ver abaixo.

---

## Pilar 1 — Arquitetura de Inteligência

**Problema:** Em Cloud Functions, as chamadas Gemini usam o SDK `@google/generative-ai` com `GEMINI_API_KEY` / `GOOGLE_API_KEY` (Google AI / API key). Isso **não** é uma invocação exclusiva do recurso Vertex AI Agent Builder / Reasoning Engine do Líder Supremo `agent_1777236402725`; o ID aparece apenas em texto de `systemInstruction`, não como destino da API.

**Trechos atuais:**

`functions/src/radar/diarioScanner.js` (SDK + API key, não Vertex Agent):

```128:134:functions/src/radar/diarioScanner.js
async function analyzeWithGemini(trecho) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY ausente");
  }
  const genAI = new GoogleGenerativeAI(key);
```

`functions/index.js` (idem para CEAP):

```68:71:functions/index.js
async function analyzeCeapWithSupremeLeader(row) {
  const heuristic = heuristicCeapRisk(row);
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
```

**Correção de rumo (orientação):**

- Unificar com o padrão já documentado no orchestrator: cliente Vertex **Reasoning Engine** (`VERTEX_REASONING_ENGINE_ID`) apontando para o deploy do Líder Supremo `agent_1777236402725`, como em `orchestrator/workers/agent_worker/vertex_client.js` (`streamQueryReasoningEngine`).
- Alternativa mínima alinhada ao Pilar 1: expor uma Cloud Function wrapper que chame apenas esse cliente/env e substituir `GoogleGenerativeAI` nestes dois fluxos por essa invocação (sem segundo “motor” paralelo).

**Referência conforme:** `functions/src/genkit.config.js` já usa `vertexai/gemini-2.5-pro` — os fluxos acima devem convergir para o mesmo critério de destino (Agent Builder / motor único).

---

## Pilar 3 — Blindagem de Infraestrutura (SecOps)

**Problema:** Identificador de recurso GCP (Reasoning Engine) **hardcoded** como fallback quando `VERTEX_REASONING_ENGINE_ID` não está definido. Não é API key, mas viola o princípio de não embutir infraestrutura sensível no código.

**Trecho:**

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção de rumo:**

```javascript
const REASONING_ENGINE_RESOURCE = process.env.VERTEX_REASONING_ENGINE_ID;
if (!REASONING_ENGINE_RESOURCE) {
  throw new Error('VERTEX_REASONING_ENGINE_ID é obrigatório — não usar fallback hardcoded');
}
```

(Deploy/Terraform deve definir a variável ou Secret.)

---

## Pilares 2 e 4 — Sem falhas nesta auditoria

- **Pilar 2:** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica GOD (`creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`) e `300` diários para demais usuários com reset por `last_login_date`.
- **Pilar 4:** Sem `w-screen` no frontend; CEAP usa `dataParsers.js` / `CeapMonitorSection.jsx` com `urlDocumento` e proteção contra `[object Object]` (`scalarToDisplay`).

---

*Gerado pelo fluxo G.O.A.T. — TransparênciaBR.*
