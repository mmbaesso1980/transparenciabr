# ALERTA G.O.A.T. — Auditoria pós-push `main` (816f345bde1440642a8bc67b6697b23b4a567dd2)

Auditoria automática SecOps/QA nos **4 pilares** definidos pelo Comandante Baesso.

---

## Pilar 1 — Arquitetura de Inteligência (falha)

**Arquivo:** `engines/vertex/classify_ceap.js`

**Problema:** As chamadas HTTP para Vertex AI usam apenas  
`.../publishers/google/models/gemini-2.5-flash:generateContent` com `PROMPT_HEADER` genérico (“Você é um classificador…”). Não há vínculo explícito com o **Líder Supremo** `agent_1777236402725`, nem uso do Reasoning Engine / Agent Builder correspondente (contrasta com `functions/index.js`, `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js`, onde o ID supremo está consolidado).

**Trecho atual (referência):**

```57:70:engines/vertex/classify_ceap.js
const PROMPT_HEADER = `Você é um classificador de notas fiscais públicas da Cota para Exercício da Atividade Parlamentar (CEAP) brasileira.

Classifique CADA nota na taxonomia abaixo. Retorne APENAS JSON válido, um objeto por nota, na ordem recebida.

TAXONOMIA: ${TAXONOMY.join(', ')}

Para cada nota, retorne:
{"id": "<id_nota>", "categoria": "<UMA_DA_TAXONOMIA>", "confianca": 0.0-1.0, "subcategoria": "<texto livre curto>"}

Regras:
- Use OUTRO apenas se nenhuma categoria couber.
- Confianca < 0.6 = caso ambíguo, sinalize.
- Não invente. Não infira nada além da classificação.
`;
```

**Correção recomendada (mínima — alinhar ao motor único):**

1. Declarar constante única (igual ao restante do repo):

```javascript
const LIDER_SUPREMO_AGENT_ID = 'agent_1777236402725';
```

2. Prefixar o prompt do classificador para declarar que a inferência é subsistema do agente supremo (sem inventar outros IDs):

```javascript
const PROMPT_HEADER = `Você opera como subsistema de classificação CEAP sob o Agente ${LIDER_SUPREMO_AGENT_ID} (Líder Supremo / Gemini 2.5 Flash). Não simule outros agentes.

Você é um classificador de notas fiscais públicas da Cota para Exercício da Atividade Parlamentar (CEAP) brasileira.
...
`;
```

**Alternativa de arquitetura (mais forte):** Encaminhar lotes ao mesmo deployment Vertex Reasoning Engine já documentado (`VERTEX_REASONING_ENGINE_ID`, vide `orchestrator/workers/agent_worker/vertex_client.js`), em vez de `generateContent` direto no modelo Flash, para que **toda** inferência passe pelo recurso associado ao `agent_1777236402725`.

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

**Status:** Conforme em `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"` para `manusalt13@gmail.com` e `300` créditos diários não cumulativos para demais usuários.

---

## Pilar 3 — Blindagem de infraestrutura (sem chaves hardcoded)

**Status:** Nenhuma chave de API Firebase/Vertex/Stripe/GCP encontrada em literals nos caminhos auditados; frontend usa `import.meta.env.VITE_*`; Functions usam `process.env` para segredos.

---

## Pilar 4 — UI/UX e CEAP forense

**Status:** Sem `w-screen` ou margens negativas problemáticas nos ficheiros React pesquisados; aba CEAP (`CeapMonitorSection.jsx`, `DespesasCeapAudit.jsx`) usa `urlDocumento` e `dataParsers` evita `[object Object]` em títulos.

---

*Gerado por auditoria G.O.A.T. automática.*
