#!/usr/bin/env python3
"""
Engine 02 - ETL PNCP contratos NDJSON para BigQuery.

Le o NDJSON bruto produzido pela engine 00, aplica tipagem compativel com
BigQuery, ofusca CPFs soltos em campos descritivos e carrega o arquivo inteiro
por batch load job. Nao usa streaming inserts linha a linha.

Exemplos:
  python3 engines/02_engine_etl.py --input data/raw/pncp_contratos.ndjson
  python3 engines/02_engine_etl.py --input gs://bucket/pncp/raw.ndjson --table pncp_contratos
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import tempfile
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from google.cloud import bigquery

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_02_pncp_etl")

DEFAULT_TABLE = os.environ.get("PNCP_BQ_TABLE", "pncp_contratos")

MONEY_FIELD_HINTS = (
    "valor",
    "vlr",
    "preco",
    "orcado",
    "orcamento",
    "estimado",
    "total",
)
DATE_FIELD_HINTS = ("data", "date", "dt")
DESCRIPTION_FIELD_HINTS = (
    "descricao",
    "objeto",
    "observacao",
    "justificativa",
    "informacao",
    "historico",
)

# CPFs com ou sem pontuacao, evitando sequencias maiores e CNPJs (14 digitos).
CPF_PATTERN = re.compile(r"(?<!\d)(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})(?!\d)")
CNPJ_PATTERN = re.compile(r"(?<!\d)\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}(?!\d)")


def _parse_gs_uri(uri: str) -> Tuple[str, str]:
    """Separa bucket e objeto de uma URI gs://."""

    if not uri.startswith("gs://"):
        raise ValueError(f"URI GCS invalida: {uri}")
    rest = uri[5:]
    bucket, _, blob = rest.partition("/")
    if not bucket or not blob:
        raise ValueError(f"URI GCS deve conter bucket e objeto: {uri}")
    return bucket, blob


def _download_gcs_to_temp(gcs_uri: str) -> Path:
    """Baixa objeto GCS para arquivo temporario local."""

    from google.cloud import storage

    bucket_name, blob_name = _parse_gs_uri(gcs_uri)
    tmp = tempfile.NamedTemporaryFile(prefix="pncp_raw_", suffix=".ndjson", delete=False)
    tmp.close()
    target = Path(tmp.name)
    storage.Client().bucket(bucket_name).blob(blob_name).download_to_filename(str(target))
    logger.info("Raw NDJSON downloaded from GCS: uri=%s bytes=%s", gcs_uri, target.stat().st_size)
    return target


def _upload_temp_to_gcs(local_path: Path, gcs_uri: str) -> None:
    """Envia NDJSON normalizado temporario para GCS."""

    from google.cloud import storage

    bucket_name, blob_name = _parse_gs_uri(gcs_uri)
    storage.Client().bucket(bucket_name).blob(blob_name).upload_from_filename(
        str(local_path),
        content_type="application/x-ndjson",
    )
    logger.info("Clean NDJSON uploaded to GCS: uri=%s bytes=%s", gcs_uri, local_path.stat().st_size)


def _iter_ndjson(path: Path) -> Iterator[Dict[str, Any]]:
    """Itera objetos JSON validos de um arquivo NDJSON."""

    with path.open("r", encoding="utf-8") as fh:
        for line_number, line in enumerate(fh, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                logger.error("Linha NDJSON invalida: path=%s line=%s error=%s", path, line_number, exc)
                raise
            if not isinstance(obj, dict):
                logger.warning("Linha NDJSON ignorada por tipo: line=%s type=%s", line_number, type(obj).__name__)
                continue
            yield obj


def _digits(value: Any) -> str:
    """Retorna somente digitos de um valor."""

    return re.sub(r"[^0-9]", "", str(value or ""))


def _looks_like_money_field(key: str) -> bool:
    """Indica se o nome do campo sugere valor monetario."""

    normalized = _ascii_fold(key).lower()
    return any(hint in normalized for hint in MONEY_FIELD_HINTS)


def _looks_like_date_field(key: str) -> bool:
    """Indica se o nome do campo sugere data."""

    normalized = _ascii_fold(key).lower()
    return any(hint in normalized for hint in DATE_FIELD_HINTS)


def _looks_like_description_field(key: str) -> bool:
    """Indica se o campo deve passar pelo filtro LGPD de texto livre."""

    normalized = _ascii_fold(key).lower()
    return any(hint in normalized for hint in DESCRIPTION_FIELD_HINTS)


def _ascii_fold(value: str) -> str:
    """Remove acentos para comparacao e nomes de colunas."""

    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def parse_money(value: Any) -> Optional[float]:
    """Converte valores monetarios brasileiros ou numericos para FLOAT64."""

    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)

    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"[^\d,.\-]", "", text)
    if not text or text in {"-", ".", ","}:
        return None

    # "1.234,56" -> "1234.56"; "1234,56" -> "1234.56".
    if "," in text and (text.rfind(",") > text.rfind(".")):
        text = text.replace(".", "").replace(",", ".")
    elif text.count(".") > 1 and "," not in text:
        text = text.replace(".", "")

    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        logger.debug("Valor monetario nao convertido: value=%r", value)
        return None


