-- ════════════════════════════════════════════════════════════════════════
-- AURORA DEVASTADOR — DDL Billing Log + Views de Kill-Switch
-- ════════════════════════════════════════════════════════════════════════
-- Execute em transparenciabr antes de iniciar o orchestrator.
-- Toda chamada Vertex/DocAI/Gemini grava aqui. Monitor consulta a cada 5min.

-- 1) Tabela principal
CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.aurora_billing_log` (
  ts        TIMESTAMP NOT NULL,
  job       STRING    NOT NULL,
  cost_brl  FLOAT64   NOT NULL,
  units     INT64,
  note      STRING
)
PARTITION BY DATE(ts)
CLUSTER BY job;

-- 2) View de gasto consolidado por job (dashboard rápido)
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_aurora_gasto_por_job` AS
SELECT
  job,
  COUNT(*)            AS chamadas,
  SUM(units)          AS total_units,
  SUM(cost_brl)       AS total_brl,
  MIN(ts)             AS primeira_chamada,
  MAX(ts)             AS ultima_chamada
FROM `transparenciabr.transparenciabr.aurora_billing_log`
GROUP BY job
ORDER BY total_brl DESC;

-- 3) View de runrate hora a hora
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_aurora_runrate_horario` AS
SELECT
  TIMESTAMP_TRUNC(ts, HOUR) AS hora,
  job,
  SUM(cost_brl)             AS gasto_brl,
  SUM(units)                AS units
FROM `transparenciabr.transparenciabr.aurora_billing_log`
GROUP BY 1, 2
ORDER BY 1 DESC;

-- 4) Status global (single row)
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_aurora_status` AS
SELECT
  IFNULL(SUM(cost_brl), 0)                         AS gasto_total_brl,
  3000                                              AS soft_limit_brl,
  3500                                              AS hard_limit_brl,
  3500 - IFNULL(SUM(cost_brl), 0)                   AS folga_brl,
  COUNT(DISTINCT job)                               AS jobs_ativos,
  COUNT(*)                                          AS total_chamadas,
  MIN(ts)                                           AS aurora_iniciou,
  MAX(ts)                                           AS ultima_atividade
FROM `transparenciabr.transparenciabr.aurora_billing_log`;
