#!/usr/bin/env python3
"""
Engine 17 - Sincronizacao BigQuery -> Firestore para dossies desnormalizados.

Le resultados consolidados das engines analiticas no BigQuery e grava documentos
profundos na colecao Firestore `transparency_reports`. O front-end deve conseguir
renderizar um dossie sem fazer joins adicionais.

Regras de escrita:
- nenhuma insercao linha a linha;
- sempre usar db.batch();
- no maximo 499 operacoes por commit;
- set(..., merge=True) para upsert economico.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Iterator, List, Mapping, Optional, Sequence, Set

from firebase_admin import firestore
from google.cloud import bigquery

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.firebase_app import init_firestore
from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_17_sync")

DESTINATION_COLLECTION = "transparency_reports"
MAX_BATCH_WRITES = 499

DEFAULT_ANALYTICS_DATASET = os.environ.get("SYNC_ANALYTICS_DATASET", "fiscalizapa")
DEFAULT_CONTRACTS_TABLE = os.environ.get("SYNC_CONTRACTS_TABLE", "pncp_contratos")
DEFAULT_RISK_TABLE = os.environ.get("SYNC_RISK_TABLE", "cnpjs_alto_risco")
DEFAULT_ARIMA_TABLE = os.environ.get("SYNC_ARIMA_TABLE", "alertas_temporais_arima")
DEFAULT_REPORT_LIMIT = int(os.environ.get("SYNC_REPORT_LIMIT", "10000"))

CNPJ_CANDIDATES = (
    "cnpj_contratado",
    "cnpj_fornecedor",
    "nifornecedor",
    "ni_fornecedor",
    "fornecedor_ni_fornecedor",
    "payload_nifornecedor",
)
SUPPLIER_NAME_CANDIDATES = (
    "nome_razao_social_contratado",
    "nomerazaosocialfornecedor",
    "fornecedor_nome_razao_social",
    "razao_social",
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
CONTRACT_ID_CANDIDATES = (
    "numero_contrato",
    "numerocontratoempenho",
    "numero_controle_pncp",
    "numerocontrolepncp",
)
OBJECT_CANDIDATES = ("objeto", "objetocontrato", "objetocompra", "descricao")
DATE_CANDIDATES = ("data_assinatura", "dataassinatura", "data_inicial_cursor", "fetched_at")


@dataclass(frozen=True)
class FirestoreSyncConfig:
    """Configuracao de origem BigQuery e destino Firestore."""

    project_id: str
    contracts_dataset: str
    analytics_dataset: str
    contracts_table: str
    risk_table: str
    arima_table: str
    destination_collection: str
    report_limit: int
    dry_run: bool = False

    @property
    def contracts_fqn(self) -> str:
        return f"{self.project_id}.{self.contracts_dataset}.{self.contracts_table}"

    @property
    def risk_fqn(self) -> str:
        return f"{self.project_id}.{self.analytics_dataset}.{self.risk_table}"

    @property
    def arima_fqn(self) -> str:
        return f"{self.project_id}.{self.analytics_dataset}.{self.arima_table}"


@dataclass(frozen=True)
class SyncStats:
    """Resumo da sincronizacao Firestore."""

    reports_loaded: int
    documents_written: int
    batches_committed: int
    elapsed_seconds: float


def _quote_fqn(fqn: str) -> str:
    """Retorna identificador BigQuery com backticks."""

    return f"`{fqn}`"


def _quote_column(name: str) -> str:
    """Retorna nome de coluna com backticks."""

    return f"`{name}`"


def _first_existing(columns: Set[str], candidates: Sequence[str]) -> Optional[str]:
    """Escolhe a primeira coluna disponivel entre candidatas."""

    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def _coalesce_string(columns: Set[str], candidates: Sequence[str], default: str = "''") -> str:
    """Monta COALESCE(CAST(col AS STRING), ...) usando apenas colunas existentes."""

    parts = [f"CAST({_quote_column(col)} AS STRING)" for col in candidates if col in columns]
    if not parts:
        return default
    return f"COALESCE({', '.join(parts)}, {default})"


def _coalesce_float(columns: Set[str], candidates: Sequence[str], default: str = "0.0") -> str:
    """Monta COALESCE(SAFE_CAST(col AS FLOAT64), ...) com colunas existentes."""

    parts = [f"SAFE_CAST({_quote_column(col)} AS FLOAT64)" for col in candidates if col in columns]
    if not parts:
        return default
    return f"COALESCE({', '.join(parts)}, {default})"


def _json_default(value: Any) -> Any:
    """Converte tipos BigQuery para JSON/Firestore serializaveis."""

    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _to_plain(value: Any) -> Any:
    """Converte Row/Struct/List BigQuery em dict/list Python profundos."""

    if isinstance(value, bigquery.table.Row):
        return {key: _to_plain(value[key]) for key in value.keys()}
    if isinstance(value, Mapping):
        return {str(key): _to_plain(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return value.isoformat()
    return value


def _stable_doc_id(prefix: str, value: Any) -> str:
    """Cria ID Firestore estavel e seguro."""

    raw = str(value or "").strip()
    if raw:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in raw)[:120]
        if safe:
            return f"{prefix}_{safe}"
    digest = hashlib.sha256(json.dumps(value, default=_json_default, sort_keys=True).encode("utf-8")).hexdigest()
    return f"{prefix}_{digest[:24]}"


class FirestoreSyncEngine:
    """Sincroniza BigQuery -> Firestore usando dossies extremamente desnormalizados."""

    def __init__(
        self,
        *,
        bq_client: bigquery.Client,
        firestore_client: Optional[firestore.Client],
        config: FirestoreSyncConfig,
    ) -> None:
        self.bq_client = bq_client
        self.firestore_client = firestore_client
        self.config = config

    def run(self) -> SyncStats:
        """Executa extracao BigQuery, empacotamento e upsert em Firestore."""

        started = time.perf_counter()
        logger.info(
            "Firestore sync starting: contracts=%s risk=%s arima=%s collection=%s dry_run=%s",
            self.config.contracts_fqn,
            self.config.risk_fqn,
            self.config.arima_fqn,
            self.config.destination_collection,
            self.config.dry_run,
        )

        reports = list(self.fetch_denormalized_reports())
        logger.info("Denormalized reports loaded from BigQuery: count=%s", len(reports))

        if self.config.dry_run:
            elapsed = time.perf_counter() - started
            logger.info("[dry-run] Firestore writes skipped: reports=%s elapsed_seconds=%.2f", len(reports), elapsed)
            return SyncStats(
                reports_loaded=len(reports),
                documents_written=0,
                batches_committed=0,
                elapsed_seconds=elapsed,
            )

        if self.firestore_client is None:
            raise RuntimeError("Firestore client ausente em modo de escrita.")

        documents_written, batches_committed = self.write_reports(reports)
        elapsed = time.perf_counter() - started
        logger.info(
            "Firestore sync finished: reports=%s documents_written=%s batches_committed=%s elapsed_seconds=%.2f",
            len(reports),
            documents_written,
            batches_committed,
            elapsed,
        )
        return SyncStats(
            reports_loaded=len(reports),
            documents_written=documents_written,
            batches_committed=batches_committed,
            elapsed_seconds=elapsed,
        )

    def fetch_denormalized_reports(self) -> Iterator[Dict[str, Any]]:
        """Consulta BigQuery e devolve dossies aninhados prontos para Firestore."""

        contract_columns = self.load_table_columns(self.config.contracts_fqn)
        query = self.build_reports_query(contract_columns)
        logger.info("BigQuery SELECT starting for transparency reports.")
        job = self.bq_client.query(query, job_config=bigquery.QueryJobConfig(use_query_cache=True))
        for row in job.result():
            yield self.row_to_report(row)
        logger.info(
            "BigQuery SELECT finished: job_id=%s bytes_processed=%s",
            getattr(job, "job_id", None),
            getattr(job, "total_bytes_processed", None),
        )

    def load_table_columns(self, table_fqn: str) -> Set[str]:
        """Le metadados do schema para evitar referencias a colunas inexistentes."""

        table = self.bq_client.get_table(table_fqn)
        columns = {field.name.lower() for field in table.schema}
        logger.info("BigQuery schema loaded: table=%s columns=%s", table_fqn, len(columns))
        return columns

    def build_reports_query(self, contract_columns: Set[str]) -> str:
        """Monta SELECT consolidado das engines anteriores."""

        contracts_ref = _quote_fqn(self.config.contracts_fqn)
        risk_ref = _quote_fqn(self.config.risk_fqn)
        arima_ref = _quote_fqn(self.config.arima_fqn)
        limit = max(1, int(self.config.report_limit))
        cnpj_col = _first_existing(contract_columns, CNPJ_CANDIDATES)
        if not cnpj_col:
            raise ValueError(
                "Tabela de contratos sem coluna de CNPJ reconhecida. "
                f"Candidatas: {', '.join(CNPJ_CANDIDATES)}",
            )

        cnpj_expr = f"REGEXP_REPLACE(CAST({_quote_column(cnpj_col)} AS STRING), r'[^0-9]', '')"
        supplier_expr = _coalesce_string(contract_columns, SUPPLIER_NAME_CANDIDATES)
        value_expr = _coalesce_float(contract_columns, VALUE_CANDIDATES)
        contract_id_expr = _coalesce_string(contract_columns, CONTRACT_ID_CANDIDATES)
        object_expr = _coalesce_string(contract_columns, OBJECT_CANDIDATES)
        date_expr = _coalesce_string(contract_columns, DATE_CANDIDATES)

        return f"""
