#!/usr/bin/env python3
"""
Engine 02 — ETL PNCP: NDJSON bruto (engine 00) → purificação → carga BigQuery.

- Leitura em lote do NDJSON (blocos de linhas para uso estável de memória).
- Tipagem: moedas → FLOAT64; datas → string ISO 8601.
- LGPD: ofuscação de CPF solto em textos (CNPJ de empresa preservado).
- Carga: ``LoadJobConfig`` + ``write_disposition=WRITE_APPEND`` +
  ``load_table_from_file`` (um job por arquivo, sem insert linha a linha).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from google.cloud import bigquery
from google.cloud.bigquery import LoadJobConfig, SourceFormat

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.pncp_transform import apply_lgpd_structure, purify_for_bigquery
from lib.project_config import bq_dataset_id, bq_table_fqn, gcp_project_id

_LOG_JSON = os.environ.get("ENGINE_LOG_JSON", "").lower() in ("1", "true", "yes")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        from datetime import datetime, timezone

        payload = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging(level: int) -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    if _LOG_JSON:
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
    root.addHandler(handler)
    root.setLevel(level)


logger = logging.getLogger("engine02_pncp_etl")

DEFAULT_TABLE = os.environ.get("PNCP_BQ_TABLE_STAGING", "staging_pncp_contratos_raw")
READ_BATCH_LINES = int(os.environ.get("PNCP_ETL_READ_BATCH_LINES", "2000"))


def iter_ndjson_batches(path: Path, batch_size: int) -> Iterator[List[str]]:
    """Itera o arquivo NDJSON em listas de até ``batch_size`` linhas não vazias."""
    batch: List[str] = []
    with path.open("r", encoding="utf-8") as fp:
        for line in fp:
            s = line.strip()
            if not s:
                continue
            batch.append(s)
            if len(batch) >= batch_size:
                yield batch
                batch = []
    if batch:
        yield batch


def process_record(raw_line: str, *, lgpd_hash_cpfs: bool) -> Optional[Dict[str, Any]]:
    """Parse JSON, purifica tipos/datas e aplica ofuscação LGPD."""
    try:
        obj = json.loads(raw_line)
    except json.JSONDecodeError as exc:
        logger.warning("Linha NDJSON inválida (skip) | erro=%s | amostra=%s", exc, raw_line[:200])
        return None
    if not isinstance(obj, dict):
        logger.warning("Registro ignorado (não é objeto JSON na raiz) | tipo=%s", type(obj).__name__)
        return None
    purified = purify_for_bigquery(obj, lgpd_hash_cpfs=lgpd_hash_cpfs)
    if not isinstance(purified, dict):
        return None
    return apply_lgpd_structure(purified, use_hash=lgpd_hash_cpfs)


def write_purified_ndjson(
    input_path: Path,
    output_path: Path,
    *,
    lgpd_hash_cpfs: bool,
) -> int:
    """
    Lê o NDJSON de entrada em lotes, grava NDJSON purificado.

    Returns
    -------
    int
        Número de objetos gravados.
    """
    total_out = 0
    batches = 0
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as out_fp:
        for lines in iter_ndjson_batches(input_path, READ_BATCH_LINES):
            batches += 1
            for raw in lines:
                rec = process_record(raw, lgpd_hash_cpfs=lgpd_hash_cpfs)
                if rec is None:
                    continue
                out_fp.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
                total_out += 1
            logger.info(
                "ETL lote NDJSON | arquivo=%s | lote_idx=%s | linhas_lote=%s | acumulado_out=%s",
                input_path,
                batches,
                len(lines),
                total_out,
            )
    logger.info(
        "ETL purificação concluída | registros_saida=%s | lotes=%s | destino=%s",
        total_out,
        batches,
        output_path,
    )
    return total_out


def load_ndjson_to_bigquery(
    *,
    client: bigquery.Client,
    table_fqn: str,
    ndjson_path: Path,
) -> bigquery.LoadJob:
    """
    Envia o arquivo NDJSON completo via job de carga (WRITE_APPEND).

    ``autodetect=True`` interpreta os tipos a partir do JSON já normalizado
    (floats e strings ISO 8601).
    """
    job_config = LoadJobConfig(
        source_format=SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        autodetect=True,
    )
    logger.info(
        "BigQuery load job iniciado | tabela=%s | arquivo=%s | bytes=%s | disposition=WRITE_APPEND",
        table_fqn,
        ndjson_path,
        ndjson_path.stat().st_size,
    )
    with ndjson_path.open("rb") as fh:
        job = client.load_table_from_file(fh, table_fqn, job_config=job_config)
    job.result()
    dest = client.get_table(table_fqn)
    logger.info(
        "BigQuery load job concluído | job_id=%s | tabela=%s | linhas_tabela=%s",
        job.job_id,
        table_fqn,
        dest.num_rows,
    )
    return job


def run_etl(
    *,
    input_path: Path,
    table: str,
    lgpd_hash_cpfs: bool,
    keep_temp: bool,
    dry_run: bool,
) -> int:
    """Orquestra purificação + carga."""
    if not input_path.is_file():
        logger.error("Arquivo de entrada inexistente | path=%s", input_path.resolve())
        return 2

    project = gcp_project_id()
    dataset = bq_dataset_id()
    table_fqn = bq_table_fqn(table)
    client: Optional[bigquery.Client] = None if dry_run else bigquery.Client(project=project)

    suffix = ".ndjson"
    base = input_path.stem if input_path.suffix else input_path.name
    tmp_dir = input_path.parent
    if keep_temp:
        purified_path = tmp_dir / f"{base}_purified{suffix}"
        tmp_ctx = None
    else:
        tmp_ctx = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=suffix,
            prefix=f"{base}_purified_",
            delete=False,
            encoding="utf-8",
        )
        tmp_ctx.close()
        purified_path = Path(tmp_ctx.name)

    try:
        n = write_purified_ndjson(input_path, purified_path, lgpd_hash_cpfs=lgpd_hash_cpfs)
        if n == 0:
            logger.warning("Nenhum registro purificado; load job não será enviado.")
            return 0

        if dry_run:
            logger.info(
                "[dry-run] Purificação concluída sem BigQuery | registros=%s | arquivo=%s",
                n,
                purified_path,
            )
            return 0

        assert client is not None
        load_ndjson_to_bigquery(client=client, table_fqn=table_fqn, ndjson_path=purified_path)
        logger.info(
            "Engine 02 finalizado | projeto=%s | dataset=%s | tabela=%s | registros_carregados=%s",
            project,
            dataset,
            table,
            n,
        )
        return 0
    finally:
        if not keep_temp and purified_path.exists() and tmp_ctx is not None:
            try:
                purified_path.unlink()
                logger.debug("Arquivo temporário purificado removido | path=%s", purified_path)
            except OSError as exc:
                logger.warning("Falha ao remover temporário | path=%s | erro=%s", purified_path, exc)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Engine 02 — Purificação NDJSON PNCP + carga BigQuery (load job).",
    )
    p.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Caminho do NDJSON bruto produzido pelo engine 00.",
    )
    p.add_argument(
        "--table",
        default=DEFAULT_TABLE,
        help="Nome da tabela no dataset configurado (BQ_DATASET / transparenciabr).",
    )
    p.add_argument(
        "--lgpd-hash",
        action="store_true",
        help="Substituir CPFs por etiqueta SHA-256 parcial em vez de máscara com asteriscos.",
    )
    p.add_argument(
        "--keep-temp",
        action="store_true",
        help="Grava o NDJSON purificado ao lado do input em vez de arquivo temporário.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Executa apenas a purificação NDJSON; não cria cliente BigQuery nem load job.",
    )
    p.add_argument(
        "--log-level",
        default=os.environ.get("ENGINE_LOG_LEVEL", "INFO"),
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return p


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    _configure_logging(getattr(logging, args.log_level.upper(), logging.INFO))
    return run_etl(
        input_path=args.input,
        table=args.table,
        lgpd_hash_cpfs=args.lgpd_hash,
        keep_temp=args.keep_temp,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
