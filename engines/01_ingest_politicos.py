#!/usr/bin/env python3
"""
Ingestão unificada — deputados (Câmara) e senadores (Senado).

Persiste na coleção Firestore polimórfica `politicos` com upsert (merge).
"""

from __future__ import annotations

import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from lib.firebase_app import init_firestore

# Se estiver rodando contra o emulador local, aponta o SDK para mock_key.json
if os.environ.get("FIRESTORE_EMULATOR_HOST"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(
        Path(__file__).resolve().parent / "mock_key.json"
    )

# ── Configuração ─────────────────────────────────────────────────────────────────────────────

CAMARA_DEPUTADOS_URL = "https://dadosabertos.camara.leg.br/api/v2/deputados"
SENADO_LISTA_ATUAL_URL = (
    "https://legis.senado.leg.br/dadosabertos/senador/lista/atual"
)

DEFAULT_ITENS = 100
COLLECTION_POLITICOS = "politicos"
REQUEST_TIMEOUT_S = 60

BACKOFF_SCHEDULE_SEC = (2.0, 4.0, 8.0)
MAX_HTTP_ATTEMPTS = len(BACKOFF_SCHEDULE_SEC) + 1
HTTP_RETRYABLE_STATUS = frozenset({500, 502, 503, 504})

# BOM bytes que o Senado às vezes inclui no início da resposta XML
_UTF8_BOM = b"\xef\xbb\xbf"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def http_get_with_exponential_backoff(
    session: requests.Session,
    url: str,
    *,
    contexto: str,
    params: Optional[Dict[str, Any]] = None,
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
            resp = session.get(url, timeout=REQUEST_TIMEOUT_S, params=params)

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


def _camara_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "TransparenciaBR-engines/1.0 (ingest politicos)",
            "Accept": "application/json",
        }
    )
    return s


def _senado_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "TransparenciaBR-engines/1.0 (ingest politicos)",
            "Accept": "application/xml, text/xml, */*",
        }
    )
    return s


def _normalize_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s if s else None
    return str(value)


def firestore_document_id(doc_payload: Dict[str, Any]) -> str:
    cid = doc_payload["id"]
    if doc_payload.get("cargo") == "Senador":
        return f"senado_{cid}"
    return str(cid)


def map_deputado_to_politico(raw: Dict[str, Any]) -> Dict[str, Any]:
    doc_id = raw.get("id")
    if doc_id is None:
        raise ValueError("Registro sem campo 'id' da Câmara.")
    return {
        "id": int(doc_id),
        "nome": _normalize_str(raw.get("nome")),
        "siglaPartido": _normalize_str(raw.get("siglaPartido")),
        "siglaUf": _normalize_str(raw.get("siglaUf")),
        "urlFoto": _normalize_str(raw.get("urlFoto")),
        "cargo": "Deputado Federal",
        "contexto_socioeconomico": {"municipios": []},
    }


def map_senador_to_politico(ident: Dict[str, Optional[str]]) -> Dict[str, Any]:
    cod = ident.get("CodigoParlamentar")
    if not cod:
        raise ValueError("Senador sem CodigoParlamentar.")
    return {
        "id": int(cod),
        "nome": _normalize_str(ident.get("NomeParlamentar")),
        "siglaPartido": _normalize_str(ident.get("SiglaPartidoParlamentar")),
        "siglaUf": _normalize_str(ident.get("UfParlamentar")),
        "urlFoto": _normalize_str(ident.get("UrlFotoParlamentar")),
        "cargo": "Senador",
        "contexto_socioeconomico": {"municipios": []},
    }


def fetch_deputados_camara_safe() -> List[Dict[str, Any]]:
    """Lista deputados (100/página). Circuit breaker → []."""
    try:
        session = _camara_session()
        url: Optional[str] = CAMARA_DEPUTADOS_URL
        acumulado: List[Dict[str, Any]] = []
        pagina = 0

        while url:
            pagina += 1
            req_params = {"itens": DEFAULT_ITENS} if pagina == 1 else None
            resp = http_get_with_exponential_backoff(
                session,
                url,
                contexto=f"Câmara deputados p.{pagina}",
                params=req_params,
            )
            payload = resp.json()
            dados = payload.get("dados") or []
            acumulado.extend(dados)

            url = None
            for link in payload.get("links") or []:
                if link.get("rel") == "next" and link.get("href"):
                    url = link["href"]
                    logger.info(
                        "Paginação Câmara (%d registros até agora).",
                        len(acumulado),
                    )
                    break

        logger.info("Câmara: total de registros brutos = %d", len(acumulado))
        return acumulado

    except Exception as exc:
        logger.error(
            "ERROR | Falha definitiva na Câmara, pulando para o Senado... (%s)",
            exc,
        )
        return []


def _xml_text(el: Optional[ET.Element]) -> Optional[str]:
    if el is None or el.text is None:
        return None
    t = el.text.strip()
    return t if t else None


def _strip_bom(content: bytes) -> bytes:
    """Remove UTF-8 BOM (EF BB BF) que o Senado às vezes envia antes do XML."""
    return content.lstrip(_UTF8_BOM)


def parse_senado_parlamentares_xml(content: bytes) -> List[Dict[str, Any]]:
    """Faz parse do XML do Senado, tolerando BOM e declarações de encoding."""
    content = _strip_bom(content)
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        text = content.decode("utf-8", errors="replace")
        root = ET.fromstring(text.encode("utf-8"))

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


