#!/usr/bin/env python3
"""
Ingestão dedicada — Senadores Federais (Senado).

GET JSON oficial com Accept: application/json; upsert em lote na coleção `politicos`.
Campo `cargo` = "Senador"; documento Firestore `senado_{id}`.

Score de exposição base/simulado (interno: referência ao motor forense) via `score_exposicao`.
`contexto_socioeconomico` vazio para o motor 06 preencher.
"""

from __future__ import annotations

import hashlib
import logging
import sys
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

import requests

from lib.firebase_app import init_firestore

SENADO_LISTA_ATUAL_URL = (
    "https://legis.senado.leg.br/dadosabertos/senador/lista/atual"
)

COLLECTION_POLITICOS = "politicos"
REQUEST_TIMEOUT_S = 90
BATCH_SIZE = 400

BACKOFF_SCHEDULE_SEC = (2.0, 4.0, 8.0)
MAX_HTTP_ATTEMPTS = len(BACKOFF_SCHEDULE_SEC) + 1
HTTP_RETRYABLE_STATUS = frozenset({500, 502, 503, 504})

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "TransparenciaBR-engines/1.0 (14 ingest senadores)",
            "Accept": "application/json",
        }
    )
    return s


def http_get_with_exponential_backoff(
    session: requests.Session,
    url: str,
    *,
    contexto: str,
) -> requests.Response:
    ultimo_erro: Optional[BaseException] = None

    for attempt in range(MAX_HTTP_ATTEMPTS):
        try:
            logger.info(
                "[%s] GET (%d/%d) %s",
                contexto,
                attempt + 1,
                MAX_HTTP_ATTEMPTS,
                url,
            )
            resp = session.get(url, timeout=REQUEST_TIMEOUT_S)

            if resp.status_code in HTTP_RETRYABLE_STATUS and attempt < MAX_HTTP_ATTEMPTS - 1:
                delay = BACKOFF_SCHEDULE_SEC[attempt]
                logger.warning(
                    "[%s] HTTP %s — backoff %.0fs.",
                    contexto,
                    resp.status_code,
                    delay,
                )
                time.sleep(delay)
                continue

            resp.raise_for_status()
            return resp

        except requests.HTTPError as exc:
            ultimo_erro = exc
            resp = exc.response
            code = resp.status_code if resp is not None else None
            if code in HTTP_RETRYABLE_STATUS and attempt < MAX_HTTP_ATTEMPTS - 1:
                delay = BACKOFF_SCHEDULE_SEC[attempt]
                logger.warning("[%s] HTTPError %s — backoff %.0fs.", contexto, code, delay)
                time.sleep(delay)
                continue
            raise

        except requests.RequestException as exc:
            ultimo_erro = exc
            if attempt < MAX_HTTP_ATTEMPTS - 1:
                delay = BACKOFF_SCHEDULE_SEC[attempt]
                logger.warning(
                    "[%s] Falha de transporte (%s). Backoff %.0fs.",
                    contexto,
                    exc,
                    delay,
                )
                time.sleep(delay)
                continue
            raise

    if ultimo_erro:
        raise ultimo_erro
    raise RuntimeError(f"[{contexto}] Falha HTTP sem exceção propagada.")


def _normalize_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s if s else None
    return str(value)


def _xml_text(el: Optional[ET.Element]) -> Optional[str]:
    if el is None or el.text is None:
        return None
    t = el.text.strip()
    return t if t else None


def parse_senado_parlamentares_xml(content: bytes) -> List[Dict[str, Any]]:
    clean = content.lstrip(b'\xef\xbb\xbf').strip()
    root = ET.fromstring(clean)
    out: List[Dict[str, Any]] = []
    for parl in root.findall(".//Parlamentar"):
        ident = parl.find("IdentificacaoParlamentar")
        if ident is None:
            continue
        out.append(
            {
                "CodigoParlamentar": _xml_text(ident.find("CodigoParlamentar")),
                "NomeParlamentar": _xml_text(ident.find("NomeParlamentar")),
                "SiglaPartidoParlamentar": _xml_text(ident.find("SiglaPartidoParlamentar")),
                "UfParlamentar": _xml_text(ident.find("UfParlamentar")),
                "UrlFotoParlamentar": _xml_text(ident.find("UrlFotoParlamentar")),
            }
        )
    return out


def _flatten_parlamentar_row(item: Dict[str, Any]) -> Dict[str, Any]:
    ident = item.get("IdentificacaoParlamentar")
    if isinstance(ident, dict):
        return ident
    return item


