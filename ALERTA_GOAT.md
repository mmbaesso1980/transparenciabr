# ALERTA G.O.A.T. — Auditoria pós-push `main` (TransparênciaBR)

Auditoria automática **SecOps / QA** contra os 4 pilares do Comandante Baesso.  
**Status:** não conformidade **Pilar 1** e **Pilar 3** (demais pilares conferidos OK neste snapshot).

---

## Pilar 1 — Arquitetura de Inteligência (motor único `agent_1777236402725` / Gemini 2.5)

### 1.A — Modelo Vertex **desatualizado** no motor de score CEAP

O ficheiro `engines/analysis/score_engine.js` roteia risco alto para **Gemini 1.5 Pro** (`gemini-1.5-pro-002`) via REST Vertex, **sem** invocação ao Agent Builder / Líder Supremo `agent_1777236402725`.

**Trecho atual (incorreto):**

```11:11:engines/analysis/score_engine.js
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês
```

```43:44:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION          || 'us-central1';
```

```356:378:engines/analysis/score_engine.js
// callVertex — chama Gemini 1.5 Pro via Vertex AI REST (ADC)
// ...
  const endpoint =
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
    `${VERTEX_MODEL}:generateContent`;
```

**Correção de rumo (aplicar pelo Cursor):**

- Alinhar com o resto do repositório (`functions/index.js`, `genkit.config.js`): modelo por defeito **`gemini-2.5-pro`** (ou invocar **exclusivamente** o Reasoning Engine / fluxo que já usa `agent_1777236402725`).
- Atualizar comentários e, se mantiver REST directo, documentar que é **fallback** até existir chamada única ao deployment do Líder Supremo.

Exemplo mínimo de alinhamento de default:

```javascript
const VERTEX_MODEL = process.env.VERTEX_MODEL?.trim() || 'gemini-2.5-pro';
```

(Rever também comentários nas linhas 11, 356–357 e 408 para não referenciarem mais 1.5 Pro.)

### 1.B — Classificador CEAP em batch **sem** ID do Líder Supremo

`engines/vertex/classify_ceap.js` usa **`gemini-2.5-flash`** em batch prediction, **não** o agente `agent_1777236402725`.

**Trecho atual:**

```20:34:engines/vertex/classify_ceap.js
 * Modelo: publishers/google/models/gemini-2.5-flash (batch prediction)
 */
// ...
const MODEL = 'gemini-2.5-flash';
```

**Correção de rumo:** Se a política for **100%** Líder Supremo, migrar este pipeline para o mesmo entrypoint que as Cloud Functions (Reasoning Engine configurado para `agent_1777236402725`) ou parametrizar `VERTEX_MODEL` / resource de agente **único** — sem segundo “motor” paralelo não auditado.

### 1.C — Cliente orchestrator: ID numérico 1–12 vs. “um só agente”

`orchestrator/workers/agent_worker/vertex_client.js` documenta o Builder ID correcto, mas `invokeAgent(agentId, ...)` aceita **`agentId` 1–12** e monta `sessionId = \`agent_${agentId}\``. Isso **não** é o literal `agent_1777236402725` e pode violar a leitura estrita de “apenas o Líder Supremo” se cada número for interpretado como agente distinto.

**Trechos:**

```29:30:orchestrator/workers/agent_worker/vertex_client.js
export const SUPREME_AGENT_BUILDER_ID = 'agent_1777236402725';
```

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

```131:142:orchestrator/workers/agent_worker/vertex_client.js
   * @param {number} agentId   – 1-12 agent identifier
   * ...
  async invokeAgent(agentId, prompt, tools = []) {
    // ...
    const sessionId = `agent_${agentId}`;
```

**Correção de rumo:** Garantir que **toda** invocação use uma única sessão/recurso mapeado ao deployment do `agent_1777236402725` (por exemplo sessão fixa `agent_1777236402725` ou remover o parâmetro `agentId` da API pública do worker). Se 1–12 forem apenas shards de carga **no mesmo** reasoning engine, documentar isso explicitamente no contrato da API e nos logs para auditoria.

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

**Conforme.** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: GOD recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais utilizadores recebem `DAILY_FREEMIUM_CREDITS` (300) com reset diário.

---

## Pilar 3 — Blindagem SecOps (sem chaves hardcoded; env)

### 3.A — Recurso GCP Vertex **hardcoded** no orchestrator

Em `orchestrator/workers/agent_worker/vertex_client.js`, o fallback de `REASONING_ENGINE_RESOURCE` inclui **project number + reasoning engine ID** em claro no repositório (não é `import.meta.env` no frontend, mas **é** infra sensível em código).

**Trecho:**

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção de rumo:** Remover o fallback literal; exigir `VERTEX_REASONING_ENGINE_ID` (ou secret injeccionado no Cloud Run) e falhar com mensagem clara se ausente. Opcional: valor por defeito apenas em `terraform.tfvars` / Secret Manager, **nunca** no JS versionado.

---

## Pilar 4 — UI/UX e CEAP forense

**Conforme** no escopo verificado:

- Sem `w-screen` nem margens negativas (`-mx-`, etc.) problemáticas no `frontend/` (há `max-w-[min(100vw,...)]` pontual em `DossiePage.jsx`, aceitável para truncagem).
- `CeapMonitorSection.jsx` mapeia resumo e `urlDocumento` em links; `dataParsers.js` trata explicitamente de evitar `[object Object]` em títulos.

---

*Gerado por auditoria G.O.A.T. automática. Após correcções, apagar este ficheiro ou substituir por “RESOLVIDO” na próxima iteração.*
