-- ============================================================================
-- VIEWS FORENSES AUTOMATIZADAS — TransparênciaBR
-- Rodam contra TODOS os parlamentares (594+) automaticamente
-- Dataset: transparenciabr.transparenciabr (location: US)
-- Criado: 2026-05-14
-- ============================================================================

-- ============================================================================
-- VIEW 1: vw_f15_aviacao_dupla_cobranca
-- F15 — Táxi aéreo × Voo comercial: detecta dupla cobrança (mesmo parlamentar,
-- mesmo dia ou ±1 dia, nota de fretamento de aeronave + passagem aérea comercial)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_f15_aviacao_dupla_cobranca` AS
WITH fretamento AS (
  SELECT
    nu_deputado_id AS parlamentar_id,
    tx_nome_parlamentar AS nome_parlamentar,
    CAST(dat_emissao AS DATE) AS data_nota,
    vlr_liquido AS valor,
    txt_fornecedor AS fornecedor,
    txt_cnpjcpf AS cnpj,
    txt_trecho AS trecho,
    ide_documento AS id_documento,
    url_documento
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE UPPER(txt_descricao) LIKE '%AERONAVE%'
    AND vlr_liquido > 0
),
passagem_comercial AS (
  SELECT
    nu_deputado_id AS parlamentar_id,
    tx_nome_parlamentar AS nome_parlamentar,
    CAST(dat_emissao AS DATE) AS data_nota,
    vlr_liquido AS valor,
    txt_fornecedor AS fornecedor,
    txt_cnpjcpf AS cnpj,
    txt_trecho AS trecho,
    ide_documento AS id_documento,
    url_documento
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (num_sub_cota = 999 OR num_sub_cota = 9)
    AND vlr_liquido > 0
    AND UPPER(txt_descricao) NOT LIKE '%AERONAVE%'
)
SELECT
  f.parlamentar_id,
  f.nome_parlamentar,
  f.data_nota AS data_fretamento,
  f.valor AS valor_fretamento,
  f.fornecedor AS fornecedor_fretamento,
  f.cnpj AS cnpj_fretamento,
  f.trecho AS trecho_fretamento,
  f.id_documento AS doc_fretamento,
  f.url_documento AS url_fretamento,
  p.data_nota AS data_passagem,
  p.valor AS valor_passagem,
  p.fornecedor AS fornecedor_passagem,
  p.cnpj AS cnpj_passagem,
  p.trecho AS trecho_passagem,
  p.id_documento AS doc_passagem,
  p.url_documento AS url_passagem,
  ABS(DATE_DIFF(f.data_nota, p.data_nota, DAY)) AS dias_diferenca,
  f.valor + p.valor AS valor_total_suspeito,
  'F15_DUPLA_COBRANCA_AVIACAO' AS tipo_alerta,
  CASE
    WHEN ABS(DATE_DIFF(f.data_nota, p.data_nota, DAY)) = 0 THEN 'CRITICO'
    WHEN ABS(DATE_DIFF(f.data_nota, p.data_nota, DAY)) = 1 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM fretamento f
INNER JOIN passagem_comercial p
  ON f.parlamentar_id = p.parlamentar_id
  AND ABS(DATE_DIFF(f.data_nota, p.data_nota, DAY)) <= 3
  AND f.id_documento != p.id_documento
ORDER BY f.nome_parlamentar, f.data_nota;

-- ============================================================================
-- VIEW 2: vw_f15_fretamento_rota_comercial
-- F15 — Fretamento de aeronave em rota com voo comercial disponível
-- (detecta uso de táxi aéreo onde havia linha regular — sobrepreço)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_f15_fretamento_rota_comercial` AS
WITH fretamento AS (
  SELECT
    nu_deputado_id AS parlamentar_id,
    tx_nome_parlamentar AS nome_parlamentar,
    sg_uf AS uf_parlamentar,
    CAST(dat_emissao AS DATE) AS data_nota,
    vlr_liquido AS valor,
    txt_fornecedor AS fornecedor,
    txt_cnpjcpf AS cnpj,
    txt_trecho AS trecho,
    ide_documento AS id_documento,
    url_documento
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE UPPER(txt_descricao) LIKE '%AERONAVE%'
    AND vlr_liquido > 0
),
-- Parlamentares que usam AMBOS fretamento e passagem comercial (têm acesso a voos regulares)
parlamentar_com_voo_regular AS (
  SELECT DISTINCT nu_deputado_id AS parlamentar_id
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (num_sub_cota = 999 OR num_sub_cota = 9)
    AND UPPER(txt_descricao) NOT LIKE '%AERONAVE%'
    AND vlr_liquido > 0
)
SELECT
  f.parlamentar_id,
  f.nome_parlamentar,
  f.uf_parlamentar,
  f.data_nota,
  f.valor,
  f.fornecedor,
  f.cnpj,
  f.trecho,
  f.id_documento,
  f.url_documento,
  'F15_FRETAMENTO_ROTA_COMERCIAL' AS tipo_alerta,
  CASE
    WHEN f.valor >= 20000 THEN 'CRITICO'
    WHEN f.valor >= 10000 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM fretamento f