def parse_senado_json_parlamentares(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    lp = payload.get("ListaParlamentarEmExercicio")
    if not isinstance(lp, dict):
        return []
    par_wrap = lp.get("Parlamentares")
    if isinstance(par_wrap, dict):
        plist = par_wrap.get("Parlamentar")
        if plist is None:
            return []
        if isinstance(plist, list):
            return [_flatten_parlamentar_row(x) for x in plist if isinstance(x, dict)]
        if isinstance(plist, dict):
            return [_flatten_parlamentar_row(plist)]
    if isinstance(par_wrap, list):
        return [_flatten_parlamentar_row(x) for x in par_wrap if isinstance(x, dict)]
    return []


def fetch_senadores_lista_atual_json() -> List[Dict[str, Any]]:
    session = _session()
    resp = http_get_with_exponential_backoff(
        session,
        SENADO_LISTA_ATUAL_URL,
        contexto="Senado lista atual",
    )
    ctype = (resp.headers.get("Content-Type") or "").lower()
    if "json" not in ctype:
        logger.warning("Resposta não JSON (%s); tentando XML.", ctype)
        try:
            rows = parse_senado_parlamentares_xml(resp.content)
            logger.info("Senado: fallback XML (%d parlamentares).", len(rows))
            return rows
        except ET.ParseError as exc:
            logger.exception("Senado: XML inválido (%s). Primeiros 200 bytes: %r", exc, resp.content[:200])
            return []

    try:
        payload = resp.json()
    except ValueError:
        logger.exception("Senado: corpo não é JSON válido.")
        return []

    rows = parse_senado_json_parlamentares(payload)
    if rows:
        logger.info("Senado: JSON (%d parlamentares).", len(rows))
        return rows

    logger.warning("Senado: estrutura JSON não reconhecida — tentando XML.")
    try:
        rows = parse_senado_parlamentares_xml(resp.content)
        logger.info("Senado: XML (%d parlamentares).", len(rows))
        return rows
    except ET.ParseError:
        return []


def firestore_document_id(doc_payload: Dict[str, Any]) -> str:
    cid = doc_payload["id"]
    return f"senado_{cid}"


def simulated_score_exposicao(codigo_parlamentar: int) -> float:
    """Valor 12–97 estável por ID (substitui ausência de pipeline forense no ingest)."""
    digest = hashlib.sha256(str(int(codigo_parlamentar)).encode()).digest()
    span = digest[0] / 255.0 * 85.0
    jitter = digest[1] / 2550.0
    return round(12.0 + span + jitter, 1)


def map_ident_to_politico(ident: Dict[str, Optional[str]]) -> Dict[str, Any]:
    cod = ident.get("CodigoParlamentar")
    if not cod:
        raise ValueError("Senador sem CodigoParlamentar.")
    cid = int(cod)
    return {
        "id": cid,
        "nome": _normalize_str(ident.get("NomeParlamentar")),
        "siglaPartido": _normalize_str(ident.get("SiglaPartidoParlamentar")),
        "siglaUf": _normalize_str(ident.get("UfParlamentar")),
        "urlFoto": _normalize_str(ident.get("UrlFotoParlamentar")),
        "cargo": "Senador",
        "score_exposicao": simulated_score_exposicao(cid),
        "contexto_socioeconomico": {},
    }


def run_ingestion() -> Dict[str, Any]:
    stats = {
        "total_api": 0,
        "gravados": 0,
        "ignorados": 0,
        "erros": 0,
        "lotes": 0,
    }

    brutos = fetch_senadores_lista_atual_json()
    stats["total_api"] = len(brutos)

    payloads: List[Dict[str, Any]] = []
    for ident in brutos:
        try:
            payloads.append(map_ident_to_politico(ident))
        except ValueError as exc:
            logger.warning("Ignorado: %s ident=%s", exc, ident)
            stats["ignorados"] += 1

    db = init_firestore()
    col = db.collection(COLLECTION_POLITICOS)
    batch = db.batch()
    n_batch = 0

    for idx, payload in enumerate(payloads, start=1):
        fs_id = firestore_document_id(payload)
        doc_ref = col.document(fs_id)
        batch.set(doc_ref, payload, merge=True)
        n_batch += 1

        if n_batch >= BATCH_SIZE:
            batch.commit()
            stats["lotes"] += 1
            logger.info("Commit lote (%d docs até agora).", idx)
            batch = db.batch()
            n_batch = 0

        logger.info(
            "Upsert senador %d/%d — doc id=%s nome=%s",
            idx,
            len(payloads),
            fs_id,
            payload.get("nome") or "?",
        )

    if n_batch > 0:
        batch.commit()
        stats["lotes"] += 1

    stats["gravados"] = len(payloads)
    return stats


def main() -> int:
    logger.info(
        "Ingestão senadores — coleção '%s' (somente Senado).",
        COLLECTION_POLITICOS,
    )
    try:
        stats = run_ingestion()
    except Exception:
        logger.exception("Ingestão abortada por erro fatal.")
        return 1

    logger.info(
        "Concluído. API=%d | gravados=%d | ignorados=%d | lotes=%d",
        stats["total_api"],
        stats["gravados"],
        stats["ignorados"],
        stats["lotes"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
