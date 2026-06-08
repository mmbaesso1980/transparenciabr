"""Unit tests for engines.incident.__main__ — CLI scan."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from engines.incident.__main__ import main


def test_main_no_files_returns_zero():
    assert main([]) == 0


def test_main_clean_text_returns_zero():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write("This is perfectly clean text with no issues.\n")
        f.flush()
        result = main([f.name])
    assert result == 0


def test_main_high_severity_returns_one():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write("O deputado fraudou o sistema público.\n")
        f.flush()
        result = main([f.name])
    assert result == 1


def test_main_struct_nan_medium_does_not_block():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write("O valor retornado foi NaN no campo patrimônio.\n")
        f.flush()
        result = main([f.name])
    # struct_nan is MEDIUM severity — does not block publication
    assert result == 0


def test_main_json_file_extracts_body():
    data = {"body": "Este é o conteúdo limpo do dossiê."}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        f.flush()
        result = main([f.name])
    assert result == 0


def test_main_json_file_with_blocklist_in_body():
    data = {"body": "O senador roubou fundos públicos comprovadamente."}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        f.flush()
        result = main([f.name])
    assert result == 1


def test_main_missing_file_skipped():
    result = main(["/tmp/nonexistent_file_abc123.md"])
    assert result == 0


def test_main_source_mode_skips_struct():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write("x = None\ny = null\n")
        f.flush()
        result = main(["--mode", "source", f.name])
    assert result == 0
