"""Alertas via Telegram para o Comandante.

Envia notificações de status, erros e decisões WOLF ao chat configurado.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

from .config import TelegramConfig

logger = logging.getLogger(__name__)


class TelegramAlerts:
    """Envia mensagens ao chat do Comandante via Bot API."""

    BASE_URL = "https://api.telegram.org/bot{token}"

    def __init__(self, config: TelegramConfig | None = None) -> None:
        self._config = config or TelegramConfig()
        self._base = self.BASE_URL.format(token=self._config.bot_token)

    def _split_message(self, text: str) -> list[str]:
        """Divide mensagem em chunks <= max_message_length."""
        max_len = self._config.max_message_length
        if len(text) <= max_len:
            return [text]
        chunks = []
        while text:
            if len(text) <= max_len:
                chunks.append(text)
                break
            split_at = text.rfind("\n", 0, max_len)
            if split_at <= 0:
                split_at = max_len
            chunks.append(text[:split_at])
            text = text[split_at:].lstrip("\n")
        return chunks

    def send(
        self,
        text: str,
        *,
        chat_id: str | None = None,
        parse_mode: str = "HTML",
    ) -> list[dict[str, Any]]:
        """Envia mensagem com retry em caso de rate-limit (429)."""
        target = chat_id or self._config.commander_chat_id
        chunks = self._split_message(text)
        responses = []

        for chunk in chunks:
            resp = self._send_single(chunk, target, parse_mode)
            responses.append(resp)

        return responses

    def _send_single(
        self, text: str, chat_id: str, parse_mode: str
    ) -> dict[str, Any]:
        """Envia um chunk com backoff exponencial em 429."""
        url = f"{self._base}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        max_retries = self._config.rate_limit_max_retries
        backoff = 1.0

        for attempt in range(max_retries + 1):
            try:
                resp = requests.post(url, json=payload, timeout=30)
                if resp.status_code == 429:
                    retry_after = resp.json().get("parameters", {}).get(
                        "retry_after", backoff
                    )
                    logger.warning(
                        "Rate-limit 429 do Telegram. Retry em %ss (tentativa %d/%d)",
                        retry_after,
                        attempt + 1,
                        max_retries,
                    )
                    time.sleep(retry_after)
                    backoff = min(backoff * 2, 60)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                if attempt == max_retries:
                    logger.error("Falha ao enviar alerta Telegram: %s", exc)
                    return {"ok": False, "error": str(exc)}
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)

        return {"ok": False, "error": "max retries exceeded"}

    def alert_session_status(self, status: str, session: dict) -> None:
        """Alerta sobre mudança de status de sessão Devin."""
        sid = session.get("devin_id", "?")
        title = session.get("title", "sem título")
        msg = (
            f"⚠️ <b>Sessão Devin [{status.upper()}]</b>\n"
            f"ID: <code>{sid}</code>\n"
            f"Título: {title}"
        )
        self.send(msg)

    def alert_wolf_decision(self, decision: dict) -> None:
        """Alerta sobre decisão WOLF emitida."""
        acao = decision.get("acao", "?")
        conviccao = decision.get("conviccao", 0)
        msg = (
            f"🐺 <b>WOLF Decisão</b>\n"
            f"Ação: <code>{acao}</code>\n"
            f"Convicção: {conviccao:.0%}\n"
            f"Override técnico: {decision.get('override_tecnico', False)}"
        )
        self.send(msg)
