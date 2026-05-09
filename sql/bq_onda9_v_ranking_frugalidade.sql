-- Onda 9 — % de aproveitamento da cota CEAP ponderado por meses com despesa (2023–2026).
-- Schema ceap_despesas_ext: tx_nome_parlamentar, sg_partido, sg_uf, dat_emissao (TIMESTAMP), vlr_liquido, nu_deputado_id
CREATE OR REPLACE VIEW `transparenciabr.tbr_ceap.v_ranking_frugalidade` AS
WITH agregado AS (
  SELECT
    tx_nome_parlamentar AS deputado,
    sg_partido AS partido,
    sg_uf AS uf,
    MAX(nu_deputado_id) AS nu_deputado_id,
    COUNT(1) AS qtd_notas,
    ROUND(SUM(SAFE_CAST(vlr_liquido AS FLOAT64)), 2) AS total_brl,
    COUNT(DISTINCT FORMAT_DATE('%Y-%m', DATE(dat_emissao, 'America/Sao_Paulo'))) AS meses_ativos,
    MIN(DATE(dat_emissao, 'America/Sao_Paulo')) AS primeira_nota,
    MAX(DATE(dat_emissao, 'America/Sao_Paulo')) AS ultima_nota
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE dat_emissao IS NOT NULL
    AND EXTRACT(YEAR FROM DATE(dat_emissao, 'America/Sao_Paulo')) BETWEEN 2023 AND 2026
  GROUP BY tx_nome_parlamentar, sg_partido, sg_uf
  HAVING tx_nome_parlamentar IS NOT NULL AND sg_uf IS NOT NULL AND SUM(SAFE_CAST(vlr_liquido AS FLOAT64)) > 0
)
SELECT
  a.nu_deputado_id,
  a.deputado,
  a.partido,
  a.uf,
  a.qtd_notas,
  a.total_brl,
  a.meses_ativos,
  ROUND(c.cota_mensal_brl * a.meses_ativos, 2) AS cota_disponivel_brl,
  ROUND(SAFE_DIVIDE(a.total_brl, c.cota_mensal_brl * a.meses_ativos) * 100, 2) AS pct_aproveitamento,
  CASE WHEN a.meses_ativos < 12 THEN TRUE ELSE FALSE END AS is_suplente,
  a.primeira_nota,
  a.ultima_nota
FROM agregado a
LEFT JOIN `transparenciabr.tbr_ceap.ceap_cotas_uf` c USING (uf)
WHERE c.cota_mensal_brl IS NOT NULL
ORDER BY pct_aproveitamento DESC;
