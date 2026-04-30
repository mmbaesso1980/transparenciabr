# G.O.A.T. — Interceptação (auditoria pós-push `main`)

**Data:** 2026-04-30  
**Commit analisado (trigger):** `8f5e268` — *ci: desabilita deploy_functions.yml temporariamente*

## Resumo

| Pilar | Status |
|------|--------|
| 1. Arquitetura de Inteligência (Líder Supremo `agent_1777236402725` + motor Gemini 2.5) | **FALHA** — ver abaixo |
| 2. Cofre / GOD `manusalt13@gmail.com` + 300/dia | **OK** — `frontend/src/lib/firebase.js` |
| 3. SecOps — sem chaves hardcoded; frontend via `import.meta.env` | **OK** (nenhum padrão de chave no repo) |
| 4. UI/UX + CEAP | **OK** — `w-full` / `overflow-x-hidden` predominantes; CEAP com `scalarToDisplay` + `urlDocumento` |

---

## Pilar 1 — Erro encontrado

**Arquivo:** `engines/analysis/score_engine.js`  
**Problema:** O modelo Vertex padrão é **`gemini-1.5-pro-002`** (Gemini 1.5), em desacordo com a regra absoluta de motor único **Gemini 2.5** alinhado ao Líder Supremo.

Trechos atuais:

```javascript
// Linhas 9–11 (comentário de roteamento)
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês

// Linha 43
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
```

```javascript
// Linhas 356–357 (comentário)
// callVertex — chama Gemini 1.5 Pro via Vertex AI REST (ADC)
```

**Documentação espelhada:** `engines/analysis/README.md` (tabela de roteamento e `VERTEX_MODEL` padrão) também referencia 1.5 Pro.

---

## Correção exata a aplicar (Cursor)

1. **`engines/analysis/score_engine.js`** — alinhar ao motor `gemini-2.5-pro` (mesmo padrão que `functions/index.js`, `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js`):

```javascript
 *   score ≥ 85  → Vertex Gemini 2.5 Pro (gemini-2.5-pro), hard cap US$ 95/mês
```

```javascript
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-2.5-pro';
```

```javascript
// callVertex — chama Gemini 2.5 Pro via Vertex AI REST (ADC)
```

2. **`engines/analysis/README.md`** — atualizar tabela e variável:

| ≥ 85 (cap OK) | Vertex Gemini 2.5 Pro | `gemini-2.5-pro` | `vertex` |

| `VERTEX_MODEL` | `gemini-2.5-pro` | Modelo Vertex AI |

---

## Notas de conformidade (referência rápida)

- **Agent ID:** Todas as referências `agent_*` no repositório analisadas apontam para `agent_1777236402725` apenas.
- **Orchestrator:** `VERTEX_REASONING_ENGINE_ID` permanece em env (fallback de recurso em `vertex_client.js` é ID de projeto GCP, não chave API).

---

## Status pós-auditoria (agente)

As alterações de código listadas em **Correção exata** foram **aplicadas** no branch de trabalho (`score_engine.js` + `README.md`) para fechar a não-conformidade do Pilar 1. `VERTEX_MODEL` continua overridável via ambiente; o default passa a ser `gemini-2.5-pro`.
