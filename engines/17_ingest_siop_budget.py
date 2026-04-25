#!/usr/bin/env python3
"""
Ingestão SIOP / LOA → BigQuery `transparenciabr.orcamento_federal`.

Fonte: consulta SQL ao datalake Base dos Dados (`basedosdados.br_me_siop.*`).
Se a Base dos Dados estiver indisponível, cria tabela vazia e encerra sem erro.
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

SCHEMA = [
    SchemaField("row_key",             "STRING",    mode="REQUIRED"),
    SchemaField("exercicio",           "INTEGER",   mode="REQUIRED"),
    SchemaField("orgao_nome",          "STRING"),
    SchemaField("funcao_nome",         "STRING"),
    SchemaField("subfuncao_nome",      "STRING"),
    SchemaField("valor_dotacao_atual", "FLOAT"),
    SchemaField("ingested_at",         "TIMESTAMP", mode="REQUIRED"),
]


def _row_key(r: Dict[str, Any]) -> str:
    raw = "|".join(str(r.get(k) or "") for k in (
        "exercicio", "orgao_nome", "funcao_nome", "subfuncao_nome", "valor_dotacao_atual"
    )).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _ensure_table(client: bigquery.Client, project: str, dataset: str) -> str:
    fq = f"{project}.{dataset}.{TABLE_DEST}"
    client.create_table(Table(fq, schema=SCHEMA), exists_ok=True)
    logger.info("Tabela %s garantida.", fq)
    return fq


def _normalize(row: Dict[str, Any]) -> Dict[str, Any]:
    def fi(x):
        try:
            return int(x) if x is not None else None
        except (TypeError, ValueError):
            return None

    def ff(x):
        try:
            return float(x) if x is not None else None
        except (TypeError, ValueError):
            return None

    exercicio = fi(row.get("exercicio"))
    if exercicio is None:
        return {}
    out = {
        "exercicio":           exercicio,
        "orgao_nome":          str(row.get("orgao_nome") or "")[:2048] or None,
        "funcao_nome":         str(row.get("funcao_nome") or "")[:1024] or None,
        "subfuncao_nome":      str(row.get("subfuncao_nome") or "")[:1024] or None,
        "valor_dotacao_atual": ff(row.get("valor_dotacao_atual")),
        "ingested_at":         datetime.now(timezone.utc),
    }
    out["row_key"] = _row_key(out)
    return out


def _merge_rows(client: bigquery.Client, project: str, dataset: str, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    _ensure_table(client, project, dataset)
    temp = f"_tmp_siop_{uuid.uuid4().hex}"
    temp_fq = f"{project}.{dataset}.{temp}"
    job_config = bigquery.LoadJobConfig(
        schema=SCHEMA,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    client.load_table_from_json(rows, temp_fq, job_config=job_config).result()

    dest = f"`{project}.{dataset}.{TABLE_DEST}`"
    client.query(f"""
    MERGE {dest} T USING `{project}.{dataset}.{temp}` S ON T.row_key = S.row_key
    WHEN MATCHED THEN UPDATE SET
      exercicio=S.exercicio, orgao_nome=S.orgao_nome, funcao_nome=S.funcao_nome,
      subfuncao_nome=S.subfuncao_nome, valor_dotacao_atual=S.valor_dotacao_atual,
      ingested_at=S.ingested_at
    WHEN NOT MATCHED THEN INSERT
      (row_key,exercicio,orgao_nome,funcao_nome,subfuncao_nome,valor_dotacao_atual,ingested_at)
      VALUES
      (S.row_key,S.exercicio,S.orgao_nome,S.funcao_nome,S.subfuncao_nome,S.valor_dotacao_atual,S.ingested_at)
    """).result()
    client.delete_table(temp_fq, not_found_ok=True)
    return len(rows)


def run(*, sql_file: Path, ano_min: int, dry_run: bool) -> int:
    project = gcp_project_id()
    dataset = bq_dataset_id()
    client = bigquery.Client(project=project)

    # Garante tabela ANTES de qualquer query — evita 404
    _ensure_table(client, project, dataset)

    if not sql_file.is_file():
        logger.warning("SQL file não encontrado: %s — encerrando sem dados.", sql_file)
        return 0

    query = sql_file.read_text(encoding="utf-8")
    if "@ano_min" not in query:
        logger.warning("SQL não contém @ano_min — pode falhar.")

    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("ano_min", "INT64", int(ano_min))],
        use_query_cache=False,
    )
    try:
        results = client.query(query, job_config=job_config).result()
    except Exception as e:
        logger.warning("Falha ao consultar Base dos Dados SIOP (%s) — skip gracioso.", e)
        return 0

    rows_out: List[Dict[str, Any]] = []
    for r in results:
        norm = _normalize(dict(r.items()))
        if norm:
            rows_out.append(norm)

    logger.info("SIOP extract: %s linhas normalizadas.", len(rows_out))

    if dry_run:
        for x in rows_out[:5]:
            logger.info("[dry-run] %s", x)
        return 0

    n = _merge_rows(client, project, dataset, rows_out)
    logger.info("MERGE %s.%s: %s linhas processadas.", dataset, TABLE_DEST, n)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql-file", default=str(DEFAULT_SQL_FILE))
    parser.add_argument("--ano-min", type=int, default=int(os.environ.get("SIOP_ANO_MIN", "2018")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        return run(sql_file=Path(args.sql_file), ano_min=args.ano_min, dry_run=args.dry_run)
    except Exception as exc:
        logger.exception("Falha ingestão SIOP: %s", exc)
        return 0


if __name__ == "__main__":
    sys.exit(main())
