#!/usr/bin/env python3
"""
Watchdog financeiro — para workers quando o gasto MTD ≥ limiar do orçamento.

Configuração:
  BUDGET_BRL       — orçamento mensal (default 5500)
  THRESHOLD        — fração do orçamento para kill-switch (default 0.90)
  BILLING_TABLE    — tabela BigQuery export do billing (full id dataset.table)

Requer export de billing para BigQuery configurado no projeto.

  python3 scripts/watchdog_billing.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone


def load_table():
    return os.environ.get("BILLING_TABLE", "").strip()


def gasto_mtd_brl(client, table_id: str) -> float:
    from google.cloud import bigquery

    q = f"""
    SELECT SUM(cost * IFNULL(TO_JSON_STRING(currency_conversion_rate), 1)) AS total
    FROM `{table_id}`
    WHERE DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    """
    try:
        rows = list(client.query(q).result())
        if not rows:
            return 0.0
        v = rows[0].total
        return float(v or 0)
    except Exception as exc:
        print(f"[WARN] BigQuery billing query falhou: {exc}", file=sys.stderr)
        return -1.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    budget = float(os.environ.get("BUDGET_BRL", "5500"))
    threshold = float(os.environ.get("THRESHOLD", "0.90"))
    table_id = load_table()

    state = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "budget_brl": budget,
        "threshold": threshold,
        "billing_table_configured": bool(table_id),
    }

    gasto = 0.0
    if table_id:
        try:
            from google.cloud import bigquery

            gasto = gasto_mtd_brl(bigquery.Client(), table_id)
        except ImportError:
            print("Instale google-cloud-bigquery para leitura real.", file=sys.stderr)
            gasto = -1.0
    else:
        print(
            "[INFO] BILLING_TABLE não definido — modo seguro: gasto=0 (configure export billing → BQ)",
            file=sys.stderr,
        )

    if gasto < 0:
        state["gasto_brl"] = None
        state["pct"] = None
        state["note"] = "sem leitura confiável"
    else:
        state["gasto_brl"] = gasto
        state["pct"] = (gasto / budget) if budget else 0

    os.makedirs("logs", exist_ok=True)
    out_path = os.path.join("logs", "watchdog_state.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    print(json.dumps(state, indent=2))

    if args.dry_run:
        print("[dry-run] Não executando kill-switch nem comandos gcloud.")
        return 0

    pct = state.get("pct")
    if pct is not None and pct >= threshold:
        print(
            f"[ALERT] {pct * 100:.1f}% do orçamento — execute manualmente paragem de workers "
            "(embedding-worker, timers, scheduler) conforme runbook.",
            file=sys.stderr,
        )
        # Não invocamos gcloud aqui (requer credenciais interativas / perfil correto).
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
