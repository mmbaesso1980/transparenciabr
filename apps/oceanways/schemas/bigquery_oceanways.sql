-- =============================================================================
-- Ocean Ways — BigQuery DDL
-- Dataset: oceanways (projeto: projeto-codex-br)
-- Região: US (padrão BigQuery; ajustar para southamerica-east1 se LGPD exigir)
-- Criação: bq mk --dataset --location=US projeto-codex-br:oceanways
-- =============================================================================
-- Versão: R1
-- Data: 2026-05-30
-- Aprovado por: Comandante Maurílio Baesso
--
-- IMPORTANTE: Nenhum dado PII em texto claro neste dataset.
-- uid é o identificador Firebase (pseudonimizado).
-- E-mail, nome, CPF → ficam somente no Firestore com controle de acesso.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.searches
-- Registro de cada busca realizada (sem PII direta).
-- Particionada por data da busca; clusterizada por rota.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.searches` (
  search_id       STRING    NOT NULL OPTIONS(description='UUID v4 gerado pelo backend'),
  uid             STRING    NOT NULL OPTIONS(description='Firebase UID do usuário — pseudonimizado'),
  origin_iata     STRING    NOT NULL OPTIONS(description='IATA do aeroporto de origem, ex: GRU'),
  dest_iata       STRING    NOT NULL OPTIONS(description='IATA do aeroporto de destino, ex: LHR'),
  dep_date        DATE      NOT NULL OPTIONS(description='Data de partida solicitada'),
  ret_date        DATE               OPTIONS(description='Data de retorno, se roundtrip'),
  cabin           STRING    NOT NULL OPTIONS(description='ECONOMY | BUSINESS | FIRST'),
  programs        ARRAY<STRING>      OPTIONS(description='Programas de milhas solicitados, ex: ["SMILES","UATP"]'),
  sources_queried ARRAY<STRING>      OPTIONS(description='Sources efetivamente consultadas pelo aggregator'),
  cache_hit       BOOL      NOT NULL DEFAULT FALSE OPTIONS(description='TRUE se resultado veio do cache Firestore'),
  results_count   INT64              OPTIONS(description='Número de resultados retornados'),
  credits_charged INT64     NOT NULL DEFAULT 0 OPTIONS(description='Créditos debitados nesta busca (0 se cache hit)'),
  duration_ms     INT64              OPTIONS(description='Latência total da busca em ms'),
  searched_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(searched_at)
CLUSTER BY origin_iata, dest_iata, cabin
OPTIONS(
  description='Registro de buscas de award flights — sem PII direta. UID pseudonimizado.',
  require_partition_filter=false
);


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.results
-- Resultados individuais de cada busca.
-- Referencia searches.search_id via join.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.results` (
  result_id       STRING    NOT NULL OPTIONS(description='UUID v4'),
  search_id       STRING    NOT NULL OPTIONS(description='FK → oceanways.searches.search_id'),
  source          STRING    NOT NULL OPTIONS(description='Nome da fonte: UNITED|AIRFRANCE|SEEK|AMADEUS|...'),
  program         STRING    NOT NULL OPTIONS(description='Código do programa: UATP|FLYINGBLUE|SMILES|...'),
  alliance        STRING             OPTIONS(description='STAR|SKYTEAM|ONEWORLD|NONE'),
  operating_carrier STRING           OPTIONS(description='IATA da cia operadora, ex: UA'),
  flight_number   STRING             OPTIONS(description='Ex: UA864'),
  origin_iata     STRING    NOT NULL,
  dest_iata       STRING    NOT NULL,
  dep_datetime    TIMESTAMP          OPTIONS(description='Decolagem local → armazenar em UTC'),
  arr_datetime    TIMESTAMP          OPTIONS(description='Chegada local → armazenar em UTC'),
  cabin           STRING    NOT NULL,
  miles_cost      INT64              OPTIONS(description='Custo em milhas/pontos'),
  taxes_brl       FLOAT64            OPTIONS(description='Taxas em BRL; NULL se não disponível'),
  taxes_usd       FLOAT64            OPTIONS(description='Taxas em USD; NULL se não disponível'),
  seats_available INT64              OPTIONS(description='Assentos disponíveis; NULL se fonte não informa'),
  raw_payload     JSON               OPTIONS(description='Payload bruto da fonte para auditoria e debug'),
  fetched_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(fetched_at)
CLUSTER BY search_id, source, program
OPTIONS(
  description='Resultados individuais de disponibilidade award. Raw payload preservado para debug.'
);


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.users
-- Snapshot de estado do usuário para analytics.
-- NOT a source of truth — Firestore é o SoT.
-- Atualizado via Cloud Run event ou Firestore trigger export.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.users` (
  uid             STRING    NOT NULL OPTIONS(description='Firebase UID'),
  plan            STRING    NOT NULL OPTIONS(description='FREE|PRO'),
  credits_balance INT64     NOT NULL DEFAULT 0,
  credits_monthly INT64     NOT NULL DEFAULT 0 OPTIONS(description='Créditos do plano no ciclo atual'),
  credits_topup   INT64     NOT NULL DEFAULT 0 OPTIONS(description='Créditos top-up acumulados (sem expiração)'),
  plan_renewal_at DATE               OPTIONS(description='Próxima renovação do plano'),
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  -- NUNCA adicionar: email, nome, CPF, telefone — ficam só no Firestore
  country_code    STRING             OPTIONS(description='BR|US|... — derivado do IP no cadastro, para analytics de geo'),
  acquisition_source STRING          OPTIONS(description='organic|google_ads|referral|... — utm_source no cadastro')
)
PARTITION BY DATE(updated_at)
CLUSTER BY plan
OPTIONS(
  description='Snapshot de usuários para analytics. SoT é Firestore. Sem PII sensível.'
);


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.credits
-- Ledger de movimentações de crédito por usuário.
-- Imutável: nunca deletar rows. Para correção, inserir linha de estorno.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.credits` (
  credit_id       STRING    NOT NULL OPTIONS(description='UUID v4'),
  uid             STRING    NOT NULL OPTIONS(description='Firebase UID'),
  operation       STRING    NOT NULL OPTIONS(description='DEBIT|CREDIT|REFUND|EXPIRY'),
  amount          INT64     NOT NULL OPTIONS(description='Positivo=crédito, negativo=débito'),
  balance_after   INT64     NOT NULL OPTIONS(description='Saldo após operação — snapshot para auditoria'),
  reason          STRING    NOT NULL OPTIONS(description='SEARCH|ALERT_HIT|PLAN_RENEWAL|TOPUP|REFUND|EXPIRY'),
  reference_id    STRING             OPTIONS(description='search_id, alert_id, transaction_id conforme o reason'),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY uid, operation
OPTIONS(
  description='Ledger imutável de créditos. Nunca deletar. Estornos via REFUND operation.'
);


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.transactions
-- Registro de pagamentos (Stripe + MercadoPago).
-- Referência ao payment_gateway_id para reconciliação.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.transactions` (
  transaction_id      STRING    NOT NULL OPTIONS(description='UUID interno'),
  uid                 STRING    NOT NULL OPTIONS(description='Firebase UID'),
  gateway             STRING    NOT NULL OPTIONS(description='STRIPE|MERCADOPAGO'),
  gateway_payment_id  STRING    NOT NULL OPTIONS(description='ID do pagamento no gateway (para reconciliação)'),
  gateway_event_type  STRING             OPTIONS(description='checkout.session.completed, payment.approved, etc.'),
  amount_brl          FLOAT64   NOT NULL OPTIONS(description='Valor pago em BRL'),
  amount_usd          FLOAT64            OPTIONS(description='Valor em USD se cartão internacional'),
  product             STRING    NOT NULL OPTIONS(description='PLAN_PRO|TOPUP_100'),
  credits_granted     INT64     NOT NULL OPTIONS(description='Créditos adicionados ao usuário'),
  status              STRING    NOT NULL OPTIONS(description='PENDING|COMPLETED|FAILED|REFUNDED'),
  -- Dados de pagamento sensíveis (cartão, CPF) NUNCA aqui — ficam no gateway
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY uid, gateway, status
OPTIONS(
  description='Transações financeiras. Dados sensíveis ficam no gateway. Reconciliação via gateway_payment_id.'
);


-- -----------------------------------------------------------------------------
-- Tabela: oceanways.alerts
-- Alertas de disponibilidade configurados pelos usuários.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projeto-codex-br.oceanways.alerts` (
  alert_id        STRING    NOT NULL OPTIONS(description='UUID v4'),
  uid             STRING    NOT NULL OPTIONS(description='Firebase UID'),
  origin_iata     STRING    NOT NULL,
  dest_iata       STRING    NOT NULL,
  dep_date_from   DATE      NOT NULL OPTIONS(description='Início da janela de datas aceitas'),
  dep_date_to     DATE      NOT NULL OPTIONS(description='Fim da janela de datas aceitas'),
  cabin           STRING    NOT NULL OPTIONS(description='ECONOMY|BUSINESS|FIRST'),
  programs        ARRAY<STRING>      OPTIONS(description='Programas de milhas monitorados'),
  max_miles       INT64              OPTIONS(description='Limite de milhas aceito; NULL = qualquer'),
  active          BOOL      NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMP          OPTIONS(description='Última vez que o alert-checker rodou para este alerta'),
  next_check_at   TIMESTAMP          OPTIONS(description='Próxima checagem agendada'),
  hits_count      INT64     NOT NULL DEFAULT 0 OPTIONS(description='Quantas vezes disparou'),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  deactivated_at  TIMESTAMP          OPTIONS(description='Quando foi desativado; NULL se ainda ativo')
)
PARTITION BY DATE(created_at)
CLUSTER BY uid, active
OPTIONS(
  description='Alertas de disponibilidade. alert-checker lê esta tabela periodicamente.'
);


-- -----------------------------------------------------------------------------
-- View: oceanways.v_search_stats_daily
-- Estatísticas diárias de busca para dashboard interno.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `projeto-codex-br.oceanways.v_search_stats_daily` AS
SELECT
  DATE(searched_at)                        AS search_date,
  origin_iata,
  dest_iata,
  cabin,
  COUNT(*)                                 AS total_searches,
  COUNTIF(cache_hit = TRUE)                AS cache_hits,
  COUNTIF(cache_hit = FALSE)               AS cache_misses,
  AVG(duration_ms)                         AS avg_duration_ms,
  SUM(credits_charged)                     AS total_credits_charged,
  AVG(results_count)                       AS avg_results_per_search
FROM `projeto-codex-br.oceanways.searches`
GROUP BY 1, 2, 3, 4;


-- -----------------------------------------------------------------------------
-- View: oceanways.v_revenue_daily
-- Receita diária por gateway para dashboard financeiro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `projeto-codex-br.oceanways.v_revenue_daily` AS
SELECT
  DATE(created_at)                         AS txn_date,
  gateway,
  product,
  status,
  COUNT(*)                                 AS transactions_count,
  SUM(amount_brl)                          AS total_brl,
  SUM(credits_granted)                     AS total_credits_sold
FROM `projeto-codex-br.oceanways.transactions`
GROUP BY 1, 2, 3, 4;
