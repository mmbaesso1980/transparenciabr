"""Unit tests for engines.incident.retratacao — template rendering."""
from __future__ import annotations

import pytest

from engines.incident.retratacao import render_postmortem_template, render_retraction


@pytest.mark.parametrize("kind", ["advogado", "mp", "jornalista"])
def test_render_retraction_replaces_placeholders(kind):
    context = {
        "dossie_id": "DOSSIE-TEST-001",
        "sha256": "abc123deadbeef",
        "resumo_falha": "Detecção de PII não redatada",
    }
    result = render_retraction(kind, context)
    assert "DOSSIE-TEST-001" in result
    assert "abc123deadbeef" in result
    assert "Detecção de PII não redatada" in result
    assert "{{dossie_id}}" not in result
    assert "{{sha256}}" not in result
    assert "{{resumo_falha}}" not in result


def test_render_retraction_missing_placeholder_preserved():
    context = {"dossie_id": "D-999"}
    result = render_retraction("advogado", context)
    assert "D-999" in result
    # Placeholders not in context remain as-is
    assert "{{sha256}}" in result


def test_render_postmortem_template_replaces_all():
    context = {
        "incident_id": "INC-100",
        "dossie_id": "DOSSIE-200",
        "severity": "CRITICAL",
        "timeline": "T0: detecção\nT1: contenção",
        "five_whys": "1. Modelo não filtrou PII",
        "acoes": "Adicionar regex para CPF",
        "owner": "eng-team",
        "prazo": "2025-05-15",
    }
    result = render_postmortem_template(context)
    assert "INC-100" in result
    assert "DOSSIE-200" in result
    assert "CRITICAL" in result
    assert "T0: detecção" in result
    assert "{{incident_id}}" not in result
    assert "{{severity}}" not in result


def test_render_postmortem_template_partial_context():
    context = {"incident_id": "INC-50", "severity": "HIGH"}
    result = render_postmortem_template(context)
    assert "INC-50" in result
    assert "HIGH" in result
    # Unreplaced placeholders remain
    assert "{{dossie_id}}" in result
