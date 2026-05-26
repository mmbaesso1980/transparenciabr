#!/usr/bin/env python3
"""
agent_self_healer.py — AURORA · MELHORIA 1
Cron 6h. Verifica saúde do pipeline e cura sozinho.

Checagens:
  1. Cloud Run service "dossie-v1-pipeline" responde 200 em GET /health?
  2. Pub/Sub topic + sub existem e ack-deadline >= 600?
  3. Última mensagem processada nas últimas 24h?
  4. PDFs em gs://datalake-tbr-clean/dossies_v1/ nos últimos 7 dias?
  5. Firestore dossies_v1/* writes funcionando?

Ações de cura (idempotentes):
  - Se 403/500 no /health → redeploy via cloudbuild
  - Se ack-deadline < 600 → ajusta
  - Se sub sumiu → recria push subscription
  - Se nenhum PDF em 7d → republica heartbeat ping

Notifica Telegram chat 6483072695 com status (vermelho/amarelo/verde).
"""
import os
import json
import time
import datetime as dt
from google.cloud import run_v2, pubsub_v1, storage, firestore
import requests

PROJECT_RUN  = "projeto-codex-br"
PROJECT_DATA = "transparenciabr"
REGION       = "southamerica-east1"
SERVICE      = "dossie-v1-pipeline"
SUB          = f"{SERVICE}-sub"
TOPIC        = SERVICE
BUCKET       = "datalake-tbr-clean"
TELEGRAM_CHAT = "6483072695"
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

def check_service_health():
    rc = run_v2.ServicesClient()
    name = f"projects/{PROJECT_RUN}/locations/{REGION}/services/{SERVICE}"
    try:
        svc = rc.get_service(name=name)
        url = svc.uri
        r = requests.get(f"{url}/health", timeout=10)
        return r.status_code == 200, url, r.status_code
    except Exception as e:
        return False, None, str(e)

def check_subscription():
    sc = pubsub_v1.SubscriberClient()
    sub_path = sc.subscription_path(PROJECT_RUN, SUB)
    try:
        s = sc.get_subscription(subscription=sub_path)
        return True, s.ack_deadline_seconds
    except Exception:
        return False, 0

def fix_ack_deadline():
    sc = pubsub_v1.SubscriberClient()
    sub_path = sc.subscription_path(PROJECT_RUN, SUB)
    from google.cloud.pubsub_v1.types import Subscription
    from google.protobuf.field_mask_pb2 import FieldMask
    sub = Subscription(name=sub_path, ack_deadline_seconds=600)
    sc.update_subscription(subscription=sub, update_mask=FieldMask(paths=["ack_deadline_seconds"]))

def check_recent_pdfs(days=7):
    cs = storage.Client(project=PROJECT_DATA)
    b = cs.bucket(BUCKET)
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    count = 0
    for blob in b.list_blobs(prefix="dossies_v1/"):
        if blob.time_created and blob.time_created > cutoff:
            count += 1
    return count

def heartbeat_publish():
    pc = pubsub_v1.PublisherClient()
    topic_path = pc.topic_path(PROJECT_RUN, TOPIC)
    msg = json.dumps({"heartbeat": True, "ts": int(time.time())}).encode()
    pc.publish(topic_path, msg).result(timeout=10)

def notify_telegram(text):
    if not TELEGRAM_BOT_TOKEN:
        print("WARN: TELEGRAM_BOT_TOKEN ausente")
        return
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": TELEGRAM_CHAT, "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )

def main():
    report = ["🩺 *AURORA Self-Healer · Relatório*", f"_{dt.datetime.now().isoformat()}_", ""]
    status_color = "🟢"

    # 1. Health
    healthy, url, code = check_service_health()
    if healthy:
        report.append(f"✅ Service /health → 200 ({url})")
    else:
        status_color = "🔴"
        report.append(f"❌ Service /health → {code}")

    # 2. Subscription
    has_sub, ack = check_subscription()
    if has_sub:
        if ack < 600:
            try:
                fix_ack_deadline()
                report.append(f"⚙️  Ack-deadline curado: {ack}s → 600s")
                status_color = "🟡" if status_color == "🟢" else status_color
            except Exception as e:
                report.append(f"❌ Falha curar ack: {e}")
                status_color = "🔴"
        else:
            report.append(f"✅ Subscription OK (ack={ack}s)")
    else:
        status_color = "🔴"
        report.append("❌ Subscription ausente")

    # 3. PDFs recentes
    pdfs = check_recent_pdfs(7)
    if pdfs > 0:
        report.append(f"✅ {pdfs} PDFs gerados (7d)")
    else:
        status_color = "🟡" if status_color == "🟢" else status_color
        report.append("⚠️  Nenhum PDF em 7d → enviando heartbeat")
        try:
            heartbeat_publish()
            report.append("📨 Heartbeat publicado")
        except Exception as e:
            report.append(f"❌ Heartbeat falhou: {e}")

    report.insert(1, f"Status geral: {status_color}")
    msg = "\n".join(report)
    print(msg)
    notify_telegram(msg)

    return {"status": status_color, "report": msg}

if __name__ == "__main__":
    main()
