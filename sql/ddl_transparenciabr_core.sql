-- Dataset: transparenciabr
-- Criar no console ou: bq mk --dataset --location=US transparenciabr
--
-- Tabelas de staging (ingestão bruta)
-- Tabelas de fatos: particionamento por data + clusterização

CREATE TABLE IF NOT EXISTS `transparenciabr.staging_api_raw` (
  ingest_batch_id STRING,
  api_id STRING,
  source_url STRING,
  http_status INT64,
  payload_json STRING,
  fetched_at TIMESTAMP
)
PARTITION BY DATE(fetched_at)
CLUSTER BY api_id;

-- CEAP / despesas parlamentares (ajuste nomes de colunas ao pipeline real)
-- PARTITION + CLUSTER reduzem bytes lidos em consultas filtradas por data e por parlamentar/fornecedor.
CREATE TABLE IF NOT EXISTS `transparenciabr.ceap_despesas` (
  parlamentar_id STRING NOT NULL,
  nome_parlamentar STRING,
  cnpj_fornecedor STRING,
  nome_fornecedor STRING,
  uf_fornecedor STRING,
  codigo_ibge_municipio STRING OPTIONS(description='IBGE 7 dígitos — nexo municipal para correlação socioeconómica'),
  municipio_nome STRING,
  valor_documento FLOAT64,
  numero_documento STRING,
  tipo_despesa STRING,
  codigo_eleitoral STRING,
  data_emissao DATE,
  ingest_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY data_emissao
CLUSTER BY parlamentar_id, cnpj_fornecedor;

-- Saídas semânticas (Gemini / engines)
CREATE TABLE IF NOT EXISTS `transparenciabr.stg_gemini_alertas` (
  alert_id STRING,
  parlamentar_id STRING,
  tipo STRING,
  severidade STRING,
  texto STRING,
  modelo STRING,
  referencia_documento STRING,
  criado_em TIMESTAMP
)
PARTITION BY DATE(criado_em)
CLUSTER BY parlamentar_id;
