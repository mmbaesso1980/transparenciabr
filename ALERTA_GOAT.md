# ALERTA G.O.A.T. — Auditoria pós-push (branch de trabalho)

Auditoria automática dos **4 pilares** contra o estado atual do repositório. O **código de produção** (frontend `ensureUsuarioDoc`, Cloud Functions, orchestrator `vertex_client.js`, engines com `SUPREME_AGENT_ID`) está **alinhado** ao Líder Supremo `agent_1777236402725` e ao motor **Gemini 2.5 Pro**. Foram encontradas **inconsistências em documentação** que violam o espírito do Pilar 1 (arquitetura de inteligência única) e podem induzir implementações erradas.

---

## Pilar 1 — Arquitetura de inteligência (FALHA DOCUMENTAL)

**Problema:** Documentos descrevem múltiplos “agentes Vertex” com IDs distintos de `agent_1777236402725` ou referem **Gemini 1.5 Pro** em vez de **Gemini 2.5**.

### Correção 1 — `docs/dev/MANIFESTO_ARQUITETURA.md`

Substituir a camada 7 e o fluxo que citam Gemini 1.5 Pro pelo motor canônico **Gemini 2.5 Pro** e **um único** Agent Builder `agent_1777236402725`. Exemplo de trechos a ajustar:

```markdown
### Camada 7 — Vertex AI (escalonamento)
- Agent Builder principal: `agent_1777236402725` (motor Gemini 2.5 Pro — Líder Supremo)
- Reasoning Engine: configurado via `VERTEX_REASONING_ENGINE_ID` (sem IDs de agente inventados no runtime)
```

```markdown
  └─ 5% alto risco → Vertex AI Gemini 2.5 Pro (Líder Supremo agent_1777236402725) → laudo PDF → ...
```

```markdown
2. **Análise profunda de caso isolado, redação jurídica** → escale para Vertex Gemini 2.5 Pro (único motor aprovado).
```

### Correção 2 — `PLANO_CEAP_INVESTIGATIVO.md` (secção “12 AGENTES DETETIVES VERTEX”)

A tabela com `agent_normative_compliance`, `agent_vendor_intelligence`, etc. **não** pode ser lida como IDs reais de Vertex Agent Builder. O G.O.A.T. exige **exclusivamente** `agent_1777236402725`.

**Trecho a reescrever:** substituir a tabela de 13 IDs fictícios por uma descrição alinhada ao repo:

- **Motor único:** `agent_1777236402725` (Gemini 2.5 Pro).
- **Shards de carga (Pub/Sub `agent_id` 1–12):** apenas roteamento paralelo no `orchestrator` — **não** são outros agentes Vertex; ver comentários em `orchestrator/workers/agent_worker/vertex_client.js` e `orchestrator/README.md`.

Exemplo para o contrato JSON da secção 5.1 (em vez de `"agent_id": "agent_geo_movement"`):

```json
{
  "shard_id": 3,
  "task_family": "F04",
  "parlamentar_id": "204554",
  "task_type": "ceap_investigative",
  "motor_vertex": "agent_1777236402725"
}
```

(Adaptar nomes de campos ao que o orchestrator já consome, mantendo **zero** referência a `agent_*` inventados como destino de API.)

**Código de referência já conforme (manter como fonte da verdade):**

- `functions/index.js` — `ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725"`, `ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro"`.
- `functions/src/genkit.config.js` — `SUPREME_AGENT_ID`, `vertexai/gemini-2.5-pro`.
- `functions/src/radar/diarioScanner.js` — `SUPREME_AGENT_ID`, `SUPREME_GEMINI_MODEL`.
- `orchestrator/workers/agent_worker/vertex_client.js` — `SUPREME_AGENT_BUILDER_ID`, `VERTEX_REASONING_ENGINE_ID`.

---

## Pilar 2 — Integridade do cofre (CONFORME)

`frontend/src/lib/firebase.js` — `ensureUsuarioDoc`: e-mail `manusalt13@gmail.com` recebe `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`; demais usuários recebem `DAILY_FREEMIUM_CREDITS` (300) com reset diário em `last_login_date`.

---

## Pilar 3 — Blindagem SecOps (CONFORME no escopo verificado)

- Frontend: `import.meta.env.VITE_FIREBASE_*` em `frontend/src/lib/firebase.js`; sem chaves reais no código.
- Cloud Functions / orchestrator: uso de `process.env` / ADC — padrão correto para Node/GCP (o requisito `import.meta.env` aplica-se ao bundle Vite).
- Nenhum `AIza...` ou `sk_live_` / `sk_test_` real encontrado em `functions/`.

**Nota:** `docs/dev/MANIFESTO_ARQUITETURA.md` menciona `sk_test_...` apenas como exemplo textual de convenção Stripe — não é secret commitado.

---

## Pilar 4 — UI/UX e CEAP (CONFORME no escopo verificado)

- Não há `w-screen` no `frontend/`.
- CEAP: `frontend/src/utils/dataParsers.js` trata objetos aninhados para evitar `[object Object]`; `CeapMonitorSection.jsx` usa `urlDocumento` em links.

**Observação menor:** `UniversePage.jsx` usa `-mx-1` num carrossel interno — não é `w-screen`; monitorar overflow em QA mobile.

---

## Resumo

| Pilar | Status |
|------|--------|
| 1 Arquitetura IA | **Falha documental** — corrigir `MANIFESTO_ARQUITETURA.md` e `PLANO_CEAP_INVESTIGATIVO.md` |
| 2 Cofre GOD + 300/dia | OK |
| 3 Sem chaves hardcoded | OK |
| 4 CEAP + layout | OK |

**Ação recomendada:** aplicar as edições de documentação acima no próximo commit para fechar o Pilar 1 também em artefatos de planejamento.
