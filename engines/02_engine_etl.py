#!/usr/bin/env python3
"""
Engine 02 — ETL e carga em lote no BigQuery (PNCP / contratos).

Lê o NDJSON bruto produzido pela Engine 00 (``00_engine_ingestion.py``),
purifica os dados e envia em **uma única transação** para o BigQuery via
``LoadJobConfig`` + ``client.load_table_from_file()``. Isso evita
``streaming inserts`` (que disparam HTTP 403 em projetos sem cota e custam
caro) e mantém a operação idempotente em nível de batch.

Regras arquiteturais:
    * Leitura em lote (NDJSON inteiro, não linha-a-linha em INSERT).
    * Tipagem forçada:
        - moeda  → ``FLOAT64``
        - datas  → ISO 8601 string (compatível BigQuery DATE/DATETIME).
    * Filtro LGPD: regex detecta CPFs em campos textuais e ofusca-os
      mantendo CNPJs inalterados.
    * ``write_disposition = WRITE_APPEND``.
    * Logging estruturado para Cloud Logging.

Uso:

    python engines/02_engine_etl.py \\
        --input gs://transparenciabr-raw/pncp/contratos_2026_01.ndjson \\
        --table transparenciabr.transparenciabr.contratos_pncp_raw

    python engines/02_engine_etl.py \\
        --input ./out/contratos.ndjson \\
        --table transparenciabr.transparenciabr.contratos_pncp_raw \\
        --lgpd-mode mask
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
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

try:
    from google.cloud import bigquery
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "google-cloud-bigquery é obrigatório. "
        "Instale com: pip install google-cloud-bigquery",
    ) from exc


# ---------------------------------------------------------------------------
# Logging estruturado para Cloud Logging.
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | engine=02_etl | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("transparenciabr.engine02")


# ---------------------------------------------------------------------------
# Constantes / regex.
# ---------------------------------------------------------------------------

# CPFs "soltos" em texto livre. Aceita formatado (000.000.000-00) e cru
# (apenas 11 dígitos quando rodeados por separadores não-numéricos).
_CPF_FORMATTED_RE = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
_CPF_LOOSE_RE = re.compile(r"(?<!\d)(\d{11})(?!\d)")
_CNPJ_FORMATTED_RE = re.compile(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")
_CNPJ_LOOSE_RE = re.compile(r"(?<!\d)(\d{14})(?!\d)")

# Campos comuns de moeda no PNCP.
_CURRENCY_FIELDS = {
    "valorGlobal",
    "valorTotalEstimado",
    "valorTotalHomologado",
    "valorInicial",
    "valorAtual",
    "valor",
    "valor_total",
    "valorAcumulado",
    "valorParcela",
}

# Campos comuns de data no PNCP.
_DATE_FIELDS = {
    "dataAssinatura",
    "dataPublicacaoPncp",
    "dataInicioVigencia",
    "dataFimVigencia",
    "dataAtualizacao",
    "dataInclusao",
    "dataAtualizacaoGlobal",
    "data_assinatura",
    "data_publicacao",
}

# Campos comumente identificados como descrição/objeto onde podemos varrer CPF.
_TEXT_FIELDS_HINTS = {
    "objetoContrato",
    "objetoCompra",
    "informacaoComplementar",
    "descricao",
    "observacao",
    "objeto",
    "complementoObjeto",
}


# ---------------------------------------------------------------------------
# Configuração imutável + métricas.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ETLConfig:
    """Configuração resolvida para a execução."""

    input_uri: str          # caminho local OU gs://bucket/object.ndjson
    table_fqn: str          # project.dataset.table
    lgpd_mode: str          # "mask" | "hash"
    write_disposition: str  # "WRITE_APPEND" | "WRITE_TRUNCATE"
    autodetect_schema: bool


@dataclass
class ETLStats:
    records_in: int = 0
    records_out: int = 0
    records_dropped: int = 0
    cpfs_redacted: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_log_payload(self) -> Dict[str, Any]:
        return {
            "records_in": self.records_in,
            "records_out": self.records_out,
            "records_dropped": self.records_dropped,
            "cpfs_redacted": self.cpfs_redacted,
            "started_at": self.started_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Coerções de tipo.
# ---------------------------------------------------------------------------

def coerce_currency(value: Any) -> Optional[float]:
    """Converte valores de moeda para ``float`` (FLOAT64).

    Aceita números, strings com vírgula decimal ("1.234,56"), strings com
    ponto decimal ("1234.56") ou ``None``. Devolve ``None`` quando vazio.
    """
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s and "." not in s:
            s = s.replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    return None


def coerce_date_iso(value: Any) -> Optional[str]:
    """Converte qualquer representação de data para ISO 8601 string.

    Saída sempre como ``YYYY-MM-DD`` ou ``YYYY-MM-DDTHH:MM:SS+00:00``,
    compatível com o parser implícito do BigQuery (DATE/DATETIME/TIMESTAMP).
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if not isinstance(value, str):
        value = str(value)
    s = value.strip()
    if not s:
        return None

    # Formato AAAAMMDD usado pela própria API PNCP.
    if re.fullmatch(r"\d{8}", s):
        try:
            return datetime.strptime(s, "%Y%m%d").date().isoformat()
        except ValueError:
            return None

    candidates = (
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y",
    )
    for fmt in candidates:
        try:
            dt = datetime.strptime(s, fmt)
            if "%H" in fmt:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.isoformat()
            return dt.date().isoformat()
        except ValueError:
            continue
    # ISO permissivo (Z final etc.)
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Filtro LGPD — CPF é PII; CNPJ é dado público da empresa.
# ---------------------------------------------------------------------------

