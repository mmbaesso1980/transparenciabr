# 🌅 OPERAÇÃO AURORA — Missão Autônoma Overnight

**Comandante:** Marcelo Baesso (manusalt13@gmail.com)
**Data início:** 05/05/2026 23:00 BRT
**Data fim:** 06/05/2026 08:00 BRT (deadline lançamento)
**Repositório:** `mmbaesso1980/transparenciabr`
**Branch alvo:** `feat/aurora-ingest` (criar a partir de `main`)

---

## 🎯 OBJETIVO ÚNICO

Popular o banco de dados de `transparenciabr.com.br` com **dados completos suficientes para lançamento comercial amanhã 8h**, cobrindo:

1. **Câmara dos Deputados — CEAP histórico 2019-2026** (legislaturas 56 e 57 separadas)
2. **Senado Federal completo 2018-2026** (senadores, CEAPS, votações, discursos)
3. **Emendas Parlamentares com autoria identificada** (corrigir `cpfCnpjAutor` NULL)
4. **Flags de risco em emendas PIX** (shows caros em IDH baixo, esculturas vs educação, etc.)

---

## 🛡️ DIRETIVAS PERMANENTES (NÃO NEGOCIÁVEIS)

1. **ZERO dados vão pro Firestore.** Destino exclusivo: BigQuery `transparenciabr.*` + Vertex Datastore `tbr-fs2-*`.
2. **Toda nota é suspeita até prova contrária** — flags são INFORMATIVOS, nunca acusatórios.
3. **Não fazemos denúncia, apresentamos fatos** — toda mensagem deve ter disclaimer "Indícios quantitativos derivados de dados públicos. Não configuram ilícito nem substituem apuração oficial."
4. **Idempotência obrigatória:** todo script deve poder ser re-executado sem duplicar dados (checkpoint + dedup por `cod_documento` ou hash).
5. **Kill-switch billing:** se gasto Vertex/BQ ultrapassar **R$ 5.500** em 24h, ABORTAR todos os jobs e abrir issue no GitHub.
6. **Rate limit respeitado:** APIs públicas brasileiras têm limites não-documentados. Manter 5-8 req/s máximo.
7. **Legislaturas separadas:** dados de 2019-2022 (leg 56) e 2023-2026 (leg 57) ficam em colunas distintas. Coluna `legislatura` obrigatória em toda tabela nova.

---

## 📊 ESTADO ATUAL DO BANCO (baseline)

### BigQuery `transparenciabr` — populado
- `transparenciabr.ceap_despesas` — 617.563 linhas (anos 2023-2025) ✅
- `transparenciabr.emendas` — 32.183 linhas (2018-2024, **MAS `cpfCnpjAutor` NULL em 100%**) 🔴
- `transparenciabr.tbr_leads_prev.leads_carpes_2k_raw` — 2.000 linhas ✅
- `transparenciabr.transparenciabr.vw_benford_ceap_audit` — 6.654 linhas ✅
- `transparenciabr.transparenciabr.vw_ceap_zscore_roll` — 271.358 linhas ✅
- `transparenciabr.transparenciabr.vw_indicadores_municipais` — 5.571 municípios ✅
- `transparenciabr.transparenciabr.vw_parlamentar_base_eleitoral` — 8.198 linhas ✅

### Vertex Search Datastores — projeto `projeto-codex-br`
- 10 datastores `tbr-fs2-*` populados (45.191 docs) ✅
- 11 datastores `tbr-senado-*` / `tbr-camara-*` / `tbr-politica-*` **VAZIOS** 🔴

### Cloud Run Functions
- `getDossiePoliticoV2` — LIVE em https://getdossiepoliticov2-evkxdmnelq-uc.a.run.app
- `getDossiePoliticoV3` v2.0 — commitada (commit `6d7fa9d`), aguardando IAM BQ + redeploy

---

## 🚀 PLANO DE EXECUÇÃO — 4 JOBS PARALELOS