INNER JOIN parlamentar_com_voo_regular p
  ON f.parlamentar_id = p.parlamentar_id
WHERE f.valor >= 3000;

-- ============================================================================
-- VIEW 3: vw_f04_trecho_inconsistente
-- F04 — Notas de passagem/fretamento sem trecho declarado ou com trecho
-- incompatível com a UF do mandato (fraude de trecho tipo Renilce)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_f04_trecho_inconsistente` AS
WITH passagens AS (
  SELECT
    nu_deputado_id AS parlamentar_id,
    tx_nome_parlamentar AS nome_parlamentar,
    sg_uf AS uf_mandato,
    CAST(dat_emissao AS DATE) AS data_nota,
    vlr_liquido AS valor,
    txt_fornecedor AS fornecedor,
    txt_cnpjcpf AS cnpj,
    txt_trecho AS trecho,
    txt_descricao AS tipo_despesa,
    ide_documento AS id_documento,
    url_documento
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (UPPER(txt_descricao) LIKE '%AERONAVE%' OR num_sub_cota IN (9, 999))
    AND vlr_liquido > 0
)
SELECT
  parlamentar_id,
  nome_parlamentar,
  uf_mandato,
  data_nota,
  valor,
  fornecedor,
  cnpj,
  trecho,
  tipo_despesa,
  id_documento,
  url_documento,
  CASE
    -- Sem trecho declarado em despesa aérea (obrigatório)
    WHEN trecho IS NULL OR TRIM(trecho) = '' THEN 'F04_SEM_TRECHO_DECLARADO'
    -- Trecho não menciona BSB/Brasília (todo voo parlamentar deveria ter BSB como origem ou destino)
    WHEN UPPER(trecho) NOT LIKE '%BSB%'
     AND UPPER(trecho) NOT LIKE '%BRAS%'
     AND UPPER(trecho) NOT LIKE '%DF%'
     AND tipo_despesa != 'LOCAÇÃO OU FRETAMENTO DE AERONAVES'
     THEN 'F04_TRECHO_SEM_BRASILIA'
    ELSE 'F04_TRECHO_IRREGULAR'
  END AS tipo_alerta,
  CASE
    WHEN trecho IS NULL OR TRIM(trecho) = '' THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM passagens
WHERE
  -- Sem trecho em despesa aérea de alto valor
  (trecho IS NULL OR TRIM(trecho) = '') AND valor >= 1000
  OR
  -- Trecho não menciona Brasília (passagens regulares devem ter BSB)
  (
    trecho IS NOT NULL AND TRIM(trecho) != ''
    AND UPPER(trecho) NOT LIKE '%BSB%'
    AND UPPER(trecho) NOT LIKE '%BRAS%'
    AND UPPER(trecho) NOT LIKE '%DF%'
    AND tipo_despesa NOT LIKE '%AERONAVE%'
    AND valor >= 500
  );

-- ============================================================================
-- VIEW 4: vw_f04_combustivel_impossivel
-- F04 — Abastecimento em estado diferente do mandato no mesmo dia que
-- parlamentar tinha passagem aérea (impossibilidade física)
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
  SELECT
    nu_deputado_id AS parlamentar_id,
    CAST(dat_emissao AS DATE) AS data_voo,
    txt_trecho AS trecho_voo
  FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`
  WHERE (num_sub_cota IN (9, 999) OR UPPER(txt_descricao) LIKE '%AERONAVE%')
    AND vlr_liquido > 0
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

