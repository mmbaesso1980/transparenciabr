"""
Configuração centralizada de logging para engines Python.

Substitui as ~25 chamadas duplicadas de ``logging.basicConfig(...)`` espalhadas
pelos scripts de engine.

Uso típico::

    from lib.setup_logging import setup_logging

    logger = setup_logging(__name__)
"""

from __future__ import annotations

import logging
import os

_CONFIGURED = False

LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"


def setup_logging(
    name: str | None = None,
    *,
    level: str | None = None,
    fmt: str = LOG_FORMAT,
) -> logging.Logger:
    """Configura ``basicConfig`` uma única vez e retorna um logger nomeado.

    Parameters
    ----------
    name:
        Nome do logger (normalmente ``__name__``).
    level:
        Nível de log (``"DEBUG"``, ``"INFO"``, …). Se omitido, lê de
        ``LOG_LEVEL`` no ambiente, caindo para ``"INFO"`` como padrão.
    fmt:
        Formato da mensagem de log.
    """
    global _CONFIGURED
    resolved_level = (level or os.environ.get("LOG_LEVEL", "INFO")).upper()
    if not _CONFIGURED:
        logging.basicConfig(level=resolved_level, format=fmt)
        _CONFIGURED = True
    return logging.getLogger(name)
