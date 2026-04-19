#!/usr/bin/env python3
"""
Sincroniza alertas do BigQuery (Benford + Z-score + Gemini) → Firestore `alertas_bodes`.

Requer: vw_alertas_bodes_export criada no projeto.
"""

from __future__ import annotations

import hashlib
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from google.cloud import bigquery  # noqa: E402

from lib.firebase_app import init_firestore  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def doc_id_from_row(row: Dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(row.get("politico_id") or ""),
            str(row.get("tipo_risco") or ""),
            str(row.get("mensagem") or "")[:120],
            str(row.get("fonte") or ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:28]


def fetch_export_rows(client: bigquery.Client, project: str, limit: int = 5000):
    sql = f"""
    SELECT politico_id, tipo_risco, mensagem, severidade, criado_em, fonte
    FROM `{project}.transparenciabr.vw_alertas_bodes_export`
    LIMIT {int(limit)}
    """
    return list(client.query(sql).result())


def main() -> None:
    project = (
        os.environ.get("GCP_PROJECT")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or ""
    ).strip()
    if not project:
        logger.error("Defina GCP_PROJECT / GOOGLE_CLOUD_PROJECT.")
        sys.exit(1)

    limit = int(os.environ.get("BQ_ALERT_LIMIT", "5000"))
    client = bigquery.Client(project=project)
    rows = fetch_export_rows(client, project, limit=limit)
    logger.info("BigQuery retornou %s linhas.", len(rows))

    fs = init_firestore()
    col = fs.collection("alertas_bodes")
    batch = fs.batch()
    now = datetime.now(timezone.utc)

    for i, item in enumerate(rows):
        row = dict(item)
        pid = row.get("politico_id") or ""
        if not pid:
            continue
        doc_id = doc_id_from_row(row)
        ref = col.document(doc_id)
        payload = {
            "politico_id": pid,
            "tipo": row.get("tipo_risco") or "classificacao",
            "tipo_risco": row.get("tipo_risco"),
            "mensagem": row.get("mensagem") or "",
            "severidade": row.get("severidade") or "media",
            "fonte": row.get("fonte") or "bigquery",
            "criado_em": row.get("criado_em") or now,
            "sincronizado_em": now,
        }
        batch.set(ref, payload, merge=True)
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = fs.batch()
            logger.info("Commit parcial (%s docs).", i + 1)

    batch.commit()
    logger.info("Upsert concluído (%s documentos processados).", len(rows))


if __name__ == "__main__":
    main()
