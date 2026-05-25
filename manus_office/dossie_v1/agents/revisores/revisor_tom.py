"""
Revisor Tom — AURORA Forensic v1.1

Verifica que nenhum finding contém verbos ou adjetivos acusatórios diretos
(blocklist v1.0). Sugere substituições informativas.

Tom esperado: INFORMATIVO, não acusatório. Verbos proibidos levam a
formulações compatíveis com a tipologia forense.
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Blocklist v1.0 — verbos/adjetivos proibidos
# ---------------------------------------------------------------------------

# ATENÇÃO: estes termos são referenciados APENAS para detecção/substituição;
# nunca devem aparecer em output público.
_BLOCKLIST: list[tuple[str, str]] = [
    # (padrão regex, sugestão de substituição)
    (r"\bfraudou\b", "registra padrão estatisticamente anômalo compatível com fraude"),
    (r"\bdesviou\b", "apresenta movimentação financeira com desvio estatístico significativo"),
    (r"\broubou\b", "é apontado em ocorrência investigativa de subtração patrimonial"),
    (r"\bcorrupto\b", "possui indicadores de risco de integridade elevados"),
    (r"\bladr[aã]o\b", "figura em investigação por enriquecimento ilícito suspeito"),
    (r"\bcriminoso\b", "é objeto de apuração em processo investigativo"),
    (r"\bprova de crime\b", "indício documentado objeto de apuração"),
    # variantes comuns
    (r"\bdesviaram\b", "registraram movimentação financeira com desvio estatístico"),
    (r"\bfraudaram\b", "registraram padrão estatisticamente anômalo"),
    (r"\bcorruptos\b", "com indicadores de risco de integridade elevados"),
]

# Compilar regex para eficiência
_COMPILED: list[tuple[re.Pattern[str], str]] = [
    (re.compile(pattern, re.IGNORECASE), replacement)
    for pattern, replacement in _BLOCKLIST
]


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _check_and_fix_text(text: str, finding_id: str, campo: str) -> tuple[str, list[str]]:
    """Verifica e corrige um bloco de texto. Retorna (texto_corrigido, warnings)."""
    warnings: list[str] = []
    corrected = text

    for pattern, suggestion in _COMPILED:
        match = pattern.search(corrected)
        if match:
            found_term = match.group(0)
            warnings.append(
                f"[F-TOM-001] Finding '{finding_id}' campo '{campo}' "
                f"contém termo acusatório '{found_term}' → sugerido: '{suggestion}'."
            )
            corrected = pattern.sub(suggestion, corrected)

    return corrected, warnings


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Verifica e corrige um finding. Retorna (finding_corrigido, warnings)."""
    all_warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")

    for campo in ("titulo", "fato", "analise", "contraditorio"):
        if campo in f and f[campo]:
            corrected_text, warns = _check_and_fix_text(str(f[campo]), fid, campo)
            f[campo] = corrected_text
            all_warnings.extend(warns)

    return f, all_warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_tom(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Verifica blocklist de tom acusatório e sugere/aplica substituições.

    Retorna:
        {
            "status": "approved" | "warnings" | "rejected",
            "warnings": [...],
            "corrected_findings": [...]
        }
    """
    all_warnings: list[str] = []
    corrected: list[dict[str, Any]] = []

    for finding in findings:
        f_corr, warns = _correct_finding(finding)
        all_warnings.extend(warns)
        corrected.append(f_corr)

    status = "approved" if not all_warnings else "warnings"

    return {
        "status": status,
        "warnings": all_warnings,
        "corrected_findings": corrected,
    }
