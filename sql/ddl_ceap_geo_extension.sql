-- Extensão idempotente para instalações criadas antes das colunas geográficas.
-- BigQuery: ADD COLUMN IF NOT EXISTS (Standard SQL).

ALTER TABLE `transparenciabr.ceap_despesas`
  ADD COLUMN IF NOT EXISTS codigo_ibge_municipio STRING OPTIONS(description='IBGE 7 dígitos');

ALTER TABLE `transparenciabr.ceap_despesas`
  ADD COLUMN IF NOT EXISTS municipio_nome STRING;
