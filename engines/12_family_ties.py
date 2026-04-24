#!/usr/bin/env python3
"""
Operação Sangue e Poder — cruzamento genealógico × QSA via CNPJ.ws.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
COLLECTION_FAMILY_TIES = "family_ties"
COLLECTION_CONTRATOS = "contratos"
COLLECTION_PNCP = "pncp_contratos"

SIMILARITY_MIN = 0.85


def _norm(s: str) -> str:
    return " ".join(str(s).lower().split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def melhor_par_familiar(
    familiares: List[Dict[str, Any]],
    socios: List[str],
) -> Optional[Tuple[Dict[str, Any], str, float]]:
    """Retorna (familiar, socio, score) do melhor match ou None."""
    best = None
    best_score = 0.0
    for fam in familiares:
        nome_fam = str(fam.get("nome_completo") or fam.get("nome") or "")
        for soc in socios:
            s = similarity(nome_fam, soc)
            if s > best_score:
                best_score = s
                best = (fam, soc, s)
    return best if best_score >= SIMILARITY_MIN else None


def _doc_id(politico_id: str, cnpj: str, socio: str) -> str:
    raw = f"{politico_id}|{cnpj}|{socio}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def fetch_qsa(cnpj: str) -> Dict[str, Any]:
    """Busca QSA via API publica.cnpj.ws com retries."""
    url = f"https://publica.cnpj.ws/cnpj/{cnpj}"
    for tentativa in range(3):
        try:
            time.sleep(1)  # rate limit: 1s (API pública sem autenticação)
            resp = requests.get(url, timeout=15)
            if resp.status_code == 429:
                time.sleep(2)
                continue
            if resp.status_code == 404:
                return {}
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(
                "Falha na API CNPJ.ws (cnpj=%s, tentativa %d): %s", cnpj, tentativa + 1, e
            )
            time.sleep(2)
    return {}


def extract_cnpjs_from_politico(db, pid: str) -> set:
    """Busca CNPJs de contratos associados ao politico."""
    cnpjs: set = set()
    for col in (COLLECTION_CONTRATOS, COLLECTION_PNCP):
        try:
            docs = db.collection(col).where("politico_id", "==", pid).stream()
            for doc in docs:
                data = doc.to_dict()
                cnpj = data.get("cnpj_contratado") or data.get("cnpj")
                if cnpj:
                    cnpj_clean = "".join(filter(str.isdigit, str(cnpj)))
                    if cnpj_clean:
                        cnpjs.add(cnpj_clean)
        except Exception:
            pass
    return cnpjs


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sangue e Poder — cruzamento genealógico × QSA via CNPJ.ws."
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

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

    for pdoc in politicos_docs:
        pid = pdoc.id
        p_data = pdoc.to_dict() or {}
        nome_politico = str(p_data.get("nome", "")).strip()
        if not nome_politico:
            continue

        sobrenome = nome_politico.split()[-1].lower() if nome_politico else ""
        cnpjs = extract_cnpjs_from_politico(db, pid)
        logger.info(
            "Politico %s (%s): %d CNPJs encontrados", pid, nome_politico, len(cnpjs)
        )

        for cnpj in cnpjs:
            qsa_data = fetch_qsa(cnpj)
            if not qsa_data:
                continue

            razao_social = qsa_data.get("razao_social", "")
            socios = qsa_data.get("socios", [])

            for socio in socios:
                nome_socio = socio.get("nome", "")
                if not nome_socio:
                    continue

                sim = similarity(nome_politico, nome_socio)
                sobrenome_socio = nome_socio.split()[-1].lower() if nome_socio else ""
                is_match = (sim >= SIMILARITY_MIN) or (
                    sobrenome and sobrenome == sobrenome_socio
                )

                if not is_match:
                    continue

                doc_body: Dict[str, Any] = {
                    "politico_id": pid,
                    "cnpj": cnpj,
                    "nome_socio": nome_socio,
                    "razao_social": razao_social,
                    "score_similaridade": round(sim, 4),
                    "data_coleta": datetime.now(timezone.utc),
                    "sincronizado_em": firestore.SERVER_TIMESTAMP,
                }
                doc_id = _doc_id(pid, cnpj, nome_socio)

                if args.dry_run:
                    logger.info(
                        "[dry-run] MATCH: %s <-> %s (sim: %.3f)",
                        nome_politico, nome_socio, sim,
                    )
                    escritos += 1
                    continue

                db.collection(COLLECTION_FAMILY_TIES).document(doc_id).set(
                    doc_body, merge=True
                )
                escritos += 1
                logger.info(
                    "Match familiar gravado: %s <-> %s", nome_politico, nome_socio
                )

    logger.info(
        "Operação Sangue e Poder concluída — %d family_ties gravados.", escritos
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
