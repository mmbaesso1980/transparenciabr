"""M11 — protocolo de incidente: detecção, triagem, contenção, templates."""

from .contention import blocks_publication
from .detector import SentinelHit, load_sentinels_config, scan_text
from .triage import triage_hit, triage_hits

__all__ = [
    "SentinelHit",
    "blocks_publication",
    "load_sentinels_config",
    "scan_text",
    "triage_hit",
    "triage_hits",
]
