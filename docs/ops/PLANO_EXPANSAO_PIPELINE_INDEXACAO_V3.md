# Plano de Operação · Expansão do Pipeline de Indexação TransparênciaBR

**Versão:** 3.0 (engenharia conservadora) · **Data:** 05/05/2026  
**Ambiente alvo:** GCP `projeto-codex-br` (Vertex/DocAI) e `transparenciabr` (Hosting/Functions)

Este ficheiro replica o plano aprovado pelo responsável humano. **Execução na cloud** (Firestore export, BigQuery, VM L4, Cloud Run/Functions, billing watchdog) faz-se **fora do Cursor**, com credenciais locais ou CI — ver também `docs/ops/PROMPT_VERTEX_RESPONSAVEL_V1.md`.

---

## Resumo das frentes

| Frente | Descrição |
|--------|-----------|
| **F0** | Consolidação Firestore/BQ → GCS → normalização → datastore `tbr-fs2-bd-completo` |
| **F1** | Worker de embeddings na VM (systemd `embedding-worker`) |
| **F2** | CF v3 RAG + Cloud Run Job `dossie-job` |
| **F3** | Document AI batch |
| **F4** | Crawlers periódicos (`scripts/crawler_run.sh` + timer) |
| **F5** | Vertex Vector Search |
| **F6** | Frontend `/politica/dossie/:nome` → implementado no repo via `VITE_VERTEX_DOSSIE_GROUNDED_URL` |
| **F7** | Watchdog billing (`scripts/watchdog_billing.py`) |

---

## O que já está no repositório

- `scripts/crawler_run.sh` — orquestra motores existentes; suporta `CRAWLER_DRY_RUN=1` ou `--dry-run`.
- `scripts/normalize_to_vertex.py` — normalização JSONL → schema Vertex; modo `--dry-run`.
- `scripts/watchdog_billing.py` — esqueleto + `--dry-run` (configurar tabela de export de billing).
- `frontend`: rota **`/politica/dossie/:nome`** (`DossieGroundedPage.jsx`).

---

## Invariantes

- Zero escrita em Firestore de produção para export (só leitura / export oficial).
- Kill-switch financeiro antes de cargas longas.
- Idempotência e dry-run obrigatório antes de gastar quota.

— Fim do índice — O texto integral do plano permanece na especificação interna / conversa de aprovação; atualizar este ficheiro quando mudar orçamento ou nomes de buckets.
