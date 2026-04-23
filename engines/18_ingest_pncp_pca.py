#!/usr/bin/env python3
"""
Radar PCA (PNCP) → BigQuery `transparenciabr.pncp_pca_itens` + alertas Firestore.

Endpoint base (Consulta PNCP): GET planos anuais / itens por município IBGE.
Variáveis:
  PNCP_PCA_URL — lista de planos ou itens (default consulta v1 planos-contratacao)
  PNCP_PCA_ITENS_URL — opcional; template com {idPlano} para baixar itens quando a lista só traz metadados
  GCP_PROJECT, BQ_DATASET

Cruzamento com emendas do parlamentar: sobreposição lexical entre `item_descricao` e
tipos/rótulos de despesa CEAP (`ceap_despesas`) no mesmo município IBGE.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

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

TABLE_PCA = "pncp_pca_itens"
COLLECTION_ALERTAS = "alertas_bodes"
COLLECTION_POLITICOS = "politicos"

USER_AGENT = "TransparenciaBR-engines/18_pca (PNCP consulta)"

PNCP_PCA_URL_DEFAULT = os.environ.get(
    "PNCP_PCA_URL",
    "https://pncp.gov.br/pncp-consulta/v1/planos-contratacao",
)
PNCP_ITENS_TEMPLATE_DEFAULT = os.environ.get(
    "PNCP_PCA_ITENS_URL",
    "https://pncp.gov.br/api/pncp/v1/planos-contratacao/{id}/itens",
)

PAGE_SLEEP_SEC = float(os.environ.get("PNCP_PAGE_SLEEP_SEC", "0.35"))


def _digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s or "")


def _norm_txt(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s.lower()).strip()


def _tokens(s: str) -> Set[str]:
    return set(re.findall(r"[a-z0-9]{3,}", _norm_txt(s)))


def _alert_doc_id(pid: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{pid}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _extract_ibge(item: Dict[str, Any]) -> Optional[str]:
    for key in (
        "codigoIbge",
        "municipio_id",
        "codigoIbgeMunicipio",
        "codigo_ibge_municipio",
        "codigoIbgeDestinatario",
        "codigoIbgeDestino",
        "ibge",
    ):
        raw = item.get(key)
        if raw is None:
            continue
        d = _digits(str(raw))
        if len(d) >= 7:
            return d[-7:] if len(d) > 7 else d
        if len(d) == 6:
            return d.zfill(7)
    mun = item.get("municipio") or item.get("municipioDTO") or {}
    if isinstance(mun, dict):
        raw = mun.get("codigoIbge") or mun.get("id")
        if raw is not None:
            d = _digits(str(raw))
            if len(d) >= 6:
                return d[-7:].zfill(7) if len(d) >= 7 else d.zfill(7)
    return None


def _floatish(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pick_str(item: Dict[str, Any], *keys: str) -> str:
    for k in keys:
        if k in item and item[k] is not None:
            return str(item[k]).strip()
    return ""


def _pick_contatos(item: Dict[str, Any]) -> Tuple[str, str, str, str]:
    """Retorna (nome_orgao, cnpj, email, telefone) com heurísticas PNCP."""
    nome = ""
    cnpj = ""
    email = ""
    tel = ""

    for blob in (
        item,
        item.get("orgaoEntidade") or {},
        item.get("orgao") or {},
        item.get("unidadeOrgao") or {},
        item.get("comprador") or {},
    ):
        if not isinstance(blob, dict):
            continue
        nome = nome or _pick_str(blob, "nome", "razaoSocial", "nomeOrgao", "nomeUnidade")
        cnpj = cnpj or _digits(_pick_str(blob, "cnpj", "niOrgao", "identificador"))
        email = email or _pick_str(blob, "email", "emailInstitucional")
        tel = tel or _digits(_pick_str(blob, "telefone", "fone", "telefoneComercial"))[:20]

    return nome[:512], cnpj[:14], email[:320], tel[:32]


def _flatten_item_row(
    item: Dict[str, Any],
    *,
    base_ctx: Dict[str, Any],
    ano_guess: Optional[int],
) -> Optional[Dict[str, Any]]:
    ibge = _extract_ibge({**base_ctx, **item})
    if not ibge:
        return None

    desc = _pick_str(
        item,
        "item_descricao",
        "descricaoItem",
        "descricao",
        "nomeItem",
        "objeto",
        "tituloItem",
    )
    if not desc:
        desc = _pick_str(base_ctx, "objeto", "descricao")

    qtd = _floatish(
        item.get("quantidade_estimada")
        or item.get("quantidadeEstimada")
        or item.get("quantidade")
        or base_ctx.get("quantidadeEstimada"),
    )
    vu = _floatish(
        item.get("valor_unitario_estimado")
        or item.get("valorUnitarioEstimado")
        or item.get("valorUnitario")
        or item.get("valor_unitario"),
    )

    nome_o, cnpj_o, email_o, tel_o = _pick_contatos({**base_ctx, **item})

    plano_id = _pick_str(item, "numeroControlePNCP", "idPlano", "numeroPlano", "codigoPlano") or _pick_str(
        base_ctx, "numeroControlePNCP", "idPlano"
    )

    ano = ano_guess
    if ano is None:
        for key in ("ano", "anoPCA", "anoReferencia", "exercicio"):
            raw = item.get(key) if key in item else base_ctx.get(key)
            if raw is not None:
                try:
                    ano = int(str(raw)[:4])
                    break
                except (TypeError, ValueError):
                    pass

    rk_raw = "|".join(
        [
            ibge,
            desc[:512],
            str(qtd or ""),
            str(vu or ""),
            plano_id[:128],
        ]
    )
    row_key = hashlib.sha256(rk_raw.encode("utf-8")).hexdigest()

    payload = json.dumps(item, ensure_ascii=False, default=str)[:8192]

    return {
        "row_key": row_key,
        "codigo_ibge_municipio": ibge,
        "item_descricao": desc[:8192],
        "quantidade_estimada": qtd,
        "valor_unitario_estimado": vu,
        "ano_exercicio": ano,
        "numero_controle_plano": plano_id[:256] if plano_id else None,
        "orgao_nome": nome_o or None,
        "orgao_cnpj": cnpj_o or None,
        "orgao_email": email_o or None,
        "orgao_telefone": tel_o or None,
        "payload_raw": payload,
        "ingested_at": datetime.now(timezone.utc),
    }


def _iter_chunks_from_payload(payload: Any, *, ano_hint: Optional[int]) -> Iterable[Dict[str, Any]]:
    """Normaliza vários formatos comuns (`data`, `content`, lista em raiz)."""
    if isinstance(payload, list):
        for x in payload:
            if isinstance(x, dict):
                yield x
        return

    if not isinstance(payload, dict):
        return

    inner = payload.get("data") or payload.get("content") or payload.get("resultado")
    if isinstance(inner, list):
        for x in inner:
            if isinstance(x, dict):
                yield x
        return

    # Objeto único
    if inner is None:
        yield payload


def _ensure_table_pca(client: bigquery.Client, project: str, dataset: str) -> None:
    fq = f"{project}.{dataset}.{TABLE_PCA}"
    schema = [
        SchemaField("row_key", "STRING", mode="REQUIRED"),
        SchemaField("codigo_ibge_municipio", "STRING"),
        SchemaField("item_descricao", "STRING"),
        SchemaField("quantidade_estimada", "FLOAT"),
        SchemaField("valor_unitario_estimado", "FLOAT"),
        SchemaField("ano_exercicio", "INTEGER"),
        SchemaField("numero_controle_plano", "STRING"),
        SchemaField("orgao_nome", "STRING"),
        SchemaField("orgao_cnpj", "STRING"),
        SchemaField("orgao_email", "STRING"),
        SchemaField("orgao_telefone", "STRING"),
        SchemaField("payload_raw", "STRING"),
        SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"),
    ]
    client.create_table(Table(fq, schema=schema), exists_ok=True)


def _merge_pca_rows(client: bigquery.Client, project: str, dataset: str, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    _ensure_table_pca(client, project, dataset)
    temp = f"_tmp_pca_{uuid.uuid4().hex}"
    temp_fq = f"{project}.{dataset}.{temp}"
    schema = [
        bigquery.SchemaField("row_key", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("codigo_ibge_municipio", "STRING"),
        bigquery.SchemaField("item_descricao", "STRING"),
        bigquery.SchemaField("quantidade_estimada", "FLOAT"),
        bigquery.SchemaField("valor_unitario_estimado", "FLOAT"),
        bigquery.SchemaField("ano_exercicio", "INTEGER"),
        bigquery.SchemaField("numero_controle_plano", "STRING"),
        bigquery.SchemaField("orgao_nome", "STRING"),
        bigquery.SchemaField("orgao_cnpj", "STRING"),
        bigquery.SchemaField("orgao_email", "STRING"),
        bigquery.SchemaField("orgao_telefone", "STRING"),
        bigquery.SchemaField("payload_raw", "STRING"),
        bigquery.SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"),
    ]
    job_config = bigquery.LoadJobConfig(schema=schema, write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE)
    load_job = client.load_table_from_json(rows, temp_fq, job_config=job_config)
    load_job.result()

    dest = f"`{project}.{dataset}.{TABLE_PCA}`"
    merge_sql = f"""
    MERGE {dest} T
    USING `{project}.{dataset}.{temp}` S
    ON T.row_key = S.row_key
    WHEN MATCHED THEN UPDATE SET
      codigo_ibge_municipio = S.codigo_ibge_municipio,
      item_descricao = S.item_descricao,
      quantidade_estimada = S.quantidade_estimada,
      valor_unitario_estimado = S.valor_unitario_estimado,
      ano_exercicio = S.ano_exercicio,
      numero_controle_plano = S.numero_controle_plano,
      orgao_nome = S.orgao_nome,
      orgao_cnpj = S.orgao_cnpj,
      orgao_email = S.orgao_email,
      orgao_telefone = S.orgao_telefone,
      payload_raw = S.payload_raw,
      ingested_at = S.ingested_at
    WHEN NOT MATCHED THEN
      INSERT (
        row_key, codigo_ibge_municipio, item_descricao, quantidade_estimada, valor_unitario_estimado,
        ano_exercicio, numero_controle_plano, orgao_nome, orgao_cnpj, orgao_email, orgao_telefone,
        payload_raw, ingested_at
      )
      VALUES (
        S.row_key, S.codigo_ibge_municipio, S.item_descricao, S.quantidade_estimada, S.valor_unitario_estimado,
        S.ano_exercicio, S.numero_controle_plano, S.orgao_nome, S.orgao_cnpj, S.orgao_email, S.orgao_telefone,
        S.payload_raw, S.ingested_at
      )
    """
    client.query(merge_sql).result()
    client.delete_table(temp_fq, not_found_ok=True)
    return len(rows)


def _fetch_json(
    session: requests.Session,
    url: str,
    params: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    r = session.get(
        url,
        params=params or {},
        timeout=180,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    )
    if not r.ok:
        logger.warning("HTTP %s em %s — %s", r.status_code, url, (r.text or "")[:240])
        return None
    try:
        return r.json()
    except Exception as exc:
        logger.warning("JSON inválido %s: %s", url, exc)
        return None


def _maybe_fetch_itens_for_plan(
    session: requests.Session,
    tpl: str,
    plan_blob: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Quando o endpoint de lista só devolve planos, tenta baixar /itens."""
    pid = (
        plan_blob.get("id")
        or plan_blob.get("idPlano")
        or plan_blob.get("numeroControlePNCP")
        or plan_blob.get("codigoPlano")
    )
    if pid is None:
        return []
    url = tpl.replace("{id}", str(pid)).replace("{idPlano}", str(pid))
    js = _fetch_json(session, url)
    if not js:
        return []
    rows: List[Dict[str, Any]] = []
    for chunk in _iter_chunks_from_payload(js, ano_hint=None):
        flat = _flatten_item_row(chunk, base_ctx=plan_blob, ano_guess=None)
        if flat:
            rows.append(flat)
    return rows


