-- Orçamento federal (LOA / SIOP via ingestão) e itens do PCA (PNCP).
-- Ajuste de nomes de colunas na origem: `sql/extract_siop_budget_bdd.sql`

CREATE TABLE IF NOT EXISTS `transparenciabr.orcamento_federal` (
  row_key STRING NOT NULL OPTIONS(description='SHA256 estável da linha de dotacao'),
  exercicio INT64 NOT NULL,
  orgao_nome STRING,
  funcao_nome STRING,
  subfuncao_nome STRING,
  valor_dotacao_atual FLOAT64,
  ingested_at TIMESTAMP
)
CLUSTER BY exercicio, orgao_nome;

CREATE TABLE IF NOT EXISTS `transparenciabr.pncp_pca_itens` (
  row_key STRING NOT NULL OPTIONS(description='SHA256 linha PCA normalizada'),
  codigo_ibge_municipio STRING OPTIONS(description='IBGE 7 dígitos'),
  item_descricao STRING,
  quantidade_estimada FLOAT64,
  valor_unitario_estimado FLOAT64,
  ano_exercicio INT64,
  numero_controle_plano STRING,
  orgao_nome STRING,
  orgao_cnpj STRING,
  orgao_email STRING,
  orgao_telefone STRING,
  payload_raw STRING OPTIONS(description='JSON bruto para auditoria'),
  ingested_at TIMESTAMP
)
CLUSTER BY codigo_ibge_municipio, ano_exercicio;
