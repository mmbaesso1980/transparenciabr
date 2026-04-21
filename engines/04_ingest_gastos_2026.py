#!/usr/bin/env python3
"""
Ingestão de gastos 2026 — placeholder incremental.

Extende o pipeline quando o contrato de fonte (Portal / BigQuery) estiver fixado.
"""

import logging
import sys

logger = logging.getLogger(__name__)


def run_gastos_2026() -> int:
    logger.info(
        "04_ingest_gastos_2026 — stub de rotina 2026 (sem I/O externo nesta fase)."
    )
    return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return run_gastos_2026()


if __name__ == "__main__":
    sys.exit(main())
