-- Pré-requisito: tabela `transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw` com colunas
-- alinhadas à view (cpf, nome, uf, municipio, motivo_indeferimento, data_indeferimento,
-- categoria_potencial, status_filter). Ajuste nomes de colunas se o schema real divergir.
-- Ordem: tabelas primeiro; a view falha se a tabela base não existir.

-- Audit log
CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.leads_enriquecidos_log` (
  job_id STRING,
  lead_id STRING,
  evento STRING,
  detalhes STRING,
  custo_estimado_brl FLOAT64,
  timestamp TIMESTAMP
)
PARTITION BY DATE(timestamp)
OPTIONS (
  description = 'Audit log LGPD enriquecimentos via Telegram',
  partition_expiration_days = 180
);

-- Tabela final dos leads (saída do worker)
CREATE TABLE IF NOT EXISTS `transparenciabr.tbr_leads_prev.leads_finalizados` (
  job_id STRING,
  lead_id STRING,
  cpf_mascarado STRING,
  nome STRING,
  uf STRING,
  municipio STRING,
  categoria STRING,
  celular STRING,
  fonte_celular STRING,
  confianca_celular STRING,
  email STRING,
  score INT64,
  ticket_estimado_brl FLOAT64,
  status STRING,
  oab_solicitante STRING,
  csv_url STRING,
  gerado_em TIMESTAMP
)
PARTITION BY DATE(gerado_em);

-- View dos leads quentes (alimenta relatórios operacionais)
CREATE OR REPLACE VIEW `transparenciabr.tbr_leads_prev.leads_quentes_hoje` AS
SELECT
  cpf,
  nome,
  uf,
  municipio,
  motivo_indeferimento,
  data_indeferimento,
  categoria_potencial,
  CASE
    WHEN DATE_DIFF(CURRENT_DATE('America/Sao_Paulo'), DATE(data_indeferimento), DAY) <= 30 THEN 100
    WHEN DATE_DIFF(CURRENT_DATE('America/Sao_Paulo'), DATE(data_indeferimento), DAY) <= 90 THEN 80
    WHEN DATE_DIFF(CURRENT_DATE('America/Sao_Paulo'), DATE(data_indeferimento), DAY) <= 180 THEN 60
    ELSE 40
  END AS score,
  CASE categoria_potencial
    WHEN 'PCD_LC142' THEN 45000
    WHEN 'PESCADOR_DEFESO' THEN 18000
    WHEN 'RIBEIRINHO' THEN 32000
    WHEN 'INDIGENA' THEN 28000
    WHEN 'ANISTIADO_POLITICO' THEN 120000
    WHEN 'EX_COMBATENTE' THEN 65000
    ELSE 25000
  END AS ticket_estimado_brl,
  COALESCE(status_filter, 'NOVO') AS status_filter
FROM `transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw`
WHERE COALESCE(status_filter, 'NOVO') NOT IN ('PJE_ATIVO', 'JA_PROCESSADO_LEAD');
