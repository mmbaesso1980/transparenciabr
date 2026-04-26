#!/usr/bin/env python3
"""
Engine 15 - BQML K-Means para deteccao de empresas de fachada.

Este motor nao processa dados em Python. Ele apenas monta e submete jobs SQL
ao BigQuery para treinar um modelo ML.KMEANS e materializar a tabela final de
risco `cnpjs_alto_risco`.

Fonte esperada: tabela de contratos purificada pela Engine 02.
Destino padrao: `seu_projeto.fiscalizapa.modelo_fachada` e
`seu_projeto.fiscalizapa.cnpjs_alto_risco`.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set

from google.cloud import bigquery

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_15_ml_kmeans")

DEFAULT_MODEL_DATASET = os.environ.get("BQML_MODEL_DATASET", "fiscalizapa")
DEFAULT_SOURCE_TABLE = os.environ.get("BQML_SOURCE_TABLE", "pncp_contratos")
DEFAULT_MODEL_NAME = os.environ.get("BQML_MODEL_NAME", "modelo_fachada")
DEFAULT_RISK_TABLE = os.environ.get("BQML_RISK_TABLE", "cnpjs_alto_risco")
DEFAULT_NUM_CLUSTERS = int(os.environ.get("BQML_NUM_CLUSTERS", "5"))

CNPJ_CANDIDATES = (
    "cnpj_contratado",
    "cnpj_fornecedor",
    "nifornecedor",
    "ni_fornecedor",
    "fornecedor_ni_fornecedor",
    "payload_nifornecedor",
)
VALUE_CANDIDATES = (
    "valor_total",
    "valor_total_contratos",
    "valorglobal",
    "valor_global",
    "valorcontrato",
    "valor_contrato",
    "valorinicial",
    "valor_inicial",
)
CONTRACT_DATE_CANDIDATES = (
    "data_assinatura",
    "dataassinatura",
    "data_vigencia_inicio",
    "datavigenciainicio",
    "data_inicial_cursor",
    "fetched_at",
)
CNPJ_OPEN_DATE_CANDIDATES = (
    "data_abertura_cnpj",
    "dataaberturacnpj",
    "data_inicio_atividade",
    "datainicioatividade",
    "empresa_data_abertura",
    "data_abertura",
)
COMPANY_GEOPOINT_CANDIDATES = (
    "geopoint_empresa",
    "empresa_geopoint",
    "fornecedor_geopoint",
    "location_empresa",
)
AGENCY_GEOPOINT_CANDIDATES = (
    "geopoint_orgao",
    "orgao_geopoint",
    "contratante_geopoint",
    "location_orgao",
)
COMPANY_LAT_CANDIDATES = ("empresa_latitude", "fornecedor_latitude", "latitude_empresa", "lat_empresa")
COMPANY_LON_CANDIDATES = ("empresa_longitude", "fornecedor_longitude", "longitude_empresa", "lon_empresa", "lng_empresa")
AGENCY_LAT_CANDIDATES = ("orgao_latitude", "contratante_latitude", "latitude_orgao", "lat_orgao")
AGENCY_LON_CANDIDATES = ("orgao_longitude", "contratante_longitude", "longitude_orgao", "lon_orgao", "lng_orgao")


@dataclass(frozen=True)
class BQMLConfig:
    """Configuracao de origem, destino e hiperparametros BQML."""

    project_id: str
    source_dataset: str
    source_table: str
    model_dataset: str
    model_name: str
    risk_table: str
    num_clusters: int
    dry_run: bool = False

    @property
    def source_fqn(self) -> str:
        return f"{self.project_id}.{self.source_dataset}.{self.source_table}"

    @property
    def model_fqn(self) -> str:
        return f"{self.project_id}.{self.model_dataset}.{self.model_name}"

    @property
    def risk_table_fqn(self) -> str:
        return f"{self.project_id}.{self.model_dataset}.{self.risk_table}"


@dataclass(frozen=True)
class QueryExecution:
    """Resumo de execucao de um job SQL."""

    label: str
    job_id: Optional[str]
    elapsed_seconds: float
    dry_run: bool
    bytes_processed: Optional[int] = None


def _quote_fqn(fqn: str) -> str:
    """Retorna identificador BigQuery com backticks."""

    return f"`{fqn}`"


def _quote_column(name: str) -> str:
    """Retorna nome de coluna com backticks."""

    return f"`{name}`"


def _first_existing(columns: Set[str], candidates: Sequence[str]) -> Optional[str]:
    """Escolhe a primeira coluna disponivel entre candidatos."""

    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def _coalesce_numeric(columns: Set[str], candidates: Sequence[str], default: str = "0.0") -> str:
    """Monta COALESCE(SAFE_CAST(col AS FLOAT64), ...)."""

    parts = [f"SAFE_CAST({_quote_column(col)} AS FLOAT64)" for col in candidates if col in columns]
    if not parts:
        return default
    return f"COALESCE({', '.join(parts)}, {default})"


def _safe_date_expression(column: str) -> str:
    """Converte uma coluna de data variavel para DATE de forma tolerante."""

    col = _quote_column(column)
    return (
        f"COALESCE("
        f"SAFE_CAST({col} AS DATE), "
        f"DATE(SAFE_CAST({col} AS TIMESTAMP)), "
        f"SAFE.PARSE_DATE('%Y%m%d', CAST({col} AS STRING)), "
        f"SAFE.PARSE_DATE('%d/%m/%Y', CAST({col} AS STRING)), "
        f"SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(CAST({col} AS STRING), 1, 10))"
        f")"
    )


def _distance_expression(columns: Set[str]) -> str:
    """Monta distancia geografica quando houver GeoPoint/lat-lon na base."""

    company_geo = _first_existing(columns, COMPANY_GEOPOINT_CANDIDATES)
    agency_geo = _first_existing(columns, AGENCY_GEOPOINT_CANDIDATES)
    if company_geo and agency_geo:
        return (
            "SAFE.ST_DISTANCE("
            f"SAFE_CAST({_quote_column(company_geo)} AS GEOGRAPHY), "
            f"SAFE_CAST({_quote_column(agency_geo)} AS GEOGRAPHY)"
            ")"
        )

    company_lat = _first_existing(columns, COMPANY_LAT_CANDIDATES)
    company_lon = _first_existing(columns, COMPANY_LON_CANDIDATES)
    agency_lat = _first_existing(columns, AGENCY_LAT_CANDIDATES)
    agency_lon = _first_existing(columns, AGENCY_LON_CANDIDATES)
    if company_lat and company_lon and agency_lat and agency_lon:
        return (
            "SAFE.ST_DISTANCE("
            f"ST_GEOGPOINT(SAFE_CAST({_quote_column(company_lon)} AS FLOAT64), "
            f"SAFE_CAST({_quote_column(company_lat)} AS FLOAT64)), "
            f"ST_GEOGPOINT(SAFE_CAST({_quote_column(agency_lon)} AS FLOAT64), "
            f"SAFE_CAST({_quote_column(agency_lat)} AS FLOAT64))"
            ")"
        )

    return "0.0"


class BQMLKMeansEngine:
    """Orquestra treinamento K-Means e predicao de risco via jobs SQL BigQuery."""

    def __init__(self, client: bigquery.Client, config: BQMLConfig) -> None:
        self.client = client
        self.config = config

    async def run(self) -> List[QueryExecution]:
        """Executa criacao de dataset, treino do modelo e predicao de risco."""

        columns = await self._load_source_columns()
        logger.info(
            "Source table inspected: table=%s columns=%s",
            self.config.source_fqn,
            len(columns),
        )
        feature_sql = self._build_feature_sql(columns)
        queries: List[tuple[str, str]] = [
            ("ensure_dataset", self._build_dataset_sql()),
            ("train_kmeans_model", self._build_training_sql(feature_sql)),
            ("predict_high_risk_cnpjs", self._build_prediction_sql(feature_sql)),
        ]

        results: List[QueryExecution] = []
        for label, sql in queries:
            results.append(await self._run_query(label, sql))
        return results

    async def _load_source_columns(self) -> Set[str]:
        """Le apenas metadados do schema BigQuery para gerar SQL compativel."""

        def _get_columns() -> Set[str]:
            table = self.client.get_table(self.config.source_fqn)
            return {field.name.lower() for field in table.schema}

        return await asyncio.to_thread(_get_columns)

    def _build_dataset_sql(self) -> str:
        """SQL para garantir dataset de destino do modelo/tabela de risco."""

        return f"CREATE SCHEMA IF NOT EXISTS {_quote_fqn(f'{self.config.project_id}.{self.config.model_dataset}')}"

    def _build_feature_sql(self, columns: Set[str]) -> str:
        """Monta o SELECT de tensores exigidos para treino e predicao."""

        cnpj_col = _first_existing(columns, CNPJ_CANDIDATES)
        if not cnpj_col:
            raise ValueError(
                "Tabela de contratos sem coluna de CNPJ reconhecida. "
                f"Candidatas: {', '.join(CNPJ_CANDIDATES)}",
            )

        contract_date_col = _first_existing(columns, CONTRACT_DATE_CANDIDATES)
        cnpj_open_col = _first_existing(columns, CNPJ_OPEN_DATE_CANDIDATES)

        cnpj_expr = f"REGEXP_REPLACE(CAST({_quote_column(cnpj_col)} AS STRING), r'[^0-9]', '')"
        value_expr = _coalesce_numeric(columns, VALUE_CANDIDATES)
        contract_date_expr = _safe_date_expression(contract_date_col) if contract_date_col else "NULL"
        open_date_expr = _safe_date_expression(cnpj_open_col) if cnpj_open_col else "NULL"
        distance_expr = _distance_expression(columns)

        return f"""
