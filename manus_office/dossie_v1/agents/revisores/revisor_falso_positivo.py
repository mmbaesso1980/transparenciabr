"""
Revisor Falso Positivo — AURORA Forensic v1.1

Aplica as regras Gemini v1.1 para reclassificação de findings que são
prováveis falsos positivos:

  REGRA-FP-BANCADA:
    Se o fornecedor (CNPJ) de uma anomalia é compartilhado por ≥3 deputados
    da mesma bancada → reclassificar o finding para INFO (não é anomalia
    individual, é padrão de bancada).

  CONTRATO_RECORRENTE:
    Se o mesmo CNPJ aparece com valor similar por ≥3 meses consecutivos →
    reclassificar como contrato recorrente (não anomalia).

Nota: A verificação cruzada usa dados internos de análise; o resultado
publicado no dossiê não expõe nomes de views ou tabelas internas.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

SEV_INFO = "INFORMATIVO"
SEV_MEDIA = "MÉDIA"

# Número mínimo de deputados da bancada para acionar REGRA-FP-BANCADA
_MIN_BANCADA_DEPUTADOS = 3

# Número mínimo de meses consecutivos para acionar CONTRATO_RECORRENTE
_MIN_MESES_RECORRENTE = 3

# Nota padrão adicionada ao finding reclassificado
_NOTA_RECLASSIFICACAO = (
    "Reclassificação pós-investigação: finding revisto automaticamente pela "
    "análise de padrão coletivo v1.1."
)


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


def _apply_fp_bancada(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """
    REGRA-FP-BANCADA: reclassifica para INFO se fornecedor é compartilhado
    por ≥3 deputados da bancada.

    O campo `_fp_bancada_count` (opcional, injetado pelo pipeline de análise)
    carrega o número de deputados que compartilham o fornecedor.
    """
    warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")

    bancada_count = f.get("_fp_bancada_count", 0)
    if bancada_count >= _MIN_BANCADA_DEPUTADOS:
        old_sev = f.get("severidade", "")
        f["severidade"] = SEV_INFO
        f["reclassified"] = True
        f["_reclassificacao_motivo"] = "FP-BANCADA"
        f["_reclassificacao_nota"] = _NOTA_RECLASSIFICACAO
        warnings.append(
            f"[F-FP-001] Finding '{fid}' reclassificado de '{old_sev}' para '{SEV_INFO}' "
            f"por REGRA-FP-BANCADA: fornecedor compartilhado por {bancada_count} deputados da bancada."
        )

    return f, warnings


def _apply_contrato_recorrente(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """
    CONTRATO_RECORRENTE: reclassifica se mesmo CNPJ+valor aparece por ≥3 meses
    consecutivos.

    O campo `_recorrente_meses` (opcional, injetado pelo pipeline de análise)
    carrega o número de meses consecutivos.
    """
    warnings: list[str] = []
    f = dict(finding)
    fid = f.get("id", "?")

    meses = f.get("_recorrente_meses", 0)
    if meses >= _MIN_MESES_RECORRENTE:
        old_sev = f.get("severidade", "")
        # Recorrente não necessariamente é INFO; reduz 1 nível se CRÍTICA/ALTA
        sev_map = {"CRÍTICA": SEV_MEDIA, "CRITICA": SEV_MEDIA, "ALTA": SEV_MEDIA}
        new_sev = sev_map.get(old_sev.upper(), old_sev)
        f["severidade"] = new_sev
        f["reclassified"] = True
        f["_reclassificacao_motivo"] = "CONTRATO_RECORRENTE"
        f["_reclassificacao_nota"] = _NOTA_RECLASSIFICACAO
        if old_sev != new_sev:
            warnings.append(
                f"[F-FP-002] Finding '{fid}' reclassificado de '{old_sev}' para '{new_sev}' "
                f"por CONTRATO_RECORRENTE: mesmo fornecedor+valor por {meses} meses consecutivos."
            )

    return f, warnings


def _correct_finding(finding: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Aplica todas as regras de falso positivo a um finding."""
    all_warnings: list[str] = []
    f = finding

    f, w1 = _apply_fp_bancada(f)
    all_warnings.extend(w1)

    # Só aplica CONTRATO_RECORRENTE se FP-BANCADA não reclassificou já para INFO
    if not w1:
        f, w2 = _apply_contrato_recorrente(f)
        all_warnings.extend(w2)

    return f, all_warnings


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def revisar_falso_positivo(findings: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Aplica regras FP-BANCADA e CONTRATO_RECORRENTE para reclassificação.

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
