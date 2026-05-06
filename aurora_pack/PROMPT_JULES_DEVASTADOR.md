# 🔥 OPERAÇÃO AURORA DEVASTADOR — Missão Autônoma Overnight

**Comandante:** Marcelo Baesso (manusalt13@gmail.com)
**Data início:** 05/05/2026 23:30 BRT
**Data fim:** 06/05/2026 08:00 BRT (deadline lançamento comercial)
**Repositório:** `mmbaesso1980/transparenciabr`
**Branch alvo:** `feat/aurora-devastador` (criar a partir de `main`)

---

## ⚙️ ARQUITETURA DUAL-PROJECT (NÃO INVENTAR, JÁ ESTÁ ESTABELECIDA)

| Projeto GCP | Função | Por quê |
|---|---|---|
| `transparenciabr` | BigQuery (dados brutos, views, ETL) | Origem dos dados, schemas BQ existentes |
| `projeto-codex-br` | Vertex Search + Document AI + Gemini + Embeddings + Storage | **R$ 6.000 de crédito Vertex vivem aqui** |

**Service Account principal:** `queima-vertex@projeto-codex-br.iam.gserviceaccount.com`
- Já tem acesso cross-project ao BQ `transparenciabr` (Comandante aplicou IAM bindings)
- Roda Cloud Functions, Document AI batches, Vertex Search ingest

**GCS buckets:**
- `gs://projeto-codex-br-vertex-import/` — JSONLs para import Vertex
- `gs://projeto-codex-br-docai-input/` — PDFs entrada Document AI
- `gs://projeto-codex-br-docai-output/` — JSONs estruturados saída DocAI

Se algum bucket não existir, **crie em `projeto-codex-br` com location `us-central1`**.

---

## 🎯 OBJETIVO ÚNICO

Em 8 horas, queimar **R$ 3.000 dos R$ 6.000** disponíveis em **queima útil** (não desperdício), populando o sistema com dados completos suficientes para lançamento comercial às 8h.

**Risco aceito pelo Comandante:** R$ 3.000.
**Hard kill-switch:** R$ 3.500 (12% buffer de segurança).
**Reserva obrigatória pós-operação:** R$ 2.500 mínimo.

---

## 🛡️ DIRETIVAS PERMANENTES

1. **ZERO dados vão pro Firestore.** Destino: BQ `transparenciabr.*` + Vertex Datastores `projeto-codex-br/tbr-*`.
2. **Toda nota é suspeita até prova contrária** — flags são INFORMATIVAS, nunca acusatórias.
3. **Não fazemos denúncia, apresentamos fatos.** Disclaimer obrigatório em toda saída humanizada: *"Indícios quantitativos derivados de dados públicos. Não configuram ilícito nem substituem apuração oficial."*
4. **Idempotência total:** todo script roda múltiplas vezes sem duplicar (checkpoint + dedup por chave natural).
5. **Hard kill-switch billing:** monitor a cada 5min. Se gasto > R$ 3.500, mata todos os jobs e abre issue `aurora-emergencia`.
6. **Rate limit:** APIs públicas BR têm limites não-documentados. Manter 5-8 req/s.
7. **Legislaturas separadas:** dados leg 56 (2019-2022) e leg 57 (2023-2026) com coluna `legislatura INT64` obrigatória.
8. **Toda chamada Vertex/DocAI/Gemini** logada em `transparenciabr.transparenciabr.aurora_billing_log` com timestamp, projeto, custo estimado, payload size.

---

## 📊 ESTADO ATUAL (baseline confirmada por queries reais)

### BigQuery `transparenciabr` (dados brutos)
| Tabela/View | Linhas | Status |
|---|---|---|
| `transparenciabr.ceap_despesas` | 617.563 (2023-2025 só) | 🟡 Falta leg 56 |
| `transparenciabr.emendas` | 32.183 (2018-2024) | 🔴 cpfCnpjAutor NULL 100% |
| `transparenciabr.vw_benford_ceap_audit` | 6.654 | ✅ |
| `transparenciabr.vw_ceap_zscore_roll` | 271.358 | ✅ |
| `transparenciabr.vw_indicadores_municipais` | 5.571 | ✅ |
| `transparenciabr.vw_parlamentar_base_eleitoral` | 8.198 | ✅ |
| `tbr_leads_prev.leads_carpes_2k_raw` | 2.000 | ✅ |

