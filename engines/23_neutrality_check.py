#!/usr/bin/env python3
"""
Motor 23 — Neutralidade (I.R.O.N.M.A.N.)
Agrega alertas críticos por partido (via `politicos`), calcula ICP e Gini simplificado,
grava relatório em Firestore `neutrality_reports/{report_id}`.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

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

COL_ALERTAS = "alertas_bodes"
COL_POLITICOS = "politicos"
COL_REPORTS = "neutrality_reports"

# Alertas que entram na análise de cobertura crítica
_CRITICAL_SEVERITIES = frozenset(
    {
        "ALTA",
        "CRITICA",
        "CRÍTICA",
        "CRITICO",
        "CRÍTICO",
        "NIVEL_4",
        "NIVEL_5",
    }
)


def _parse_dt(data: Dict[str, Any]) -> datetime | None:
    raw = data.get("criado_em") or data.get("criadoEm") or data.get("timestamp")
    if raw is None:
        return None
    if hasattr(raw, "timestamp"):
        dt = raw
        if getattr(dt, "tzinfo", None) is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    return None


def _severity(data: Dict[str, Any]) -> str:
    return str(data.get("severidade") or data.get("criticidade") or "").strip().upper()


def _pick_partido(doc: Dict[str, Any]) -> str:
    v = (
        doc.get("partido")
        or doc.get("sigla_partido")
        or doc.get("siglaPartido")
        or doc.get("ultimaFiliacao")
        or doc.get("sigla")
        or ""
    )
    s = str(v).strip()
    return s if s else "INDEFINIDO"


def _load_politicos(db: firestore.Client) -> Tuple[Dict[str, str], Dict[str, int]]:
    """Mapa politico_id -> partido e contagem por partido."""
    pid_to_party: Dict[str, str] = {}
    counts: Dict[str, int] = defaultdict(int)
    for snap in db.collection(COL_POLITICOS).stream():
        pid = str(snap.id).strip()
        party = _pick_partido(snap.to_dict() or {})
        pid_to_party[pid] = party
        counts[party] += 1
    return pid_to_party, dict(counts)


def _gini_coefficient(values: List[float]) -> float:
    """Gini em [0,1]; 0 = igualdade total."""
    if not values:
        return 0.0
    xs = sorted(max(0.0, float(x)) for x in values)
    n = len(xs)
    total = sum(xs)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, x in enumerate(xs, start=1):
        cum += (2 * i - n - 1) * x
    return cum / (n * total)


def run(*, days: int, dry_run: bool) -> Dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, days))
    db = init_firestore()

    politico_party, party_member_count = _load_politicos(db)

    alerts_by_party: Dict[str, int] = defaultdict(int)
    total_crit = 0
    missing_party = 0

    def process_snap(data: Dict[str, Any], pid: str) -> None:
        nonlocal total_crit, missing_party
        sev = _severity(data)
        if sev not in _CRITICAL_SEVERITIES and not (
            "NIVEL" in sev and any(x in sev for x in ("4", "5"))
        ):
            return
        dt = _parse_dt(data)
        if dt is not None and dt < cutoff:
            return
        total_crit += 1
        party = politico_party.get(pid) if politico_party else ""
        if not party:
            raw_p = str(data.get("partido") or data.get("sigla_partido") or "").strip()
            party = raw_p or "INDEFINIDO"
            if party == "INDEFINIDO":
                missing_party += 1
        alerts_by_party[party] += 1

    for snap in db.collection(COL_ALERTAS).stream():
        data = snap.to_dict() or {}
        pid = str(data.get("politico_id") or data.get("parlamentar_id") or "").strip()
        if not pid:
            continue
        process_snap(data, pid)

    total_deps = sum(party_member_count.values()) or 1
    total_alertas = sum(alerts_by_party.values()) or 1

    por_partido: List[Dict[str, Any]] = []
    for party, n_alertas in sorted(alerts_by_party.items(), key=lambda x: -x[1]):
        n_deps = party_member_count.get(party, 0)
        share_deps = n_deps / total_deps if total_deps else 0.0
        share_alertas = n_alertas / total_alertas if total_alertas else 0.0
        icp = (share_alertas / share_deps) if share_deps > 0 else 0.0
        status = "PROPORCIONAL"
        if icp > 2.5:
            status = "SOBRE_REPRESENTADO"
        elif icp < 0.35 and share_deps > 0:
            status = "SUB_REPRESENTADO"

        por_partido.append(
            {
                "partido": party,
                "parlamentares": n_deps,
                "alertas_criticos": n_alertas,
                "icp": round(icp, 4),
                "status": status,
            }
        )

    gini = _gini_coefficient([float(x["alertas_criticos"]) for x in por_partido])

    report = {
        "periodo": {
            "inicio": cutoff.date().isoformat(),
            "fim": datetime.now(timezone.utc).date().isoformat(),
        },
        "total_alertas_criticos": total_crit,
        "total_politicos_indexados": total_deps,
        "alertas_sem_partido_resolvido": missing_party,
        "por_partido": por_partido[:80],
        "indice_gini_alertas": round(gini, 4),
        "status_geral": "NEUTRO" if gini < 0.35 else "ASSIMETRICO",
        "motor": "23_neutrality_check",
    }

    if dry_run:
        logger.info(
            "Relatório (dry-run): %s partidos com alertas. Gini=%s",
            len(alerts_by_party),
            report["indice_gini_alertas"],
        )
        print(report)
        return report

    report["geradoEm"] = firestore.SERVER_TIMESTAMP
    rid = f"neut_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    db.collection(COL_REPORTS).document(rid).set(report)
    logger.info("Gravado %s/%s", COL_REPORTS, rid)
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Neutralidade — ICP por partido e Gini.")
    ap.add_argument("--days", type=int, default=90, help="Janela rolling (dias).")
    ap.add_argument("--dry-run", action="store_true", help="Não grava no Firestore.")
    args = ap.parse_args()
    try:
        run(days=args.days, dry_run=args.dry_run)
        return 0
    except Exception as exc:
        logger.exception("Falha: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