WITH contratos_normalizados AS (
  SELECT
    {cnpj_expr} AS cnpj,
    {value_expr} AS valor_contrato,
    {contract_date_expr} AS data_primeiro_contrato,
    {open_date_expr} AS data_abertura_cnpj,
    {distance_expr} AS distancia_metros
  FROM {_quote_fqn(self.config.source_fqn)}
  WHERE {cnpj_expr} IS NOT NULL
    AND LENGTH({cnpj_expr}) = 14
),
features AS (
  SELECT
    cnpj,
    SUM(COALESCE(valor_contrato, 0.0)) AS valor_total_contratos,
    COUNT(1) AS frequencia_ganhos,
    COALESCE(
      DATE_DIFF(MIN(data_primeiro_contrato), MIN(data_abertura_cnpj), DAY),
      0
    ) AS idade_cnpj_dias,
    COALESCE(AVG(distancia_metros), 0.0) AS distancia_euclidiana
  FROM contratos_normalizados
  GROUP BY cnpj
)
SELECT
  cnpj,
  SAFE_CAST(valor_total_contratos AS FLOAT64) AS valor_total_contratos,
  SAFE_CAST(frequencia_ganhos AS FLOAT64) AS frequencia_ganhos,
  SAFE_CAST(idade_cnpj_dias AS FLOAT64) AS idade_cnpj_dias,
  SAFE_CAST(distancia_euclidiana AS FLOAT64) AS distancia_euclidiana
