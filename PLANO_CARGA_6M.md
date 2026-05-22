# Plano de carga real — ~6 milhões de indeferimentos INSS (motor AURORA)

**Projeto:** `transparenciabr`  
**Dataset:** `tbr_leads_prev`  
**Região BigQuery (obrigatória):** `southamerica-east1`  
**Tabela alvo:** `tbr_leads_prev.indeferimentos_brasil_raw`

---

## 1. Onde estão fisicamente os “6M”

- **Não há** ficheiros XLSX/CSV massivos versionados neste repositório (procura por `Beneficios_Indeferidos*.xlsx` devolveu 0 hits).
- A fonte **verificável** é o portal **dados.gov.br**, conjunto **“Benefícios indeferidos”**, com recursos mensais em XLSX.
- URL de download **pública** (padrão usado no motor `engines/26_inss_indeferimentos_bq_load.py`):

  `https://dados.gov.br/api/publico/conjuntos-dados/beneficios-indeferidos/recursos/download?recurso=beneficios-indeferidos-{YYYY-MM}`

  Exemplo: `...beneficios-indeferidos-2025-01` (substituir `YYYY-MM` por cada mês disponível).

- Página de referência do conjunto (pode responder 403 a crawlers; usar browser ou `curl` com `User-Agent` adequado):  
  `https://dados.gov.br/dados/conjuntos-dados/beneficios-indeferidos`

- **Bucket de staging** (`gs://tbr-leads-staging/`): pode conter cópias de scripts ou XLSX carregados manualmente — não é acessível a partir deste ambiente; use `gcloud storage ls gs://tbr-leads-staging/` na sua sessão autenticada para listar.

---

## 2. Porque `indeferimentos_brasil_raw` está a 0 linhas

Hipóteses consistentes com o código no repo:

1. **Nunca correu** a carga oficial (`engines/26_inss_indeferimentos_bq_load.py`) contra este projeto/tabela.
2. Jobs antigos correram com **região errada** (`US` em alguns clientes), falhando silenciosamente ou escrevendo noutro meta-dataset (improvável, mas motivo para alinhar `BQ_LOCATION`).
3. **`WRITE_TRUNCATE`** seguido de falha a meio deixou a tabela vazia.
4. **Schema** da tabela no BQ não coincide com o `BQ_SCHEMA` do motor 26 (loads falham no `job.result()`).

---

## 3. Schema esperado (carga oficial — motor 26)

Definido em `engines/26_inss_indeferimentos_bq_load.py` (`BQ_SCHEMA`):

| Coluna | Tipo |
|--------|------|
| `mes_referencia` | DATE (partição) |
| `cpf` | STRING |
| `dt_nascimento` | DATE |
| `sexo` | STRING |
| `uf` | STRING |
| `especie_codigo` | INTEGER |
| `especie_nome` | STRING |
| `motivo_indeferimento` | STRING |
| `dt_indeferimento` | DATE |
| `dt_der` | DATE |
| `clientela` | STRING |
| `forma_filiacao` | STRING |
| `ramo_atividade` | STRING |
| `aps_codigo` | INTEGER |
| `aps_nome` | STRING |
| `source_file` | STRING |
| `_row_hash` | STRING |
| `_loaded_at` | TIMESTAMP |

**Clustering** já definido no load: `uf`, `especie_codigo`.  
Para triagem por **município**, os microdados abertos costumam **não** trazer `municipio` direto; usa-se **`aps_nome`** como proxy geográfico (ver scripts de export).

**Nota de alinhamento:** `functions/src/leads/utils/bqLeadFetcher.js` espera campos como `id_hash`, `nome`, `municipio` — legado de outro desenho. Após carga via motor 26, é necessário **view** ou **evolução de schema** para unificar funis; não misturar MERGEs incompatíveis sem DDL.

---

## 4. Comando exacto de carga (recomendado)

### Opção A — Python (recomendado, chunked)

