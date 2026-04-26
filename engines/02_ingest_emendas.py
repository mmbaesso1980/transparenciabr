#!/usr/bin/env python3
"""
Ingestão de emendas — Portal da Transparência CGU → BigQuery.

Busca emendas paginadas por ano (2018–ano_atual).
A API CGU retorna array vazio quando não há mais páginas.
"""

from __future__ import annotations

import logging
import os
import re
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


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return int(str(raw).strip())


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return float(str(raw).strip())


GCP_PROJECT_ID = gcp_project_id()
BQ_DATASET = bq_dataset_id()
BQ_TABLE_EMENDAS = "emendas"
ANO_MIN = _env_int("EMENDAS_ANO_MIN", 2018)
ANO_MAX = datetime.now().year
PAGE_SLEEP = _env_float("EMENDAS_PAGE_SLEEP", 2.1)
MAX_PAGES_PER_YEAR = _env_int("EMENDAS_MAX_PAGES_PER_YEAR", 1000)
START_YEAR = _env_int("EMENDAS_START_YEAR", ANO_MIN)
START_PAGE = max(1, _env_int("EMENDAS_START_PAGE", 1))

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


def _first(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _extract_emenda_items(payload: Any) -> List[Dict[str, Any]]:
    """Normalize known CGU response shapes to a list of emenda dictionaries."""
    if isinstance(payload, list):
        items: List[Dict[str, Any]] = []
        for raw in payload:
            if isinstance(raw, dict):
                items.append(raw)
            else:
                logger.warning("Item de emenda ignorado: tipo=%s", type(raw).__name__)
        return items

    if not isinstance(payload, dict):
        logger.warning("Payload de emendas ignorado: tipo=%s", type(payload).__name__)
        return []

    for key in ("data", "items", "resultado", "resultados", "registros", "content"):
        value = payload.get(key)
        if isinstance(value, list):
            return _extract_emenda_items(value)

    if payload.get("codigoEmenda") or payload.get("autor") or payload.get("ano"):
        return [payload]

    logger.warning("Payload de emendas sem lista reconhecida. Chaves=%s", sorted(payload.keys()))
    return []


def _extract_localidade(localidade: Any) -> Dict[str, Any]:
    if isinstance(localidade, dict):
        return localidade
    if isinstance(localidade, str):
        text = " ".join(localidade.strip().split())
        if not text:
            return {}
        match = re.search(r"(?:^|[\s\-/])([A-Z]{2})$", text)
        uf = match.group(1) if match else ""
        municipio = text
        if uf:
            municipio = re.sub(r"[\s\-/]*[A-Z]{2}$", "", text).strip()
        return {"municipio": municipio or text, "estado": uf}
    if localidade not in (None, ""):
        logger.debug("localidadeDoGasto ignorada: tipo=%s", type(localidade).__name__)
    return {}


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


def _load_existing_codes(
    client: bigquery.Client,
    *,
    ano_min: int,
    ano_max: int,
) -> tuple[set[str], Dict[int, int]]:
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    sql = f"""
    SELECT
      SAFE_CAST(ano AS INT64) AS ano,
      CAST(codigoEmenda AS STRING) AS codigoEmenda
    FROM `{table_ref}`
    WHERE ano BETWEEN @ano_min AND @ano_max
      AND codigoEmenda IS NOT NULL
      AND TRIM(CAST(codigoEmenda AS STRING)) != ''
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("ano_min", "INT64", int(ano_min)),
            bigquery.ScalarQueryParameter("ano_max", "INT64", int(ano_max)),
        ],
        use_query_cache=True,
    )
    try:
        rows = client.query(sql, job_config=job_config).result()
        codes: set[str] = set()
        counts_by_year: Dict[int, int] = {}
        for row in rows:
            code = str(row.codigoEmenda or "").strip()
            if not code:
                continue
            if code in codes:
                continue
            codes.add(code)
            try:
                year = int(row.ano)
            except (TypeError, ValueError):
                continue
            counts_by_year[year] = counts_by_year.get(year, 0) + 1
    except Exception as exc:
        logger.warning("Não foi possível carregar códigos existentes de emendas: %s", exc)
        return set(), {}
    logger.info(
        "BigQuery | códigos de emendas já existentes=%s | anos=%s",
        len(codes),
        counts_by_year,
    )
    return codes, counts_by_year


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
    start_year = max(ANO_MIN, START_YEAR)
    seen_codes, counts_by_year = _load_existing_codes(client, ano_min=start_year, ano_max=ANO_MAX)
    logger.info(
        "Retomada emendas | ano_min=%s ano_max=%s start_year=%s start_page=%s max_pages_per_year=%s",
        ANO_MIN,
        ANO_MAX,
        start_year,
        START_PAGE,
        MAX_PAGES_PER_YEAR,
    )

    for ano in range(start_year, ANO_MAX + 1):
        if START_PAGE > 1 and ano == start_year:
            pagina = START_PAGE
        else:
            # A API pública da CGU pagina em 15 registros. Se o run anterior
            # caiu, retomamos perto da próxima página estimada e a deduplicação
            # por codigoEmenda cobre eventuais sobreposições.
            pagina = max(1, (counts_by_year.get(ano, 0) // 15) + 1)
        ano_total = 0
        while True:
            url = "https://api.portaldatransparencia.gov.br/api-de-dados/emendas"
            params = {"ano": ano, "pagina": pagina}
            try:
                resp = session.get(url, headers=headers, params=params, timeout=(15, 90))
                if resp.status_code == 404:
                    logger.info(f"Ano {ano} pág {pagina}: 404 — fim de paginação.")
                    break
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                logger.error(f"Falha ao buscar emendas ano={ano} pagina={pagina}: {e}")
                break

            items = _extract_emenda_items(data)
            if not items:
                logger.info(f"Fim das emendas para o ano {ano} na página {pagina}.")
                break

            rows = []
            for item in items:
                loc = _extract_localidade(item.get("localidadeDoGasto"))
                codigo = str(item.get("codigoEmenda", "") or "").strip()
                if not codigo:
                    logger.warning("Emenda sem codigoEmenda ignorada ano=%s pagina=%s", ano, pagina)
                    continue
                if codigo in seen_codes:
                    continue
                seen_codes.add(codigo)
                rows.append({
                    "codigoEmenda":    codigo,
                    "autor":           _first(item.get("autor"), item.get("nomeAutor")),
                    "cpfCnpjAutor":    _first(item.get("cpfCnpjAutor"), item.get("codigoAutor")),
                    "valorEmpenhado":  _parse_brazilian_float(item.get("valorEmpenhado")),
                    "valorLiquidado":  _parse_brazilian_float(item.get("valorLiquidado")),
                    "valorPago":       _parse_brazilian_float(item.get("valorPago")),
                    "descricao":       _first(item.get("descricao"), item.get("tipoEmenda")),
                    "ano":             int(item["ano"]) if item.get("ano") else None,
                    "funcao":          _first(item.get("funcao"), item.get("nomeFuncao"), item.get("codigoFuncao")),
                    "subfuncao":       _first(item.get("subfuncao"), item.get("nomeSubfuncao"), item.get("codigoSubfuncao")),
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

            if pagina >= MAX_PAGES_PER_YEAR:
                logger.warning(
                    "Ano %s atingiu EMENDAS_MAX_PAGES_PER_YEAR=%s; interrompendo para evitar loop infinito.",
                    ano,
                    MAX_PAGES_PER_YEAR,
                )
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
