# ALERTA G.O.A.T. — Auditoria contínua (push `main` / estado do repositório)

Auditoria SecOps/QA conforme os 4 pilares do Comandante Baesso. **Data de referência:** 2026-05-02.

---

## Pilar 3 — Blindagem de infraestrutura (SecOps)

### Violação corrigida: chave de API no repositório

- **Problema:** `scripts/run_dayfull.sh` exportava literalmente `PORTAL_TRANSPARENCIA_API_KEY` quando a variável estava vazia (chave em texto claro no Git).
- **Correção aplicada:** o script agora **falha com `exit 1`** e mensagem explícita se `PORTAL_TRANSPARENCIA_API_KEY` não estiver definida no ambiente. **Não há fallback com segredo no repo.**

**Trecho que o Cursor deve manter (ou equivalente seguro):**

```bash
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  echo "ERRO SecOps (G.O.A.T.): defina PORTAL_TRANSPARENCIA_API_KEY no ambiente ou no Secret Manager — nunca commitar chaves no repositório."
  exit 1
fi
```

### Frontend

- `frontend/src/lib/firebase.js` usa **apenas** `import.meta.env.VITE_FIREBASE_*` para credenciais Firebase (conforme pilar).

---

## Pilar 1 — Arquitetura de inteligência (Líder Supremo `agent_1777236402725`)

### Ajustes aplicados nesta auditoria

1. **`tools/aurora/burner_v4_nero.py`**
   - Removido modelo legado **`gemini-2.0-flash-001`**.
   - Flash/Pro passam a usar **`gemini-2.5-flash`** e **`gemini-2.5-pro`** (sobrescrevíveis por `VERTEX_FLASH_MODEL` / `VERTEX_PRO_MODEL`).
   - Constante **`SUPREME_AGENT_ID`** (`agent_1777236402725` por padrão) injetada nos prompts Vertex.

2. **`engines/lib/vertex_agent.py`**
   - `VERTEX_AGENT_ID` passa a defaultar para **`agent_1777236402725`** quando ausente, garantindo tag de log alinhada ao Líder Supremo.

3. **`orchestrator/workers/agent_worker/server.js`**
   - Prompt do worker referencia explicitamente o **Agent Builder ID** (`SUPREME_AGENT_BUILDER_ID`) em vez de sugerir “agente genérico” como identidade do motor.

### Observação residual (aceitável com governança)

- Motores Python que usam **Google AI Studio / API key** (`GEMINI_API_KEY`, `genai.Client(api_key=...)`) não passam pelo recurso Vertex Agent Builder; isso é um caminho distinto do **Reasoning Engine** + `VERTEX_REASONING_ENGINE_ID`. Manter chaves **só em variáveis de ambiente** e, quando possível, preferir Vertex + ADC no mesmo projeto do Líder Supremo.

**Cloud Functions / Genkit** já documentam motor único `gemini-2.5-pro` e ID `agent_1777236402725` (`functions/index.js`, `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js`).

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

- **`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`:** para `manusalt13@gmail.com` → `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários → **300** créditos na criação e reset diário (`DAILY_FREEMIUM_CREDITS = 300`).
- **Stripe webhook** em `functions/index.js` incrementa `creditos` em compras — não substitui a lógica GOD acima no cliente.

---

## Pilar 4 — UI/UX e CEAP

- **`w-screen`:** não encontrado no frontend.
- **Margens negativas:** `-mx-1` em `UniversePage.jsx` é pequena e com `overflow-x-auto` (risco lateral baixo); padrão preferido continua `w-full`, `max-w-5xl`, `overflow-x-hidden` em layouts principais.
- **CEAP:** `CeapMonitorSection.jsx` usa `urlDocumento` com link “Ver Nota Fiscal Oficial”; mapeamento estruturado em `frontend/src/utils/dataParsers.js` conforme MEMORIES.

---

*Este ficheiro foi criado porque o pilar 3 tinha falha objetiva (segredo no repo). Após correção e endurecimento dos pilares 1 e 3, o repositório deve evoluir sem reintroduzir chaves em scripts.*
