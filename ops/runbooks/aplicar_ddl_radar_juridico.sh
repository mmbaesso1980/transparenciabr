#!/usr/bin/env bash
# aplicar_ddl_radar_juridico.sh
# ============================
# Aplica a infraestrutura GCP que o Maestro pediu (Fase 0 dos 2 projetos).
# Idempotente: pode rodar várias vezes sem quebrar nada.
#
# CONTEXTO
# --------
# O Maestro v1.0 não tem acesso a CLIs gcloud/bq/firebase no ambiente Cloud Run.
# Por isso ele gera o DDL e pede pro Comandante aplicar. Este script faz isso.
#
# COMO RODAR
# ----------
# Cole no Google Cloud Shell ou na VM aurora-cacador-br:
#     curl -sL https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/ops/runbooks/aplicar_ddl_radar_juridico.sh | bash
#
# Ou baixe e execute manualmente:
#     bash aplicar_ddl_radar_juridico.sh
#
# FREIOS
# ------
# - set -euo pipefail: para no primeiro erro
# - bq mk com '|| true' para datasets que já existem
# - CREATE TABLE IF NOT EXISTS para tabelas

set -euo pipefail

LOG="/tmp/aplicar_ddl_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo "🚀 Aplicar DDL — Radar Jurídico INSS + Ocean Ways"
echo "📅 $(date -u +%FT%TZ)"
echo "📝 Log: $LOG"
echo "================================================================"

# ============================================================
# PROJETO A — RADAR JURÍDICO INSS (dataset radar_juridico)
# ============================================================
echo ""
echo "════════ PROJETO A — Radar Jurídico INSS ════════"

echo ""
echo "▶ 1.1: Dataset radar_juridico (transparenciabr / southamerica-east1)"
bq mk \
  --location=southamerica-east1 \
  --dataset \
  --description="Radar Jurídico INSS — leads de indeferimentos + enriquecimento PII (AURORA 4 caminhos)" \
  "transparenciabr:radar_juridico" 2>&1 | grep -v "already exists" || true

echo ""
echo "▶ 1.2: Tabela leads_radar_raw (microdados públicos INSS, sem PII)"
bq query --location=southamerica-east1 --use_legacy_sql=false <<'EOF'
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.leads_radar_raw` (
  mes_referencia       DATE      OPTIONS(description='Competência do indeferimento (YYYY-MM-01)'),
  source_file          STRING    OPTIONS(description='Nome do arquivo XLSX origem'),
  _row_hash            STRING    OPTIONS(description='SHA-256 de campos-chave (idempotência)'),
  _loaded_at           TIMESTAMP OPTIONS(description='Timestamp de carga no BQ'),
  dt_nascimento        DATE      OPTIONS(description='Data de nascimento do beneficiário'),
  sexo                 STRING    OPTIONS(description='M/F'),
  uf                   STRING    OPTIONS(description='UF do beneficiário (2 chars)'),
  especie_codigo       INT64     OPTIONS(description='Código de espécie do benefício INSS'),
  especie_nome         STRING    OPTIONS(description='Descrição da espécie'),
  motivo_indeferimento STRING    OPTIONS(description='Motivo literal do indeferimento'),
  dt_indeferimento     DATE      OPTIONS(description='Data do despacho de indeferimento'),
  dt_der               DATE      OPTIONS(description='Data de entrada do requerimento'),
  clientela            STRING    OPTIONS(description='Urbano/Rural/Outros'),
  forma_filiacao       STRING    OPTIONS(description='Forma de filiação ao RGPS'),
  ramo_atividade       STRING    OPTIONS(description='CNAE / ramo do empregador'),
  aps_codigo           INT64     OPTIONS(description='Código da agência INSS'),
  aps_nome             STRING    OPTIONS(description='Nome da agência INSS (proxy geográfico)')
)
PARTITION BY dt_indeferimento
CLUSTER BY uf, especie_codigo
OPTIONS(
  description='Microdados públicos de indeferimentos INSS (dados.gov.br). SEM PII. Radar Jurídico INSS.',
  require_partition_filter = FALSE
);
EOF

echo ""
echo "▶ 1.3: Tabela leads_radar_scored (com score AURORA, lead_id, tipo_acao)"
bq query --location=southamerica-east1 --use_legacy_sql=false <<'EOF'
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.leads_radar_scored` (
  lead_id              STRING    OPTIONS(description='UUID gerado pelo pipeline de scoring'),
  _row_hash            STRING    OPTIONS(description='FK para leads_radar_raw._row_hash'),
  scored_at            TIMESTAMP OPTIONS(description='Quando o score foi calculado'),
  dt_indeferimento     DATE,
  uf                   STRING,
  especie_codigo       INT64,
  especie_nome         STRING,
  motivo_indeferimento STRING,
  clientela            STRING,
  forma_filiacao       STRING,
  aps_nome             STRING,
  score_match_icp      FLOAT64   OPTIONS(description='Score match ICP 0.0-100.0'),
  tipo_acao_id         STRING    OPTIONS(description='pcd_idade|pcd_tempo|bpc_def|bpc_idoso|especial|rural|hibrida'),
  tipo_acao_label      STRING    OPTIONS(description='Label legível do tipo de ação'),
  prioridade           STRING    OPTIONS(description='ALTA|MEDIA|BAIXA — baseado em score'),
  status               STRING    OPTIONS(description='novo|visualizado|em_contato|convertido|descartado')
)
PARTITION BY DATE(scored_at)
CLUSTER BY uf, prioridade
OPTIONS(
  description='Leads do Radar Jurídico INSS após scoring AURORA. JOIN com raw via _row_hash.'
);
EOF