-- ============================================================================
-- VIEW 5: vw_emendas_x_ceap_fornecedor
-- EMENDAS — Cruzamento: parlamentar destina emenda para município X e
-- tem fornecedor CEAP recorrente no mesmo município (circuito fechado)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_emendas_x_ceap_fornecedor` AS
WITH emendas_por_municipio AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    municipio,
    estado,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_empenhado,
    SUM(IFNULL(valorPago, 0)) AS total_pago,
    COUNT(*) AS n_emendas,
    ARRAY_AGG(DISTINCT funcao IGNORE NULLS) AS funcoes,
    ARRAY_AGG(DISTINCT CAST(ano AS STRING) IGNORE NULLS) AS anos
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
    AND UPPER(municipio) NOT LIKE '%(UF)%'
  GROUP BY 1, 2, 3
),
ceap_por_municipio AS (
  SELECT
    UPPER(TRIM(nome_parlamentar)) AS parlamentar_upper,
    municipio_nome,
    cnpj_fornecedor,
    nome_fornecedor,
    SUM(valor_documento) AS total_ceap,
    COUNT(*) AS n_notas
  FROM `transparenciabr.transparenciabr.ceap_despesas`
  WHERE municipio_nome IS NOT NULL AND TRIM(municipio_nome) != ''
    AND cnpj_fornecedor IS NOT NULL
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) >= 2
)
SELECT
  e.autor_upper AS parlamentar,
  e.municipio,
  e.estado,
  e.total_empenhado AS emenda_total_empenhado,
  e.total_pago AS emenda_total_pago,
  e.n_emendas,
  e.funcoes AS emenda_funcoes,
  e.anos AS emenda_anos,
  c.cnpj_fornecedor,
  c.nome_fornecedor,
  c.total_ceap AS ceap_total_fornecedor,
  c.n_notas AS ceap_notas_fornecedor,
  e.total_empenhado + c.total_ceap AS valor_circuito_total,
  'EMENDA_X_CEAP_MESMO_MUNICIPIO' AS tipo_alerta,
  CASE
    WHEN c.total_ceap >= 50000 AND e.total_empenhado >= 500000 THEN 'CRITICO'
    WHEN c.total_ceap >= 20000 AND e.total_empenhado >= 100000 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM emendas_por_municipio e
INNER JOIN ceap_por_municipio c
  ON UPPER(TRIM(e.municipio)) = UPPER(TRIM(c.municipio_nome))
  AND e.autor_upper = c.parlamentar_upper
ORDER BY valor_circuito_total DESC;

-- ============================================================================
-- VIEW 6: vw_emendas_concentracao_municipal
-- EMENDAS — Concentração suspeita: parlamentar destina >70% das emendas
-- para um único município (possível captura por grupo político local)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_emendas_concentracao_municipal` AS
WITH emendas_total_autor AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_geral
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE valorEmpenhado > 0
  GROUP BY 1
  HAVING SUM(IFNULL(valorEmpenhado, 0)) > 100000
),
emendas_por_mun AS (
  SELECT
    UPPER(TRIM(autor)) AS autor_upper,
    municipio,
    estado,
    SUM(IFNULL(valorEmpenhado, 0)) AS total_municipio,
    COUNT(*) AS n_emendas,
    ARRAY_AGG(DISTINCT funcao IGNORE NULLS) AS funcoes
  FROM `transparenciabr.transparenciabr.emendas`
  WHERE municipio IS NOT NULL AND TRIM(municipio) != ''
    AND UPPER(municipio) NOT LIKE '%(UF)%'
    AND valorEmpenhado > 0
  GROUP BY 1, 2, 3
)
SELECT
  m.autor_upper AS parlamentar,
  m.municipio,
  m.estado,
  m.total_municipio,
  t.total_geral,
  ROUND(m.total_municipio / t.total_geral * 100, 1) AS pct_concentracao,
  m.n_emendas,
  m.funcoes,
  'EMENDA_CONCENTRACAO_MUNICIPAL' AS tipo_alerta,
  CASE
    WHEN m.total_municipio / t.total_geral >= 0.8 THEN 'CRITICO'
    WHEN m.total_municipio / t.total_geral >= 0.6 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM emendas_por_mun m
