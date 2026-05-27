from __future__ import annotations

import pytest

from engines.incident.contention import blocks_publication


@pytest.mark.parametrize(
    "sev,expect",
    [
        ("LOW", False),
        ("MEDIUM", False),
        ("HIGH", True),
        ("CRITICAL", True),
    ],
)
def test_blocks_publication(sev, expect):
    assert blocks_publication(sev) is expect
