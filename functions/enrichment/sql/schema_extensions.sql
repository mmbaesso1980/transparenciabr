-- Extensões LGPD + custos + cache + petições (executar no projeto transparenciabr, dataset tbr_leads_prev).
-- Localização típica do dataset: US (ajuste se o dataset estiver em southamerica-east1).

CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.lgpd_audit_log` (
  audit_id STRING NOT NULL,
  cpf_hash STRING NOT NULL,
  finalidade STRING NOT NULL,
  base_legal STRING NOT NULL,
  source_connector STRING NOT NULL,
  agent_user_id STRING,
  ip_origem STRING,
  timestamp TIMESTAMP NOT NULL,
  payload_hash STRING,
  ttl_dias INT64 DEFAULT 1825
)
PARTITION BY DATE(timestamp)
OPTIONS (description = 'Auditoria LGPD — motor AURORA');

CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.enrichment_costs` (
  cpf_hash STRING,
  produto STRING,
  custo_brl FLOAT64,
  timestamp TIMESTAMP
)
PARTITION BY DATE(timestamp);

CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.enrichment_cache` (
  cpf_hash STRING,
  produto STRING,
  response_json STRING,
  timestamp TIMESTAMP
)
PARTITION BY DATE(timestamp);

CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.peticoes_geradas` (
  audit_id STRING,
  lead_id STRING,
  template_id STRING,
  docx_gcs_uri STRING,
  docx_signed_url STRING,
  pdf_url STRING,
  created_at TIMESTAMP
)
PARTITION BY DATE(created_at);

-- Idempotência em indeferimentos (MERGE por _row_hash)
ALTER TABLE `transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw`
ADD COLUMN IF NOT EXISTS _row_hash STRING;

-- Campos adicionais em leads_finalizados (consentimento + rastreio)
ALTER TABLE `transparenciabr.tbr_leads_prev.leads_finalizados`
ADD COLUMN IF NOT EXISTS origem STRING;

ALTER TABLE `transparenciabr.tbr_leads_prev.leads_finalizados`
ADD COLUMN IF NOT EXISTS _consent_log_id STRING;

ALTER TABLE `transparenciabr.tbr_leads_prev.leads_finalizados`
ADD COLUMN IF NOT EXISTS _enrichment_path STRING;

ALTER TABLE `transparenciabr.tbr_leads_prev.leads_finalizados`
ADD COLUMN IF NOT EXISTS _cpf_hash STRING;
