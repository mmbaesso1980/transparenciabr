-- BigQuery ML — treino de série temporal por parlamentar (exemplo).
-- Execute após popular ceap_despesas. Ajuste datas e granularidade conforme volume.

-- 1) Agregar gasto diário (tabela de treino)
CREATE OR REPLACE TABLE `transparenciabr.ml_ceap_daily` AS
SELECT
  parlamentar_id AS series_id,
  data_emissao AS date_stamp,
  SUM(IFNULL(valor_documento, 0)) AS total_valor
FROM `transparenciabr.ceap_despesas`
GROUP BY parlamentar_id, data_emissao;

-- 2) Modelo ARIMA_PLUS por série (útil como baseline; custo depende do volume)
CREATE OR REPLACE MODEL `transparenciabr.model_ceap_anomaly`
OPTIONS(
  model_type = 'ARIMA_PLUS',
  time_series_timestamp_col = 'date_stamp',
  time_series_data_col = 'total_valor',
  time_series_id_col = 'series_id'
) AS
SELECT series_id, date_stamp, total_valor
FROM `transparenciabr.ml_ceap_daily`
WHERE date_stamp >= DATE_SUB(CURRENT_DATE(), INTERVAL 800 DAY);

-- 3) Detecção de anomalias via ML.DETECT_ANOMALIES (requer modelo treinado)
CREATE OR REPLACE VIEW `transparenciabr.vw_ceap_ml_anomalies` AS
SELECT *
FROM ML.DETECT_ANOMALIES(
  MODEL `transparenciabr.model_ceap_anomaly`,
  TABLE `transparenciabr.ml_ceap_daily`,
  STRUCT(0.95 AS anomaly_prob_threshold)
);

-- Picos atípicos restritos a anos com eleição geral federal (ajuste conforme calendário)
CREATE OR REPLACE VIEW `transparenciabr.vw_ceap_ml_anomalies_eleicoes` AS
SELECT *
FROM `transparenciabr.vw_ceap_ml_anomalies`
WHERE EXTRACT(YEAR FROM date_stamp) IN (2018, 2022, 2026, 2030);