def _is_valid_cpf_digits(digits: str) -> bool:
    """Validação leve para CPF (11 dígitos, todos diferentes)."""
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    return True


def _mask_cpf(raw: str, *, mode: str) -> str:
    """Ofusca um CPF mantendo formato.

    Ex.: ``123.456.789-09`` → ``123.***.***-09`` (mode='mask')
         ``12345678909``     → ``[CPF#deadbeef]``  (mode='hash')
    """
    digits = re.sub(r"\D", "", raw)
    if mode == "hash":
        h = hashlib.sha256(digits.encode("utf-8")).hexdigest()[:8]
        return f"[CPF#{h}]"
    if "." in raw and "-" in raw:
        return f"{digits[:3]}.***.***-{digits[-2:]}"
    return f"{digits[:3]}***{digits[-2:]}"


def redact_cpfs_in_text(text: str, *, mode: str = "mask") -> Tuple[str, int]:
    """Aplica regex em ``text`` ofuscando CPFs e preservando CNPJs.

    Estratégia:
        1. Marca CNPJs (formatados e crus) com sentinelas para não confundir
           com CPF.
        2. Substitui CPFs formatados.
        3. Substitui sequências de 11 dígitos isoladas que pareçam CPF.
        4. Restaura os CNPJs originais.
    """
    if not text:
        return text, 0

    sentinels: Dict[str, str] = {}

    def _stash(match: re.Match[str]) -> str:
        token = f"\u0000CNPJ{len(sentinels):06d}\u0000"
        sentinels[token] = match.group(0)
        return token

    text = _CNPJ_FORMATTED_RE.sub(_stash, text)
    text = _CNPJ_LOOSE_RE.sub(_stash, text)

    redacted_count = 0

    def _sub_formatted(m: re.Match[str]) -> str:
        nonlocal redacted_count
        redacted_count += 1
        return _mask_cpf(m.group(0), mode=mode)

    text = _CPF_FORMATTED_RE.sub(_sub_formatted, text)

    def _sub_loose(m: re.Match[str]) -> str:
        nonlocal redacted_count
        digits = m.group(1)
        if not _is_valid_cpf_digits(digits):
            return digits
        redacted_count += 1
        return _mask_cpf(digits, mode=mode)

    text = _CPF_LOOSE_RE.sub(_sub_loose, text)

    for token, original in sentinels.items():
        text = text.replace(token, original)
    return text, redacted_count


def _walk_redact(value: Any, *, mode: str) -> Tuple[Any, int]:
    """Percorre dict/list recursivamente ofuscando CPF em strings."""
    if isinstance(value, str):
        return redact_cpfs_in_text(value, mode=mode)
    if isinstance(value, list):
        out: List[Any] = []
        total = 0
        for v in value:
            new_v, n = _walk_redact(v, mode=mode)
            total += n
            out.append(new_v)
        return out, total
    if isinstance(value, dict):
        out_d: Dict[str, Any] = {}
        total = 0
        for k, v in value.items():
            new_v, n = _walk_redact(v, mode=mode)
            total += n
            out_d[k] = new_v
        return out_d, total
    return value, 0


