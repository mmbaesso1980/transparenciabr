# ALERTA G.O.A.T. — Auditoria pós-push `main` (landing autenticada / workspace atual)

**Data:** 2026-04-30  
**Escopo:** Branch analisada conforme stack local (`cursor/auditoria-de-c-digo-g-o-a-t-0173` espelhando alterações recentes em `main`).

---

## Pilar 1 — Arquitetura de Inteligência (falhas)

### 1.1 `engines/analysis/score_engine.js` — modelo Vertex **legado** como padrão

O roteamento documentado e o **default** de `VERTEX_MODEL` apontam para **Gemini 1.5 Pro** (`gemini-1.5-pro-002`). Isso viola a regra de motor único **Gemini 2.5** alinhado ao Líder Supremo `agent_1777236402725`.

**Trecho atual (incorreto como default):**

```javascript
// linhas ~11-11 e ~43-43 de engines/analysis/score_engine.js
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
```

**Correção que o Cursor deve aplicar:**

```javascript
// Comentário do cabeçalho — alinhar à doutrina:
 *   score ≥ 85  → Vertex Gemini 2.5 Pro (gemini-2.5-pro), hard cap US$ 95/mês — motor único Líder Supremo agent_1777236402725

const SUPREME_AGENT_ID = 'agent_1777236402725';

const VERTEX_MODEL =
  process.env.VERTEX_MODEL?.trim() || 'gemini-2.5-pro';
```

Dentro de `callVertex`, prefixar o `systemInstruction` existente com identidade explícita do Líder Supremo (mesmo padrão de `functions/src/radar/diarioScanner.js`), por exemplo:

```javascript
const systemInstruction = (
  `Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro). ` +
  'Você é auditor forense de gastos públicos brasileiros. Analise a nota com máximo rigor. ' +
  'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}'
);
```

Atualizar também `engines/analysis/README.md` onde ainda consta `gemini-1.5-pro-002` como valor de exemplo.

---

### 1.2 `engines/vertex/classify_ceap.js` — Gemini **2.5 Flash** sem vínculo ao Agent Builder

O batch classifier usa `MODEL = 'gemini-2.5-flash'` e um prompt genérico de “classificador”, **sem** declarar o agente `agent_1777236402725`. Para alinhamento estrito ao Comandante, toda inferência Vertex/Gemini exposta ao lake deve declarar o mesmo motor cognitivo (ou ser substituída pela invocação do Reasoning Engine do Líder Supremo).

**Trecho atual (prefixo do prompt — incompleto para Pilar 1):**

```javascript
const PROMPT_HEADER = `Você é um classificador de notas fiscais públicas da Cota para Exercício da Atividade Parlamentar (CEAP) brasileira.
```

**Correção mínima que o Cursor deve aplicar:**

```javascript
const SUPREME_AGENT_ID = 'agent_1777236402725';

const PROMPT_HEADER = `Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5). Atua como classificador factual de notas fiscais públicas da Cota para Exercício da Atividade Parlamentar (CEAP) brasileira.
```

**Decisão arquitetural recomendada (alternativa mais forte):** trocar este script para consumir apenas o deployment Vertex associado a `agent_1777236402725` (Reasoning Engine), em vez de `publishers/google/models/gemini-2.5-flash:generateContent`, para eliminar rotas paralelas de modelo.

---

### 1.3 `orchestrator/workers/agent_worker/server.js` — prompt não referencia o Líder Supremo

O worker envia `You are agent ${agent_id}` (shards 1–12). Tecnicamente todos chamam o **mesmo** `REASONING_ENGINE_RESOURCE`, mas o texto do prompt pode ser interpretado como “agentes inventados”. Alinhar a redação à doutrina:

**Substituir o array `prompt` (~linhas 168–173) por:**

```javascript
  const prompt = [
    `You are a load shard ${agent_id}/12 under Supreme Leader Agent Builder ID agent_1777236402725 (Gemini 2.5 Pro). Correlation ID: ${correlationId}.`,
    `Process these api_ids: ${api_ids.join(', ')}.`,
    `For each api_id, call the runIngestion tool with that api_id.`,
    `Report success or failure for each one in your final response.`,
  ].join('\n');
```

---

## Pilar 2 — Integridade do cofre

**Conforme.** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica para `manusalt13@gmail.com`: `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset diário em `last_login_date`.

---

## Pilar 3 — Blindagem SecOps

**Conforme no escopo auditado.** Firebase no frontend via `import.meta.env.VITE_FIREBASE_*`; não foram encontradas chaves `AIza...` / Stripe hardcoded no repositório. Cloud Functions usam `process.env` / secrets para Gemini (padrão esperado).

---

## Pilar 4 — UI/CEAP forense

**Parcial.**

- **Landing / layout:** `LandingPage.jsx` usa `w-full`, `overflow-hidden` no root, sem `w-screen` ou margens negativas problemáticas — OK para “Zero Cortes” neste diff.
- **CEAP dados:** Componentes monitor (`CeapMonitorSection.jsx`, `DespesasCeapAudit.jsx`) mapeiam campos e `urlDocumento`; não há evidência de `[object Object]` nestes ficheiros.
- **Risco residual:** O pipeline `score_engine.js` + `classify_ceap.js` acima **ainda roteia ou rotula CEAP** com modelo/prompt **fora** da política do Líder Supremo — isso compromete a consistência forense ponta-a-ponta mesmo que a UI esteja correta.

---

## Resumo

| Pilar | Status |
|-------|--------|
| 1 Inteligência | **FALHA** — default Gemini 1.5 em `score_engine.js`; CEAP classifier sem ID supremo; prompt do orchestrator ambíguo |
| 2 Cofre | OK |
| 3 SecOps | OK (amostragem) |
| 4 UI/CEAP | **PARCIAL** — UI OK; pipelines CEAP/Vertex desalinhados ao Pilar 1 |

**Ação:** aplicar os trechos acima e reexecutar esta auditoria até remoção deste ficheiro ou substituição por “sem pendências”.
