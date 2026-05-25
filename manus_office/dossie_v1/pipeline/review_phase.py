"""
Review Phase — AURORA Forensic v1.1

Orquestrador da fase de revisão automatizada: roda os 6 agentes revisores
em paralelo, com até 2 retries por agente em caso de warnings.

Atualiza o Firestore `dossies_v1/{slug}/review/{revisor_id}` a cada passo.
Persiste log completo em `dossies_v1/{slug}/review_log.json`.

Uso:
    from manus_office.dossie_v1.pipeline.review_phase import review_phase
    result = asyncio.run(review_phase(slug="nome-slug", findings_path="/tmp/.../findings.json"))
"""

from __future__ import annotations

import asyncio
import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Import dos revisores
# ---------------------------------------------------------------------------

_REVISORES_DIR = Path(__file__).resolve().parent.parent / "agents" / "revisores"
sys.path.insert(0, str(_REVISORES_DIR.parent.parent.parent))  # manus_office root

from dossie_v1.agents.revisores import REVISORES, run_all_reviewers  # noqa: E402
from dossie_v1.agents.revisores import (  # noqa: E402
    revisar_contraditorio,
    revisar_falso_positivo,
    revisar_fonte_primaria,
    revisar_mascara_pii,
    revisar_severidade,
    revisar_tom,
)

_REVISOR_FN_MAP: dict[str, Any] = {
    "revisor_fonte_primaria": revisar_fonte_primaria,
    "revisor_tom": revisar_tom,
    "revisor_contraditorio": revisar_contraditorio,
    "revisor_falso_positivo": revisar_falso_positivo,
    "revisor_mascara_pii": revisar_mascara_pii,
    "revisor_severidade": revisar_severidade,
}

# ---------------------------------------------------------------------------
# Firebase client (opcional — não falha se ausente)
# ---------------------------------------------------------------------------

try:
    import firebase_admin  # type: ignore
    from firebase_admin import firestore as fs_module  # type: ignore
    _FIREBASE_AVAILABLE = True
except ImportError:
    _FIREBASE_AVAILABLE = False
    firebase_admin = None  # type: ignore
    fs_module = None  # type: ignore


def _get_firestore_client():  # type: ignore
    """Retorna cliente Firestore ou None se indisponível."""
    if not _FIREBASE_AVAILABLE:
        return None
    try:
        # Tenta reutilizar app já inicializado
        firebase_admin.get_app()
    except ValueError:
        try:
            firebase_admin.initialize_app()
        except Exception:  # noqa: BLE001
            return None
    try:
        return fs_module.client()
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# Helpers Firestore
# ---------------------------------------------------------------------------


def _fs_update_reviewer(
    db: Any,
    slug: str,
    revisor_id: str,
    state: str,
    warnings: list[str],
    retries: int,
    finished_at: str | None = None,
) -> None:
    """Atualiza sub-coleção review/{revisor_id} no Firestore."""
    if db is None:
        return
    try:
        doc_ref = db.collection("dossies_v1").document(slug).collection("review").document(revisor_id)
        payload: dict[str, Any] = {
            "revisor_id": revisor_id,
            "state": state,
            "warnings": warnings,
            "retries": retries,
        }
        if finished_at:
            payload["finished_at"] = finished_at
        doc_ref.set(payload, merge=True)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"[review_phase] Firestore update falhou ({revisor_id}): {exc}\n")


def _fs_update_dossie_status(db: Any, slug: str, status: str) -> None:
    """Atualiza campo status no documento raiz do dossiê."""
    if db is None:
        return
    try:
        db.collection("dossies_v1").document(slug).set(
            {"status": status, "phase": "review", "updated_at": datetime.now(timezone.utc).isoformat()},
            merge=True,
        )
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"[review_phase] Firestore dossie status falhou: {exc}\n")


# ---------------------------------------------------------------------------
# Lógica de retry por agente
# ---------------------------------------------------------------------------


async def _run_revisor_with_retry(
    revisor_id: str,
    revisor_fn: Any,
    findings: list[dict[str, Any]],
    max_retries: int,
    db: Any,
    slug: str,
    loop: asyncio.AbstractEventLoop,
) -> dict[str, Any]:
    """
    Executa um revisor com até max_retries tentativas.

    Em cada retry, passa os `corrected_findings` da tentativa anterior,
    permitindo que o revisor se auto-corrija.

    Retorna resultado final (pode ser warnings se retries esgotarem).
    """
    current_findings = list(findings)
    retries = 0
    result: dict[str, Any] = {}

    # Marca como reviewing no Firestore
    _fs_update_reviewer(db, slug, revisor_id, "reviewing", [], retries)

    while retries <= max_retries:
        try:
            result = await loop.run_in_executor(None, revisor_fn, current_findings)
        except Exception as exc:  # noqa: BLE001
            result = {
                "status": "warnings",
                "warnings": [f"[F-EXEC-001] Revisor '{revisor_id}' erro na execução: {exc}"],
                "corrected_findings": current_findings,
            }

        if result["status"] == "approved":
            break

        # Ainda há warnings — tenta retry se não esgotou
        if retries < max_retries:
            retries += 1
            sys.stdout.write(
                f"[review_phase] {revisor_id} retry {retries}/{max_retries} "
                f"({len(result['warnings'])} warnings)…\n"
            )
            _fs_update_reviewer(db, slug, revisor_id, "reviewing", result["warnings"], retries)
            # Usa os findings já corrigidos para o próximo retry
            if result.get("corrected_findings"):
                current_findings = result["corrected_findings"]
        else:
            break

    # Estado final
    final_state = result.get("status", "warnings")
    finished_at = datetime.now(timezone.utc).isoformat()
    _fs_update_reviewer(
        db, slug, revisor_id, final_state, result.get("warnings", []), retries, finished_at
    )

    return {
        "revisor_id": revisor_id,
        "status": final_state,
        "warnings": result.get("warnings", []),
        "corrected_findings": result.get("corrected_findings", current_findings),
        "retries": retries,
    }


