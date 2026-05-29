---
name: enrichment-pii-aurora
description: Operacionaliza o pipeline TransparênciaBR de enriquecimento PII (motor AURORA) para os 2.000 leads previdenciários do Carpes e os 150 leads ES qualificados. Cobre os 4 caminhos legais (A — DATAPREV/convênio INSS, B — Serasa/Quod bureau, C — landing /sou-indeferido com consentimento LGPD, D — petição-template DOCX). Use quando o Comandante Baesso pedir enriquecimento de leads, ativação do pipeline PII, deploy da função enrichment, troubleshoot do PR #230, ou geração/atualização de CSVs qualificados a partir do dataset tbr_leads_prev. Inclui inventário GCP auditado, schema BQ correto, regras LGPD, pendências de segurança e roteiro de deploy.
---

# enrichment-pii-aurora — Pipeline TransparênciaBR

Tom: INFORMATIVO, formal, "Comandante Baesso". Engine: **AURORA** (jamais Asmodeus/Goetia em produção). Regra absoluta: **apenas dados reais, verificáveis, sem mock, sem fake**.

## 1. Contexto auditado (22/mai/2026)

- Projeto GCP: `transparenciabr`
- Repo: `mmbaesso1980/transparenciabr`
- SA com Proprietário: `tbr-reader@transparenciabr.iam.gserviceaccount.com` (chave **comprometida** — rotacionar; criar `tbr-enricher`)
- **PR #229 MERGED** (telegram codebase AURORA — 21/mai)
- **PR #230 MERGED** (`feat(enrichment): pipeline PII A/B/C/D` — 22/mai 12:40 UTC) → bug `location: 'US'` corrigido via PR #231
- **PR #231 DRAFT** (`AURORA: BigQuery southamerica-east1, plano carga INSS 6M e scripts operacionais`) — branch `cursor/carga-indef-6M-real`, MERGEABLE/CLEAN, ainda não mergeado. Contém: `engines/26_inss_indeferimentos_bq_load.py`, `scripts/carga_indef_real.sh`, `scripts/export_leads_cidades.sh`, `scripts/leads_por_cidade.sh`, `scripts/telegram_aurora_resumo_carga.sh`, `functions/enrichment/utils/bqLocation.js`, `PLANO_CARGA_6M.md`

## 2. Inventário BigQuery (verdade dos dados)

