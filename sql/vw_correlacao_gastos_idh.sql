-- Cruzamento: gastos CEAP por município × IDH municipal (Atlas PNUD — Base dos Dados).
-- Pré-requisito: popular codigo_ibge_municipio em transparenciabr.ceap_despesas.
--
-- Fonte IDH: basedosdados.br_undp_atlas_brasil.municipio (colunas típicas: id_municipio, ano, idhm)

CREATE OR REPLACE VIEW `transparenciabr.vw_correlacao_gastos_idh` AS
WITH gastos_muni AS (
  SELECT
    parlamentar_id,
    codigo_ibge_municipio,
    SUM(IFNULL(valor_documento, 0)) AS total_valor,
    COUNT(*) AS n_documentos,
    AVG(IFNULL(valor_documento, 0)) AS valor_medio_doc
  FROM `transparenciabr.ceap_despesas`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND TRIM(codigo_ibge_municipio) != ''
  GROUP BY parlamentar_id, codigo_ibge_municipio
),

atlas_last AS (
  SELECT
    SAFE_CAST(id_municipio AS STRING) AS codigo_ibge_municipio,
    idhm,
    ano
  FROM `basedosdados.br_undp_atlas_brasil.municipio`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id_municipio ORDER BY ano DESC) = 1
),

merged AS (
  SELECT
    g.parlamentar_id,
    g.codigo_ibge_municipio,
    g.total_valor,
    g.n_documentos,
    g.valor_medio_doc,
    a.idhm,
    a.ano AS ano_idh,
    CASE
      WHEN a.idhm IS NOT NULL AND a.idhm < 0.55 THEN TRUE
      ELSE FALSE
    END AS idh_muito_baixo
  FROM gastos_muni g
  LEFT JOIN atlas_last a
    ON g.codigo_ibge_municipio = a.codigo_ibge_municipio
),

ranked AS (
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY total_valor) AS pr_gasto_total
  FROM merged
)

SELECT
  parlamentar_id,
  codigo_ibge_municipio,
  total_valor,
  n_documentos,
  valor_medio_doc,
  idhm,
  ano_idh,
  idh_muito_baixo,
  pr_gasto_total,
  (
    idh_muito_baixo
    AND pr_gasto_total >= 0.80
  ) AS flag_gasto_elevado_idh_baixo,
  CURRENT_TIMESTAMP() AS audit_ts
FROM ranked;
