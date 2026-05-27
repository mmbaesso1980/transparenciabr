"""Varredura de sentinelas em texto de dossiê (MD, JSON, texto extraído de PDF).

Runtime: lê apenas ``sentinels.json`` (gerado a partir de ``sentinels.yaml``).
Tokens de operador: variável de ambiente ``TBR_OPERATOR_PII_TOKENS`` (separador ``|``).
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ScanMode = Literal["output", "source"]

from engines.sanitization.env_tokens import operator_tokens_from_env

PACKAGE_DIR = Path(__file__).resolve().parent

# Três padrões fechados para "?" literal de pipeline (não perguntas naturais).
_QMARK_FIELD = re.compile(r":\s*\?(?=\s*[,}\]\)]|$)")
_QMARK_INLINE = re.compile(r"`\?`")
_QMARK_BULLET = re.compile(r"\|\s*\?\s*\|")

_CONTRA_SECTION_START = re.compile(
    r"(?mi)^##\s+[^\n]*contradit[oó]rio[^\n]*\s*$",
)
_NEXT_SECTION_HEADER = re.compile(r"(?mi)^##\s+", re.MULTILINE)

_STRUCTURAL = [
    ("STRUCT_NONE", re.compile(r"\bNone\b")),
    ("STRUCT_NULL", re.compile(r"\bnull\b", re.IGNORECASE)),
    ("STRUCT_UNDEFINED", re.compile(r"\bundefined\b", re.IGNORECASE)),
    ("STRUCT_NAN", re.compile(r"\bNaN\b")),
    ("STRUCT_OBJ", re.compile(r"\[object Object\]", re.IGNORECASE)),
]


def slugify(value: str) -> str:
    s = unicodedata.normalize("NFKD", value)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


@dataclass(frozen=True)
class SentinelHit:
    code: str
    slug: str
    detail: str
    start: int | None
    end: int | None


def normalize_text(raw: str) -> str:
    return unicodedata.normalize("NFC", raw)


def contradictorio_spans(text: str) -> list[tuple[int, int]]:
    """Intervalos [start, end) do corpo da secção **Contraditório** (markdown)."""
    spans: list[tuple[int, int]] = []
    for m in _CONTRA_SECTION_START.finditer(text):
        line_end = text.find("\n", m.start())
        if line_end < 0:
            body_start = m.end()
        else:
            body_start = line_end + 1
        m2 = _NEXT_SECTION_HEADER.search(text, body_start)
        end = m2.start() if m2 else len(text)
        spans.append((m.start(), end))
    return spans


def _in_any_span(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(a <= pos < b for a, b in spans)


def allow_question_ctx(text: str, start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    """True se o hit de ``?`` deve ser suprimido (pergunta natural no contraditório)."""
    mid = (start + end) // 2
    return _in_any_span(mid, spans)


def load_sentinels_config(path: Path | None = None) -> dict[str, Any]:
    cfg_path = path or (PACKAGE_DIR / "sentinels.json")
    return json.loads(cfg_path.read_text(encoding="utf-8"))


_TOM_VERB_SLUGS = frozenset(
    {
        "blocklist_fraudou",
        "blocklist_desviou",
        "blocklist_roubou",
        "blocklist_corrupto",
    }
)


def tom_blocklist_words(cfg: dict[str, Any] | None = None) -> tuple[str, ...]:
    """Subconjunto da blocklist M11 usado na validação de tom (sem literais no caller)."""
    cfg = cfg or load_sentinels_config()
    words: list[str] = []
    for word in cfg.get("blocklist") or []:
        if f"blocklist_{slugify(str(word))}" in _TOM_VERB_SLUGS:
            words.append(str(word))
    return tuple(words)


def scan_text(
    text: str,
    cfg: dict[str, Any] | None = None,
    *,
    mode: ScanMode = "output",
) -> list[SentinelHit]:
    """Varre texto; ``mode=source`` omite struct_* sintáticas (None/null em código Python)."""
    cfg = cfg or load_sentinels_config()
    t = normalize_text(text)
    hits: list[SentinelHit] = []
    contra = contradictorio_spans(t)

    if mode == "output":
        for code, rx in _STRUCTURAL:
            slug = slugify(code.replace("STRUCT_", "struct_"))
            for m in rx.finditer(t):
                hits.append(SentinelHit(code, slug, m.group(0), m.start(), m.end()))

    for m in _QMARK_FIELD.finditer(t):
        if allow_question_ctx(t, m.start(), m.end(), contra):
            continue
        hits.append(
            SentinelHit("STRUCT_QMARK_FIELD", "struct_qmark_field", m.group(0), m.start(), m.end())
        )
    for m in _QMARK_INLINE.finditer(t):
        if allow_question_ctx(t, m.start(), m.end(), contra):
            continue
        hits.append(
            SentinelHit("STRUCT_QMARK_INLINE", "struct_qmark_inline", m.group(0), m.start(), m.end())
        )
    for m in _QMARK_BULLET.finditer(t):
        if allow_question_ctx(t, m.start(), m.end(), contra):
            continue
        hits.append(
            SentinelHit("STRUCT_QMARK_BULLET", "struct_qmark_bullet", m.group(0), m.start(), m.end())
        )

    seen_codename: set[str] = set()
    for phrase in cfg.get("codenames", []) or []:
        if not phrase:
            continue
        slug_part = slugify(str(phrase))
        slug = f"codename_{slug_part}"
        if slug in seen_codename:
            continue
        seen_codename.add(slug)
        rx = re.compile(re.escape(str(phrase)), re.IGNORECASE)
        for m in rx.finditer(t):
            hits.append(SentinelHit("CODENAME", slug, m.group(0), m.start(), m.end()))

    seen_block: set[str] = set()
    for word in cfg.get("blocklist", []) or []:
        if not word:
            continue
        slug_part = slugify(str(word))
        slug = f"blocklist_{slug_part}"
        if slug in seen_block:
            continue
        seen_block.add(slug)
        rx = re.compile(rf"\b{re.escape(str(word))}\b", re.IGNORECASE)
        for m in rx.finditer(t):
            hits.append(SentinelHit("BLOCKLIST", slug, m.group(0), m.start(), m.end()))

    low = t.casefold()
    for token in operator_tokens_from_env():
        needle = token.casefold()
        start = 0
        while True:
            i = low.find(needle, start)
            if i < 0:
                break
            raw = t[i : i + len(needle)]
            hits.append(SentinelHit("OPERATOR_PII", "operator_pii", raw, i, i + len(needle)))
            start = i + 1

    return hits


def scan_file(
    path: Path,
    cfg: dict[str, Any] | None = None,
    *,
    mode: ScanMode = "output",
) -> list[SentinelHit]:
    text = path.read_text(encoding="utf-8", errors="replace")
    return scan_text(text, cfg, mode=mode)