# ---------------------------------------------------------------------------
# Transformação por registro.
# ---------------------------------------------------------------------------

def transform_record(record: Dict[str, Any], *, lgpd_mode: str) -> Tuple[Dict[str, Any], int]:
    """Aplica as regras de purificação (tipagem + LGPD) a um registro.

    Retorna o registro transformado e o nº de CPFs ofuscados.
    """
    out: Dict[str, Any] = {}
    cpfs_n = 0

    for key, value in record.items():
        if key in _CURRENCY_FIELDS:
            out[key] = coerce_currency(value)
            continue
        if key in _DATE_FIELDS:
            out[key] = coerce_date_iso(value)
            continue
        new_v, n = _walk_redact(value, mode=lgpd_mode)
        cpfs_n += n
        out[key] = new_v

    out.setdefault("_etl_processed_at", datetime.now(timezone.utc).isoformat())
    return out, cpfs_n


# ---------------------------------------------------------------------------
# Leitura do NDJSON (local ou GCS).
# ---------------------------------------------------------------------------

def _open_input_for_read(input_uri: str) -> Tuple[Any, Optional[Path]]:
    """Abre o NDJSON para leitura. Para gs://, baixa para tempfile e devolve handle."""
    if input_uri.startswith("gs://"):
        try:
            from google.cloud import storage  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise SystemExit(
                "google-cloud-storage é necessário para input gs://. "
                "Instale com: pip install google-cloud-storage",
            ) from exc

        without_scheme = input_uri[len("gs://"):]
        bucket_name, _, object_name = without_scheme.partition("/")
        if not bucket_name or not object_name:
            raise ValueError(f"URI GCS inválida: {input_uri}")
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(object_name)
        tmp = tempfile.NamedTemporaryFile(
            prefix="pncp_in_", suffix=".ndjson", delete=False,
        )
        tmp_path = Path(tmp.name)
        tmp.close()
        logger.info("Baixando NDJSON do GCS: %s", input_uri)
        blob.download_to_filename(str(tmp_path))
        return tmp_path.open("r", encoding="utf-8"), tmp_path
    return Path(input_uri).open("r", encoding="utf-8"), None


