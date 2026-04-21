-- Motor preditivo — tabelas de referência para cruzamento Emendas × Contratos × TCU CADIRREG.
-- `tcu_cadirreg` é repovoada por `engines/07_ingest_tcu_cadirreg.py` (WRITE_TRUNCATE via load job).
-- `emendas_parlamentares` e `contratos_publicos_municipio` são preenchidas por pipelines Portal/PNCP (EL).

CREATE TABLE IF NOT EXISTS `transparenciabr.tcu_cadirreg` (
  cpf_cnpj STRING NOT NULL OPTIONS(description='Somente dígitos; CPF 11 ou CNPJ 14'),
  nome STRING OPTIONS(description='Nome responsável ou razão social na base TCU'),
  data_transito_julgado DATE OPTIONS(description='Trânsito em julgado quando disponível'),
  ano_processo INT64,
  codigo_processo STRING,
  nome_responsavel_original STRING
)
CLUSTER BY cpf_cnpj;

CREATE TABLE IF NOT EXISTS `transparenciabr.emendas_parlamentares` (
  parlamentar_id STRING NOT NULL OPTIONS(description='Alinhado a politicos / CEAP'),
  codigo_ibge_municipio STRING NOT NULL,
  municipio_nome STRING,
  valor_emenda FLOAT64,
  ano INT64,
  fonte STRING,
  ingest_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(ingest_ts)
CLUSTER BY parlamentar_id, codigo_ibge_municipio;

CREATE TABLE IF NOT EXISTS `transparenciabr.contratos_publicos_municipio` (
  codigo_ibge_municipio STRING NOT NULL,
  cnpj_fornecedor STRING NOT NULL OPTIONS(description='CNPJ 14 dígitos'),
  nome_fornecedor STRING,
  valor_contrato FLOAT64,
  id_contrato STRING,
  ano INT64,
  fonte STRING,
  ingest_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(ingest_ts)
CLUSTER BY codigo_ibge_municipio, cnpj_fornecedor;
