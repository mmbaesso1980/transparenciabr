#!/usr/bin/env python3
"""
Operação D.R.A.C.U.L.A. — malha CNES (Base dos Dados) × contratos PNCP × parentesco (fuzzy).

1) BigQuery: estabelecimentos de saúde e mantenedoras (OSS) nos municípios-alvo.
2) Cruzamento com ``contratos_pncp`` para o mesmo ``politico_id``.
3) Fuzzy match (``12_family_ties``) entre familiares declarados e razão social de fornecedores.
4) Firestore: ``malha_saude/{politico_id}`` + merge resumo em ``politicos/{id}`` (uma leitura no dossiê).

Requer permissão de leitura em ``basedosdados.br_ms_cnes.estabelecimento`` e tabela local ``contratos_pncp``.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
from typing import Any, Dict, List, Set

from google.cloud import bigquery
from firebase_admin import firestore

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.firebase_app import init_firestore
from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

COLLECTION_MALHA = "malha_saude"
COLLECTION_POLITICOS = "politicos"
COLLECTION_ALERTAS = "alertas_bodes"
TABLE_CONTRATOS = "contratos_pncp"

SIMILARITY_MIN = 0.85


def _load_family_module():
    path = Path(__file__).resolve().parent / "12_family_ties.py"
    spec = importlib.util.spec_from_file_location("family_ties_internal", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _alert_doc_id(pid: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{pid}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _extract_ibge_municipio(m: Dict[str, Any]) -> Optional[str]:
    import re

    for key in ("codigo_ibge_municipio", "id_municipio", "codigo_ibge", "ibge"):
        raw = m.get(key)
        if raw is None:
            continue
        d = re.sub(r"[^0-9]", "", str(raw))
        if len(d) >= 7:
            return d[-7:] if len(d) > 7 else d
        if len(d) == 6:
            return d.zfill(7)
    return None


def _rows_municipios(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    wrap = data.get("contexto_socioeconomico") or {}
    raw = wrap.get("municipios") or data.get("indicadores_municipios_alvo") or []
    out: List[Dict[str, Any]] = []
    if isinstance(raw, list):
        for x in raw:
            if isinstance(x, dict):
                out.append(x)
    return out


def _familiares_do_politico(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = (
        data.get("familiares_declarados")
        or data.get("familiares_monitoramento")
        or data.get("parentesco_declarado")
        or []
    )
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for x in raw:
        if isinstance(x, dict) and (x.get("nome_completo") or x.get("nome")):
            nome = str(x.get("nome_completo") or x.get("nome") or "").strip()
            out.append(
                {
                    "nome_completo": nome,
                    "parentesco": str(x.get("parentesco") or "—"),
                }
            )
    return out


def _query_cnes_oss(
    client: bigquery.Client,
    ibges: List[str],
) -> List[Dict[str, Any]]:
    if not ibges:
        return []
    # Colunas canónicas Base dos Dados — CNES estabelecimento (ajustar se o dataset evoluir).
    sql = """
    SELECT DISTINCT
      LPAD(CAST(id_municipio AS STRING), 7, '0') AS ibge,
      REGEXP_REPLACE(CAST(cnpj AS STRING), r'[^0-9]', '') AS cnpj_estabelecimento,
      REGEXP_REPLACE(CAST(cnpj_mantenedora AS STRING), r'[^0-9]', '') AS cnpj_mantenedora,
      CAST(nome_fantasia AS STRING) AS nome_fantasia,
      CAST(NULL AS STRING) AS razao_social,
      CAST(NULL AS STRING) AS detalhamento
    FROM `basedosdados.br_ms_cnes.estabelecimento`
    WHERE LPAD(CAST(id_municipio AS STRING), 7, '0') IN UNNEST(@ibges)
      AND LENGTH(REGEXP_REPLACE(CAST(cnpj_mantenedora AS STRING), r'[^0-9]', '')) = 14
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("ibges", "STRING", ibges),
        ]
    )
    rows = list(client.query(sql, job_config=job_config).result())
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "ibge": str(r.ibge or ""),
                "cnpj_estabelecimento": str(r.cnpj_estabelecimento or ""),
                "cnpj_mantenedora": str(r.cnpj_mantenedora or ""),
                "nome_fantasia": str(r.nome_fantasia or ""),
                "razao_social": str(r.razao_social or ""),
                "detalhamento": str(r.detalhamento or ""),
            }
        )
    return out


def _query_contratos_politico(
    client: bigquery.Client,
    project: str,
    dataset: str,
    politico_id: str,
) -> List[Dict[str, Any]]:
    sql = f"""
    SELECT DISTINCT
      cnpj_contratado,
      nome_razao_social_contratado,
      numero_contrato,
      valor_total,
      objeto,
      codigo_ibge_municipio
    FROM `{project}.{dataset}.{TABLE_CONTRATOS}`
    WHERE politico_id = @pid
    """
    cfg = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("pid", "STRING", politico_id)]
    )
    return [dict(r.items()) for r in client.query(sql, job_config=cfg).result()]


