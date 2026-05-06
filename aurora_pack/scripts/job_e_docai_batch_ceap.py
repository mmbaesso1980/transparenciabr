#!/usr/bin/env python3
"""
JOB E — Document AI Batch CEAP (Aurora Devastador)
==================================================
Processa PDFs de notas fiscais CEAP em batch via Document AI.

PRÉ-CONDIÇÃO: PDFs raw devem existir em gs://projeto-codex-br-vertex-import/ceap/raw/
Se vazio, este job ABORTA limpo (exit 0) e o orchestrator realoca verba para F/G.

DESTINO: gs://projeto-codex-br-docai-output/ceap/<batch_id>/*.json
TABELA: transparenciabr.transparenciabr.ceap_docai_extractions
ORÇAMENTO: R$ 1.200 (≈40k páginas a R$0,03/pág)
KILL: aborta se billing_total > R$ 3.500

Uso:
    python job_e_docai_batch_ceap.py --max-docs 40000 --processor-id <ID>

Idempotente: usa hash MD5 do GCS path como doc_id; pula já processados.
"""
import os
import sys
import json
import time
import hashlib
import argparse
import logging
from datetime import datetime, timezone
from google.cloud import storage, documentai_v1 as documentai, bigquery

# ── CONFIG ─────────────────────────────────────────────────────────────────
PROJECT_BQ = "transparenciabr"
PROJECT_VERTEX = "projeto-codex-br"
LOCATION_DOCAI = "us"  # ajustar se processador estiver em outra região
BUCKET_INPUT = "projeto-codex-br-vertex-import"
PREFIX_INPUT = "ceap/raw/"
BUCKET_OUTPUT = "projeto-codex-br-docai-output"
PREFIX_OUTPUT = "ceap/"
BQ_TABLE = f"{PROJECT_BQ}.transparenciabr.ceap_docai_extractions"
BILLING_TABLE = f"{PROJECT_BQ}.transparenciabr.aurora_billing_log"
BUDGET_HARD_LIMIT_BRL = 3500.0
JOB_BUDGET_BRL = 1200.0
COST_PER_PAGE_BRL = 0.03  # estimativa Document AI Form Parser

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [JOB-E] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def check_kill_switch(bq: bigquery.Client) -> float:
    """Retorna gasto total Aurora; aborta se > BUDGET_HARD_LIMIT_BRL."""
    try:
        q = f"SELECT IFNULL(SUM(cost_brl), 0) AS total FROM `{BILLING_TABLE}`"
        total = list(bq.query(q).result())[0].total
        if total > BUDGET_HARD_LIMIT_BRL:
            log.error(f"KILL-SWITCH ATIVADO: gasto total R$ {total:.2f} > R$ {BUDGET_HARD_LIMIT_BRL}")
            sys.exit(99)
        return float(total)
    except Exception as e:
        log.warning(f"Billing log indisponível ({e}); seguindo com 0")
        return 0.0


def log_billing(bq: bigquery.Client, job: str, cost: float, units: int, note: str):
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "job": job,
        "cost_brl": cost,
        "units": units,
        "note": note,
    }
    try:
        bq.insert_rows_json(BILLING_TABLE, [row])
    except Exception as e:
        log.warning(f"Falha ao registrar billing: {e}")


def list_input_pdfs(storage_client: storage.Client, max_docs: int) -> list:
    bucket = storage_client.bucket(BUCKET_INPUT)
    pdfs = []
    for blob in bucket.list_blobs(prefix=PREFIX_INPUT):
        if blob.name.lower().endswith(".pdf"):
            pdfs.append(f"gs://{BUCKET_INPUT}/{blob.name}")
            if len(pdfs) >= max_docs:
                break
    return pdfs


def already_processed(bq: bigquery.Client, doc_ids: list) -> set:
    if not doc_ids:
        return set()
    try:
        q = f"""
            SELECT doc_id FROM `{BQ_TABLE}`
            WHERE doc_id IN UNNEST(@ids)
        """
        job = bq.query(
            q,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ArrayQueryParameter("ids", "STRING", doc_ids)
                ]
            ),
        )
        return {r.doc_id for r in job.result()}
    except Exception as e:
        log.warning(f"Tabela {BQ_TABLE} não existe ainda; criando no primeiro insert. ({e})")
        return set()


