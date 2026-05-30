-- =============================================================================
-- BigQuery DDL — Radar Jurídico INSS
-- Dataset: radar_juridico (southamerica-east1)
-- Projeto: transparenciabr
--
-- ISOLADO dos datasets tbr_leads_prev, tbr_ceap, transparenciabr (US).
-- Toda escrita ocorre via backend Cloud Run (nunca via SDK web/frontend).
--
-- Rodar com:
--   bq mk --location=southamerica-east1 --dataset transparenciabr:radar_juridico
--   bq query --location=southamerica-east1 --use_legacy_sql=false \
--     < apps/radar-juridico/schemas/bigquery_radar_juridico.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. leads_radar_raw
--    Microdados de indeferimentos INSS (fonte pública dados.gov.br).
--    SEM PII direto — CPF ausente da fonte original (anônimos por design LGPD).
--    Particionada por dt_indeferimento (DATE), clustering uf + especie_codigo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.leads_radar_raw` (
  -- Identificação do lote
  mes_referencia       DATE        OPTIONS(description='Competência do indeferimento (YYYY-MM-01)'),
  source_file          STRING      OPTIONS(description='Nome do arquivo XLSX origem'),
  _row_hash            STRING      OPTIONS(description='SHA-256 de campos-chave (idempotência)'),
  _loaded_at           TIMESTAMP   OPTIONS(description='Timestamp de carga no BQ'),

  -- Dados demográficos públicos (sem nome, sem CPF na fonte)
  dt_nascimento        DATE        OPTIONS(description='Data de nascimento do beneficiário'),
  sexo                 STRING      OPTIONS(description='M/F'),
  uf                   STRING      OPTIONS(description='UF do beneficiário (2 chars)'),

  -- Espécie e motivo
  especie_codigo       INT64       OPTIONS(description='Código de espécie do benefício INSS'),
  especie_nome         STRING      OPTIONS(description='Descrição da espécie'),
  motivo_indeferimento STRING      OPTIONS(description='Motivo literal do indeferimento'),
  dt_indeferimento     DATE        OPTIONS(description='Data do despacho de indeferimento'),
  dt_der               DATE        OPTIONS(description='Data de entrada do requerimento'),

  -- Filiação e agência
  clientela            STRING      OPTIONS(description='Urbano/Rural/Outros'),
  forma_filiacao       STRING      OPTIONS(description='Forma de filiação ao RGPS'),
  ramo_atividade       STRING      OPTIONS(description='CNAE / ramo do empregador'),
  aps_codigo           INT64       OPTIONS(description='Código da agência INSS'),
  aps_nome             STRING      OPTIONS(description='Nome da agência INSS (proxy geográfico)')
)
PARTITION BY dt_indeferimento
CLUSTER BY uf, especie_codigo
OPTIONS(
  description='Microdados públicos de indeferimentos INSS (dados.gov.br). SEM PII. Radar Jurídico INSS.',
  require_partition_filter = FALSE
);

-- -----------------------------------------------------------------------------
-- 2. leads_radar_scored
--    Leads com score ICP calculado pelo Maestro (Vertex AI Gemini 2.5 Pro).
--    CPF ainda ausente — scoring apenas sobre dados demográficos e espécie.
--    Populated pelo pipeline de scoring (Cloud Run Job ou BQ scheduled query).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.leads_radar_scored` (
  lead_id              STRING      OPTIONS(description='UUID gerado pelo pipeline de scoring'),
  _row_hash            STRING      OPTIONS(description='FK para leads_radar_raw._row_hash'),
  scored_at            TIMESTAMP   OPTIONS(description='Quando o score foi calculado'),

  -- Dados do lead (denormalizados para acesso rápido)
  dt_indeferimento     DATE,
  uf                   STRING,
  especie_codigo       INT64,
  especie_nome         STRING,
  motivo_indeferimento STRING,
  clientela            STRING,
  forma_filiacao       STRING,
  aps_nome             STRING,

  -- Scoring ICP (calculado pelo Maestro)
  -- TODO(maestro): definir rubrica de scoring (0-100) para cada combinação
  --   especie_codigo + motivo_indeferimento + clientela → tipo_acao_id + score
  score_match_icp      FLOAT64     OPTIONS(description='Score match ICP 0.0-100.0'),
  tipo_acao_id         STRING      OPTIONS(description='pcd_idade|pcd_tempo|bpc_def|bpc_idoso|especial|rural|hibrida'),
  tipo_acao_label      STRING      OPTIONS(description='Label legível da tese recomendada'),
  tese_recomendada     STRING      OPTIONS(description='Descrição da tese jurídica (Gemini)'),
  foco_atual           BOOL        OPTIONS(description='True se é foco operacional do momento'),
  ticket_estimado_brl  FLOAT64     OPTIONS(description='Estimativa de honorários em BRL'),
  prob_conversao       STRING      OPTIONS(description='Alta/Média/Baixa')
)
PARTITION BY scored_at
CLUSTER BY uf, tipo_acao_id
OPTIONS(
  description='Leads INSS com score ICP calculado. SEM PII. Para exibição via backend (nunca frontend direto).'
);

