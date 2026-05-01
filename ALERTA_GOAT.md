# G.O.A.T. — Auditoria pós-push `main` (interceptação)

**Data:** 2026-05-01  
**Escopo:** conformidade com os 4 pilares após o commit que adicionou `scripts/cursor_l4_dispatch_remote.sh`.

## Resumo

| Pilar | Status |
|-------|--------|
| 1. Arquitetura de IA (`agent_1777236402725`) | **OK** — Cloud Functions / Genkit / `diarioScanner` referenciam apenas o Líder Supremo; `agent_worker` usa shards 1–12 só como carga Pub/Sub, não como IDs de motor alternativos. |
| 2. Cofre GOD + 300/dia | **OK** — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`) aplica os atributos exatos para `manusalt13@gmail.com` e 300 não cumulativos para demais. |
| 3. SecOps (sem secrets hardcoded) | **Falha corrigida** — ver abaixo. |
| 4. UI/CEAP | **OK** — sem `w-screen` no frontend; CEAP com `scalarToDisplay` / `urlDocumento` em `dataParsers.js` e componentes do dossiê. |

---

## Pilar 3 — Falha encontrada (infra GCP no código)

**Problema:** Em `orchestrator/workers/agent_worker/vertex_client.js` existia fallback **hardcoded** para o resource do Vertex Reasoning Engine (`projects/.../reasoningEngines/...`), violando blindagem (IDs de projeto/recurso não devem ficar no repositório; configuração deve vir só de ambiente).

**Trecho incorreto (antes):**

```javascript
const REASONING_ENGINE_RESOURCE =
  process.env.VERTEX_REASONING_ENGINE_ID ??
  'projects/89728155070/locations/us-west1/reasoningEngines/4398310393894666240';
```

**Correção aplicada:** Remover o fallback; exigir `VERTEX_REASONING_ENGINE_ID` (nome completo do resource) em `init()` e falhar com erro explícito se ausente. O deploy (Terraform / Cloud Run) já documenta esta variável em `orchestrator/infra/terraform.tfvars.example`.

**Trecho de referência (depois):**

```javascript
async init() {
  const fromEnv = (process.env.VERTEX_REASONING_ENGINE_ID || '').trim();
  if (!fromEnv) {
    throw new Error(
      'VERTEX_REASONING_ENGINE_ID ausente — defina o resource name completo do Reasoning Engine ' +
        '(deployment do Líder Supremo agent_1777236402725). Recursos GCP não podem ter fallback hardcoded.',
    );
  }
  reasoningEngineResource = fromEnv;
  // ... client + initialize
}
```

**Ação operacional:** Garantir `VERTEX_REASONING_ENGINE_ID` definido no serviço Cloud Run do `agent_worker` (valor já previsto pelo Terraform quando `vertex_reasoning_engine_id` está preenchido).

---

## Nota (documentação vs. runtime)

Em `PLANO_CEAP_INVESTIGATIVO.md` aparecem nomes conceituais do tipo `agent_geo_movement` — são rótulos de **plano de produto**, não chamadas de API ao Vertex. Nenhum caminho de execução no `functions/` ou `frontend/` foi encontrado invocando outro Agent Builder ID além de `agent_1777236402725`.
