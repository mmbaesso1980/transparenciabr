#!/usr/bin/env python3
"""
Protocolo A.S.M.O.D.E.U.S. — Crawler Querido Diário (API real OKBR).

Consulta ``https://api.queridodiario.ok.org.br/gazettes`` por município (território
IBGE) e palavras-chave críticas; persiste excertos na coleção ``diarios_atos``.

Nota: ``queridodiario.ok.org.br/api/gazettes`` resolve para a SPA React; o JSON público
está no hostname ``api.queridodiario.ok.org.br`` (compatível com o projeto Querido Diário).
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from firebase_admin import firestore

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.firebase_app import init_firestore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

KEYWORDS_CRITICAS = [
    "dispensa de licitação",
    "inexigibilidade",
]

QUERIDO_DIARIO_API_BASE = os.environ.get(
    "QUERIDO_DIARIO_API_BASE",
    "https://api.queridodiario.ok.org.br",
)
GAZETTES_URL = os.environ.get(
    "QUERIDO_DIARIO_GAZETTES_URL",
    f"{QUERIDO_DIARIO_API_BASE.rstrip('/')}/gazettes",
)
CITIES_URL = os.environ.get(
    "QUERIDO_DIARIO_CITIES_URL",
    f"{QUERIDO_DIARIO_API_BASE.rstrip('/')}/cities",
)

REQUEST_GAP_SEC = 2.0
REQUEST_TIMEOUT_SEC = 90
HTTP_HEADERS = {
    "User-Agent": "TransparenciaBR-engines/1.0 (Querido Diário crawler)",
    "Accept": "application/json",
}

COLLECTION_ATOS = "diarios_atos"
COLLECTION_POLITICOS = "politicos"


def _normalize_name(s: str) -> str:
    t = unicodedata.normalize("NFD", s.strip().lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _only_digits(s: str) -> str:
    return "".join(ch for ch in str(s) if ch.isdigit())


def _extract_ibge_from_row(m: Dict[str, Any]) -> Optional[str]:
    for key in (
        "codigo_ibge_municipio",
        "id_municipio",
        "codigo_ibge",
        "ibge",
        "codigoIbge",
    ):
        raw = m.get(key)
        if raw is None:
            continue
        digits = _only_digits(str(raw))
        if len(digits) >= 7:
            return digits[-7:] if len(digits) > 7 else digits
        if len(digits) == 6:
            return digits.zfill(7)
    return None


def _nome_municipio_row(m: Dict[str, Any]) -> str:
    return (
        (m.get("nome_municipio") or m.get("nome") or m.get("municipio_nome") or "")
        .strip()
        or "—"
    )


def _uf_row(m: Dict[str, Any]) -> str:
    u = str(m.get("uf") or m.get("sigla_uf") or "").strip().upper()
    return u[:2] if len(u) >= 2 else ""


def _load_cities_territory_lookup(session: requests.Session) -> Dict[str, List[Tuple[str, str]]]:
    """Nome normalizado → [(territory_id, state_code), ...]."""
    logger.info("Carregando índice de municípios (GET %s) — pode demorar.", CITIES_URL)
    r = session.get(CITIES_URL, headers=HTTP_HEADERS, timeout=REQUEST_TIMEOUT_SEC)
    r.raise_for_status()
    payload = r.json()
    rows = payload.get("cities") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ValueError("Resposta /cities sem lista 'cities'.")
    lookup: Dict[str, List[Tuple[str, str]]] = {}
    for c in rows:
        if not isinstance(c, dict):
            continue
        tid = str(c.get("territory_id") or "").strip()
        name = str(c.get("territory_name") or "").strip()
        sc = str(c.get("state_code") or "").strip().upper()[:2]
        if not tid or not name:
            continue
        key = _normalize_name(name)
        lookup.setdefault(key, []).append((tid, sc))
    logger.info("Índice de municípios: %d chaves únicas.", len(lookup))
    return lookup


def _resolve_territory_id(
    m: Dict[str, Any],
    lookup: Dict[str, List[Tuple[str, str]]],
) -> Tuple[Optional[str], str]:
    ibge = _extract_ibge_from_row(m)
    nome = _nome_municipio_row(m)
    uf = _uf_row(m)

    if ibge:
        return ibge, nome

    key = _normalize_name(nome)
    cand = lookup.get(key, [])
    if not cand:
        logger.warning(
            "Município '%s' sem código IBGE e sem correspondência no Querido Diário — ignorado.",
            nome,
        )
        return None, nome
    if uf:
        for tid, sc in cand:
            if sc == uf:
                return tid, nome
        logger.warning(
            "Ambiguidade ou UF divergente para '%s' (%s); usa primeiro candidate.",
            nome,
            uf,
        )
    tid0 = cand[0][0]
    logger.info("Resolvido '%s' → territory_id=%s (fallback nome).", nome, tid0)
    return tid0, nome


def _rows_municipios_politico(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    wrap = data.get("contexto_socioeconomico") or {}
    raw = wrap.get("municipios") or data.get("indicadores_municipios_alvo") or []
    out: List[Dict[str, Any]] = []
    if isinstance(raw, list):
        for m in raw:
            if isinstance(m, dict):
                out.append(m)
    return out


def _fetch_gazettes_json(
    session: requests.Session,
    *,
    territory_id: str,
    querystring: str,
    offset: int,
    size: int,
) -> Dict[str, Any]:
    params = {
        "territory_id": territory_id,
        "querystring": querystring,
        "offset": str(offset),
        "size": str(min(100, max(1, size))),
    }
    r = session.get(GAZETTES_URL, params=params, headers=HTTP_HEADERS, timeout=REQUEST_TIMEOUT_SEC)
    r.raise_for_status()
    return r.json()


def _gazettes_list(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = payload.get("gazettes") or payload.get("items") or []
    return raw if isinstance(raw, list) else []


def _iso_date(g: Dict[str, Any]) -> str:
    d = g.get("date")
    if isinstance(d, str) and d.strip():
        return d.strip()[:10]
    return ""


def _fonte_url(g: Dict[str, Any]) -> str:
    for k in ("url", "txt_url", "download_url"):
        u = g.get(k)
        if isinstance(u, str) and u.startswith("http"):
            return u
    return ""


def _expand_atos_from_payload(
    politico_id: str,
    municipio_label: str,
    keyword: str,
    gazettes: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for g in gazettes:
        if not isinstance(g, dict):
            continue
        excerpts = g.get("excerpts")
        if not isinstance(excerpts, list):
            continue
        terr_name = str(g.get("territory_name") or municipio_label)
        dt = _iso_date(g)
        url = _fonte_url(g)
        for ex in excerpts:
            if not isinstance(ex, str) or not ex.strip():
                continue
            trecho = ex.strip()
            out.append(
                {
                    "politico_id": politico_id.strip(),
                    "municipio": terr_name,
                    "data": dt,
                    "trecho_ato": trecho,
                    "url_fonte": url,
                    "is_suspeito": True,
                    "keyword_match": keyword,
                    "territory_id": str(g.get("territory_id") or ""),
                    "edition": g.get("edition"),
                    "is_extra_edition": g.get("is_extra_edition"),
                    "fonte_api": "querido_diario_okbr",
                }
            )
    return out


def _doc_idempotency_key(ato: Dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(ato.get("politico_id", "")),
            str(ato.get("data", "")),
            str(ato.get("url_fonte", "")),
            str(ato.get("keyword_match", "")),
            str(ato.get("trecho_ato", ""))[:600],
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def persistir_atos(db: firestore.Client, atos: List[Dict[str, Any]]) -> int:
    col = db.collection(COLLECTION_ATOS)
    batch = db.batch()
    ops = 0
    total = 0
    for ato in atos:
        doc_id = _doc_idempotency_key(ato)
        batch.set(col.document(doc_id), ato, merge=True)
        ops += 1
        total += 1
        if ops >= 450:
            batch.commit()
            batch = db.batch()
            ops = 0
    if ops:
        batch.commit()
    return total


def collect_atos_real(
    politico_id: str,
    *,
    pages_per_query: int,
    page_size: int,
) -> Tuple[List[Dict[str, Any]], int]:
    """Retorna (lista de atos, número de GETs HTTP à API)."""
    db = init_firestore()
    ref = db.collection(COLLECTION_POLITICOS).document(politico_id.strip())
    snap = ref.get()
    if not snap.exists:
        raise ValueError(f"Politico '{politico_id}' não encontrado em '{COLLECTION_POLITICOS}'.")

    data = snap.to_dict() or {}
    municipios = _rows_municipios_politico(data)
    if not municipios:
        raise ValueError(
            "Documento sem `contexto_socioeconomico.municipios` (ou equivalente). "
            "Ingestão socioeconómica necessária antes do crawler."
        )

    session = requests.Session()
    session.headers.update(HTTP_HEADERS)

    lookup: Dict[str, List[Tuple[str, str]]] = {}
    precisa_indice_nomes = any(_extract_ibge_from_row(m) is None for m in municipios)
    if precisa_indice_nomes:
        lookup = _load_cities_territory_lookup(session)
        time.sleep(REQUEST_GAP_SEC)

    atos: List[Dict[str, Any]] = []
    http_calls = 0

    pairs: List[Tuple[str, str, str]] = []
    for m in municipios:
        tid, label = _resolve_territory_id(m, lookup)
        if not tid:
            continue
        for kw in KEYWORDS_CRITICAS:
            pairs.append((tid, label, kw))

    first_req = True
    for territory_id, mun_label, kw in pairs:
        if not first_req:
            time.sleep(REQUEST_GAP_SEC)
        first_req = False

        offset = 0
        for _page in range(max(1, pages_per_query)):
            payload = _fetch_gazettes_json(
                session,
                territory_id=territory_id,
                querystring=kw,
                offset=offset,
                size=page_size,
            )
            http_calls += 1

            gazettes = _gazettes_list(payload)
            atos.extend(_expand_atos_from_payload(politico_id, mun_label, kw, gazettes))

            if len(gazettes) < page_size:
                break
            offset += page_size

            time.sleep(REQUEST_GAP_SEC)

    logger.info(
        "Coleta API: %d pedidos HTTP, %d documentos de excerto derivados.",
        http_calls,
        len(atos),
    )
    return atos, http_calls


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Querido Diário — dispensa/inexigibilidade → Firestore diarios_atos.",
    )
    parser.add_argument(
        "--politico-id",
        required=True,
        help="ID Firestore do parlamentar (politicos/{id}).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa chamadas HTTP e mostra excertos no log; não grava Firestore.",
    )
    parser.add_argument(
        "--pages-per-query",
        type=int,
        default=1,
        help="Páginas por combinação (município × keyword); cada página usa offset+=size.",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=50,
        help="Registros por página (máx. 100 na API).",
    )
    args = parser.parse_args()

    pid = args.politico_id.strip()
    if not pid:
        logger.error("--politico-id vazio.")
        return 1

    logger.info(
        "Keywords: %s | gap=%ss | API=%s",
        ", ".join(KEYWORDS_CRITICAS),
        REQUEST_GAP_SEC,
        GAZETTES_URL,
    )

    try:
        atos, calls = collect_atos_real(
            pid,
            pages_per_query=max(1, args.pages_per_query),
            page_size=min(100, max(1, args.page_size)),
        )
    except ValueError as exc:
        logger.error("%s", exc)
        return 0
    except requests.RequestException as exc:
        logger.exception("Falha HTTP Querido Diário: %s", exc)
        return 3
    except Exception as exc:
        logger.exception("Erro na coleta: %s", exc)
        return 1

    if args.dry_run:
        logger.info(
            "[dry-run] Chamadas HTTP=%d | total excertos=%d (não gravados).",
            calls,
            len(atos),
        )
        for i, a in enumerate(atos[:15]):
            trecho = str(a.get("trecho_ato", ""))
            snippet = trecho.replace("\n", " ")[:320]
            logger.info(
                "[dry-run sample %d] %s | %s | %s …",
                i + 1,
                a.get("data"),
                a.get("keyword_match"),
                snippet,
            )
        if len(atos) > 15:
            logger.info("[dry-run] … mais %d excertos omitidos do log.", len(atos) - 15)
        return 0

    try:
        db = init_firestore()
        n = persistir_atos(db, atos)
    except Exception as exc:
        logger.exception("Falha ao gravar diarios_atos: %s", exc)
        return 1

    logger.info(
        "Gravados %d documentos em `%s` (politico_id=%s).",
        n,
        COLLECTION_ATOS,
        pid,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
