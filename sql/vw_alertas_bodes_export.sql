-- Consolida alertas para Firestore. Requer vw_benford_ceap_audit, vw_ceap_zscore_roll e stg_gemini_alertas.

CREATE OR REPLACE VIEW `transparenciabr.vw_alertas_bodes_export` AS
SELECT
  parlamentar_id AS politico_id,
  CONCAT('benford_d', CAST(digito AS STRING)) AS tipo_risco,
  CONCAT(
    'Desvio Benford no dígito ',
    CAST(digito AS STRING),
    ': gap relativo ',
    CAST(ROUND(gap_relativo_pct, 2) AS STRING),
    '%'
  ) AS mensagem,
  'alta' AS severidade,
  audit_ts AS criado_em,
  'bigquery_benford' AS fonte
FROM `transparenciabr.vw_benford_ceap_audit`
WHERE flag_desvio_gt_30pct

UNION ALL

SELECT
  parlamentar_id AS politico_id,
  'zscore_gasto' AS tipo_risco,
  CONCAT('Pico atípico em ', CAST(data_emissao AS STRING)) AS mensagem,
  'alta' AS severidade,
  CURRENT_TIMESTAMP() AS criado_em,
  'bigquery_zscore' AS fonte
FROM `transparenciabr.vw_ceap_zscore_roll`
WHERE flag_outlier_z3

UNION ALL

SELECT
  parlamentar_id AS politico_id,
  IFNULL(tipo, 'analise_semantica') AS tipo_risco,
  texto AS mensagem,
  IFNULL(severidade, 'media') AS severidade,
  criado_em,
  'gemini' AS fonte
FROM `transparenciabr.stg_gemini_alertas`;
