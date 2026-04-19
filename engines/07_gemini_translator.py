#!/usr/bin/env python3
"""
O Oráculo — Tradução forense de alertas financeiros (Gemini) → Firestore.

SDK: google-genai — ``genai.Client(api_key=...)`` / ``client.models.generate_content(...)``.

Lê documentos na coleção ``alertas_bodes`` sem ``explicacao_oraculo``,
chama ``gemini-2.5-flash`` com saída JSON e grava o resultado no documento.

Contenção: lotes de 10, backoff exponencial, circuit breaker (ver ``lib/gemini_resilience``).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from firebase_admin import firestore
from google import genai
from google.genai import types

from lib.firebase_app import init_firestore
from lib.genai_client import require_gemini_api_key
from lib.gemini_resilience import (
    CircuitBreaker,
    CircuitBreakerConfig,
    call_with_retries,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

COLLECTION_ALERTAS = "alertas_bodes"
BATCH_SIZE = int(os.environ.get("ORACULO_BATCH", "10"))
MAX_SCAN_DOCS = int(os.environ.get("ORACULO_MAX_SCAN", "500"))
GEMINI_MODEL = os.environ.get("GEMINI_ORACULO_MODEL", "gemini-2.5-flash")
MAX_RETRIES = int(os.environ.get("ORACULO_GEMINI_RETRIES", "5"))
BATCH_COOLDOWN_SEC = float(os.environ.get("ORACULO_BATCH_COOLDOWN_SEC", "1.5"))

SYSTEM_ORACULO = """\
Você é o Oráculo Forense do TransparênciaBR: auditor financeiro independente.

Tarefa: interpretar UM alerta de risco/controle (dados públicos ou regras de negócio) para cidadãos sem jargão inacessível.

Regras rígidas:
1) Linguagem direta, neutra, sem acusação penal — apenas explicar o que o alerta sinaliza.
2) No máximo 3 frases curtas no campo "frases" (cada uma autossuficiente).
3) Não invente fatos não presentes no payload; se faltar contexto, diga explicitamente que a explicação é limitada aos campos recebidos.
4) Responda **apenas** com JSON válido no schema solicitado (sem markdown, sem comentários).
"""

JSON_INSTRUCTION = """\
Schema de saída obrigatório:
{
  "frases": [ "frase 1", "frase 2", "frase 3 opcional vazia omitida" ],
  "resumo_cidadao": "parágrafo único opcional consolidando as 3 frases (máx. 600 caracteres)",
  "nivel_atencao": "baixo" | "medio" | "alto",
  "limitacoes": "breve nota se os dados recebidos forem insuficientes, senão string vazia"
}
"""


def build_user_payload(alerta: Dict[str, Any]) -> str:
    return json.dumps({"alerta": alerta}, ensure_ascii=False, indent=2)


def iter_alertas_sem_oraculo(db: firestore.Client) -> Iterator[Tuple[str, Dict[str, Any]]]:
    col = db.collection(COLLECTION_ALERTAS)
    seen = 0
    for snap in col.stream():
        if seen >= MAX_SCAN_DOCS:
            logger.warning(
                "ORACULO_MAX_SCAN (%d) atingido — interrompendo varredura.",
                MAX_SCAN_DOCS,
            )
            break
        seen += 1
        data = snap.to_dict() or {}
        if data.get("explicacao_oraculo") is not None:
            continue
        yield snap.id, data


def partition_batches(
    items: List[Tuple[str, Dict[str, Any]]], size: int
) -> Iterator[List[Tuple[str, Dict[str, Any]]]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def generate_oraculo_json(
    client: Any,
    alerta: Dict[str, Any],
    *,
    breaker: CircuitBreaker,
) -> Dict[str, Any]:
    contents = build_user_payload(alerta) + "\n\n" + JSON_INSTRUCTION

    def _invoke() -> Dict[str, Any]:
        def _call() -> Any:
            return client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_ORACULO,
                    temperature=0.25,
                    max_output_tokens=768,
                    response_mime_type="application/json",
                ),
            )

        resp = call_with_retries(
            _call,
            max_attempts=MAX_RETRIES,
            operation="gemini-oraculo",
        )
        text = (resp.text or "").strip()
        return json.loads(text)

    return breaker.call(_invoke, operation="oraculo-doc")


def run_oraculo() -> Dict[str, int]:
    client = genai.Client(api_key=require_gemini_api_key())
    db = init_firestore()

    pending = list(iter_alertas_sem_oraculo(db))
    logger.info(
        "Oráculo — candidatos sem explicacao_oraculo: %d (scan cap=%d).",
        len(pending),
        MAX_SCAN_DOCS,
    )

    breaker = CircuitBreaker(
        CircuitBreakerConfig(
            failure_threshold=int(os.environ.get("ORACULO_CB_FAILURES", "5")),
            recovery_seconds=float(os.environ.get("ORACULO_CB_COOLDOWN", "60")),
        )
    )

    processed = 0
    skipped = 0

    batches = list(partition_batches(pending, BATCH_SIZE))
    for batch_idx, batch in enumerate(batches):
        logger.info(
            "Lote %d/%d — %d alertas.",
            batch_idx + 1,
            len(batches),
            len(batch),
        )
        for doc_id, alerta in batch:
            try:
                out = generate_oraculo_json(client, alerta, breaker=breaker)
            except Exception as exc:
                logger.exception("Falha no alerta %s — %s", doc_id, exc)
                skipped += 1
                continue

            ref = db.collection(COLLECTION_ALERTAS).document(doc_id)
            ref.set(
                {
                    "explicacao_oraculo": out,
                    "oraculo_meta": {
                        "modelo": GEMINI_MODEL,
                        "processado_em": datetime.now(timezone.utc).isoformat(),
                    },
                },
                merge=True,
            )
            processed += 1

        if batch_idx < len(batches) - 1:
            time.sleep(BATCH_COOLDOWN_SEC)

    return {"processados": processed, "ignorados_erro": skipped, "candidatos": len(pending)}


def main() -> int:
    logger.info(
        "O Oráculo — modelo=%s lote=%d retries=%d (SDK google-genai)",
        GEMINI_MODEL,
        BATCH_SIZE,
        MAX_RETRIES,
    )
    try:
        stats = run_oraculo()
    except Exception:
        logger.exception("Execução do Oráculo abortada.")
        return 1

    logger.info(
        "Concluído. candidatos=%d processados=%d erros=%d",
        stats["candidatos"],
        stats["processados"],
        stats["ignorados_erro"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
