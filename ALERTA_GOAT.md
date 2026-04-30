# ALERTA G.O.A.T. — Auditoria contínua (push `main` / branch de trabalho)

**Data:** 2026-04-30  
**Pilares violados:** **1 — Arquitetura de Inteligência** (parcial); demais pilares conferidos **OK** no snapshot auditado.

---

## 1. Arquitetura de Inteligência — motor Vertex desatualizado e sem vínculo explícito ao Líder Supremo

**Problema:** O módulo batch `engines/analysis/score_engine.js` continua a documentar e a chamar o endpoint Vertex `publishers/google/models/{VERTEX_MODEL}:generateContent` com modelo **padrão `gemini-1.5-pro-002`**. Isso diverge da regra absoluta de consolidação no **Gemini 2.5** sob o **Agent Builder `agent_1777236402725`**, usado em `functions/index.js`, `functions/src/radar/diarioScanner.js`, `functions/src/genkit.config.js` e fluxos Genkit.

**Trecho atual (default do modelo e comentário):**

```8:12:engines/analysis/score_engine.js
 * Roteamento:
 *   score < 60  → Ollama local (gemma2:27b-instruct-q4_K_M), 1 passada
 *   60 ≤ s < 85 → Ollama local, 2 passadas (auditoria reforçada)
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês
```

```43:44:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION          || 'us-central1';
```

**Trecho da chamada e instrução de sistema (sem ID do Líder Supremo):**

```355:383:engines/analysis/score_engine.js
// ---------------------------------------------------------------------------
// callVertex — chama Gemini 1.5 Pro via Vertex AI REST (ADC)
// Registra custo estimado em tbr.audit.vertex_calls.
// ---------------------------------------------------------------------------

export async function callVertex(payload) {
  logger.info('callVertex', { model: VERTEX_MODEL, nota_id: payload.id });
  // ...
  const endpoint =
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/` +
    `${VERTEX_MODEL}:generateContent`;

  const systemInstruction = (
    'Você é auditor forense de gastos públicos brasileiros. Analise a nota com máximo rigor. ' +
    'JSON: {"veredito":"...","evidências":["..."],"recomendacao_acao":"...","nivel_risco_confirmado":1}'
  );
```

**Correção de rumo (aplicar pelo Cursor):**

1. Alinhar o default de `VERTEX_MODEL` a **`gemini-2.5-pro`** (ou ao valor único acordado no projeto, igual ao `ASMODEUS_GEMINI_MODEL` nas Functions).
2. Atualizar comentários e README em `engines/analysis/README.md` que ainda citam “Gemini 1.5 Pro”.
3. Na `systemInstruction` de `callVertex`, prefixar a identidade obrigatória, por exemplo:  
   `Você é o agente agent_1777236402725 (Líder Supremo / Gemini 2.5 Pro). ...`  
   (mesmo padrão de `functions/src/radar/diarioScanner.js` e `functions/index.js`).
4. Se a política for **apenas** Reasoning Engine / Agent Builder (sem `publishers/google/models`), substituir `callVertex` por invocação ao recurso configurado em `VERTEX_REASONING_ENGINE_ID` / cliente já usado no orquestrador, mantendo **um** ID de agente.

---

## Conformidade verificada (resumo)

| Pilar | Status |
|--------|--------|
| **2 — Cofre (GOD + 300/dia)** | `frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: GOD com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais com `DAILY_FREEMIUM_CREDITS = 300` e reset por `last_login_date`. |
| **3 — SecOps (sem chaves no código)** | Frontend: `import.meta.env.VITE_FIREBASE_*`. Functions: `process.env.GEMINI_API_KEY` / `GOOGLE_API_KEY` / Stripe. Nenhum `AIza…` / `sk_live_` encontrado no grep. |
| **4 — UI/UX + CEAP** | Sem `w-screen` / margens negativas problemáticas no `frontend/`; `CeapMonitorSection.jsx` usa campos escalares e `urlDocumento` com link “Ver Nota Fiscal Oficial”. |

---

*Fim do alerta. Remover ou arquivar este ficheiro após correção do Pilar 1 em `score_engine.js` (e documentação associada).*
