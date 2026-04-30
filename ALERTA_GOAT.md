# ALERTA G.O.A.T. — Auditoria pós-push (branch `main` / snapshot repo)

**Data:** 2026-04-30  
**Pilares:** Arquitetura IA · Cofre GOD · SecOps · UI/CEAP

> **Remediação (mesmo ciclo de auditoria):** o fallback GCP hardcoded em `orchestrator/workers/agent_worker/vertex_client.js` foi removido; o worker passa a exigir `VERTEX_REASONING_ENGINE_ID` em runtime. Os trechos abaixo documentam o que estava errado e o patch aplicado.

---

## Resumo

| Pilar | Status |
|-------|--------|
| 1. Arquitetura de Inteligência (Líder `agent_1777236402725`) | **OK** — Cloud Functions, Genkit, engines Python, front e orquestrador referenciam apenas esse ID para o motor Gemini 2.5; slots/subagentes em `functions/index.js` são 12 entradas repetidas do mesmo ID (não há agente inventado). |
| 2. Cofre GOD + 300/dia | **OK** — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`): e-mail GOD com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais com `DAILY_FREEMIUM_CREDITS = 300` e reset por `last_login_date`. |
| 3. SecOps (sem secrets/GCP hardcoded) | **Corrigido** — havia fallback com resource name Vertex no `vertex_client.js`; removido (ver abaixo). |
| 4. UI/CEAP | **OK** — sem `w-screen` no frontend; CEAP (`DespesasCeapAudit`, `CeapMonitorSection`, parsers) usa strings/`pickUrlDocumento`/`urlDocumento`; sem evidência de renderização `[object Object]`. |

---

## Erro encontrado (Pilar 3 — Blindagem de infraestrutura)

**Arquivo:** `orchestrator/workers/agent_worker/vertex_client.js`  
**Problema:** Nome completo do recurso Vertex AI Reasoning Engine (projeto GCP + ID numérico) está **hardcoded** como fallback quando `VERTEX_REASONING_ENGINE_ID` não está definido. Isso viola a política de não embutir identificadores sensíveis de infraestrutura GCP no código; o deploy deve obrigar a variável de ambiente.

**Trecho atual (incorreto para produção / SecOps):**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção recomendada (aplicar no Cursor):** exigir env; falhar de forma explícita se ausente (sem fallback com projeto real).

```javascript
const REASONING_ENGINE_RESOURCE = process.env.VERTEX_REASONING_ENGINE_ID;
if (!REASONING_ENGINE_RESOURCE || String(REASONING_ENGINE_RESOURCE).trim() === '') {
  throw new Error(
    '[SecOps] VERTEX_REASONING_ENGINE_ID é obrigatório — defina o resource name completo do Reasoning Engine (Líder Supremo / deployment Gemini 2.5). Não use fallback hardcoded no repositório.',
  );
}
```

**Nota:** Em serviços Node/Cloud Run use `process.env` (equivalente operacional a `import.meta.env` no Vite). O frontend já usa apenas `import.meta.env.VITE_*` em `frontend/src/lib/firebase.js` — conforme esperado.

---

## Referências rápidas de conformidade (para fechamento do alerta)

- **Pilar 1:** `functions/index.js` (`ASMODEUS_SUPREME_AGENT_ID`), `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js`, `engines/06_engine_semantic.py`, `engines/07_gemini_translator.py`.
- **Pilar 2:** `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` / `GOD_MODE_EMAIL` / `DAILY_FREEMIUM_CREDITS`.

O patch acima foi **aplicado** no repositório. Validar deploy/orquestrador com `VERTEX_REASONING_ENGINE_ID` definido; em seguida pode remover este ficheiro se a política for só manter alertas abertos.
