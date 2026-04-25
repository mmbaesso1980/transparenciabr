"""
Cliente BigQuery — dataset do projeto Transparência BR e inserções em staging.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from lib.project_config import bq_dataset_id, gcp_project_id

logger = logging.getLogger(__name__)

try:
    from google.cloud import bigquery
except ImportError:  # pragma: no cover
    bigquery = None  # type: ignore


def get_project_id() -> str:
    return gcp_project_id()


def get_dataset_id() -> str:
    return bq_dataset_id()


def get_client() -> Any:
    if bigquery is None:
        raise RuntimeError("google-cloud-bigquery não instalado.")
    return bigquery.Client(project=get_project_id() or None)


def insert_staging_rows(
    table_id: str,
    rows: List[Dict[str, Any]],
    *,
    project_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    if not rows:
        return
    pid = project_id or get_project_id()
    ds  = dataset_id or get_dataset_id()
    if not pid:
        raise RuntimeError("Defina GCP_PROJECT_ID no ambiente.")

    client = get_client()
    full = f"{pid}.{ds}.{table_id}"
    errors = client.insert_rows_json(full, rows)
    if errors:
        raise RuntimeError(f"BigQuery insert_rows_json falhou: {errors}")


def staging_row(
    *,
    api_id: str,
    source_url: str,
    payload: Any,
    http_status: int,
    batch_id: str,
) -> Dict[str, Any]:
    body = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, default=str)
    return {
        "ingest_batch_id": batch_id,
        "api_id": api_id,
        "source_url": source_url[:8192],
        "http_status": http_status,
        "payload_json": body,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def new_batch_id() -> str:
    return str(uuid.uuid4())
