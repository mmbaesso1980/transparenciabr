# ALERTA G.O.A.T. — Auditoria pós-push `main` (SecOps)

**Data:** 2026-04-30  
**Escopo:** Quatro pilares (IA, Cofre, SecOps, UI/CEAP).

## Resumo

| Pilar | Status |
|-------|--------|
| 1. Arquitetura de IA (`agent_1777236402725`) | OK — Cloud Functions / Genkit / engines / worker usam o Líder Supremo; slots 1–12 são shards Pub/Sub, não IDs Vertex alternativos. |
| 2. Cofre GOD + 300/dia | OK — `frontend/src/lib/firebase.js` (`ensureUsuarioDoc`). |
| 3. SecOps (sem chaves/recursos hardcoded) | **Corrigido nesta branch** — ver abaixo. |
| 4. UI/CEAP | OK — sem `w-screen` no frontend; CEAP com parsers / `urlDocumento`. |

---

## Pilar 3 — Achado e correção

**Problema:** `orchestrator/workers/agent_worker/vertex_client.js` continha fallback hardcoded para o resource name do Reasoning Engine (`projects/.../reasoningEngines/...`), violando a regra de não embutir identificadores de infraestrutura no código.

**Correção aplicada:** Removido o fallback; `VERTEX_REASONING_ENGINE_ID` passou a ser **obrigatório** (erro explícito se ausente). Comentário de cabeçalho do ficheiro atualizado. Import não usado de `helpers` removido.

**Trecho a manter (referência):**

```javascript
function getReasoningEngineResource() {
  const id = String(process.env.VERTEX_REASONING_ENGINE_ID ?? '').trim();
  if (!id) {
    throw new Error(
      'VERTEX_REASONING_ENGINE_ID ausente ou vazio — defina o resource name completo do Reasoning Engine (Líder Supremo).',
    );
  }
  return id;
}
```

**Deploy:** Garantir que Cloud Run / `.env` do `agent_worker` define `VERTEX_REASONING_ENGINE_ID` (o Terraform do repositório já documenta a variável).
