#!/usr/bin/env python3
"""
Carga INSS — Benefícios indeferidos (XLSX) → BigQuery `indeferimentos_brasil_raw`.

Fonte preferencial: API de download do portal dados.gov.br (evita CKAN Dataprev quando
rede GCP bloqueia `dadosabertos.dataprev.gov.br`).

Uso típico (máquina local ou VM com saída HTTPS para dados.gov.br):
  pip install pandas google-cloud-bigquery openpyxl requests
  python engines/26_inss_indeferimentos_bq_load.py \\
    --start 2025-01 --end 2026-05 --truncate-all

Plano B (Cloud Shell sem egress para gov.br): baixar XLSX no PC, subir para GCS e usar
`bq load` ou este script com `--local-dir path/to/xlsx`.

LGPD / produto:
  • Os arquivos públicos de indeferimento **não trazem telefone**; servem para triagem por
    UF, espécie, motivo, datas. Enriquecimento com telefone exige base legal e fontes próprias.
  • Para Diário Oficial em paralelo, use `engines/ingestors/runners/crawl_dou_inlabs.py` ou
    Querido Diário — não dependem da mesma tabela INSS.

Referência dataset: https://dados.gov.br/dados/conjuntos-dados/beneficios-indeferidos
"""

from __future__ import annotations

import argparse
import hashlib
import io
import logging
import re
import sys
import unicodedata
from datetime import datetime, timezone
from typing import Dict, Iterator, Optional

import pandas as pd
import requests
from google.cloud import bigquery

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

DEFAULT_PROJECT = "transparenciabr"
DEFAULT_TABLE = "transparenciabr.tbr_leads_prev.indeferimentos_brasil_raw"
DOWNLOAD_BASE = (
    "https://dados.gov.br/api/publico/conjuntos-dados/beneficios-indeferidos/"
    "recursos/download?recurso=beneficios-indeferidos-{ym}"
)

USER_AGENT = "TransparenciaBR-engines/1.0 (26 INSS indeferimentos)"

REQUEST_TIMEOUT = (15, 300)
MAX_DOWNLOAD_RETRIES = 4
CHUNK_ROWS = 150_000