WITH contratos_base AS (
  SELECT
    {cnpj_expr} AS cnpj,
    ANY_VALUE({supplier_expr}) AS razao_social,
    COUNT(1) AS total_contratos,
    SUM({value_expr}) AS valor_total_contratos,
    ARRAY_AGG(
      STRUCT(
        {contract_id_expr} AS contrato_id,
        {object_expr} AS objeto,
        {value_expr} AS valor,
        {date_expr} AS data_referencia
      )
      ORDER BY {value_expr} DESC
      LIMIT 25
    ) AS contratos_relevantes
  FROM {contracts_ref}
  WHERE {cnpj_expr} != ''
  GROUP BY cnpj
),
risco_cnpj AS (
  SELECT
    CAST(cnpj AS STRING) AS cnpj,
    ARRAY_AGG(
      STRUCT(
        CAST(cluster AS STRING) AS cluster,
        CAST(nivel_risco AS STRING) AS nivel_risco,
        SAFE_CAST(valor_total_contratos AS FLOAT64) AS valor_total_contratos,
        SAFE_CAST(frequencia_ganhos AS FLOAT64) AS frequencia_ganhos,
        SAFE_CAST(idade_cnpj_dias AS FLOAT64) AS idade_cnpj_dias,
        SAFE_CAST(distancia_euclidiana AS FLOAT64) AS distancia_euclidiana,
        CAST(avaliado_em AS STRING) AS avaliado_em
      )
      ORDER BY
        CASE CAST(nivel_risco AS STRING)
          WHEN 'CRITICO' THEN 1
          WHEN 'ALTO' THEN 2
          WHEN 'MEDIO' THEN 3
          ELSE 4
        END,
        SAFE_CAST(valor_total_contratos AS FLOAT64) DESC
      LIMIT 10
    ) AS riscos_kmeans
  FROM {risk_ref}
  GROUP BY cnpj
),
alertas_temporais AS (
  SELECT
    ARRAY_AGG(
      STRUCT(
        CAST(data_agrupada AS STRING) AS data_agrupada,
        SAFE_CAST(soma_gastos AS FLOAT64) AS soma_gastos,
        SAFE_CAST(upper_bound AS FLOAT64) AS upper_bound,
        SAFE_CAST(anomaly_probability AS FLOAT64) AS anomaly_probability,
        CAST(nivel_risco AS STRING) AS nivel_risco,
        CAST(avaliado_em AS STRING) AS avaliado_em
      )
      ORDER BY SAFE_CAST(anomaly_probability AS FLOAT64) DESC, data_agrupada DESC
      LIMIT 100
    ) AS alertas
  FROM {arima_ref}
),
relatorios AS (
  SELECT
    cb.cnpj,
    cb.razao_social,
    cb.total_contratos,
    cb.valor_total_contratos,
    cb.contratos_relevantes,
    IFNULL(
      rc.riscos_kmeans,
      ARRAY<STRUCT<
        cluster STRING,
        nivel_risco STRING,
        valor_total_contratos FLOAT64,
        frequencia_ganhos FLOAT64,
        idade_cnpj_dias FLOAT64,
        distancia_euclidiana FLOAT64,
        avaliado_em STRING
      >>[]
    ) AS riscos_kmeans,
    (SELECT alertas FROM alertas_temporais) AS alertas_temporais
  FROM contratos_base cb
  LEFT JOIN risco_cnpj rc
    USING (cnpj)
)
SELECT
  cnpj,
  STRUCT(
    cnpj AS cnpj,
    razao_social AS razao_social
  ) AS identidade,
  STRUCT(
    total_contratos AS total_contratos,
    valor_total_contratos AS valor_total_contratos,
    contratos_relevantes AS contratos_relevantes
  ) AS contratos,
  STRUCT(
    riscos_kmeans AS empresas_fachada,
    alertas_temporais AS surtos_orcamentarios
  ) AS alertas,
  STRUCT(
    CURRENT_TIMESTAMP() AS sincronizado_em,
    'bigquery_to_firestore_extreme_denormalization' AS fonte,
    '{self.config.contracts_fqn}' AS tabela_contratos,
    '{self.config.risk_fqn}' AS tabela_risco_cnpj,
    '{self.config.arima_fqn}' AS tabela_arima
  ) AS metadados
