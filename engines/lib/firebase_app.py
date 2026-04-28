"""
Inicialização Firebase Admin / Firestore — uso em scripts da Fase 2 (nuvem ou emulador).

Variável canônica de projeto: GCP_PROJECT_ID  (via lib.project_config)
Variável de credenciais:      GOOGLE_APPLICATION_CREDENTIALS (caminho de arquivo)
Emulador local:               FIRESTORE_EMULATOR_HOST
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

from lib.project_config import gcp_project_id

logger = logging.getLogger(__name__)


def init_firestore() -> firestore.Client:
    """Cliente Firestore único por processo."""
    if firebase_admin._apps:
        return firestore.client()

    project_id = gcp_project_id()
    emulator_host = os.environ.get("FIRESTORE_EMULATOR_HOST")
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

    if emulator_host:
        # SecOps: nunca versionar JSON de service account. Emulador aceita ADC sem PEM local.
        if cred_path and Path(cred_path).is_file():
            firebase_admin.initialize_app(
                credentials.Certificate(cred_path),
                options={"projectId": project_id},
            )
        else:
            firebase_admin.initialize_app(options={"projectId": project_id})
    elif cred_path and Path(cred_path).is_file():
        firebase_admin.initialize_app(
            credentials.Certificate(cred_path),
            options={"projectId": project_id},
        )
    else:
        firebase_admin.initialize_app(options={"projectId": project_id})

    logger.info("Firestore cliente pronto (project=%s).", project_id)
    return firestore.client()
