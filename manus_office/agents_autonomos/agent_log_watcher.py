#!/usr/bin/env python3
"""
agent_log_watcher — alertas para webhook Discord (ou Slack) com linhas CRITICAL/ERROR.

Execução típica (cron 10 min na VM ou Cloud Scheduler → Cloud Run Job leve):
  GCP_PROJECT=projeto-codex-br DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \\
    python3 manus_office/agents_autonomos/agent_log_watcher.py

Filtra: severity>=ERROR ou texto contendo "[warn] Firestore" / "[agent:" / "FALHOU".
Não envia PII: trunca payload e remove padrões de CPF.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")


def _mask(s: str) -> str:
    return CPF_RE.sub("***.***.***-**", s[:8000])


def main() -> int:
    project = os.environ.get("GCP_PROJECT", os.environ.get("GOOGLE_CLOUD_PROJECT", "projeto-codex-br"))
    service = os.environ.get("DOSSIE_RUN_SERVICE", "dossie-v1-pipeline")
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print("DISCORD_WEBHOOK_URL ausente — nada a enviar.", file=sys.stderr)
        return 0

    try:
        from google.cloud import logging as glogging  # type: ignore
    except ImportError:
        print("google-cloud-logging não instalado.", file=sys.stderr)
        return 1

    client = glogging.Client(project=project)
    since = datetime.now(timezone.utc) - timedelta(minutes=int(os.environ.get("LOG_WINDOW_MIN", "10")))
    filt = (
        f'resource.type="cloud_run_revision" '
        f'resource.labels.service_name="{service}" '
        f'(severity>=ERROR OR textPayload:"[warn] Firestore" OR textPayload:"[agent:" OR textPayload:"FALHOU") '
        f'timestamp>="{since.isoformat()}"'
    )
    entries = list(client.list_entries(filter_=filt, max_results=int(os.environ.get("LOG_MAX", "40"))))
    if not entries:
        print("Nenhuma entrada relevante.")
        return 0

    lines = []
    for e in entries:
        ts = e.timestamp.isoformat() if e.timestamp else ""
        sev = e.severity or ""
        payload = e.payload if isinstance(e.payload, str) else json.dumps(e.payload, ensure_ascii=False)
        lines.append(f"`{ts}` **{sev}** — {_mask(payload)[:1500]}")

    body = {
        "content": "**AURORA — alertas Cloud Run dossie-v1-pipeline**\n" + "\n".join(lines)[:1900],
    }
    req = urllib.request.Request(
        webhook,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=20)
    print(f"Enviadas {len(lines)} linhas ao Discord.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
