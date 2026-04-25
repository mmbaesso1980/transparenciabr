#!/usr/bin/env python3
"""
Ingestão de emendas — Portal da Transparência CGU → BigQuery.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import gcp_project_id, bq_dataset_id
from lib.bigquery_helpers import get_client, insert_staging_rows, new_batch_id
from google.cloud import bigquery

logger = logging.getLogger(__name__)

GCP_PROJECT_ID = gcp_project_id()
BQ_DATASET = bq_dataset_id()
BQ_TABLE_EMENDAS = "emendas"

def configure_logging(level: int = logging.INFO) -> None:
    if logger.handlers:
        return
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

def _create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def ensure_emendas_table(client: bigquery.Client) -> None:
    schema = [
        bigquery.SchemaField("codigoEmenda", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("ano", "INTEGER", mode="NULLABLE"),
        bigquery.SchemaField("tipoEmenda", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("nomeAutor", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("codigoAutor", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("localidadeDoGasto", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("codigoFuncao", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("nomeFuncao", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("codigoSubfuncao", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("nomeSubfuncao", "STRING", mode="NULLABLE"),
        bigquery.SchemaField("valorEmpenhado", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("valorLiquidado", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("valorPago", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("valorRestoInscrito", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("valorRestoCancelado", "FLOAT", mode="NULLABLE"),
        bigquery.SchemaField("valorRestoPago", "FLOAT", mode="NULLABLE")
    ]
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    table = bigquery.Table(table_ref, schema=schema)
    client.create_table(table, exists_ok=True)
    logger.info(f"Tabela {table_ref} garantida.")

def run_emendas_ingestion_pipeline() -> int:
    configure_logging()

    api_token = os.environ.get("CGU_API_TOKEN")
    if not api_token:
        logger.warning("CGU_API_TOKEN não definido. Abortando ingestão com exit limpo (0).")
        return 0

    client = get_client()
    try:
        ensure_emendas_table(client)
    except Exception as e:
        logger.error(f"Erro CRÍTICO ao garantir tabela BQ: {e}")
        return 1

    session = _create_session()
    headers = {
        "Accept": "application/json",
        "chave-api-dados": api_token
    }

    batch_id = new_batch_id()

    for ano in [2025, 2026]:
        pagina = 1
        while True:
            url = f"https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano={ano}&pagina={pagina}"
            try:
                resp = session.get(url, headers=headers, timeout=(10, 60))
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error(f"Falha ao buscar emendas ano={ano} pagina={pagina}: {e}")
                break

            if not data:
                logger.info(f"Fim das emendas para o ano {ano} na página {pagina}.")
                break

            rows = []
            for item in data:
                rows.append({
                    "codigoEmenda": str(item.get("codigoEmenda", "")),
                    "ano": int(item.get("ano")) if item.get("ano") else None,
                    "tipoEmenda": item.get("tipoEmenda"),
                    "nomeAutor": item.get("nomeAutor"),
                    "codigoAutor": item.get("codigoAutor"),
                    "localidadeDoGasto": item.get("localidadeDoGasto"),
                    "codigoFuncao": item.get("codigoFuncao"),
                    "nomeFuncao": item.get("nomeFuncao"),
                    "codigoSubfuncao": item.get("codigoSubfuncao"),
                    "nomeSubfuncao": item.get("nomeSubfuncao"),
                    "valorEmpenhado": float(item.get("valorEmpenhado", 0.0) or 0.0),
                    "valorLiquidado": float(item.get("valorLiquidado", 0.0) or 0.0),
                    "valorPago": float(item.get("valorPago", 0.0) or 0.0),
                    "valorRestoInscrito": float(item.get("valorRestoInscrito", 0.0) or 0.0),
                    "valorRestoCancelado": float(item.get("valorRestoCancelado", 0.0) or 0.0),
                    "valorRestoPago": float(item.get("valorRestoPago", 0.0) or 0.0)
                })

            if rows:
                try:
                    insert_staging_rows(BQ_TABLE_EMENDAS, rows)
                    logger.info(f"Inseridas {len(rows)} emendas do ano {ano} pagina {pagina}.")
                except Exception as e:
                    logger.error(f"Erro ao inserir no BigQuery: {e}")

            pagina += 1
            time.sleep(1) # Rate limit baseline

    return 0

def main() -> int:
    return run_emendas_ingestion_pipeline()

if __name__ == "__main__":
    sys.exit(main())
