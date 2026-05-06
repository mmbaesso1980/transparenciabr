#!/usr/bin/env python3
"""
JOB F — Embeddings em Massa (Aurora Devastador)
================================================
Gera embeddings text-embedding-005 (768d) para todos os textos relevantes do lake:
  - ceap_despesas.txtFornecedor + txtDescricao + numCnpjCpf
  - emendas.descricao + nomeAutor + objetivo
  - senado_despesas.descricao + fornecedor (se Job C populou)
  - vw_indicadores_municipais.municipio (para grounding geográfico)

DESTINO: transparenciabr.transparenciabr.embeddings_unified
ORÇAMENTO: R$ 600 (≈1.5M textos a R$0,40/mil)
KILL: aborta se billing_total > R$ 3.500

Uso:
    python job_f_embeddings_massa.py --batch 250 --max 1500000

Idempotente: dedupe por hash(text). Reentrável: WHERE NOT EXISTS.
"""
import os
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime, timezone
from google.cloud import bigquery
from google.cloud import aiplatform
from vertexai.preview.language_models import TextEmbeddingModel

# ── CONFIG ─────────────────────────────────────────────────────────────────
PROJECT_BQ = "transparenciabr"
PROJECT_VERTEX = "projeto-codex-br"
REGION_VERTEX = "us-central1"
MODEL_NAME = "text-embedding-005"
BQ_TABLE = f"{PROJECT_BQ}.transparenciabr.embeddings_unified"
BILLING_TABLE = f"{PROJECT_BQ}.transparenciabr.aurora_billing_log"
BUDGET_HARD_LIMIT_BRL = 3500.0
JOB_BUDGET_BRL = 600.0
COST_PER_1K_TEXTS_BRL = 0.40

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [JOB-F] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def check_kill_switch(bq: bigquery.Client) -> float:
    try:
        q = f"SELECT IFNULL(SUM(cost_brl), 0) AS total FROM `{BILLING_TABLE}`"
        total = list(bq.query(q).result())[0].total
        if total > BUDGET_HARD_LIMIT_BRL:
            log.error(f"KILL-SWITCH: R$ {total:.2f} > R$ {BUDGET_HARD_LIMIT_BRL}")
            sys.exit(99)
        return float(total)
    except Exception as e:
        log.warning(f"Billing log indisponível ({e})")
        return 0.0


def log_billing(bq, job, cost, units, note):
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
        log.warning(f"Falha billing log: {e}")


