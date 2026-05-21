#!/usr/bin/env python3
"""
Engine 02b — Ingestão de Emendas via CSV Bulk (fallback).

Quando a API paginada da CGU retorna 405 (Engine 02), este engine
baixa o arquivo CSV completo do Portal da Transparência:
  https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO

Não precisa de API key. Não tem paginação. Baixa tudo de uma vez.

Uso:
    python3 engines/02b_ingest_emendas_bulk.py
    python3 engines/02b_ingest_emendas_bulk.py --ano-min 2023
    python3 engines/02b_ingest_emendas_bulk.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import os
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import gcp_project_id, bq_dataset_id
from lib.bigquery_helpers import get_client, new_batch_id
from google.cloud import bigquery

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

GCP_PROJECT_ID = gcp_project_id()
BQ_DATASET = bq_dataset_id()
BQ_TABLE_EMENDAS = "emendas"

# URL do download bulk do Portal da Transparência
BULK_DOWNLOAD_URL = (
    "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"
)

# Schema idêntico ao engine 02 para compatibilidade
SCHEMA = [
    bigquery.SchemaField("codigoEmenda",   "STRING",    mode="REQUIRED"),
    bigquery.SchemaField("autor",          "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("cpfCnpjAutor",   "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("valorEmpenhado", "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("valorLiquidado", "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("valorPago",      "FLOAT",     mode="NULLABLE"),
    bigquery.SchemaField("descricao",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("ano",            "INTEGER",   mode="NULLABLE"),
    bigquery.SchemaField("funcao",         "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("subfuncao",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("municipio",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("estado",         "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("tipoEmenda",     "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("nomeAutor",      "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("localidade",     "STRING",    mode="NULLABLE"),
    bigquery.SchemaField("ingest_batch_id","STRING",    mode="NULLABLE"),
    bigquery.SchemaField("fetched_at",     "TIMESTAMP", mode="NULLABLE"),
]

# Mapeamento de colunas do CSV para campos do BigQuery
# O CSV do Portal pode ter nomes variados; mapeamos os mais comuns
CSV_FIELD_MAP = {
    "CÓDIGO DA EMENDA": "codigoEmenda",
    "CODIGO DA EMENDA": "codigoEmenda",
    "CÓDIGO EMENDA": "codigoEmenda",
    "CODIGO EMENDA": "codigoEmenda",
    "codigoEmenda": "codigoEmenda",
    "NOME DO AUTOR DA EMENDA": "autor",
    "NOME AUTOR": "autor",
    "AUTOR DA EMENDA": "autor",
    "autor": "autor",
    "CÓDIGO DO AUTOR DA EMENDA": "cpfCnpjAutor",
    "CPF/CNPJ AUTOR": "cpfCnpjAutor",
    "cpfCnpjAutor": "cpfCnpjAutor",
    "VALOR EMPENHADO": "valorEmpenhado",
    "valorEmpenhado": "valorEmpenhado",
    "VALOR LIQUIDADO": "valorLiquidado",
    "valorLiquidado": "valorLiquidado",
    "VALOR PAGO": "valorPago",
    "valorPago": "valorPago",
    "VALOR RESTOS A PAGAR PAGOS": "valorPago",
    "ANO DA EMENDA": "ano",
    "ANO EMENDA": "ano",
    "ANO": "ano",
    "ano": "ano",
    "NOME FUNÇÃO": "funcao",
    "FUNÇÃO": "funcao",
    "funcao": "funcao",
    "NOME SUBFUNÇÃO": "subfuncao",
    "SUBFUNÇÃO": "subfuncao",
    "subfuncao": "subfuncao",
    "NOME MUNICÍPIO DO GASTO": "municipio",
    "MUNICÍPIO": "municipio",
    "municipio": "municipio",
    "SIGLA UF GASTO": "estado",
    "UF": "estado",
    "UF GASTO": "estado",
    "estado": "estado",
    "TIPO DE EMENDA": "tipoEmenda",
    "TIPO EMENDA": "tipoEmenda",
    "tipoEmenda": "tipoEmenda",
    "LOCALIDADE DO GASTO": "localidade",
    "localidade": "localidade",
}


def _parse_float(value: Any) -> float:
    """Parse float from Brazilian format (1.234,56) or standard."""
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text == "-":
        return 0.0
    # Brazilian format: 1.234.567,89
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def _parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def download_bulk_csv(url: str, dest_dir: str) -> List[str]:
    """Download bulk ZIP/CSV from Portal da Transparência. Returns list of CSV paths."""
    logger.info("Baixando arquivo bulk de: %s", url)
    
    headers = {
        "User-Agent": "TransparenciaBR-Ingestor/1.0 (https://transparenciabr.web.app)",
        "Accept": "application/zip, application/octet-stream, text/csv, */*",
    }
    
    resp = requests.get(url, headers=headers, stream=True, timeout=(30, 300))
    resp.raise_for_status()
    
    content_type = resp.headers.get("Content-Type", "")
    content_disp = resp.headers.get("Content-Disposition", "")
    
    # Salva em arquivo temporário
    suffix = ".zip" if "zip" in content_type.lower() or "zip" in content_disp.lower() else ".csv"
    tmp_path = os.path.join(dest_dir, f"emendas_bulk{suffix}")
    
    total_bytes = 0
    with open(tmp_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):  # 1MB chunks
            f.write(chunk)
            total_bytes += len(chunk)
    
    logger.info("Download concluído: %s (%.1f MB)", tmp_path, total_bytes / 1024 / 1024)
    
    csv_paths = []
    
    if suffix == ".zip" or zipfile.is_zipfile(tmp_path):
        logger.info("Extraindo ZIP...")
        with zipfile.ZipFile(tmp_path, "r") as zf:
            for name in zf.namelist():
                if name.lower().endswith(".csv"):
                    extracted = zf.extract(name, dest_dir)
                    csv_paths.append(extracted)
                    logger.info("  Extraído: %s", name)
        if not csv_paths:
            # Se não tem CSV dentro do ZIP, tenta o próprio arquivo
            logger.warning("ZIP sem CSVs. Tentando como CSV direto.")
            csv_paths.append(tmp_path)
    else:
        csv_paths.append(tmp_path)
    
    return csv_paths


def parse_csv_to_rows(
    csv_path: str,
    *,
    batch_id: str,
    existing_codes: set,
    ano_min: int | None = None,
) -> List[Dict[str, Any]]:
    """Parse CSV file and return list of BigQuery-ready rows."""
    rows = []
    skipped_existing = 0
    skipped_year = 0
    
    # Tenta detectar encoding e delimiter
    with open(csv_path, "rb") as f:
        raw = f.read(4096)
    
    # Detecta encoding
    encoding = "utf-8"
    for enc in ("utf-8-sig", "utf-8", "latin1", "cp1252"):
        try:
            raw.decode(enc)
            encoding = enc
            break
        except (UnicodeDecodeError, LookupError):
            continue
    
    # Detecta delimiter
    sample = raw.decode(encoding, errors="replace")
    delimiter = ";"  # Padrão do Portal da Transparência
    if sample.count("\t") > sample.count(";"):
        delimiter = "\t"
    elif sample.count(",") > sample.count(";") and "," not in sample.split("\n")[1][:50]:
        delimiter = ","
    
    logger.info("Parseando CSV: %s (encoding=%s, delimiter=%r)", csv_path, encoding, delimiter)
    
    with open(csv_path, "r", encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        
        # Mapeia headers do CSV para campos do BQ
        if reader.fieldnames:
            logger.info("Colunas do CSV: %s", reader.fieldnames[:10])
        
        now_iso = datetime.now(timezone.utc).isoformat()
        
        for i, raw_row in enumerate(reader):
            # Mapeia campos
            mapped = {}
            for csv_col, value in raw_row.items():
                if csv_col is None:
                    continue
                csv_col_clean = csv_col.strip()
                bq_field = CSV_FIELD_MAP.get(csv_col_clean)
                if bq_field and value is not None:
                    mapped[bq_field] = str(value).strip()
            
            # Extrai código da emenda
            codigo = mapped.get("codigoEmenda", "").strip()
            if not codigo:
                continue
            
            # Deduplicação
            if codigo in existing_codes:
                skipped_existing += 1
                continue
            
            # Filtro por ano
            ano = _parse_int(mapped.get("ano"))
            if ano_min and ano and ano < ano_min:
                skipped_year += 1
                continue
            
            existing_codes.add(codigo)
            
            rows.append({
                "codigoEmenda": codigo,
                "autor": mapped.get("autor") or mapped.get("nomeAutor"),
                "cpfCnpjAutor": mapped.get("cpfCnpjAutor"),
                "valorEmpenhado": _parse_float(mapped.get("valorEmpenhado")),
                "valorLiquidado": _parse_float(mapped.get("valorLiquidado")),
                "valorPago": _parse_float(mapped.get("valorPago")),
                "descricao": mapped.get("tipoEmenda") or mapped.get("descricao"),
                "ano": ano,
                "funcao": mapped.get("funcao"),
                "subfuncao": mapped.get("subfuncao"),
                "municipio": mapped.get("municipio"),
                "estado": mapped.get("estado"),
                "tipoEmenda": mapped.get("tipoEmenda"),
                "nomeAutor": mapped.get("nomeAutor") or mapped.get("autor"),
                "localidade": mapped.get("localidade"),
                "ingest_batch_id": batch_id,
                "fetched_at": now_iso,
            })
            
            if (i + 1) % 10000 == 0:
                logger.info("  ... %s linhas processadas, %s novas", i + 1, len(rows))
    
    logger.info(
        "CSV parseado: %s novas | %s duplicadas | %s filtradas por ano",
        len(rows), skipped_existing, skipped_year,
    )
    return rows


def load_to_bigquery(client: bigquery.Client, rows: List[Dict], batch_size: int = 5000) -> int:
    """Load rows to BigQuery in batches."""
    if not rows:
        return 0
    
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    
    # Garante que a tabela existe
    table = bigquery.Table(table_ref, schema=SCHEMA)
    client.create_table(table, exists_ok=True)
    
    total_loaded = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        job_config = bigquery.LoadJobConfig(
            schema=SCHEMA,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
            schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
            ignore_unknown_values=True,
        )
        job = client.load_table_from_json(batch, table_ref, job_config=job_config)
        job.result()
        total_loaded += len(batch)
        logger.info("  BigQuery batch %s-%s: %s rows loaded", i, i + len(batch), len(batch))
    
    return total_loaded


def load_existing_codes(client: bigquery.Client) -> set:
    """Load existing emenda codes from BigQuery for deduplication."""
    table_ref = f"{GCP_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_EMENDAS}"
    sql = f"""
    SELECT DISTINCT CAST(codigoEmenda AS STRING) AS code
    FROM `{table_ref}`
    WHERE codigoEmenda IS NOT NULL
    """
    try:
        result = client.query(sql).result()
        codes = {str(row.code).strip() for row in result if row.code}
        logger.info("Códigos existentes no BigQuery: %s", len(codes))
        return codes
    except Exception as e:
        logger.warning("Não foi possível carregar códigos existentes: %s", e)
        return set()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Engine 02b — Ingestão de emendas via CSV bulk (fallback para API 405).",
    )
    parser.add_argument("--ano-min", type=int, default=None,
                        help="Ano mínimo para filtrar (ex: 2023). Se omitido, importa tudo.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Baixa e parseia mas não insere no BigQuery.")
    parser.add_argument("--url", type=str, default=BULK_DOWNLOAD_URL,
                        help="URL alternativa para download.")
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("Engine 02b — Ingestão Bulk de Emendas Parlamentares")
    logger.info("=" * 60)
    logger.info("URL: %s", args.url)
    logger.info("Ano mínimo: %s", args.ano_min or "todos")
    logger.info("Dry run: %s", args.dry_run)
    
    client = get_client()
    batch_id = new_batch_id()
    existing_codes = load_existing_codes(client)
    
    with tempfile.TemporaryDirectory(prefix="emendas_bulk_") as tmpdir:
        try:
            csv_paths = download_bulk_csv(args.url, tmpdir)
        except Exception as e:
            logger.error("Falha no download bulk: %s", e)
            logger.info("Tentando URL alternativa por ano...")
            # Fallback: tentar download por ano individual
            csv_paths = []
            anos = range(args.ano_min or 2018, datetime.now().year + 1)
            for ano in anos:
                url_ano = f"https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/{ano}"
                try:
                    paths = download_bulk_csv(url_ano, tmpdir)
                    csv_paths.extend(paths)
                    logger.info("Ano %s: download OK", ano)
                except Exception as e2:
                    logger.warning("Ano %s: falha no download: %s", ano, e2)
            
            if not csv_paths:
                logger.error("Nenhum CSV obtido. Abortando.")
                return 1
        
        all_rows = []
        for csv_path in csv_paths:
            rows = parse_csv_to_rows(
                csv_path,
                batch_id=batch_id,
                existing_codes=existing_codes,
                ano_min=args.ano_min,
            )
            all_rows.extend(rows)
        
        logger.info("Total de novas emendas a inserir: %s", len(all_rows))
        
        if args.dry_run:
            logger.info("[DRY RUN] Nenhuma inserção feita.")
            # Mostra amostra
            if all_rows:
                import json
                logger.info("Amostra (primeira emenda):")
                logger.info(json.dumps(all_rows[0], indent=2, ensure_ascii=False, default=str))
                # Conta por ano
                anos_count = {}
                for r in all_rows:
                    a = r.get("ano")
                    if a:
                        anos_count[a] = anos_count.get(a, 0) + 1
                logger.info("Distribuição por ano: %s", dict(sorted(anos_count.items())))
            return 0
        
        if not all_rows:
            logger.info("Nenhuma emenda nova para inserir.")
            return 0
        
        total = load_to_bigquery(client, all_rows)
        logger.info("✅ Ingestão bulk concluída: %s emendas inseridas no BigQuery.", total)
        
        # Verificação
        anos_count = {}
        for r in all_rows:
            a = r.get("ano")
            if a:
                anos_count[a] = anos_count.get(a, 0) + 1
        logger.info("Distribuição por ano: %s", dict(sorted(anos_count.items())))
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