FROM features
"""

    def _build_training_sql(self, feature_sql: str) -> str:
        """SQL BQML requerido: CREATE OR REPLACE MODEL ... ML.KMEANS."""

        return f"""
CREATE OR REPLACE MODEL {_quote_fqn(self.config.model_fqn)}
OPTIONS(model_type='kmeans', num_clusters={self.config.num_clusters}) AS
SELECT
  valor_total_contratos,
  frequencia_ganhos,
  idade_cnpj_dias,
  distancia_euclidiana
FROM (
{feature_sql}
)
"""

    def _build_prediction_sql(self, feature_sql: str) -> str:
        """SQL ML.PREDICT que materializa cnpjs_alto_risco."""

        model_ref = _quote_fqn(self.config.model_fqn)
        risk_ref = _quote_fqn(self.config.risk_table_fqn)
        return f"""
CREATE OR REPLACE TABLE {risk_ref} AS
WITH features AS (
{feature_sql}
),
predicoes AS (
  SELECT
    cnpj,
    CENTROID_ID AS cluster,
    valor_total_contratos,
    frequencia_ganhos,
    idade_cnpj_dias,
    distancia_euclidiana,
    NEAREST_CENTROIDS_DISTANCE AS distancias_centroides
  FROM ML.PREDICT(
    MODEL {model_ref},
    (
      SELECT
        cnpj,
        valor_total_contratos,
        frequencia_ganhos,
        idade_cnpj_dias,
        distancia_euclidiana
      FROM features
    )
  )
),
cluster_stats AS (
  SELECT
    cluster,
    AVG(valor_total_contratos) AS cluster_avg_valor_total_contratos,
    AVG(frequencia_ganhos) AS cluster_avg_frequencia_ganhos,
    AVG(idade_cnpj_dias) AS cluster_avg_idade_cnpj_dias,
    AVG(distancia_euclidiana) AS cluster_avg_distancia_euclidiana
  FROM predicoes
  GROUP BY cluster
),
thresholds AS (
  SELECT
    APPROX_QUANTILES(cluster_avg_valor_total_contratos, 100)[OFFSET(75)] AS valor_cluster_p75,
    APPROX_QUANTILES(cluster_avg_frequencia_ganhos, 100)[OFFSET(75)] AS frequencia_cluster_p75
  FROM cluster_stats
),
clusters_anomalos AS (
  SELECT
    cs.*,
    CASE
      WHEN cs.cluster_avg_idade_cnpj_dias <= 30
       AND cs.cluster_avg_valor_total_contratos >= t.valor_cluster_p75 THEN 'CRITICO'
      WHEN cs.cluster_avg_idade_cnpj_dias <= 90
        OR cs.cluster_avg_valor_total_contratos >= t.valor_cluster_p75
        OR cs.cluster_avg_frequencia_ganhos >= t.frequencia_cluster_p75 THEN 'ALTO'
      ELSE 'MEDIO'
    END AS nivel_risco
  FROM cluster_stats cs
  CROSS JOIN thresholds t
  WHERE cs.cluster_avg_idade_cnpj_dias <= 90
     OR cs.cluster_avg_valor_total_contratos >= t.valor_cluster_p75
     OR cs.cluster_avg_frequencia_ganhos >= t.frequencia_cluster_p75
)
SELECT
  p.cnpj,
  p.cluster,
  ca.nivel_risco,
  p.valor_total_contratos,
  p.frequencia_ganhos,
  p.idade_cnpj_dias,
  p.distancia_euclidiana,
  ca.cluster_avg_valor_total_contratos,
  ca.cluster_avg_frequencia_ganhos,
  ca.cluster_avg_idade_cnpj_dias,
  ca.cluster_avg_distancia_euclidiana,
  p.distancias_centroides,
  CURRENT_TIMESTAMP() AS avaliado_em
