-- Auditoria Benford — primeiro dígito vs P(d) = log10(1 + 1/d)

CREATE OR REPLACE VIEW `transparenciabr.vw_benford_ceap_audit` AS
WITH base AS (
  SELECT
    parlamentar_id,
    SAFE_CAST(ABS(valor_documento) AS STRING) AS valor_txt
  FROM `transparenciabr.ceap_despesas`
  WHERE valor_documento IS NOT NULL
    AND valor_documento != 0
),

primeiro_digito AS (
  SELECT
    parlamentar_id,
    CAST(SUBSTR(
      REPLACE(TRIM(REGEXP_REPLACE(valor_txt, r'^0+(\.|$)', '')), '.', ''),
      1,
      1
    ) AS INT64) AS d
  FROM base
  WHERE LENGTH(TRIM(REGEXP_REPLACE(valor_txt, r'^[-+]?', ''))) >= 1
),

freq AS (
  SELECT
    parlamentar_id,
    d AS digito,
    COUNT(*) AS cnt,
    SUM(COUNT(*)) OVER (PARTITION BY parlamentar_id) AS total_n
  FROM primeiro_digito
  WHERE d BETWEEN 1 AND 9
  GROUP BY parlamentar_id, d
),

teorica AS (
  SELECT digit AS d, LOG10(1 + 1.0 / digit) AS p_teorico
  FROM UNNEST([1, 2, 3, 4, 5, 6, 7, 8, 9]) AS digit
),

joined AS (
  SELECT
    f.parlamentar_id,
    f.digito,
    SAFE_DIVIDE(f.cnt, f.total_n) AS freq_obs,
    t.p_teorico,
    SAFE_DIVIDE(
      ABS(SAFE_DIVIDE(f.cnt, f.total_n) - t.p_teorico),
      NULLIF(t.p_teorico, 0)
    ) AS rel_gap
  FROM freq f
  JOIN teorica t ON t.d = f.digito
)

SELECT
  parlamentar_id,
  digito,
  ROUND(freq_obs * 100, 4) AS pct_observado_pct,
  ROUND(p_teorico * 100, 4) AS pct_teorico_pct,
  ROUND(rel_gap * 100, 4) AS gap_relativo_pct,
  rel_gap > 0.30 AS flag_desvio_gt_30pct,
  CURRENT_TIMESTAMP() AS audit_ts
FROM joined;
