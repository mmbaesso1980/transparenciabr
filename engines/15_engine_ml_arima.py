#!/usr/bin/env python3
"""
Engine 15 - BQML ARIMA_PLUS para surtos temporais de gastos.

Este motor nao processa dataframes em Python. Ele apenas submete SQL ao
BigQuery para treinar um modelo ARIMA_PLUS nativo e materializar anomalias em
`fiscalizapa.alertas_temporais_arima`.

Fonte esperada: tabela de contratos/empenhos/notas purificada pela Engine 02.
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
from typing import List, Optional, Sequence, Set

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
logger = logging.getLogger("engine_15_ml_arima")

DEFAULT_MODEL_DATASET = os.environ.get("BQML_ARIMA_MODEL_DATASET", "fiscalizapa")
DEFAULT_SOURCE_TABLE = os.environ.get("BQML_ARIMA_SOURCE_TABLE", "pncp_contratos")
DEFAULT_MODEL_NAME = os.environ.get("BQML_ARIMA_MODEL_NAME", "modelo_temporal_gastos")
DEFAULT_ALERT_TABLE = os.environ.get("BQML_ARIMA_ALERT_TABLE", "alertas_temporais_arima")
DEFAULT_RECENT_DAYS = int(os.environ.get("BQML_ARIMA_RECENT_DAYS", "90"))
DEFAULT_ANOMALY_PROB_THRESHOLD = float(os.environ.get("BQML_ARIMA_ANOMALY_PROB_THRESHOLD", "0.95"))

DATE_CANDIDATES = (
    "data_assinatura",
    "dataassinatura",
    "data_emissao",
    "dataemissao",
    "data_pagamento",
    "datapagamento",
    "data_liquidacao",
    "dataliquidacao",
    "data_vigencia_inicio",
    "datavigenciainicio",
    "data_inicial_cursor",
    "fetched_at",
)
VALUE_CANDIDATES = (
    "valor_total",
    "valor_total_contratos",
    "valorglobal",
    "valor_global",
    "valorcontrato",
    "valor_contrato",
    "valor_pago",
    "valorpago",
    "valor_empenhado",
    "valorempenhado",
    "valor_liquidado",
    "valorliquidado",
    "valorinicial",
    "valor_inicial",
)


@dataclass(frozen=True)
class BQMLArimaConfig:
    """Configuracao de origem e destino BQML ARIMA_PLUS."""

    project_id: str
    source_dataset: str
    source_table: str
    model_dataset: str
    model_name: str
    alert_table: str
    recent_days: int
    anomaly_prob_threshold: float
    dry_run: bool = False

    @property
    def source_fqn(self) -> str:
        return f"{self.project_id}.{self.source_dataset}.{self.source_table}"

    @property
    def model_fqn(self) -> str:
        return f"{self.project_id}.{self.model_dataset}.{self.model_name}"

    @property
    def alert_table_fqn(self) -> str:
        return f"{self.project_id}.{self.model_dataset}.{self.alert_table}"


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
    """Monta expressao numerica tolerante para os valores de gasto."""

    parts = [f"SAFE_CAST({_quote_column(col)} AS FLOAT64)" for col in candidates if col in columns]
    if not parts:
        return default
    return f"COALESCE({', '.join(parts)}, {default})"


def _safe_date_expression(column: str) -> str:
    """Converte coluna de data variavel para DATE no SQL."""

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


class BQMLArimaEngine:
    """Orquestra treino ARIMA_PLUS e deteccao de anomalias via BigQuery."""

    def __init__(self, client: bigquery.Client, config: BQMLArimaConfig) -> None:
        self.client = client
        self.config = config

    async def run(self) -> List[QueryExecution]:
        """Executa criacao de dataset, treino e deteccao de anomalias."""

        columns = await self._load_source_columns()
        logger.info(
            "Source table inspected: table=%s columns=%s",
            self.config.source_fqn,
            len(columns),
        )
        training_sql = self._build_training_matrix_sql(columns)
        queries: List[tuple[str, str]] = [
            ("ensure_dataset", self._build_dataset_sql()),
            ("train_arima_plus_model", self._build_training_sql(training_sql)),
            ("detect_temporal_anomalies", self._build_detection_sql(training_sql)),
        ]

        results: List[QueryExecution] = []
        for label, sql in queries:
            results.append(await self._run_query(label, sql))
        return results

    async def _load_source_columns(self) -> Set[str]:
        """Le apenas metadados de schema para montar SQL compativel."""

        def _get_columns() -> Set[str]:
            table = self.client.get_table(self.config.source_fqn)
            return {field.name.lower() for field in table.schema}

        return await asyncio.to_thread(_get_columns)

    def _build_dataset_sql(self) -> str:
        """SQL para garantir dataset de destino."""

        return f"CREATE SCHEMA IF NOT EXISTS {_quote_fqn(f'{self.config.project_id}.{self.config.model_dataset}')}"

    def _build_training_matrix_sql(self, columns: Set[str]) -> str:
        """Monta SELECT diario com data_agrupada e soma_gastos."""

        date_col = _first_existing(columns, DATE_CANDIDATES)
        if not date_col:
            raise ValueError(
                "Tabela de origem sem coluna de data reconhecida. "
                f"Candidatas: {', '.join(DATE_CANDIDATES)}",
            )

        date_expr = _safe_date_expression(date_col)
        value_expr = _coalesce_numeric(columns, VALUE_CANDIDATES)
        return f"""