-- -----------------------------------------------------------------------------
-- 3. alertas_watchlist
--    Watchlist de alertas "publicou-pegamos" por usuário.
--    Cada alerta monitora um número de processo ou CPF-hash.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.alertas_watchlist` (
  alerta_id            STRING      OPTIONS(description='UUID do alerta'),
  uid                  STRING      OPTIONS(description='Firebase UID do usuário proprietário'),
  criado_em            TIMESTAMP,
  atualizado_em        TIMESTAMP,

  -- O que monitorar
  tipo_monitor         STRING      OPTIONS(description='numero_processo|cpf_hash|especie_uf'),
  numero_processo      STRING      OPTIONS(description='Número do processo (ex: 5001234-12.2025.4.03.6183)'),
  cpf_hash             STRING      OPTIONS(description='SHA-256 do CPF — NUNCA CPF em claro'),
  especie_codigo       INT64       OPTIONS(description='Filtro por espécie (para monitores tipo especie_uf)'),
  uf                   STRING      OPTIONS(description='UF do monitor'),

  -- Estado
  status               STRING      OPTIONS(description='ATIVO|INATIVO|DESCARTADO|NOTIFICADO'),
  ultimo_check         TIMESTAMP   OPTIONS(description='Última execução do job'),
  ultimo_disparo       TIMESTAMP   OPTIONS(description='Último alerta disparado'),
  pje_status           STRING      OPTIONS(description='LIVRE|VERIFICAR|DESCARTAR|DESCONHECIDO'),
  creditos_consumidos  INT64       OPTIONS(description='Total de créditos gastos neste alerta')
)
PARTITION BY criado_em
CLUSTER BY uid, status
OPTIONS(
  description='Watchlist de alertas publicou-pegamos por usuário. CPF apenas como hash SHA-256.'
);

-- -----------------------------------------------------------------------------
-- 4. alertas_log
--    Log imutável de todos os disparos de alertas.
--    Auditoria financeira e operacional.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.alertas_log` (
  log_id               STRING      OPTIONS(description='UUID do evento de log'),
  alerta_id            STRING      OPTIONS(description='FK alertas_watchlist.alerta_id'),
  uid                  STRING      OPTIONS(description='Firebase UID do usuário'),
  disparado_em         TIMESTAMP,
  job_run_id           STRING      OPTIONS(description='ID da execução do Cloud Run Job'),

  -- O que foi encontrado
  fonte                STRING      OPTIONS(description='DOU|PJe|querido_diario'),
  publicacao_url       STRING      OPTIONS(description='URL da publicação encontrada'),
  publicacao_data      DATE,
  resumo               STRING      OPTIONS(description='Trecho da publicação (sem PII)'),

  -- Anti-waste PJe
  pje_verificado       BOOL,
  pje_status           STRING      OPTIONS(description='LIVRE|VERIFICAR|DESCARTAR'),
  pje_verificado_em    TIMESTAMP,

  -- Notificação
  notificacao_fcm      BOOL,
  notificacao_telegram BOOL,
  creditos_debitados   INT64
)
PARTITION BY disparado_em
CLUSTER BY uid, fonte
OPTIONS(
  description='Log imutável de disparos de alertas publicou-pegamos. Retenção: 5 anos.'
);

