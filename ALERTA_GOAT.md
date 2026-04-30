# ALERTA G.O.A.T. — Auditoria contínua (branch auditada: estado atual do workspace)

Interceptação automática: o repositório **não** está em conformidade total com os 4 pilares do Comandante Baesso. Itens abaixo exigem correção ou decisão explícita de arquitetura.

---

## Pilar 1 — Arquitetura de Inteligência (FALHA)

**Problema:** O motor `engines/analysis/score_engine.js` escala análises de alto risco para **Vertex Publisher API** com modelo default **`gemini-1.5-pro-002`** e endpoint `.../publishers/google/models/${VERTEX_MODEL}:generateContent`. Isso **não** passa pelo **Líder Supremo** (`agent_1777236402725`) nem alinha com o motor único **Gemini 2.5** documentado em `functions/index.js`, `functions/src/genkit.config.js` e `orchestrator/workers/agent_worker/vertex_client.js`.

**Trecho exato (default do modelo e chamada REST):**

```43:44:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION          || 'us-central1';
```

```375:378:engines/analysis/score_engine.js
  const endpoint =
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
    `${VERTEX_MODEL}:generateContent`;
```

**Correção de rumo (o Cursor deve aplicar):**

1. Remover o caminho `publishers/google/models/...:generateContent` para análise forense em produção **ou** isolá-lo atrás de uma flag explícita `LEGACY_VERTEX_PUBLISHER=1` (default **off**).
2. Para `score ≥ 85`, invocar o **mesmo** deployment do Líder Supremo já usado no backend: **Reasoning Engine** configurado via `VERTEX_REASONING_ENGINE_ID` (resource name completo), com sessão/prompt alinhados ao protocolo G.O.A.T., **sem** IDs de agente inventados.
3. Ajustar default de modelo para **`gemini-2.5-pro`** (ou apenas Reasoning Engine, sem modelo Publisher) e atualizar comentários em `engines/analysis/README.md` que ainda citam Gemini 1.5 Pro.

Referência canônica no repo: `SUPREME_AGENT_ID = 'agent_1777236402725'` em `functions/src/genkit.config.js` e `orchestrator/workers/agent_worker/vertex_client.js` (`SUPREME_AGENT_BUILDER_ID`).

---

## Pilar 3 — Blindagem de infraestrutura (FALHA — recurso GCP fixo)

**Problema:** Fallback de **resource name** do Reasoning Engine está **hardcoded** (projeto numérico + `reasoningEngines/...`). Pilar 3 exige que identificadores sensíveis de infra venham de variáveis de ambiente (no frontend, `import.meta.env`; em Node, `process.env`).

**Trecho exato:**

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção de rumo (o Cursor deve aplicar):**

```javascript
const REASONING_ENGINE_RESOURCE = process.env.VERTEX_REASONING_ENGINE_ID;
if (!REASONING_ENGINE_RESOURCE) {
  throw new Error('VERTEX_REASONING_ENGINE_ID é obrigatório — não use fallback hardcoded.');
}
```

(Alternativa aceitável: fallback apenas para testes locais quando `NODE_ENV === 'test'`.)

---

## Pilares 2 e 4 — Conformidade (sem ação obrigatória neste alerta)

- **Pilar 2:** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica GOD para `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem 300/dia com reset em novo dia (`last_login_date`).
- **Pilar 4 (UI):** não foram encontrados `w-screen` nem margens negativas problemáticas nos ficheiros `jsx/tsx/js/css` do `frontend`; CEAP em `CeapMonitorSection.jsx` usa `urlDocumento` e mapeamento via `dataParsers.js` (evita `[object Object]`).

---

*Gerado por auditoria G.O.A.T. automática. Remover ou arquivar este ficheiro após as correções serem mergeadas.*
