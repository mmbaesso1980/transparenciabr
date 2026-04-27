# ALERTA G.O.A.T. — Auditoria pós-push `main` (2026-04-27)

Auditoria automática dos **4 pilares**. Foram encontradas falhas; abaixo o registro objetivo e os trechos de correção aplicados (ou que devem ser aplicados em operações).

---

## Pilar 1 — Arquitetura de Inteligência

**Erro:** `functions/index.js` referenciava agentes fictícios `ASIMODEUS-001` … `ASIMODEUS-012` em payloads Gemini, textos de orquestração e respostas JSON. Isso viola a regra de **motor único** sob o ID `agent_1777236402725`.

**Correção aplicada:** substituído por `VERTEX_TEAM_SLOTS` — 12 entradas derivadas de `agent_1777236402725@slot_01` … `@slot_12`, e `COMPLIANCE_SLOT_LABEL = "agent_1777236402725 // COMPLIANCE"`. Nenhum nome inventado fora desse prefixo.

**Erro (UI):** `frontend/src/components/dossie/OsintRadarSection.jsx` citava `ASIMODEUS-012` / `ASIMODEUS-004` no texto visível.

**Correção aplicada:** texto alinhado ao Líder Supremo `agent_1777236402725`.

---

## Pilar 2 — Integridade do cofre

**Status:** conforme em `frontend/src/lib/firebase.js` — GOD `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários com cota diária **300** não cumulativa (`DAILY_FREEMIUM_CREDITS`).

---

## Pilar 3 — Blindagem de infraestrutura (SecOps)

**Erro crítico:** `frontend/.env.production.local` estava **versionado no Git** (apesar de `.gitignore` com `.env.*`), contendo chaves reais (Firebase, Gemini, Stripe, CGU, etc.). Isso viola o pilar (segredos não podem estar no repositório).

**Correção aplicada:** arquivo **removido do índice** (`git rm --cached`). O ficheiro permanece local para desenvolvimento (não rastreado).

**Ação obrigatória (fora do código):** como o histórico do Git pode ainda conter esses valores, **rotacione imediatamente** todas as chaves expostas (Firebase Web API key / restrinja por domínio, Gemini, Stripe, CGU, credenciais GCP). Considere `git filter-repo` ou suporte GitHub para purgar o histórico se o repositório for público ou já tiver sido clonado.

**Frontend em runtime:** `frontend/src/lib/firebase.js` continua a usar apenas `import.meta.env.VITE_FIREBASE_*` — correto.

---

## Pilar 4 — UI/UX e CEAP

**Status:** sem `w-screen` no frontend; `CeapMonitorSection.jsx` usa `scalarToDisplay` via `normalizeInvestigationRow` em `dataParsers.js` para evitar `[object Object]`; links de nota quando `urlDocumento` existe.

---

## Referência — constantes corretas (backend)

```javascript
const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const VERTEX_SUBAGENT_COUNT = 12;
const VERTEX_TEAM_SLOTS = Array.from({ length: VERTEX_SUBAGENT_COUNT }, (_, i) =>
  `${ASMODEUS_SUPREME_AGENT_ID}@slot_${String(i + 1).padStart(2, "0")}`,
);
const COMPLIANCE_SLOT_LABEL = `${ASMODEUS_SUPREME_AGENT_ID} // COMPLIANCE`;
```

---

*Gerado pelo fluxo G.O.A.T. SecOps/QA.*
