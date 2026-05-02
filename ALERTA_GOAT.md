# ALERTA G.O.A.T. — Auditoria pós-push (branch `main`)

**Data da auditoria:** 2026-05-02  
**Escopo:** Pilares 1–4 (arquitetura IA, cofre GOD, SecOps, UI/CEAP).

---

## Resumo

| Pilar | Status |
|-------|--------|
| 1. Arquitetura de Inteligência (`agent_1777236402725`) | **OK** — referências alinhadas ao Líder Supremo; Genkit/Functions usam o ID canónico. |
| 2. Integridade do Cofre (GOD + 300/dia) | **OK** — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`): GOD com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais com 300 não-cumulativos no reset diário. |
| 3. Blindagem de infraestrutura (SecOps) | **FALHA DETECTADA E CORRIGIDA** — ver abaixo. |
| 4. UI/UX e CEAP | **OK** — sem `w-screen` no frontend; `CeapMonitorSection.jsx` mapeia campos e usa `urlDocumento` em links. |

---

## Pilar 3 — Falha: chave de API hardcoded

**Ficheiro:** `scripts/run_dayfull.sh`  
**Problema:** Quando `PORTAL_TRANSPARENCIA_API_KEY` estava vazia, o script exportava uma chave literal (Portal Transparência / CGU), violando a regra de zero secrets no repositório.

**Trecho incorreto (removido):** fallback que exportava `PORTAL_TRANSPARENCIA_API_KEY` com valor literal de 32 caracteres quando a variável de ambiente estava vazia (chave real do Portal da Transparência — **não repetir em docs**).

**Correção aplicada neste repositório:** remover o fallback; se a variável não estiver definida, o script falha com `exit 1` e instrução para definir a chave só via ambiente/CI.

**Trecho a aplicar (substituir o bloco `if` antigo):**

```bash
phase "🏛️ FASE 4/9 — Emendas Parlamentares (CGU)"
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  echo "ERRO SecOps: PORTAL_TRANSPARENCIA_API_KEY não definida." >&2
  echo "  Defina a chave apenas via ambiente/CI (nunca commitar no repo)." >&2
  exit 1
fi
```

---

## Notas (sem falha)

- **Pilar 1:** `engines/analysis/score_engine.js` usa Vertex REST com modelo `VERTEX_MODEL` (env); o system prompt referencia apenas `agent_1777236402725` — coerente com o motor único documentado. Rotas Ollama para scores abaixo de 85 não substituem o ID do Líder nas CF/Genkit.
- **Pilar 4:** `UniversePage.jsx` usa `-mx-1` com `overflow-x-auto` num carrossel interno; não é o anti-padrão global `w-screen` + corte lateral.
