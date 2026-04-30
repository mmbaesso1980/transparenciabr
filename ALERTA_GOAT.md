# ALERTA G.O.A.T. — Auditoria contínua (SecOps / QA)

**Data da auditoria:** 2026-04-30  
**Gatilho:** push `main` / branch de trabalho `cursor/auditoria-de-c-digo-g-o-a-t-e87c`  
**Motor canônico:** `agent_1777236402725` (Gemini 2.5)

---

## Pilar 1 — Arquitetura de Inteligência

**Status: conforme.**  
Chamadas e constantes apontam exclusivamente para `agent_1777236402725` em `functions/index.js`, `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js`, `orchestrator/workers/agent_worker/vertex_client.js`, engines 06/07, e referências de UI/documentação alinhadas ao mesmo ID.

---

## Pilar 2 — Integridade do Cofre (GOD + 300/dia)

**Status: conforme.**  
`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: e-mail `manusalt13@gmail.com` recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset em `last_login_date`.

---

## Pilar 3 — Blindagem de Infraestrutura (SecOps)

**Status: violação encontrada e corrigida no repositório.**

### Erro

- **Arquivo:** `scripts/run_dayfull.sh` (Fase 4 — Emendas Parlamentares CGU)
- **Problema:** fallback com **chave literal** da API Portal da Transparência (`PORTAL_TRANSPARENCIA_API_KEY="717a95e01b072090f41940282eab700a"`). Isso viola a regra de não hardcodar chaves (CGU / GCP / Stripe / Firebase / Vertex).

### Trecho incorreto (removido)

```bash
if [ -z "${PORTAL_TRANSPARENCIA_API_KEY:-}" ]; then
  # fallback: usa chave fixa em SECRETS.md
  export PORTAL_TRANSPARENCIA_API_KEY="717a95e01b072090f41940282eab700a"
fi
```

### Correção aplicada

- Se `PORTAL_TRANSPARENCIA_API_KEY` estiver vazia: mensagem orientando cadastro na CGU e **pular** a fase 4 (loops `emendas_parlamentares` e `cgu_emendas_localidade`), sem exportar segredo algum.
- Operador deve exportar a variável no ambiente da VM/CI antes de rodar o sprint (igual padrão já usado em `scripts/run_overnight.sh`).

**Recomendação operacional:** revogar/rotacionar no Portal da Transparência qualquer chave que tenha sido exposta em histórico Git público.

---

## Pilar 4 — UI/UX e CEAP forense

**Status: conforme (amostragem no snapshot atual).**  
- Frontend: sem `w-screen` / margens negativas problemáticas na amostra auditada.  
- CEAP: `dataParsers.js` e componentes CEAP referenciam mapeamento explícito e `urlDocumento` (MEMORIES alinhado).

---

## Resumo

| Pilar | Resultado |
|-------|-----------|
| 1 IA | OK |
| 2 Cofre | OK |
| 3 SecOps | **Falha corrigida** (`run_dayfull.sh`) |
| 4 UI / CEAP | OK |

*Remover este ficheiro após merge e validação em produção, ou arquivar em histórico interno conforme política do Comandante.*