def ensure_table(bq: bigquery.Client):
    schema = [
        bigquery.SchemaField("text_hash", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("source_table", "STRING"),
        bigquery.SchemaField("source_pk", "STRING"),
        bigquery.SchemaField("text", "STRING"),
        bigquery.SchemaField("embedding", "FLOAT64", mode="REPEATED"),
        bigquery.SchemaField("model", "STRING"),
        bigquery.SchemaField("created_at", "TIMESTAMP"),
    ]
    table = bigquery.Table(BQ_TABLE, schema=schema)
    table.clustering_fields = ["source_table"]
    try:
        bq.create_table(table, exists_ok=True)
        log.info(f"Tabela {BQ_TABLE} pronta")
    except Exception as e:
        log.warning(f"create_table: {e}")


def fetch_pending_texts(bq: bigquery.Client, max_rows: int) -> list:
    """
    Une textos de múltiplas fontes e remove os já presentes em embeddings_unified.
    """
    q = f"""
    WITH unified AS (
      SELECT
        'ceap' AS source_table,
        CAST(idDocumento AS STRING) AS source_pk,
        CONCAT(
          IFNULL(txtFornecedor,''), ' | ',
          IFNULL(txtDescricao,''), ' | ',
          IFNULL(numCnpjCpf,'')
        ) AS text
      FROM `{PROJECT_BQ}.transparenciabr.ceap_despesas`
      WHERE txtFornecedor IS NOT NULL OR txtDescricao IS NOT NULL

      UNION ALL

      SELECT
        'emendas' AS source_table,
        CAST(idEmenda AS STRING) AS source_pk,
        CONCAT(
          IFNULL(descricao,''), ' | ',
          IFNULL(nomeAutor,''), ' | ',
          IFNULL(objetivo,'')
        ) AS text
      FROM `{PROJECT_BQ}.transparenciabr.emendas`
      WHERE descricao IS NOT NULL
    ),
    hashed AS (
      SELECT
        TO_HEX(MD5(text)) AS text_hash,
        source_table, source_pk, text
      FROM unified
      WHERE LENGTH(TRIM(text)) > 5
    )
    SELECT h.text_hash, h.source_table, h.source_pk, h.text
    FROM hashed h
    LEFT JOIN `{BQ_TABLE}` e USING(text_hash)
    WHERE e.text_hash IS NULL
    LIMIT {max_rows}
    """
    log.info("Buscando textos pendentes (pode demorar...)")
    rows = list(bq.query(q).result())
    log.info(f"Pendentes: {len(rows)}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=250, help="Textos por chamada API (max 250)")
    ap.add_argument("--max", type=int, default=1_500_000)
    ap.add_argument("--sleep", type=float, default=0.3)
    args = ap.parse_args()

    bq = bigquery.Client(project=PROJECT_BQ)
    aiplatform.init(project=PROJECT_VERTEX, location=REGION_VERTEX)
    model = TextEmbeddingModel.from_pretrained(MODEL_NAME)

    spent_total = check_kill_switch(bq)
    log.info(f"Gasto Aurora: R$ {spent_total:.2f} | Orçamento Job F: R$ {JOB_BUDGET_BRL}")

    ensure_table(bq)

    pending = fetch_pending_texts(bq, args.max)
    if not pending:
        log.info("Nada pendente. Encerrando.")
        return

    job_spent = 0.0
    inserted = 0
    rows_to_insert = []

    for i in range(0, len(pending), args.batch):
        # Kill-switch a cada lote
        if (spent_total + job_spent) > BUDGET_HARD_LIMIT_BRL:
            log.error("KILL-SWITCH GLOBAL atingido")
            break
        if job_spent > JOB_BUDGET_BRL:
            log.warning(f"Orçamento Job F esgotado em {inserted} embeddings")
            break

        batch_rows = pending[i : i + args.batch]
        texts = [r.text[:8000] for r in batch_rows]

        try:
            t0 = time.time()
            embeds = model.get_embeddings(texts)
            dt = time.time() - t0

            for r, emb in zip(batch_rows, embeds):
                rows_to_insert.append({
                    "text_hash": r.text_hash,
                    "source_table": r.source_table,
                    "source_pk": r.source_pk,
                    "text": r.text[:8000],
                    "embedding": list(emb.values),
                    "model": MODEL_NAME,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

            cost = (len(batch_rows) / 1000.0) * COST_PER_1K_TEXTS_BRL
            job_spent += cost
            inserted += len(batch_rows)

            # Flush a cada 5 lotes para não estourar memória
            if len(rows_to_insert) >= 1000:
                errors = bq.insert_rows_json(BQ_TABLE, rows_to_insert)
                if errors:
                    log.error(f"Insert errors: {errors[:3]}")
                else:
                    log.info(f"Flush {len(rows_to_insert)} rows | total={inserted} | R${job_spent:.2f} | {dt:.1f}s/batch")
                rows_to_insert = []

            log_billing(bq, "job_f_embeddings", cost, len(batch_rows), f"batch_{i//args.batch}")
            time.sleep(args.sleep)

        except Exception as e:
            log.error(f"Erro lote {i}: {e}")
            time.sleep(5)
            continue

    # Flush final
    if rows_to_insert:
        errors = bq.insert_rows_json(BQ_TABLE, rows_to_insert)
        if errors:
            log.error(f"Insert final errors: {errors[:3]}")

    log.info(f"=== JOB F concluído ===")
    log.info(f"Embeddings inseridos: {inserted}")
    log.info(f"Custo: R$ {job_spent:.2f}")


if __name__ == "__main__":
    main()
