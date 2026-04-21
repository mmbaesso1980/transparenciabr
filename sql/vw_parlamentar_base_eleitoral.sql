-- Cruzamento CEAP (emendas/despesas por município IBGE) × indicadores BD+.
-- Base para exportação agregada para Firestore (`politicos.contexto_socioeconomico`),
-- sem N+1 no cliente — popular via job de sincronização.

CREATE OR REPLACE VIEW `transparenciabr.vw_parlamentar_base_eleitoral` AS
WITH gastos AS (
  SELECT
    parlamentar_id,
    codigo_ibge_municipio,
    SUM(IFNULL(valor_documento, 0)) AS total_emendas_valor,
    COUNT(*) AS n_documentos
  FROM `transparenciabr.ceap_despesas`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND TRIM(codigo_ibge_municipio) != ''
  GROUP BY parlamentar_id, codigo_ibge_municipio
)

SELECT
  g.parlamentar_id,
  g.codigo_ibge_municipio,
  g.total_emendas_valor,
  g.n_documentos,
  v.nome_municipio,
  v.uf,
  v.populacao,
  v.ideb_anos_finais,
  v.indice_atendimento_esgoto,
  v.idh_municipal,
  v.leitos_por_habitante,
  SAFE_DIVIDE(g.total_emendas_valor, NULLIF(CAST(v.populacao AS FLOAT64), 0)) AS emendas_per_capita_aprox,
  CURRENT_TIMESTAMP() AS audit_ts
FROM gastos g
LEFT JOIN `transparenciabr.vw_indicadores_municipais` v
  ON g.codigo_ibge_municipio = v.id_municipio;
