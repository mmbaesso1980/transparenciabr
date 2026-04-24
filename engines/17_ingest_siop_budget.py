#!/usr/bin/env python3
"""
Ingestão SIOP / LOA → BigQuery `transparenciabr.orcamento_federal`.

Fonte predefinida: consulta SQL ao datalake Base dos Dados (`basedosdados.br_me_siop.*`).
Ajuste `sql/extract_siop_budget_bdd.sql` ao nome real da tabela no catálogo BDD.

Variáveis: GCP_PROJECT, BQ_DATASET, SIOP_EXTRACT_SQL_FILE, SIOP_ANO_MIN (default 2018).
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, Table

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

_REPO = Path(__file__).resolve().parents[1]
TABLE_DEST = "orcamento_federal"
DEFAULT_SQL_FILE = _REPO / "sql" / "extract_siop_budget_bdd.sql"


def _row_key(r: Dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(r.get("exercicio") or ""),
            str(r.get("orgao_nome") or ""),
            str(r.get("funcao_nome") or ""),
            str(r.get("subfuncao_nome") or ""),
            str(r.get("valor_dotacao_atual") or ""),
        ]
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _ensure_table(client: bigquery.Client, project: str, dataset: str) -> None:
    fq = f"{project}.{dataset}.{TABLE_DEST}"
    schema = [
        SchemaField("row_key", "STRING", mode="REQUIRED"),
        SchemaField("exercicio", "INTEGER", mode="REQUIRED"),
        SchemaField("orgao_nome", "STRING"),
        SchemaField("funcao_nome", "STRING"),
        SchemaField("subfuncao_nome", "STRING"),
        SchemaField("valor_dotacao_atual", "FLOAT"),
        SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"),
    ]
    client.create_table(Table(fq, schema=schema), exists_ok=True)


def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    def fnum(x: Any) -> Any:
        if x is None:
            return None
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    def fint(x: Any) -> Any:
        if x is None:
            return None
        try:
            return int(x)
        except (TypeError, ValueError):
            return None

    out = {
        "exercicio": fint(row.get("exercicio")),
        "orgao_nome": str(row.get("orgao_nome") or "")[:2048] or None,
        "funcao_nome": str(row.get("funcao_nome") or "")[:1024] or None,
        "subfuncao_nome": str(row.get("subfuncao_nome") or "")[:1024] or None,
        "valor_dotacao_atual": fnum(row.get("valor_dotacao_atual")),
    }
    rk = _row_key(
        {
            "exercicio": out["exercicio"],
            "orgao_nome": out["orgao_nome"],
            "funcao_nome": out["funcao_nome"],
            "subfuncao_nome": out["subfuncao_nome"],
            "valor_dotacao_atual": out["valor_dotacao_atual"],
        }
    )
    out["row_key"] = rk
    out["ingested_at"] = datetime.now(timezone.utc)
    if out["exercicio"] is None:
        return {}
    return out


def _load_sql(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(str(path))
    return path.read_text(encoding="utf-8")


def _merge_rows(
    client: bigquery.Client,
    project: str,
    dataset: str,
    rows: List[Dict[str, Any]],
) -> int:
    if not rows:
        return 0
    _ensure_table(client, project, dataset)
    temp = f"_tmp_siop_{uuid.uuid4().hex}"
    temp_fq = f"{project}.{dataset}.{temp}"
    schema = [
        bigquery.SchemaField("row_key", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("exercicio", "INTEGER", mode="REQUIRED"),
        bigquery.SchemaField("orgao_nome", "STRING"),
        bigquery.SchemaField("funcao_nome", "STRING"),
        bigquery.SchemaField("subfuncao_nome", "STRING"),
        bigquery.SchemaField("valor_dotacao_atual", "FLOAT"),
        bigquery.SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"),
    ]
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    load_job = client.load_table_from_json(rows, temp_fq, job_config=job_config)
    load_job.result()

    dest = f"`{project}.{dataset}.{TABLE_DEST}`"
    merge_sql = f"""
    MERGE {dest} T
    USING `{project}.{dataset}.{temp}` S
    ON T.row_key = S.row_key
    WHEN MATCHED THEN UPDATE SET
      exercicio = S.exercicio,
      orgao_nome = S.orgao_nome,
      funcao_nome = S.funcao_nome,
      subfuncao_nome = S.subfuncao_nome,
      valor_dotacao_atual = S.valor_dotacao_atual,
      ingested_at = S.ingested_at
    WHEN NOT MATCHED THEN
      INSERT (
        row_key, exercicio, orgao_nome, funcao_nome, subfuncao_nome,
        valor_dotacao_atual, ingested_at
      )
      VALUES (
        S.row_key, S.exercicio, S.orgao_nome, S.funcao_nome, S.subfuncao_nome,
        S.valor_dotacao_atual, S.ingested_at
      )
    """
    client.query(merge_sql).result()
    client.delete_table(temp_fq, not_found_ok=True)
    return len(rows)


def run(*, sql_file: Path, ano_min: int, dry_run: bool) -> int:
    project = gcp_project_id()
    dataset = bq_dataset_id()
    query = _load_sql(sql_file)
    if "@ano_min" not in query:
        logger.warning("O SQL deveria conter o parâmetro @ano_min — consulta pode falhar.")

    client = bigquery.Client(project=project)
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("ano_min", "INT64", int(ano_min)),
        ],
        use_query_cache=False,
    )
    job = client.query(query, job_config=job_config)
    rows_out: List[Dict[str, Any]] = []
    try:
        results = job.result()
    except Exception as e:
        logger.warning("Falha ao ler tabela base_dos_dados (possível indisponibilidade ou mudança de schema): %s", e)
        return 0

    for r in results:
        d = {
            "exercicio": r.get("exercicio"),
            "orgao_nome": r.get("orgao_nome"),
            "funcao_nome": r.get("funcao_nome"),
            "subfuncao_nome": r.get("subfuncao_nome"),
            "valor_dotacao_atual": r.get("valor_dotacao_atual"),
        }
        norm = _normalize_row(d)
        if norm:
            rows_out.append(norm)

    logger.info(
        "SIOP extract concluído — linhas normalizadas=%s (job bytes ~%s)",
        len(rows_out),
        getattr(job, "total_bytes_processed", None),
    )

    if dry_run:
        for x in rows_out[:5]:
            logger.info("[dry-run] %s", x)
        logger.info("[dry-run] Sem MERGE em `%s.%s`.", project, TABLE_DEST)
        return 0

    n = _merge_rows(client, project, dataset, rows_out)
    logger.info("MERGE `%s.%s` processou %s linhas.", dataset, TABLE_DEST, n)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="SIOP/BDD → transparenciabr.orcamento_federal")
    parser.add_argument(
        "--sql-file",
        default=str(Path(os.environ.get("SIOP_EXTRACT_SQL_FILE", DEFAULT_SQL_FILE)).resolve()),
    )
    parser.add_argument("--ano-min", type=int, default=int(os.environ.get("SIOP_ANO_MIN", "2018")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        return run(sql_file=Path(args.sql_file), ano_min=args.ano_min, dry_run=args.dry_run)
    except Exception as exc:
        logger.exception("Falha ingestão SIOP: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