FROM predicoes p
JOIN clusters_anomalos ca
  USING (cluster)
"""

    async def _run_query(self, label: str, sql: str) -> QueryExecution:
        """Submete uma query BigQuery em thread e registra tempo de execucao."""

        logger.info("BigQuery job starting: label=%s dry_run=%s", label, self.config.dry_run)
        started = time.perf_counter()

        def _submit_and_wait() -> QueryExecution:
            job_config = bigquery.QueryJobConfig(
                dry_run=self.config.dry_run,
                use_query_cache=False,
                labels={"engine": "15_kmeans", "step": re.sub(r"[^a-z0-9_]", "_", label.lower())[:63]},
            )
            job = self.client.query(sql, job_config=job_config)
            if not self.config.dry_run:
                job.result()
            elapsed = time.perf_counter() - started
            bytes_processed = getattr(job, "total_bytes_processed", None)
            return QueryExecution(
                label=label,
                job_id=getattr(job, "job_id", None),
                elapsed_seconds=elapsed,
                dry_run=self.config.dry_run,
                bytes_processed=int(bytes_processed) if bytes_processed is not None else None,
            )

        result = await asyncio.to_thread(_submit_and_wait)
        logger.info(
            "BigQuery job finished: label=%s job_id=%s dry_run=%s bytes_processed=%s elapsed_seconds=%.2f",
            result.label,
            result.job_id,
            result.dry_run,
            result.bytes_processed,
            result.elapsed_seconds,
        )
        return result


def build_parser() -> argparse.ArgumentParser:
    """Cria parser CLI."""

    parser = argparse.ArgumentParser(description="Engine 15: BQML K-Means para empresas de fachada.")
    parser.add_argument("--project", default=gcp_project_id(), help="Projeto GCP/BigQuery.")
    parser.add_argument("--source-dataset", default=bq_dataset_id(), help="Dataset da tabela da Engine 02.")
    parser.add_argument("--source-table", default=DEFAULT_SOURCE_TABLE, help="Tabela de contratos da Engine 02.")
    parser.add_argument("--model-dataset", default=DEFAULT_MODEL_DATASET, help="Dataset BQML de destino.")
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME, help="Nome do modelo K-Means.")
    parser.add_argument("--risk-table", default=DEFAULT_RISK_TABLE, help="Tabela final de CNPJs de alto risco.")
    parser.add_argument("--num-clusters", type=int, default=DEFAULT_NUM_CLUSTERS)
    parser.add_argument("--dry-run", action="store_true", help="Valida queries no BigQuery sem executar jobs.")
    return parser


async def run_async(args: argparse.Namespace) -> int:
    """Ponto de execucao assincrono."""

    config = BQMLConfig(
        project_id=args.project,
        source_dataset=args.source_dataset,
        source_table=args.source_table,
        model_dataset=args.model_dataset,
        model_name=args.model_name,
        risk_table=args.risk_table,
        num_clusters=max(2, args.num_clusters),
        dry_run=bool(args.dry_run),
    )
    logger.info(
        "BQML K-Means engine starting: source=%s model=%s risk_table=%s clusters=%s dry_run=%s",
        config.source_fqn,
        config.model_fqn,
        config.risk_table_fqn,
        config.num_clusters,
        config.dry_run,
    )
    client = bigquery.Client(project=config.project_id)
    engine = BQMLKMeansEngine(client, config)
    results = await engine.run()
    total_elapsed = sum(result.elapsed_seconds for result in results)
    logger.info(
        "BQML K-Means engine finished: jobs=%s total_step_seconds=%.2f",
        len(results),
        total_elapsed,
    )
    return 0


def main() -> int:
    """Entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        return asyncio.run(run_async(args))
    except KeyboardInterrupt:
        logger.warning("BQML K-Means engine interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("BQML K-Means engine failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