WITH gastos_normalizados AS (
  SELECT
    {date_expr} AS data_agrupada,
    {value_expr} AS valor_gasto
  FROM {_quote_fqn(self.config.source_fqn)}
),
serie_diaria AS (
  SELECT
    data_agrupada,
    SUM(COALESCE(valor_gasto, 0.0)) AS soma_gastos
  FROM gastos_normalizados
  WHERE data_agrupada IS NOT NULL
  GROUP BY data_agrupada
)
SELECT
  data_agrupada,
  SAFE_CAST(soma_gastos AS FLOAT64) AS soma_gastos
FROM serie_diaria
WHERE soma_gastos > 0
"""

    def _build_training_sql(self, training_sql: str) -> str:
        """SQL BQML requerido para criar modelo ARIMA_PLUS."""

        return f"""
CREATE OR REPLACE MODEL {_quote_fqn(self.config.model_fqn)}
OPTIONS(
  model_type='ARIMA_PLUS',
  time_series_timestamp_col='data_agrupada',
  time_series_data_col='soma_gastos',
  decompose_time_series=TRUE
) AS
SELECT
  data_agrupada,
  soma_gastos
FROM (
{training_sql}
)
"""

    def _build_detection_sql(self, training_sql: str) -> str:
        """SQL ML.DETECT_ANOMALIES que persiste alertas temporais."""

        model_ref = _quote_fqn(self.config.model_fqn)
        alert_ref = _quote_fqn(self.config.alert_table_fqn)
        return f"""
CREATE OR REPLACE TABLE {alert_ref} AS
WITH serie_recente AS (
  SELECT
    data_agrupada,
    soma_gastos
  FROM (
{training_sql}
  )
  WHERE data_agrupada >= DATE_SUB(CURRENT_DATE(), INTERVAL {self.config.recent_days} DAY)
),
anomalias AS (
  SELECT
    *
  FROM ML.DETECT_ANOMALIES(
    MODEL {model_ref},
    STRUCT({self.config.anomaly_prob_threshold} AS anomaly_prob_threshold),
    (
      SELECT
        data_agrupada,
        soma_gastos
      FROM serie_recente
    )
  )
)
SELECT
  data_agrupada,
  soma_gastos,
  is_anomaly,
  lower_bound,
  upper_bound,
  anomaly_probability,
  CASE
    WHEN anomaly_probability >= 0.99 THEN 'CRITICO'
    WHEN anomaly_probability >= 0.975 THEN 'ALTO'
    ELSE 'MEDIO'
  END AS nivel_risco,
  CURRENT_TIMESTAMP() AS avaliado_em
FROM anomalias
WHERE is_anomaly = TRUE
  AND soma_gastos > upper_bound
"""

    async def _run_query(self, label: str, sql: str) -> QueryExecution:
        """Submete query ao BigQuery em thread e registra tempo."""

        logger.info("BigQuery job starting: label=%s dry_run=%s", label, self.config.dry_run)
        started = time.perf_counter()

        def _submit_and_wait() -> QueryExecution:
            job_config = bigquery.QueryJobConfig(
                dry_run=self.config.dry_run,
                use_query_cache=False,
                labels={"engine": "15_arima", "step": re.sub(r"[^a-z0-9_]", "_", label.lower())[:63]},
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

    parser = argparse.ArgumentParser(description="Engine 15: BQML ARIMA_PLUS para surtos temporais.")
    parser.add_argument("--project", default=gcp_project_id(), help="Projeto GCP/BigQuery.")
    parser.add_argument("--source-dataset", default=bq_dataset_id(), help="Dataset da tabela da Engine 02.")
    parser.add_argument("--source-table", default=DEFAULT_SOURCE_TABLE, help="Tabela de contratos/empenhos/notas.")
    parser.add_argument("--model-dataset", default=DEFAULT_MODEL_DATASET, help="Dataset BQML de destino.")
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME, help="Nome do modelo ARIMA_PLUS.")
    parser.add_argument("--alert-table", default=DEFAULT_ALERT_TABLE, help="Tabela final de alertas temporais.")
    parser.add_argument("--recent-days", type=int, default=DEFAULT_RECENT_DAYS)
    parser.add_argument("--anomaly-prob-threshold", type=float, default=DEFAULT_ANOMALY_PROB_THRESHOLD)
    parser.add_argument("--dry-run", action="store_true", help="Valida queries no BigQuery sem executar jobs.")
    return parser


async def run_async(args: argparse.Namespace) -> int:
    """Ponto de execucao assincrono."""

    config = BQMLArimaConfig(
        project_id=args.project,
        source_dataset=args.source_dataset,
        source_table=args.source_table,
        model_dataset=args.model_dataset,
        model_name=args.model_name,
        alert_table=args.alert_table,
        recent_days=max(1, args.recent_days),
        anomaly_prob_threshold=max(0.0, min(0.999, args.anomaly_prob_threshold)),
        dry_run=bool(args.dry_run),
    )
    logger.info(
        "BQML ARIMA engine starting: source=%s model=%s alert_table=%s recent_days=%s threshold=%.3f dry_run=%s",
        config.source_fqn,
        config.model_fqn,
        config.alert_table_fqn,
        config.recent_days,
        config.anomaly_prob_threshold,
        config.dry_run,
    )
    client = bigquery.Client(project=config.project_id)
    engine = BQMLArimaEngine(client, config)
    results = await engine.run()
    total_elapsed = sum(result.elapsed_seconds for result in results)
    logger.info(
        "BQML ARIMA engine finished: jobs=%s total_step_seconds=%.2f",
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
        logger.warning("BQML ARIMA engine interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("BQML ARIMA engine failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