# ---------------------------------------------------------------------------
# Orquestrador principal
# ---------------------------------------------------------------------------


async def review_phase(
    slug: str,
    findings_path: str | Path,
    max_retries: int = 2,
) -> dict[str, Any]:
    """
    Fase de revisão automatizada: roda 6 revisores em paralelo com até
    2 retries por agente.

    Args:
        slug: Identificador do dossiê (Firestore doc ID).
        findings_path: Caminho para findings.json.
        max_retries: Número máximo de tentativas por revisor (padrão: 2).

    Returns:
        {
            "status": "approved" | "warnings" | "rejected",
            "warnings": [...],
            "corrections_applied": bool,
            "corrected_findings": [...],
            "retry_count": int,  # total de retries realizados
            "revisor_results": {...}
        }
    """
    findings_path = Path(findings_path)
    start_time = datetime.now(timezone.utc)

    sys.stdout.write(f"[review_phase] iniciando revisão do dossiê '{slug}'…\n")

    # Carrega findings
    if not findings_path.is_file():
        raise FileNotFoundError(f"findings.json não encontrado: {findings_path}")

    raw = json.loads(findings_path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        findings: list[dict[str, Any]] = raw
    elif isinstance(raw, dict) and "findings" in raw:
        findings = raw["findings"]
    else:
        findings = []

    # Inicializa Firestore
    db = _get_firestore_client()
    _fs_update_dossie_status(db, slug, "reviewing")

    loop = asyncio.get_event_loop()

    # Executa todos os revisores em paralelo (primeira passagem)
    tasks = [
        _run_revisor_with_retry(
            revisor_id, revisor_fn, findings, max_retries, db, slug, loop
        )
        for revisor_id, revisor_fn in REVISORES
    ]
    revisor_results_list: list[dict[str, Any]] = await asyncio.gather(*tasks)

    # Agrega resultados em pipeline sequencial para aplicar correções encadeadas
    current_findings = list(findings)
    all_warnings: list[str] = []
    overall_status = "approved"
    total_retries = 0
    revisor_results: dict[str, dict[str, Any]] = {}

    for res in revisor_results_list:
        rid = res["revisor_id"]
        revisor_results[rid] = res
        total_retries += res.get("retries", 0)

        if res["warnings"]:
            all_warnings.extend(res["warnings"])
            if overall_status == "approved":
                overall_status = "warnings"

        if res.get("status") == "rejected":
            overall_status = "rejected"

    # Re-aplica correções em pipeline para garantir consistência entre revisores
    for revisor_id, revisor_fn in REVISORES:
        res = revisor_fn(current_findings)
        if res.get("corrected_findings"):
            current_findings = res["corrected_findings"]

    corrections_applied = current_findings != findings

    # Persiste log de revisão
    log_path = findings_path.parent / "review_log.json"
    log_data: dict[str, Any] = {
        "slug": slug,
        "started_at": start_time.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": overall_status,
        "total_warnings": len(all_warnings),
        "total_retries": total_retries,
        "corrections_applied": corrections_applied,
        "warnings": all_warnings,
        "revisor_results": {
            rid: {
                "status": r["status"],
                "warnings": r["warnings"],
                "retries": r.get("retries", 0),
            }
            for rid, r in revisor_results.items()
        },
    }
    try:
        log_path.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")
        sys.stdout.write(f"[review_phase] review_log.json salvo em {log_path}\n")
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"[review_phase] falhou ao salvar review_log.json: {exc}\n")

    # Persiste review_log no Firestore
    if db is not None:
        try:
            db.collection("dossies_v1").document(slug).set(
                {"review_log": log_data, "updated_at": datetime.now(timezone.utc).isoformat()},
                merge=True,
            )
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[review_phase] Firestore review_log falhou: {exc}\n")

    # Atualiza status final do dossiê
    final_status = "reviewing" if overall_status == "warnings" else "done"
    _fs_update_dossie_status(db, slug, final_status)

    sys.stdout.write(
        f"[review_phase] concluído — status={overall_status} "
        f"warnings={len(all_warnings)} retries={total_retries}\n"
    )

    return {
        "status": overall_status,
        "warnings": all_warnings,
        "corrections_applied": corrections_applied,
        "corrected_findings": current_findings,
        "retry_count": total_retries,
        "revisor_results": revisor_results,
    }
