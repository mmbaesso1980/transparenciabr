"""Geração de comunicações formais a partir dos templates Markdown."""
from __future__ import annotations

from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent


def _templates_dir() -> Path:
    return PACKAGE_DIR / "templates"


def render_retraction(kind: str, context: dict[str, str]) -> str:
    """kind ∈ {advogado, mp, jornalista}. context: keys como dossie_id, sha256, resumo_falha."""
    path = _templates_dir() / f"retratacao_{kind}.md"
    text = path.read_text(encoding="utf-8")
    for k, v in context.items():
        text = text.replace("{{" + k + "}}", v)
    return text


def render_postmortem_template(context: dict[str, str]) -> str:
    path = _templates_dir() / "postmortem_template.md"
    text = path.read_text(encoding="utf-8")
    for k, v in context.items():
        text = text.replace("{{" + k + "}}", v)
    return text
