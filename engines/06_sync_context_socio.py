#!/usr/bin/env python3
"""
Protocolo A.S.M.O.D.E.U.S. — BigQuery → Firestore (contexto socioeconómico apenas).

Lê `vw_parlamentar_base_eleitoral`, mantém TOP N municípios por volume de emendas
por parlamentar e faz merge em `politicos/{id}` sem apagar `alertas_anexados` nem perfil.

Cadência recomendada: semanal ou mensal (dados IBGE/INEP/SNIS mudam pouco).
Separado de `05_sync_bodes.py` para não duplicar writes quando alertas mudam.

Variáveis: GCP_PROJECT (default transparenciabr), SYNC_CONTEXT_TOP_N (default 10).
"""

from __future__ import annotations

import argparse
import logging
import math
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional

from google.cloud import bigquery
from firebase_admin import firestore

from lib.firebase_app import init_firestore
from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

COLLECTION_POLITICOS = "politicos"
VIEW_CONTEXT = "vw_parlamentar_base_eleitoral"
# Limite seguro de operações por batch Firestore (máx. 500).
BATCH_SIZE = 499


def _clean_num(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return x


def _clean_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _row_to_municipio(row: Any) -> Dict[str, Any]:
    """Compatível com `pickContextoSocioeconomicoRows` + campos legíveis no payload."""
    total_val = _clean_num(getattr(row, "total_emendas_valor", None))
    pop = _clean_int(getattr(row, "populacao", None))
    idh = _clean_num(getattr(row, "idh_municipal", None))
    ideb = _clean_num(getattr(row, "ideb_anos_finais", None))
    esgoto_ratio = _clean_num(getattr(row, "indice_atendimento_esgoto", None))
    leitos_hab = _clean_num(getattr(row, "leitos_por_habitante", None))

    leitos_mil = None
    if leitos_hab is not None:
        leitos_mil = round(leitos_hab * 1000.0, 4)

    esgoto_pct = None
    if esgoto_ratio is not None:
        esgoto_pct = round(esgoto_ratio * 100.0, 2)

    codigo = str(getattr(row, "codigo_ibge_municipio", "") or "").strip()
    nome = str(getattr(row, "nome_municipio", "") or "").strip()
    uf = str(getattr(row, "uf", "") or "").strip().upper()[:2]

    out: Dict[str, Any] = {
        "codigo_ibge_municipio": codigo,
        "nome_municipio": nome or codigo,
        "nome": nome or codigo,
        "uf": uf or "",
        "total_emendas_valor": total_val,
        "total_emendas": total_val,
        "n_documentos": _clean_int(getattr(row, "n_documentos", None)),
        "populacao": pop,
        "idh_municipal": idh,
        "idh": idh,
        "ideb_anos_finais": ideb,
        "ideb": ideb,
        "indice_atendimento_esgoto": esgoto_ratio,
        "esgoto_tratado_pct": esgoto_pct,
        "leitos_por_habitante": leitos_hab,
        "leitos_por_mil": leitos_mil,
        "emendas_per_capita_aprox": _clean_num(getattr(row, "emendas_per_capita_aprox", None)),
    }
    return {k: v for k, v in out.items() if v is not None or k in ("uf", "nome", "nome_municipio", "codigo_ibge_municipio")}


def fetch_ranked_rows(
    bq_client: bigquery.Client,
    project: str,
    dataset: str,
    *,
    top_n: int,
) -> tuple[List[Any], int, int]:
    """
    Retorna linhas da view já limitadas a TOP N por parlamentar.
    Tupla: (rows, total_bytes_processed, total_bytes_billed)
    """
    table_id = f"`{project}.{dataset}.{VIEW_CONTEXT}`"
    sql = f"""
    WITH ranked AS (
      SELECT
        parlamentar_id,
        codigo_ibge_municipio,
        total_emendas_valor,
        n_documentos,
        nome_municipio,
        uf,
        populacao,
        ideb_anos_finais,
        indice_atendimento_esgoto,
        idh_municipal,
        leitos_por_habitante,
        emendas_per_capita_aprox,
        ROW_NUMBER() OVER (
          PARTITION BY parlamentar_id
          ORDER BY total_emendas_valor DESC
        ) AS rn
      FROM {table_id}
      WHERE parlamentar_id IS NOT NULL
        AND TRIM(CAST(parlamentar_id AS STRING)) != ''
    )
    SELECT
      parlamentar_id,
      codigo_ibge_municipio,
      total_emendas_valor,
      n_documentos,
      nome_municipio,
      uf,
      populacao,
      ideb_anos_finais,
      indice_atendimento_esgoto,
      idh_municipal,
      leitos_por_habitante,
      emendas_per_capita_aprox
    FROM ranked
    WHERE rn <= @top_n
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("top_n", "INT64", int(top_n)),
        ],
        use_query_cache=True,
    )
    job = bq_client.query(sql, job_config=job_config)
    rows = list(job.result())
    processed = int(job.total_bytes_processed or 0)
    billed = int(job.total_bytes_billed or 0)
    return rows, processed, billed


def group_by_politician(rows: List[Any]) -> Dict[str, List[Any]]:
    by_pid: Dict[str, List[Any]] = defaultdict(list)
    for row in rows:
        pid = str(getattr(row, "parlamentar_id", "") or "").strip()
        if pid:
            by_pid[pid].append(row)
    return dict(by_pid)


def sync_context_socioeconomico(
    *,
    dry_run: bool = False,
    top_n: int = 10,
) -> None:
    project = gcp_project_id()
    dataset = bq_dataset_id()
    bq_client = bigquery.Client(project=project)

    rows, bytes_processed, bytes_billed = fetch_ranked_rows(
        bq_client, project, dataset, top_n=top_n
    )
    logger.info(
        "BigQuery | linhas=%s | bytes_processed=%s | bytes_billed=%s",
        len(rows),
        bytes_processed,
        bytes_billed,
    )

    grouped = group_by_politician(rows)
    logger.info("Parlamentares distintos (com linhas CEAP+município): %s", len(grouped))

    if dry_run:
        logger.info("[dry-run] Sem escrita Firestore (merge contexto_socioeconomico).")
        return

    fs_client = init_firestore()
    col = fs_client.collection(COLLECTION_POLITICOS)

    batch = fs_client.batch()
    ops = 0
    batches = 0
    docs_written = 0

    fonte = f"bq_{project}.{dataset}.{VIEW_CONTEXT}"

    for pid, muni_rows in grouped.items():
        municipios = [_row_to_municipio(r) for r in muni_rows]
        payload = {
            "contexto_socioeconomico": {
                "atualizado_em": firestore.SERVER_TIMESTAMP,
                "fonte": fonte,
                "top_municipios": top_n,
                "municipios": municipios,
            }
        }
        ref = col.document(pid)
        batch.set(ref, payload, merge=True)
        ops += 1
        docs_written += 1

        if ops >= BATCH_SIZE:
            batch.commit()
            batches += 1
            logger.info("Firestore | commit parcial | lote=%s | ops=%s", batches, ops)
            batch = fs_client.batch()
            ops = 0

    if ops > 0:
        batch.commit()
        batches += 1

    logger.info(
        "Firestore | documentos atualizados (merge)=%s | lotes_commit=%s | coleção=%s",
        docs_written,
        batches,
        COLLECTION_POLITICOS,
    )
    logger.info(
        "Telemetria | bq_bytes_processed=%s | bq_bytes_billed=%s",
        bytes_processed,
        bytes_billed,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sincroniza contexto socioeconómico (BQ view → politicos.contexto_socioeconomico).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa query BigQuery e métricas; não grava Firestore.",
    )
    parser.add_argument(
        "--top-municipios",
        type=int,
        default=int(os.environ.get("SYNC_CONTEXT_TOP_N", "10")),
        metavar="N",
        help="TOP N municípios por volume de emendas por parlamentar (predefinição 10).",
    )
    args = parser.parse_args()
    top_n = max(1, min(args.top_municipios, 50))

    try:
        sync_context_socioeconomico(dry_run=args.dry_run, top_n=top_n)
    except Exception:
        logger.exception("Sincronização de contexto socioeconómico falhou.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
