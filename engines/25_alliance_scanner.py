#!/usr/bin/env python3
"""
Motor 25 — Alliance Scanner (bancadas por proximidade de scores)
Lê `espectro_scores` (saída do motor 24), agrupa por k centróides fixos em (eco×social),
calcula coesão aproximada e grava `voting_clusters/{cluster_id}`.

Não usa scikit-learn (dependência opcional evitada); adequado para protótipo consistente com o repo.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from datetime import datetime, timezone
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

COL_ESPECTRO = "espectro_scores"
COL_CLUSTERS = "voting_clusters"

# k=8 centróides (eco, social) — espaço 0–100
_CENTROIDS: List[Tuple[str, float, float]] = [
    ("cluster_centrao_fiscal", 62.0, 48.0),
    ("cluster_bancada_evangelica", 58.0, 28.0),
    ("cluster_oposicao_consistente", 35.0, 55.0),
    ("cluster_base_governista", 48.0, 52.0),
    ("cluster_ruralistas", 55.0, 42.0),
    ("cluster_progressistas_urbanos", 52.0, 72.0),
    ("cluster_regionalistas", 45.0, 50.0),
    ("cluster_independentes", 50.0, 50.0),
]


def _dist(a: float, b: float, x: float, y: float) -> float:
    dx = a - x
    dy = b - y
    return (dx * dx + dy * dy) ** 0.5


def _assign_cluster(eco: float, soc: float) -> str:
    best = _CENTROIDS[0][0]
    best_d = 1e9
    for cid, cx, cy in _CENTROIDS:
        d = _dist(eco, soc, cx, cy)
        if d < best_d:
            best_d = d
            best = cid
    return best


def _cohesion(points: List[Tuple[float, float]]) -> float:
    if len(points) < 2:
        return 1.0
    mx = sum(p[0] for p in points) / len(points)
    my = sum(p[1] for p in points) / len(points)
    dists = [_dist(p[0], p[1], mx, my) for p in points]
    mean_d = sum(dists) / len(dists)
    # Coesão alta quando dispersão baixa (normalizada)
    return max(0.0, min(1.0, 1.0 - mean_d / 50.0))


def run(*, dry_run: bool, replace_prefix: str) -> None:
    db = None if dry_run else init_firestore()
    members: Dict[str, List[str]] = defaultdict(list)
    points: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
    mix: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    rows: List[Tuple[str, Dict[str, Any]]] = []
    if dry_run:
        rows = [
            ("1", {"score_economico": 70.0, "score_social": 30.0, "partido": "PL"}),
            ("2", {"score_economico": 68.0, "score_social": 32.0, "partido": "PL"}),
        ]
    else:
        for snap in db.collection(COL_ESPECTRO).stream():
            rows.append((snap.id, snap.to_dict() or {}))

    if not rows:
        logger.warning("Nenhum documento em `%s`. Rode antes o motor 24.", COL_ESPECTRO)
        return

    for pid, data in rows:
        try:
            eco = float(data.get("score_economico", 50))
            soc = float(data.get("score_social", 50))
        except (TypeError, ValueError):
            eco, soc = 50.0, 50.0
        cid = _assign_cluster(eco, soc)
        members[cid].append(pid)
        points[cid].append((eco, soc))
        p = str(data.get("partido") or "?")
        mix[cid][p] += 1

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    for cluster_id, _eco_c, _soc_c in _CENTROIDS:
        mids = members.get(cluster_id, [])
        if not mids:
            continue
        coh = _cohesion(points[cluster_id])
        doc = {
            "cluster_id": f"{cluster_id}_{ts}",
            "nome_sugerido": cluster_id.replace("cluster_", "").replace("_", " ").title(),
            "cohesion_score": round(coh, 4),
            "membros": mids[:500],
            "qtd_membros": len(mids),
            "partidos_mix": dict(mix[cluster_id]),
            "temas_coesos": [],
            "periodo": "derived_from_espectro",
            "atualizadoEm": firestore.SERVER_TIMESTAMP if not dry_run else None,
            "motor": "25_alliance_scanner",
        }
        safe_id = f"{replace_prefix}{cluster_id}_{ts}"
        if dry_run:
            logger.info("[dry-run] %s membros=%s coesão=%s", safe_id, len(mids), coh)
        else:
            db.collection(COL_CLUSTERS).document(safe_id).set(doc)
            logger.info("Gravado %s/%s (%s membros)", COL_CLUSTERS, safe_id, len(mids))


def main() -> int:
    ap = argparse.ArgumentParser(description="Alliance Scanner — clusters a partir de espectro_scores.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--doc-prefix",
        type=str,
        default="asm_",
        help="Prefixo opcional no ID do documento.",
    )
    args = ap.parse_args()
    try:
        run(dry_run=args.dry_run, replace_prefix=args.doc_prefix)
        return 0
    except Exception as exc:
        logger.exception("%s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
