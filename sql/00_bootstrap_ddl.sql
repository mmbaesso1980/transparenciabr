-- Tabela Bruta de Emendas
CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.emendas` (
  codigoEmenda STRING,
  ano INT64,
  tipoEmenda STRING,
  nomeAutor STRING,
  codigoAutor STRING,
  localidadeDoGasto STRING,
  codigoFuncao STRING,
  nomeFuncao STRING,
  codigoSubfuncao STRING,
  nomeSubfuncao STRING,
  valorEmpenhado FLOAT64,
  valorLiquidado FLOAT64,
  valorPago FLOAT64,
  valorRestoInscrito FLOAT64,
  valorRestoCancelado FLOAT64,
  valorRestoPago FLOAT64
);

-- Tabela Staging para Alertas
CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.alertas_bodes_staging` (
  politico_id STRING,
  parlamentar_id STRING,
  tipo_risco STRING,
  mensagem STRING,
  severidade STRING,
  criticidade STRING,
  criado_em TIMESTAMP,
  fonte STRING,
  sincronizado_em TIMESTAMP
);

-- View Parlamentar Base Eleitoral
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_parlamentar_base_eleitoral` AS
SELECT
  codigoAutor AS parlamentar_id,
  nomeAutor AS nome_autor,
  localidadeDoGasto AS localidade,
  nomeFuncao AS funcao,
  nomeSubfuncao AS subfuncao,
  ano,
  SUM(valorEmpenhado) AS total_empenhado,
  SUM(valorPago) AS total_pago,
  COUNT(*) AS n_emendas
FROM `transparenciabr.transparenciabr.emendas`
WHERE codigoAutor IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6;

-- View Alertas Export
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_alertas_bodes_export` AS
SELECT * FROM `transparenciabr.transparenciabr.alertas_bodes_staging`
WHERE politico_id IS NOT NULL;
