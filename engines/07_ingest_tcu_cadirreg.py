#!/usr/bin/env python3
"""
Protocolo A.S.M.O.D.E.U.S. — EL apenas: TCU CADIRREG → BigQuery (GCP_PROJECT / BQ_DATASET.tcu_cadirreg).

A API pública CADIRREG no portal TCU é exposta tipicamente como consulta por documento (CPF).
Este orquestrador tenta:
  1) Coleção ORDS paginada (JSON com `items` / array na raiz);
  2) Variantes de URL em `TCU_CADIRREG_URL`;
  3) Ficheiro local `--from-ndjson` para CI/dados espelhados.

Sem processamento analítico em Python — só parse mínimo + carga.

Variáveis: GCP_PROJECT, TCU_CADIRREG_URL, TCU_REQUEST_TIMEOUT_SEC
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
from google.cloud.bigquery import LoadJobConfig, SchemaField, SourceFormat, WriteDisposition

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)
TABLE_ID = "tcu_cadirreg"
# URL principal (dados abertos TCU - formato ORDS paginado)
# Fallback: portal dados abertos TCU via API REST
_TCU_URL_CANDIDATES = [
    "https://dadosabertos.tcu.gov.br/api/3/action/datastore_search?resource_id=cadirreg",
    "https://contas.tcu.gov.br/ords/api/publica/cadirreg/",
]
DEFAULT_URL = os.environ.get(
    "TCU_CADIRREG_URL",
    _TCU_URL_CANDIDATES[0],
)
TIMEOUT = float(os.environ.get("TCU_REQUEST_TIMEOUT_SEC", "120"))

USER_AGENT = "TransparenciaBR-engines/07_tcu_cadirreg (EL; contato: projeto)"


def _only_digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s or "")


def _parse_date(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, str):
        t = val.strip()
        if not t:
            return None
        # ISO
        try:
            if len(t) >= 10 and t[4] == "-":
                return t[:10]
        except IndexError:
            pass
        # DD/MM/YYYY
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", t)
        if m:
            d, mo, y = m.group(1), m.group(2), m.group(3)
            return f"{y}-{mo}-{d}"
    return None


def _flatten_cadirreg_record(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Mapeia resposta CADIRREG (doc TCU) para linha da tabela."""
    if not isinstance(obj, dict):
        return None

    if obj.get("cpf_cnpj"):
        doc_clean = _only_digits(str(obj["cpf_cnpj"]))
        if len(doc_clean) < 11:
            return None
        return {
            "cpf_cnpj": doc_clean,
            "nome": str(obj.get("nome") or "—")[:512],
            "data_transito_julgado": obj.get("data_transito_julgado"),
            "ano_processo": obj.get("ano_processo"),
            "codigo_processo": str(obj.get("codigo_processo") or "")[:64] or None,
            "nome_responsavel_original": str(obj.get("nome_responsavel_original") or obj.get("nome") or "")[:512]
            or None,
        }

    doc = (
        obj.get("numCPF")
        or obj.get("cpf")
        or obj.get("cnpj")
        or obj.get("cpf_cnpj")
        or obj.get("documento")
    )
    nome = (
        obj.get("nomeResponsavel")
        or obj.get("nome")
        or obj.get("razaoSocial")
        or obj.get("nome_responsavel")
    )

    dt_transito = None
    if obj.get("datatransitojulgado"):
        dt_transito = _parse_date(obj.get("datatransitojulgado"))
    elif obj.get("data_transito_julgado"):
        dt_transito = _parse_date(obj.get("data_transito_julgado"))
    else:
        dels = obj.get("deliberacao")
        if isinstance(dels, list) and dels:
            dt_transito = _parse_date(dels[0].get("data") if isinstance(dels[0], dict) else None)
        sit = obj.get("situacao")
        if not dt_transito and isinstance(sit, list) and sit and isinstance(sit[0], dict):
            dt_transito = _parse_date(sit[0].get("data"))

    doc_clean = _only_digits(str(doc or ""))
    if not doc_clean or len(doc_clean) < 11 or len(doc_clean) > 14:
        return None

    row: Dict[str, Any] = {
        "cpf_cnpj": doc_clean,
        "nome": (nome or "")[:512] or "—",
        "data_transito_julgado": dt_transito,
        "ano_processo": int(obj["anoProcesso"]) if obj.get("anoProcesso") is not None else None,
        "codigo_processo": str(obj.get("codigoProcesso") or obj.get("numProcesso") or "")[:64] or None,
        "nome_responsavel_original": str(nome or "")[:512] or None,
    }
    return row


