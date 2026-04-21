-- Desvio móvel (janela 180 dias) e outliers por Z-score nos gastos diários por parlamentar.
CREATE OR REPLACE VIEW `transparenciabr.vw_ceap_zscore_roll` AS
WITH daily AS (
  SELECT
    parlamentar_id,
    data_emissao,
    SUM(IFNULL(valor_documento, 0)) AS gasto_dia
  FROM `transparenciabr.ceap_despesas`
  GROUP BY parlamentar_id, data_emissao
),

rolls AS (
  SELECT
    parlamentar_id,
    data_emissao,
    gasto_dia,
    AVG(gasto_dia) OVER (
      PARTITION BY parlamentar_id
      ORDER BY UNIX_DATE(data_emissao)
      RANGE BETWEEN 179 PRECEDING AND CURRENT ROW
    ) AS mu_roll,
    STDDEV_POP(gasto_dia) OVER (
      PARTITION BY parlamentar_id
      ORDER BY UNIX_DATE(data_emissao)
      RANGE BETWEEN 179 PRECEDING AND CURRENT ROW
    ) AS sigma_roll
  FROM daily
)

SELECT
  parlamentar_id,
  data_emissao,
  gasto_dia,
  mu_roll,
  sigma_roll,
  SAFE_DIVIDE(gasto_dia - mu_roll, NULLIF(sigma_roll, 0)) AS zscore,
  CASE
    WHEN ABS(SAFE_DIVIDE(gasto_dia - mu_roll, NULLIF(sigma_roll, 0))) > 3 THEN TRUE
    ELSE FALSE
  END AS flag_outlier_z3
FROM rolls
WHERE sigma_roll IS NOT NULL;
