"""
AURORA Forensic v1.1 — Pacote de Agentes Revisores

Exporta os 6 revisores especializados e a função orquestradora
`run_all_reviewers` que os executa em paralelo via asyncio.

Revisores:
  - revisor_fonte_primaria  : garante URLs públicas em fontes[]
  - revisor_tom             : blocklist v1.0 (verbos acusatórios)
  - revisor_contraditorio   : template 3-partes em findings ≥ MÉDIA
  - revisor_falso_positivo  : regras FP-BANCADA + CONTRATO_RECORRENTE (v1.1)
  - revisor_mascara_pii     : CPF mascarado + bloqueio Classe C (LGPD)
  - revisor_severidade      : cap MÉDIA com prerrogativa legal

Uso:
    from dossie_v1.agents.revisores import run_all_reviewers
    results = asyncio.run(run_all_reviewers("findings.json", "nome-slug"))
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from .revisor_contraditorio import revisar_contraditorio
from .revisor_falso_positivo import revisar_falso_positivo
from .revisor_fonte_primaria import revisar_fonte_primaria
from .revisor_mascara_pii import revisar_mascara_pii
from .revisor_severidade import revisar_severidade
from .revisor_tom import revisar_tom

__all__ = [
    "revisar_fonte_primaria",
    "revisar_tom",
    "revisar_contraditorio",
    "revisar_falso_positivo",
    "revisar_mascara_pii",
    "revisar_severidade",
    "run_all_reviewers",
    "REVISORES",
]

# Registro ordenado dos revisores: (id, função revisora)
REVISORES: list[tuple[str, Any]] = [
    ("revisor_fonte_primaria", revisar_fonte_primaria),
    ("revisor_tom", revisar_tom),
    ("revisor_contraditorio", revisar_contraditorio),
    ("revisor_falso_positivo", revisar_falso_positivo),
    ("revisor_mascara_pii", revisar_mascara_pii),
    ("revisor_severidade", revisar_severidade),
]


async def _run_revisor(
    revisor_id: str,
    revisor_fn: Any,
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Executa um revisor de forma assíncrona (usando executor para não bloquear
    o loop quando as funções revisoras forem síncronas).
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, revisor_fn, findings)
    return {"revisor_id": revisor_id, **result}


async def run_all_reviewers(
    findings_path: str | Path,
    slug: str,
) -> dict[str, Any]:
    """
    Executa todos os 6 revisores em paralelo sobre os findings do dossiê.

    Args:
        findings_path: Caminho para o arquivo findings.json produzido pelo Maestro.
        slug: Identificador do dossiê (usado para logging).

    Returns:
        {
            "status": "approved" | "warnings" | "rejected",
            "warnings": [...],           # warnings agregados de todos os revisores
            "corrected_findings": [...], # findings após todas as correções aplicadas
            "revisor_results": {         # resultado individual de cada revisor
                "revisor_fonte_primaria": {...},
                ...
            }
        }
    """
    findings_path = Path(findings_path)

    # Carrega findings do arquivo ou objeto JSON
    if findings_path.is_file():
        raw = json.loads(findings_path.read_text(encoding="utf-8"))
        # Suporta tanto lista direta quanto objeto {findings: [...]}
        if isinstance(raw, list):
            findings: list[dict[str, Any]] = raw
        elif isinstance(raw, dict) and "findings" in raw:
            findings = raw["findings"]
        else:
            findings = []
    else:
        raise FileNotFoundError(f"findings.json não encontrado: {findings_path}")

    # Executa todos os revisores em paralelo
    tasks = [
        _run_revisor(revisor_id, revisor_fn, findings)
        for revisor_id, revisor_fn in REVISORES
    ]
    results_list: list[dict[str, Any]] = await asyncio.gather(*tasks)

    # Agrega resultados — aplica correções em pipeline sequencial
    # (cada revisor recebe os findings já corrigidos pelo anterior)
    current_findings = list(findings)
    all_warnings: list[str] = []
    revisor_results: dict[str, dict[str, Any]] = {}
    overall_status = "approved"

    # Re-executa em pipeline para aplicar correções encadeadas
    for revisor_id, revisor_fn in REVISORES:
        result = revisor_fn(current_findings)
        revisor_results[revisor_id] = result

        if result["warnings"]:
            all_warnings.extend(result["warnings"])
            if overall_status == "approved":
                overall_status = "warnings"

        if result.get("corrected_findings"):
            current_findings = result["corrected_findings"]

        if result["status"] == "rejected":
            overall_status = "rejected"

    return {
        "status": overall_status,
        "warnings": all_warnings,
        "corrected_findings": current_findings,
        "revisor_results": revisor_results,
        "slug": slug,
    }
