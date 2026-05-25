"""
Revisor Fonte Primária — AURORA Forensic v1.1

Verifica que cada finding referencia ao menos uma URL pública verificável
e não expõe identificadores de infraestrutura interna.

Regras (Princípio 10, skill v1.0):
  - fontes[] deve conter ≥1 URL que comece com http/https (não BQ)
  - Texto do finding NÃO deve mencionar termos de infraestrutura interna
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Termos de infraestrutura interna proibidos em texto público
_INTERNAL_TERMS: list[str] = [
    "BigQuery",
    "bigquery",
    "vw_",
    "fato_emenda_pagamento",
]

# Prefixo interno que nunca deve aparecer em fontes públicas
_INTERNAL_SOURCE_PREFIX = "transparenciabr.transparenciabr"

# Mapeamento de views internas → nome público adequado para citar
_SOURCE_MAPPING: dict[str, str] = {
    "vw_score_risco_completo": "Score AURORA · TransparênciaBR",
    "vw_emenda_parlamentar": "Portal da Transparência — Emendas Parlamentares",
    "vw_fornecedor_multi_parlamentar": "Portal da Transparência — Fornecedores",
    "vw_ceap_consolidado": "Portal da Transparência — CEAP",
    "fato_emenda_pagamento": "Portal da Transparência — Emendas Parlamentares",
    "fato_ceap_item": "Portal da Transparência — CEAP",
}

_URL_RE = re.compile(r"https?://[^\s\"'>]+", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _has_public_url(fontes: list[Any]) -> bool:
    """Retorna True se há ao menos uma URL pública em fontes."""
    for f in fontes:
        url = f if isinstance(f, str) else (f.get("url", "") if isinstance(f, dict) else "")
        if url.startswith(("http://", "https://")) and _INTERNAL_SOURCE_PREFIX not in url:
            return True
    return False


def _find_internal_terms(text: str) -> list[str]:
    """Retorna lista de termos internos encontrados no texto."""
    found: list[str] = []
    for term in _INTERNAL_TERMS:
        if term in text:
            found.append(term)
    return found


def _suggest_public_source(term: str) -> str:
    """Retorna nome público adequado para substituir referência interna."""
    for internal_key, public_name in _SOURCE_MAPPING.items():
        if internal_key in term:
            return public_name
    return "Portal da Transparência · CGU"


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """
    Analisa e corrige um finding, retornando (finding_corrigido, warnings).
    """
    warnings: list[str] = []
    f = dict(finding)  # cópia rasa

    # 1. Verificar fontes
    fontes = f.get("fontes", [])
    if not _has_public_url(fontes):
        warnings.append(
            f"[F-FONTE-001] Finding '{f.get('id', '?')}' não possui URL pública verificável em fontes[]."
        )

    # 2. Verificar termos internos no texto composto (titulo + fato + analise)
    full_text = " ".join(
        str(f.get(k, "")) for k in ("titulo", "fato", "analise", "contraditorio")
    )
    internal_found = _find_internal_terms(full_text)
    if internal_found:
        for term in internal_found:
            suggestion = _suggest_public_source(term)
            warnings.append(
                f"[F-FONTE-002] Finding '{f.get('id', '?')}' contém referência interna '{term}' "
                f"→ substituir por '{suggestion}'."
            )
        # Aplica substituição automática nos campos de texto
        for campo in ("titulo", "fato", "analise"):
            texto = str(f.get(campo, ""))
            for term in internal_found:
                public = _suggest_public_source(term)
                texto = texto.replace(term, public)
            f[campo] = texto

    return f, warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_fonte_primaria(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Recebe lista de findings e retorna resultado de revisão.

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

    if not all_warnings:
        status = "approved"
    elif len(all_warnings) > len(findings) // 2:
        status = "warnings"
    else:
        status = "warnings"

    return {
        "status": status,
        "warnings": all_warnings,
        "corrected_findings": corrected,
    }
