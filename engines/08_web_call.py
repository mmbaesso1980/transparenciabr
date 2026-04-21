#!/usr/bin/env python3
"""
Sentinela Ativo — alertas NIVEL_5 (24h) × watchlist de utilizadores.

Simula envio Webhook/E-mail imprimindo payload JSON no terminal.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

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

COLLECTION_ALERTAS = "alertas_bodes"
COLLECTION_USUARIOS = "usuarios"


def _parse_criado_em(data: Dict[str, Any]) -> datetime | None:
    raw = data.get("criado_em")
    if raw is None:
        return None
    if hasattr(raw, "timestamp"):
        return raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw.astimezone(timezone.utc)
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    return None


def alertas_nivel5_recentes(db: firestore.Client, *, horas: int = 24) -> List[Dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=horas)
    out: List[Dict[str, Any]] = []
    for snap in db.collection(COLLECTION_ALERTAS).stream():
        data = snap.to_dict() or {}
        sev = str(data.get("severidade") or data.get("criticidade") or "").strip()
        if sev != "NIVEL_5":
            continue
        dt = _parse_criado_em(data)
        if dt is None or dt < cutoff:
            continue
        item = dict(data)
        item["_doc_id"] = snap.id
        out.append(item)
    return out


def usuarios_monitorando_politico(db: firestore.Client, politico_id: str) -> List[Dict[str, str]]:
    """Utilizadores com ``politico_id`` em ``watchlist`` (array de strings)."""
    uid_list: List[Dict[str, str]] = []
    politico_id = politico_id.strip()
    try:
        q = (
            db.collection(COLLECTION_USUARIOS)
            .where("watchlist", "array_contains", politico_id)
        )
        for snap in q.stream():
            uid_list.append({"uid": snap.id, "email": str((snap.to_dict() or {}).get("email") or "")})
    except Exception as exc:
        logger.warning(
            "Consulta watchlist falhou (índice ou permissões): %s — fallback varredura.",
            exc,
        )
        for snap in db.collection(COLLECTION_USUARIOS).stream():
            data = snap.to_dict() or {}
            wl = data.get("watchlist")
            if isinstance(wl, list) and politico_id in [str(x) for x in wl]:
                uid_list.append({"uid": snap.id, "email": str(data.get("email") or "")})
    return uid_list


def emitir_notificacao(
    alerta: Dict[str, Any],
    destinatarios: List[Dict[str, str]],
    *,
    canal: str = "webhook_simulado",
) -> None:
    payload = {
        "canal": canal,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "alerta": {
            "doc_id": alerta.get("_doc_id"),
            "politico_id": alerta.get("politico_id"),
            "tipo_risco": alerta.get("tipo_risco"),
            "severidade": alerta.get("severidade"),
            "mensagem": alerta.get("mensagem"),
            "fonte": alerta.get("fonte"),
        },
        "destinatarios": destinatarios,
        "corpo_email_simulado": (
            f"[Sentinela] Alerta {alerta.get('tipo_risco')} (NIVEL_5) "
            f"para politico_id={alerta.get('politico_id')}."
        ),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    horas = 24
    try:
        db = init_firestore()
    except Exception as exc:
        logger.exception("Firestore: %s", exc)
        return 1

    alertas = alertas_nivel5_recentes(db, horas=horas)
    logger.info("Alertas NIVEL_5 nas últimas %dh: %d", horas, len(alertas))

    if not alertas:
        logger.info("Nada a notificar.")
        return 0

    for al in alertas:
        pid = str(al.get("politico_id") or al.get("parlamentar_id") or "").strip()
        if not pid:
            continue
        users = usuarios_monitorando_politico(db, pid)
        logger.info("Politico %s — utilizadores na watchlist: %d", pid, len(users))
        emitir_notificacao(al, users)

    return 0


if __name__ == "__main__":
    sys.exit(main())