def iter_ndjson_records(input_uri: str) -> Iterator[Dict[str, Any]]:
    """Itera os registros do NDJSON descartando linhas vazias / inválidas."""
    fh, tmp_path = _open_input_for_read(input_uri)
    try:
        for line_no, raw in enumerate(fh, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                logger.warning("NDJSON linha %s inválida (ignorada): %s", line_no, exc)
                continue
            if isinstance(obj, dict):
                yield obj
    finally:
        try:
            fh.close()
        finally:
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Geração do NDJSON purificado em arquivo temporário.
# ---------------------------------------------------------------------------

def materialize_clean_ndjson(records: Iterable[Dict[str, Any]], *, lgpd_mode: str) -> Tuple[Path, ETLStats]:
    """Aplica transformação e grava NDJSON purificado em arquivo temp."""
    stats = ETLStats()
    tmp = tempfile.NamedTemporaryFile(
        prefix="pncp_clean_",
        suffix=".ndjson",
        delete=False,
        mode="w",
        encoding="utf-8",
    )
    tmp_path = Path(tmp.name)
    try:
        for record in records:
            stats.records_in += 1
            try:
                clean, n_cpf = transform_record(record, lgpd_mode=lgpd_mode)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Registro descartado por falha de transform: %s", exc)
                stats.records_dropped += 1
                continue
            stats.cpfs_redacted += n_cpf
            tmp.write(json.dumps(clean, ensure_ascii=False, default=str))
            tmp.write("\n")
            stats.records_out += 1
            if stats.records_in % 5000 == 0:
                logger.info(
                    "ETL progresso records_in=%s records_out=%s cpf_redacted=%s",
                    stats.records_in,
                    stats.records_out,
                    stats.cpfs_redacted,
                )
    finally:
        tmp.flush()
        tmp.close()
    logger.info("NDJSON purificado pronto: %s metrics=%s",
                tmp_path, json.dumps(stats.to_log_payload()))
    return tmp_path, stats


# ---------------------------------------------------------------------------
# Carga em lote no BigQuery (transação única).
# ---------------------------------------------------------------------------

def load_to_bigquery(
    *,
    ndjson_path: Path,
    table_fqn: str,
    write_disposition: str,
    autodetect: bool,
) -> Dict[str, Any]:
    """Faz o ``load_table_from_file`` em uma única transação.

    Retorna um dicionário com métricas básicas do job.
    """
    if write_disposition not in {"WRITE_APPEND", "WRITE_TRUNCATE", "WRITE_EMPTY"}:
        raise ValueError(f"write_disposition inválido: {write_disposition}")

    client = bigquery.Client()
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition=getattr(bigquery.WriteDisposition, write_disposition),
        autodetect=autodetect,
        ignore_unknown_values=True,
        max_bad_records=0,
        schema_update_options=[
            bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION,
        ],
    )

    logger.info(
        "Iniciando LoadJob → table=%s write_disposition=%s autodetect=%s file_size=%s bytes",
        table_fqn,
        write_disposition,
        autodetect,
        ndjson_path.stat().st_size,
    )
    with ndjson_path.open("rb") as fh:
        load_job = client.load_table_from_file(
            fh,
            destination=table_fqn,
            job_config=job_config,
        )
    result = load_job.result()
    payload = {
        "job_id": load_job.job_id,
        "output_rows": getattr(result, "output_rows", load_job.output_rows),
        "errors": load_job.errors or [],
        "input_files": load_job.input_files,
    }
    logger.info("LoadJob concluído. payload=%s", json.dumps(payload, default=str))
    if load_job.errors:
        raise RuntimeError(f"BigQuery LoadJob falhou: {load_job.errors}")
    return payload


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> ETLConfig:
    parser = argparse.ArgumentParser(
        description="Engine 02 — ETL NDJSON → BigQuery (LoadJob WRITE_APPEND).",
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Arquivo NDJSON local OU gs://bucket/objeto.ndjson",
    )
    parser.add_argument(
        "--table",
        required=True,
        help="FQN BigQuery: project.dataset.table",
    )
    parser.add_argument(
        "--lgpd-mode",
        choices=("mask", "hash"),
        default="mask",
        help="Forma de ofuscação de CPF (default mask).",
    )
    parser.add_argument(
        "--write-disposition",
        choices=("WRITE_APPEND", "WRITE_TRUNCATE"),
        default="WRITE_APPEND",
        help="Disposição de escrita do LoadJob (default WRITE_APPEND).",
    )
    parser.add_argument(
        "--no-autodetect",
        action="store_true",
        help="Desativa autodetect do schema (use quando a tabela já existir com schema fixo).",
    )

    ns = parser.parse_args(argv)
    if ns.table.count(".") != 2:
        raise ValueError(
            f"--table deve estar em project.dataset.table, recebido: {ns.table}",
        )
    return ETLConfig(
        input_uri=ns.input,
        table_fqn=ns.table,
        lgpd_mode=ns.lgpd_mode,
        write_disposition=ns.write_disposition,
        autodetect_schema=not ns.no_autodetect,
    )


def main(argv: Optional[List[str]] = None) -> int:
    try:
        cfg = parse_args(argv)
    except ValueError as exc:
        logger.error("Argumentos inválidos: %s", exc)
        return 2

    clean_path: Optional[Path] = None
    try:
        records = iter_ndjson_records(cfg.input_uri)
        clean_path, stats = materialize_clean_ndjson(records, lgpd_mode=cfg.lgpd_mode)
        if stats.records_out == 0:
            logger.warning("Nenhum registro válido para carga. Encerrando sem LoadJob.")
            return 0
        load_to_bigquery(
            ndjson_path=clean_path,
            table_fqn=cfg.table_fqn,
            write_disposition=cfg.write_disposition,
            autodetect=cfg.autodetect_schema,
        )
        logger.info(
            "ETL concluído table=%s metrics=%s",
            cfg.table_fqn,
            json.dumps(stats.to_log_payload()),
        )
        return 0
    except Exception:
        logger.exception("Falha não recuperável na engine 02.")
        return 1
    finally:
        if clean_path is not None:
            try:
                clean_path.unlink(missing_ok=True)
            except OSError:
                logger.debug("Arquivo temp já removido: %s", clean_path)


if __name__ == "__main__":
    sys.exit(main())
