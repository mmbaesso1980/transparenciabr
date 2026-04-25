-- View: vw_parlamentar_base_eleitoral
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_parlamentar_base_eleitoral` AS
SELECT
  CAST(e.cpfCnpjAutor AS STRING) AS parlamentar_id,
  e.autor AS parlamentar_nome,
  e.municipio AS nome_municipio,
  e.estado AS uf,
  CAST(NULL AS STRING) AS codigo_ibge_municipio,
  SUM(e.valorEmpenhado) AS total_emendas_valor,
  COUNT(*) AS n_documentos,
  AVG(e.valorEmpenhado) AS emendas_per_capita_aprox,
  NULL AS populacao,
  NULL AS idh_municipal,
  NULL AS ideb_anos_finais,
  NULL AS indice_atendimento_esgoto,
  NULL AS leitos_por_habitante
FROM `transparenciabr.transparenciabr.emendas` e
WHERE e.autor IS NOT NULL OR e.cpfCnpjAutor IS NOT NULL
GROUP BY 1,2,3,4,5;

-- Staging opcional para alertas BODES. Mantém a view criável mesmo antes de
-- qualquer engine popular alertas.
CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.alertas_bodes_staging` (
  politico_id STRING,
  tipo_risco STRING,
  mensagem STRING,
  severidade STRING,
  criado_em TIMESTAMP,
  fonte STRING
);

-- View: vw_alertas_bodes_export
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_alertas_bodes_export` AS
SELECT
  politico_id,
  tipo_risco,
  mensagem,
  severidade,
  criado_em,
  fonte
FROM `transparenciabr.transparenciabr.alertas_bodes_staging`
WHERE politico_id IS NOT NULL;
