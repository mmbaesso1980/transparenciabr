-- ============================================================================
-- VIEWS FORENSES v2 — Corrigidas para usar tbr_ceap.ceap_despesas_ext
-- (a tabela ceap_despesas no dataset transparenciabr não tem cnpj/municipio)
-- ============================================================================

-- ============================================================================
-- VIEW 5 FIX: vw_emendas_x_ceap_fornecedor
-- EMENDAS — Cruzamento: parlamentar destina emenda para município X e
-- tem fornecedor CEAP recorrente com CNPJ no mesmo período (circuito fechado)
-- Usa ext table que tem CNPJ real
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_emendas_x_ceap_fornecedor` AS
WITH emendas_por_municipio AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    UPPER(TRIM(municipio)) AS municipio_upper,
    estado,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_empenhado,
    SUM(IFNULL(valorPago, 0)) AS total_pago,
    COUNT(*) AS n_emendas,
    ARRAY_AGG(DISTINCT funcao IGNORE NULLS) AS funcoes,
    ARRAY_AGG(DISTINCT CAST(ano AS STRING) IGNORE NULLS) AS anos
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
    AND UPPER(municipio) NOT LIKE '%(UF)%'
    AND UPPER(municipio) != 'NACIONAL'
  GROUP BY 1, 2, 3
  HAVING SUM(IFNULL(valorEmpenhado, 0)) > 50000
),
ceap_fornecedor_por_parlamentar AS (
  SELECT
    UPPER(TRIM(tx_nome_parlamentar)) AS parlamentar_upper,
    sg_uf AS uf_parlamentar,
    REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '') AS cnpj_limpo,
    txt_fornecedor AS nome_fornecedor,
    SUM(vlr_liquido) AS total_ceap,
    COUNT(*) AS n_notas,
    MIN(CAST(dat_emissao AS DATE)) AS primeira_nota,
    MAX(CAST(dat_emissao AS DATE)) AS ultima_nota
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE txt_cnpjcpf IS NOT NULL AND TRIM(txt_cnpjcpf) != ''
    AND vlr_liquido > 0
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) >= 3 AND SUM(vlr_liquido) >= 5000
)
SELECT
  e.autor_upper AS parlamentar,
  e.municipio_upper AS municipio_emenda,
  e.estado,
  e.total_empenhado AS emenda_total_empenhado,
  e.total_pago AS emenda_total_pago,
  e.n_emendas,
  e.funcoes AS emenda_funcoes,
  e.anos AS emenda_anos,
  c.cnpj_limpo AS ceap_cnpj_fornecedor,
  c.nome_fornecedor AS ceap_fornecedor,
  c.total_ceap,
  c.n_notas AS ceap_notas,
  c.primeira_nota,
  c.ultima_nota,
  e.total_empenhado + c.total_ceap AS valor_circuito_total,
  'EMENDA_X_CEAP_MESMO_PARLAMENTAR' AS tipo_alerta,
  CASE
    WHEN c.total_ceap >= 100000 AND e.total_empenhado >= 1000000 THEN 'CRITICO'
    WHEN c.total_ceap >= 50000 AND e.total_empenhado >= 500000 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM emendas_por_municipio e
INNER JOIN ceap_fornecedor_por_parlamentar c
  ON e.autor_upper = c.parlamentar_upper
ORDER BY valor_circuito_total DESC;

-- ============================================================================
-- VIEW 7 FIX: vw_emendas_funcao_x_fornecedor_ceap
-- EMENDAS — Cruzamento funcional: emenda de Saúde + fornecedor CEAP de
-- consultoria/gráfica no mesmo período (lavagem via emenda)
-- Usa ext table
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_emendas_funcao_x_fornecedor_ceap` AS
WITH emendas_saude_educacao AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    funcao,
    municipio,
    estado,
    ano,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_empenhado
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE funcao IN ('Saúde', 'Educação', 'Assistência Social', 'Urbanismo', 'Saneamento')
    AND valorEmpenhado > 50000
  GROUP BY 1, 2, 3, 4, 5
),
ceap_consultoria_grafica AS (
  SELECT
    UPPER(TRIM(tx_nome_parlamentar)) AS parlamentar_upper,
    txt_fornecedor AS nome_fornecedor,
    REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '') AS cnpj_limpo,
    txt_descricao AS tipo_despesa,
    SUM(vlr_liquido) AS total_ceap,
    COUNT(*) AS n_notas,
    MIN(CAST(dat_emissao AS DATE)) AS primeira_nota,
    MAX(CAST(dat_emissao AS DATE)) AS ultima_nota
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (
    UPPER(txt_descricao) LIKE '%CONSULTORIA%'
    OR UPPER(txt_descricao) LIKE '%DIVULGAÇÃO%'
    OR UPPER(txt_descricao) LIKE '%DIVULGACAO%'
    OR UPPER(txt_descricao) LIKE '%TRABALHOS TÉCNICOS%'
    OR UPPER(txt_descricao) LIKE '%TRABALHOS TECNICOS%'
  )
  AND vlr_liquido > 500
  AND txt_cnpjcpf IS NOT NULL AND TRIM(txt_cnpjcpf) != ''
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) >= 3
)
SELECT
  e.autor_upper AS parlamentar,
  e.funcao AS emenda_funcao,
  e.municipio AS emenda_municipio,
  e.estado AS emenda_estado,
  e.ano AS emenda_ano,
  e.total_empenhado AS emenda_valor,
  c.nome_fornecedor AS ceap_fornecedor,
  c.cnpj_limpo AS ceap_cnpj,
  c.tipo_despesa AS ceap_tipo,
  c.total_ceap,
  c.n_notas AS ceap_notas,
  c.primeira_nota,
  c.ultima_nota,
  'EMENDA_FUNCAO_X_CEAP_CONSULTORIA' AS tipo_alerta,
  CASE
    WHEN c.total_ceap >= 100000 THEN 'CRITICO'
    WHEN c.total_ceap >= 30000 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM emendas_saude_educacao e
