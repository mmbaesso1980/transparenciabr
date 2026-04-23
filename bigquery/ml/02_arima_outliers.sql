CREATE OR REPLACE MODEL `transparenciabr.fiscalizapa.ml_ceap_anomaly`
OPTIONS(
  MODEL_TYPE='ARIMA_PLUS',
  TIME_SERIES_TIMESTAMP_COL='mes',
  TIME_SERIES_DATA_COL='total_gasto',
  TIME_SERIES_ID_COL='id_deputado'
) AS
SELECT
  DATE(ano, mes, 1) AS mes,
  id_deputado,
  SUM(valor_liquido) AS total_gasto
FROM `transparenciabr.fiscalizapa.fato_despesa_ceap`
GROUP BY mes, id_deputado;
