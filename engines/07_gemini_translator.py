#!/usr/bin/env python3
"""
Tradutor Oráculo (Aurora) — alertas Firestore → linguagem jornalística via Gemini.

ARQUITETURA CROSS-PROJECT:
  - Vertex AI (Gemini 2.5 Pro) → projeto 'projeto-codex-br' (créditos R$ 5.952)
  - Firestore (alertas_bodes)  → projeto 'transparenciabr' (dados de produção)

Lê ``alertas_bodes`` sem ``explicacao_oraculo``, chama Gemini via Vertex AI
(billing no projeto-codex-br) e faz merge da string no documento Firestore
(projeto transparenciabr).

Uso:
  export GOOGLE_APPLICATION_CREDENTIALS="/home/manusalt13/transparenciabr/key.json"
  export VERTEX_PROJECT="projeto-codex-br"
  export VERTEX_LOCATION="us-east1"
  python3 engines/07_gemini_translator.py
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

from firebase_admin import firestore

from lib.firebase_app import init_firestore
from lib.project_config import vertex_project_id, vertex_location

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

COLLECTION_ALERTAS = "alertas_bodes"
GEMINI_MODEL = os.environ.get("GEMINI_ORACULO_MODEL", "gemini-2.5-pro")
MAX_SCAN = int(os.environ.get("ORACULO_MAX_SCAN", "200"))

SYSTEM_ORACULO = (
    "Você é o Aurora — analista forense de dados públicos brasileiros. "
    "Analise este alerta e resuma em 2 frases curtas e jornalísticas "
    "começando com 'Foi detectado que...'. Mantenha tom técnico e factual."
)


def _get_vertex_client():
    """Cria cliente Gemini via Vertex AI apontando para projeto-codex-br (créditos)."""
    try:
        from google import genai
        from google.genai import types  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "google-genai não instalado. Rode: pip install google-genai"
        ) from exc

    project = vertex_project_id()
    location = vertex_location()
    logger.info("Vertex AI client: project=%s location=%s", project, location)

    client = genai.Client(
        vertexai=True,
        project=project,   # projeto-codex-br (créditos)
        location=location, # us-east1
    )
    return client


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


def gerar_explicacao(client, alerta: Dict[str, Any]) -> str:
    from google.genai import types

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
    # Firestore → projeto transparenciabr (dados)
    db = init_firestore()

    # Vertex AI → projeto-codex-br (créditos)
    client = _get_vertex_client()

    candidatos: List[Tuple[str, Dict[str, Any]]] = list(iter_alertas_sem_oraculo(db))
    logger.info("Candidatos sem explicacao_oraculo: %d", len(candidatos))

    ok = 0
    err = 0
    for doc_id, alerta in candidatos:
        try:
            texto = gerar_explicacao(client, alerta)
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
                    "sdk": "google-genai (vertexai=True)",
                    "projeto_billing": vertex_project_id(),
                    "processado_em": datetime.now(timezone.utc).isoformat(),
                },
            },
            merge=True,
        )
        ok += 1

    return {"processados": ok, "erros": err, "candidatos": len(candidatos)}


def main() -> int:
    logger.info(
        "Tradutor Oráculo — modelo=%s via Vertex AI (billing: %s @ %s)",
        GEMINI_MODEL,
        vertex_project_id(),
        vertex_location(),
    )

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
