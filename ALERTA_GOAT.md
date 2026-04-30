# ALERTA G.O.A.T. — Auditoria contínua (SecOps / QA)

**Data:** 2026-04-30  
**Escopo:** estado do repositório após verificação dos 4 pilares (branch de trabalho + alinhamento com `main`).

---

## Resumo executivo

| Pilar | Status |
|-------|--------|
| 1 — Arquitetura de Inteligência (`agent_1777236402725`) | **Conforme** — Cloud Functions / Genkit / scanners referenciam o Líder Supremo; slots 1–12 no payload são explicitamente o mesmo ID (orquestração textual, não IDs alternativos de API). |
| 2 — Integridade do cofre (GOD + 300/dia) | **Conforme** — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`) aplica os campos exigidos para `manusalt13@gmail.com` e 300 diários para demais. |
| 3 — Blindagem de infra (sem chaves no código) | **Falha corrigida** — existia chave literal da API CGU em `scripts/run_dayfull.sh`; removida neste commit (ver abaixo). |
| 4 — UI/UX e CEAP | **Conforme** — sem `w-screen` no frontend; CEAP mapeia `urlDocumento` / `url_documento` em parsers e componentes. |

---

## Pilar 3 — Violação encontrada e correção aplicada

**Problema:** o script `scripts/run_dayfull.sh` exportava `PORTAL_TRANSPARENCIA_API_KEY` com valor fixo quando a variável de ambiente estava vazia. Isso viola a regra de **nenhuma chave de API hardcoded** (Portal da Transparência / CGU).

**Trecho incorreto (removido):**

```bash
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  # fallback: usa chave fixa em SECRETS.md
  export PORTAL_TRANSPARENCIA_API_KEY="717a95e01b072090f41940282eab700a"
fi
```

**Correção aplicada:** igual ao padrão de `scripts/run_overnight.sh` — se a variável não existir, registrar aviso e **pular** a fase 4 (ingestão CGU), sem definir valor no código.

**O que o Cursor / operador deve fazer em VMs ou CI:** exportar a chave só no ambiente seguro, por exemplo:

```bash
export PORTAL_TRANSPARENCIA_API_KEY="(valor obtido no cadastro CGU — nunca commitar)"
```

Ou usar Secret Manager / variáveis cifradas do provedor e injetar `PORTAL_TRANSPARENCIA_API_KEY` antes de executar `run_dayfull.sh`.

---

## Pilares 1, 2 e 4 — Evidência rápida (sem alteração necessária)

- **Pilar 1:** `functions/index.js` usa `ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725"`; `functions/src/genkit.config.js` e `functions/src/radar/diarioScanner.js` alinham o mesmo ID; `orchestrator/workers/agent_worker/vertex_client.js` documenta que o Reasoning Engine deve ser o deploy desse agente (`VERTEX_REASONING_ENGINE_ID`).
- **Pilar 2:** `ensureUsuarioDoc` em `frontend/src/lib/firebase.js` define `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"` para o e-mail GOD e `creditos: 300` com reset diário para os demais.
- **Pilar 4:** `grep` por `w-screen` no `frontend/` sem ocorrências; `CeapMonitorSection.jsx` e `dataParsers.js` tratam URLs de documento como string antes de exibir ou linkar.

---

*Documento gerado pelo fluxo G.O.A.T. de auditoria contínua.*
