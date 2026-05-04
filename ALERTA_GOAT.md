# ALERTA G.O.A.T. — Auditoria contínua (push main / snapshot repo)

**Data:** 2026-05-04  
**Pilares violados:** **1 — Arquitetura de Inteligência** (crítico)

---

## 1. Arquitetura de Inteligência — FALHA

**Problema:** As rotas em Cloud Functions que chamam IA usam o pacote `@google/generative-ai` (`GoogleGenerativeAI`), ou seja, a **Google AI API** (chave `GEMINI_API_KEY` / `GOOGLE_API_KEY`), **não** o pipeline **Vertex AI + Genkit** já canonizado com `vertexai/gemini-2.5-pro` e o Líder Supremo `agent_1777236402725` em `functions/src/genkit.config.js`.

Embora o **ID** `agent_1777236402725` apareça em *prompts* e constantes, a **invocação de rede** não está amarrada ao Agent Builder / Reasoning Engine do Vertex da forma exigida pela diretiva (“chamadas … apontam exclusivamente” para esse motor).

### Evidência A — `functions/index.js`

Trecho atual (API de chave, não Vertex Genkit):

```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");
// ...
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
// ...
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: ASMODEUS_GEMINI_MODEL,
  // ...
});
```

### Evidência B — `functions/src/radar/diarioScanner.js`

Mesmo padrão:

```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");
// ...
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({
  model: SUPREME_GEMINI_MODEL,
  // ...
});
```

### Correção de rumo (trecho orientador — alinhar ao padrão já existente)

O projeto **já** define o motor único em `functions/src/genkit.config.js` (`vertexAI`, `SUPREME_AGENT_ID`, `SUPREME_MODEL`). Os fluxos em `functions/src/flows/oraculoFlow.js` e `dossieExecutivoFlow.js` usam `ai.generate({ model: SUPREME_MODEL, ... })` com o papel do agente no *prompt*.

**Ação:** Refatorar `analyzeCeapWithSupremeLeader` (em `functions/index.js`) e `analyzeWithGemini` (em `functions/src/radar/diarioScanner.js`) para:

1. `require('../genkit.config')` (ou caminho equivalente) e usar **`ai.generate`** com `model: SUPREME_MODEL` e `SUPREME_AGENT_ID` no texto do sistema/prompt (como em `oraculoFlow.js`).
2. Remover dependência de **`GoogleGenerativeAI`** nesses caminhos de produção, de modo que a inferência passe pelo **Vertex** (credenciais ADC da Cloud Function), coerente com o Agent Builder / política G.O.A.T.
3. Manter *fallback* heurístico apenas quando Vertex/Genkit estiver indisponível (sem substituir o caminho feliz por API de chave genérica).

Referência de padrão correto (trecho existente):

```37:55:functions/src/flows/oraculoFlow.js
  async ({ textoContrato, contextoParlamentar }) => {
    const prompt = `
Você é o agente ${SUPREME_AGENT_ID} (Líder Supremo / Gemini 2.5 Pro), atuando como
analista forense de transparência pública brasileira.
// ...
    const { output } = await ai.generate({
      model: SUPREME_MODEL,
      prompt,
      output: { schema: AnaliseSchema },
      config: { temperature: 0.2, maxOutputTokens: 8192 },
    });
```

---

## 2. Integridade do Cofre — OK

`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: e-mail `manusalt13@gmail.com` recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset diário.

---

## 3. Blindagem de Infraestrutura (frontend) — OK

Firebase no cliente via `import.meta.env.VITE_FIREBASE_*`. Nenhum `AIza…` / `sk_live` / `sk_test_` literal encontrado em `frontend/` ou `functions/`.

---

## 4. UI/UX CEAP — OK (snapshot)

- Sem `w-screen` no repositório.
- `CeapMonitorSection.jsx` + `mergeCeapInvestigationRows` / normalizadores em `dataParsers.js` mapeiam valores e `urlDocumento` para links.

---

## Observação não bloqueante

`docs/dev/MANIFESTO_ARQUITETURA.md` ainda menciona “Gemini 1.5 Pro” ao lado do ID do Líder Supremo — divergência documental vs. motor 2.5; corrigir texto quando conveniente.