def parse_iso_date(value: Any) -> Optional[str]:
    """Converte datas comuns do PNCP para string ISO 8601."""

    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()

    text = str(value).strip()
    if not text:
        return None

    candidates = [text]
    if text.endswith("Z"):
        candidates.append(text[:-1] + "+00:00")

    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None and ("T" in candidate or " " in candidate):
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat() if ("T" in candidate or " " in candidate) else parsed.date().isoformat()
        except ValueError:
            pass

    for fmt in ("%Y%m%d", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10] if fmt != "%Y%m%d" else text, fmt).date().isoformat()
        except ValueError:
            continue

    logger.debug("Data nao convertida: value=%r", value)
    return text


def _cpf_is_valid(digits: str) -> bool:
    """Valida digitos verificadores de CPF para reduzir falsos positivos."""

    if len(digits) != 11 or len(set(digits)) == 1:
        return False

    def _digit(prefix: str, weights: Iterable[int]) -> int:
        total = sum(int(number) * weight for number, weight in zip(prefix, weights))
        remainder = (total * 10) % 11
        return 0 if remainder == 10 else remainder

    return _digit(digits[:9], range(10, 1, -1)) == int(digits[9]) and _digit(
        digits[:10],
        range(11, 1, -1),
    ) == int(digits[10])


def redact_cpf_text(text: str, *, mode: str = "mask") -> Tuple[str, int]:
    """Ofusca CPFs em texto livre sem alterar CNPJs."""

    cnpj_spans = [match.span() for match in CNPJ_PATTERN.finditer(text)]

    def _inside_cnpj(match: re.Match[str]) -> bool:
        start, end = match.span()
        return any(start >= cnpj_start and end <= cnpj_end for cnpj_start, cnpj_end in cnpj_spans)

    def _replace(match: re.Match[str]) -> str:
        if _inside_cnpj(match):
            return match.group(0)
        digits = "".join(match.groups())
        if not _cpf_is_valid(digits):
            return match.group(0)
        if mode == "hash":
            digest = hashlib.sha256(digits.encode("utf-8")).hexdigest()
            return f"[CPF_SHA256:{digest[:16]}]"
        return f"{digits[:3]}.***.***-{digits[-2:]}"

    redacted, count = CPF_PATTERN.subn(_replace, text)
    return redacted, count