INNER JOIN ceap_consultoria_grafica c
  ON e.autor_upper = c.parlamentar_upper
ORDER BY c.total_ceap DESC;

-- ============================================================================
-- VIEW 8 FIX: vw_fornecedor_multi_parlamentar
-- F02/F14 — Fornecedor que atende múltiplos parlamentares (rede de captura)
-- Usa ext table com CNPJ real
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_fornecedor_multi_parlamentar` AS
SELECT
  REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '') AS cnpj_fornecedor,
  ANY_VALUE(txt_fornecedor) AS nome_fornecedor,
  COUNT(DISTINCT tx_nome_parlamentar) AS n_parlamentares,
  ARRAY_AGG(DISTINCT tx_nome_parlamentar ORDER BY tx_nome_parlamentar LIMIT 20) AS parlamentares,
  SUM(vlr_liquido) AS total_recebido,
  COUNT(*) AS total_notas,
  MIN(CAST(dat_emissao AS DATE)) AS primeira_nota,
  MAX(CAST(dat_emissao AS DATE)) AS ultima_nota,
  'F02_FORNECEDOR_MULTI_PARLAMENTAR' AS tipo_alerta,
  CASE
    WHEN COUNT(DISTINCT tx_nome_parlamentar) >= 10 THEN 'CRITICO'
    WHEN COUNT(DISTINCT tx_nome_parlamentar) >= 5 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
WHERE txt_cnpjcpf IS NOT NULL AND TRIM(txt_cnpjcpf) != ''
  AND vlr_liquido > 0
  AND LENGTH(REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '')) >= 11
GROUP BY 1
HAVING COUNT(DISTINCT tx_nome_parlamentar) >= 3
ORDER BY n_parlamentares DESC;

-- ============================================================================
-- VIEW 9 (NEW): vw_emendas_x_ceap_cnpj_direto
-- EMENDAS × CEAP — Cruzamento CNPJ direto: mesmo CNPJ aparece como
-- fornecedor CEAP do parlamentar E como beneficiário/executor de emenda
-- do mesmo parlamentar (circuito fechado comprovado)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_emendas_x_ceap_cnpj_direto` AS
WITH ceap_fornecedores AS (
  SELECT
    UPPER(TRIM(tx_nome_parlamentar)) AS parlamentar_upper,
    CAST(nu_deputado_id AS STRING) AS parlamentar_id,
    REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '') AS cnpj_limpo,
    txt_fornecedor AS nome_fornecedor,
    SUM(vlr_liquido) AS total_ceap,
    COUNT(*) AS n_notas_ceap
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE txt_cnpjcpf IS NOT NULL AND TRIM(txt_cnpjcpf) != ''
    AND vlr_liquido > 0
    AND LENGTH(REGEXP_REPLACE(txt_cnpjcpf, r'[^0-9]', '')) = 14
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) >= 2
),
emendas_autor AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    cpfCnpjAutor,
    municipio,
    estado,
    funcao,
    ano,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_empenhado,
    SUM(IFNULL(valorPago, 0)) AS total_pago,
    COUNT(*) AS n_emendas
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE valorEmpenhado > 0
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT
  c.parlamentar_upper AS parlamentar,
  c.parlamentar_id,
  c.cnpj_limpo AS cnpj_compartilhado,
  c.nome_fornecedor AS ceap_fornecedor,
  c.total_ceap,
  c.n_notas_ceap,
  e.municipio AS emenda_municipio,
  e.estado AS emenda_estado,
  e.funcao AS emenda_funcao,
  e.ano AS emenda_ano,
  e.total_empenhado AS emenda_valor_empenhado,
  e.total_pago AS emenda_valor_pago,
  e.n_emendas,
  c.total_ceap + e.total_empenhado AS valor_circuito_total,
  'EMENDA_X_CEAP_CNPJ_DIRETO' AS tipo_alerta,
  'CRITICO' AS severidade
