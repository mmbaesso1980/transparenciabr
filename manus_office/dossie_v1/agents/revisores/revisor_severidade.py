"""
Revisor Severidade — AURORA Forensic v1.1

Aplica caps de severidade quando o campo contraditório evidencia:
  - Decisão judicial favorável ao parlamentar → cap MÉDIA
  - Prerrogativa legal ou decisão administrativa válida → cap MÉDIA

Também verifica se a distribuição do dossiê está dentro dos limites saudáveis:
  10-15 CRÍTICA / 15-20 ALTA / 12-16 MÉDIA / 8-12 INFO
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

SEV_CRITICA = "CRÍTICA"
SEV_ALTA = "ALTA"
SEV_MEDIA = "MÉDIA"
SEV_INFO = "INFORMATIVO"

_SEV_ORDER = {SEV_CRITICA: 4, "CRITICA": 4, SEV_ALTA: 3, SEV_MEDIA: 2, "MEDIA": 2, SEV_INFO: 1}

# Distribuição saudável esperada
_DIST_SAUDAVEL = {
    SEV_CRITICA: (10, 15),
    SEV_ALTA: (15, 20),
    SEV_MEDIA: (12, 16),
    SEV_INFO: (8, 12),
}

# Marcadores no campo contraditório que acionam cap MÉDIA
_DECISAO_FAVORAVEL_MARKERS = [
    "decisão judicial favorável",
    "decisao judicial favoravel",
    "absolvido",
    "arquivado",
    "trânsito em julgado favorável",
    "transito em julgado favoravel",
    "sentença absolutória",
    "sentenca absolutoria",
    "habeas corpus deferido",
]

_PRERROGATIVA_MARKERS = [
    "prerrogativa legal",
    "decisão administrativa válida",
    "decisao administrativa valida",
    "ato administrativo regular",
    "autorizado por lei",
    "amparado por lei",
    "licitude reconhecida",
    "legal pelo tribunal",
    "legalidade reconhecida",
]


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _should_cap_to_media(contraditorio: str) -> tuple[bool, str]:
    """
    Verifica se o contraditório justifica cap em MÉDIA.
    Retorna (deve_capear, motivo).
    """
    texto_lower = contraditorio.lower()

    for marker in _DECISAO_FAVORAVEL_MARKERS:
        if marker.lower() in texto_lower:
            return True, f"decisão judicial favorável detectada ('{marker}')"

    for marker in _PRERROGATIVA_MARKERS:
        if marker.lower() in texto_lower:
            return True, f"prerrogativa legal detectada ('{marker}')"

    return False, ""


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Aplica cap de severidade se necessário."""
    all_warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")
    sev = str(f.get("severidade", "")).upper().strip()

    # Apenas CRÍTICA e ALTA podem ser capadas
    if sev not in ("CRÍTICA", "CRITICA", "ALTA"):
        return f, []

    contraditorio = str(f.get("contraditorio", ""))
    should_cap, motivo = _should_cap_to_media(contraditorio)

    if should_cap:
        old_sev = f["severidade"]
        f["severidade"] = SEV_MEDIA
        f["reclassified"] = True
        f["_reclassificacao_motivo"] = "CAP-SEVERIDADE-MEDIA"
        f["_reclassificacao_nota"] = (
            f"Severidade reduzida automaticamente de {old_sev} para {SEV_MEDIA}: {motivo}."
        )
        all_warnings.append(
            f"[F-SEV-001] Finding '{fid}' severidade reduzida de '{old_sev}' para '{SEV_MEDIA}': {motivo}."
        )

    return f, all_warnings


def _check_distribuicao(findings: list[dict[str, Any]]) -> list[str]:
    """Verifica se a distribuição de severidades está dentro dos limites saudáveis."""
    warnings: list[str] = []
    contagem: dict[str, int] = {SEV_CRITICA: 0, SEV_ALTA: 0, SEV_MEDIA: 0, SEV_INFO: 0}

    for f in findings:
        sev = str(f.get("severidade", "")).strip().upper()
        if sev in ("CRÍTICA", "CRITICA"):
            contagem[SEV_CRITICA] += 1
        elif sev == "ALTA":
            contagem[SEV_ALTA] += 1
        elif sev in ("MÉDIA", "MEDIA"):
            contagem[SEV_MEDIA] += 1
        else:
            contagem[SEV_INFO] += 1

    for sev_key, (min_val, max_val) in _DIST_SAUDAVEL.items():
        count = contagem.get(sev_key, 0)
        if count < min_val or count > max_val:
            warnings.append(
                f"[F-SEV-002] Distribuição de severidade fora do intervalo saudável: "
                f"{sev_key}={count} (esperado: {min_val}–{max_val})."
            )

    return warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_severidade(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Aplica caps de severidade e verifica distribuição saudável.

    Retorna:
        {
            "status": "approved" | "warnings" | "rejected",
            "warnings": [...],
            "corrected_findings": [...]
        }
    """
    all_warnings: list[str] = []
    corrected: list[dict[str, Any]] = []

    # Passo 1: corrigir severidades individuais
    for finding in findings:
        f_corr, warns = _correct_finding(finding)
        all_warnings.extend(warns)
        corrected.append(f_corr)

    # Passo 2: verificar distribuição após correções
    dist_warns = _check_distribuicao(corrected)
    all_warnings.extend(dist_warns)

    status = "approved" if not all_warnings else "warnings"

    return {
        "status": status,
        "warnings": all_warnings,
        "corrected_findings": corrected,
    }
