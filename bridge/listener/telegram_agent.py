"""Cérebro do bot Telegram @Asmodeuswebforgebot.

Long-polling, memória Firestore, comandos estruturados (custo zero — não chamam Gemini).
Apenas conversa livre e /wolf consomem Vertex AI.

Comandos: /status /deploy /aprovar /negar /audit /sessoes /skills /conectores
          /arsenal /wolf /decisao
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import requests

from devin_bridge.audit import AuditLogger
from devin_bridge.config import GCPConfig, TelegramConfig, WolfConfig
from devin_bridge.registry import Registry
from devin_bridge.telegram_alerts import TelegramAlerts
from devin_bridge.wolf_doctrine import Acao, Decisao, LinhaDecisao, Sinal, avaliar

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 3500
BACKOFF_BASE = 1.0
BACKOFF_MAX = 60.0


class TelegramAgent:
    """Agente Telegram com long-polling e resiliência a falhas."""

    def __init__(
        self,
        telegram_config: TelegramConfig | None = None,
        gcp_config: GCPConfig | None = None,
        wolf_config: WolfConfig | None = None,
        registry: Registry | None = None,
    ) -> None:
        self._tg_config = telegram_config or TelegramConfig()
        self._gcp_config = gcp_config or GCPConfig()
        self._wolf_config = wolf_config or WolfConfig()
        self._alerts = TelegramAlerts(self._tg_config)
        self._audit = AuditLogger(self._gcp_config)
        self._registry = registry or Registry()
        self._offset: int | None = None
        self._base_url = (
            f"https://api.telegram.org/bot{self._tg_config.bot_token}"
        )
        self._fs_client = None
        self._init_firestore()
        self._load_offset()

    def _init_firestore(self) -> None:
        """Inicializa Firestore para persistência de estado."""
        try:
            from google.cloud import firestore

            self._fs_client = firestore.Client(
                project=self._gcp_config.codex_project
            )
        except Exception:
            logger.info("Firestore indisponível para persistência de offset.")

    def _load_offset(self) -> None:
        """Carrega offset do Firestore para retomar sem reprocessar."""
        if not self._fs_client:
            return
        try:
            doc = self._fs_client.document("telegram_state/offset").get()
            if doc.exists:
                self._offset = doc.to_dict().get("value")
                logger.info("Offset carregado do Firestore: %s", self._offset)
        except Exception as exc:
            logger.warning("Falha ao carregar offset: %s", exc)

    def _save_offset(self) -> None:
        """Persiste offset no Firestore."""
        if not self._fs_client or self._offset is None:
            return
        try:
            self._fs_client.document("telegram_state/offset").set(
                {"value": self._offset}
            )
        except Exception as exc:
            logger.warning("Falha ao salvar offset: %s", exc)

    def _get_updates(self, timeout: int = 30) -> list[dict[str, Any]]:
        """Busca updates via long-polling com tratamento de 429."""
        params: dict[str, Any] = {"timeout": timeout}
        if self._offset is not None:
            params["offset"] = self._offset

        backoff = BACKOFF_BASE
        max_retries = self._tg_config.rate_limit_max_retries

        for attempt in range(max_retries + 1):
            try:
                resp = requests.get(
                    f"{self._base_url}/getUpdates",
                    params=params,
                    timeout=timeout + 10,
                )
                if resp.status_code == 429:
                    retry_after = resp.json().get("parameters", {}).get(
                        "retry_after", backoff
                    )
                    logger.warning(
                        "Rate-limit 429. Retry em %ss (tentativa %d/%d)",
                        retry_after,
                        attempt + 1,
                        max_retries,
                    )
                    time.sleep(retry_after)
                    backoff = min(backoff * 2, BACKOFF_MAX)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data.get("result", [])
            except requests.RequestException as exc:
                if attempt == max_retries:
                    logger.error("Falha ao buscar updates: %s", exc)
                    return []
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX)

        return []

    def _send_reply(self, chat_id: int, text: str) -> None:
        """Envia resposta dividindo se necessário, com retry em 429."""
        chunks = self._split_message(text)
        for chunk in chunks:
            self._send_single_message(chat_id, chunk)

    def _send_single_message(self, chat_id: int, text: str) -> None:
        """Envia uma mensagem com backoff em rate-limit."""
        url = f"{self._base_url}/sendMessage"
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        backoff = BACKOFF_BASE

        for attempt in range(self._tg_config.rate_limit_max_retries + 1):
            try:
                resp = requests.post(url, json=payload, timeout=30)
                if resp.status_code == 429:
                    retry_after = resp.json().get("parameters", {}).get(
                        "retry_after", backoff
                    )
                    time.sleep(retry_after)
                    backoff = min(backoff * 2, BACKOFF_MAX)
                    continue
                resp.raise_for_status()
                return
            except requests.RequestException as exc:
                if attempt == self._tg_config.rate_limit_max_retries:
                    logger.error("Falha ao enviar mensagem: %s", exc)
                    return
                time.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX)

    def _split_message(self, text: str) -> list[str]:
        """Divide mensagem em chunks <= MAX_MESSAGE_LENGTH."""
        if len(text) <= MAX_MESSAGE_LENGTH:
            return [text]
        chunks = []
        while text:
            if len(text) <= MAX_MESSAGE_LENGTH:
                chunks.append(text)
                break
            split_at = text.rfind("\n", 0, MAX_MESSAGE_LENGTH)
            if split_at <= 0:
                split_at = MAX_MESSAGE_LENGTH
            chunks.append(text[:split_at])
            text = text[split_at:].lstrip("\n")
        return chunks

    def _handle_command(self, chat_id: int, text: str) -> None:
        """Despacha comandos estruturados (custo zero, sem LLM)."""
        cmd = text.split()[0].lower().split("@")[0]
        handlers = {
            "/status": self._cmd_status,
            "/deploy": self._cmd_deploy,
            "/aprovar": self._cmd_aprovar,
            "/negar": self._cmd_negar,
            "/audit": self._cmd_audit,
            "/sessoes": self._cmd_sessoes,
            "/skills": self._cmd_skills,
            "/conectores": self._cmd_conectores,
            "/arsenal": self._cmd_arsenal,
            "/wolf": self._cmd_wolf,
            "/decisao": self._cmd_decisao,
        }
        handler = handlers.get(cmd)
        if handler:
            handler(chat_id, text)
        else:
            self._send_reply(
                chat_id,
                "Comando não reconhecido. Use /arsenal para ver comandos disponíveis.",
            )

    def _cmd_status(self, chat_id: int, text: str) -> None:
        self._send_reply(chat_id, "Sistema operacional. Bridge ativa.")

    def _cmd_deploy(self, chat_id: int, text: str) -> None:
        self._send_reply(
            chat_id,
            "Deploy requer aprovação do Comandante Baesso. Use /aprovar após revisar.",
        )

    def _cmd_aprovar(self, chat_id: int, text: str) -> None:
        self._send_reply(chat_id, "Aprovação registrada. Gate humano satisfeito.")
        self._audit.log_event("gate.aprovacao", {"comando": text}, actor="comandante")

    def _cmd_negar(self, chat_id: int, text: str) -> None:
        self._send_reply(chat_id, "Negação registrada. Operação cancelada.")
        self._audit.log_event("gate.negacao", {"comando": text}, actor="comandante")

    def _cmd_audit(self, chat_id: int, text: str) -> None:
        self._send_reply(
            chat_id, "Consulta de auditoria. Últimos eventos registrados no BigQuery."
        )

    def _cmd_sessoes(self, chat_id: int, text: str) -> None:
        self._send_reply(chat_id, "Listagem de sessões Devin ativas via polling.")

    def _cmd_skills(self, chat_id: int, text: str) -> None:
        skills = self._registry.list_skills()
        if not skills:
            self._send_reply(chat_id, "Nenhuma skill registrada no catálogo.")
            return
        lines = [f"• {s.name}: {s.description}" for s in skills]
        self._send_reply(chat_id, "<b>Skills:</b>\n" + "\n".join(lines))

    def _cmd_conectores(self, chat_id: int, text: str) -> None:
        connectors = self._registry.list_connectors()
        if not connectors:
            self._send_reply(chat_id, "Nenhum conector registrado.")
            return
        lines = [f"• {c.name} ({c.connector_type})" for c in connectors]
        self._send_reply(chat_id, "<b>Conectores:</b>\n" + "\n".join(lines))

    def _cmd_arsenal(self, chat_id: int, text: str) -> None:
        arsenal = (
            "<b>Arsenal de Comandos:</b>\n"
            "/status — Estado do sistema\n"
            "/deploy — Solicitar deploy\n"
            "/aprovar — Aprovar operação pendente\n"
            "/negar — Negar operação pendente\n"
            "/audit — Consultar auditoria\n"
            "/sessoes — Listar sessões Devin\n"
            "/skills — Listar skills\n"
            "/conectores — Listar conectores\n"
            "/arsenal — Este menu\n"
            "/wolf — Análise WOLF (consome Vertex)\n"
            "/decisao — Decisão WOLF estruturada"
        )
        self._send_reply(chat_id, arsenal)

    def _cmd_wolf(self, chat_id: int, text: str) -> None:
        """Análise WOLF — consome Vertex AI."""
        self._send_reply(
            chat_id,
            "🐺 Análise WOLF solicitada. Processando via Vertex AI...\n"
            "(Implementação de chamada Vertex pendente de credenciais.)",
        )
        self._audit.log_event(
            "wolf.analise",
            {"comando": text, "status": "solicitado"},
            actor="comandante",
        )

    def _cmd_decisao(self, chat_id: int, text: str) -> None:
        """Decisão WOLF estruturada com sinais fornecidos."""
        parts = text.split(maxsplit=1)
        if len(parts) < 2:
            self._send_reply(
                chat_id,
                "Uso: /decisao {json com sinais}\n"
                'Ex: /decisao [{"linha":"T","codigo":"T1","direcao":0.8,"conviccao":0.9}]',
            )
            return

        try:
            raw_sinais = json.loads(parts[1])
            sinais = [
                Sinal(
                    linha=LinhaDecisao(s["linha"]),
                    codigo=s["codigo"],
                    direcao=s["direcao"],
                    conviccao=s["conviccao"],
                    peso=s.get("peso", 1.0),
                )
                for s in raw_sinais
            ]
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            self._send_reply(chat_id, f"Erro ao parsear sinais: {exc}")
            return

        decisao = avaliar(sinais, self._wolf_config)
        resultado = (
            f"🐺 <b>Decisão WOLF</b>\n"
            f"Ação: <code>{decisao.acao.value}</code>\n"
            f"Convicção: {decisao.conviccao:.0%}\n"
            f"Override técnico: {decisao.override_tecnico}\n"
            f"Racional: {decisao.racional}\n"
            f"Sinais: {', '.join(decisao.sinais_usados)}"
        )
        self._send_reply(chat_id, resultado)

        self._audit.log_event(
            "wolf.decisao",
            {
                "acao": decisao.acao.value,
                "conviccao": str(decisao.conviccao),
                "override": str(decisao.override_tecnico),
                "sinais": ",".join(decisao.sinais_usados),
            },
            actor="comandante",
        )

    def run(self, *, max_iterations: int | None = None) -> None:
        """Loop principal com resiliência total — exceções nunca derrubam o serviço."""
        logger.info("TelegramAgent iniciado. Polling ativo.")
        iterations = 0

        while True:
            try:
                updates = self._get_updates()
                for update in updates:
                    self._process_update(update)
                    update_id = update.get("update_id", 0)
                    self._offset = update_id + 1
                    self._save_offset()
            except Exception as exc:
                logger.exception("Erro no loop principal (recuperável): %s", exc)
                time.sleep(5)

            iterations += 1
            if max_iterations and iterations >= max_iterations:
                break

    def _process_update(self, update: dict[str, Any]) -> None:
        """Processa um update individual."""
        message = update.get("message", {})
        text = message.get("text", "")
        chat_id = message.get("chat", {}).get("id")

        if not text or not chat_id:
            return

        if text.startswith("/"):
            self._handle_command(chat_id, text)
        else:
            # Conversa livre — consumiria Vertex AI
            self._send_reply(
                chat_id,
                "Conversa livre requer Vertex AI. "
                "Use comandos estruturados (/arsenal) para custo zero.",
            )
