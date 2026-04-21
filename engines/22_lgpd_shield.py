"""
Motor 22 — LGPD Shield (Pipeline I.R.O.N.M.A.N.)
Redige hashes SHA-256 para padrões de PII acidental em texto plano (CPF / e-mail).
Execução: python engines/22_lgpd_shield.py [--dry-run] [--input-file path.txt]
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def redact_text(text: str) -> tuple[str, int]:
    """Substitui PII por marcadores; devolve (novo_texto, ocorrências)."""
    n = 0
    out = text

    def _cpf_sub(m: re.Match[str]) -> str:
        nonlocal n
        n += 1
        return f"[CPF_SHA256:{_sha256_hex(m.group(0))}]"

    def _em_sub(m: re.Match[str]) -> str:
        nonlocal n
        n += 1
        return f"[EMAIL_SHA256:{_sha256_hex(m.group(0).lower())}]"

    out = CPF_RE.sub(_cpf_sub, out)
    out = EMAIL_RE.sub(_em_sub, out)
    return out, n


def main() -> int:
    ap = argparse.ArgumentParser(description="LGPD Shield — anonimização local de PII.")
    ap.add_argument("--dry-run", action="store_true", help="Conta ocorrências sem gravar.")
    ap.add_argument(
        "--input-file",
        type=str,
        default="",
        help="Ficheiro UTF-8 a processar (stdin se omitido em modo futuro).",
    )
    args = ap.parse_args()

    if args.input_file:
        path = Path(args.input_file)
        if not path.is_file():
            logger.error("Ficheiro não encontrado: %s", path)
            return 1
        raw = path.read_text(encoding="utf-8", errors="replace")
        new, hits = redact_text(raw)
        logger.info("PII substituídas: %s", hits)
        if args.dry_run:
            logger.info("[dry-run] pré-visualização (primeiros 400 chars):\n%s", new[:400])
            return 0
        path.write_text(new, encoding="utf-8")
        logger.info("Ficheiro atualizado: %s", path)
        return 0

    logger.info(
        "Modo pipeline: integre em CI para varrer exports JSON/CSV antes do BigQuery. "
        "Use --input-file ou estenda este script para Firestore Admin SDK."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
