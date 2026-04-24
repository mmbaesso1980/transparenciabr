#!/usr/bin/env python3
"""
Protocolo F.L.A.V.I.O. — Caçador de Fantasmas via Portal da Transparência.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from firebase_admin import firestore

from lib.firebase_app import init_firestore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

COLLECTION_POLITICOS = "politicos"
COLLECTION_GHOST_SERVIDORES = "ghost_servidores"


def _doc_id_from_dict(d: Dict[str, Any]) -> str:
    raw = json.dumps(d, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def fetch_servidores_api(orgao_id: str, api_token: str) -> List[Dict[str, Any]]:
    """Busca servidores via API Portal da Transparência com paginação e retries."""
    headers = {
        "chave-api-dados": api_token,
        "Accept": "application/json"
    }
    url = "https://api.portaldatransparencia.gov.br/api-de-dados/servidores"
    resultados = []
    pagina = 1

    while True:
        params = {"orgaoServidorExercicio": orgao_id, "pagina": pagina}
        sucesso = False

        for tentativa in range(3):
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    return resultados
                resultados.extend(data)
                pagina += 1
                sucesso = True
                time.sleep(0.5)
                break
            except Exception as e:
                logger.warning(
                    "Falha na API Transparência (orgao=%s, pagina=%d, tentativa %d): %s",
                    orgao_id, pagina, tentativa + 1, e,
                )
                time.sleep(2)

        if not sucesso:
            logger.error(
                "Falha ao buscar servidores para o órgão %s. Retornando resultados parciais.",
                orgao_id,
            )
            break

    return resultados


def main() -> int:
    parser = argparse.ArgumentParser(
        description="F.L.A.V.I.O. — Caçador de Fantasmas via Portal da Transparência."
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_token = os.environ.get("CGU_API_TOKEN")
    if not api_token:
        logger.error("CGU_API_TOKEN não configurado no ambiente.")
        return 0

    try:
        db = None if args.dry_run else init_firestore()
    except Exception as exc:
        logger.exception("Firestore: %s", exc)
        return 1

    escritos = 0

    if db is not None:
        try:
            politicos_docs = list(db.collection(COLLECTION_POLITICOS).stream())
        except Exception as e:
            logger.exception("Erro ao buscar politicos: %s", e)
            return 1
    else:
        logger.info("[dry-run] Mockando iteração de politicos (db is None).")
        politicos_docs = []

    for doc in politicos_docs:
        politico_id = doc.id
        p_data = doc.to_dict() or {}
        # Órgão padrão: Câmara dos Deputados = 20101
        orgao_id = p_data.get("orgao_id", "20101")

        logger.info("Processando politico %s (orgao_id: %s)...", politico_id, orgao_id)

        servidores = fetch_servidores_api(orgao_id, api_token)

        for serv in servidores:
            doc_body: Dict[str, Any] = {
                "politico_id": politico_id,
                "dados_servidor": serv,
                "fonte": "api_portal_transparencia",
                "atualizado_em": datetime.now(timezone.utc),
                "sincronizado_em": firestore.SERVER_TIMESTAMP,
            }
            doc_id = _doc_id_from_dict({"p": politico_id, "s": serv})

            if args.dry_run:
                logger.info("[dry-run] doc_id=%s", doc_id)
                escritos += 1
                continue

            db.collection(COLLECTION_GHOST_SERVIDORES).document(doc_id).set(
                doc_body, merge=True
            )
            escritos += 1

    logger.info("F.L.A.V.I.O. concluído — %d servidores gravados.", escritos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