echo ""
echo "▶ 1.4: Tabela enrichment_log (auditoria dos 4 caminhos AURORA)"
bq query --location=southamerica-east1 --use_legacy_sql=false <<'EOF'
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.enrichment_log` (
  enrichment_id  STRING,
  lead_id        STRING,
  caminho        STRING    OPTIONS(description='A_dataprev|B_serasa|C_landing|D_peticao'),
  status         STRING    OPTIONS(description='solicitado|sucesso|negado|erro|expirado'),
  attempted_at   TIMESTAMP,
  resolved_at    TIMESTAMP,
  base_legal     STRING    OPTIONS(description='LGPD art. 7º IX | art. 11 II g | consentimento explícito'),
  custo_estimado FLOAT64   OPTIONS(description='Custo em R$ do enriquecimento'),
  error_msg      STRING
)
PARTITION BY DATE(attempted_at)
CLUSTER BY caminho, status
OPTIONS(
  description='Log de tentativas de enriquecimento PII pelos 4 caminhos legais AURORA.'
);
EOF

echo ""
echo "▶ 1.5: Tabela creditos_log (saldo de buscas + ações no escritório)"
bq query --location=southamerica-east1 --use_legacy_sql=false <<'EOF'
CREATE TABLE IF NOT EXISTS `transparenciabr.radar_juridico.creditos_log` (
  tx_id          STRING,
  user_uid       STRING    OPTIONS(description='Firebase Auth UID do advogado'),
  tipo           STRING    OPTIONS(description='credit|debit|refund'),
  produto        STRING    OPTIONS(description='abrir_contatos|gerar_peticao|enriquecimento|alerta'),
  qtd            INT64     OPTIONS(description='Quantidade de créditos movimentados'),
  saldo_apos     INT64     OPTIONS(description='Saldo do usuário após esta tx'),
  ref_lead_id    STRING    OPTIONS(description='Lead associado, se aplicável'),
  ref_payment_id STRING    OPTIONS(description='Pagamento Stripe/MP que originou créditos'),
  created_at     TIMESTAMP,
  metadata       STRING    OPTIONS(description='JSON adicional')
)
PARTITION BY DATE(created_at)
CLUSTER BY user_uid, tipo
OPTIONS(
  description='Ledger imutável de créditos do Radar Jurídico. Append-only. NUNCA DELETE.'
);
EOF

echo ""
echo "▶ 1.6: View vw_leads_scored_safe (sem PII, segura para exposição)"
bq query --location=southamerica-east1 --use_legacy_sql=false <<'EOF'
CREATE VIEW IF NOT EXISTS `transparenciabr.radar_juridico.vw_leads_scored_safe` AS
SELECT
  lead_id,
  scored_at,
  dt_indeferimento,
  uf,
  especie_codigo,
  especie_nome,
  motivo_indeferimento,
  clientela,
  forma_filiacao,
  aps_nome,
  score_match_icp,
  tipo_acao_id,
  tipo_acao_label,
  prioridade,
  status
FROM `transparenciabr.radar_juridico.leads_radar_scored`
WHERE status != 'descartado';
EOF

# ============================================================
# PROJETO B — OCEAN WAYS (dataset oceanways_dev/oceanways_prod)
# ============================================================
echo ""
echo "════════ PROJETO B — Ocean Ways ════════"

echo ""
echo "▶ 2.1: Datasets oceanways_dev e oceanways_prod (projeto-codex-br / US)"

bq mk \
  --location=US \
  --dataset \
  --description="Ocean Ways — DEV environment (award flights, créditos, alertas)" \
  "projeto-codex-br:oceanways_dev" 2>&1 | grep -v "already exists" || true

bq mk \
  --location=US \
  --dataset \
  --description="Ocean Ways — PRODUCTION environment" \
  "projeto-codex-br:oceanways_prod" 2>&1 | grep -v "already exists" || true

echo ""
echo "▶ 2.2: Tabelas Ocean Ways (5 tabelas + 2 views) — dataset DEV"

for ENV in oceanways_dev oceanways_prod; do
  echo ""
  echo "  ▷ Aplicando em $ENV..."
  bq query --location=US --use_legacy_sql=false --parameter="env::${ENV}" <<EOF
CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.searches\` (
  search_id    STRING,
  user_uid     STRING,
  origin       STRING,
  destination  STRING,
  date_range   STRING,
  alliances    ARRAY<STRING>,
  cabin_class  STRING,
  result_count INT64,
  credits_used INT64,
  created_at   TIMESTAMP,
  duration_ms  INT64
)
PARTITION BY DATE(created_at)
CLUSTER BY user_uid;

CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.results\` (
  result_id        STRING,
  search_id        STRING,
  source           STRING,
  airline_code     STRING,
  alliance         STRING,
  flight_number    STRING,
  departure        TIMESTAMP,
  arrival          TIMESTAMP,
  cabin            STRING,
  miles_required   INT64,
  taxes_brl        FLOAT64,
  taxes_orig_ccy   STRING,
  taxes_orig_value FLOAT64,
  raw_response     STRING,
  created_at       TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY source, alliance;

CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.users\` (
  uid          STRING,
  plan         STRING,
  created_at   TIMESTAMP,
  last_login   TIMESTAMP,
  consent_lgpd BOOL,
  consent_ts   TIMESTAMP,
  status       STRING
)
CLUSTER BY plan;

CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.credits\` (
  tx_id              STRING,
  uid                STRING,
  type               STRING,
  amount             INT64,
  balance_after      INT64,
  reason             STRING,
  ref_search_id      STRING,
  ref_payment_id     STRING,
  gateway_payment_id STRING,
  created_at         TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY uid, type;

CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.transactions\` (
  payment_id         STRING,
  uid                STRING,
  gateway            STRING,
  gateway_payment_id STRING,
  product            STRING,
  amount_brl         FLOAT64,
  status             STRING,
  created_at         TIMESTAMP,
  confirmed_at       TIMESTAMP,
  webhook_payload    STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY uid;

CREATE TABLE IF NOT EXISTS \`projeto-codex-br.${ENV}.alerts\` (
  alert_id     STRING,
  uid          STRING,
  origin       STRING,
  destination  STRING,
  date_from    DATE,
  date_to      DATE,
  alliances    ARRAY<STRING>,
  status       STRING,
  last_checked TIMESTAMP,
  created_at   TIMESTAMP
)
CLUSTER BY uid, status;

CREATE VIEW IF NOT EXISTS \`projeto-codex-br.${ENV}.vw_user_summary\` AS
SELECT
  u.uid,
  u.plan,
  COUNT(DISTINCT s.search_id) AS total_searches,
  COUNT(DISTINCT a.alert_id) AS active_alerts,
  COALESCE(SUM(IF(c.type='credit', c.amount, 0)) - SUM(IF(c.type='debit', c.amount, 0)), 0) AS current_balance
FROM \`projeto-codex-br.${ENV}.users\` u
LEFT JOIN \`projeto-codex-br.${ENV}.searches\` s ON u.uid = s.user_uid
LEFT JOIN \`projeto-codex-br.${ENV}.alerts\` a ON u.uid = a.uid AND a.status = 'active'
LEFT JOIN \`projeto-codex-br.${ENV}.credits\` c ON u.uid = c.uid
GROUP BY u.uid, u.plan;
EOF
done

echo ""
echo "================================================================"
echo "✅ DDL APLICADO COM SUCESSO"
echo "================================================================"
echo ""
echo "Recursos criados:"
echo "  📦 transparenciabr:radar_juridico (sa-east1)"
echo "    ├── leads_radar_raw"
echo "    ├── leads_radar_scored"
echo "    ├── enrichment_log"
echo "    ├── creditos_log"
echo "    └── vw_leads_scored_safe"
echo ""
echo "  📦 projeto-codex-br:oceanways_dev (US)"
echo "  📦 projeto-codex-br:oceanways_prod (US)"
echo "    ├── searches"
echo "    ├── results"
echo "    ├── users"
echo "    ├── credits"
echo "    ├── transactions"
echo "    ├── alerts"
echo "    └── vw_user_summary"
echo ""
echo "📝 Log completo: $LOG"
echo ""
echo "Próximo passo: avisar Maestro via Telegram que infra está pronta:"
echo "  /maestro fase-0-completa allow-fase-1"
