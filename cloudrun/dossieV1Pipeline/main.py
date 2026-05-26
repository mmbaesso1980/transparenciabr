"""
Cloud Run Job — dossieV1Pipeline

Consome mensagens do tópico Pub/Sub `dossie-v1-pipeline` (push subscription
via HTTP) e executa `dossie_pipeline.py` em modo headless. Faz upload do PDF
para `gs://datalake-tbr-clean/dossies_v1/<slug>.pdf` e atualiza o documento
Firestore correspondente com a URL pública e status final.

Mensagem esperada (Pub/Sub data, JSON base64-encoded):
    {
      "alvo": "Kim Kataguiri",
      "slug": "kim-kataguiri"
    }

Variáveis de ambiente esperadas:
    GEMINI_API_KEY        — chave Gemini (Secret Manager)
    GCS_BUCKET            — bucket de destino (default: datalake-tbr-clean)
    GCS_PREFIX            — prefixo do PDF (default: dossies_v1)
    FIRESTORE_COLLECTION  — coleção Firestore (default: dossies_v1)
    FIRESTORE_PROJECT     — projeto GCP do Firestore (default: transparenciabr)
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify

try:
    from google.cloud import firestore, storage  # type: ignore
except ImportError:
    firestore = None  # type: ignore
    storage = None  # type: ignore

try:
    import pipeline_metrics as _metrics  # type: ignore
except ImportError:
    _metrics = None  # type: ignore

app = Flask(__name__)

# Diretório onde o pipeline está montado dentro do container.
PIPELINE_DIR = Path(os.environ.get("PIPELINE_DIR", "/app/manus_office/dossie_v1"))
PIPELINE_SCRIPT = PIPELINE_DIR / "dossie_pipeline.py"

GCS_BUCKET = os.environ.get("GCS_BUCKET", "datalake-tbr-clean")
GCS_PREFIX = os.environ.get("GCS_PREFIX", "dossies_v1")
FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "dossies_v1")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "transparenciabr")

SLUG_TO_ALVO = {
    "erika-hilton": "Erika Hilton",
    "kim-kataguiri": "Kim Kataguiri",
}


def _slug_para_alvo(slug: str) -> str:
    """Deriva nome público a partir do slug kebab-case (fallback quando Pub/Sub não envia `alvo`)."""
    s = slug.strip().lower()
    if s in SLUG_TO_ALVO:
        return SLUG_TO_ALVO[s]
    return " ".join(p.capitalize() for p in s.split("-") if p)


def _decode_pubsub(envelope: dict) -> dict:
    """Decodifica payload Pub/Sub push (envelope JSON com `message.data` base64)."""
    msg = envelope.get("message") or {}
    data_b64 = msg.get("data")
    if not data_b64:
        return {}
    try:
        return json.loads(base64.b64decode(data_b64).decode("utf-8"))
    except Exception:
        return {}


def _upload_pdf(local_path: Path, slug: str) -> str:
    if storage is None:
        raise RuntimeError("google-cloud-storage não disponível no container.")
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(f"{GCS_PREFIX}/{slug}.pdf")
    blob.content_type = "application/pdf"
    blob.upload_from_filename(str(local_path))
    return f"gs://{GCS_BUCKET}/{GCS_PREFIX}/{slug}.pdf"


def _firestore_status(slug: str, payload: dict) -> None:
    if firestore is None:
        return
    try:
        client = firestore.Client(project=FIRESTORE_PROJECT)
        ref = client.collection(FIRESTORE_COLLECTION).document(slug)
        ref.set({**payload, "updated_at": firestore.SERVER_TIMESTAMP}, merge=True)
    except Exception as exc:
        sys.stderr.write(f"[warn] Firestore update falhou ({slug}): {exc}\n")


def _get_admin_token() -> str:
    """Token admin: env AURORA_ADMIN_TOKEN ou Secret Manager `aurora-admin-token`."""
    raw = os.environ.get("AURORA_ADMIN_TOKEN", "").strip()
    if raw:
        return raw
    try:
        from google.cloud import secretmanager  # type: ignore

        pid = os.environ.get("SECRET_PROJECT_ID", os.environ.get("GOOGLE_CLOUD_PROJECT", ""))
        if not pid:
            return ""
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{pid}/secrets/aurora-admin-token/versions/latest"
        return client.access_secret_version(request={"name": name}).payload.data.decode("utf-8").strip()
    except Exception:
        return ""


def _run_pipeline(alvo: str, slug: str, output_dir: Path) -> tuple[bool, str, str]:
    """Executa dossie_pipeline.py como subprocess e devolve (ok, findings_path, pdf_path)."""
    cmd = [
        sys.executable,
        str(PIPELINE_SCRIPT),
        "--alvo",
        alvo,
        "--slug",
        slug,
        "--output-dir",
        str(output_dir),
        "--firestore-doc",
        f"{FIRESTORE_COLLECTION}/{slug}",
    ]
    sys.stdout.write(f"[job] executando: {' '.join(cmd)}\n")
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=3300)
    sys.stdout.write(res.stdout)
    sys.stderr.write(res.stderr)
    if res.returncode != 0:
        return False, "", ""

    findings_path = output_dir / "findings.json"
    pdf_candidates = list(output_dir.glob("Dossie_*_v1-0.pdf"))
    pdf_path = pdf_candidates[0] if pdf_candidates else None
    if not findings_path.exists() or pdf_path is None:
        return False, str(findings_path), ""
    return True, str(findings_path), str(pdf_path)


@app.route("/", methods=["POST"])
def handle_pubsub():
    envelope = request.get_json(silent=True) or {}
    payload = _decode_pubsub(envelope)
    slug = (payload.get("slug") or "").strip()
    if not slug:
        # ACK: sem slug não há recuperação; HTTP 4xx faz Pub/Sub redelivery infinito.
        return jsonify({"error": "slug obrigatório", "payload": payload}), 200
    alvo = (payload.get("alvo") or "").strip() or _slug_para_alvo(slug)
    t0 = time.perf_counter()

    _firestore_status(
        slug,
        {"status": "running", "alvo": alvo, "started_at": datetime.utcnow().isoformat() + "Z"},
    )

    def _observe(status: str, findings_n: int | None = None) -> None:
        if _metrics:
            _metrics.observe_job(status, slug, time.perf_counter() - t0, findings_n)

    try:
        with tempfile.TemporaryDirectory(prefix=f"dossie_{slug}_") as tmp:
            output_dir = Path(tmp)
            ok, findings_path, pdf_path = _run_pipeline(alvo, slug, output_dir)
            if not ok:
                _firestore_status(slug, {"status": "error", "error": "pipeline_failed"})
                _observe("pipeline_error", None)
                return jsonify({"status": "error", "stage": "pipeline"}), 500

            gcs_uri = _upload_pdf(Path(pdf_path), slug)
            _firestore_status(
                slug,
                {
                    "status": "done",
                    "pdf_gcs_uri": gcs_uri,
                    "pdf_public_url": f"https://storage.googleapis.com/{GCS_BUCKET}/{GCS_PREFIX}/{slug}.pdf",
                    "findings_path": findings_path,
                    "completed_at": datetime.utcnow().isoformat() + "Z",
                },
            )
            findings_n: int | None = None
            try:
                doc = json.loads(Path(findings_path).read_text(encoding="utf-8"))
                findings_n = int(doc.get("kpis", {}).get("findings_total", -1))
                if findings_n < 0:
                    findings_n = len(doc.get("findings", []))
            except Exception:
                findings_n = None
            _observe("done", findings_n)
            return jsonify({"status": "done", "pdf": gcs_uri}), 200
    except Exception as exc:
        tb = traceback.format_exc()
        sys.stderr.write(tb)
        _firestore_status(slug, {"status": "error", "error": str(exc)[:500]})
        _observe("exception", None)
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/healthz", methods=["GET"])
def healthz():
    """Compat legada — mesmo contrato que /health."""
    return health()


@app.route("/health", methods=["GET"])
def health():
    """Readiness: dependências mínimas para o job de dossiê."""
    checks = {
        "pipeline_script_exists": PIPELINE_SCRIPT.exists(),
        "gemini_key_set": bool(os.environ.get("GEMINI_API_KEY")),
        "firestore_project": FIRESTORE_PROJECT,
        "gcs_bucket": GCS_BUCKET,
        "direct_data_token_set": bool(
            os.environ.get("DIRECT_DATA_TOKEN") or os.environ.get("DD_TOKEN")
        ),
    }
    required_ok = checks["pipeline_script_exists"] and checks["gemini_key_set"]
    return jsonify({"ok": required_ok, "checks": checks}), (200 if required_ok else 503)


@app.route("/metrics", methods=["GET"])
def metrics():
    if _metrics is None:
        return jsonify({"error": "prometheus_client indisponível"}), 503
    return _metrics.render_metrics(), 200, {"Content-Type": _metrics.content_type()}


@app.route("/admin/replay", methods=["POST"])
def admin_replay():
    """Republica mensagens da DLQ para o tópico principal (requer token admin)."""
    token = request.headers.get("X-Aurora-Token", "")
    expected = _get_admin_token()
    if not expected or token != expected:
        return jsonify({"error": "unauthorized"}), 401

    from google.cloud import pubsub_v1  # type: ignore

    project = os.environ.get("PUBSUB_PROJECT_ID", os.environ.get("GOOGLE_CLOUD_PROJECT", ""))
    if not project:
        return jsonify({"error": "PUBSUB_PROJECT_ID/GOOGLE_CLOUD_PROJECT ausente"}), 500

    main_topic = os.environ.get("DOSSIE_V1_TOPIC", "dossie-v1-pipeline")
    dlq_sub = os.environ.get("DOSSIE_V1_DLQ_SUB", "dossie-v1-pipeline-dlq-sub")
    subscriber = pubsub_v1.SubscriberClient()
    publisher = pubsub_v1.PublisherClient()
    sub_path = subscriber.subscription_path(project, dlq_sub)
    topic_path = publisher.topic_path(project, main_topic)

    max_msg = min(int(request.args.get("max", "100")), 500)
    response = subscriber.pull(
        request={"subscription": sub_path, "max_messages": max_msg},
        timeout=60.0,
    )
    ack_ids: list[str] = []
    replayed = 0
    for rm in response.received_messages:
        publisher.publish(topic_path, rm.message.data).result(timeout=60.0)
        ack_ids.append(rm.ack_id)
        replayed += 1
    if ack_ids:
        subscriber.acknowledge(request={"subscription": sub_path, "ack_ids": ack_ids})
    return jsonify({"replayed": replayed, "topic": main_topic, "dlq_sub": dlq_sub}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
