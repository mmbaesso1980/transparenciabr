# ALERTA G.O.A.T. — Auditoria pós-push (branch de trabalho)

Auditoria SecOps/QA dos **4 pilares** contra o estado atual do repositório. Itens já **corrigidos nesta iteração** estão marcados.

---

## Pilar 1 — Arquitetura de Inteligência (Líder Supremo `agent_1777236402725`)

### Corrigido nesta iteração

- **`orchestrator/workers/agent_worker/server.js`** — O prompt dizia `You are agent ${agent_id}`, o que sugere agentes distintos (1–12) em vez do motor único. **Aplicado:** prompt alinhado ao Líder Supremo com `SUPREME_AGENT_BUILDER_ID` e rótulo de shard apenas para correlação.

### Pendência crítica — Cloud Functions usam Google AI Studio, não o deployment Vertex do Líder

**Arquivo:** `functions/index.js`  
**Problema:** `analyzeCeapWithSupremeLeader` usa `GoogleGenerativeAI` + `process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY` e `getGenerativeModel({ model: "gemini-2.5-pro" })`. Isso é a API **Generative Language (AI Studio)**, não a invocação exclusiva do **Reasoning Engine / Agent Builder** do Líder Supremo `agent_1777236402725`, como exige o pilar.

**Trecho exato (referência):**

```javascript
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
// ...
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: ASMODEUS_GEMINI_MODEL,
  systemInstruction:
    "Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID agent_1777236402725). " +
```

**Correção de rumo sugerida:** Encaminhar análise CEAP (e demais fluxos que hoje usam o mesmo padrão) para **Vertex AI Reasoning Engine** cujo deployment corresponde ao Agent Builder `agent_1777236402725` (variável de ambiente com o resource name completo, p.ex. `VERTEX_REASONING_ENGINE_ID`), ou consolidar em **Genkit + `@genkit-ai/vertexai`** já alinhado em `functions/src/genkit.config.js` (`SUPREME_AGENT_ID`, `vertexai/gemini-2.5-pro`). Não depender de chave AI Studio como caminho principal do “motor único” se a diretiva for 100% Vertex/Líder.

**Arquivo:** `functions/src/radar/diarioScanner.js` — Mesmo padrão (`GoogleGenerativeAI` + API key) em `analyzeWithGemini`; o system prompt cita corretamente o ID do Líder, mas o **canal de API** continua sendo Generative Language, não o recurso Vertex do Agent Builder.

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

**Status:** **Conforme** em `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` cria/atualiza `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset por `last_login_date`.

---

## Pilar 3 — Blindagem SecOps (sem chaves hardcoded)

### Corrigido nesta iteração

- **`orchestrator/workers/agent_worker/vertex_client.js`** — Existia fallback literal `projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240`. **Aplicado:** obrigatório `VERTEX_REASONING_ENGINE_ID` (sem default em código).

**Status geral:** Frontend Firebase segue `import.meta.env` em `frontend/src/lib/firebase.js`. Não foram encontradas chaves estilo `AIza…` / `sk_live` em código fonte.

---

## Pilar 4 — UI/UX e CEAP forense

### Observação (margem negativa)

- **`frontend/src/pages/UniversePage.jsx`** — Classe `-mx-1` no strip mobile (linha ~331). O padrão do pilar pede evitar margens negativas que cortem lateralmente; aqui o offset é pequeno e há `px-3` no ancestral; avaliar troca por `mx-0` + padding interno se houver reclamação visual.

**Trecho:**

```jsx
<div className="pointer-events-auto -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 ...">
```

**Sugestão:** `className="pointer-events-auto mx-0 flex ... px-2"` (ou manter padding do pai apenas).

### CEAP / `[object Object]`

**Status:** **Conforme** no desenho atual — `frontend/src/utils/dataParsers.js` documenta proteção contra `[object Object]`; `CeapMonitorSection.jsx` usa `urlDocumento` em links.

---

## Motor legado em `engines/analysis` (fora do caminho “Líder único 2.5”)

**Arquivo:** `engines/analysis/score_engine.js` — `VERTEX_MODEL` default `gemini-1.5-pro-002` e comentários referenciando Gemini 1.5 Pro. Se esse código ainda for executado em produção, conflita com a diretiva de motor **Gemini 2.5** + Líder Supremo.

**Correção de rumo:** Definir default `gemini-2.5-pro` (ou variável única alinhada ao restante do repo) e revisar custos/caps na documentação inline.

---

*Documento gerado pela auditoria G.O.A.T. Correções de código aplicadas: `vertex_client.js`, `server.js` (orchestrator worker).*