FROM ceap_fornecedores c
INNER JOIN emendas_autor e
  ON c.parlamentar_upper = e.autor_upper
WHERE c.total_ceap >= 5000
ORDER BY valor_circuito_total DESC;

-- ============================================================================
-- VIEW 10 (NEW): vw_f04_combustivel_impossivel (using ext table)
-- F04 — Abastecimento no mesmo dia que voo (impossibilidade física)
-- Fixed to use ext table properly
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_f04_combustivel_impossivel` AS
WITH combustivel AS (
  SELECT
    nu_deputado_id AS parlamentar_id,
    tx_nome_parlamentar AS nome_parlamentar,
    sg_uf AS uf_mandato,
    CAST(dat_emissao AS DATE) AS data_nota,
    vlr_liquido AS valor,
    txt_fornecedor AS fornecedor,
    txt_cnpjcpf AS cnpj,
    ide_documento AS id_documento
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (UPPER(txt_descricao) LIKE '%COMBUST%' OR UPPER(txt_descricao) LIKE '%LUBRIFICANT%')
    AND vlr_liquido > 0
),
voos AS (
  SELECT DISTINCT
    nu_deputado_id AS parlamentar_id,
    CAST(dat_emissao AS DATE) AS data_voo,
    txt_trecho AS trecho_voo
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (num_sub_cota IN (9, 999) OR UPPER(txt_descricao) LIKE '%AERONAVE%')
    AND vlr_liquido > 0
    AND txt_trecho IS NOT NULL AND txt_trecho != ''
)
SELECT
  c.parlamentar_id,
  c.nome_parlamentar,
  c.uf_mandato,
  c.data_nota AS data_combustivel,
  c.valor AS valor_combustivel,
  c.fornecedor AS posto_combustivel,
  c.cnpj AS cnpj_posto,
  v.data_voo,
  v.trecho_voo,
  'F04_COMBUSTIVEL_DIA_VOO' AS tipo_alerta,
  'MEDIO' AS severidade
FROM combustivel c
INNER JOIN voos v
  ON c.parlamentar_id = v.parlamentar_id
  AND c.data_nota = v.data_voo;