-- -----------------------------------------------------------------------------
-- 5. pje_litispendencia_cache
--    Cache de consultas PJe TRF3 com TTL de 48h.
--    Reduz chamadas à API do tribunal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.pje_litispendencia_cache` (
  cache_key            STRING      OPTIONS(description='cpf_hash:uf ou numero_processo'),
  consultado_em        TIMESTAMP,
  expira_em            TIMESTAMP   OPTIONS(description='consultado_em + 48h'),
  status               STRING      OPTIONS(description='LIVRE|VERIFICAR|DESCARTAR|ERRO'),
  numero_processo      STRING      OPTIONS(description='Número do processo encontrado (se DESCARTAR)'),
  tribunal             STRING      OPTIONS(description='TRF1|TRF2|TRF3|TJSP|...')
)
PARTITION BY consultado_em
CLUSTER BY status
OPTIONS(
  description='Cache de consultas PJe. TTL 48h. Reduz quota da API do tribunal.'
);

-- -----------------------------------------------------------------------------
-- 6. lgpd_audit_radar
--    Log imutável de auditoria LGPD específico do Radar Jurídico.
--    CPF nunca em claro — apenas hash SHA-256.
--    Retenção: 5 anos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.lgpd_audit_radar` (
  audit_id             STRING      OPTIONS(description='UUID do evento de auditoria'),
  timestamp            TIMESTAMP,
  trace_id             STRING      OPTIONS(description='Trace ID do request Cloud Run'),
  uid                  STRING      OPTIONS(description='Firebase UID do operador'),

  -- O que foi acessado
  cpf_hash             STRING      OPTIONS(description='SHA-256 do CPF consultado (NUNCA CPF em claro)'),
  connector            STRING      OPTIONS(description='dataprev_oficial|serasa_quod|consent_form|peticao_template'),
  base_legal           STRING      OPTIONS(description='art7_iii|art7_ix|art7_i|art7_v'),
  acao                 STRING      OPTIONS(description='enrichment|scoring|export|alerta'),

  -- Resultado
  sucesso              BOOL,
  payload_hash         STRING      OPTIONS(description='SHA-256 do payload retornado (sem PII)'),
  duration_ms          INT64
)
PARTITION BY timestamp
CLUSTER BY connector, uid
OPTIONS(
  description='Auditoria LGPD imutável. CPF apenas como SHA-256. Retenção mínima: 5 anos.'
);

-- =============================================================================
-- Views para o backend (leitura safe — sem PII, com paginação server-side)
-- =============================================================================

-- TODO(maestro): criar view vw_leads_scored_safe que:
--   1. Faz JOIN entre leads_radar_scored e leads_radar_raw
--   2. Retorna APENAS campos sem PII (sem cpf, sem nome, sem dt_nascimento exata)
--   3. Aplica filtros de uf, especie_codigo, score_min configuráveis via parâmetros
--   4. Ordena por score_match_icp DESC
--   Exemplo de estrutura esperada:
/*
CREATE OR REPLACE VIEW `transparenciabr.radar_juridico.vw_leads_scored_safe` AS
SELECT
  s.lead_id,
  s.score_match_icp,
  s.tipo_acao_id,
  s.tipo_acao_label,
  s.tese_recomendada,
  s.foco_atual,
  s.ticket_estimado_brl,
  s.prob_conversao,
  r.uf,
  r.especie_nome,
  r.motivo_indeferimento,
  r.clientela,
  r.forma_filiacao,
  r.aps_nome,
  -- CPF mascarado como placeholder (não existe na fonte pública)
  '***.***.***-**' AS cpf_mascarado,
  -- Idade aproximada (sem revelar dt_nascimento exata)
  DATE_DIFF(CURRENT_DATE(), r.dt_nascimento, YEAR) AS idade_aproximada,
  r.dt_indeferimento
FROM `transparenciabr.radar_juridico.leads_radar_scored` s
JOIN `transparenciabr.radar_juridico.leads_radar_raw` r
  ON s._row_hash = r._row_hash;
*/