```bash
export GCP_PROJECT=transparenciabr
export BQ_LOCATION=southamerica-east1
pip install pandas google-cloud-bigquery openpyxl requests

python3 engines/26_inss_indeferimentos_bq_load.py \
  --project "$GCP_PROJECT" \
  --start 2024-01 \
  --end 2026-05 \
  --truncate-all
```

- Ajuste `--start` / `--end` ao intervalo realmente publicado no dados.gov.br.
- `--truncate-all` só na **primeira** carga completa controlada; depois use append incremental por mês.

### Opção B — Wrapper no repo

```bash
chmod +x scripts/carga_indef_real.sh
START=2024-01 END=2026-05 TRUNCATE=1 ./scripts/carga_indef_real.sh
```

### Opção C — XLSX locais + GCS (Cloud Shell / egress bloqueado)

1. Baixar manualmente os XLSX (mês a mês) para uma pasta.
2. `python3 engines/26_inss_indeferimentos_bq_load.py --local-dir ./xlsx_inss --truncate-all`

### Opção D — `bq load` (só após conversão para Parquet/CSV com cabeçalho mapeado)

Gerar ficheiro com colunas exactamente iguais ao `BQ_SCHEMA` e:

```bash
bq load --location=southamerica-east1 \
  --source_format=PARQUET \
  --replace \
  "transparenciabr:tbr_leads_prev.indeferimentos_brasil_raw" \
  ./indeferimentos.parquet
```

---

## 5. Particionamento e clustering (sugerido)

- **Partição:** `DATE(mes_referencia)` (já usada no motor 26 como campo `mes_referencia` DATE).
- **Clustering:** `uf`, `especie_codigo` (já aplicado no `LoadJobConfig` do motor 26).  
  Opcional futuro: adicionar `REGEXP_EXTRACT(aps_nome, ...)` como coluna derivada `municipio_proxy` e clusterizar se necessário.

---

## 6. Export por cidade (Vitória, Valinhos, Campinas, Belém)

Os microdados **não garantem** coluna `municipio`. O script `scripts/leads_por_cidade.sh` filtra:

- `UPPER(t.uf) = p_uf` (parâmetro `DECLARE`, sem ambiguidade com colunas)
- `LOWER(CAST(t.aps_nome AS STRING))` contém o *slug* normalizado (ex.: `vitoria`, `valinhos`, `campinas`, `belem`).

Export em lote (4 cidades-alvo): `chmod +x scripts/export_leads_cidades.sh && ./scripts/export_leads_cidades.sh` gera `leads_vitoria.csv`, `leads_valinhos.csv`, `leads_campinas.csv`, `leads_belem.csv` no diretório de saída (`OUT_DIR`, por omissão o raiz do repo).

Cabeçalho LGPD em comentários `#` no topo de cada CSV (art. 7º IX, art. 11 II g, descadastro).

---

## 7. Resumo Telegram (sem segredos no repo)

```bash
export TELEGRAM_BOT_TOKEN="…"
export TELEGRAM_CHAT_ID="…"
./scripts/telegram_aurora_resumo_carga.sh
```

O texto usa o prefixo **AURORA v3**. Anexos CSV: usar `curl -F chat_id=… -F document=@ficheiro` na API `sendDocument`, ou enviar manualmente após `scripts/export_leads_cidades.sh`.

---

## 8. Diagnóstico de logs GCP (executar na sua shell)

```bash
gcloud logging read \
  'resource.type="cloud_run_job" OR resource.type="cloud_function" 
   (textPayload=~"indef|inss|indeferimentos" OR jsonPayload.message=~"indef|inss")' \
  --project=transparenciabr --limit=50 --format=json
```

---

## 9. Script em staging (`carga_brasil_bq.py`)

Referenciado em `gs://tbr-leads-staging/scripts/` — **não** está no Git. Para comparar com o motor 26:

```bash
gcloud storage cp gs://tbr-leads-staging/scripts/carga_brasil_bq.py .
```

Validar se aponta para a mesma tabela/região/fonte; preferir **um** caminho canónico (motor 26 + `BQ_LOCATION`) para evitar divergências.