# Schema alinhado à tabela particionada em `mes_referencia`
BQ_SCHEMA = [
    bigquery.SchemaField("mes_referencia", "DATE", mode="NULLABLE"),
    bigquery.SchemaField("cpf", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("dt_nascimento", "DATE", mode="NULLABLE"),
    bigquery.SchemaField("sexo", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("uf", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("especie_codigo", "INTEGER", mode="NULLABLE"),
    bigquery.SchemaField("especie_nome", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("motivo_indeferimento", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("dt_indeferimento", "DATE", mode="NULLABLE"),
    bigquery.SchemaField("dt_der", "DATE", mode="NULLABLE"),
    bigquery.SchemaField("clientela", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("forma_filiacao", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("ramo_atividade", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("aps_codigo", "INTEGER", mode="NULLABLE"),
    bigquery.SchemaField("aps_nome", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("source_file", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("_row_hash", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("_loaded_at", "TIMESTAMP", mode="NULLABLE"),
]


def _strip_accents(s: str) -> str:
    nfd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def _normalize_col(name: str) -> str:
    x = _strip_accents(name.strip().lower())
    x = re.sub(r"\s+", "_", x)
    x = x.replace("/", "_").replace("-", "_")
    return x


def month_range(ym_start: str, ym_end: str) -> Iterator[str]:
    y1, m1 = map(int, ym_start.split("-"))
    y2, m2 = map(int, ym_end.split("-"))
    cy, cm = y1, m1
    while (cy < y2) or (cy == y2 and cm <= m2):
        yield f"{cy:04d}-{cm:02d}"
        cm += 1
        if cm > 12:
            cm = 1
            cy += 1


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
    return s


def download_xlsx(sess: requests.Session, ym: str) -> Optional[bytes]:
    url = DOWNLOAD_BASE.format(ym=ym)
    for attempt in range(MAX_DOWNLOAD_RETRIES):
        try:
            logger.info("GET (%s/%s) %s", attempt + 1, MAX_DOWNLOAD_RETRIES, url)
            r = sess.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            if r.status_code == 404:
                logger.warning("Recurso inexistente (404): %s — pulando.", ym)
                return None
            r.raise_for_status()
            return r.content
        except (requests.RequestException, OSError) as e:
            logger.warning("Falha download %s: %s", ym, e)
            if attempt == MAX_DOWNLOAD_RETRIES - 1:
                return None
    return None


def read_xlsx_bytes(data: bytes) -> pd.DataFrame:
    return pd.read_excel(io.BytesIO(data), engine="openpyxl", dtype=str)


def read_local_xlsx(path: str) -> pd.DataFrame:
    return pd.read_excel(path, engine="openpyxl", dtype=str)


def map_columns(df: pd.DataFrame) -> pd.DataFrame:
    col_map: Dict[str, str] = {
        "competencia": "mes_referencia",
        "competência": "mes_referencia",
        "nb": "cpf",
        "cpf": "cpf",
        "cpf_beneficiario": "cpf",
        "nu_cpf": "cpf",
        "data_nascimento": "dt_nascimento",
        "dt_nascimento": "dt_nascimento",
        "sexo": "sexo",
        "uf": "uf",
        "sg_uf": "uf",
        "especie": "especie_codigo",
        "cod_especie": "especie_codigo",
        "codigo_especie": "especie_codigo",
        "descricao_especie": "especie_nome",
        "desc_especie": "especie_nome",
        "motivo": "motivo_indeferimento",
        "motivo_indeferimento": "motivo_indeferimento",
        "motivo_indeferimento_descricao": "motivo_indeferimento",
        "data_indeferimento": "dt_indeferimento",
        "dt_indeferimento": "dt_indeferimento",
        "dt_despacho": "dt_indeferimento",
        "data_entrada_requerimento": "dt_der",
        "der": "dt_der",
        "dt_der": "dt_der",
        "clientela": "clientela",
        "forma_filiacao": "forma_filiacao",
        "ramo_atividade": "ramo_atividade",
        "codigo_aps": "aps_codigo",
        "aps_codigo": "aps_codigo",
        "nome_aps": "aps_nome",
        "aps_nome": "aps_nome",
    }

    rename: Dict[str, str] = {}
    for orig in df.columns:
        key = _normalize_col(orig)
        if key in col_map:
            rename[orig] = col_map[key]
        else:
            rename[orig] = key

    out = df.rename(columns=rename)

    # Se ainda não tem mes_referencia, tenta coluna competência com nome só normalizado
    for c in list(out.columns):
        nk = _normalize_col(str(c))
        if nk in ("competencia", "competência") and "mes_referencia" not in out.columns:
            out = out.rename(columns={c: "mes_referencia"})
            break

    return out


def _parse_date_series(s: pd.Series) -> pd.Series:
    if s is None or len(s) == 0:
        return s
    x = pd.to_datetime(s, errors="coerce", dayfirst=True)
    return x.dt.date


def _parse_int_series(s: pd.Series) -> pd.Series:
    z = pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")
    return z.astype("Int64")


def build_output_frame(raw: pd.DataFrame, source_key: str) -> pd.DataFrame:
    m = map_columns(raw)
    n = len(m)
    z = pd.Series([pd.NaT] * n)
    zn = pd.Series([pd.NA] * n, dtype="Int64")

    out = pd.DataFrame()

    out["mes_referencia"] = _parse_date_series(m["mes_referencia"]) if "mes_referencia" in m else z
    if "cpf" in m:
        out["cpf"] = m["cpf"].astype(str).str.replace(r"\D", "", regex=True)
    else:
        out["cpf"] = pd.Series([None] * n, dtype="object")
    out["dt_nascimento"] = (
        _parse_date_series(m["dt_nascimento"]) if "dt_nascimento" in m else z
    )
    out["sexo"] = m["sexo"] if "sexo" in m else None
    if "uf" in m:
        out["uf"] = m["uf"].astype(str).str.upper().str.slice(0, 2)
    else:
        out["uf"] = pd.Series([None] * n, dtype="object")
    out["especie_codigo"] = (
        _parse_int_series(m["especie_codigo"]) if "especie_codigo" in m else zn
    )
    out["especie_nome"] = m["especie_nome"] if "especie_nome" in m else None
    out["motivo_indeferimento"] = (
        m["motivo_indeferimento"] if "motivo_indeferimento" in m else None
    )
    out["dt_indeferimento"] = (
        _parse_date_series(m["dt_indeferimento"]) if "dt_indeferimento" in m else z
    )
    out["dt_der"] = _parse_date_series(m["dt_der"]) if "dt_der" in m else z
    out["clientela"] = m["clientela"] if "clientela" in m else None
    out["forma_filiacao"] = m["forma_filiacao"] if "forma_filiacao" in m else None
    out["ramo_atividade"] = m["ramo_atividade"] if "ramo_atividade" in m else None
    out["aps_codigo"] = _parse_int_series(m["aps_codigo"]) if "aps_codigo" in m else zn
    out["aps_nome"] = m["aps_nome"] if "aps_nome" in m else None
    out["source_file"] = source_key
    out["_loaded_at"] = datetime.now(timezone.utc)

    def row_hash_row(r: pd.Series) -> str:
        blob = "|".join(
            str(r.get(c, "") or "")
            for c in (
                "mes_referencia",
                "cpf",
                "uf",
                "especie_codigo",
                "motivo_indeferimento",
                "dt_indeferimento",
                "source_file",
            )
        )
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    out["_row_hash"] = out.apply(row_hash_row, axis=1)
    return out


def load_chunks(
    client: bigquery.Client,
    table_id: str,
    df: pd.DataFrame,
    *,
    write_disposition: str,
    first_run: bool,
) -> int:
    """Carrega em fatias para não estourar memória no cliente BQ."""
    total = 0
    n = len(df)
    if n == 0:
        return 0

    for start in range(0, n, CHUNK_ROWS):
        chunk = df.iloc[start : start + CHUNK_ROWS]
        wd = (
            write_disposition
            if first_run and start == 0
            else bigquery.WriteDisposition.WRITE_APPEND
        )
        job_config = bigquery.LoadJobConfig(
            schema=BQ_SCHEMA,
            write_disposition=wd,
            time_partitioning=bigquery.TimePartitioning(field="mes_referencia"),
            clustering_fields=["uf", "especie_codigo"],
        )
        job = client.load_table_from_dataframe(chunk, table_id, job_config=job_config)
        job.result()
        total += len(chunk)
        logger.info(
            "Chunk BQ %s–%s carregado (%s linhas acum.)",
            start,
            start + len(chunk),
            total,
        )

    return total


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="INSS indeferidos → BigQuery (dados.gov.br)")
    p.add_argument("--project", default=DEFAULT_PROJECT)
    p.add_argument("--table", default=DEFAULT_TABLE, help="project.dataset.table completo")
    p.add_argument("--start", default="2024-04", help="YYYY-MM primeiro mês")
    p.add_argument("--end", default="2026-05", help="YYYY-MM último mês (inclusive)")
    p.add_argument(
        "--truncate-all",
        action="store_true",
        help="WRITE_TRUNCATE no primeiro chunk (apaga tabela e recarrega do zero)",
    )
    p.add_argument(
        "--local-dir",
        default="",
        help="Se definido, lê Beneficios*.xlsx desta pasta em vez de baixar",
    )
    p.add_argument("--dry-run", action="store_true", help="Só baixa/lê e loga linhas, sem BQ")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    client = bigquery.Client(project=args.project)

    sess = session()
    grand_total = 0
    first_load = True

    months = list(month_range(args.start, args.end))
    logger.info("Meses: %s … %s (%d arquivos)", months[0], months[-1], len(months))

    if args.local_dir:
        import glob
        import os

        paths = sorted(
            glob.glob(os.path.join(args.local_dir, "*.xlsx"))
            + glob.glob(os.path.join(args.local_dir, "*.XLSX"))
        )
        if not paths:
            logger.error("Nenhum XLSX em %s", args.local_dir)
            return 1
        for path in paths:
            base = os.path.basename(path)
            logger.info("Lendo local: %s", base)
            raw = read_local_xlsx(path)
            out = build_output_frame(raw, base)
            logger.info("  → %s linhas normalizadas", f"{len(out):,}")
            if args.dry_run:
                grand_total += len(out)
                continue
            wd = (
                bigquery.WriteDisposition.WRITE_TRUNCATE
                if args.truncate_all and first_load
                else bigquery.WriteDisposition.WRITE_APPEND
            )
            n = load_chunks(client, args.table, out, write_disposition=wd, first_run=first_load)
            first_load = False
            grand_total += n
    else:
        for ym in months:
            key = f"beneficios-indeferidos-{ym}.xlsx"
            blob = download_xlsx(sess, ym)
            if not blob:
                continue
            try:
                raw = read_xlsx_bytes(blob)
            except Exception as e:
                logger.error("Falha ao ler Excel %s: %s", ym, e)
                continue

            out = build_output_frame(raw, key)
            logger.info("%s → %s linhas normalizadas", ym, f"{len(out):,}")

            if args.dry_run:
                grand_total += len(out)
                continue

            wd = (
                bigquery.WriteDisposition.WRITE_TRUNCATE
                if args.truncate_all and first_load
                else bigquery.WriteDisposition.WRITE_APPEND
            )
            n = load_chunks(client, args.table, out, write_disposition=wd, first_run=first_load)
            first_load = False
            grand_total += n

    logger.info("Concluído. Total linhas processadas: %s", f"{grand_total:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