### JOB A — CEAP Backfill Câmara 2019-2022 (legislatura 56)
**Volume estimado:** ~600k notas (parte teve em 2023+, falta histórico anterior)
**Tempo:** 6-8h
**Custo:** R$ 0 (BQ insert + reindex Vertex grátis)

**Tarefas:**
1. Criar arquivo `scripts/job_a_ceap_backfill.py` com:
   - Busca deputados da legislatura 56 via `https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=56`
   - Para cada deputado × ano (2019, 2020, 2021, 2022), busca despesas via `/deputados/{id}/despesas?ano={ano}`
   - Rate limit: 0.13s entre requests (8 req/s)
   - Checkpoint em `/tmp/aurora_job_a_checkpoint.json` — SKIP (dep, ano) já processados
   - Insert em batches de 500 em `transparenciabr.transparenciabr.ceap_despesas`
   - Adicionar coluna `legislatura INT64` na tabela (ALTER TABLE) e popular com `56` para esses registros
2. ThreadPoolExecutor com 4 workers
3. Logs: `~/aurora_logs/job_a.log`
4. Ao terminar: trigger Vertex datastore reimport via API Discovery Engine

**Schema esperado em ceap_despesas (já existe):**
```
parlamentar_id STRING, autor STRING, ano INT64, mes INT64,
data_emissao DATE, tipo_despesa STRING, cod_documento STRING,
valor_documento FLOAT64, valor_glosa FLOAT64, valor_liquido FLOAT64,
fornecedor STRING, cnpj_cpf_fornecedor STRING, url_documento STRING,
codigo_ibge_municipio STRING, ingest_batch STRING, fetched_at TIMESTAMP,
legislatura INT64  -- NOVO, ALTER TABLE ADD COLUMN
```

---

### JOB B — Emendas Autoria Fix (CRÍTICO)
**Volume:** 32.183 emendas sem `cpfCnpjAutor`
**Tempo:** 3-4h
**Custo:** R$ 0 (Portal Transparência API gratuita após cadastro)

**Pré-requisito ANTES de rodar:**
- Comandante deve criar conta gratuita em https://www.portaldatransparencia.gov.br/api-de-dados/cadastrar-email
- Obter chave-api-dados
- Setar `export PORTAL_TRANSPARENCIA_KEY=xxxxx` antes do script

**Se chave não disponível, FALLBACK:**
- Cruzar tabela `emendas.codigoEmenda` com API SIOP via parser HTML
- Ou usar tabela auxiliar `basedosdados.br_camara_emendas.emendas` (acessível via BQ public dataset)

**Tarefas:**
1. Criar `scripts/job_b_emendas_autoria.py`
2. Estratégia primária: Portal Transparência API
3. Estratégia secundária (sem chave): JOIN com `basedosdados.br_camara_emendas.emendas` por `codigoEmenda`
4. Criar tabela `transparenciabr.transparenciabr.emendas_autores_fix` (staging)
5. UPDATE final em `emendas` populando `cpfCnpjAutor` e `autor`
6. Logs: `~/aurora_logs/job_b.log`

---

### JOB C — Senado Completo 8 Anos
**Volume estimado:** ~300k registros (senadores + CEAPS + votações + discursos)
**Tempo:** 10-12h
**Custo:** R$ 0 ingestão + ~R$ 200 reindex Vertex

**Tarefas:**
1. Criar `scripts/job_c_senado_completo.py`
2. Criar tabelas BQ:
   - `transparenciabr.transparenciabr.senadores` (cod_senador, nome, partido, uf, legislatura, em_exercicio, foto_url)
   - `transparenciabr.transparenciabr.senado_ceaps` (mesma estrutura ceap_despesas + casa='SENADO')
   - `transparenciabr.transparenciabr.senado_votacoes`
   - `transparenciabr.transparenciabr.senado_discursos`
