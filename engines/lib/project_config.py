"""
Identidade GCP / BigQuery / Firebase — projeto **Transparência BR** (único).

Variável canônica: GCP_PROJECT_ID
Todos os engines devem usar gcp_project_id() e bq_dataset_id().

Hieraqurquia de resolução (do mais ao menos prioritário):
  1. GCP_PROJECT_ID  (canonical — definido pelo workflow)
  2. GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT  (ADC padrão do GCP)
  3. DEFAULT_GCP_PROJECT (fallback hardcoded)
"""

from __future__ import annotations

import os

# IDs canônicos (sobrescrever com GCP_PROJECT_ID no ambiente)
DEFAULT_GCP_PROJECT = "transparenciabr"
DEFAULT_BQ_DATASET  = "transparenciabr"


def gcp_project_id() -> str:
    return (
        os.environ.get("GCP_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or DEFAULT_GCP_PROJECT
    ).strip()


def bq_dataset_id() -> str:
    return (os.environ.get("BQ_DATASET") or DEFAULT_BQ_DATASET).strip()


def bq_table_fqn(table: str) -> str:
    ""`projeto.dataset.tabela` (sem backticks)."""
    return f"{gcp_project_id()}.{bq_dataset_id()}.{table}"
