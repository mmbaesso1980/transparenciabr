from __future__ import annotations

from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "incident_ci_pr_scan.sh"


def test_incident_ci_pr_scan_script_exists() -> None:
    assert _SCRIPT.is_file(), f"Missing {_SCRIPT}"


def test_script_excludes_test_fixture_paths() -> None:
    text = _SCRIPT.read_text(encoding="utf-8")
    assert "NÃO varrer fixtures" in text
    assert "bugs propositais" in text
    assert '[[ "$f" =~ ^tests/(.*/)?fixtures/ ]]' in text
    assert "should_skip_fixture" in text


def test_script_does_not_drop_legitimate_scan_roots() -> None:
    text = _SCRIPT.read_text(encoding="utf-8")
    assert "manus_office/*" in text
    assert "engines/dossie*" in text
    assert "frontend/*" in text
    assert "docs/*" in text


def test_script_uses_output_vs_source_scan_modes() -> None:
    text = _SCRIPT.read_text(encoding="utf-8")
    assert '--mode="$mode"' in text or "--mode=\"$mode\"" in text
    assert 'run_scan output' in text
    assert 'run_scan source' in text
    assert "*.py) PY_FILES" in text
