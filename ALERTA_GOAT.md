# ALERTA G.O.A.T. — Auditoria pós-push (branch `main` / snapshot workspace)

**Data:** 2026-04-29  
**Papéis:** Diretor SecOps & QA (G.O.A.T.) — TransparênciaBR  
**Escopo:** Quatro pilares do Comandante Baesso (arquitetura IA, cofre GOD, SecOps, UI/CEAP).

---

## Resumo executivo

| Pilar | Status |
|-------|--------|
| 1. Arquitetura de Inteligência (motor único `agent_1777236402725` / Gemini 2.5) | **FALHA** — ver §1 |
| 2. Integridade do cofre (`manusalt13@gmail.com` + 300/dia demais) | **OK** — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`) |
| 3. Blindagem SecOps (sem chaves hardcoded) | **FALHA** — ver §3 |
| 4. UI/UX + CEAP (sem corte lateral / sem `[object Object]`) | **OK** — sem `w-screen` no frontend; CEAP com parsers e `CeapMonitorSection` |

---

## §1 — Pilar 1: Arquitetura de Inteligência

### Erro

O módulo **`engines/analysis/score_engine.js`** roteia risco alto (`score ≥ 85`) para **Vertex Publisher API** `models/{VERTEX_MODEL}:generateContent` com modelo padrão **`gemini-1.5-pro-002`**. Isso **não** passa pelo **Reasoning Engine / Agent Builder** do Líder Supremo **`agent_1777236402725`** e usa um modelo legado (1.5 Pro), em desacordo com a regra absoluta (motor único Gemini 2.5 sob o ID do Líder Supremo).

### Trecho exato (modelo padrão e rota REST)

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

### Correção de rumo (o Cursor deve aplicar)

1. **Eliminar** a rota `publishers/google/models/...:generateContent` para análise forense de produção **ou** restringi-la a dry-run local documentado.
2. **Substituir** a chamada de alto risco por invocação ao **mesmo** recurso Vertex usado no restante do projeto: **Reasoning Engine** associado ao deploy do **`agent_1777236402725`** (espelhar `orchestrator/workers/agent_worker/vertex_client.js` — `streamQueryReasoningEngine`), com `VERTEX_REASONING_ENGINE_ID` obrigatório em ambiente.
3. No **comentário de cabeçalho** e na variável padrão, alinhar a **versão do motor** a **Gemini 2.5 Pro** (e ao ID do Líder Supremo no payload/metadata que o motor esperar), por exemplo:

```javascript
// Trocar default legado:
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-pro';
// E obrigar uso do Reasoning Engine do Líder Supremo (agent_1777236402725), não só trocar o string do modelo.
```

Referência correta no backend Firebase (slots todos apontando para o mesmo ID):

```31:38:functions/index.js
const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";
/**
 * Doze “papéis” operacionais sob orquestração do Vertex IA — todos consolidados no Líder Supremo.
 * G.O.A.T.: não inventar IDs secundários (@slot_*, agentes genéricos); apenas agent_1777236402725.
 */
const VERTEX_SUBAGENT_COUNT = 12;
const VERTEX_TEAM_SLOTS = Array.from({ length: VERTEX_SUBAGENT_COUNT }, () => ASMODEUS_SUPREME_AGENT_ID);
```

---

## §3 — Pilar 3: Blindagem de infraestrutura (SecOps)

### Erro

Em **`orchestrator/workers/agent_worker/vertex_client.js`** existe **fallback hardcoded** para nome completo de recurso GCP (project numérico + `reasoningEngines/...`). Isso fixa identidade de projeto/região/engine no repositório; em SecOps, **IDs de recurso e projeto devem vir apenas de variáveis de ambiente** (equivalente server-side a não embutir segredos/âncoras de infra).

### Trecho exato

```32:34:orchestrator/workers/agent_worker/vertex_client.js
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

### Correção de rumo (o Cursor deve aplicar)

```javascript
const REASONING_ENGINE_RESOURCE = process.env.VERTEX_REASONING_ENGINE_ID;
if (!REASONING_ENGINE_RESOURCE) {
  throw new Error('VERTEX_REASONING_ENGINE_ID is required (Líder Supremo agent_1777236402725 deploy)');
}
```

Documentar o valor esperado em `orchestrator/infra/terraform.tfvars.example` / README (já citam o agente) **sem** duplicar o resource name literal no código.

**Nota:** Cloud Functions usam `process.env.GEMINI_API_KEY` — aceitável para backend; o pilar “`import.meta.env`” aplica-se ao **frontend Vite** (`frontend/src/lib/firebase.js` já usa `import.meta.env.VITE_*`).

---

## §4 — Pilar 4 (constatação)

- **Layout:** busca por `w-screen` e margens negativas agressivas no `frontend/src` não retornou ocorrências; há `overflow-x-hidden` / `min-w-0` em layouts principais.
- **CEAP:** `frontend/src/utils/dataParsers.js` documenta proteção contra `[object Object]`; componentes CEAP usam campos mapeados e `urlDocumento` / `url_documento` onde aplicável.

---

*Fim do alerta. Remover este ficheiro após correções mergeadas e re-auditoria verde.*
