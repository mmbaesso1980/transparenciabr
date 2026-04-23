#!/usr/bin/env python3
"""
Radar comercial (B2B) — cruza Diários Oficiais (`diarios_atos`) e PCA PNCP → `radar_comercial`.

Critério Diário: frases de IRP / abertura de licitação + produtos-alvo (Asfalto, Merenda, Medicamentos).
Critério PNCP: itens PCA cujo texto contenha os mesmos produtos ou frases de procedimento.

Env: RADAR_OWNER_UID (Firebase Auth UID — alinhar ao operador / painel admin).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import requests
from firebase_admin import firestore

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.firebase_app import init_firestore

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

COLLECTION_DIARIOS = "diarios_atos"
COLLECTION_RADAR = "radar_comercial"

USER_AGENT = "TransparenciaBR-engines/17_commercial_radar"

PNCP_PCA_URL = os.environ.get(
    "PNCP_PCA_URL",
    "https://pncp.gov.br/api/consulta/v1/planos-contratacao",
)

PROC_KEYWORDS = [
    "intencao de registro de precos",
    "intenção de registro de preços",
    "abertura de licitacao",
    "abertura de licitação",
    "pregao eletronico",
    "pregão eletrônico",
]

PRODUCT_KEYWORDS = ["asfalto", "merenda", "medicamentos"]


def _norm(s: str) -> str:
    t = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def _owner_uid() -> str:
    uid = (os.environ.get("RADAR_OWNER_UID") or "").strip()
    if not uid:
        raise ValueError("Defina RADAR_OWNER_UID (mesmo UID do painel / Functions).")
    return uid


def _doc_id(*parts: str) -> str:
    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _hits_diario_commercial(text: str) -> bool:
    n = _norm(text)
    has_prod = any(k in n for k in PRODUCT_KEYWORDS)
    has_proc = any(k in n for k in PROC_KEYWORDS)
    return has_prod and has_proc


def _hits_pca_item(desc: str) -> bool:
    n = _norm(desc)
    has_prod = any(k in n for k in PRODUCT_KEYWORDS)
    has_proc = any(k in n for k in PROC_KEYWORDS) or "licitacao" in n or "contratacao" in n
    return has_prod and has_proc


def _digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s or "")


def _extract_ibge_item(item: Dict[str, Any]) -> Optional[str]:
    for key in (
        "codigoIbge",
        "municipio_id",
        "codigoIbgeMunicipio",
        "codigo_ibge_municipio",
    ):
        raw = item.get(key)
        if raw is None:
            continue
        d = _digits(str(raw))
        if len(d) >= 7:
            return d[-7:] if len(d) > 7 else d
        if len(d) == 6:
            return d.zfill(7)
    return None


def _fetch_pca_pages(
    session: requests.Session,
    *,
    codigo_ibge: str,
    data_ini: str,
    data_fim: str,
    max_pages: int,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    pagina = 1
    while pagina <= max_pages:
        params = {
            "codigoIbge": codigo_ibge,
            "dataInicial": data_ini,
            "dataFinal": data_fim,
            "pagina": str(pagina),
            "tamanhoPagina": "20",
        }
        r = session.get(
            PNCP_PCA_URL,
            params=params,
            timeout=180,
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
        )
        if not r.ok:
            logger.warning("PNCP PCA HTTP %s ibge=%s — %s", r.status_code, codigo_ibge, r.text[:200])
            break
        try:
            payload = r.json()
        except Exception:
            break
        chunk = payload.get("data") or []
        total_pag = int(payload.get("totalPaginas") or 1)
        if isinstance(chunk, list):
            out.extend([x for x in chunk if isinstance(x, dict)])
        if pagina >= total_pag:
            break
        pagina += 1
        time.sleep(0.35)
    return out


def _flatten_pca_rows(chunk: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for row in chunk:
        nested = row.get("itens") or row.get("listaItens") or []
        if isinstance(nested, list) and nested:
            for it in nested:
                if isinstance(it, dict):
                    merged = {**row, **it}
                    rows.append(merged)
        else:
            rows.append(row)
    return rows


def _pick_desc(item: Dict[str, Any]) -> str:
    return str(
        item.get("item_descricao")
        or item.get("descricaoItem")
        or item.get("descricao")
        or item.get("objeto")
        or "",
    ).strip()


def _pick_float(item: Dict[str, Any], *keys: str) -> Optional[float]:
    for k in keys:
        v = item.get(k)
        if v is None:
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    return None


def _contato_orgao(item: Dict[str, Any]) -> Dict[str, Optional[str]]:
    nome = ""
    email = ""
    tel = ""
    cnpj = ""
    for blob in (
        item,
        item.get("orgaoEntidade") or {},
        item.get("orgao") or {},
        item.get("unidadeOrgao") or {},
    ):
        if not isinstance(blob, dict):
            continue
        nome = nome or str(blob.get("nome") or blob.get("nomeOrgao") or "").strip()
        email = email or str(blob.get("email") or "").strip()
        tel = tel or _digits(str(blob.get("telefone") or ""))[:20]
        cnpj = cnpj or _digits(str(blob.get("cnpj") or blob.get("niOrgao") or ""))[:14]
    return {"nome": nome or None, "email": email or None, "telefone": tel or None, "cnpj": cnpj or None}


def scan_diarios(fs: firestore.Client, owner_uid: str) -> int:
    col = fs.collection(COLLECTION_DIARIOS)
    n = 0
    for snap in col.limit(500).stream():
        data = snap.to_dict() or {}
        trecho = str(data.get("trecho_ato") or data.get("texto") or "")
        if not _hits_diario_commercial(trecho):
            continue
        mun = str(data.get("municipio") or "")[:512]
        doc_id = _doc_id("diario", snap.id, owner_uid)
        valor_guess = None
        m_val = re.search(
            r"R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)",
            trecho,
            re.IGNORECASE,
        )
        if m_val:
            raw = m_val.group(1).replace(".", "").replace(",", ".")
            try:
                valor_guess = float(raw)
            except ValueError:
                valor_guess = None

        payload = {
            "painel_area": "comercial",
            "origem": "diario",
            "titulo": (trecho[:180] + "…") if len(trecho) > 180 else trecho,
            "municipio": mun,
            "codigo_ibge_municipio": str(data.get("codigo_ibge_municipio") or "")[:16] or None,
            "valor_estimado": valor_guess,
            "orgao_contato": {"nome": mun or "—", "email": None, "telefone": None},
            "uid_proprietario": owner_uid,
            "is_private": True,
            "fontes": [
                {
                    "tipo": "diario_oficial",
                    "url": str(data.get("url_fonte") or ""),
                    "diario_doc_id": snap.id,
                }
            ],
            "payload_bruto": trecho[:8000],
            "atualizado_em": firestore.SERVER_TIMESTAMP,
            "criado_em": firestore.SERVER_TIMESTAMP,
        }
        fs.collection(COLLECTION_RADAR).document(doc_id).set(payload, merge=True)
        n += 1
    logger.info("Diários comerciais indexados: %s", n)
    return n


def scan_pncp(fs: firestore.Client, ibges: Set[str], owner_uid: str) -> int:
    if not ibges:
        return 0
    session = requests.Session()
    fim = datetime.now(timezone.utc).date()
    ini = fim - timedelta(days=365)
    data_ini = ini.strftime("%Y%m%d")
    data_fim = fim.strftime("%Y%m%d")
    n = 0
    for ibge in sorted(ibges):
        time.sleep(0.35)
        chunk = _fetch_pca_pages(session, codigo_ibge=ibge, data_ini=data_ini, data_fim=data_fim, max_pages=25)
        flat = _flatten_pca_rows(chunk)
        for item in flat:
            desc = _pick_desc(item)
            if not desc or not _hits_pca_item(desc):
                continue
            q = _pick_float(item, "quantidade_estimada", "quantidadeEstimada")
            vu = _pick_float(item, "valor_unitario_estimado", "valorUnitarioEstimado")
            vest = None
            if q is not None and vu is not None:
                vest = q * vu
            ib = _extract_ibge_item(item) or ibge
            contato = _contato_orgao(item)
            rk = _docid_pca(item, ib, desc, owner_uid)
            payload = {
                "painel_area": "comercial",
                "origem": "pncp_pca",
                "titulo": desc[:2048],
                "municipio": ib,
                "codigo_ibge_municipio": ib,
                "valor_estimado": vest,
                "quantidade_estimada": q,
                "valor_unitario_estimado": vu,
                "orgao_contato": contato,
                "uid_proprietario": owner_uid,
                "is_private": True,
                "fontes": [{"tipo": "pncp", "url": PNCP_PCA_URL, "payload": json.dumps(item, default=str)[:6000]}],
                "atualizado_em": firestore.SERVER_TIMESTAMP,
                "criado_em": firestore.SERVER_TIMESTAMP,
            }
            fs.collection(COLLECTION_RADAR).document(rk).set(payload, merge=True)
            n += 1
    return n


def _docid_pca(item: Dict[str, Any], ibge: str, desc: str, owner_uid: str) -> str:
    plan = str(item.get("numeroControlePNCP") or item.get("idPlano") or "")[:128]
    return _doc_id("pncp", ibge, plan, desc[:400], owner_uid)


def collect_ibge_from_diarios(fs: firestore.Client) -> Set[str]:
    out: Set[str] = set()
    extra = os.environ.get("RADAR_IBGES_EXTRA", "")
    for part in extra.split(","):
        d = _digits(part.strip())
        if len(d) >= 7:
            out.add(d[-7:])
        elif len(d) == 6:
            out.add(d.zfill(7))
    for snap in fs.collection(COLLECTION_DIARIOS).limit(400).stream():
        d = snap.to_dict() or {}
        raw = d.get("codigo_ibge_municipio") or d.get("codigoIbge")
        if raw is None:
            continue
        digits = _digits(str(raw))
        if len(digits) >= 7:
            out.add(digits[-7:])
        elif len(digits) == 6:
            out.add(digits.zfill(7))
    if not out:
        out.add("3106200")
        logger.warning("Nenhum IBGE inferido — usando fallback 3106200 (BH).")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Radar comercial → radar_comercial (Firestore).")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-pncp", action="store_true")
    args = parser.parse_args()

    try:
        owner_uid = _owner_uid()
    except ValueError as e:
        logger.error("%s", e)
        return 0

    fs = init_firestore()

    if args.dry_run:
        n_hit = 0
        for snap in fs.collection(COLLECTION_DIARIOS).limit(80).stream():
            t = str((snap.to_dict() or {}).get("trecho_ato") or "")
            if _hits_diario_commercial(t):
                n_hit += 1
        logger.info("[dry-run] Trechos diário matching comercial (amostra 80): %s", n_hit)
        ibges = collect_ibge_from_diarios(fs)
        logger.info("[dry-run] IBGEs para PCA: %s", sorted(ibges)[:12])
        return 0

    scan_diarios(fs, owner_uid)
    if not args.skip_pncp:
        ibges = collect_ibge_from_diarios(fs)
        n_p = scan_pncp(fs, ibges, owner_uid)
        logger.info("Radar PNCP gravado/atualizado: %s linhas.", n_p)

    return 0


if __name__ == "__main__":
    sys.exit(main())
