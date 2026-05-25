"""
Revisor Máscara PII — AURORA Forensic v1.1

Garante conformidade LGPD em todos os campos de texto dos findings:

  1. CPF cru (formato 000.000.000-00) → substituído automaticamente
     por ***.XXX.XXX-** (mantendo os dígitos centrais 4–6).
  2. Dados Classe C (renda estimada, nome da mãe, endereço residencial,
     telefone particular) → NÃO substituídos automaticamente; emite warning
     para revisão humana via Comandante.

CPF mascarado padrão: ***.XXX.XXX-** onde XXX.XXX são os dígitos 4-9.
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# CPF formato completo: 000.000.000-00
_CPF_RAW_RE = re.compile(r"\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b")

# Padrões que indicam dados Classe C (presença no texto = warning manual)
_CLASSE_C_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\brenda\s+(estimada|mensal|anual)\b", re.IGNORECASE), "renda estimada"),
    (re.compile(r"\bnome\s+d[ao]\s+m[ãa]e\b", re.IGNORECASE), "nome da mãe"),
    (re.compile(r"\bmãe\s*:\s*[A-Z][a-z]", re.IGNORECASE), "nome da mãe"),
    (
        re.compile(r"\bendereço\s+residencial\b|\breside\s+n[ao]\b|\bdomicílio\b", re.IGNORECASE),
        "endereço residencial",
    ),
    (
        re.compile(
            r"\btelefone\s+(particular|pessoal|celular\s+pessoal)\b", re.IGNORECASE
        ),
        "telefone particular",
    ),
    (
        re.compile(r"\bcel(?:ular)?:\s*\(?(?:\+55\s?)?\d{2}\)?\s*\d{4,5}-\d{4}\b", re.IGNORECASE),
        "telefone particular",
    ),
]


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _mask_cpf(text: str) -> tuple[str, int]:
    """
    Substitui CPFs crus por formato mascarado.
    Retorna (texto_mascarado, contagem_de_substituições).
    """
    count = 0

    def _replacer(m: re.Match[str]) -> str:
        nonlocal count
        count += 1
        # Mantém dígitos 4-6 (segundo grupo) e 7-9 (terceiro grupo)
        return f"***.{m.group(2)}.{m.group(3)}-**"

    masked = _CPF_RAW_RE.sub(_replacer, text)
    return masked, count


def _check_classe_c(text: str, finding_id: str, campo: str) -> list[str]:
    """Retorna lista de warnings para dados Classe C encontrados."""
    warnings: list[str] = []
    for pattern, label in _CLASSE_C_PATTERNS:
        if pattern.search(text):
            warnings.append(
                f"[F-PII-002] Finding '{finding_id}' campo '{campo}' "
                f"pode conter dado Classe C ({label}). "
                "Requer revisão humana pelo Comandante antes da publicação."
            )
    return warnings


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Processa um finding: mascara CPFs e emite warnings Classe C."""
    all_warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")
    total_cpf_masked = 0

    for campo in ("titulo", "fato", "analise", "contraditorio"):
        texto = str(f.get(campo, ""))
        if not texto:
            continue

        # 1. Mascara CPFs automaticamente
        masked, count = _mask_cpf(texto)
        if count > 0:
            total_cpf_masked += count
            f[campo] = masked
            all_warnings.append(
                f"[F-PII-001] Finding '{fid}' campo '{campo}': "
                f"{count} CPF(s) mascarado(s) automaticamente."
            )

        # 2. Verifica Classe C no texto já mascarado
        classe_c_warns = _check_classe_c(masked, fid, campo)
        all_warnings.extend(classe_c_warns)

    # Verifica também no campo fontes (strings)
    for i, fonte in enumerate(f.get("fontes", [])):
        if isinstance(fonte, str):
            masked_fonte, count = _mask_cpf(fonte)
            if count > 0:
                f["fontes"][i] = masked_fonte
                all_warnings.append(
                    f"[F-PII-001] Finding '{fid}' fontes[{i}]: {count} CPF(s) mascarado(s)."
                )
        elif isinstance(fonte, dict) and "texto" in fonte:
            masked_texto, count = _mask_cpf(str(fonte["texto"]))
            if count > 0:
                fonte["texto"] = masked_texto
                all_warnings.append(
                    f"[F-PII-001] Finding '{fid}' fontes[{i}].texto: {count} CPF(s) mascarado(s)."
                )

    return f, all_warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_mascara_pii(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Mascara CPFs automaticamente e emite warnings para dados Classe C.

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

    # Warnings de Classe C (PII-002) implicam revisão humana; não "rejeitamos"
    # automaticamente, mas a presença de qualquer warning aciona flag.
    status = "approved" if not all_warnings else "warnings"

    return {
        "status": status,
        "warnings": all_warnings,
        "corrected_findings": corrected,
    }
