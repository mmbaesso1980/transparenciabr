#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAESTRO Telegram Listener v1.0
==============================

Long-poll do bot t.me/Asmodeuswebforgebot rodando 24/7 como serviço systemd
na VM aurora-cacador-br (sa-east1-a, IP 34.39.224.224).

Responsabilidades:
  - Long-poll Telegram getUpdates com offset persistido em /var/lib/maestro/offset
  - F1 — whitelist chat_id 6483072695 (drop silencioso de qualquer outro)
  - Parsing de comandos `/maestro <subcmd>` e texto livre
  - Tracking de senha do dia: `/maestro senha <SENHA>` arma a senha por 5 minutos
    para o próximo comando destrutivo (drop/delete/deploy/burn/merge/tuning)
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
from pathlib import Path
from typing import Any

import requests
from google.cloud import firestore, pubsub_v1, secretmanager

# ---------------------------------------------------------------------------
PROJECT_MAIN = os.getenv("MAESTRO_PROJECT_MAIN", "transparenciabr")
PROJECT_VERTEX = os.getenv("MAESTRO_PROJECT_VERTEX", "projeto-codex-br")
PUBSUB_TOPIC = os.getenv("MAESTRO_TOPIC", "maestro-commands")
WHITELIST = {6483072695}
SECRET_BOT_TOKEN = "maestro-telegram-bot-token"
OFFSET_FILE = Path(os.getenv("MAESTRO_OFFSET_FILE", "/var/lib/maestro/offset"))
LONG_POLL_TIMEOUT = 25
PASSWORD_WINDOW_SECONDS = 300

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger("maestro-listener")


def jlog(event: str, **kw: Any) -> None:
    log.info(json.dumps({"event": event, "ts": dt.datetime.utcnow().isoformat() + "Z", **kw}, default=str, ensure_ascii=False))


def senha_do_dia() -> str:
    today = dt.datetime.utcnow().strftime("%Y-%m-%d")
    return hashlib.sha256(f"{today}asmodeus_maestro_v1".encode()).hexdigest()[:8]


# ---------------------------------------------------------------------------
class TelegramListener:
    def __init__(self) -> None:
        self.fs = firestore.Client(project=PROJECT_MAIN)
        self.publisher = pubsub_v1.PublisherClient()
        self.topic_path = self.publisher.topic_path(PROJECT_VERTEX, PUBSUB_TOPIC)
        self.bot_token = self._load_secret(SECRET_BOT_TOKEN)
        self.offset = self._load_offset()
        self.password_armed: dict[int, tuple[str, float]] = {}  # chat_id -> (senha, expires_at_unix)
        jlog("listener.boot", topic=self.topic_path, offset=self.offset)

    def _load_secret(self, key: str) -> str:
        sm = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_MAIN}/secrets/{key}/versions/latest"
        resp = sm.access_secret_version(request={"name": name})
        return resp.payload.data.decode("utf-8").strip()

    def _load_offset(self) -> int:
        try:
            if OFFSET_FILE.exists():
                return int(OFFSET_FILE.read_text().strip())
        except Exception:
            pass
        return 0

    def _save_offset(self, off: int) -> None:
        try:
            OFFSET_FILE.parent.mkdir(parents=True, exist_ok=True)
            OFFSET_FILE.write_text(str(off))
        except Exception as e:
            jlog("offset.save_err", err=str(e))

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

    def poll(self) -> list[dict]:
        url = f"https://api.telegram.org/bot{self.bot_token}/getUpdates"
        params = {"timeout": LONG_POLL_TIMEOUT, "offset": self.offset + 1, "allowed_updates": json.dumps(["message"])}
        try:
            r = requests.get(url, params=params, timeout=LONG_POLL_TIMEOUT + 10)
            data = r.json()
            return data.get("result", []) if data.get("ok") else []
        except Exception as e:
            jlog("poll.err", err=str(e))
            time.sleep(5)
            return []

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
            f"Senha do dia (prefixo): `{senha_do_dia()[:2]}***`\n"
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

    def cmd_senha(self, chat_id: int, supplied: str) -> None:
        expected = senha_do_dia()
        if supplied.strip().lower() == expected:
            self.password_armed[chat_id] = (expected, time.time() + PASSWORD_WINDOW_SECONDS)
            self.send(chat_id, f"🔓 Senha aceita. Janela aberta por {PASSWORD_WINDOW_SECONDS // 60} min para ações destrutivas.")
        else:
            self.send(chat_id, f"❌ Senha inválida. Prefixo esperado: `{expected[:2]}***`")

    def cmd_rollback(self, chat_id: int, snap_id: str) -> None:
        snap = self.fs.collection("maestro_rollback").document(snap_id).get()
        if not snap.exists:
            self.send(chat_id, f"❌ Snapshot `{snap_id}` não encontrado.")
            return
        # Rollback real é publicado pro worker (pode demorar)
        self._publish(chat_id, f"rollback {snap_id}", supplied_password=None)
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
        if low.startswith("/maestro senha "):
            return self.cmd_senha(chat_id, text[len("/maestro senha "):])
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
                "`/maestro senha <SENHA>` (antes de drop/deploy/burn/merge)\n"
                "`/maestro <texto livre>` — delega ao worker\n"
            ))

        # Texto livre ou /maestro <texto livre> -> Pub/Sub
        payload_text = text[len("/maestro "):] if low.startswith("/maestro ") else text
        senha = self._consume_password(chat_id)
        self._publish(chat_id, payload_text, supplied_password=senha)
        self.send(chat_id, "📨 Comando enviado ao worker. Acompanho por aqui.")

    def _consume_password(self, chat_id: int) -> str | None:
        armed = self.password_armed.get(chat_id)
        if not armed:
            return None
        senha, expires = armed
        if time.time() > expires:
            self.password_armed.pop(chat_id, None)
            return None
        # one-shot
        self.password_armed.pop(chat_id, None)
        return senha

    def _publish(self, chat_id: int, text: str, supplied_password: str | None) -> None:
        payload = {
            "command_id": f"cmd-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
            "chat_id": chat_id,
            "text": text,
            "password": supplied_password,
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
    def run(self) -> None:
        jlog("listener.ready")
        while True:
            updates = self.poll()
            for u in updates:
                self.offset = max(self.offset, int(u.get("update_id", 0)))
                msg = u.get("message")
                if not msg:
                    continue
                try:
                    self.handle_message(msg)
                except Exception as e:
                    jlog("handle.err", err=str(e), tb=traceback.format_exc()[:500])
            self._save_offset(self.offset)


if __name__ == "__main__":
    TelegramListener().run()
