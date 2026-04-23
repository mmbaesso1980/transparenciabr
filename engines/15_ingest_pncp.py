#!/usr/bin/env python3
"""
Ingestão PNCP — contratos públicos por município da base do parlamentar → BigQuery.

API consulta PNCP v1 (datas em formato YYYYMMDD):
  GET https://pncp.gov.br/api/consulta/v1/contratos

Variáveis: GCP_PROJECT, BQ_DATASET, PNCP_CONTRATOS_URL, PNCP_DIAS_RETROATIVOS (default 180)
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import requests
from google.cloud import bigquery
from google.cloud.bigquery import SchemaField, Table

from firebase_admin import firestore

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.firebase_app import init_firestore
from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

TABLE_CONTRATOS = "contratos_pncp"
TABLE_CADIRREG = "tcu_cadirreg"
COLLECTION_ALERTAS = "alertas_bodes"
COLLECTION_POLITICOS = "politicos"

PNCP_URL_DEFAULT = os.environ.get(
    "PNCP_CONTRATOS_URL",
    "https://pncp.gov.br/api/consulta/v1/contratos",
)
USER_AGENT = "TransparenciaBR-engines/15_pncp (PNCP consulta)"
DIAS_RETRO = int(os.environ.get("PNCP_DIAS_RETROATIVOS", "180"))
PAGE_SLEEP_SEC = float(os.environ.get("PNCP_PAGE_SLEEP_SEC", "0.35"))


def _only_digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s or "")


def _alert_doc_id(pid: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{pid}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _extract_ibge_municipio(m: Dict[str, Any]) -> Optional[str]:
    for key in ("codigo_ibge_municipio", "id_municipio", "codigo_ibge", "ibge"):
        raw = m.get(key)
        if raw is None:
            continue
        d = _only_digits(str(raw))
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


def _nome_municipio(m: Dict[str, Any]) -> str:
    return (
        str(m.get("nome_municipio") or m.get("nome") or m.get("municipio_nome") or "").strip()
        or "—"
    )


def _periodo_consulta(dias: int) -> tuple[str, str]:
    fim = datetime.now().date()
    ini = fim - timedelta(days=dias)
    return (ini.strftime("%Y%m%d"), fim.strftime("%Y%m%d"))


def _parse_contrato_row(
    item: Dict[str, Any],
    *,
    politico_id: str,
    codigo_ibge_consulta: str,
    nome_municipio: str,
) -> Dict[str, Any]:
    numero = str(
        item.get("numeroContratoEmpenho")
        or item.get("numeroControlePNCP")
        or item.get("numeroControlePncpCompra")
        or "",
    ).strip()
    cnpj = _only_digits(str(item.get("niFornecedor") or ""))
    razao = str(item.get("nomeRazaoSocialFornecedor") or "").strip()
    objeto = str(item.get("objetoContrato") or item.get("objetoCompra") or "").strip()
    valor = item.get("valorGlobal")
    try:
        valor_f = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        valor_f = None

    rk_raw = f"{politico_id}|{codigo_ibge_consulta}|{numero}|{cnpj}|{item.get('numeroControlePNCP','')}"
    row_key = hashlib.sha256(rk_raw.encode("utf-8")).hexdigest()

    return {
        "row_key": row_key,
        "politico_id": politico_id,
        "codigo_ibge_municipio": codigo_ibge_consulta,
        "nome_municipio_contexto": nome_municipio[:256],
        "numero_contrato": numero[:512] or numero,
        "cnpj_contratado": cnpj[:14],
        "nome_razao_social_contratado": razao[:1024],
        "valor_total": valor_f,
        "objeto": objeto[:8192],
        "data_assinatura": str(item.get("dataAssinatura") or "")[:32],
        "numero_controle_pncp": str(item.get("numeroControlePNCP") or "")[:128],
        "ingested_at": datetime.now(timezone.utc),
    }


def _fetch_contratos_paginas(
    session: requests.Session,
    *,
    codigo_ibge: str,
    data_ini: str,
    data_fim: str,
    max_pages: int,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    pagina = 1
    while pagina <= max_pages:
        params = {
            "codigoIbge": codigo_ibge,
            "dataInicial": data_ini,
            "dataFinal": data_fim,
            "pagina": str(pagina),
            "tamanhoPagina": "20",
        }
        r = session.get(
            PNCP_URL_DEFAULT,
            params=params,
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
            timeout=120,
        )
        if not r.ok:
            logger.warning(
                "PNCP HTTP %s ibge=%s pag=%s — %s",
                r.status_code,
                codigo_ibge,
                pagina,
                r.text[:300],
            )
            break
        payload = r.json()
        chunk = payload.get("data") or []
        if isinstance(chunk, list):
            out.extend(chunk)
        total_pag = int(payload.get("totalPaginas") or 1)
        logger.info(
            "PNCP ibge=%s página %s/%s registros=%s",
            codigo_ibge,
            pagina,
            total_pag,
            len(chunk) if isinstance(chunk, list) else 0,
        )
        if pagina >= total_pag:
            break
        pagina += 1
        time.sleep(PAGE_SLEEP_SEC)
    return out


def _ensure_table_contratos(client: bigquery.Client, project: str, dataset: str) -> None:
    fq = f"{project}.{dataset}.{TABLE_CONTRATOS}"
    schema = [
        SchemaField("row_key", "STRING", mode="REQUIRED"),
        SchemaField("politico_id", "STRING"),
        SchemaField("codigo_ibge_municipio", "STRING"),
        SchemaField("nome_municipio_contexto", "STRING"),
        SchemaField("numero_contrato", "STRING"),
        SchemaField("cnpj_contratado", "STRING"),
        SchemaField("nome_razao_social_contratado", "STRING"),
        SchemaField("valor_total", "FLOAT"),
        SchemaField("objeto", "STRING"),
        SchemaField("data_assinatura", "STRING"),
        SchemaField("numero_controle_pncp", "STRING"),
        SchemaField("ingested_at", "TIMESTAMP"),
    ]
    table = Table(fq, schema=schema)
    client.create_table(table, exists_ok=True)


def _merge_rows_bq(client: bigquery.Client, project: str, dataset: str, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    _ensure_table_contratos(client, project, dataset)
    temp = f"_tmp_pncp_{uuid.uuid4().hex}"
    temp_fq = f"{project}.{dataset}.{temp}"
    schema = [
        bigquery.SchemaField("row_key", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("politico_id", "STRING"),
        bigquery.SchemaField("codigo_ibge_municipio", "STRING"),
        bigquery.SchemaField("nome_municipio_contexto", "STRING"),
        bigquery.SchemaField("numero_contrato", "STRING"),
        bigquery.SchemaField("cnpj_contratado", "STRING"),
        bigquery.SchemaField("nome_razao_social_contratado", "STRING"),
        bigquery.SchemaField("valor_total", "FLOAT"),
        bigquery.SchemaField("objeto", "STRING"),
        bigquery.SchemaField("data_assinatura", "STRING"),
        bigquery.SchemaField("numero_controle_pncp", "STRING"),
        bigquery.SchemaField("ingested_at", "TIMESTAMP"),
    ]
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
    )
    load_job = client.load_table_from_json(rows, temp_fq, job_config=job_config)
    load_job.result()

    dest = f"`{project}.{dataset}.{TABLE_CONTRATOS}`"
    merge_sql = f"""
    MERGE {dest} T
    USING `{project}.{dataset}.{temp}` S
    ON T.row_key = S.row_key
    WHEN NOT MATCHED THEN
      INSERT (
        row_key, politico_id, codigo_ibge_municipio, nome_municipio_contexto,
        numero_contrato, cnpj_contratado, nome_razao_social_contratado,
        valor_total, objeto, data_assinatura, numero_controle_pncp, ingested_at
      )
      VALUES (
        S.row_key, S.politico_id, S.codigo_ibge_municipio, S.nome_municipio_contexto,
        S.numero_contrato, S.cnpj_contratado, S.nome_razao_social_contratado,
        S.valor_total, S.objeto, S.data_assinatura, S.numero_controle_pncp, S.ingested_at
      )
    """
    qjob = client.query(merge_sql)
    qjob.result()
    client.delete_table(temp_fq, not_found_ok=True)
    return len(rows)


def _load_cnpjs_cadirreg(client: bigquery.Client, project: str, dataset: str) -> Set[str]:
    fq = f"`{project}.{dataset}.{TABLE_CADIRREG}`"
    sql = f"""
    SELECT DISTINCT REGEXP_REPLACE(CAST(cpf_cnpj AS STRING), r'[^0-9]', '') AS doc
    FROM {fq}
    WHERE LENGTH(REGEXP_REPLACE(CAST(cpf_cnpj AS STRING), r'[^0-9]', '')) = 14
    """
    try:
        rows = list(client.query(sql).result())
    except Exception as exc:
        logger.warning("Não foi possível ler tcu_cadirreg (%s). Alertas PNCP×CADIRREG desativados.", exc)
        return set()
    return {str(r.doc) for r in rows if r.doc}


def _gravar_alertas_cadirreg(
    fs: firestore.Client,
    *,
    politico_id: str,
    alertas: List[Dict[str, Any]],
) -> int:
    if not alertas:
        return 0
    batch = fs.batch()
    n = 0
    col = fs.collection(COLLECTION_ALERTAS)
    for a in alertas:
        tipo = str(a.get("tipo_risco") or "PNCP_CADIRREG")
        msg = str(a.get("mensagem") or "")
        criado = a.get("criado_em")
        if not isinstance(criado, datetime):
            criado = datetime.now(timezone.utc)
        criado_iso = criado.isoformat()
        fonte = str(a.get("fonte") or "pncp_x_cadirreg")
        doc_id = _alert_doc_id(politico_id, tipo, msg, criado_iso, fonte)
        payload = {
            "politico_id": politico_id,
            "parlamentar_id": politico_id,
            "tipo_risco": tipo,
            "mensagem": msg,
            "severidade": "NIVEL_5",
            "criticidade": "NIVEL_5",
            "fonte": fonte,
            "criado_em": criado,
            "sincronizado_em": firestore.SERVER_TIMESTAMP,
            "detalhe_pncp": a.get("detalhe"),
        }
        batch.set(col.document(doc_id), payload, merge=True)
        n += 1
        if n >= 450:
            batch.commit()
            batch = fs.batch()
            n = 0
    if n:
        batch.commit()
    return len(alertas)


def run(
    *,
    politico_id: str,
    dry_run: bool,
    max_pages: int,
    dias: int,
) -> int:
    project = gcp_project_id()
    dataset = bq_dataset_id()
    fs = init_firestore()
    snap = fs.collection(COLLECTION_POLITICOS).document(politico_id.strip()).get()
    if not snap.exists:
        logger.error("Politico %s não encontrado.", politico_id)
        return 2
    data = snap.to_dict() or {}
    municipios = _rows_municipios(data)
    ibge_list: List[tuple[str, str]] = []
    for m in municipios:
        ibge = _extract_ibge_municipio(m)
        if not ibge:
            logger.warning("Município sem IBGE (%s) — ignorado.", _nome_municipio(m))
            continue
        ibge_list.append((ibge, _nome_municipio(m)))
    if not ibge_list:
        logger.error("Nenhum município com código IBGE na base do político.")
        return 3

    data_ini, data_fim = _periodo_consulta(dias)
    session = requests.Session()

    todas_linhas: List[Dict[str, Any]] = []
    alertas_buf: List[Dict[str, Any]] = []

    bq_client: Optional[bigquery.Client] = None
    cadirreg_set: Set[str] = set()
    if not dry_run:
        bq_client = bigquery.Client(project=project)
        cadirreg_set = _load_cnpjs_cadirreg(bq_client, project, dataset)

    for ibge, nome_mun in ibge_list:
        time.sleep(PAGE_SLEEP_SEC)
        bruto = _fetch_contratos_paginas(
            session,
            codigo_ibge=ibge,
            data_ini=data_ini,
            data_fim=data_fim,
            max_pages=max_pages,
        )
        for item in bruto:
            if not isinstance(item, dict):
                continue
            row = _parse_contrato_row(
                item,
                politico_id=politico_id.strip(),
                codigo_ibge_consulta=ibge,
                nome_municipio=nome_mun,
            )
            todas_linhas.append(row)
            cnpj = row.get("cnpj_contratado") or ""
            if len(cnpj) == 14 and cnpj in cadirreg_set:
                alertas_buf.append(
                    {
                        "tipo_risco": "PNCP_FORNECEDOR_CADIRREG",
                        "mensagem": (
                            f"Contrato PNCP com fornecedor listado no CADIRREG (TCU). "
                            f"CNPJ {cnpj}, contrato {row.get('numero_contrato')}, "
                            f"município IBGE {ibge} ({nome_mun})."
                        ),
                        "fonte": "15_ingest_pncp",
                        "criado_em": datetime.now(timezone.utc),
                        "detalhe": {
                            "cnpj": cnpj,
                            "numero_contrato": row.get("numero_contrato"),
                            "valor_total": row.get("valor_total"),
                            "codigo_ibge_municipio": ibge,
                        },
                    }
                )

    logger.info(
        "Contratos normalizados: %s | alertas CADIRREG: %s",
        len(todas_linhas),
        len(alertas_buf),
    )

    if dry_run:
        for row in todas_linhas[:8]:
            logger.info("[dry-run BQ row] %s | %s | R$ %s", row["cnpj_contratado"], row["numero_contrato"], row["valor_total"])
        logger.info("[dry-run] Sem MERGE BigQuery nem Firestore.")
        return 0

    assert bq_client is not None
    merged = _merge_rows_bq(bq_client, project, dataset, todas_linhas)
    logger.info("BigQuery MERGE concluído (%s linhas processadas).", merged)

    if alertas_buf:
        n_al = _gravar_alertas_cadirreg(fs, politico_id=politico_id.strip(), alertas=alertas_buf)
        logger.info("Alertas NIVEL_5 gravados em `%s`: %s", COLLECTION_ALERTAS, n_al)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PNCP → BigQuery contratos_pncp + alertas CADIRREG.")
    parser.add_argument(
        "--politico-id",
        default=None,
        help="ID do político no Firestore. Se omitido, varre todos os políticos ativos.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-pages", type=int, default=int(os.environ.get("PNCP_MAX_PAGES", "50")))
    parser.add_argument("--dias", type=int, default=DIAS_RETRO)
    args = parser.parse_args()

    if args.politico_id:
        politico_ids = [args.politico_id]
    else:
        # Busca todos os políticos ativos no Firestore
        db = firestore.Client()
        docs = db.collection("politicos").where("ativo", "==", True).stream()
        politico_ids = [doc.id for doc in docs]
        if not politico_ids:
            logger.warning("Nenhum político ativo encontrado no Firestore. Encerrando.")
            return 0
        logger.info("Modo CI: varrendo %d políticos ativos.", len(politico_ids))

    try:
        for pid in politico_ids:
            res = run(
                politico_id=pid.strip(),
                dry_run=args.dry_run,
                max_pages=max(1, args.max_pages),
                dias=max(7, args.dias),
            )
            if res != 0:
                logger.error("Falha ao processar politico_id=%s. Código: %s", pid, res)
        return 0
    except Exception as exc:
        logger.exception("Falha: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