### Região `southamerica-east1` — dataset `tbr_leads_prev`
| Tabela | Linhas | PII | Observação |
|---|---|---|---|
| `leads_carpes_2k_raw` | 2.000 | ❌ | Sociodemográfico + Gemini-classification (45 colunas, sem CPF/nome/contato) |
| `indeferimentos_brasil_raw` | **0** (até carga PR #231 rodar) | schema com `cpf STRING`, `dt_nascimento`, `aps_nome`, particionada por `mes_referencia`, clustering `uf, especie_codigo` | Tabela criada pelo motor 26 no primeiro load |
| `leads_finalizados` | 0 | schema com `cpf_mascarado`, `nome`, `celular`, `email`, `fonte_celular`, `confianca_celular` | Sink final |
| `leads_enriquecidos_log` | 0 | (auditoria) | — |

### Região `US` — datasets `transparenciabr`, `tbr_ceap`
- `vw_universo_pessoal_emendas` (282.938 linhas) tem `nome`+`cnpj`+`primeiro_contato`/`ultimo_contato` mas **são fornecedores de emendas**, não cidadãos INSS. Universo disjunto.
- `tcu_cadirreg` (0 linhas), `ceap_despesas` (617.563), `emendas` (32.183) — todas com PII de parlamentares/fornecedores.

### Cloud Storage — buckets reais (auditado VM 22/mai)
- `gs://datalake-tbr-raw/`: Câmara despesas, DOU checkpoints, Querido Diário por UF
- `gs://datalake-tbr-clean/`: `ceap_camara/year=2008..2026/clean.ndjson` + `ceap_classified/*.jsonl` + cópia do CSV Carpes em `demo_marco/`
- `gs://tbr-leads-staging/`: `demo_marco/leads_2k_carpes_gemma.csv` + `scripts/carga_brasil_bq.py` (legado, **não** é o motor 26)
- `gs://transparenciabr-datalake-raw/`: `saude/cnes` + `testes/ignicao`
- **Nenhum bucket contém os 6M XLSX INSS** — o usuário tinha lembrança equivocada; só a infra (motor 26 + tabela vazia) existia até 22/mai.

### ⚠️ Verdade INSS
"Indeferidos — Dados Abertos" é publicado **anônimo por desenho LGPD** (art. 6º minimização + art. 11 saúde). **Não há CPF na fonte oficial.** O motor 26 carrega o que existe (microdados sem PII direto, mas com `aps_nome` que serve de proxy geográfico). Caminhos de enriquecimento estão nos 4 conectores.

## 3. PR #230 — estrutura entregue

### Backend `functions/enrichment/`
- `orchestrator.js` — `AuroraEnricher` com estratégias `A|B|C|D|cascade`, timeout 30s, retry 1x backoff exponencial, logs JSON stdout (engine=AURORA, trace_id, connector, duration_ms)
- `connectors/_base.js` — classe abstrata
- `connectors/dataprev_oficial.js` — retorna **503 até `DATAPREV_ENABLED=true`**, TODO mTLS quando convênio firmar
- `connectors/serasa_quod.js` — circuit breaker `BUDGET_DIARIO_BRL`, cache 30d em `enrichment_cache`, custos em `enrichment_costs`, alerta Telegram via `TELEGRAM_ALERT_CHAT_ID` (chat_id Baesso: `643072695`) + secret `TELEGRAM_BOT_TOKEN`
- `connectors/consent_form.js` — valida CPF (algoritmo dígito), insere em `leads_finalizados` com `origem='consent_form'`
- `connectors/peticao_template.js` — `docxtemplater` + upload `gs://tbr-peticoes-geradas/{lead_id}/{ts}.docx`, signed URL 7d, registra em `peticoes_geradas`
- `lgpd/audit.js` — INSERT em `lgpd_audit_log` (cpf_hash + payload_hash, **CPF nunca em claro**); connectors exigem `ctx.lgpdAuditLogged` ou retornam **403**
- `lgpd/basis.js`, `lgpd/retention.js` — base legal + TTL 5 anos
- `sinks/bq_indeferimentos.js`, `sinks/bq_leads_finalizados.js` — MERGE idempotente por `_row_hash`/`lead_id`
- `index.js` — Gen2, exportada em `functions/index.js` como `enrichment` (us-central1), CORS manual, `POST /api/consent` e `POST /api/enrichment`
- `tests/` — `orchestrator.test.js` (cascade com mocks injetados), `lgpd.test.js`, `idempotency.test.js`. CPF de teste **apenas algorítmico válido**: `52998224725`. Rodar: `npm run test:enrichment`
- `utils/cpf.js`, `utils/cryptoHash.js`, `utils/secrets.js`
- `sql/schema_extensions.sql` — DDL completo (tabelas novas + ALTER TABLE)

### Frontend
- `frontend/src/pages/ConsentForm/ConsentForm.tsx` + `ConsentForm.module.css` (teal `#01696F`, DM Sans/Inter)
- API IBGE para UF/município, dropdown de espécies, checkbox LGPD obrigatório, POST `/api/consent`
- Rota `/sou-indeferido` registrada em `App.jsx`

### Infra
- `firebase.json`: rewrites `/api/consent` e `/api/enrichment` → função `enrichment`; CSP com `servicodados.ibge.gov.br`
- `infrastructure/pacts/carpes_dataprev_convenio.md` (modelo convênio)
- `infrastructure/pacts/serasa_quod_contrato.md` (checklist comercial)
- `templates/README.md` — instruções para subir DOCX real no GCS (sem binário no git)
- `@google-cloud/secret-manager` adicionado em `functions/package.json`

## 4. ✅ BUG `location: 'US'` CORRIGIDO no PR #231

Resolvido via `functions/enrichment/utils/bqLocation.js` que centraliza:
```js
location: process.env.BQ_LOCATION || 'southamerica-east1'
```
Usado em `sinks/bq_indeferimentos.js`, `sinks/bq_leads_finalizados.js`, `connectors/serasa_quod.js`, `bqLeadFetcher.js`. Sempre exportar `BQ_LOCATION=southamerica-east1` antes de rodar qualquer load/sink.

Datasets em `US` (`transparenciabr`, `tbr_ceap`) não são alvos do pipeline de enrichment.

## 5. Padrão de query BigQuery (referência operacional)

```python
call_external_tool(
  tool_name="google_cloud-run-query",
  source_id="google_cloud__pipedream",
  arguments={"query": "...", "location": "southamerica-east1"}
)
```

- Acentos em colunas exigem backticks: `` `forma_filiação` ``
- `__TABLES__` usa `table_id` (não `table_name`)
- Outputs grandes vão para `current_session_context/tool_calls/.../output_*.json` — extrair só campos necessários (cuidado: payload do conector vaza chave privada da SA, **nunca expor**)
- `INFORMATION_SCHEMA.TABLE_STORAGE` **não está habilitado**. Use `__TABLES__` ou ative com: `ALTER PROJECT transparenciabr SET OPTIONS ('region-southamerica-east1.enable_info_schema_storage' = TRUE)`
- Para tarefas mobile, a CLI `bq` na VM (via SSH IAP do app Google Cloud) é mais confiável que conector Pipedream

## 6. Os 150 leads ES qualificados

Arquivo entregue: `/home/user/workspace/leads_es_150_qualificados.csv` (47 KB, 160 linhas com header LGPD).

- Cobre 31 municípios: Serra (19), Cachoeiro (16), Vitória (14+4), Vila Velha (12), Cariacica (9), Guarapari (9), Mimoso do Sul (9) + outros
- 100% Auxílio Doença, motivo "Não Constatação Incapacidade Laborativa"
- Tese: "Ausência de prova robusta da incapacidade"
- Score detalhado + urgência Gemini-PRO
- **Sem PII** (sociodemográfico apenas). Para enriquecer com CPF/contato, ativar Caminho A/B/C.

### Header LGPD obrigatório no CSV
```
# TransparenciaBR - Sistema de Identificacao de Potenciais Direitos Previdenciarios
# Base legal: LGPD art. 7 IX (legitimo interesse) | art. 11 II g (saude quando aplicavel)
# Fonte: Dados Abertos INSS - tabela tbr_leads_prev.leads_carpes_2k_raw (qualificados pelo Gemini)
# Diagnostico final cabe exclusivamente ao advogado responsavel.
# Descadastro: contato@transparenciabr.com.br
```

### Distribuição UF da base 2k (referência)
- Paraná: 684 (679 qualificados)
- ES: 275 (274 qualificados) ← origem do CSV
- RS: 253 (242), GO: 226 (43), MS: 178 (63), CE: 51 (13), RN: 45 (44)
- SP: 288 (apenas 7 qualificados)
- **Pará/Belém: ZERO**

## 7. Deploy roteiro (o que o Comandante faz na GCP)

1. **Rodar SQL na região certa**:
   ```bash
   bq query --location=southamerica-east1 --use_legacy_sql=false < functions/enrichment/sql/schema_extensions.sql
   ```
2. **Criar SA nova** (não usar `tbr-reader` que teve chave exposta):
   ```bash
   gcloud iam service-accounts create tbr-enricher --display-name="Enrichment Pipeline"
   gcloud projects add-iam-policy-binding transparenciabr \
     --member=serviceAccount:tbr-enricher@transparenciabr.iam.gserviceaccount.com \
     --role=roles/bigquery.dataEditor
   gcloud projects add-iam-policy-binding transparenciabr \
     --member=serviceAccount:tbr-enricher@transparenciabr.iam.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   gcloud projects add-iam-policy-binding transparenciabr \
     --member=serviceAccount:tbr-enricher@transparenciabr.iam.gserviceaccount.com \
     --role=roles/storage.objectAdmin
   ```
3. **Configurar secrets**:
   ```bash
   echo -n "$BUREAU_API_KEY" | gcloud secrets create BUREAU_API_KEY --data-file=-
   echo -n "$BUREAU_API_KEY_QUOD" | gcloud secrets create BUREAU_API_KEY_QUOD --data-file=-
   echo -n "$NOVO_TELEGRAM_TOKEN" | gcloud secrets create TELEGRAM_BOT_TOKEN --data-file=-
   ```
4. **Env vars da função**:
   - `BUREAU_HTTP_BASE_URL` (URL do bureau escolhido)
   - `BUREAU_PROVIDER=serasa|quod`
   - `BUDGET_DIARIO_BRL=500`
   - `TELEGRAM_ALERT_CHAT_ID=643072695`
   - `BQ_LOCATION=southamerica-east1` (após o fix do bug)
   - `DATAPREV_ENABLED=false` (até convênio firmar)
5. **Fix do bug `location: 'US'`** (item 4 desta skill).
6. **Deploy**:
   ```bash
   firebase deploy --only functions:enrichment,hosting
   ```
7. **Smoke test**:
   ```bash
   curl -X POST https://us-central1-transparenciabr.cloudfunctions.net/enrichment \
     -H "Content-Type: application/json" \
     -d '{"lead_id":"smoke_001","strategy":"D","template_id":"auxilio_doenca_incapacidade_v1"}'
   ```
8. **Validar log LGPD**:
   ```sql
   SELECT * FROM `transparenciabr.tbr_leads_prev.lgpd_audit_log`
   WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
   ORDER BY timestamp DESC LIMIT 10;
   ```

## 8. Pendências de segurança (NÃO incluídas no repo — operacionais)

🔴 **GitHub PAT vazado** `[REDACTED-PAT-2026-05]` → revogar em https://github.com/settings/tokens
🔴 **Chave privada SA `tbr-reader`** vazou em outputs do conector Pipedream → gerar nova chave (IAM → SA → Keys → Add Key) e revogar a antiga
🟡 **Token Telegram** `8671845549:AAHJpkjvDFSYvCYC4VGu1Ja7kzjE3kuviL8` → rotacionar via `@BotFather /revoke` antes de subir a Secret
🟡 **Shodan key** `27kNbniSyTqvXXJungtIHu4mZIHD0fIL` → resetar em https://account.shodan.io

## 9. Caminhos de enriquecimento (4 estratégias)

| ID | Conector | Status | Custo | Quando usar |
|---|---|---|---|---|
| **A** | `dataprev_oficial.js` | 503 até convênio | R$ 0 | Quando OAB Carpes assinar convênio DATAPREV |
| **B** | `serasa_quod.js` | Pronto, aguarda credenciais | R$ 0,30–1,50/CPF | Volume rápido, decisão Serasa vs Quod |
| **C** | `consent_form.js` + `/sou-indeferido` | Pronto para deploy | R$ 0 | Auto-coleta com consentimento explícito |
| **D** | `peticao_template.js` | Pronto, falta DOCX no GCS | R$ 0 | Cliente chega ao escritório com CPF |

Estratégia recomendada **cascade**: A → B → C → fallback D.

## 10. Identificadores críticos (referência rápida)

- Projeto: `transparenciabr`
- **Chat ID Telegram Baesso CORRETO: `6483072695`** (8 dígitos — versões anteriores usavam `643072695` com 7 dígitos, **inválido**)
- Bot: `t.me/Asmodeuswebforgebot` (token `8671845549:AAHJpkjvDFSYvCYC4VGu1Ja7kzjE3kuviL8` — a rotacionar)
- Email: `mmbaesso@hotmail.com`
- VM principal: `tbr-mainframe-us-east1-d` (zona us-east1-d), user `manusalt13`
- Localização do user: Belém, Pará, BR
- Branch enrichment: merged via PR #230
- Branch carga 6M: `cursor/carga-indef-6M-real` (PR #231 draft)
- Direct Data token: `29AE5E97-AACF-4ACC-B0ED-692472D72D60` — endpoint correto `CadastroPessoaFisica`, schema `retorno.telefones[].telefoneComDDD`
- Datajud key: `cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==` (TJSP+TRF3, TJPA+TRF1, TJES+TRF2)

## 11. Carga 6M INSS — passos do PR #231 (NOVO 22/mai)

### Onde estão os 6M
**Não estão no projeto** — nunca foram baixados. A fonte é o portal `dados.gov.br`, conjunto "Benefícios indeferidos", recursos mensais XLSX. Endpoint do motor 26:
```
https://dados.gov.br/api/publico/conjuntos-dados/beneficios-indeferidos/recursos/download?recurso=beneficios-indeferidos-{YYYY-MM}
```
Nota: dados.gov.br costuma retornar **403 a User-Agents genéricos**. O motor 26 usa UA `TransparenciaBR-engines/1.0`. Se persistir 403, ir para Plano B (`--local-dir`).

### Comando único pra rodar na VM (SSH ativa)
```bash
cd ~ && \
  (git clone -b cursor/carga-indef-6M-real https://github.com/mmbaesso1980/transparenciabr.git \
    || (cd transparenciabr && git fetch origin && git checkout cursor/carga-indef-6M-real && git pull)) && \
  cd transparenciabr && \
  pip install -q pandas google-cloud-bigquery openpyxl requests && \
  chmod +x scripts/*.sh && \
  START=2025-01 END=2025-01 DRY_RUN=1 ./scripts/carga_indef_real.sh    # smoke 1 mês
```
Se smoke retornar linhas > 0, rodar carga real:
```bash
export GCP_PROJECT=transparenciabr BQ_LOCATION=southamerica-east1
START=2024-01 END=2026-04 TRUNCATE=1 ./scripts/carga_indef_real.sh 2>&1 | tee /tmp/carga_indef.log
OUT_DIR=./out ./scripts/export_leads_cidades.sh
TELEGRAM_BOT_TOKEN='8671845549:AAHJpkjvDFSYvCYC4VGu1Ja7kzjE3kuviL8' \
  TELEGRAM_CHAT_ID='6483072695' \
  OUT_DIR=./out ./scripts/telegram_aurora_resumo_carga.sh
```

### 🚨 BUG no `telegram_aurora_resumo_carga.sh` (linha do PARTS)
A branch contém uma aspa dupla extra que **rebenta o bash**:
```bash
PARTS="$(bq query ... | tail -n1 | tr -d '\r'")"
```
Fix antes de executar:
```bash
sed -i.bak "s/tr -d '\\\\r'\")/tr -d '\\\\r')/" scripts/telegram_aurora_resumo_carga.sh
```
Ou passar `PARTITION_RANGE='2024-01 … 2026-04'` por env para evitar o ramo defeituoso.

### Detalhes operacionais
- `leads_por_cidade.sh` filtra por `UPPER(uf) = p_uf AND STRPOS(LOWER(aps_nome), p_slug) > 0`, LIMIT 20 por cidade (consistente com pedido "podem ser 20 de cada")
- Slugs aceitos: `vitoria`, `valinhos`, `campinas`, `belem`. UFs: ES, SP, SP, PA
- Particionamento: por `mes_referencia` (DATE), clustering por `uf, especie_codigo`
- Chunk default no motor 26: 150.000 linhas (4 retries com backoff em download)
- Se a tabela `indeferimentos_brasil_raw` já existir com schema divergente, o `LoadJobConfig` falha — pode ser preciso `bq rm -f -t transparenciabr:tbr_leads_prev.indeferimentos_brasil_raw` antes do `--truncate-all`

### Script consolidado helper
`https://gist.github.com/mmbaesso1980/531617db19f93a7c2aa93152db581e44` (Gist privado com CMD_VM_CARGA_6M.sh; raw URL acessível sem auth)

## 12. Diretrizes para o agente

Quando o Comandante invocar esta skill:
1. Confirmar estado dos PRs `#230` (merged) e `#231` (draft/merged?) via `gh pr view {N} --repo mmbaesso1980/transparenciabr` (CLI com `api_credentials=["github"]`)
2. Validar antes de qualquer query BQ: dataset `tbr_leads_prev` está em **southamerica-east1**, datasets `transparenciabr`/`tbr_ceap` em **US**
3. Nunca expor outputs brutos do conector `google_cloud__pipedream` (vazam chave privada da SA `tbr-reader`)
4. Antes de qualquer enrichment real: garantir que `lgpd_audit_log` foi gravado no mesmo trace
5. CPF sempre via `utils/cryptoHash.js` (SHA256), nunca em claro nos logs
6. Tom: "Comandante Baesso", português formal, INFORMATIVO. Nunca acusatório
7. Engine: AURORA. Nunca Asmodeus/Goetia em outputs públicos ou código de produção
8. Para gerar CSVs qualificados a partir de novo recorte UF: copiar header LGPD da seção 6
9. Chat_id Telegram tem **8 dígitos**: `6483072695`. Não usar `643072695` (erro histórico)
10. Quando o Comandante estiver no celular, oferecer SSH via app Google Cloud (IAP) em vez de Termius — `gcloud compute ssh tbr-mainframe-us-east1-d --zone=us-east1-d --tunnel-through-iap`
11. Para colar comandos longos na VM via mobile: subir num Gist privado (`gh gist create`) e mandar `curl -sSL <raw_url> | bash`
12. dados.gov.br retorna **403** a UAs genéricos — verificar o `USER_AGENT` em `engines/26_inss_indeferimentos_bq_load.py` se download falhar
