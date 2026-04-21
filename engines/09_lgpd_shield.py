#!/usr/bin/env python3
"""
Motor 09 — Escudo LGPD (ofuscação de CPF em Diários Oficiais).

Percorre a coleção Firestore ``diarios_atos``, detecta CPF no formato
``000.000.000-00`` e substitui por máscara ou por etiqueta SHA-256 parcial,
gravando de volta os documentos (Admin SDK).

Execução:
  python engines/09_lgpd_shield.py [--dry-run] [--hash] [--limit N]
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
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

COLLECTION = "diarios_atos"

# Formato típico em publicações oficiais (prioridade pedida na especificação)
CPF_FORMATTED = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}")

MASK_LITERAL = "***.***.***-**"


def _sha256_partial(raw: str, prefix_len: int = 16) -> str:
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"[CPF_SHA256:{h[:prefix_len]}…]"


def redact_string(s: str, *, use_hash: bool) -> Tuple[str, int]:
    """Substitui todas as ocorrências de CPF formatado em uma string."""

    def _repl(m: re.Match[str]) -> str:
        return _sha256_partial(m.group(0)) if use_hash else MASK_LITERAL

    out, n = CPF_FORMATTED.subn(_repl, s)
    return out, n


def redact_value(value: Any, *, use_hash: bool) -> Tuple[Any, int]:
    """Percorre recursivamente dict/list e devolve cópia com strings redigidas."""
    total = 0
    if isinstance(value, str):
        new_s, n = redact_string(value, use_hash=use_hash)
        return new_s, n
    if isinstance(value, list):
        out_list: List[Any] = []
        for item in value:
            new_item, n = redact_value(item, use_hash=use_hash)
            total += n
            out_list.append(new_item)
        return out_list, total
    if isinstance(value, dict):
        out_dict: Dict[str, Any] = {}
        for k, v in value.items():
            new_v, n = redact_value(v, use_hash=use_hash)
            total += n
            out_dict[k] = new_v
        return out_dict, total
    return value, 0


def run(*, dry_run: bool, use_hash: bool, limit: int | None) -> int:
    db = init_firestore()
    col = db.collection(COLLECTION)

    processed = 0
    updated_docs = 0
    total_cpfs = 0

    query = col.stream()
    batch = db.batch()
    ops_in_batch = 0

    for snap in query:
        if limit is not None and processed >= limit:
            break
        processed += 1
        data = snap.to_dict() or {}
        new_data, n_cpfs = redact_value(dict(data), use_hash=use_hash)
        if n_cpfs == 0:
            continue

        total_cpfs += n_cpfs
        new_data["lgpd_cpf_redacted_at"] = firestore.SERVER_TIMESTAMP
        new_data["lgpd_redaction_mode"] = "sha256_partial" if use_hash else "mask"

        if dry_run:
            logger.info(
                "[dry-run] %s — %s CPF(s) — keys tocadas",
                snap.id,
                n_cpfs,
            )
            updated_docs += 1
            continue

        batch.update(snap.reference, new_data)
        ops_in_batch += 1
        updated_docs += 1

        if ops_in_batch >= 450:
            batch.commit()
            batch = db.batch()
            ops_in_batch = 0
            logger.info("Commit parcial (450 ops)…")

    if not dry_run and ops_in_batch > 0:
        batch.commit()

    logger.info(
        "Concluído — documentos lidos=%s, atualizados=%s, substituições CPF=%s (dry_run=%s).",
        processed,
        updated_docs,
        total_cpfs,
        dry_run,
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="LGPD Shield — ofusca CPF em diarios_atos (Firestore).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Apenas regista o que seria alterado (não grava).",
    )
    ap.add_argument(
        "--hash",
        action="store_true",
        dest="use_hash",
        help="Usar etiqueta SHA-256 parcial em vez da máscara ***.***.***-**.",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Processar no máximo N documentos (teste).",
    )
    args = ap.parse_args()

    try:
        return run(
            dry_run=args.dry_run,
            use_hash=bool(args.use_hash),
            limit=args.limit,
        )
    except Exception as exc:
        logger.exception("Falha no motor 09: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
