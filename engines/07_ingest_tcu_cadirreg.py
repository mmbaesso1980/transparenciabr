#!/usr/bin/env python3
"""
Protocolo A.S.M.O.D.E.U.S. — TCU CADIRREG → BigQuery.

Tenta buscar dados da API pública do TCU.
Se a API estiver indisponível, cria a tabela vazia e encerra sem erro.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, Table

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

TABLE_ID = "tcu_cadirreg"
_TCU_URL_CANDIDATES = [
    "https://dadosabertos.tcu.gov.br/api/3/action/datastore_search?resource_id=cadirreg",
    "https://contas.tcu.gov.br/ords/api/publica/cadirreg/",
]
DEFAULT_URL = os.environ.get("TCU_CADIRREG_URL", _TCU_URL_CANDIDATES[0])
TIMEOUT = float(os.environ.get("TCU_REQUEST_TIMEOUT_SEC", "30"))
USER_AGENT = "TransparenciaBR-engines/07_tcu_cadirreg"

SCHEMA = [
    SchemaField("cpf_cnpj",               "STRING", mode="REQUIRED"),
    SchemaField("nome",                   "STRING"),
    SchemaField("data_transito_julgado",  "DATE"),
    SchemaField("ano_processo",           "INTEGER"),
    SchemaField("codigo_processo",        "STRING"),
    SchemaField("nome_responsavel_original", "STRING"),
]


def _only_digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s or "")


def _parse_date(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")[:10]
    if isinstance(val, str):
        t = val.strip()
        if not t:
            return None
        if len(t) >= 10 and t[4] == "-":
            return t[:10]
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", t)
        if m:
            return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def _flatten(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(obj, dict):
        return None
    doc = (
        obj.get("cpf_cnpj") or obj.get("numCPF") or obj.get("cpf")
        or obj.get("cnpj") or obj.get("documento")
    )
    nome = (
        obj.get("nomeResponsavel") or obj.get("nome")
        or obj.get("razaoSocial") or obj.get("nome_responsavel")
    )
    doc_clean = _only_digits(str(doc or ""))
    if not doc_clean or not (11 <= len(doc_clean) <= 14):
        return None

    dt = None
    for k in ("datatransitojulgado", "data_transito_julgado"):
        if obj.get(k):
            dt = _parse_date(obj[k])
            break

    return {
        "cpf_cnpj":                doc_clean,
        "nome":                   (str(nome or "") or "—")[:512],
        "data_transito_julgado":  dt,
        "ano_processo":           int(obj["anoProcesso"]) if obj.get("anoProcesso") is not None else None,
        "codigo_processo":        str(obj.get("codigoProcesso") or obj.get("numProcesso") or "")[:64] or None,
        "nome_responsavel_original": str(nome or "")[:512] or None,
    }


def _collect(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "result", "results", "rows", "cadastros"):
            v = payload.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        if any(k in payload for k in ("numCPF", "nomeResponsavel", "nome")):
            return [payload]
    return []


def fetch_remote(base_url: str) -> List[Dict[str, Any]]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    out: List[Dict[str, Any]] = []
    offset = 0
    limit = int(os.environ.get("TCU_PAGE_LIMIT", "200"))
    max_pages = int(os.environ.get("TCU_MAX_PAGES", "500"))

    for _ in range(max_pages):
        try:
            r = session.get(base_url, params={"limit": limit, "offset": offset}, timeout=TIMEOUT)
        except requests.RequestException as exc:
            logger.error("Falha HTTP: %s", exc)
            break
        if r.status_code != 200:
            logger.warning("HTTP %s — offset=%s", r.status_code, offset)
            break
        if "json" not in (r.headers.get("Content-Type") or "").lower():
            break
        try:
            payload = r.json()
        except ValueError:
            break
        chunk = _collect(payload)
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < limit:
            break
        offset += limit

    return out


def _ensure_table(client: bigquery.Client, project: str, dataset: str) -> str:
    """Cria a tabela se não existir. Retorna table_ref."""
    table_ref = f"{project}.{dataset}.{TABLE_ID}"
    client.create_table(Table(table_ref, schema=SCHEMA), exists_ok=True)
    return table_ref


def load_bigquery(rows: List[Dict[str, Any]], *, dry_run: bool) -> None:
    pid = gcp_project_id()
    ds = bq_dataset_id()
    client = bigquery.Client(project=pid)

    # SEMPRE cria a tabela primeiro — resolve o 404 "table not found"
    table_ref = _ensure_table(client, pid, ds)
    logger.info("Tabela %s garantida.", table_ref)

    if dry_run:
        logger.info("[dry-run] %s linhas (sem load job).", len(rows))
        return

    if not rows:
        # Tabela já existe — não precisa truncar, apenas logar
        logger.info("Nenhuma linha útil — tabela mantida vazia.")
        return

    seen: set[str] = set()
    normalized: List[Dict[str, Any]] = []
    for obj in rows:
        flat = _flatten(obj)
        if not flat or flat["cpf_cnpj"] in seen:
            continue
        seen.add(flat["cpf_cnpj"])
        normalized.append(flat)

    if not normalized:
        logger.info("Nenhuma linha válida após normalização.")
        return

    job_config = bigquery.LoadJobConfig(
        schema=SCHEMA,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        ignore_unknown_values=True,
    )
    job = client.load_table_from_json(normalized, table_ref, job_config=job_config)
    job.result()
    tbl = client.get_table(table_ref)
    logger.info("BigQuery CADIRREG | rows=%s | table_rows=%s", len(normalized), tbl.num_rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--from-ndjson", metavar="PATH")
    ap.add_argument("--url", default=DEFAULT_URL)
    args = ap.parse_args()

    if args.from_ndjson:
        logger.info("Origem: arquivo %s", args.from_ndjson)
        with open(args.from_ndjson, encoding="utf-8") as f:
            items = [json.loads(l) for l in f if l.strip()]
    else:
        logger.info("Origem: HTTP %s", args.url)
        items = fetch_remote(args.url)
        if not items:
            for alt in _TCU_URL_CANDIDATES:
                if alt == args.url:
                    continue
                logger.warning("Tentando URL alternativa: %s", alt)
                items = fetch_remote(alt)
                if items:
                    break
        if not items:
            logger.warning("TCU CADIRREG indisponível. Criando tabela vazia e encerrando.")

    try:
        load_bigquery(items, dry_run=args.dry_run)
    except Exception:
        logger.exception("Falha na carga BigQuery — skip limpo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
