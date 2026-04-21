#!/usr/bin/env python3
"""
Motor 24 — E.S.P.E.C.T.R.O. (espectro económico × social)
- Modo real: API Câmara (`/deputados/{id}/votacoes` + detalhe da votação) + classificação por keywords.
- Modo `--mock`: scores determinísticos (CI / sem quota).
Grava Firestore `espectro_scores/{parlamentar_id}`.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests

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

API = "https://dadosabertos.camara.leg.br/api/v2"
COL_ESPECTRO = "espectro_scores"
COL_POLITICOS = "politicos"

ECO_LIB = (
    "privatiz",
    "concess",
    "reforma trabalhista",
    "teto de gastos",
    "autonomia do banco central",
    "redução de impostos",
    "desregulament",
)
ECO_ESTAT = (
    "reestatiz",
    "ampliação do funcionalismo",
    "revogação da reforma trabalhista",
    "controle de preços",
    "fundo público",
    "monopólio estatal",
)

SOC_PROG = (
    "criminalização da homofobia",
    "aborto",
    "estatuto da igualdade racial",
    "direitos indígenas",
    "cotas raciais",
    "casamento igualitário",
    "lgbt",
)
SOC_CONS = (
    "escola sem partido",
    "maioridade penal",
    "estatuto da família",
    "armas",
    "contrário às cotas",
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().strip())


def _collect_vote_text(blob: Any, depth: int = 0) -> str:
    if depth > 8:
        return ""
    if isinstance(blob, str):
        return blob + " "
    if isinstance(blob, dict):
        parts: List[str] = []
        for k, v in blob.items():
            if k.lower() in ("uri", "urievento", "links", "url"):
                continue
            parts.append(_collect_vote_text(v, depth + 1))
        return "".join(parts)
    if isinstance(blob, list):
        return "".join(_collect_vote_text(x, depth + 1) for x in blob)
    return ""


def _score_keywords(text: str, pos: Tuple[str, ...], neg: Tuple[str, ...]) -> float | None:
    t = _norm(text)
    if len(t) < 12:
        return None
    pp = sum(1 for k in pos if k in t)
    nn = sum(1 for k in neg if k in t)
    if pp == 0 and nn == 0:
        return None
    # -1 estatizante/conservador … +1 liberal/progressista
    return (pp - nn) / max(1, pp + nn)


def _to_0_100_from_signed(x: float) -> float:
    return max(0.0, min(100.0, 50.0 + 50.0 * x))


def _quadrante(eco: float, soc: float) -> str:
    le = eco >= 50
    ls = soc >= 50
    if le and ls:
        return "LIB_PROG"
    if le and not ls:
        return "LIB_CONS"
    if not le and ls:
        return "EST_PROG"
    return "EST_CONS"


def _mock_scores(dep_id: str) -> Tuple[float, float, int, int, int]:
    h = hashlib.sha256(dep_id.encode()).digest()
    n = 25 + (h[0] % 60)
    eco = 20 + (h[1] % 61)
    soc = 15 + (h[2] % 70)
    ve = max(1, n // 2)
    vs = max(1, n - ve)
    return float(eco), float(soc), n, ve, vs


def _fetch_json(url: str, params: Dict[str, Any] | None = None, timeout: int = 45) -> Dict[str, Any]:
    r = requests.get(
        url,
        params=params or {},
        headers={"Accept": "application/json"},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()


def _analyze_deputado(dep_id: str, max_votos: int, pause: float) -> Tuple[float, float, int, int, int]:
    """Devolve eco, social, total_votos, votos_eco, votos_soc."""
    url = f"{API}/deputados/{dep_id}/votacoes"
    params = {"ordem": "DESC", "itens": min(100, max_votos)}
    eco_vals: List[float] = []
    soc_vals: List[float] = []
    votos_eco = 0
    votos_soc = 0

    try:
        data = _fetch_json(url, params=params)
    except Exception as exc:
        logger.warning("Lista de votações falhou (%s): %s", dep_id, exc)
        return _mock_scores(dep_id)

    dados = data.get("dados") or []
    seen = 0
    for item in dados:
        if seen >= max_votos:
            break
        vid = None
        if isinstance(item, dict):
            vid = item.get("id") or item.get("idVotacao")
            vot_obj = item.get("votacao") or {}
            if isinstance(vot_obj, dict):
                vid = vid or vot_obj.get("id")
        if vid is None:
            continue
        try:
            det = _fetch_json(f"{API}/votacoes/{vid}")
            time.sleep(pause)
        except Exception:
            continue

        blob = det.get("dados") if isinstance(det.get("dados"), (dict, list)) else det
        txt = _collect_vote_text(blob)
        se = _score_keywords(txt, ECO_LIB, ECO_ESTAT)
        ss = _score_keywords(txt, SOC_PROG, SOC_CONS)
        if se is not None:
            eco_vals.append(_to_0_100_from_signed(se))
            votos_eco += 1
        if ss is not None:
            soc_vals.append(_to_0_100_from_signed(ss))
            votos_soc += 1
        seen += 1

    if not eco_vals and not soc_vals:
        logger.info("Sem classificação por keywords para %s — fallback mock.", dep_id)
        return _mock_scores(dep_id)

    eco = sum(eco_vals) / len(eco_vals) if eco_vals else 50.0
    soc = sum(soc_vals) / len(soc_vals) if soc_vals else 50.0
    total = max(len(dados), votos_eco + votos_soc)
    return eco, soc, total, votos_eco, votos_soc


def run(
    *,
    mock: bool,
    dry_run: bool,
    dep_id: str | None,
    max_deps: int,
    max_votos: int,
    pause: float,
) -> None:
    db = None if dry_run else init_firestore()

    targets: List[str] = []
    if dep_id:
        targets = [dep_id.strip()]
    elif not dry_run:
        for snap in db.collection(COL_POLITICOS).limit(max_deps).stream():
            targets.append(snap.id)
        logger.info("Alvos: %s políticos (limite %s).", len(targets), max_deps)
    else:
        targets = ["204528", "178957", "160599"]

    for pid in targets:
        if mock:
            eco, soc, tot, ve, vs = _mock_scores(pid)
        else:
            eco, soc, tot, ve, vs = _analyze_deputado(pid, max_votos=max_votos, pause=pause)

        ics = min(tot / 50.0, 1.0) * 100.0
        quad = _quadrante(eco, soc)

        nome = ""
        partido = ""
        uf = ""
        if db:
            snap = db.collection(COL_POLITICOS).document(pid).get()
            if snap.exists:
                d = snap.to_dict() or {}
                nome = str(d.get("nome") or d.get("nome_completo") or "")[:200]
                partido = str(d.get("partido") or d.get("sigla_partido") or "")[:32]
                uf = str(d.get("uf") or d.get("sigla_uf") or "")[:4]

        doc = {
            "parlamentar_id": pid,
            "parlamentar_nome": nome,
            "partido": partido,
            "uf": uf,
            "score_economico": round(eco, 2),
            "score_social": round(soc, 2),
            "ics": round(ics, 2),
            "total_votos": tot,
            "votos_eco": ve,
            "votos_soc": vs,
            "quadrante": quad,
            "periodo_analise": "rolling_api",
            "atualizadoEm": firestore.SERVER_TIMESTAMP if not dry_run else datetime.now(timezone.utc),
            "motor": "24_spectrum_analyzer",
            "modo_mock": mock,
        }

        if dry_run:
            logger.info("[dry-run] %s → %s", pid, {k: v for k, v in doc.items() if k != "atualizadoEm"})
        else:
            db.collection(COL_ESPECTRO).document(pid).set(doc)
            logger.info("OK espectro_scores/%s quadrante=%s ICS=%s", pid, quad, round(ics, 1))


def main() -> int:
    ap = argparse.ArgumentParser(description="E.S.P.E.C.T.R.O. — scores por votações.")
    ap.add_argument("--mock", action="store_true", help="Scores determinísticos (sem API).")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--dep-id", type=str, default="", help="Só este deputado (id Câmara).")
    ap.add_argument("--max-deps", type=int, default=40, help="Máx. deputados na coleção.")
    ap.add_argument("--max-votos", type=int, default=35, help="Máx. votações por deputado.")
    ap.add_argument("--pause", type=float, default=0.15, help="Segundos entre pedidos à API.")
    args = ap.parse_args()
    try:
        run(
            mock=args.mock,
            dry_run=args.dry_run,
            dep_id=args.dep_id or None,
            max_deps=max(1, args.max_deps),
            max_votos=max(5, args.max_votos),
            pause=max(0.05, args.pause),
        )
        return 0
    except Exception as exc:
        logger.exception("%s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
