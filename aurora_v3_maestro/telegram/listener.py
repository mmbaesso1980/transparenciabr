#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAESTRO Telegram Listener v1.0
==============================

Webhook do bot t.me/Asmodeuswebforgebot rodando como serviço no Google Cloud Run.

Responsabilidades:
  - Receber updates via Webhook no endpoint /webhook
  - F1 — whitelist chat_id 6483072695 (drop silencioso de qualquer outro)
  - Parsing de comandos `/maestro <subcmd>` e texto livre
  - Comandos locais resolvidos sem chamar o worker:
      /maestro status   -> lê estado do Firestore
      /maestro stop     -> ativa kill-switch
      /maestro resume   -> desativa kill-switch
      /maestro audit N  -> últimas N entradas de maestro_audit_log
      /maestro rollback <id> -> dispara restore do snapshot
  - Demais comandos -> publica em Pub/Sub maestro-commands (projeto-codex-br)

Boas práticas operacionais (corpus 05_padroes_aprendidos):
  - NUNCA usar `pkill -f listener.py` dentro de gcloud --command (mata SSH)
  - Sempre PID file em /var/run/maestro-listener.pid
  - Stdout/stderr -> journalctl
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import os
import sys
import time
import traceback
import uuid
from typing import Any

import requests
from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from google.cloud import firestore, pubsub_v1, secretmanager

# ---------------------------------------------------------------------------
PROJECT_MAIN = os.getenv("MAESTRO_PROJECT_MAIN", "transparenciabr")
PROJECT_VERTEX = os.getenv("MAESTRO_PROJECT_VERTEX", "projeto-codex-br")
PUBSUB_TOPIC = os.getenv("MAESTRO_TOPIC", "maestro-commands")
WHITELIST = {6483072695}
SECRET_BOT_TOKEN = "maestro-telegram-bot-token"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger("maestro-listener")


def jlog(event: str, **kw: Any) -> None:
    log.info(json.dumps({"event": event, "ts": dt.datetime.utcnow().isoformat() + "Z", **kw}, default=str, ensure_ascii=False))