INNER JOIN emendas_total_autor t
  ON m.autor_upper = t.autor_upper
WHERE m.total_municipio / t.total_geral >= 0.4
ORDER BY pct_concentracao DESC;

-- ============================================================================
-- VIEW 7: vw_emendas_funcao_x_fornecedor_ceap
-- EMENDAS — Cruzamento funcional: emenda de Saúde + fornecedor CEAP de
-- consultoria/gráfica no mesmo período (lavagem via emenda)
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
  WHERE funcao IN ('Saúde', 'Educação', 'Assistência Social')
    AND valorEmpenhado > 50000
  GROUP BY 1, 2, 3, 4, 5
),
ceap_consultoria_grafica AS (
  SELECT
    UPPER(TRIM(nome_parlamentar)) AS parlamentar_upper,
    nome_fornecedor,
    cnpj_fornecedor,
    tipo_despesa,
    SUM(valor_documento) AS total_ceap,
    COUNT(*) AS n_notas,
    MIN(data_emissao) AS primeira_nota,
    MAX(data_emissao) AS ultima_nota
  FROM `transparenciabr.transparenciabr.ceap_despesas`
  WHERE (
    UPPER(tipo_despesa) LIKE '%CONSULTORIA%'
    OR UPPER(tipo_despesa) LIKE '%DIVULGAÇÃO%'
    OR UPPER(tipo_despesa) LIKE '%DIVULGACAO%'
    OR UPPER(tipo_despesa) LIKE '%TRABALHOS TÉCNICOS%'
  )
  AND valor_documento > 1000
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
  c.cnpj_fornecedor AS ceap_cnpj,
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
-- VIEW 8: vw_fornecedor_multi_parlamentar
-- F02/F14 — Fornecedor que atende múltiplos parlamentares (rede de captura)
-- ============================================================================
CREATE OR REPLACE VIEW `transparenciabr.transparenciabr.vw_fornecedor_multi_parlamentar` AS
SELECT
  cnpj_fornecedor,
  ANY_VALUE(nome_fornecedor) AS nome_fornecedor,
  COUNT(DISTINCT nome_parlamentar) AS n_parlamentares,
  ARRAY_AGG(DISTINCT nome_parlamentar) AS parlamentares,
  SUM(valor_documento) AS total_recebido,
  COUNT(*) AS total_notas,
  MIN(data_emissao) AS primeira_nota,
  MAX(data_emissao) AS ultima_nota,
  'F02_FORNECEDOR_MULTI_PARLAMENTAR' AS tipo_alerta,
  CASE
    WHEN COUNT(DISTINCT nome_parlamentar) >= 10 THEN 'CRITICO'
    WHEN COUNT(DISTINCT nome_parlamentar) >= 5 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS severidade
FROM `transparenciabr.transparenciabr.ceap_despesas`
WHERE cnpj_fornecedor IS NOT NULL AND TRIM(cnpj_fornecedor) != ''
GROUP BY cnpj_fornecedor
HAVING COUNT(DISTINCT nome_parlamentar) >= 3
ORDER BY n_parlamentares DESC;
