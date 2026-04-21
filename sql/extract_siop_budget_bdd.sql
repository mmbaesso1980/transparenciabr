-- Extrato SIOP / LOA → colunas consumidas por `engines/17_ingest_siop_budget.py`.
-- IMPORTANTE: valide o identificador completo da tabela no catálogo Base dos Dados
-- (console BigQuery ou basedosdados.org). O nome exato da tabela muda quando a BDD atualiza.
--
-- Parâmetro: @ano_min (INT64) — exercício mínimo inclusivo.

SELECT
  SAFE_CAST(ano AS INT64) AS exercicio,
  CAST(orgao_superior AS STRING) AS orgao_nome,
  CAST(nome_funcao AS STRING) AS funcao_nome,
  CAST(nome_subfuncao AS STRING) AS subfuncao_nome,
  SAFE_CAST(valor_orcamento_atual AS FLOAT64) AS valor_dotacao_atual
FROM `basedosdados.br_me_siop.des_orcamento_loa`
WHERE SAFE_CAST(ano AS INT64) >= @ano_min
