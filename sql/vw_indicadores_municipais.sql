-- Contexto socioeconómico municipal via Base dos Dados (BigQuery público).
-- Uma linha por `id_municipio` IBGE (7 dígitos, STRING).
--
-- Fontes:
--   — Diretório IBGE (nome/UF)
--   — População residente (último ano disponível por município)
--   — IDEB — fundamental · finais (6-9) · rede pública (último ano)
--   — SNIS — índice de atendimento de esgoto (pop. atendida / pop. urbana)
--   — CNES — leitos agregados (último ano da tabela `leito`)
--
-- Nota IDH: o atlas PNUD municipal nem sempre está disponível no projeto público.
-- Colunas `idh_municipal` / `ano_idh` ficam NULL até integração explícita (ex.: PNUD).

CREATE OR REPLACE VIEW `transparenciabr.vw_indicadores_municipais` AS
WITH dir AS (
  SELECT
    id_municipio,
    nome AS nome_municipio,
    sigla_uf AS uf
  FROM `basedosdados.br_bd_diretorios_brasil.municipio`
),

pop_latest AS (
  SELECT
    id_municipio,
    populacao,
    ano AS ano_populacao
  FROM `basedosdados.br_ibge_populacao.municipio`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id_municipio ORDER BY ano DESC) = 1
),

ideb_finais AS (
  SELECT
    id_municipio,
    ideb AS ideb_anos_finais,
    ano AS ano_ideb
  FROM `basedosdados.br_inep_ideb.municipio`
  WHERE ensino = 'fundamental'
    AND anos_escolares = 'finais (6-9)'
    AND rede = 'publica'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id_municipio ORDER BY ano DESC) = 1
),

snis_latest AS (
  SELECT
    id_municipio,
    ano AS ano_snis,
    populacao_atentida_esgoto,
    populacao_urbana,
    SAFE_DIVIDE(
      CAST(populacao_atentida_esgoto AS FLOAT64),
      NULLIF(CAST(populacao_urbana AS FLOAT64), 0)
    ) AS indice_atendimento_esgoto
  FROM `basedosdados.br_mdr_snis.municipio_agua_esgoto`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id_municipio ORDER BY ano DESC) = 1
),

leitos_agg AS (
  SELECT
    id_municipio,
    SUM(IFNULL(quantidade_total, 0)) AS leitos_totais
  FROM `basedosdados.br_ms_cnes.leito`
  WHERE ano = (SELECT MAX(ano) FROM `basedosdados.br_ms_cnes.leito`)
  GROUP BY id_municipio
)

SELECT
  d.id_municipio,
  d.nome_municipio,
  d.uf,
  p.populacao,
  p.ano_populacao,
  i.ideb_anos_finais,
  i.ano_ideb,
  s.indice_atendimento_esgoto,
  s.populacao_atentida_esgoto,
  s.populacao_urbana AS populacao_urbana_referencia_esgoto,
  s.ano_snis,
  CAST(NULL AS FLOAT64) AS idh_municipal,
  CAST(NULL AS INT64) AS ano_idh,
  l.leitos_totais,
  SAFE_DIVIDE(
    CAST(l.leitos_totais AS FLOAT64),
    NULLIF(CAST(p.populacao AS FLOAT64), 0)
  ) AS leitos_por_habitante,
  CURRENT_TIMESTAMP() AS audit_ts
FROM dir d
LEFT JOIN pop_latest p ON d.id_municipio = p.id_municipio
LEFT JOIN ideb_finais i ON d.id_municipio = i.id_municipio
LEFT JOIN snis_latest s ON d.id_municipio = s.id_municipio
LEFT JOIN leitos_agg l ON d.id_municipio = l.id_municipio;
