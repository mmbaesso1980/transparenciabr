-- Oportunidades de mercado: caixa municipal aproximada (emendas cadastradas) × intenção de compra (PCA agregado).
-- Requer: emendas_parlamentares, pncp_pca_itens, vw_indicadores_municipais.

CREATE OR REPLACE VIEW `transparenciabr.vw_oportunidades_mercado` AS
WITH em AS (
  SELECT
    codigo_ibge_municipio,
    SUM(IFNULL(valor_emenda, 0)) AS total_emendas_municipio
  FROM `transparenciabr.emendas_parlamentares`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND TRIM(codigo_ibge_municipio) != ''
  GROUP BY 1
),
pca AS (
  SELECT
    codigo_ibge_municipio,
    SUM(
      IFNULL(quantidade_estimada, 0) * IFNULL(valor_unitario_estimado, 0)
    ) AS valor_estimado_pca
  FROM `transparenciabr.pncp_pca_itens`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND TRIM(codigo_ibge_municipio) != ''
  GROUP BY 1
),
agg AS (
  SELECT
    COALESCE(em.codigo_ibge_municipio, pca.codigo_ibge_municipio) AS codigo_ibge_municipio,
    IFNULL(em.total_emendas_municipio, 0) AS total_emendas_municipio,
    IFNULL(pca.valor_estimado_pca, 0) AS valor_estimado_pca
  FROM em
  FULL OUTER JOIN pca
    ON em.codigo_ibge_municipio = pca.codigo_ibge_municipio
)
SELECT
  a.codigo_ibge_municipio,
  v.nome_municipio,
  v.uf,
  a.total_emendas_municipio,
  a.valor_estimado_pca AS valor_intencao_compra_pncp_pca,
  CASE
    WHEN a.total_emendas_municipio >= 5000000 THEN 'APETITE_ALTO'
    WHEN a.total_emendas_municipio >= 800000 THEN 'APETITE_MEDIO'
    ELSE 'APETITE_BAIXO'
  END AS classificacao_apetite_compra,
  CURRENT_TIMESTAMP() AS audit_ts
FROM agg a
LEFT JOIN `transparenciabr.vw_indicadores_municipais` v
  ON v.id_municipio = a.codigo_ibge_municipio;
