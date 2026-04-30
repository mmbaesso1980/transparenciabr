# ALERTA G.O.A.T. — Auditoria pós-push (branch de correção)

Auditoria automática dos **4 pilares** após o push que introduziu `seedUniverseRoster` / `getUniverseRoster` em `main`. Foram encontradas **falhas nos pilares 1 e 3** no worker Vertex do orquestrador; **pilares 2 e 4** estavam em conformidade no snapshot auditado.

Correções correspondentes foram **aplicadas neste branch** (`orchestrator/workers/agent_worker/vertex_client.js`, `server.js`, `frontend/src/pages/UniversePage.jsx`).

---

## Pilar 1 — Arquitetura de Inteligência

**Erro:** O prompt enviado ao Reasoning Engine identificava o modelo como `You are agent ${agent_id}` (1–12), o que contradiz a regra de invocar exclusivamente o **Líder Supremo** `agent_1777236402725` (Gemini 2.5) como identidade cognitiva.

**Trecho incorreto (antes):**

```javascript
const prompt = [
  `You are agent ${agent_id}. Correlation ID: ${correlationId}.`,
  `Process these api_ids: ${api_ids.join(', ')}.`,
  // ...
].join('\n');
```

**Correção aplicada:** `orchestrator/workers/agent_worker/server.js` — prefixar com o Agent Builder ID oficial e deixar explícito que `agent_id` é apenas shard de carga.

```javascript
const prompt = [
  `You are the Líder Supremo motor (Agent Builder ID agent_1777236402725, Gemini 2.5).`,
  `This request runs on worker shard ${agent_id} of 12 for load only — you are not a different agent ID.`,
  `Correlation ID: ${correlationId}.`,
  `Process these api_ids: ${api_ids.join(', ')}.`,
  `For each api_id, call the runIngestion tool with that api_id.`,
  `Report success or failure for each one in your final response.`,
].join('\n');
```

---

## Pilar 2 — Integridade do Cofre

**Status:** Conforme em `frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: e-mail `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários com `creditos: 300` e reset diário via `last_login_date`.

---

## Pilar 3 — Blindagem de Infraestrutura (SecOps)

**Erro:** Recurso Vertex **hardcoded** como fallback (`projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240`) e endpoint gRPC fixo `us-west1-aiplatform.googleapis.com`, violando a política de não embutir identificadores de infraestrutura sensíveis e de resolver tudo via ambiente.

**Trecho incorreto (antes):**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
// ...
this.#client = new v1beta1.ReasoningEngineExecutionServiceClient({
  apiEndpoint: 'us-west1-aiplatform.googleapis.com',
});
```

**Correção aplicada:** `orchestrator/workers/agent_worker/vertex_client.js`

- `VERTEX_REASONING_ENGINE_ID` passa a ser **obrigatório** (sem fallback em código).
- `apiEndpoint` derivado da região presente no nome do recurso (`{location}-aiplatform.googleapis.com`).

```javascript
function requireReasoningEngineResource() {
  const id = (process.env.VERTEX_REASONING_ENGINE_ID || '').trim();
  if (!id) {
    throw new Error(
      'VERTEX_REASONING_ENGINE_ID ausente: defina o nome completo do recurso Reasoning Engine ' +
        '(projects/.../locations/.../reasoningEngines/...). Não use fallback hardcoded (SecOps G.O.A.T.).',
    );
  }
  return id;
}

// Em init(): resolver recurso + endpoint a partir do env/nome do recurso
```

**Frontend:** Chaves Firebase e Stripe já referenciam `import.meta.env` onde aplicável — sem achado de API keys hardcoded nos ficheiros `.jsx/.js` auditados.

**Operação:** Garantir que o deploy do Cloud Run do worker define `VERTEX_REASONING_ENGINE_ID` (valor real do projeto); sem isso o serviço permanece em erro controlado no `init()`.

---

## Pilar 4 — UI/UX e dados forenses

**Observação leve:** `UniversePage.jsx` usava `-mx-1` no strip horizontal mobile (margem negativa). **Correção:** removido `-mx-1` para alinhar ao padrão “zero cortes”.

**CEAP:** `dataParsers.js`, `CeapMonitorSection.jsx` e `DespesasCeapAudit.jsx` mapeiam `urlDocumento` e tratam objetos em títulos — sem evidência de `[object Object]` no fluxo auditado.

---

## Funções `seedUniverseRoster` / `getUniverseRoster`

Sem chamadas a IA; apenas BigQuery + GCS. **Conforme** ao pilar 1 para esse trecho.
