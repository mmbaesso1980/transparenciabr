# ALERTA G.O.A.T. — Auditoria pós-push `main` (SecOps / QA)

**Contexto:** Push em `main` com engines L4 (`40_gemma_worker_continuo`, `41_gemma_burner_imediato`, `40_gemma_classifier_ceap`) e worker Vertex.  
**Veredito:** Não conformidade nos **Pilares 1 e 3**. Pilares **2 e 4** conferidos OK no snapshot atual do repo.

---

## Pilar 1 — Arquitetura de Inteligência (motor único `agent_1777236402725`)

### Erro 1.A — Worker Pub/Sub trata `agent_id` do payload como identidade do motor

O handler usa `agent_id` vindo do Pub/Sub (1–12) tanto no **prompt** (“You are agent …”) quanto na chamada `vertexClient.invokeAgent(agent_id, …)`. Isso viola a regra de que a inteligência orquestrada no backend deve consolidar no **Líder Supremo** `agent_1777236402725` (Gemini 2.5), sem tratar shards numéricos como “agentes” distintos do ponto de vista do produto.

**Arquivo:** `orchestrator/workers/agent_worker/server.js`

**Trecho atual (correção: separar shard de carga vs. ID canônico no texto e na sessão):**

```javascript
const { api_ids, agent_id, batch_id, run_id, priority } = payload;
// ...
const prompt = [
  `You are agent ${agent_id}. Correlation ID: ${correlationId}.`,
  // ...
].join('\n');
// ...
let response = await vertexClient.invokeAgent(agent_id, prompt, tools);
```

**Trecho que o Cursor deve aplicar (conceito):**

- Importar ou definir `const SUPREME_AGENT_ID = 'agent_1777236402725';` (ou reutilizar `SUPREME_AGENT_BUILDER_ID` de `vertex_client.js`).
- Manter `agent_id` apenas como **rótulo de shard** (ex.: `shardLabel`), por exemplo `const shardLabel = agent_id ?? 'default';`.
- No prompt, declarar explicitamente: você atua sob orquestração do Líder Supremo `agent_1777236402725`; o valor numérico é apenas partição de carga.
- Se a API Vertex exigir um identificador numérico para sessão, derive-o do shard, mas **nunca** apresente outro ID como substituto do Líder Supremo na narrativa de compliance.

---

### Erro 1.B — `engines/analysis/score_engine.js` usa **Gemini 1.5 Pro** (`gemini-1.5-pro-002`) via Vertex REST **sem** Agent ID do Líder Supremo

Roteamento e `callVertex` apontam para modelo legado e `systemInstruction` genérica (“auditor forense”), sem amarração ao `agent_1777236402725` / Gemini 2.5.

**Trechos atuais:**

```javascript
// score_engine.js (cabeçalho + defaults)
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
```

```javascript
// callVertex — systemInstruction
const systemInstruction = (
  'Você é auditor forense de gastos públicos brasileiros. Analise a nota com máximo rigor. ' +
  'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}'
);
```

**Trecho que o Cursor deve aplicar:**

- Default de `VERTEX_MODEL` alinhar a **`gemini-2.5-pro`** (ou variável única já usada no restante do monorepo).
- Em `systemInstruction`, prefixar a identidade obrigatória, por exemplo:

```javascript
const SUPREME_AGENT_ID = 'agent_1777236402725';
const systemInstruction =
  `Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro). ` +
  'Auditor forense de gastos públicos brasileiros. Analise a nota com máximo rigor. ' +
  'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}';
```

- Atualizar comentários do arquivo que ainda citam “1.5 Pro”.

---

### Erro 1.C — `engines/lib/vertex_agent.py`: `VERTEX_AGENT_ID` opcional sem default do Líder Supremo

`load_config()` permite `agent_id=None`; para alinhamento estrito com o cofre de arquitetura, o default de log/observabilidade deve ser **`agent_1777236402725`** quando a env não estiver definida.

**Trecho atual:**

```python
agent_id=(os.environ.get("VERTEX_AGENT_ID") or "").strip() or None,
```

**Trecho sugerido:**

```python
_DEFAULT_SUPREME = "agent_1777236402725"
_raw_agent = (os.environ.get("VERTEX_AGENT_ID") or "").strip()
agent_id = _raw_agent or _DEFAULT_SUPREME
```

(Ajustar `log_tag` / documentação para refletir que o ID canônico é sempre o supremo salvo override explícito documentado.)

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

**Status: OK** em `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica para `manusalt13@gmail.com`: `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset em novo dia (`last_login_date`).

---

## Pilar 3 — Blindagem de infra (sem chaves hardcoded)

### Erro 3.A — Fallback hardcoded do **resource name** do Reasoning Engine no worker

**Arquivo:** `orchestrator/workers/agent_worker/vertex_client.js`

**Trecho atual:**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

Isso embute **projeto, região e ID de engine** no repositório (impróprio para SecOps; ambiente pode divergir).

**Trecho que o Cursor deve aplicar:**

```javascript
const REASONING_ENGINE_RESOURCE = process.env.VERTEX_REASONING_ENGINE_ID;
if (!REASONING_ENGINE_RESOURCE) {
  throw new Error('VERTEX_REASONING_ENGINE_ID is required (no default resource in repo)');
}
```

Documentar em README/orquestrador que o deploy **deve** definir `VERTEX_REASONING_ENGINE_ID`.

**Nota G.O.A.T.:** O requisito “`import.meta.env`” aplica-se ao **frontend Vite**. Cloud Functions e workers Node devem continuar com `process.env` / Secret Manager — o importante é **zero segredos e zero recursos de conta** fixos no código.

---

## Pilar 4 — UI/UX e CEAP

- **Layout:** não há `w-screen` no frontend; margem negativa isolada (`-mx-1` em `UniversePage.jsx`) é pequena e contextual — sem alerta crítico nesta auditoria.
- **CEAP:** `CeapMonitorSection.jsx` e `scalarToDisplay` em `dataParsers.js` mitigam `[object Object]`; links oficiais via `urlDocumento` quando presentes nos dados — **OK** no escopo verificado.

---

## Resumo executivo

| Pilar | Status |
|-------|--------|
| 1 Inteligência (ID + Gemini 2.5) | **FALHA** — worker + `score_engine.js` + default opcional em `vertex_agent.py` |
| 2 Cofre GOD / 300 | **OK** |
| 3 SecOps (hardcodes) | **FALHA** — `VERTEX_REASONING_ENGINE_ID` com fallback em código |
| 4 UI / CEAP | **OK** |

**Próxima ação:** aplicar os trechos acima, commitar, e reexecutar esta auditoria até remoção deste alerta ou substituição por “sem achados”.