### Vertex Search Datastores `projeto-codex-br`
| Datastore | Docs | Status |
|---|---|---|
| 10× `tbr-fs2-*` | 45.191 | ✅ Populados, espelham Firestore |
| 11× `tbr-senado-*`, `tbr-camara-*`, `tbr-politica-*` | 0 | 🔴 VAZIOS |

### Cloud Run Functions `projeto-codex-br`
- `getDossiePoliticoV2` LIVE: https://getdossiepoliticov2-evkxdmnelq-uc.a.run.app
- `getDossiePoliticoV3` v2.0 commitada (commit `6d7fa9d`), aguarda IAM BQ + redeploy

---

## 🔥 PLANO DE ATAQUE — 7 JOBS PARALELOS

### JOB A — CEAP Backfill Câmara Legislatura 56 (2019-2022)
**Projeto:** `transparenciabr` (BQ insert)
**Volume estimado:** ~600k notas
**Tempo:** 6-8h
**Custo:** R$ 0 (API pública gratuita + BQ insert)

**Implementação:**
1. Criar `scripts/job_a_ceap_backfill.py` (template em `aurora_pack/scripts/job_a_ceap_backfill.py`)
2. ALTER TABLE `transparenciabr.transparenciabr.ceap_despesas` ADD COLUMN IF NOT EXISTS `legislatura INT64`
3. Deputados leg 56: `https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=56`
4. Despesas: `/deputados/{id}/despesas?ano={ano}` para anos [2019, 2020, 2021, 2022]
5. Rate: 0.13s (8 req/s), ThreadPool 4 workers
6. Checkpoint: `/tmp/aurora_job_a_checkpoint.json`
7. Logs: `~/aurora_logs/job_a.log`
8. Ao terminar: trigger reindex datastore `tbr-fs2-ceap-leg56` (criar novo datastore se não existir)

---

### JOB B — Emendas Autoria Fix (CRÍTICO PARA PROMESSA DO SITE)
**Projeto:** `transparenciabr` (BQ update)
**Volume:** 32.183 emendas sem `cpfCnpjAutor`
**Tempo:** 3-4h
**Custo:** R$ 0

**Pré-requisito ENV:**
```bash
export PORTAL_TRANSPARENCIA_KEY=<chave_obtida_em_https://www.portaldatransparencia.gov.br/api-de-dados/cadastrar-email>
```

**Estratégia primária:** Portal Transparência API
**Fallback se sem chave:** JOIN com `basedosdados.br_camara_emendas.emendas` (BQ public dataset)

**Implementação:**
1. Criar `scripts/job_b_emendas_autoria.py`
2. Tabela staging `transparenciabr.transparenciabr.emendas_autores_fix`
3. UPDATE original em batch
4. Validação: `COUNTIF(cpfCnpjAutor IS NOT NULL) / COUNT(*) > 0.7`

---

### JOB C — Senado Federal Completo 2018-2026
**Projeto:** `transparenciabr` (BQ) + `projeto-codex-br` (Vertex datastore novo)
**Volume estimado:** ~300k registros (250 senadores + 80k CEAPS + 1.5k votações + 8k discursos)
**Tempo:** 10-12h
**Custo:** R$ 0 ingestão + ~R$ 200 Vertex reindex

**Implementação:**
1. Criar `scripts/job_c_senado_completo.py`
2. Criar 4 tabelas BQ em `transparenciabr.transparenciabr.*`:
   - `senadores`, `senado_ceaps`, `senado_votacoes`, `senado_discursos`
3. APIs DadosAbertos Senado (header `Accept: application/json`):
   - Senadores leg 56/57: `/senador/lista/legislatura/{leg}`
   - CEAPS: `/senador/{cod}/despesas/{ano}`
   - Votações: `/plenario/lista/votacao/{ano}`
   - Discursos: `/senador/{cod}/discursos`
4. Após terminar:
   - Export JSONL pra `gs://projeto-codex-br-vertex-import/senado/`
   - Criar datastore `tbr-senado-completo` em `projeto-codex-br`
   - Importar via API Discovery Engine
5. Rate: 0.2s (5 req/s)

---

