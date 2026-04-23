CREATE OR REPLACE TABLE `transparenciabr.fiscalizapa.dim_parlamentar` (
  id_parlamentar STRING NOT NULL,
  casa STRING NOT NULL,
  nome STRING NOT NULL,
  slug STRING,
  sigla_partido STRING,
  uf STRING,
  score_asmodeus INT64,
  _updated_at TIMESTAMP
) CLUSTER BY uf, sigla_partido, casa;