def run(*, politico_id: str, dry_run: bool) -> int:
    ft = _load_family_module()
    similarity = getattr(ft, "similarity")
    melhor_par_familiar = getattr(ft, "melhor_par_familiar")

    pid = politico_id.strip()
    fs = init_firestore()
    snap = fs.collection(COLLECTION_POLITICOS).document(pid).get()
    if not snap.exists:
        logger.error("Politico %s não encontrado.", pid)
        return 0
    pdata = snap.to_dict() or {}

    mun_rows = _rows_municipios(pdata)
    ibges = sorted({_extract_ibge_municipio(m) for m in mun_rows if _extract_ibge_municipio(m)})
    familiares = _familiares_do_politico(pdata)

    project = gcp_project_id()
    dataset = bq_dataset_id()
    client = bigquery.Client(project=project)

    hospitais_raw: List[Dict[str, Any]] = []
    try:
        hospitais_raw = _query_cnes_oss(client, ibges)
    except Exception as exc:
        logger.exception(
            "Query CNES/Base dos Dados falhou (%s). Verifique billing e acesso ao dataset público.",
            exc,
        )
        hospitais_raw = []

    contratos: List[Dict[str, Any]] = []
    try:
        contratos = _query_contratos_politico(client, project, dataset, pid)
    except Exception as exc:
        logger.warning("contratos_pncp indisponível ou vazio (%s).", exc)

    cnpj_contratos: Set[str] = {
        str(c.get("cnpj_contratado") or "")
        for c in contratos
        if len(str(c.get("cnpj_contratado") or "")) == 14
    }

    mant_por_ibge: Dict[str, Set[str]] = defaultdict(set)
    for h in hospitais_raw:
        ib = str(h.get("ibge") or "")
        cm = str(h.get("cnpj_mantenedora") or "")
        if ib and len(cm) == 14:
            mant_por_ibge[ib].add(cm)

    hospitais_out: List[Dict[str, Any]] = []
    oss_alerta_pncp: List[str] = []

    for h in hospitais_raw:
        mant = h.get("cnpj_mantenedora") or ""
        hit_pncp = mant in cnpj_contratos
        if hit_pncp:
            oss_alerta_pncp.append(mant)
        hospitais_out.append(
            {
                **h,
                "alerta_oss_em_contratos_pncp": hit_pncp,
            }
        )

    alertas_extra: List[Dict[str, Any]] = []

    # Cruzamento corrupção saúde + fuzzy familiar × razão social de fornecedor PNCP
    for c in contratos:
        razao = str(c.get("nome_razao_social_contratado") or "").strip()
        if not razao or not familiares:
            continue
        socios_proxy = [razao]
        hit = melhor_par_familiar(familiares, socios_proxy)
        if hit is None:
            continue
        fam, _socio_guess, sim = hit
        if sim <= SIMILARITY_MIN:
            continue
        ibge_c = str(c.get("codigo_ibge_municipio") or "")
        cnpj_c = str(c.get("cnpj_contratado") or "")
        oss_ibge = bool(ibge_c and cnpj_c in mant_por_ibge.get(ibge_c, set()))
        if not oss_ibge and sim < 0.93:
            continue

        criado = datetime.now(timezone.utc)
        mensagem = (
            f"D.R.A.C.U.L.A.: similaridade {sim:.2f} entre '{fam.get('nome_completo')}' "
            f"e razão social de fornecedor PNCP '{razao}' (contrato {c.get('numero_contrato')}). "
            f"Possível superfície de nepotismo/corrupção cruzada na saúde."
        )
        alertas_extra.append(
            {
                "tipo_risco": "CORRUPCAO_CRUZADA_SAUDE",
                "mensagem": mensagem,
                "fonte": "16_oss_mapper",
                "criado_em": criado,
                "detalhe": {"similaridade": sim, "contrato": c, "familiar": fam},
            }
        )

    payload_malha: Dict[str, Any] = {
        "politico_id": pid,
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
        "ibges_alvo": ibges,
        "hospitais": hospitais_out,
        "contratos_pncp_resumo": {
            "total_distinct_cnpj": len(cnpj_contratos),
            "oss_cnpjs_em_contratos": sorted(set(oss_alerta_pncp)),
        },
        "familiares_usados_no_fuzzy": len(familiares),
        "fonte_cnes": "basedosdados.br_ms_cnes.estabelecimento",
        "fonte_pncp_table": f"{project}.{dataset}.{TABLE_CONTRATOS}",
    }

    if dry_run:
        logger.info("[dry-run] hospitais=%s contratos=%s alertas_extra=%s", len(hospitais_out), len(contratos), len(alertas_extra))
        return 0

    fs.collection(COLLECTION_MALHA).document(pid).set(payload_malha, merge=True)
    fs.collection(COLLECTION_POLITICOS).document(pid).set({"malha_saude": payload_malha}, merge=True)

    for a in alertas_extra:
        tipo = str(a["tipo_risco"])
        msg = str(a["mensagem"])
        criado = a["criado_em"]
        criado_iso = criado.isoformat()
        fonte = str(a["fonte"])
        doc_id = _alert_doc_id(pid, tipo, msg, criado_iso, fonte)
        fs.collection(COLLECTION_ALERTAS).document(doc_id).set(
            {
                "politico_id": pid,
                "parlamentar_id": pid,
                "tipo_risco": tipo,
                "mensagem": msg,
                "severidade": "NIVEL_5",
                "criticidade": "NIVEL_5",
                "fonte": fonte,
                "criado_em": criado,
                "sincronizado_em": firestore.SERVER_TIMESTAMP,
                "detalhe_dracula": a.get("detalhe"),
            },
            merge=True,
        )

    logger.info(
        "Malha gravada em `%s/%s` + merge em politicos.malha_saude (%s hospitais).",
        COLLECTION_MALHA,
        pid,
        len(hospitais_out),
    )
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="D.R.A.C.U.L.A. — OSS × PNCP × parentesco.")
    p.add_argument("--politico-id", required=True)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    try:
        return run(politico_id=args.politico_id.strip(), dry_run=args.dry_run)
    except Exception as exc:
        logger.exception("%s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