def parse_senado_parlamentares_json(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        for key in ("Parlamentares", "parlamentares", "dados"):
            blob = payload.get(key)
            if isinstance(blob, list):
                return [_flatten_parlamentar_row(x) for x in blob if isinstance(x, dict)]
        lp = payload.get("ListaParlamentarEmExercicio")
        if isinstance(lp, dict):
            par = lp.get("Parlamentares") or lp.get("parlamentares")
            if isinstance(par, list):
                return [_flatten_parlamentar_row(x) for x in par if isinstance(x, dict)]
    if isinstance(payload, list):
        return [_flatten_parlamentar_row(x) for x in payload if isinstance(x, dict)]
    return []


def fetch_senadores_lista_atual() -> List[Dict[str, Any]]:
    try:
        session = _senado_session()
        resp = http_get_with_exponential_backoff(
            session,
            SENADO_LISTA_ATUAL_URL,
            contexto="Senado",
        )
        ctype = (resp.headers.get("Content-Type") or "").lower()
        raw_content = resp.content

        if "json" in ctype:
            try:
                payload = resp.json()
                rows = parse_senado_parlamentares_json(payload)
                if rows:
                    logger.info("Senado: JSON (%d parlamentares).", len(rows))
                    return rows
                logger.warning(
                    "Senado: Content-Type JSON mas estrutura não reconhecida — tentando XML."
                )
            except ValueError:
                logger.warning(
                    "Senado: Content-Type JSON mas corpo não decodificou — tentando XML."
                )

        try:
            rows = parse_senado_parlamentares_xml(raw_content)
            if rows:
                logger.info("Senado: XML (%d parlamentares).", len(rows))
                return rows
            logger.warning("Senado: XML parseado mas sem <Parlamentar> encontrado.")
            return []
        except ET.ParseError as exc:
            logger.exception("Senado: XML inválido mesmo após remoção de BOM (%s).", exc)

        try:
            payload = resp.json()
            rows = parse_senado_parlamentares_json(payload)
            if rows:
                logger.info(
                    "Senado: JSON (fallback final) (%d parlamentares).", len(rows)
                )
                return rows
        except ValueError:
            pass

        logger.error("Senado: não foi possível extrair parlamentares da resposta.")
        return []

    except Exception as exc:
        logger.error(
            "ERROR | Falha definitiva no Senado após retentativas (%s)",
            exc,
        )
        return []


def upsert_politico(
    db: Any,
    doc_payload: Dict[str, Any],
    *,
    indice: int,
    total: int,
) -> None:
    fs_id = firestore_document_id(doc_payload)
    doc_ref = db.collection(COLLECTION_POLITICOS).document(fs_id)

    logger.info(
        "Upserting político %d/%d — doc id=%s cargo=%s nome=%s",
        indice,
        total,
        fs_id,
        doc_payload.get("cargo"),
        doc_payload.get("nome") or "?",
    )

    try:
        doc_ref.set(doc_payload, merge=True)
    except Exception as exc:
        logger.exception(
            "Falha ao gravar fs_id=%s (%d/%d): %s",
            fs_id,
            indice,
            total,
            exc,
        )
        raise


def run_ingestion() -> Dict[str, Any]:
    stats = {
        "total_camara_api": 0,
        "total_senado_api": 0,
        "gravados": 0,
        "ignorados": 0,
        "erros": 0,
    }

    brutos_camara = fetch_deputados_camara_safe()
    brutos_senado = fetch_senadores_lista_atual()

    stats["total_camara_api"] = len(brutos_camara)
    stats["total_senado_api"] = len(brutos_senado)

    brutos_mapeados: List[Dict[str, Any]] = []

    for raw in brutos_camara:
        try:
            brutos_mapeados.append(map_deputado_to_politico(raw))
        except ValueError as exc:
            logger.warning(
                "Câmara — ignorado: %s keys=%s",
                exc,
                list(raw.keys()) if isinstance(raw, dict) else type(raw),
            )
            stats["ignorados"] += 1

    for ident in brutos_senado:
        try:
            brutos_mapeados.append(map_senador_to_politico(ident))
        except ValueError as exc:
            logger.warning("Senado — ignorado: %s ident=%s", exc, ident)
            stats["ignorados"] += 1

    db = init_firestore()
    total = len(brutos_mapeados)

    for idx, payload in enumerate(brutos_mapeados, start=1):
        try:
            upsert_politico(db, payload, indice=idx, total=total)
            stats["gravados"] += 1
        except Exception:
            stats["erros"] += 1
            logger.exception("Erro no registro %d/%d.", idx, total)

    return stats


def main() -> int:
    logger.info(
        "Ingestão políticos — coleção '%s' (Câmara + Senado).",
        COLLECTION_POLITICOS,
    )
    try:
        stats = run_ingestion()
    except Exception:
        logger.exception("Ingestão abortada por erro fatal.")
        return 1

    logger.info(
        "Concluído. Câmara=%d | Senado=%d | gravados=%d | ignorados=%d | erros=%d",
        stats["total_camara_api"],
        stats["total_senado_api"],
        stats["gravados"],
        stats["ignorados"],
        stats["erros"],
    )
    return 0 if stats["erros"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
