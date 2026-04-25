#!/usr/bin/env python3
"""
Ingestão de emendas — Portal da Transparência CGU → BigQuery.

Busca emendas paginadas por ano (2018–ano_atual).
A API CGU retorna array vazio quando não há mais páginas.
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
from lib.bigquery_helpers import get_client, new_batch_id
from google.cloud import bigquery

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

GCP_PROJECT_ID = gcp_project_id()
BQ_DATASET = bq_dataset_id()
BQ_TABLE_EMENDAS = "emendas"
ANO_MIN = int(os.environ.get("EMENDAS_ANO_MIN", "2018"))
ANO_MAX = datetime.now().year
PAGE_SLEEP = float(os.environ.get("EMENDAS_PAGE_SLEEP", "1.0"))

SCHEMA = [
    bigquery.SchemaField("codigoEmenda",   "STRING",    mode="REQUIRED"),
    bigquery.SchemaField("autor",          "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("cpfCnpjAutor",   "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("valorEmpenhado", "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("valorLiquidado", "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("valorPago",      "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("descricao",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("ano",            "INTEGER",   mode="NULLABLE"),
    bigquery.SchemaField("funcao",         "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("subfuncao",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("municipio",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("estado",         "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("ingest_batch_id","STRING",    mode="NULLABLE"),
    bigquery.SchemaField("fetched_at",     "TIMESTAMP", mode="NULLABLE"),
]


def _parse_brazilian_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return 0.0
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    return float(text)


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
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    table = bigquery.Table(table_ref, schema=SCHEMA)
    client.create_table(table, exists_ok=True)
    logger.info(f"Tabela {table_ref} garantida.")


def _load_rows_bq(client: bigquery.Client, rows: List[Dict[str, Any]]) -> int:
    """Usa load_table_from_json (não streaming) para garantir criação da tabela."""
    if not rows:
        return 0
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    job_config = bigquery.LoadJobConfig(
        schema=SCHEMA,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
        ignore_unknown_values=True,
    )
    job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()
    return len(rows)


def run_emendas_ingestion_pipeline() -> int:
    api_token = os.environ.get("CGU_API_TOKEN")
    if not api_token:
        logger.warning("CGU_API_TOKEN não definido. Abortando com exit limpo.")
        return 0

    client = get_client()
    try:
        ensure_emendas_table(client)
    except Exception as e:
        logger.error(f"Erro ao garantir tabela BQ: {e}")
        return 1

    session = _create_session()
    headers = {
        "Accept": "application/json",
        "chave-api-dados": api_token,
    }
    batch_id = new_batch_id()
    total_inseridas = 0

    for ano in range(EMENDAS_ANO_MIN, ANO_MAX + 1):
        pagina = 1
        ano_total = 0
        while True:
            url = (
                f"https://api.portaldatransparencia.gov.br/api-de-dados/emendas"
                f"?ano={ano}&pagina={pagina}&quantidade=100"
            )
            try:
                resp = session.get(url, headers=headers, timeout=(15, 90))
                if resp.status_code == 404:
                    logger.info(f"Ano {ano} pág {pagina}: 404 — fim de paginação.")
                    break
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error(f"Falha ao buscar emendas ano={ano} pagina={pagina}: {e}")
                break

            if not data or (isinstance(data, list) and len(data) == 0):
                logger.info(f"Fim das emendas para o ano {ano} na página {pagina}.")
                break

            rows = []
            for item in (data if isinstance(data, list) else [data]):
                loc = item.get("localidadeDoGasto") or {}
                rows.append({
                    "codigoEmenda":    str(item.get("codigoEmenda", "") or ""),
                    "autor":           item.get("autor"),
                    "cpfCnpjAutor":    item.get("cpfCnpjAutor"),
                    "valorEmpenhado":  _parse_brazilian_float(item.get("valorEmpenhado")),
                    "valorLiquidado":  _parse_brazilian_float(item.get("valorLiquidado")),
                    "valorPago":       _parse_brazilian_float(item.get("valorPago")),
                    "descricao":       item.get("descricao"),
                    "ano":             int(item["ano"]) if item.get("ano") else None,
                    "funcao":          item.get("funcao"),
                    "subfuncao":       item.get("subfuncao"),
                    "municipio":       loc.get("municipio"),
                    "estado":          loc.get("estado"),
                    "ingest_batch_id": batch_id,
                    "fetched_at":      datetime.now(timezone.utc).isoformat(),
                })

            if rows:
                try:
                    n = _load_rows_bq(client, rows)
                    ano_total += n
                    total_inseridas += n
                    logger.info(f"Ano {ano} pág {pagina}: {n} emendas inseridas.")
                except Exception as e:
                    logger.error(f"Erro ao inserir no BigQuery ano={ano} pagina={pagina}: {e}")

            if len(data) < 100:
                # menos que o tamanho da página = última página
                break

            pagina += 1
            time.sleep(PAGE_SLEEP)

        logger.info(f"Ano {ano}: total {ano_total} emendas processadas.")

    logger.info(f"Ingestão concluída. Total inseridas: {total_inseridas}")
    return 0


def main() -> int:
    global EMENDAS_ANO_MIN
    EMENDAS_ANO_MIN = ANO_MIN
    return run_emendas_ingestion_pipeline()


if __name__ == "__main__":
    sys.exit(main())