### JOB D — Flags de Risco Emendas PIX × Diários (DIFERENCIAL DO PRODUTO)
**Projeto:** `transparenciabr` (BQ) + `projeto-codex-br` (queries Vertex pra diários)
**Volume alvo:** 5k-15k flags qualitativas
**Tempo:** 4-6h
**Custo:** R$ 0

**Implementação:**
1. Criar `scripts/job_d_flags_emendas_pix.py`
2. Tabela `transparenciabr.transparenciabr.flags_emendas_pix`
3. Implementar 5 tipos de flags:
   - **FLAG 1 — SHOW_CARO_IDH_BAIXO:** emenda cultural >R$ 50k em município IDH < 0.65
   - **FLAG 2 — ESCULTURA_VS_EDUCACAO:** keyword "escultura/monumento/busto/estátua" + valor > orçamento educação municipal × 0.5
   - **FLAG 3 — FORNECEDOR_RECORRENTE:** mesmo CNPJ recebendo emendas de >3 parlamentares em <12 meses
   - **FLAG 4 — INEXIGIBILIDADE_CRUZADA:** cruza Vertex `tbr-fs2-diarios-atos` (keyword inexigibilidade) com emendas mesma cidade mesmo trimestre
   - **FLAG 5 — BENFORD_VIOLATION:** parlamentares com chi-squared > 50 em `vw_benford_ceap_audit` (distribuição não natural de dígitos)
4. Severidade: CRÍTICO/ALTO/MÉDIO/INFORMATIVO
5. Mensagem humanizada com disclaimer obrigatório

---

### JOB E — Document AI Batch CEAP Histórico (QUEIMA ÚTIL #1)
**Projeto:** `projeto-codex-br` (Document AI processor)
**Volume:** processar PDFs originais CEAP que estão em `gs://projeto-codex-br-vertex-import/ceap/raw/`
**Tempo:** 4-6h (batch async)
**Custo orçado:** R$ 1.200

**Pré-condição:** verificar se há PDFs em `gs://projeto-codex-br-vertex-import/ceap/raw/`. Se vazio, **PULAR ESTE JOB** e realocar R$ 1.200 para Job F (Embeddings).

**Implementação:**
1. Criar `scripts/job_e_docai_batch_ceap.py`
2. Verificar bucket: `gsutil ls gs://projeto-codex-br-vertex-import/ceap/raw/ | wc -l`
3. Se >0 arquivos:
   - Criar processor Document AI tipo `EXPENSE_PROCESSOR` ou `FORM_PARSER` em `projeto-codex-br/us`
   - Disparar batch process: input `gs://.../ceap/raw/`, output `gs://.../ceap/parsed/`
   - Volume max por batch: 1.000 PDFs (Document AI tem limite)
   - Loopar até processar tudo
4. Após batch concluir:
   - Importar JSONs estruturados pra BQ `transparenciabr.transparenciabr.ceap_docai_estruturado`
   - Reindexar no Vertex datastore `tbr-fs2-ceap-docai`
5. Custo logado em `aurora_billing_log`

---

### JOB F — Embeddings Vertex em Massa (QUEIMA ÚTIL #2)
**Projeto:** `projeto-codex-br` (Vertex AI Platform — text-embedding-005)
**Volume:** 1.5M textos (discursos Senado + diários + dossiês existentes)
**Tempo:** 8-10h
**Custo orçado:** R$ 600

**Implementação:**
1. Criar `scripts/job_f_embeddings_massa.py`
2. Sources de texto:
   - `senado_discursos.sumario` (~8k)
   - `tbr-fs2-diarios-atos` `trecho_ato` (~12.6k)
   - CEAP `tipo_despesa + fornecedor + tipo_documento` concatenados (~617k)
   - Emendas `descricao + funcao + subfuncao` (~32k)
3. API: `text-embedding-005` (768 dim, otimizado pt-BR)
4. Batch size: 250 textos por chamada
5. Salvar embeddings em `transparenciabr.transparenciabr.aurora_embeddings`:
   ```sql
   CREATE TABLE aurora_embeddings (
     source_table STRING, source_id STRING,
     text_input STRING, embedding ARRAY<FLOAT64>,
     model STRING, created_at TIMESTAMP
   )
   ```
