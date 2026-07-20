#!/usr/bin/env python3
"""
Consome a fila maestro_browser_jobs (Firestore) enfileirada pela tool
browser_task_remote do Maestro (aurora_v3_maestro/worker/maestro_v1.py) e
executa navegacao real via Playwright headless.
Escopo v1: navega, extrai texto/titulo/screenshot. NAO preenche forms/login.
"""
import base64
import datetime as dt
import os
import time
import traceback

from google.cloud import firestore
from playwright.sync_api import sync_playwright

PROJECT = os.environ.get("MAESTRO_BROWSER_FS_PROJECT", "projeto-codex-br")
POLL_INTERVAL_S = float(os.environ.get("MAESTRO_BROWSER_POLL_S", "5"))
NAV_TIMEOUT_MS = int(os.environ.get("MAESTRO_BROWSER_TIMEOUT_MS", "30000"))
MAX_TEXT_CHARS = 8000
COLLECTION = "maestro_browser_jobs"

db = firestore.Client(project=PROJECT)


def now_iso() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


def process_job(doc_ref, data: dict) -> None:
    job_id = data.get("job_id", doc_ref.id)
    url = data.get("url", "")
    task = data.get("task", "")
    print(f"[{now_iso()}] processing {job_id} url={url} task={task[:80]!r}")

    doc_ref.set({"status": "processing", "started_at": now_iso()}, merge=True)

    if not url:
        doc_ref.set({"status": "error", "error": "url vazia", "done_at": now_iso()}, merge=True)
        return

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                page = browser.new_page(viewport={"width": 1280, "height": 900})
                page.set_default_navigation_timeout(NAV_TIMEOUT_MS)
                page.goto(url, wait_until="networkidle")
                title = page.title()
                text = page.inner_text("body")
                truncated = len(text) > MAX_TEXT_CHARS
                text = text[:MAX_TEXT_CHARS]

                screenshot_b64 = None
                try:
                    screenshot_bytes = page.screenshot(type="jpeg", quality=60, full_page=False)
                    screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")
                except Exception:
                    pass

                doc_ref.set(
                    {
                        "status": "done",
                        "done_at": now_iso(),
                        "result": {
                            "title": title,
                            "text": text,
                            "text_truncated": truncated,
                            "screenshot_jpeg_b64": screenshot_b64,
                        },
                    },
                    merge=True,
                )
                print(f"[{now_iso()}] done {job_id} title={title!r}")
            finally:
                browser.close()
    except Exception as e:
        doc_ref.set(
            {"status": "error", "error": str(e)[:500], "done_at": now_iso()},
            merge=True,
        )
        print(f"[{now_iso()}] ERROR {job_id}: {e}\n{traceback.format_exc()[:500]}")


def main_loop() -> None:
    print(f"[{now_iso()}] maestro-browser worker iniciado (project={PROJECT}, poll={POLL_INTERVAL_S}s)")
    while True:
        try:
            query = db.collection(COLLECTION).where("status", "==", "queued").limit(1)
            docs = list(query.stream())
            print(f"[{now_iso()}] polling: found {len(docs)} queued jobs")
            if docs:
                doc = docs[0]
                process_job(doc.reference, doc.to_dict())
            else:
                time.sleep(POLL_INTERVAL_S)
        except Exception as e:
            print(f"[{now_iso()}] loop error: {e}\n{traceback.format_exc()[:300]}")
            time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main_loop()
