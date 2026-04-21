"""
Identidade GCP / BigQuery / Firebase — projeto **Transparência BR** (único).

Todos os engines devem usar `gcp_project_id()` e `bq_dataset_id()` em vez de
hardcodar nomes de projeto antigos.
"""

from __future__ import annotations

import os

# IDs canónicos (sobrescrever com GCP_PROJECT / BQ_DATASET no ambiente)
DEFAULT_GCP_PROJECT = "transparenciabr"
DEFAULT_BQ_DATASET = "transparenciabr"


def gcp_project_id() -> str:
    return (
        os.environ.get("GCP_PROJECT")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or DEFAULT_GCP_PROJECT
    ).strip()


def bq_dataset_id() -> str:
    return (os.environ.get("BQ_DATASET") or DEFAULT_BQ_DATASET).strip()


def bq_table_fqn(table: str) -> str:
    """`projeto.dataset.tabela` (sem backticks)."""
    return f"{gcp_project_id()}.{bq_dataset_id()}.{table}"