def _collect_json_items(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("items", "data", "result", "results", "rows", "cadastros"):
            v = payload.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        # único objeto CADIRREG
        if any(k in payload for k in ("numCPF", "nomeResponsavel", "nome")):
            return [payload]
    return []


def fetch_remote_pages(base_url: str) -> List[Dict[str, Any]]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    out: List[Dict[str, Any]] = []
    offset = 0
    limit = int(os.environ.get("TCU_PAGE_LIMIT", "200"))
    max_pages = int(os.environ.get("TCU_MAX_PAGES", "500"))

    for page in range(max_pages):
        params = {"limit": limit, "offset": offset}
        try:
            r = session.get(base_url, params=params, timeout=TIMEOUT)
        except requests.RequestException as exc:
            logger.error("Falha HTTP: %s", exc)
            break

        ctype = (r.headers.get("Content-Type") or "").lower()
        if r.status_code != 200:
            logger.warning("HTTP %s — tentativa offset=%s", r.status_code, offset)
            break

        if "json" not in ctype:
            logger.warning("Resposta não-JSON (content-type=%s). Parar paginação.", ctype)
            break

        try:
            payload = r.json()
        except ValueError:
            logger.error("Corpo não é JSON válido.")
            break

        chunk = _collect_json_items(payload)
        if not chunk:
            logger.info("Página vazia — fim (offset=%s).", offset)
            break

        out.extend(chunk)

        if len(chunk) < limit:
            break

        # ORDS: próximo offset
        offset += limit

    return out


def load_ndjson(path: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def rows_to_bq_rows(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for obj in raw_items:
        flat = _flatten_cadirreg_record(obj)
        if not flat:
            continue
        key = flat["cpf_cnpj"]
        if key in seen:
            continue
        seen.add(key)
        out.append(flat)
    return out


def load_bigquery(rows: List[Dict[str, Any]], *, dry_run: bool) -> None:
    pid = gcp_project_id()
    ds = bq_dataset_id()
    client = bigquery.Client(project=pid)
    table_ref = f"{pid}.{ds}.{TABLE_ID}"

    schema = [
        SchemaField("cpf_cnpj", "STRING", mode="REQUIRED"),
        SchemaField("nome", "STRING"),
        SchemaField("data_transito_julgado", "DATE"),
        SchemaField("ano_processo", "INTEGER"),
        SchemaField("codigo_processo", "STRING"),
        SchemaField("nome_responsavel_original", "STRING"),
    ]

    if dry_run:
        logger.info("[dry-run] Linhas normalizadas: %s (sem load job).", len(rows))
        if rows:
            logger.info("Exemplo: %s", json.dumps(rows[0], ensure_ascii=False)[:400])
        return

    if not rows:
        client.query(
            f"TRUNCATE TABLE `{table_ref}`",
            job_config=bigquery.QueryJobConfig(use_query_cache=True),
        ).result()
        logger.info("BigQuery | TRUNCATE %s (0 linhas úteis).", table_ref)
        return

    job_config = LoadJobConfig(
        schema=schema,
        source_format=SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=WriteDisposition.WRITE_TRUNCATE,
        ignore_unknown_values=True,
    )

    job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()

    tbl = client.get_table(table_ref)
    processed = getattr(job, "input_file_bytes", None) or getattr(job, "total_bytes_processed", None)
    logger.info(
        "BigQuery | load_table_from_json | rows=%s | job_bytes=%s | table=%s",
        len(rows),
        processed,
        table_ref,
    )
    logger.info("Tabela | numRows=%s | numBytes=%s", tbl.num_rows, tbl.num_bytes)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingestão TCU CADIRREG → BigQuery (WRITE_TRUNCATE).")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--from-ndjson",
        metavar="PATH",
        help="Ficheiro NDJSON (um objeto JSON por linha) em vez de HTTP.",
    )
    ap.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Endpoint base ORDS (predefinição: env TCU_CADIRREG_URL ou URL padrão).",
    )
    ap.add_argument(
        "--allow-empty",
        action="store_true",
        help="Permite carga vazia (trunca tabela sem linhas úteis).",
    )
    args = ap.parse_args()

    if args.from_ndjson:
        logger.info("Origem: ficheiro %s", args.from_ndjson)
        raw = load_ndjson(args.from_ndjson)
        items = raw
    else:
        logger.info("Origem: HTTP %s", args.url)
        items = fetch_remote_pages(args.url)
        # Se vier vazio, tenta URLs alternativas automaticamente
        if not items:
            for alt_url in _TCU_URL_CANDIDATES:
                if alt_url == args.url:
                    continue
                logger.warning("Tentando URL alternativa TCU: %s", alt_url)
                items = fetch_remote_pages(alt_url)
                if items:
                    break
        # Se ainda vazio, continua com allow_empty para não quebrar o pipeline
        if not items:
            logger.warning("TCU CADIRREG indisponível. Continuando sem dados.")
            args.allow_empty = True

    normalized = rows_to_bq_rows([x for x in items if isinstance(x, dict)])

    if not normalized and not args.allow_empty:
        logger.warning(
            "Nenhuma linha válida (API indisponível ou formato inesperado). "
            "Retornando skip limpo.",
        )
        return 0

    try:
        load_bigquery(normalized, dry_run=args.dry_run)
    except Exception:
        logger.exception("Falha na carga BigQuery (tabela não criada, permissão ou esquema inválido). Skip limpo.")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
