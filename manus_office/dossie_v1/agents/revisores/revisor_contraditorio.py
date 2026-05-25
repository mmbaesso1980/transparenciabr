"""
Revisor Contraditório — AURORA Forensic v1.1

Para findings de severidade CRÍTICA, ALTA ou MÉDIA, verifica que o campo
`contraditorio` contém as 3 partes obrigatórias do template:

  Parte 1 — Decisão judicial (ou "Não foi localizada...")
  Parte 2 — Manifestação pública (ou "Não foi localizada...")
  Parte 3 — Direito de resposta institucional (sempre presente)

Emite warning se qualquer parte estiver ausente. Não substitui automaticamente —
exige revisão humana.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Severidades que exigem template completo
_SEVERIDADES_OBRIGATORIAS = {"CRÍTICA", "CRITICA", "ALTA", "MÉDIA", "MEDIA"}

# Marcadores de cada parte (substrings que indicam presença)
_PARTE1_MARKERS = [
    "decisão judicial",
    "decisao judicial",
    "não foi localizada",
    "nao foi localizada",
    "sem registro judicial",
    "Não foi localizada",
]

_PARTE2_MARKERS = [
    "manifestação pública",
    "manifestacao publica",
    "não foi localizada",
    "nao foi localizada",
    "sem manifestação",
    "Não foi localizada",
    "nota pública",
    "nota publica",
    "declaração pública",
    "declaracao publica",
]

_PARTE3_MARKERS = [
    "direito de resposta",
    "assegurado o direito",
    "possibilidade de manifestação",
    "possibilidade de manifestacao",
    "pode se manifestar",
    "pode manifestar-se",
    "convidado a manifestar",
]

# Template padrão para cada parte quando ausente
_TEMPLATE_PARTE1 = (
    "Parte 1 — Decisão judicial: Não foi localizada decisão judicial definitiva "
    "relacionada ao presente finding até a data de emissão deste dossiê."
)
_TEMPLATE_PARTE2 = (
    "Parte 2 — Manifestação pública: Não foi localizada manifestação pública "
    "do parlamentar ou assessoria referente a este finding até a data de emissão."
)
_TEMPLATE_PARTE3 = (
    "Parte 3 — Direito de resposta: O parlamentar tem assegurado o direito de "
    "resposta e manifestação institucional sobre os apontamentos deste dossiê, "
    "podendo encaminhar réplica ao canal oficial da plataforma TransparênciaBR."
)


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _has_parte(texto: str, markers: list[str]) -> bool:
    texto_lower = texto.lower()
    return any(m.lower() in texto_lower for m in markers)


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Verifica e corrige o campo contraditorio de um finding."""
    all_warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")
    sev = str(f.get("severidade", "")).upper()

    # Apenas findings de severidade ≥ MÉDIA exigem template completo
    if sev not in _SEVERIDADES_OBRIGATORIAS:
        return f, []

    contraditorio = str(f.get("contraditorio", ""))

    missing_parts: list[str] = []
    suggestions: list[str] = []

    if not _has_parte(contraditorio, _PARTE1_MARKERS):
        missing_parts.append("Parte 1 (Decisão judicial)")
        suggestions.append(_TEMPLATE_PARTE1)

    if not _has_parte(contraditorio, _PARTE2_MARKERS):
        missing_parts.append("Parte 2 (Manifestação pública)")
        suggestions.append(_TEMPLATE_PARTE2)

    if not _has_parte(contraditorio, _PARTE3_MARKERS):
        missing_parts.append("Parte 3 (Direito de resposta)")
        suggestions.append(_TEMPLATE_PARTE3)

    if missing_parts:
        all_warnings.append(
            f"[F-CONTRA-001] Finding '{fid}' (severidade {sev}) está com contraditório incompleto. "
            f"Partes ausentes: {', '.join(missing_parts)}."
        )
        # Acrescenta as partes ausentes ao contraditório existente
        extra = "\n\n".join(suggestions)
        if contraditorio.strip():
            f["contraditorio"] = contraditorio.strip() + "\n\n" + extra
        else:
            f["contraditorio"] = extra

    return f, all_warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_contraditorio(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Verifica template 3-partes nos findings de severidade ≥ MÉDIA.

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
