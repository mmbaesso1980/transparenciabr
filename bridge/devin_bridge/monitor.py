"""Polling de sessões Devin (v3 não tem webhooks).

Monitora status de sessões ativas e dispara alertas ao Comandante.
"""

from __future__ import annotations

import logging
import time
from typing import Callable

from .config import DevinConfig
from .devin_client import DevinClient, DevinAPIError

logger = logging.getLogger(__name__)

TERMINAL_STATES = {"exit", "error"}
ALERT_STATES = {"error", "suspended"}


class SessionMonitor:
    """Polling loop que monitora sessões Devin e emite callbacks."""

    def __init__(
        self,
        client: DevinClient | None = None,
        config: DevinConfig | None = None,
        on_alert: Callable[[str, dict], None] | None = None,
    ) -> None:
        self._config = config or DevinConfig()
        self._client = client or DevinClient(self._config)
        self._on_alert = on_alert
        self._tracked: dict[str, str] = {}

    def poll_once(self) -> list[dict]:
        """Consulta sessões e retorna as que mudaram de status."""
        changed = []
        try:
            result = self._client.list_sessions()
            sessions = result.get("sessions", [])
        except DevinAPIError as exc:
            logger.error("Falha ao listar sessões: %s", exc)
            return changed

        for session in sessions:
            sid = session.get("devin_id", "")
            status = session.get("status", "")
            previous = self._tracked.get(sid)

            if previous != status:
                self._tracked[sid] = status
                if previous is not None:
                    changed.append(session)
                    if status in ALERT_STATES and self._on_alert:
                        self._on_alert(status, session)

        return changed

    def run(self, *, max_iterations: int | None = None) -> None:
        """Loop de polling contínuo."""
        iterations = 0
        while True:
            self.poll_once()
            iterations += 1
            if max_iterations and iterations >= max_iterations:
                break
            time.sleep(self._config.poll_interval_seconds)


if __name__ == "__main__":
    import logging
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stdout,
    )
    monitor = SessionMonitor()
    monitor.run()