FROM relatorios
ORDER BY valor_total_contratos DESC
LIMIT {limit}
"""

    def row_to_report(self, row: bigquery.table.Row) -> Dict[str, Any]:
        """Empacota uma linha consolidada em documento profundo para o Firestore."""

        cnpj = str(row["cnpj"] or "").strip()
        report = {
            "report_id": _stable_doc_id("cnpj", cnpj),
            "tipo_dossie": "fornecedor_pncp",
            "identidade": _to_plain(row["identidade"]),
            "contratos": _to_plain(row["contratos"]),
            "alertas": _to_plain(row["alertas"]),
            "metadados": _to_plain(row["metadados"]),
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        return report

    def write_reports(self, reports: Sequence[Dict[str, Any]]) -> tuple[int, int]:
        """Escreve dossies em batches Firestore de no maximo 499 docs."""

        if self.firestore_client is None:
            raise RuntimeError("Firestore client ausente.")

        collection = self.firestore_client.collection(self.config.destination_collection)
        documents_written = 0
        batches_committed = 0
        batch = self.firestore_client.batch()
        pending_ops = 0

        for report in reports:
            doc_id = str(report.get("report_id") or _stable_doc_id("report", report))
            doc_ref = collection.document(doc_id)
            batch.set(doc_ref, report, merge=True)
            documents_written += 1
            pending_ops += 1

            if pending_ops >= MAX_BATCH_WRITES:
                self._commit_batch(batch, pending_ops, batches_committed + 1)
                batches_committed += 1
                batch = self.firestore_client.batch()
                pending_ops = 0

        if pending_ops:
            self._commit_batch(batch, pending_ops, batches_committed + 1)
            batches_committed += 1

        return documents_written, batches_committed

    @staticmethod
    def _commit_batch(batch: firestore.WriteBatch, pending_ops: int, batch_number: int) -> None:
        """Commita um batch Firestore com logs e tratamento de excecao."""

        try:
            batch.commit()
        except Exception as exc:
            logger.exception(
                "Firestore batch commit failed: batch=%s operations=%s error=%s",
                batch_number,
                pending_ops,
                exc,
            )
            raise
        logger.info("Firestore batch committed: batch=%s operations=%s", batch_number, pending_ops)


def build_parser() -> argparse.ArgumentParser:
    """Cria parser CLI."""

    parser = argparse.ArgumentParser(description="Engine 17: BigQuery -> Firestore transparency_reports.")
    parser.add_argument("--project", default=gcp_project_id(), help="Projeto GCP.")
    parser.add_argument("--contracts-dataset", default=bq_dataset_id(), help="Dataset da tabela da Engine 02.")
    parser.add_argument("--analytics-dataset", default=DEFAULT_ANALYTICS_DATASET, help="Dataset das engines BQML.")
    parser.add_argument("--contracts-table", default=DEFAULT_CONTRACTS_TABLE)
    parser.add_argument("--risk-table", default=DEFAULT_RISK_TABLE)
    parser.add_argument("--arima-table", default=DEFAULT_ARIMA_TABLE)
    parser.add_argument("--collection", default=DESTINATION_COLLECTION)
    parser.add_argument("--limit", type=int, default=DEFAULT_REPORT_LIMIT)
    parser.add_argument("--dry-run", action="store_true", help="Consulta BigQuery sem gravar no Firestore.")
    return parser


def run(args: argparse.Namespace) -> SyncStats:
    """Inicializa clientes e executa a sincronizacao."""

    config = FirestoreSyncConfig(
        project_id=args.project,
        contracts_dataset=args.contracts_dataset,
        analytics_dataset=args.analytics_dataset,
        contracts_table=args.contracts_table,
        risk_table=args.risk_table,
        arima_table=args.arima_table,
        destination_collection=args.collection,
        report_limit=max(1, args.limit),
        dry_run=bool(args.dry_run),
    )
    bq_client = bigquery.Client(project=config.project_id)
    fs_client = None if config.dry_run else init_firestore()
    engine = FirestoreSyncEngine(bq_client=bq_client, firestore_client=fs_client, config=config)
    return engine.run()


def main() -> int:
    """Entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        run(args)
        return 0
    except KeyboardInterrupt:
        logger.warning("Firestore sync interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("Firestore sync failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
