"""Auditoria dual-sink: BigQuery + Firestore.

Todo evento é registrado com redação de segredos e dados sensíveis.
CPF nunca em texto claro — sempre mascarado ***.XXX.XXX-**.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from .config import GCPConfig

logger = logging.getLogger(__name__)

_CPF_PATTERN = re.compile(r"\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b")
_SECRET_PATTERNS = [
    re.compile(r"cog_[A-Za-z0-9_\-]{10,}"),
    re.compile(r"AIza[A-Za-z0-9_\-]{30,}"),
    re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{36,}"),
    re.compile(r"ghs_[A-Za-z0-9]{36,}"),
]


def _redact(text: str) -> str:
    """Remove CPFs e segredos do texto, retornando versão mascarada."""
    result = _CPF_PATTERN.sub(r"***.\2.\3-**", text)
    for pattern in _SECRET_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


class AuditLogger:
    """Logger de auditoria com sink dual (BigQuery + Firestore).

    Em ambiente sem credenciais GCP, faz fallback para log local.
    """

    def __init__(self, config: GCPConfig | None = None) -> None:
        self._config = config or GCPConfig()
        self._bq_client = None
        self._fs_client = None
        self._init_clients()

    def _init_clients(self) -> None:
        """Inicializa clientes GCP (falha graciosamente se indisponível)."""
        try:
            from google.cloud import bigquery

            self._bq_client = bigquery.Client(project=self._config.codex_project)
        except Exception:
            logger.info("BigQuery indisponível — fallback para log local.")

        try:
            from google.cloud import firestore

            self._fs_client = firestore.Client(project=self._config.codex_project)
        except Exception:
            logger.info("Firestore indisponível — fallback para log local.")

    def log_event(
        self,
        event_type: str,
        data: dict[str, Any],
        *,
        actor: str = "system",
    ) -> dict[str, Any]:
        """Registra evento auditado com redação de dados sensíveis."""
        safe_data = {k: _redact(str(v)) for k, v in data.items()}
        event = {
            "event_type": event_type,
            "actor": actor,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": safe_data,
        }

        self._write_bigquery(event)
        self._write_firestore(event)
        logger.info("Audit [%s] actor=%s", event_type, actor)

        return event

    def _write_bigquery(self, event: dict[str, Any]) -> None:
        """Insere evento no BigQuery."""
        if not self._bq_client:
            return
        try:
            table_id = (
                f"{self._config.codex_project}."
                f"{self._config.audit_dataset}."
                f"{self._config.audit_table}"
            )
            self._bq_client.insert_rows_json(table_id, [event])
        except Exception as exc:
            logger.error("Falha ao gravar BigQuery: %s", exc)

    def _write_firestore(self, event: dict[str, Any]) -> None:
        """Insere evento no Firestore."""
        if not self._fs_client:
            return
        try:
            collection = self._fs_client.collection("audit_events")
            collection.add(event)
        except Exception as exc:
            logger.error("Falha ao gravar Firestore: %s", exc)
