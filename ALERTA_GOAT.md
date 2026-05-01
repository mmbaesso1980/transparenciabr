# ALERTA G.O.A.T. — Auditoria pós-push (branch auditada)

**Data:** 2026-05-01  
**Escopo:** conformidade com os 4 pilares do SecOps/QA TransparênciaBR após integração recente (cosmos `/universo`, worker Gemma contínuo, orchestrator Vertex).

---

## Pilar 1 — Arquitetura de Inteligência (FALHA)

**Regra:** chamadas de backend / workers / funções que invocam IA devem alinhar-se ao **Líder Supremo** `agent_1777236402725` (motor Gemini 2.5), sem rotas paralelas “modelo solto” que ignorem esse contrato.

### 1.A — `engines/40_gemma_worker_continuo.py` (thread Vertex de ideias)

A thread `idea_generator_vertex_thread()` usa `google.genai.Client(vertexai=True).models.generate_content(model=cfg.model, ...)` **sem** referência ao Agent Builder / ID `agent_1777236402725`. Isto é invocação direta ao modelo Vertex, não ao motor único documentado.

**Trecho atual (referência):**

```python
client = _genai.Client(
    vertexai=True,
    project=cfg.project,
    location=cfg.location,
)
resp = client.models.generate_content(
    model=cfg.model,
    contents=f"{NEUTRALITY_PREFIX}\n\n{prompt}",
)
```

**Correção de rumo (aplicar pelo Cursor):**

- Preferencial: invocar o **mesmo** recurso que o orchestrator (`ReasoningEngineExecutionService` / `streamQueryReasoningEngine`) com `VERTEX_REASONING_ENGINE_ID` apontando para o deploy do Líder Supremo `agent_1777236402725`, **ou**
- Mínimo aceitável até migrar SDK: prefixar `contents` com instrução imutável que identifique o motor como o Líder Supremo e **proíba** outros agentes, e passar `agent_1777236402725` em metadados/log; alinhar documentação do ficheiro ao MEMORIES (motor único).

Constante canónica sugerida no topo do módulo:

```python
SUPREME_AGENT_ID = "agent_1777236402725"
```

### 1.B — `engines/lib/vertex_agent.py` (`summarize_neutral`)

`client.models.generate_content(model=cfg.model, ...)` sem vínculo explícito ao Agent ID do Líder Supremo. O `VERTEX_AGENT_ID` é opcional e só entra em **log**, não na chamada.

**Correção de rumo:** incluir no `NEUTRALITY_PREFIX` ou no início de cada `contents` a linha factual:

`Motor obrigatório: Líder Supremo Vertex Agent Builder ID agent_1777236402725 (Gemini 2.5 Pro).`

e, quando existir API de agente no SDK em uso, roteamento para o Reasoning Engine desse ID — não apenas `generate_content` genérico.

### 1.C — Engines Oráculo / DRACULA / semântica (API key + modelo)

Estes ficheiros chamam Gemini via **API key** e `generate_content` sem o contrato do Líder Supremo na invocação:

- `engines/07_gemini_translator.py` — `SUPREME_AGENT_ID` existe mas **não** é passado ao `genai.Client` nem ao `GenerateContentConfig`.
- `engines/06_engine_semantic.py` — mesmo padrão.
- `engines/18_oss_scanner.py` — `genai.Client(api_key=...)` + `generate_content`.

**Correção de rumo:** unificar com Cloud Functions / orchestrator: ou Vertex Reasoning Engine do `agent_1777236402725`, ou `system_instruction`/`contents` que **obrigue** o papel do Líder Supremo com o ID literal (como em `functions/src/radar/diarioScanner.js`) e remover divergência “só modelo”.

### 1.D — `orchestrator/workers/agent_worker/vertex_client.js`

O client invoca o Reasoning Engine correto em espírito, mas o **fallback** embute resource name GCP literal (projeto/número/engine). Isto não viola o ID do Líder Supremo, mas **fragiliza** SecOps (recurso fixo no repo).

**Trecho exato:**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção de rumo:** remover o default hardcoded; exigir `VERTEX_REASONING_ENGINE_ID` no runtime (falhar cedo com mensagem clara) ou ler só de secret manager / env injetado pelo deploy.

---

## Pilar 2 — Integridade do cofre (OK)

`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: e-mail `manusalt13@gmail.com` recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais utilizadores recebem `300` na criação e reset diário via `last_login_date`.

---

## Pilar 3 — Blindagem de infra (FALHA parcial)

- **Frontend:** Firebase via `import.meta.env.VITE_FIREBASE_*` em `frontend/src/lib/firebase.js` — **OK**.
- **Falha:** default do Reasoning Engine em `orchestrator/workers/agent_worker/vertex_client.js` (trecho acima). Em Python, chaves vêm de `os.environ` — **OK** para não hardcodar secrets; o problema é **ID de recurso** fixo no JS.

**Correção de rumo:** apenas `process.env.VERTEX_REASONING_ENGINE_ID` (obrigatório em produção).

---

## Pilar 4 — UI/UX e CEAP (observação leve)

- **CEAP:** `CeapMonitorSection.jsx` + `dataParsers.js` seguem o padrão anti-`[object Object]` e links `urlDocumento` — **sem falha** encontrada nesta auditoria.
- **Layout:** não há `w-screen` no frontend. Existe `-mx-1` em `frontend/src/pages/UniversePage.jsx` (strip mobile). Margem negativa mínima; monitorizar overflow horizontal; se o Comandante quiser “zero margens negativas”, substituir por `mx-0` + `px-*` apenas positivos.

---

## Resumo

| Pilar | Estado |
|-------|--------|
| 1 IA → `agent_1777236402725` | **FALHA** — vários `generate_content` sem contrato do Líder Supremo |
| 2 Cofre GOD + 300/dia | **OK** |
| 3 Sem chaves hardcoded | **FALHA leve** — resource Vertex default no JS |
| 4 CEAP / overflow | **OK** (nota: `-mx-1` em Universo) |

**Ação:** aplicar as correções de rumo acima; após conformidade, remover este ficheiro ou substituir por “cleared” num commit dedicado.
