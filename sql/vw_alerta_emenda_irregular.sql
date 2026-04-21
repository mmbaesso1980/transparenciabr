-- Alerta NÍVEL 5 (CRÍTICO): emenda destinada a município onde há contrato com fornecedor listado no CADIRREG (TCU).
-- Toda a lógica permanece no BigQuery (zero egress de linhas para Python).
--
-- Pré-requisitos: `emendas_parlamentares`, `contratos_publicos_municipio`, `tcu_cadirreg` populados pelos EL.

CREATE OR REPLACE VIEW `transparenciabr.vw_alerta_emenda_irregular` AS
WITH tcu_norm AS (
  SELECT
    REGEXP_REPLACE(cpf_cnpj, r'[^0-9]', '') AS doc_limpo,
    ANY_VALUE(nome) AS nome_irregular,
    MAX(data_transito_julgado) AS data_transito_julgado
  FROM `transparenciabr.tcu_cadirreg`
  WHERE cpf_cnpj IS NOT NULL
    AND TRIM(cpf_cnpj) != ''
  GROUP BY 1
),

emendas AS (
  SELECT
    parlamentar_id AS id_politico,
    codigo_ibge_municipio,
    municipio_nome AS municipio,
    SUM(IFNULL(valor_emenda, 0)) AS valor_emenda_total
  FROM `transparenciabr.emendas_parlamentares`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND TRIM(codigo_ibge_municipio) != ''
  GROUP BY 1, 2, 3
),

contratos AS (
  SELECT
    codigo_ibge_municipio,
    REGEXP_REPLACE(cnpj_fornecedor, r'[^0-9]', '') AS cnpj_limpo,
    ANY_VALUE(nome_fornecedor) AS nome_fornecedor,
    SUM(IFNULL(valor_contrato, 0)) AS valor_contrato_total
  FROM `transparenciabr.contratos_publicos_municipio`
  WHERE codigo_ibge_municipio IS NOT NULL
    AND cnpj_fornecedor IS NOT NULL
  GROUP BY 1, 2
)

SELECT
  e.id_politico,
  e.codigo_ibge_municipio,
  e.municipio,
  c.cnpj_limpo AS cnpj_fornecedor,
  c.nome_fornecedor,
  e.valor_emenda_total AS valor_emenda,
  c.valor_contrato_total AS valor_contrato,
  t.nome_irregular AS nome_cadirreg,
  t.data_transito_julgado,
  'EMENDA_FORNECEDOR_IRREGULAR' AS tipo_alerta,
  CURRENT_TIMESTAMP() AS audit_ts
FROM emendas e
INNER JOIN contratos c
  ON e.codigo_ibge_municipio = c.codigo_ibge_municipio
INNER JOIN tcu_norm t
  ON c.cnpj_limpo = t.doc_limpo
WHERE e.valor_emenda_total > 0
  AND c.valor_contrato_total > 0;