3. APIs (DadosAbertos Senado):
   - Senadores leg 56: `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/56`
   - Senadores leg 57: `/senador/lista/legislatura/57`
   - CEAPS: `/senador/{cod}/despesas/{ano}` para anos 2018-2026
   - Votações: `/plenario/lista/votacao/{ano}` para anos 2018-2026
   - Discursos: `/senador/{cod}/discursos` (só leg 57 para caber no tempo)
4. Headers: `Accept: application/json` (DadosAbertos retorna XML por default; pedir JSON)
5. Rate limit: 0.2s (5 req/s)
6. Após terminar: criar/popular datastore Vertex `tbr-senado-completo` com export JSONL pra GCS bucket `gs://projeto-codex-br-vertex-import/senado/`
7. Logs: `~/aurora_logs/job_c.log`

---

### JOB D — Flags de Risco Emendas PIX × Diários
**Volume:** alvo ~5.000-15.000 flags de qualidade
**Tempo:** 4-6h
**Custo:** R$ 0 (cruza dados existentes)

**Tarefas:**
1. Criar `scripts/job_d_emendas_pix_diarios.py`
2. Criar tabela `transparenciabr.transparenciabr.flags_emendas_pix` (schema definido em `/home/user/workspace/aurora_pack/scripts/job_d_emendas_pix_diarios.py`)
3. Implementar 4 tipos de flags:
   - **FLAG 1 — SHOW_CARO_IDH_BAIXO:** emendas culturais > R$ 50k em municípios IDH < 0.65
   - **FLAG 2 — ESCULTURA_VS_EDUCACAO:** emendas com keyword "escultura/monumento/busto/estátua" + comparar com orçamento educação municipal (precisa view auxiliar)
   - **FLAG 3 — FORNECEDOR_RECORRENTE:** mesmo CNPJ recebendo emendas de >3 parlamentares diferentes em <12 meses
   - **FLAG 4 — INEXIGIBILIDADE_CRUZADA:** cruza `tbr-fs2-diarios-atos` (Vertex) com emendas do mesmo município no mesmo trimestre
4. Severidade: CRITICO (>R$ 500k), ALTO (>R$ 200k), MEDIO (>R$ 50k), INFORMATIVO (<R$ 50k)
5. Mensagem humana sempre com disclaimer
6. Logs: `~/aurora_logs/job_d.log`

---

## 🎼 ORQUESTRAÇÃO

Criar `scripts/aurora_orchestrator.sh` que:
1. `start`: dispara os 4 jobs em sessões `tmux` paralelas (`aurora_a`, `aurora_b`, `aurora_c`, `aurora_d`)
2. `monitor`: roda em loop verificando billing via `gcloud billing` a cada 5min; mata tudo se gasto > R$ 5.500
3. `status`: mostra estado das sessões + últimas 5 linhas de cada log
4. `kill`: encerra todas as sessões

Pré-requisitos do ambiente Jules/L4:
```bash
sudo apt-get install -y tmux
pip install google-cloud-bigquery requests xmltodict
gcloud auth application-default login  # ou usar SA queima-vertex
```

---

## 🔗 INTEGRAÇÃO COM CF v3 v2 (já commitada em 6d7fa9d)

Após dados ingeridos, CF v3 já consulta automaticamente as novas tabelas:
- `ceap_despesas` (com legislatura 56+57)
- `emendas` (com autoria preenchida)

Mas para Senado, **adicionar fan-out adicional** ao CF v3:
1. Editar `cloudrun/getDossiePoliticoV3/index.js`
2. Adicionar funções `getSenadoCEAPS()`, `getSenadoVotacoes()`, `getSenadoDiscursos()`
3. Incluir resultados no JSON de resposta sob chave `bigquery.senado.*`
4. Commit + push (Cloud Run "Deploy from source" reconstrói automático)

---

## 📋 GIT WORKFLOW

1. `git checkout -b feat/aurora-ingest`
2. Criar arquivos:
   - `scripts/job_a_ceap_backfill.py`
   - `scripts/job_b_emendas_autoria.py`
   - `scripts/job_c_senado_completo.py`
   - `scripts/job_d_emendas_pix_diarios.py`
   - `scripts/aurora_orchestrator.sh` (chmod +x)
   - `scripts/AURORA_README.md` (documentação)
   - `cloudrun/getDossiePoliticoV3/index.js` (atualizar com fan-out Senado)
