# AURORA DEVASTADOR — Instruções Comandante Baesso

**Risco aceito: R$ 3.000 · Hard kill: R$ 3.500 · Reserva: ≥ R$ 2.500**

Lançamento: 06/05/2026 — 08:00 BRT.

---

## ARQUITETURA DUAL-PROJECT

| Projeto | Papel |
|---|---|
| `transparenciabr` | BigQuery origem/destino (lake principal, billing log) |
| `projeto-codex-br` | Vertex AI, Document AI, Gemini, datastores (créditos vivem aqui) |

**Service Account única:** `queima-vertex@projeto-codex-br.iam.gserviceaccount.com`

---

## 5 PASSOS — EXECUTE NESTA ORDEM

### 1) Cadastrar API Portal Transparência (1 min)
Acesse [portaldatransparencia.gov.br/api-de-dados/cadastrar-email](https://www.portaldatransparencia.gov.br/api-de-dados/cadastrar-email) com `manusalt13@gmail.com`. Token chega no e-mail em ≤ 5 min. Guarde em `PORTAL_TRANSPARENCIA_KEY`.

### 2) IAM bindings cross-project (Cloud Shell, 30s)
```bash
gcloud projects add-iam-policy-binding transparenciabr \
  --member="serviceAccount:queima-vertex@projeto-codex-br.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding transparenciabr \
  --member="serviceAccount:queima-vertex@projeto-codex-br.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
```

### 3) Criar tabela billing_log + views (Cloud Shell, 10s)
```bash
bq --project_id=transparenciabr query --nouse_legacy_sql \
  < aurora_pack/sql/aurora_billing_log.sql
```

### 4) Abrir Jules e colar prompt (2 min)
Abra [jules.google.com](https://jules.google.com), conecte ao repo `mmbaesso1980/transparenciabr`, crie branch `feat/aurora-devastador`, e cole o conteúdo de **`PROMPT_JULES_DEVASTADOR.md`**.

Jules vai:
- Provisionar SA, baixar key local
- Subir scripts em `aurora_pack/scripts/` para Cloud Shell GCE
- Iniciar `aurora_orchestrator.sh start`
- Reportar status hora a hora via PR comments

### 5) Dormir 🌙
O monitor mata tudo automaticamente se gasto > R$ 3.500. Acompanhamento manual via:
```bash
bash aurora_pack/scripts/aurora_orchestrator.sh status
# ou attach na sessão
tmux attach -t aurora
```

---

## ESTRUTURA DO PACOTE

```
aurora_pack/
├── PROMPT_JULES_DEVASTADOR.md       ← prompt único (cole no Jules)
├── PROMPT_JULES_AURORA.md           ← versão conservadora (backup)
├── INSTRUCOES_COMANDANTE.md         ← este arquivo
├── scripts/
│   ├── aurora_orchestrator.sh       ← coordena 7 jobs em tmux
│   ├── job_a_ceap_backfill.py       ← leg 56 CEAP (R$ 0)
│   ├── job_b_emendas_autoria.py     ← fix cpfCnpjAutor (R$ 0)
│   ├── job_c_senado_completo.py     ← Senado 8 anos (R$ 200)
│   ├── job_d_emendas_pix_diarios.py ← flags PIX cruzadas (R$ 0)
│   ├── job_e_docai_batch_ceap.py    ← Document AI batch (R$ 1.200)
│   ├── job_f_embeddings_massa.py    ← text-embedding-005 (R$ 600)
│   └── job_g_dossie_grounded_massa.py ← Gemini grounded × 500 (R$ 800)
├── sql/
│   └── aurora_billing_log.sql       ← DDL + views
├── cf_v3/                           ← Cloud Function v3 reference
└── frontend/                        ← snippets de rota
```

---

## DEPENDÊNCIAS DOS JOBS

```
A (CEAP backfill)  ─┬─→ D (PIX×Diários) ─→ G (Dossiês 500)
B (Emendas autor)  ─┘                         ↑
C (Senado)        ─── (independente)          │
E (DocAI)         ─── (independente, aborta limpo se sem PDFs)
F (Embeddings)    ─── espera A                │
                                              └── espera D
```

O orchestrator gerencia essa fila com `tmux` + `grep "DONE ==="` em logs.

---

## ORÇAMENTO DETALHADO

| Job | Custo | Duração | Output |
|---|---|---|---|
| A — CEAP leg 56 | R$ 0 | 6-8 h | +600k linhas em `ceap_despesas` |
| B — Emendas autoria | R$ 0 | 3-4 h | 32k rows com `cpfCnpjAutor` populado |
| C — Senado completo | R$ 200 | 10-12 h | nova `senado_despesas` ~300k |
| D — Flags PIX | R$ 0 | 4-6 h | 5 tipos de alerta cruzados |
| E — Document AI | R$ 1.200 | 4-6 h | extrações em `ceap_docai_extractions` |
| F — Embeddings | R$ 600 | 8-10 h | 1.5M vetores 768d em `embeddings_unified` |
| G — Dossiês 500 | R$ 800 | 4-5 h | `dossie_pre_computed` (top 500) |
| **TOTAL** | **R$ 2.800** | overlap em paralelo | |
| Reserva | R$ 200 | — | folga para reprocesso |

---

## DECISÕES PERMANENTES (não revogar)

- ❌ **ZERO** dados em Firestore. Destino exclusivo: GCS + BigQuery.
- ✅ Toda nota é **suspeita até prova contrária** — output factual, nunca acusatório.
- ✅ Não fazemos denúncia — apresentamos fatos.
- ✅ ALLOW pré-aprovado para qualquer merge.
- ✅ Português formal/militar. Comandante Baesso.

---

## CONTATO DE EMERGÊNCIA

Se gasto chegar a R$ 3.000 antes de 05:00 BRT, monitor dispara `⚠️ ALERTA` no log. Em R$ 3.500, kill-switch automático mata sessão tmux.

Recuperação manual:
```bash
bash aurora_pack/scripts/aurora_orchestrator.sh stop
bash aurora_pack/scripts/aurora_orchestrator.sh status
```

Bom lançamento, Comandante.
