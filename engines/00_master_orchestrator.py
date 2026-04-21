#!/usr/bin/env python3
"""
Orquestrador master — sequência:
  01_ingest_politicos → 04_ingest_gastos_2026 → 02_ingest_emendas → 05_sync_bodes

Cada etapa: até 3 tentativas (retry 2x). Saída != 0 após esgotar tentativas = falha crítica.
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent

MASTER_STEPS: List[Tuple[str, str]] = [
    ("01_ingest_politicos", "01_ingest_politicos.py"),
    ("04_ingest_gastos_2026", "04_ingest_gastos_2026.py"),
    ("02_ingest_emendas", "02_ingest_emendas.py"),
    ("05_sync_bodes", "05_sync_bodes.py"),
]

MAX_ATTEMPTS = 3


def _setup_gcp_credentials_from_secret() -> None:
    raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON", "").strip()
    if not raw:
        return
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(
            "GOOGLE_APPLICATION_CREDENTIALS_JSON presente mas JSON inválido — ignorando."
        )
        return
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".json",
        delete=False,
        encoding="utf-8",
    )
    try:
        json.dump(data, tmp)
        tmp.close()
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
        logger.info(
            "Credenciais de serviço materializadas em ficheiro temporário (JSON válido)."
        )
    except OSError as exc:
        logger.warning("Não foi possível gravar credenciais temporárias: %s", exc)


def _propagate_firestore_project() -> None:
    fp = (os.environ.get("FIRESTORE_PROJECT") or "").strip()
    if fp:
        os.environ.setdefault("FIREBASE_PROJECT_ID", fp)
        os.environ.setdefault("GCP_PROJECT", fp)
        os.environ.setdefault("GCLOUD_PROJECT", fp)
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", fp)


def run_step(script_name: str, script_file: str) -> int:
    script_path = ROOT / script_file
    if not script_path.is_file():
        logger.error("Script inexistente: %s", script_path)
        return 127
    cmd = [sys.executable, str(script_path)]
    logger.info("Executando: %s", " ".join(cmd))
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=os.environ.copy(),
    )
    return int(proc.returncode)


def main() -> int:
    _setup_gcp_credentials_from_secret()
    _propagate_firestore_project()

    failed: List[str] = []
    for step_id, script_file in MASTER_STEPS:
        rc = 1
        for attempt in range(1, MAX_ATTEMPTS + 1):
            logger.info(
                "Etapa %s — tentativa %d/%d",
                step_id,
                attempt,
                MAX_ATTEMPTS,
            )
            rc = run_step(step_id, script_file)
            if rc == 0:
                break
            logger.warning(
                "Etapa %s falhou com código %d (tentativa %d).",
                step_id,
                rc,
                attempt,
            )
        if rc != 0:
            logger.error("Falha crítica na etapa %s (código %d).", step_id, rc)
            failed.append(step_id)

    if failed:
        logger.error("Orquestrador terminou com erros: %s", ", ".join(failed))
        return 1
    logger.info("Orquestrador master concluído com sucesso.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