def _sanitize_key(key: str) -> str:
    """Converte nomes de campos arbitrarios para identificadores BigQuery."""

    normalized = _ascii_fold(key.strip())
    normalized = re.sub(r"[^A-Za-z0-9_]", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_").lower()
    if not normalized:
        normalized = "field"
    if normalized[0].isdigit():
        normalized = f"f_{normalized}"
    return normalized[:300]


def _flatten(
    value: Any,
    *,
    prefix: str = "",
    out: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Achata dicts em colunas escalares; listas/dicts restantes viram JSON string."""

    if out is None:
        out = {}
    if isinstance(value, dict):
        for raw_key, child in value.items():
            key = _sanitize_key(str(raw_key))
            full_key = f"{prefix}_{key}" if prefix else key
            if isinstance(child, dict):
                _flatten(child, prefix=full_key, out=out)
            elif isinstance(child, list):
                out[full_key] = json.dumps(child, ensure_ascii=False, default=str)
            else:
                out[full_key] = child
    else:
        out[prefix or "value"] = value
    return out


def _normalize_flat_row(row: Dict[str, Any], *, redaction_mode: str) -> Tuple[Dict[str, Any], int]:
    """Aplica tipagem, ISO dates e filtro LGPD em uma linha achatada."""

    clean: Dict[str, Any] = {}
    redactions = 0
    for key, value in row.items():
        if isinstance(value, str) and _looks_like_description_field(key):
            value, count = redact_cpf_text(value, mode=redaction_mode)
            redactions += count

        if _looks_like_money_field(key):
            clean[key] = parse_money(value)
        elif _looks_like_date_field(key):
            clean[key] = parse_iso_date(value)
        else:
            clean[key] = value
    return clean, redactions


def normalize_record(record: Dict[str, Any], *, redaction_mode: str) -> Tuple[Dict[str, Any], int]:
    """Transforma um registro bruto da engine 00 em linha compativel com BigQuery."""

    payload = record.get("payload") if isinstance(record.get("payload"), dict) else record
    flat_payload = _flatten(payload)
    metadata = {
        "source": record.get("source", "pncp_contratos"),
        "source_url": record.get("source_url"),
        "data_inicial_cursor": parse_iso_date(record.get("dataInicial")),
        "data_final_cursor": parse_iso_date(record.get("dataFinal")),
        "pagina_cursor": record.get("pagina"),
        "fetched_at": parse_iso_date(record.get("fetched_at")),
        "etl_loaded_at": datetime.now(timezone.utc).isoformat(),
    }
    normalized, redactions = _normalize_flat_row(flat_payload, redaction_mode=redaction_mode)
    normalized.update({key: value for key, value in metadata.items() if value is not None})

    row_key_basis = json.dumps(
        {
            "numeroControlePNCP": flat_payload.get("numerocontrolepncp") or flat_payload.get("numero_controle_pncp"),
            "numeroContratoEmpenho": flat_payload.get("numerocontratoempenho"),
            "cnpjFornecedor": _digits(
                flat_payload.get("nifornecedor")
                or flat_payload.get("cnpj_fornecedor")
                or flat_payload.get("fornecedor_ni_fornecedor"),
            ),
            "pagina": record.get("pagina"),
        },
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    normalized["row_key"] = hashlib.sha256(row_key_basis.encode("utf-8")).hexdigest()
    normalized["lgpd_cpf_redactions"] = redactions
    return normalized, redactions


def transform_ndjson(raw_path: Path, clean_path: Path, *, redaction_mode: str) -> Tuple[int, int]:
    """Le arquivo bruto em lote e grava NDJSON purificado."""

    rows = 0
    total_redactions = 0
    clean_path.parent.mkdir(parents=True, exist_ok=True)
    with clean_path.open("w", encoding="utf-8") as out:
        for record in _iter_ndjson(raw_path):
            normalized, redactions = normalize_record(record, redaction_mode=redaction_mode)
            out.write(json.dumps(normalized, ensure_ascii=False, separators=(",", ":"), default=str))
            out.write("\n")
            rows += 1
            total_redactions += redactions
    logger.info(
        "ETL transform finished: input=%s output=%s rows=%s cpf_redactions=%s",
        raw_path,
        clean_path,
        rows,
        total_redactions,
    )
    return rows, total_redactions


def infer_bq_schema(sample_path: Path, *, sample_rows: int = 500) -> List[bigquery.SchemaField]:
    """Infere schema simples, preservando datas como STRING e moedas como FLOAT64."""

    types: Dict[str, str] = {}
    with sample_path.open("r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh, start=1):
            if idx > sample_rows:
                break
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                continue
            for key, value in row.items():
                if key in types:
                    continue
                if _looks_like_money_field(key):
                    types[key] = "FLOAT"
                elif isinstance(value, bool):
                    types[key] = "BOOL"
                elif isinstance(value, int) and not isinstance(value, bool):
                    types[key] = "INTEGER"
                elif isinstance(value, float):
                    types[key] = "FLOAT"
                else:
                    # Dates are intentionally STRING for BigQuery compatibility requested by the ETL contract.
                    types[key] = "STRING"

    return [bigquery.SchemaField(name, field_type) for name, field_type in sorted(types.items())]


def load_ndjson_to_bigquery(
    *,
    client: bigquery.Client,
    clean_path: Path,
    table_fqn: str,
    schema: List[bigquery.SchemaField],
) -> int:
    """Carrega NDJSON inteiro para BigQuery via batch LoadJobConfig WRITE_APPEND."""

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        schema=schema,
        autodetect=False,
        ignore_unknown_values=True,
        schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
    )
    with clean_path.open("rb") as fh:
        load_job = client.load_table_from_file(fh, table_fqn, job_config=job_config)
    logger.info("BigQuery load job started: job_id=%s table=%s file=%s", load_job.job_id, table_fqn, clean_path)
    load_job.result()
    destination = client.get_table(table_fqn)
    logger.info(
        "BigQuery load job finished: job_id=%s table=%s table_rows=%s output_rows=%s",
        load_job.job_id,
        table_fqn,
        destination.num_rows,
        getattr(load_job, "output_rows", None),
    )
    return int(getattr(load_job, "output_rows", 0) or 0)


def build_parser() -> argparse.ArgumentParser:
    """Cria parser de CLI da engine 02."""

    parser = argparse.ArgumentParser(description="Engine 02: ETL PNCP NDJSON -> BigQuery batch load.")
    parser.add_argument("--input", required=True, help="NDJSON bruto local ou gs:// gerado pela engine 00.")
    parser.add_argument(
        "--clean-output",
        default=None,
        help="Opcional: caminho local ou gs:// para manter NDJSON purificado antes do load.",
    )
    parser.add_argument("--project", default=gcp_project_id(), help="Projeto GCP.")
    parser.add_argument("--dataset", default=bq_dataset_id(), help="Dataset BigQuery.")
    parser.add_argument("--table", default=DEFAULT_TABLE, help="Tabela BigQuery de destino.")
    parser.add_argument(
        "--redaction-mode",
        choices=("mask", "hash"),
        default=os.environ.get("PNCP_LGPD_REDACTION_MODE", "mask"),
        help="Como ofuscar CPFs soltos em descricoes.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Transforma NDJSON, mas nao carrega no BigQuery.")
    parser.add_argument("--keep-temp", action="store_true", help="Mantem arquivos temporarios locais.")
    return parser


def run(args: argparse.Namespace) -> int:
    """Executa purificacao e carga batch no BigQuery."""

    input_uri = str(args.input)
    temp_paths: List[Path] = []

    if input_uri.startswith("gs://"):
        raw_path = _download_gcs_to_temp(input_uri)
        temp_paths.append(raw_path)
    else:
        raw_path = Path(input_uri)

    clean_output = args.clean_output
    clean_gcs_uri: Optional[str] = None
    if clean_output and str(clean_output).startswith("gs://"):
        tmp = tempfile.NamedTemporaryFile(prefix="pncp_clean_", suffix=".ndjson", delete=False)
        tmp.close()
        clean_path = Path(tmp.name)
        clean_gcs_uri = str(clean_output)
        temp_paths.append(clean_path)
    elif clean_output:
        clean_path = Path(str(clean_output))
    else:
        tmp = tempfile.NamedTemporaryFile(prefix="pncp_clean_", suffix=".ndjson", delete=False)
        tmp.close()
        clean_path = Path(tmp.name)
        temp_paths.append(clean_path)

    if not raw_path.exists():
        raise FileNotFoundError(f"Arquivo NDJSON de entrada nao encontrado: {raw_path}")

    rows, redactions = transform_ndjson(raw_path, clean_path, redaction_mode=args.redaction_mode)
    if clean_gcs_uri:
        _upload_temp_to_gcs(clean_path, clean_gcs_uri)

    if rows == 0:
        logger.warning("Nenhuma linha encontrada no NDJSON de entrada. Carga BigQuery ignorada.")
        return 0

    table_fqn = f"{args.project}.{args.dataset}.{args.table}"
    if args.dry_run:
        logger.info(
            "[dry-run] BigQuery load skipped: table=%s clean_file=%s rows=%s cpf_redactions=%s",
            table_fqn,
            clean_path,
            rows,
            redactions,
        )
        return 0

    schema = infer_bq_schema(clean_path)
    logger.info("BigQuery schema inferred: table=%s fields=%s", table_fqn, len(schema))
    client = bigquery.Client(project=args.project)
    loaded_rows = load_ndjson_to_bigquery(client=client, clean_path=clean_path, table_fqn=table_fqn, schema=schema)
    logger.info(
        "ETL completed: source=%s table=%s transformed_rows=%s loaded_rows=%s cpf_redactions=%s",
        input_uri,
        table_fqn,
        rows,
        loaded_rows,
        redactions,
    )

    if not args.keep_temp:
        for path in temp_paths:
            path.unlink(missing_ok=True)
    return 0


def main() -> int:
    """Ponto de entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        return run(args)
    except KeyboardInterrupt:
        logger.warning("PNCP ETL interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("PNCP ETL failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
