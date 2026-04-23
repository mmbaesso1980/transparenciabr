#!/usr/bin/env python3
"""
Tradutor Oráculo (A.S.M.O.D.E.U.S.) — alertas BigQuery → linguagem jornalística via Gemini.

Lê ``alertas_bodes`` sem ``explicacao_oraculo``, chama ``gemini-1.5-flash`` (SDK
``google-generativeai``) e faz merge da string no documento.

Requer GEMINI_API_KEY ou GOOGLE_API_KEY no ambiente (.env carregado pelo shell).
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from google import genai
from google.genai import types
from firebase_admin import firestore

from lib.firebase_app import init_firestore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

COLLECTION_ALERTAS = "alertas_bodes"
GEMINI_MODEL = os.environ.get("GEMINI_ORACULO_MODEL", "gemini-1.5-flash")
MAX_SCAN = int(os.environ.get("ORACULO_MAX_SCAN", "200"))

SYSTEM_ORACULO = (
    "Você é o A.S.M.O.D.E.U.S. Analise este alerta de corrupção e resuma em 2 frases "
    "curtas e jornalísticas começando com 'Foi detectado que...'."
)


def _gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def iter_alertas_sem_oraculo(db: firestore.Client) -> Iterator[Tuple[str, Dict[str, Any]]]:
    seen = 0
    for snap in db.collection(COLLECTION_ALERTAS).stream():
        if seen >= MAX_SCAN:
            logger.warning("ORACULO_MAX_SCAN (%d) atingido.", MAX_SCAN)
            break
        seen += 1
        data = snap.to_dict() or {}
        exo = data.get("explicacao_oraculo")
        if exo is not None and str(exo).strip() != "":
            continue
        yield snap.id, data


def build_prompt(alerta: Dict[str, Any]) -> str:
    tipo = alerta.get("tipo_risco") or alerta.get("tipo") or ""
    msg = alerta.get("mensagem") or alerta.get("trecho") or ""
    sev = alerta.get("severidade") or alerta.get("criticidade") or ""
    fonte = alerta.get("fonte") or ""
    return (
        "Dados do alerta para análise:\n"
        f"- tipo_risco: {tipo}\n"
        f"- severidade: {sev}\n"
        f"- fonte: {fonte}\n"
        f"- descricao: {msg}\n"
    )


def gerar_explicacao(api_key: str, alerta: Dict[str, Any]) -> str:
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=build_prompt(alerta),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_ORACULO,
            temperature=0.35,
            max_output_tokens=512,
        ),
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Resposta vazia do Gemini.")
    return text


def run_tradutor() -> Dict[str, int]:
    api_key = _gemini_api_key()
    if not api_key:
        raise RuntimeError(
            "API Key não configurada: defina GEMINI_API_KEY ou GOOGLE_API_KEY no ambiente (.env)."
        )

    db = init_firestore()
    candidatos: List[Tuple[str, Dict[str, Any]]] = list(iter_alertas_sem_oraculo(db))
    logger.info("Candidatos sem explicacao_oraculo: %d", len(candidatos))

    ok = 0
    err = 0
    for doc_id, alerta in candidatos:
        try:
            texto = gerar_explicacao(api_key, alerta)
        except Exception as exc:
            logger.exception("Falha Gemini no doc %s: %s", doc_id, exc)
            err += 1
            continue

        ref = db.collection(COLLECTION_ALERTAS).document(doc_id)
        ref.set(
            {
                "explicacao_oraculo": texto,
                "oraculo_meta": {
                    "modelo": GEMINI_MODEL,
                    "sdk": "google-generativeai",
                    "processado_em": datetime.now(timezone.utc).isoformat(),
                },
            },
            merge=True,
        )
        ok += 1

    return {"processados": ok, "erros": err, "candidatos": len(candidatos)}


def main() -> int:
    logger.info("Tradutor Oráculo — modelo=%s (google-generativeai)", GEMINI_MODEL)

    api_key = _gemini_api_key()
    if not api_key:
        logger.error(
            "GEMINI_API_KEY / GOOGLE_API_KEY ausente — defina no .env ou ambiente. "
            "Nenhum documento será processado."
        )
        return 0

    try:
        stats = run_tradutor()
    except Exception:
        logger.exception("Execução abortada.")
        return 1

    logger.info(
        "Concluído. candidatos=%d processados=%d erros=%d",
        stats["candidatos"],
        stats["processados"],
        stats["erros"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
