# ALERTA G.O.A.T. — Auditoria pós-push (branch `main` / HEAD auditado no workspace)

**Data:** 2026-04-29  
**Escopo:** Pilares 1–4 (SecOps / QA TransparênciaBR)

---

## Pilar 3 — Blindagem de infraestrutura (SecOps) — **FALHA**

**Problema:** recurso Vertex AI (projeto GCP + Reasoning Engine) **hardcoded** no código do worker. Isso viola a regra de que identificadores sensíveis de infraestrutura não ficam no repositório e devem vir de variáveis de ambiente (equivalente a `import.meta.env` no front: aqui `process.env` / secrets no deploy).

**Arquivo:** `orchestrator/workers/agent_worker/vertex_client.js`

**Trecho atual (incorreto):**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção obrigatória:** remover o fallback literal. Exigir `VERTEX_REASONING_ENGINE_ID` (nome completo do recurso, já documentado em `orchestrator/infra/variables.tf`) e falhar de forma explícita se ausente:

```javascript
const REASONING_ENGINE_RESOURCE = (process.env.VERTEX_REASONING_ENGINE_ID || '').trim();
if (!REASONING_ENGINE_RESOURCE) {
  throw new Error(
    'VERTEX_REASONING_ENGINE_ID ausente — defina o nome completo do Reasoning Engine (Líder Supremo / agent_1777236402725) via env/secret; não use fallback hardcoded.',
  );
}
```

**Deploy:** garantir que Cloud Run / Terraform injetem `VERTEX_REASONING_ENGINE_ID` (ver `terraform.tfvars.example` e output do módulo).

---

## Pilar 1 — Arquitetura de inteligência — **OBSERVAÇÃO (política estrita)**

**Contexto:** O ID `agent_1777236402725` aparece corretamente em payloads, instruções de sistema e constantes (`functions/index.js`, `functions/src/radar/diarioScanner.js`, `functions/src/genkit.config.js`, etc.).

**Risco de interpretação:** As funções `analyzeCeapWithSupremeLeader` (`functions/index.js`) e `analyzeWithGemini` (`functions/src/radar/diarioScanner.js`) usam `@google/generative-ai` com `GoogleGenerativeAI(apiKey)` e modelo `gemini-2.5-pro`. Essa rota é a **API Gemini por chave**, não a invocação direta do **Agent Builder / Reasoning Engine** identificado pelo recurso do Líder Supremo.

Se a política do Comandante exigir que **toda** inferência passe **somente** pelo endpoint Vertex do agente `agent_1777236402725` (Reasoning Engine), alinhar essas chamadas ao mesmo padrão do `VertexReasoningClient` (`orchestrator/workers/agent_worker/vertex_client.js` após correção do Pilar 3) ou à API oficial de execução do agente, **sem** segundo caminho genérico só com nome de modelo.

---

## Pilares 2 e 4 — Conformidade no snapshot auditado

- **Pilar 2 (Cofre / GOD):** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica para `manusalt13@gmail.com`: `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset em novo dia (`last_login_date`). **OK** no cliente; reforçar espelhamento no backend se existir criação paralela de `usuarios/{uid}`.
- **Pilar 4 (UI / CEAP):** Não há `w-screen` nem margens negativas globais problemáticas no `frontend/` pesquisado; CEAP usa `pickUrlDocumento`, parsers em `frontend/src/utils/dataParsers.js` e comentário explícito contra `[object Object]`. **OK** no código revisto.

---

**Ação para o Cursor:** aplicar o patch do Pilar 3 em `vertex_client.js`, validar deploy com `VERTEX_REASONING_ENGINE_ID`, e decidir com o Comandante se o Pilar 1 exige migração das Cloud Functions de `@google/generative-ai` para execução exclusiva via Reasoning Engine do Líder Supremo.