3. Commits atômicos:
   - `feat(aurora): job A CEAP backfill leg 56`
   - `feat(aurora): job B emendas autoria fix`
   - `feat(aurora): job C Senado completo`
   - `feat(aurora): job D flags emendas PIX`
   - `feat(aurora): orchestrator + monitor`
   - `feat(cf-v3): fan-out Senado`
4. Push branch + abrir PR para `main` com label `aurora-overnight`
5. Comandante revisa de manhã e mergeia

---

## ✅ CRITÉRIOS DE ACEITE (manhã 8h)

Comandante valida com queries:

```sql
-- 1. CEAP cobre legislaturas 56 e 57
SELECT legislatura, EXTRACT(YEAR FROM data_emissao) ano, COUNT(*) n
FROM `transparenciabr.transparenciabr.ceap_despesas`
GROUP BY legislatura, ano ORDER BY legislatura, ano;
-- Esperado: linhas para 2019,2020,2021,2022,2023,2024,2025

-- 2. Emendas com autoria
SELECT COUNT(*) total, COUNTIF(cpfCnpjAutor IS NOT NULL) com_autor
FROM `transparenciabr.transparenciabr.emendas`;
-- Esperado: com_autor / total > 0.7

-- 3. Senado completo
SELECT 'senadores' tab, COUNT(*) n FROM `transparenciabr.transparenciabr.senadores`
UNION ALL
SELECT 'ceaps', COUNT(*) FROM `transparenciabr.transparenciabr.senado_ceaps`
UNION ALL
SELECT 'votacoes', COUNT(*) FROM `transparenciabr.transparenciabr.senado_votacoes`
UNION ALL
SELECT 'discursos', COUNT(*) FROM `transparenciabr.transparenciabr.senado_discursos`;
-- Esperado: senadores>200, ceaps>50k, votacoes>1000, discursos>5k

-- 4. Flags de risco
SELECT tipo_flag, severidade, COUNT(*) n
FROM `transparenciabr.transparenciabr.flags_emendas_pix`
GROUP BY 1,2 ORDER BY n DESC;
-- Esperado: pelo menos SHOW_CARO_IDH_BAIXO populado com 100+ flags
```

---

## 🚨 KILL-SWITCH MANUAL (caso de emergência)

Se Comandante precisar matar tudo:
```bash
ssh para a VM L4 ou abre tmux session
./scripts/aurora_orchestrator.sh kill
gcloud functions delete getDossiePoliticoV3 --project=projeto-codex-br --gen2
gcloud functions delete getDossiePoliticoV2 --project=projeto-codex-br --gen2
```

---

## 📞 COMUNICAÇÃO COM COMANDANTE

- A cada 2h, postar atualização no PR via `gh pr comment` com:
  - Job atual em execução
  - Total de registros inseridos por job
  - Estimativa de gasto Vertex/BQ
  - ETA para conclusão
- Em caso de erro fatal: abrir issue `aurora-emergencia` no repo e marcar `@mmbaesso1980`

---

## 🎯 OUTPUT FINAL (manhã 8h)

1. **Branch `feat/aurora-ingest` com PR aberto** contendo todos os scripts + atualizações CF v3
2. **Banco BQ populado** conforme critérios de aceite
3. **Vertex datastores `tbr-senado-*` populados**
4. **Tabela `flags_emendas_pix` com >1.000 alertas qualitativos**
5. **Resumo final em `/home/aurora_logs/RESUMO_FINAL.md`** com métricas, gastos, próximos passos

**Lançamento garantido pra 8h da manhã.**

---

**Assinado:** Diretiva Aurora — Operação Cirúrgica
**Comandante:** Marcelo Baesso
**Em caso de dúvida:** seguir diretivas permanentes acima e abrir issue.