6. Após terminar: criar índice vetorial BQ pra busca semântica:
   ```sql
   CREATE OR REPLACE VECTOR INDEX aurora_idx
   ON aurora_embeddings(embedding)
   OPTIONS(distance_type='COSINE', index_type='IVF')
   ```

---

### JOB G — Gemini Grounded Pré-Computar Dossiês Top (QUEIMA ÚTIL #3)
**Projeto:** `projeto-codex-br` (Vertex AI — Gemini 2.0 Flash + Grounding)
**Volume:** 500 dossiês top (deputados + senadores mais consultados ou de maior gasto)
**Tempo:** 4-5h
**Custo orçado:** R$ 800

**Implementação:**
1. Criar `scripts/job_g_dossie_grounded_massa.py`
2. Selecionar 500 alvos:
   ```sql
   -- Top 250 deputados por gasto CEAP
   SELECT parlamentar_id, autor, SUM(valor_documento) total
   FROM ceap_despesas
   GROUP BY 1,2 ORDER BY total DESC LIMIT 250
   UNION ALL
   -- Top 250 senadores
   SELECT parlamentar_id, autor, SUM(valor_documento) total
   FROM senado_ceaps
   GROUP BY 1,2 ORDER BY total DESC LIMIT 250
   ```
3. Para cada alvo, chamar `getDossiePoliticoV3` (já deployada) com query=nome
4. Salvar resposta em `transparenciabr.transparenciabr.dossies_pre_computados`:
   ```sql
   CREATE TABLE dossies_pre_computados (
     parlamentar_id STRING, parlamentar_nome STRING,
     dossie_json JSON, gemini_synthesis STRING,
     vertex_evidencias_count INT64, bq_data_summary STRING,
     custo_estimado_brl FLOAT64, generated_at TIMESTAMP,
     ttl_horas INT64 DEFAULT 24
   )
   ```
5. Cache TTL 24h: dossiês expiram, refeitos sob demanda
6. Frontend lê primeiro do cache, fallback pra CF v3 ao vivo

---

### JOB H (orchestrator) — Coordenação + Monitor + Kill-Switch
**Projeto:** Local (L4 GPU ou Jules VM)

**Implementação:**
1. Criar `scripts/aurora_orchestrator.sh` (template em pacote)
2. Disparar A, B, C, D em paralelo via tmux (4 sessões)
3. Após A+C concluírem: disparar E (Document AI depende de PDFs raw)
4. Após A+C+D concluírem: disparar F (embeddings precisa de textos prontos)
5. Após F concluir: disparar G (Gemini Grounded usa embeddings pra context retrieval)
6. **Monitor billing:** query a cada 5min em `transparenciabr.transparenciabr.aurora_billing_log`:
   ```sql
   SELECT SUM(custo_estimado_brl) FROM aurora_billing_log
   WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
   ```
   Se > R$ 3.500: kill all + issue
7. Status report a cada 2h via `gh pr comment`

---

## 📋 GIT WORKFLOW

```bash
git checkout -b feat/aurora-devastador main
# Criar todos os scripts
git add scripts/job_*.py scripts/aurora_orchestrator.sh
git commit -m "feat(aurora): jobs A-H devastador overnight"
# Atualizar CF v3 com fan-out Senado
git add cloudrun/getDossiePoliticoV3/index.js
git commit -m "feat(cf-v3): fan-out Senado + cache dossies pre-computados"
git push origin feat/aurora-devastador
gh pr create --title "Aurora Devastador overnight" --label "aurora-overnight" --body "Ver PROMPT_JULES_DEVASTADOR.md"
```

Após push, **DISPARAR** orchestrator no ambiente Jules:
```bash
chmod +x scripts/aurora_orchestrator.sh
./scripts/aurora_orchestrator.sh start
```

---

## ✅ CRITÉRIOS DE ACEITE (validar 8h)

