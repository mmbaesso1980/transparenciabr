CREATE OR REPLACE TABLE `transparenciabr.fiscalizapa.fato_emenda_pix` (
  id_emenda STRING NOT NULL,
  ano_orcamento INT64,
  id_parlamentar STRING,
  cod_ibge STRING,
  uf STRING,
  nome_municipio STRING,
  valor_indicado NUMERIC,
  valor_empenhado NUMERIC,
  valor_pago NUMERIC,
  data_empenho DATE,
  data_pagamento DATE,
  _ingerido_em TIMESTAMP
)
PARTITION BY DATE_TRUNC(data_empenho, MONTH)
CLUSTER BY id_parlamentar, uf;