# ---------------------------------------------------------------------------
class TelegramListener:
    def __init__(self) -> None:
        self.fs = firestore.Client(project=PROJECT_MAIN)
        self.publisher = pubsub_v1.PublisherClient()
        self.topic_path = self.publisher.topic_path(PROJECT_VERTEX, PUBSUB_TOPIC)
        self.bot_token = self._load_secret(SECRET_BOT_TOKEN)
        jlog("listener.boot", topic=self.topic_path)

    def _load_secret(self, key: str) -> str:
        sm = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_MAIN}/secrets/{key}/versions/latest"
        resp = sm.access_secret_version(request={"name": name})
        return resp.payload.data.decode("utf-8").strip()

    # -----------------------------------------------------------------------
    # Telegram I/O
    # -----------------------------------------------------------------------
    def send(self, chat_id: int, text: str, parse_mode: str = "Markdown") -> None:
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            r = requests.post(url, json={
                "chat_id": chat_id,
                "text": text[:4000],
                "parse_mode": parse_mode,
                "disable_web_page_preview": True,
            }, timeout=15)
            if not r.ok:
                jlog("send.err", status=r.status_code, body=r.text[:300])
        except Exception as e:
            jlog("send.exc", err=str(e))

    # -----------------------------------------------------------------------
    # Comandos locais (resolvidos sem worker)
    # -----------------------------------------------------------------------
    def cmd_status(self, chat_id: int) -> None:
        ks = self.fs.collection("maestro_control").document("kill_switch").get()
        kill = ks.exists and ks.to_dict().get("active", False)
        last = list(self.fs.collection("maestro_audit_log").order_by(
            "ts", direction=firestore.Query.DESCENDING).limit(1).stream())
        last_event = last[0].to_dict() if last else {}
        msg = (
            f"*MAESTRO v1.0 — status*\n"
            f"Kill-switch: {'🛑 ATIVO' if kill else '✅ off'}\n"
            f"Último evento: `{last_event.get('event','—')}` em "
            f"`{last_event.get('ts','—')}`"
        )
        self.send(chat_id, msg)

    def cmd_stop(self, chat_id: int) -> None:
        self.fs.collection("maestro_control").document("kill_switch").set({
            "active": True, "by": chat_id, "ts": dt.datetime.utcnow()
        })
        self.send(chat_id, "🛑 *Kill-switch ATIVADO.* Worker abortará no próximo turno.")

    def cmd_resume(self, chat_id: int) -> None:
        self.fs.collection("maestro_control").document("kill_switch").set({
            "active": False, "by": chat_id, "ts": dt.datetime.utcnow()
        })
        self.send(chat_id, "✅ *Kill-switch desativado.* Pode enviar comandos.")

    def cmd_audit(self, chat_id: int, n: int) -> None:
        n = max(1, min(n, 20))
        docs = list(self.fs.collection("maestro_audit_log").order_by(
            "ts", direction=firestore.Query.DESCENDING).limit(n).stream())
        lines = [f"*Últimos {len(docs)} eventos:*"]
        for d in docs:
            x = d.to_dict()
            lines.append(f"`{x.get('ts','?')}` — `{x.get('event','?')}`")
        self.send(chat_id, "\n".join(lines))

    def cmd_rollback(self, chat_id: int, snap_id: str) -> None:
        snap = self.fs.collection("maestro_rollback").document(snap_id).get()
        if not snap.exists:
            self.send(chat_id, f"❌ Snapshot `{snap_id}` não encontrado.")
            return
        # Rollback real é publicado pro worker (pode demorar)
        self._publish(chat_id, f"rollback {snap_id}")
        self.send(chat_id, f"⏳ Restauração de `{snap_id}` enfileirada para o worker.")

    # -----------------------------------------------------------------------
    # Roteamento principal
    # -----------------------------------------------------------------------
    def handle_message(self, msg: dict) -> None:
        chat_id = int(msg.get("chat", {}).get("id", 0))
        text = (msg.get("text") or "").strip()
        if chat_id not in WHITELIST:
            jlog("freio.1.drop", chat_id=chat_id, text_sample=text[:80])
            return
        if not text:
            return

        jlog("msg.in", chat_id=chat_id, text=text[:200])

        # Comandos locais
        low = text.lower()
        if low == "/maestro status":
            return self.cmd_status(chat_id)
        if low == "/maestro stop":
            return self.cmd_stop(chat_id)
        if low == "/maestro resume":
            return self.cmd_resume(chat_id)
        if low.startswith("/maestro audit"):
            parts = text.split()
            n = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 5
            return self.cmd_audit(chat_id, n)
        if low.startswith("/maestro rollback "):
            return self.cmd_rollback(chat_id, text[len("/maestro rollback "):].strip())
        if low.startswith("/maestro help") or low == "/maestro":
            return self.send(chat_id, (
                "*Comandos MAESTRO:*\n"
                "`/maestro status`\n"
                "`/maestro dossie <nome>`\n"
                "`/maestro stop` | `/maestro resume`\n"
                "`/maestro audit <N>`\n"
                "`/maestro rollback <snap_id>`\n"
                "`/maestro <texto livre>` — delega ao worker\n"
            ))

        # Texto livre ou /maestro <texto livre> -> Pub/Sub
        payload_text = text[len("/maestro "):] if low.startswith("/maestro ") else text
        self._publish(chat_id, payload_text)
        self.send(chat_id, "📨 Comando enviado ao worker. Acompanho por aqui.")

    def _publish(self, chat_id: int, text: str) -> None:
        payload = {
            "command_id": f"cmd-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
            "chat_id": chat_id,
            "text": text,
            "ts": dt.datetime.utcnow().isoformat() + "Z",
        }
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            future = self.publisher.publish(self.topic_path, data)
            mid = future.result(timeout=10)
            jlog("pubsub.published", mid=mid, command_id=payload["command_id"])
        except Exception as e:
            jlog("pubsub.err", err=str(e), tb=traceback.format_exc()[:300])
            self.send(chat_id, f"❌ Falha ao enfileirar: `{str(e)[:200]}`")

    # -----------------------------------------------------------------------

listener_instance = TelegramListener()
app = FastAPI()

@app.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        update = await request.json()
        msg = update.get("message")
        if msg:
            background_tasks.add_task(listener_instance.handle_message, msg)
    except Exception as e:
        jlog("webhook.err", err=str(e), tb=traceback.format_exc()[:500])

    # Retorna 200 imediatamente para o Telegram evitar timeouts
    return JSONResponse(content={"status": "ok"})