def ensure_output_table(bq: bigquery.Client):
    schema = [
        bigquery.SchemaField("doc_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("gcs_input", "STRING"),
        bigquery.SchemaField("gcs_output", "STRING"),
        bigquery.SchemaField("processor_id", "STRING"),
        bigquery.SchemaField("pages", "INT64"),
        bigquery.SchemaField("text_excerpt", "STRING"),
        bigquery.SchemaField("entities_json", "STRING"),
        bigquery.SchemaField("processed_at", "TIMESTAMP"),
    ]
    table_ref = bigquery.Table(BQ_TABLE, schema=schema)
    try:
        bq.create_table(table_ref, exists_ok=True)
    except Exception as e:
        log.warning(f"create_table: {e}")


def submit_batch(
    docai_client: documentai.DocumentProcessorServiceClient,
    processor_name: str,
    input_uris: list,
    output_uri: str,
) -> str:
    gcs_documents = documentai.GcsDocuments(
        documents=[
            documentai.GcsDocument(gcs_uri=u, mime_type="application/pdf")
            for u in input_uris
        ]
    )
    input_config = documentai.BatchDocumentsInputConfig(gcs_documents=gcs_documents)
    output_config = documentai.DocumentOutputConfig(
        gcs_output_config=documentai.DocumentOutputConfig.GcsOutputConfig(
            gcs_uri=output_uri
        )
    )
    request = documentai.BatchProcessRequest(
        name=processor_name,
        input_documents=input_config,
        document_output_config=output_config,
    )
    operation = docai_client.batch_process_documents(request=request)
    log.info(f"Batch submetido: {operation.operation.name}")
    return operation.operation.name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-docs", type=int, default=40000)
    ap.add_argument("--processor-id", required=False, default=os.getenv("DOCAI_PROCESSOR_ID"))
    ap.add_argument("--batch-size", type=int, default=200, help="Docs por chamada batch")
    args = ap.parse_args()

    if not args.processor_id:
        log.error("DOCAI_PROCESSOR_ID não definido. Crie um Form Parser em projeto-codex-br/us")
        log.error("Exit 0 limpo — orchestrator realocará verba para F/G")
        sys.exit(0)

    bq = bigquery.Client(project=PROJECT_BQ)
    storage_client = storage.Client(project=PROJECT_VERTEX)
    docai_client = documentai.DocumentProcessorServiceClient(
        client_options={"api_endpoint": f"{LOCATION_DOCAI}-documentai.googleapis.com"}
    )

    # 1) Kill-switch
    spent = check_kill_switch(bq)
    log.info(f"Gasto Aurora atual: R$ {spent:.2f}")
    remaining_budget = JOB_BUDGET_BRL
    log.info(f"Orçamento Job E: R$ {remaining_budget:.2f}")

    # 2) Listar input
    pdfs = list_input_pdfs(storage_client, args.max_docs)
    log.info(f"PDFs encontrados em gs://{BUCKET_INPUT}/{PREFIX_INPUT}: {len(pdfs)}")

    if not pdfs:
        log.warning("NENHUM PDF EM INPUT — abortando limpo. Orchestrator realocará verba.")
        log_billing(bq, "job_e_docai", 0.0, 0, "no_input_pdfs_realocar")
        sys.exit(0)

    ensure_output_table(bq)

    # 3) Filtrar já processados
    doc_ids = [hashlib.md5(p.encode()).hexdigest() for p in pdfs]
    done = already_processed(bq, doc_ids)
    pending_pairs = [(p, did) for p, did in zip(pdfs, doc_ids) if did not in done]
    log.info(f"Pendentes após dedup: {len(pending_pairs)}")

    if not pending_pairs:
        log.info("Tudo já processado. Encerrando.")
        sys.exit(0)

    # 4) Submeter em batches
    processor_name = (
        f"projects/{PROJECT_VERTEX}/locations/{LOCATION_DOCAI}/processors/{args.processor_id}"
    )
    batch_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_uri = f"gs://{BUCKET_OUTPUT}/{PREFIX_OUTPUT}{batch_id}/"

    submitted = 0
    estimated_pages = 0
    for i in range(0, len(pending_pairs), args.batch_size):
        chunk = pending_pairs[i : i + args.batch_size]
        # Estimativa: 1 página por PDF média (CEAP nota fiscal)
        chunk_pages = len(chunk)
        est_cost = chunk_pages * COST_PER_PAGE_BRL

        if (spent + estimated_pages * COST_PER_PAGE_BRL + est_cost) > BUDGET_HARD_LIMIT_BRL:
            log.warning(f"Limite global atingido após {submitted} docs. Parando.")
            break
        if estimated_pages * COST_PER_PAGE_BRL + est_cost > JOB_BUDGET_BRL:
            log.warning(f"Orçamento Job E atingido após {submitted} docs. Parando.")
            break

        uris = [p for p, _ in chunk]
        try:
            op_name = submit_batch(docai_client, processor_name, uris, output_uri)
            submitted += len(chunk)
            estimated_pages += chunk_pages
            log_billing(
                bq,
                "job_e_docai",
                est_cost,
                chunk_pages,
                f"batch={op_name}",
            )
            log.info(f"Submetido lote {i//args.batch_size + 1}: {len(chunk)} docs (≈ R$ {est_cost:.2f})")
            time.sleep(2)  # rate-limit suave
        except Exception as e:
            log.error(f"Falha no lote: {e}")
            time.sleep(10)
            continue

    log.info(f"=== JOB E concluído ===")
    log.info(f"Docs submetidos: {submitted}")
    log.info(f"Custo estimado: R$ {estimated_pages * COST_PER_PAGE_BRL:.2f}")
    log.info(f"Output: {output_uri}")
    log.info("ATENÇÃO: jobs DocAI são assíncronos. Leitura JSON em job_e_docai_loader.py (futuro).")


if __name__ == "__main__":
    main()
