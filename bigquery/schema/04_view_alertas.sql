CREATE OR REPLACE VIEW `transparenciabr.fiscalizapa.vw_alertas_bodes_export` AS
SELECT
  id_parlamentar,
  casa,
  COUNT(*) AS qtd_alertas,
  MAX(severidade) AS severidade_max,
  ARRAY_AGG(DISTINCT tipo_alerta) AS tipos
FROM `transparenciabr.fiscalizapa.fato_alertas`
GROUP BY id_parlamentar, casa;