def fetch_pca_for_ibge(
    session: requests.Session,
    *,
    codigo_ibge: str,
    data_ini: str,
    data_fim: str,
    max_pages: int,
    lista_url: str,
    itens_tpl: str,
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
        payload = _fetch_json(session, lista_url, params=params)
        if not payload:
            break

        chunk = payload.get("data") or []
        total_pag = int(payload.get("totalPaginas") or 1)
        if not isinstance(chunk, list):
            chunk = []

        ano_hint = None
        try:
            ano_hint = int(data_fim[:4])
        except Exception:
            pass

        for row in chunk:
            if not isinstance(row, dict):
                continue

            nested = row.get("itens") or row.get("listaItens") or row.get("itensPlano")
            if isinstance(nested, list) and nested:
                for it in nested:
                    if isinstance(it, dict):
                        flat = _flatten_item_row(it, base_ctx=row, ano_guess=ano_hint)
                        if flat:
                            out.append(flat)
                continue

            flat = _flatten_item_row(row, base_ctx={}, ano_guess=ano_hint)
            if flat:
                out.append(flat)
                continue

            extra = _maybe_fetch_itens_for_plan(session, itens_tpl, row)
            out.extend(extra)

        if pagina >= total_pag:
            break
        pagina += 1
        time.sleep(PAGE_SLEEP_SEC)

    return out


def _rows_municipios(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    wrap = data.get("contexto_socioeconomico") or {}
    raw = wrap.get("municipios") or data.get("indicadores_municipios_alvo") or []
    out: List[Dict[str, Any]] = []
    if isinstance(raw, list):
        for x in raw:
            if isinstance(x, dict):
                out.append(x)
    return out


def _extract_mun_ibge(m: Dict[str, Any]) -> Optional[str]:
    for key in ("codigo_ibge_municipio", "id_municipio", "codigo_ibge", "ibge"):
        raw = m.get(key)
        if raw is None:
            continue
        d = _digits(str(raw))
        if len(d) >= 7:
            return d[-7:] if len(d) > 7 else d
        if len(d) == 6:
            return d.zfill(7)
    return None


def _nome_municipio(m: Dict[str, Any]) -> str:
    return (
        str(m.get("nome_municipio") or m.get("nome") or m.get("municipio_nome") or "").strip()
        or "—"
    )


def _load_ceap_keywords(
    client: bigquery.Client,
    project: str,
    dataset: str,
    parlamentar_id: str,
    ibges: Sequence[str],
) -> Dict[str, Set[str]]:
    """Município IBGE → tokens de texto (CEAP tipo_despesa + objeto abreviado)."""
    if not ibges:
        return {}
    fq = f"`{project}.{dataset}.ceap_despesas`"
    sql = f"""
    SELECT DISTINCT
      REGEXP_REPLACE(CAST(codigo_ibge_municipio AS STRING), r'[^0-9]', '') AS ibge,
      CONCAT(IFNULL(tipo_despesa, ''), ' ', IFNULL(objeto, '')) AS texto
    FROM {fq}
    WHERE parlamentar_id = @pid
      AND codigo_ibge_municipio IN UNNEST(@ibges)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("pid", "STRING", parlamentar_id.strip()),
            bigquery.ArrayQueryParameter("ibges", "STRING", list(ibges)),
        ]
    )
    out: Dict[str, Set[str]] = {}
    for row in client.query(sql, job_config=job_config).result():
        ibge = _digits(str(getattr(row, "ibge", "") or ""))
        if len(ibge) >= 7:
            ibge = ibge[-7:]
        elif len(ibge) == 6:
            ibge = ibge.zfill(7)
        else:
            continue
        tx = getattr(row, "texto", "") or ""
        toks = _tokens(tx)
        out.setdefault(ibge, set()).update(toks)
    return out


def _match_pca_ceap(item_desc: str, ref: Set[str]) -> bool:
    if not ref:
        return False
    it = _tokens(item_desc)
    if not it:
        return False
    inter = it.intersection(ref)
    if len(inter) >= 2:
        return True
    if len(inter) == 1:
        tok = next(iter(inter))
        return len(tok) >= 6
    return False


def _gravar_alertas_oportunidade(
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
        tipo = str(a.get("tipo_risco") or "OPORTUNIDADE_COMERCIAL")
        msg = str(a.get("mensagem") or "")
        criado = a.get("criado_em")
        if not isinstance(criado, datetime):
            criado = datetime.now(timezone.utc)
        criado_iso = criado.isoformat()
        fonte = str(a.get("fonte") or "18_ingest_pncp_pca")
        doc_id = _alert_doc_id(politico_id, tipo, msg, criado_iso, fonte)
        payload = {
            "politico_id": politico_id,
            "parlamentar_id": politico_id,
            "tipo_risco": tipo,
            "mensagem": msg,
            "severidade": "INFO",
            "criticidade": "NIVEL_2",
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


def _sync_ui_snapshot(
    fs: firestore.Client,
    bq: bigquery.Client,
    *,
    politico_id: str,
    ibge_list: List[Tuple[str, str]],
) -> None:
    """Denormaliza PCA + caixa CEAP por município para o dossiê (sem N+1 no cliente)."""
    project = gcp_project_id()
    dataset = bq_dataset_id()
    ibges = [x[0] for x in ibge_list]
    if not ibges:
        return

    ibge_to_nome = {a: b for a, b in ibge_list}
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("ibges", "STRING", ibges),
            bigquery.ScalarQueryParameter("pid", "STRING", politico_id.strip()),
        ]
    )
    sql = f"""
    WITH pca AS (
      SELECT *
      FROM `{project}.{dataset}.{TABLE_PCA}`
      WHERE codigo_ibge_municipio IN UNNEST(@ibges)
    ),
    caixa AS (
      SELECT
        codigo_ibge_municipio AS ibge,
        SUM(IFNULL(valor_documento, 0)) AS caixa_ceap_parlamentar
      FROM `{project}.{dataset}.ceap_despesas`
      WHERE parlamentar_id = @pid
        AND codigo_ibge_municipio IN UNNEST(@ibges)
      GROUP BY 1
    )
    SELECT
      p.codigo_ibge_municipio AS ibge,
      MAX(IFNULL(c.caixa_ceap_parlamentar, 0)) AS caixa_ceap_parlamentar,
      ARRAY_AGG(
        STRUCT(
          p.item_descricao AS item_descricao,
          p.quantidade_estimada AS quantidade_estimada,
          p.valor_unitario_estimado AS valor_unitario_estimado,
          (IFNULL(p.quantidade_estimada, 0) * IFNULL(p.valor_unitario_estimado, 0)) AS valor_total_estimado,
          p.orgao_nome AS orgao_nome,
          p.orgao_cnpj AS orgao_cnpj,
          p.orgao_email AS orgao_email,
          p.orgao_telefone AS orgao_telefone
        )
        ORDER BY (IFNULL(p.quantidade_estimada, 0) * IFNULL(p.valor_unitario_estimado, 0)) DESC
        LIMIT 80
      ) AS itens
    FROM pca p
    LEFT JOIN caixa c ON c.ibge = p.codigo_ibge_municipio
    GROUP BY p.codigo_ibge_municipio
    """
    snap: Dict[str, Any] = {
        "rotulo_ui": "Oportunidades de Mercado",
        "atualizado_em": firestore.SERVER_TIMESTAMP,
        "municipios": [],
    }

    for row in bq.query(sql, job_config=job_config).result():
        ibge = str(getattr(row, "ibge", "") or "").strip()
        caixa = float(getattr(row, "caixa_ceap_parlamentar", 0) or 0)
        itens_raw = getattr(row, "itens", None)
        municipio_block: Dict[str, Any] = {
            "codigo_ibge_municipio": ibge,
            "nome_municipio": ibge_to_nome.get(ibge, ibge),
            "caixa_ceap_parlamentar_aprox": caixa,
            "proximas_aquisicoes_estimadas": [],
        }
        if itens_raw:
            for it in list(itens_raw):
                # ARRAY STRUCT → Row attributes
                desc = getattr(it, "item_descricao", "") or ""
                municipio_block["proximas_aquisicoes_estimadas"].append(
                    {
                        "item_descricao": desc,
                        "quantidade_estimada": getattr(it, "quantidade_estimada", None),
                        "valor_unitario_estimado": getattr(it, "valor_unitario_estimado", None),
                        "valor_total_estimado": getattr(it, "valor_total_estimado", None),
                        "valor_caixa_contexto_parlamentar": caixa,
                        "orgao_comprador": {
                            "nome": getattr(it, "orgao_nome", None),
                            "cnpj": getattr(it, "orgao_cnpj", None),
                            "email": getattr(it, "orgao_email", None),
                            "telefone": getattr(it, "orgao_telefone", None),
                        },
                    }
                )
        snap["municipios"].append(municipio_block)

    fs.collection(COLLECTION_POLITICOS).document(politico_id.strip()).set(
        {"oportunidades_mercado": snap},
        merge=True,
    )
    logger.info("Firestore merge `oportunidades_mercado` para politico=%s", politico_id)


def run(
    *,
    politico_id: Optional[str],
    dry_run: bool,
    max_pages: int,
    dias: int,
    lista_url: str,
    itens_tpl: str,
    skip_alerts: bool,
) -> int:
    project = gcp_project_id()
    dataset = bq_dataset_id()

    fim = datetime.now().date()
    ini = fim - timedelta(days=max(7, dias))
    data_ini = ini.strftime("%Y%m%d")
    data_fim = fim.strftime("%Y%m%d")

    session = requests.Session()
    fs = init_firestore()

    ibge_targets: List[Tuple[str, str]] = []
    politico_snap = politico_id.strip() if politico_id else ""

    if politico_snap:
        snap = fs.collection(COLLECTION_POLITICOS).document(politico_snap).get()
        if not snap.exists:
            logger.error("Politico %s não encontrado.", politico_snap)
            return 0
        data = snap.to_dict() or {}
        for m in _rows_municipios(data):
            ib = _extract_mun_ibge(m)
            if ib:
                ibge_targets.append((ib, _nome_municipio(m)))

    if not ibge_targets:
        # ingestão nacional mínima: capitais exemplo — fallback Belo Horizonte para não ficar vazio em dry-run
        ibge_targets = [("3106200", "Belo Horizonte")]
        logger.warning(
            "Sem municípios no perfil — usando fallback IBGE %s para captura PCA.",
            ibge_targets[0][0],
        )

    todas: List[Dict[str, Any]] = []
    for ibge, _nome in ibge_targets:
        time.sleep(PAGE_SLEEP_SEC)
        chunk = fetch_pca_for_ibge(
            session,
            codigo_ibge=ibge,
            data_ini=data_ini,
            data_fim=data_fim,
            max_pages=max_pages,
            lista_url=lista_url,
            itens_tpl=itens_tpl,
        )
        logger.info("PCA ibge=%s linhas=%s", ibge, len(chunk))
        todas.extend(chunk)

    logger.info("Total linhas PCA normalizadas: %s", len(todas))

    if dry_run:
        for x in todas[:6]:
            logger.info("[dry-run PCA] %s", {k: x[k] for k in list(x)[:8]})
        logger.info("[dry-run] Sem BigQuery / Firestore.")
        return 0

    bq = bigquery.Client(project=project)
    merged = _merge_pca_rows(bq, project, dataset, todas)
    logger.info("BigQuery MERGE `%s` (%s linhas).", TABLE_PCA, merged)

    if politico_snap and not skip_alerts:
        ibges_u = sorted({x[0] for x in ibge_targets})
        kw_by_mun = _load_ceap_keywords(bq, project, dataset, politico_snap, ibges_u)

        alertas: List[Dict[str, Any]] = []
        seen: Set[str] = set()

        for row in todas:
            ib = row.get("codigo_ibge_municipio") or ""
            desc = row.get("item_descricao") or ""
            ref = kw_by_mun.get(ib, set())
            if not _match_pca_ceap(str(desc), ref):
                continue
            rk = f"{ib}|{desc[:120]}"
            if rk in seen:
                continue
            seen.add(rk)
            alertas.append(
                {
                    "tipo_risco": "OPORTUNIDADE_COMERCIAL",
                    "mensagem": (
                        f"Intenção de compra PNCP alinhada ao perfil de despesas/emendas "
                        f"no IBGE {ib}: {desc[:400]}"
                    ),
                    "fonte": "18_ingest_pncp_pca",
                    "criado_em": datetime.now(timezone.utc),
                    "detalhe": {
                        "codigo_ibge_municipio": ib,
                        "item_descricao": desc[:1024],
                        "valor_unitario_estimado": row.get("valor_unitario_estimado"),
                        "quantidade_estimada": row.get("quantidade_estimada"),
                        "orgao": {
                            "nome": row.get("orgao_nome"),
                            "email": row.get("orgao_email"),
                            "telefone": row.get("orgao_telefone"),
                        },
                    },
                }
            )

        n_al = _gravar_alertas_oportunidade(fs, politico_id=politico_snap, alertas=alertas)
        logger.info("Alertas OPORTUNIDADE_COMERCIAL gravados: %s", n_al)

        try:
            _sync_ui_snapshot(fs, bq, politico_id=politico_snap, ibge_list=ibge_targets)
        except Exception as exc:
            logger.warning("Snapshot UI não atualizado: %s", exc)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PNCP PCA → BigQuery + alertas Firestore.")
    parser.add_argument("--politico-id", default=os.environ.get("POLITICO_ID", "").strip() or None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-pages", type=int, default=int(os.environ.get("PNCP_MAX_PAGES", "40")))
    parser.add_argument("--dias", type=int, default=int(os.environ.get("PNCP_PCA_DIAS", "365")))
    parser.add_argument("--lista-url", default=PNCP_PCA_URL_DEFAULT)
    parser.add_argument("--itens-url-template", default=PNCP_ITENS_TEMPLATE_DEFAULT)
    parser.add_argument("--skip-alerts", action="store_true")
    args = parser.parse_args()
    try:
        return run(
            politico_id=args.politico_id,
            dry_run=args.dry_run,
            max_pages=max(1, args.max_pages),
            dias=max(7, args.dias),
            lista_url=args.lista_url.strip(),
            itens_tpl=args.itens_url_template.strip(),
            skip_alerts=args.skip_alerts,
        )
    except Exception as exc:
        logger.exception("Falha ingestão PCA: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
