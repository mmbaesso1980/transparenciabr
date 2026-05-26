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
import traceback
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify

try:
    from google.cloud import firestore, storage  # type: ignore
except ImportError:
    firestore = None  # type: ignore
    storage = None  # type: ignore

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

    _firestore_status(
        slug,
        {"status": "running", "alvo": alvo, "started_at": datetime.utcnow().isoformat() + "Z"},
    )

    try:
        with tempfile.TemporaryDirectory(prefix=f"dossie_{slug}_") as tmp:
            output_dir = Path(tmp)
            ok, findings_path, pdf_path = _run_pipeline(alvo, slug, output_dir)
            if not ok:
                _firestore_status(slug, {"status": "error", "error": "pipeline_failed"})
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
            return jsonify({"status": "done", "pdf": gcs_uri}), 200
    except Exception as exc:
        tb = traceback.format_exc()
        sys.stderr.write(tb)
        _firestore_status(slug, {"status": "error", "error": str(exc)[:500]})
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"ok": True, "pipeline_script": str(PIPELINE_SCRIPT), "exists": PIPELINE_SCRIPT.exists()})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
