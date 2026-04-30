# ALERTA G.O.A.T. — Auditoria pós-push `main` (SecOps / QA)

**Data:** 2026-04-30  
**Escopo:** Branch atual do repositório `transparenciabr` — pilares do Comandante Baesso.

---

## Pilar 1 — Arquitetura de Inteligência (FALHA)

### 1.A Motor Vertex desatualizado no score engine (Gemini 1.5 Pro)

O roteamento e o default de modelo em `engines/analysis/score_engine.js` ainda apontam para **Gemini 1.5 Pro** (`gemini-1.5-pro-002`), em desacordo com o motor único **Gemini 2.5 Pro** e o Líder Supremo `agent_1777236402725`.

**Trechos atuais (incorretos):**

```11:11:engines/analysis/score_engine.js
 *   score ≥ 85  → Vertex Gemini 1.5 Pro (gemini-1.5-pro-002), hard cap US$ 95/mês
```

```43:43:engines/analysis/score_engine.js
const VERTEX_MODEL    = process.env.VERTEX_MODEL             || 'gemini-1.5-pro-002';
```

**Correção obrigatória (aplicar no arquivo):**

- Atualizar o comentário de roteamento para **Gemini 2.5 Pro** alinhado ao protocolo do Líder Supremo.
- Alterar o default:

```javascript
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-pro';
```

- Opcional mas recomendado: no mesmo fluxo Vertex, documentar no cabeçalho do ficheiro que chamadas de produção ao motor forense devem respeitar o deployment do **Agent Builder `agent_1777236402725`** (Reasoning Engine / Genkit já usados em `functions/` e `orchestrator/`).

### 1.B Documentação espelhando o modelo errado

`engines/analysis/README.md` ainda referencia **Vertex Gemini 1.5 Pro** / `gemini-1.5-pro-002`. Alinhar tabela e variável `VERTEX_MODEL` à mesma política do ponto 1.A (Gemini 2.5 Pro + referência ao Líder Supremo).

### 1.C `VERTEX_AGENT_ID` sem validação (`engines/lib/vertex_agent.py`)

O cliente Vertex lê `VERTEX_AGENT_ID` do ambiente para log/observabilidade sem garantir que seja **apenas** `agent_1777236402725`. Qualquer valor inventado no env viola o pilar.

**Trecho relevante:**

```63:67:engines/lib/vertex_agent.py
    return VertexConfig(
        project=project,
        location=os.environ.get("VERTEX_LOCATION", DEFAULT_LOCATION).strip() or DEFAULT_LOCATION,
        model=os.environ.get("VERTEX_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        agent_id=(os.environ.get("VERTEX_AGENT_ID") or "").strip() or None,
```

**Correção sugerida:** após ler `raw = (os.environ.get("VERTEX_AGENT_ID") or "").strip()`, se `raw` não for vazio e `raw != "agent_1777236402725"`, levantar `RuntimeError` com mensagem explícita G.O.A.T.; se vazio, fixar `agent_id` opcionalmente a `None` ou forçar `"agent_1777236402725"` conforme política única de logging.

---

## Pilar 2 — Integridade do cofre (GOD + 300/dia)

**Conforme** no snapshot auditado: `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` aplica `manusalt13@gmail.com` com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais utilizadores recebem `DAILY_FREEMIUM_CREDITS` (300) com reset diário.

---

## Pilar 3 — Blindagem SecOps (sem chaves hardcoded)

**Conforme** no frontend auditado: `frontend/src/lib/firebase.js` usa `import.meta.env.VITE_FIREBASE_*`. Não foram encontrados padrões tipo `AIza...` em código. Engines Python referem ADC / variáveis de ambiente.

---

## Pilar 4 — UI/UX e CEAP forense

**Conforme** no recorte: não há `w-screen` no `frontend/`; existem parsers anti-`[object Object]` e `urlDocumento` em `frontend/src/utils/dataParsers.js` e componentes CEAP (`CeapMonitorSection.jsx`, `DespesasCeapAudit.jsx`). Margem negativa pontual (`-mx-1` em `UniversePage.jsx`) é pequena; monitorizar overflow se surgir corte em viewports estreitas.

---

## Resumo

| Pilar | Estado |
|------|--------|
| 1 Inteligência | **FALHA** — modelo 1.5 em `score_engine.js`; README; risco `VERTEX_AGENT_ID` |
| 2 Cofre GOD | OK |
| 3 SecOps keys | OK |
| 4 UI / CEAP | OK (observação menor UniversePage) |

**Ação:** aplicar os patches do Pilar 1 e remover ou arquivar este ficheiro após merge validado.