```sql
-- 1. CEAP cobre legislaturas 56 e 57
SELECT legislatura, EXTRACT(YEAR FROM data_emissao) ano, COUNT(*) n
FROM `transparenciabr.transparenciabr.ceap_despesas`
GROUP BY 1,2 ORDER BY 1,2;
-- Esperado: 2019-2025 todos populados

-- 2. Emendas com autoria
SELECT COUNTIF(cpfCnpjAutor IS NOT NULL) / COUNT(*) pct_com_autor
FROM `transparenciabr.transparenciabr.emendas`;
-- Esperado: > 0.7

-- 3. Senado completo
SELECT 'senadores', COUNT(*) FROM senadores
UNION ALL SELECT 'ceaps', COUNT(*) FROM senado_ceaps
UNION ALL SELECT 'votacoes', COUNT(*) FROM senado_votacoes
UNION ALL SELECT 'discursos', COUNT(*) FROM senado_discursos;
-- Esperado: senadores>200, ceaps>50k, votacoes>1k, discursos>5k

-- 4. Flags PIX
SELECT tipo_flag, severidade, COUNT(*) FROM flags_emendas_pix GROUP BY 1,2;
-- Esperado: 5 tipos de flag, total >1k linhas

-- 5. DocAI estruturado
SELECT COUNT(*) FROM ceap_docai_estruturado;
-- Esperado: >100k (se PDFs raw existirem)

-- 6. Embeddings massa
SELECT source_table, COUNT(*) FROM aurora_embeddings GROUP BY 1;
-- Esperado: 4 sources, total >500k embeddings

-- 7. Dossiês pré-computados
SELECT COUNT(*) FROM dossies_pre_computados;
-- Esperado: 500

-- 8. Billing total
SELECT SUM(custo_estimado_brl) total_brl FROM aurora_billing_log
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);
-- Esperado: 2500-3500 (faixa segura)
```

---

## 🚨 PROTOCOLO DE EMERGÊNCIA

### Cenário 1: Job estoura rate limit API
- Backoff exponencial 5x antes de desistir
- Log warning, continua próximo registro
- Checkpoint salva onde parou

### Cenário 2: Custo passa R$ 3.500
- Orchestrator mata todos os jobs imediatamente
- `tmux kill-session -t aurora_*`
- Abre issue `aurora-emergencia` no repo, marca @mmbaesso1980
- Salva relatório de gasto detalhado

### Cenário 3: Document AI processor não existe
- Pula Job E
- Realoca R$ 1.200 → expande Job F (mais embeddings) ou Job G (mais dossiês)
- Documenta no log

### Cenário 4: Erro de IAM cross-project
- Tenta usar SA `queima-vertex@projeto-codex-br` em todos jobs
- Se ainda falhar, abre issue e pausa job afetado

---

## 📞 COMUNICAÇÃO COM COMANDANTE

A cada 2h, postar comment no PR via `gh pr comment` com:

```markdown
## Aurora Status — HH:MM

### Jobs em execução
- [✅/⏳/❌] Job A — CEAP Backfill leg 56: X/600k notas inseridas
- [✅/⏳/❌] Job B — Emendas autoria: X/32k corrigidas
- [✅/⏳/❌] Job C — Senado: senadores=X, ceaps=X, vot=X, disc=X
- [✅/⏳/❌] Job D — Flags PIX: X flags geradas
- [✅/⏳/❌] Job E — DocAI: X PDFs processados
- [✅/⏳/❌] Job F — Embeddings: X gerados
- [✅/⏳/❌] Job G — Dossiês: X/500 pré-computados

### Billing
- Custo até agora: R$ XXX
- Projeção até 8h: R$ XXX
- Buffer restante: R$ (3500 - atual)

### Próximas 2h
- [ação prevista]
```

---

## 🎯 OUTPUT FINAL ESPERADO (8h)

1. **Branch `feat/aurora-devastador`** com PR aberto, label `aurora-overnight`
2. **Banco BQ populado** conforme 8 critérios de aceite
3. **3 datastores Vertex novos:** `tbr-fs2-ceap-leg56`, `tbr-senado-completo`, `tbr-fs2-ceap-docai`
4. **500 dossiês pré-computados** em cache 24h
5. **5k-15k flags qualitativas** prontas pra UI
6. **>500k embeddings** pra busca semântica
7. **Custo total:** R$ 2.500-3.500
8. **Crédito restante:** ≥ R$ 2.500

**Lançamento comercial garantido pra 8h.**

---

**Assinado:** Diretiva Aurora Devastador
**Comandante:** Marcelo Baesso
**Risco aceito:** R$ 3.000
**Hard cap:** R$ 3.500
**Em caso de dúvida:** seguir diretivas permanentes acima e abrir issue antes de gastar.
