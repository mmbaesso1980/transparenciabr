"""
Identidade GCP / BigQuery / Firebase / Vertex AI — projeto TransparenciaBR.

ARQUITETURA CROSS-PROJECT:
  - BigQuery + Firestore → projeto 'transparenciabr' (dados de produção)
  - Vertex AI (Gemini)   → projeto 'projeto-codex-br' (créditos R$ 5.952)

Variáveis canônicas:
  GCP_PROJECT_ID          → projeto de dados (BigQuery/Firestore)
  VERTEX_PROJECT          → projeto de IA (Vertex AI / Gemini)
  BQ_DATASET              → dataset BigQuery
  VERTEX_LOCATION         → região Vertex AI

Hierarquia de resolução (do mais ao menos prioritário):
  1. GCP_PROJECT_ID  (canonical — definido pelo workflow)
  2. GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT  (ADC padrão do GCP)
  3. DEFAULT_GCP_PROJECT (fallback hardcoded)
"""

from __future__ import annotations

import os

# ============================================================
# IDs canônicos (sobrescrever com variáveis de ambiente)
# ============================================================

# Projeto de DADOS (BigQuery, Firestore, Cloud Functions)
DEFAULT_GCP_PROJECT = "transparenciabr"
DEFAULT_BQ_DATASET  = "transparenciabr"

# Projeto de IA (Vertex AI / Gemini — onde estão os créditos)
DEFAULT_VERTEX_PROJECT  = "projeto-codex-br"
DEFAULT_VERTEX_LOCATION = "us-east1"


def gcp_project_id() -> str:
    """Projeto para BigQuery e Firestore (dados de produção)."""
    return (
        os.environ.get("GCP_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or DEFAULT_GCP_PROJECT
    ).strip()


def bq_dataset_id() -> str:
    """Dataset BigQuery."""
    return (os.environ.get("BQ_DATASET") or DEFAULT_BQ_DATASET).strip()


def bq_table_fqn(table: str) -> str:
    """Retorna projeto.dataset.tabela (sem backticks)."""
    return f"{gcp_project_id()}.{bq_dataset_id()}.{table}"


def vertex_project_id() -> str:
    """Projeto para Vertex AI / Gemini (onde estão os créditos)."""
    return (
        os.environ.get("VERTEX_PROJECT")
        or os.environ.get("VERTEX_PROJECT_ID")
        or DEFAULT_VERTEX_PROJECT
    ).strip()


def vertex_location() -> str:
    """Região para Vertex AI."""
    return (
        os.environ.get("VERTEX_LOCATION")
        or DEFAULT_VERTEX_LOCATION
    ).strip()
