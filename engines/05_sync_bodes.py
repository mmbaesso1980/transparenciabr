import argparse
import hashlib
import logging
import os
import sys
from datetime import datetime, timezone

from google.cloud import bigquery
from firebase_admin import firestore

from lib.firebase_app import init_firestore
from lib.project_config import bq_dataset_id, gcp_project_id

# ==============================================================================
# PROTOCOLO A.S.M.O.D.E.U.S. — BigQuery → Firestore
#  - `politicos` (array `alertas_anexados`)
#  - `alertas_bodes` (documentos planos para fila / mapa)
# Contexto socioeconómico (cadência baixa): ver `06_sync_context_socio.py`.
# ==============================================================================

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

COLLECTION_POLITICOS = "politicos"
COLLECTION_ALERTAS = "alertas_bodes"


def _utc_dt(value):
    if value is None:
        return datetime.now(timezone.utc)
    if hasattr(value, "tzinfo") and getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=timezone.utc)
    if hasattr(value, "astimezone"):
        return value.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


def _alert_doc_id(politico_id: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{politico_id}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _sync_politicos_embedded(fs_client, bq_client, project: str, dataset: str) -> None:
    query = """
        SELECT
            politico_id,
            ARRAY_AGG(
                STRUCT(tipo_risco AS tipo, mensagem AS trecho, severidade)
            ) AS alertas
        FROM `{project}.{dataset}.vw_alertas_bodes_export`
        WHERE politico_id IS NOT NULL
        GROUP BY politico_id
    """.format(project=project, dataset=dataset)
    query_job = bq_client.query(query, job_config=bigquery.QueryJobConfig(use_query_cache=True))
    rows = list(query_job.result())
    logger.info("Políticos com alertas agregados: %s", len(rows))
    if not rows:
        return

    batch = fs_client.batch()
    n = 0
    batches = 0
    col = fs_client.collection(COLLECTION_POLITICOS)

    for row in rows:
        pid = str(row.politico_id).strip()
        alertas_list = []
        for alerta in row.alertas:
            alertas_list.append(
                {
                    "tipo": alerta["tipo"] or "classificacao",
                    "trecho": alerta["trecho"] or "",
                    "severidade": alerta["severidade"] or "media",
                }
            )
        batch.set(col.document(pid), {"alertas_anexados": alertas_list}, merge=True)
        n += 1
        if n >= 400:
            batch.commit()
            batches += 1
            logger.info("Commit parcial (politicos), lote %s…", batches)
            batch = fs_client.batch()
            n = 0
    if n > 0:
        batch.commit()
    logger.info("Upsert em `%s` concluído.", COLLECTION_POLITICOS)


def _sync_alertas_flat(
    fs_client, bq_client, project: str, dataset: str, *, flat_limit: int
) -> None:
    query = """
        SELECT
            politico_id,
            tipo_risco,
            mensagem,
            severidade,
            criado_em,
            fonte
        FROM `{project}.{dataset}.vw_alertas_bodes_export`
        WHERE politico_id IS NOT NULL
        LIMIT {lim}
    """.format(project=project, dataset=dataset, lim=int(flat_limit))
    query_job = bq_client.query(query, job_config=bigquery.QueryJobConfig(use_query_cache=True))
    rows = list(query_job.result())
    logger.info("Linhas planas para `%s`: %s", COLLECTION_ALERTAS, len(rows))
    if not rows:
        return

    batch = fs_client.batch()
    n = 0
    batches = 0
    col = fs_client.collection(COLLECTION_ALERTAS)

    for row in rows:
        pid = str(row.politico_id).strip()
        tipo = str(row.tipo_risco or "tipo_indeterminado")
        msg = str(row.mensagem or "")
        sev = str(row.severidade or "media")
        fonte = str(row.fonte or "bigquery")
        criado = _utc_dt(getattr(row, "criado_em", None))
        criado_iso = criado.isoformat()
        doc_id = _alert_doc_id(pid, tipo, msg, criado_iso, fonte)
        payload = {
            "politico_id": pid,
            "parlamentar_id": pid,
            "tipo_risco": tipo,
            "mensagem": msg,
            "severidade": sev,
            "criticidade": sev,
            "fonte": fonte,
            "criado_em": criado,
            "sincronizado_em": firestore.SERVER_TIMESTAMP,
        }
        batch.set(col.document(doc_id), payload, merge=True)
        n += 1
        if n >= 450:
            batch.commit()
            batches += 1
            logger.info("Commit parcial (%s), lote %s…", COLLECTION_ALERTAS, batches)
            batch = fs_client.batch()
            n = 0
    if n > 0:
        batch.commit()
    logger.info("Upsert em `%s` concluído.", COLLECTION_ALERTAS)


def run_sync(*, dry_run: bool = False, alertas_flat: bool = True, flat_limit: int = 10000) -> None:
    project = gcp_project_id()
    dataset = bq_dataset_id()
    bq_client = bigquery.Client(project=project)
    fs_client = None if dry_run else init_firestore()

    logger.info("Extração BigQuery (projeto=%s dataset=%s)…", project, dataset)

    try:
        probe = bq_client.query(
            "SELECT COUNT(*) AS c FROM `{project}.{dataset}.vw_alertas_bodes_export`".format(
                project=project,
                dataset=dataset,
            ),
            job_config=bigquery.QueryJobConfig(use_query_cache=True),
        )
        total = list(probe.result())[0].c
        logger.info("View vw_alertas_bodes_export: ~%s linhas (aprox.)", total)
    except Exception as e:
        logger.error("Falha ao inspecionar view: %s", e)
        sys.exit(1)

    if dry_run:
        logger.info(
            "[dry-run] Sem escrita Firestore (alertas_flat=%s, limite=%s).",
            alertas_flat,
            flat_limit,
        )
        return

    _sync_politicos_embedded(fs_client, bq_client, project, dataset)
    if alertas_flat:
        _sync_alertas_flat(fs_client, bq_client, project, dataset, flat_limit=flat_limit)

    logger.info("Sincronização concluída.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sincroniza vw_alertas_bodes_export → Firestore (politicos + alertas_bodes).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Consulta BigQuery sem gravar.")
    parser.add_argument(
        "--no-alertas-bodes",
        action="store_true",
        help="Grava só em `politicos` (sem coleção plana alertas_bodes).",
    )
    parser.add_argument(
        "--flat-limit",
        type=int,
        default=int(os.environ.get("SYNC_ALERTAS_FLAT_LIMIT", "10000")),
        help="Máximo de linhas na sincronização plana (predefinição 10000).",
    )
    args = parser.parse_args()
    run_sync(
        dry_run=args.dry_run,
        alertas_flat=not args.no_alertas_bodes,
        flat_limit=max(1, args.flat_limit),
    )
