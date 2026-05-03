-- ============================================================
-- TBR LEADS PREVIDENCIÁRIOS BRASIL — DDL
-- Dataset: tbr_leads_prev (southamerica-east1)
-- Idempotente: pode rodar várias vezes
-- ============================================================

-- 1. Dataset (rode separado: bq --location=southamerica-east1 mk -d tbr_leads_prev)

-- 2. Camada BASE — todos os indeferimentos INSS (12 meses) com score determinístico
CREATE TABLE IF NOT EXISTS `tbr_leads_prev.leads_brasil_base` (
  mes_arquivo     STRING,
  competencia     STRING,
  especie_cod     INT64,
  especie         STRING,
  motivo          STRING,
  dt_nasc         STRING,
  sexo            STRING,
  clientela       STRING,
  filiacao        STRING,
  uf              STRING,
  dt_indef        STRING,
  ramo            STRING,
  aps_cod         INT64,
  aps             STRING,
  dt_der          STRING,
  score_pre       INT64,
  ingested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(PARSE_DATE('%Y-%m', SUBSTR(competencia, 1, 7)))
CLUSTER BY uf, especie, motivo
OPTIONS(description="9.6M leads INSS indeferidos Brasil (12 meses) — score determinístico TBR");

-- 3. Camada GEMMA — top 30% classificados por Gemma 27B local
CREATE TABLE IF NOT EXISTS `tbr_leads_prev.leads_brasil_gemma` (
  mes_arquivo            STRING,
  competencia            STRING,
  especie_cod            INT64,
  especie                STRING,
  motivo                 STRING,
  dt_nasc                STRING,
  sexo                   STRING,
  clientela              STRING,
  filiacao               STRING,
  uf                     STRING,
  dt_indef               STRING,
  ramo                   STRING,
  aps_cod                INT64,
  aps                    STRING,
  dt_der                 STRING,
  score_pre              INT64,
  -- Classificação Gemma 27B
  sub_vertical           STRING,
  tese_juridica_curta    STRING,
  score_conversao_0_100  INT64,
  urgencia               STRING,
  ticket_estimado_brl    INT64,
  fundamentos_chave      ARRAY<STRING>,
  rationale              STRING,
  gemma_ok               BOOL,
  gemma_err              STRING,
  ingested_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(PARSE_DATE('%Y-%m', SUBSTR(competencia, 1, 7)))
CLUSTER BY uf, sub_vertical, urgencia
OPTIONS(description="Top 30% leads classificados via Gemma 27B local (L4)");

-- 4. Camada FLASH — top 10% re-scored por Vertex Flash
CREATE TABLE IF NOT EXISTS `tbr_leads_prev.leads_brasil_flash` (
  mes_arquivo            STRING,
  competencia            STRING,
  especie_cod            INT64,
  especie                STRING,
  motivo                 STRING,
  dt_nasc                STRING,
  sexo                   STRING,
  clientela              STRING,
  filiacao               STRING,
  uf                     STRING,
  dt_indef               STRING,
  aps_cod                INT64,
  aps                    STRING,
  score_pre              INT64,
  sub_vertical           STRING,
  tese_juridica_curta    STRING,
  score_conversao_0_100  INT64,
  urgencia               STRING,
  ticket_estimado_brl    INT64,
  -- Vertex Flash refinements
  flash_score            INT64,
  flash_tese_refinada    STRING,
  flash_riscos           ARRAY<STRING>,
  flash_proximos_passos  ARRAY<STRING>,
  ingested_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(PARSE_DATE('%Y-%m', SUBSTR(competencia, 1, 7)))
CLUSTER BY uf, sub_vertical, urgencia
OPTIONS(description="Top 10% leads refinados via Vertex Flash");

-- 5. Camada PRO — top 1% com dossiê completo
CREATE TABLE IF NOT EXISTS `tbr_leads_prev.leads_brasil_pro` (
  mes_arquivo            STRING,
  competencia            STRING,
  especie_cod            INT64,
  especie                STRING,
  motivo                 STRING,
  dt_nasc                STRING,
  sexo                   STRING,
  uf                     STRING,
  dt_indef               STRING,
  aps                    STRING,
  score_pre              INT64,
  sub_vertical           STRING,
  score_conversao_0_100  INT64,
  flash_score            INT64,
  -- Dossiê Vertex Pro
  dossie_executivo       STRING,
  script_abordagem       STRING,
  calculo_atrasados_brl  INT64,
  honorarios_estimados   INT64,
  fundamentacao_completa STRING,
  precedentes_chave      ARRAY<STRING>,
  documentos_necessarios ARRAY<STRING>,
  prazo_recurso_dias     INT64,
  ingested_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(PARSE_DATE('%Y-%m', SUBSTR(competencia, 1, 7)))
CLUSTER BY uf, sub_vertical
OPTIONS(description="Top 1% leads PREMIUM com dossiê pronto pra escritório");

-- 6. Stats agregadas (snapshot por execução)
CREATE TABLE IF NOT EXISTS `tbr_leads_prev.stats_brasil` (
  snapshot_at      TIMESTAMP,
  total_leads      INT64,
  total_gemma      INT64,
  total_flash      INT64,
  total_pro        INT64,
  por_uf           JSON,
  por_especie      JSON,
  por_motivo       JSON,
  top_aps          JSON,
  score_dist       JSON
)
OPTIONS(description="Snapshots de agregados Brasil leads previdenciários");
