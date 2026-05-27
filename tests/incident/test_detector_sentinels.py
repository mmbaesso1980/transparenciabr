from __future__ import annotations

import json
from pathlib import Path

import pytest

from engines.incident.detector import SentinelHit, load_sentinels_config, scan_text

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def _slugs(hits: list[SentinelHit]) -> set[str]:
    return {h.slug for h in hits}


@pytest.fixture
def cfg():
    return load_sentinels_config()


def test_detect_none_literal(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    hits = scan_text("O processo None no tribunal.", cfg)
    assert "struct_none" in _slugs(hits)


def test_struct_none_suppressed_in_python_source(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    py_snippet = "def foo(x=None):\n    if x is None:\n        return None\n"
    hits = scan_text(py_snippet, cfg, mode="source")
    assert "struct_none" not in _slugs(hits)
    assert "struct_null" not in _slugs(hits)
    hits_output = scan_text("O processo None no tribunal.", cfg, mode="output")
    assert "struct_none" in _slugs(hits_output)


def test_detect_qmark_field_not_in_contradictorio(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    hits = scan_text('Campo JSON: ?, fim.', cfg)
    assert "struct_qmark_field" in _slugs(hits)


def test_detect_codename_aurora(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    hits = scan_text("Referência interna motor AURORA 360.", cfg)
    assert "codename_aurora_360" in _slugs(hits)


def test_detect_blocklist_fraude(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    hits = scan_text("Texto com palavra fraude isolada.", cfg)
    assert "blocklist_fraude" in _slugs(hits)


def test_detect_operator_token_from_env(cfg):
    hits = scan_text("Conta do solicitante: OPERADOR_SINTETICO_TESTE_001 para teste.", cfg)
    assert "operator_pii" in _slugs(hits)


def test_qmark_suppressed_inside_contradictorio_table(cfg, monkeypatch):
    monkeypatch.delenv("TBR_OPERATOR_PII_TOKENS", raising=False)
    text = "## Contraditório\n\n| ? | ok |\n"
    hits = scan_text(text, cfg)
    assert "struct_qmark_bullet" not in _slugs(hits)


def test_golden_paulo_fixture_has_expected_classes(cfg):
    data = json.loads((FIXTURE_DIR / "dossie_paulo_octavio_v23_redacted.json").read_text(encoding="utf-8"))
    hits = scan_text(data["body"], cfg)
    slugs = _slugs(hits)
    assert "struct_none" in slugs
    assert "codename_aurora_360" in slugs
    assert "blocklist_fraude" in slugs
    assert "operator_pii" in slugs
