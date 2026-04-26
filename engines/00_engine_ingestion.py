#!/usr/bin/env python3
"""
Engine 00 - Extracao PNCP contratos para NDJSON.

Este motor consulta o endpoint de contratos do PNCP usando HTTP assincrono,
paginacao por cursor (dataInicial, dataFinal, pagina, tamanhoPagina) e grava
somente dados brutos em NDJSON local ou em Google Cloud Storage.

Exemplos:
  python3 engines/00_engine_ingestion.py --data-inicial 20260101 --data-final 20260131
  python3 engines/00_engine_ingestion.py --dias 7 --output gs://bucket/pncp/contratos.ndjson
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional, Tuple

import aiohttp

PNCP_CONTRATOS_URL = os.environ.get(
    "PNCP_CONTRATOS_URL",
    "https://pncp.gov.br/api/pncp/v1/contratos",
)
USER_AGENT = os.environ.get(
    "PNCP_USER_AGENT",
    "TransparenciaBR-engines/00_engine_ingestion (PNCP async)",
)

DEFAULT_PAGE_SIZE = int(os.environ.get("PNCP_TAMANHO_PAGINA", "100"))
DEFAULT_CONCURRENCY = int(os.environ.get("PNCP_CONCURRENCY", "5"))
DEFAULT_MAX_RETRIES = int(os.environ.get("PNCP_MAX_RETRIES", "6"))
DEFAULT_BACKOFF_BASE = float(os.environ.get("PNCP_BACKOFF_BASE_SECONDS", "1.0"))
DEFAULT_BACKOFF_MAX = float(os.environ.get("PNCP_BACKOFF_MAX_SECONDS", "60.0"))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_00_pncp_ingestion")


class NonRetryableHTTPError(RuntimeError):
    """Erro HTTP que nao deve acionar backoff/retry."""


@dataclass(frozen=True)
class PageResult:
    """Resultado bruto de uma pagina da API PNCP."""

    pagina: int
    payload: Dict[str, Any]
    items: List[Dict[str, Any]]
    total_paginas: Optional[int]


def _validate_yyyymmdd(value: str) -> str:
    """Valida e normaliza uma data no formato PNCP YYYYMMDD."""

    text = str(value).strip()
    if not re.fullmatch(r"\d{8}", text):
        raise argparse.ArgumentTypeError(f"Data invalida: {value!r}. Use YYYYMMDD.")
    try:
        datetime.strptime(text, "%Y%m%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Data invalida: {value!r}.") from exc
    return text


def _default_dates(days: int) -> Tuple[str, str]:
    """Retorna intervalo default em YYYYMMDD terminando hoje (UTC)."""

    end = date.today()
    start = end - timedelta(days=max(1, days))
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def _extract_items(payload: Any) -> List[Dict[str, Any]]:
    """Extrai a lista de contratos de formatos comuns retornados pelo PNCP."""

    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        logger.warning("Payload PNCP ignorado por tipo inesperado: tipo=%s", type(payload).__name__)
        return []
    for key in ("data", "items", "content", "resultado", "resultados", "contratos"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if payload.get("numeroControlePNCP") or payload.get("numeroContratoEmpenho"):
        return [payload]
    logger.warning("Payload PNCP sem lista reconhecida: keys=%s", sorted(payload.keys()))
    return []


def _extract_total_pages(payload: Dict[str, Any]) -> Optional[int]:
    """Le total de paginas de nomes conhecidos da resposta PNCP."""

    for key in ("totalPaginas", "totalPages", "total_paginas", "totalPagina"):
        raw = payload.get(key)
        if raw in (None, ""):
            continue
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            logger.debug("Campo de total de paginas invalido: key=%s value=%r", key, raw)
    return None


def _retry_after_seconds(headers: aiohttp.typedefs.LooseHeaders) -> Optional[float]:
    """Converte Retry-After HTTP para segundos quando informado."""

    raw = None
    if hasattr(headers, "get"):
        raw = headers.get("Retry-After")  # type: ignore[union-attr]
    if not raw:
        return None
    try:
        return max(0.0, float(str(raw).strip()))
    except ValueError:
        return None


async def _sleep_backoff(
    *,
    attempt: int,
    status: int,
    retry_after: Optional[float],
    backoff_base: float,
    backoff_max: float,
) -> None:
    """Aplica exponential backoff com jitter para 429/5xx."""

    if retry_after is not None:
        delay = min(backoff_max, retry_after)
    else:
        delay = min(backoff_max, backoff_base * (2 ** max(0, attempt - 1)))
        delay *= random.uniform(0.75, 1.25)
    logger.warning(
        "PNCP throttle/retry: status=%s attempt=%s sleep_seconds=%.2f",
        status,
        attempt,
        delay,
    )
    await asyncio.sleep(delay)


async def fetch_page(
    session: aiohttp.ClientSession,
    *,
    url: str,
    data_inicial: str,
    data_final: str,
    pagina: int,
    tamanho_pagina: int,
    max_retries: int,
    backoff_base: float,
    backoff_max: float,
) -> PageResult:
    """Busca uma pagina do PNCP respeitando cursor obrigatorio e backoff."""

    params = {
        "dataInicial": data_inicial,
        "dataFinal": data_final,
        "pagina": str(pagina),
        "tamanhoPagina": str(tamanho_pagina),
    }
    for attempt in range(1, max_retries + 1):
        try:
            async with session.get(url, params=params) as response:
                text = await response.text()
                if response.status == 200:
                    payload_any = json.loads(text) if text else {}
                    payload = payload_any if isinstance(payload_any, dict) else {"data": payload_any}
                    items = _extract_items(payload_any)
                    logger.info(
                        "PNCP page fetched: pagina=%s tamanhoPagina=%s items=%s totalPaginas=%s",
                        pagina,
                        tamanho_pagina,
                        len(items),
                        _extract_total_pages(payload),
                    )
                    return PageResult(
                        pagina=pagina,
                        payload=payload,
                        items=items,
                        total_paginas=_extract_total_pages(payload),
                    )

                if response.status == 429 or 500 <= response.status <= 599:
                    await _sleep_backoff(
                        attempt=attempt,
                        status=response.status,
                        retry_after=_retry_after_seconds(response.headers),
                        backoff_base=backoff_base,
                        backoff_max=backoff_max,
                    )
                    continue

                logger.error(
                    "PNCP HTTP fatal: status=%s pagina=%s body=%s",
                    response.status,
                    pagina,
                    text[:500],
                )
                raise NonRetryableHTTPError(f"PNCP HTTP {response.status} pagina={pagina}: {text[:500]}")
        except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError) as exc:
            if attempt >= max_retries:
                logger.exception("PNCP page failed permanently: pagina=%s error=%s", pagina, exc)
                raise
            await _sleep_backoff(
                attempt=attempt,
                status=0,
                retry_after=None,
                backoff_base=backoff_base,
                backoff_max=backoff_max,
            )

    raise RuntimeError(f"Falha ao buscar pagina PNCP {pagina} apos {max_retries} tentativas.")


def _envelope_item(
    item: Dict[str, Any],
    *,
    source_url: str,
    data_inicial: str,
    data_final: str,
    pagina: int,
) -> Dict[str, Any]:
    """Empacota o registro bruto com metadados de extracao sem purifica-lo."""

    return {
        "source": "pncp_contratos",
        "source_url": source_url,
        "dataInicial": data_inicial,
        "dataFinal": data_final,
        "pagina": pagina,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "payload": item,
    }


def _write_records(path: Path, records: Iterable[Dict[str, Any]]) -> int:
    """Acrescenta registros NDJSON a um arquivo local."""

    count = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=str))
            fh.write("\n")
            count += 1
    return count


def _parse_gs_uri(uri: str) -> Tuple[str, str]:
    """Separa bucket e objeto de uma URI gs://."""

    if not uri.startswith("gs://"):
        raise ValueError(f"URI GCS invalida: {uri}")
    rest = uri[5:]
    bucket, _, blob = rest.partition("/")
    if not bucket or not blob:
        raise ValueError(f"URI GCS deve conter bucket e objeto: {uri}")
    return bucket, blob


def upload_to_gcs(local_path: Path, gcs_uri: str) -> None:
    """Envia o NDJSON local para Google Cloud Storage."""

    from google.cloud import storage

    bucket_name, blob_name = _parse_gs_uri(gcs_uri)
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(str(local_path), content_type="application/x-ndjson")
    logger.info("NDJSON uploaded to GCS: uri=%s bytes=%s", gcs_uri, local_path.stat().st_size)


async def iter_pncp_pages(
    *,
    url: str,
    data_inicial: str,
    data_final: str,
    tamanho_pagina: int,
    concurrency: int,
    max_pages: Optional[int],
    max_retries: int,
    backoff_base: float,
    backoff_max: float,
    timeout_seconds: float,
) -> AsyncIterator[PageResult]:
    """Itera paginas PNCP usando a primeira pagina como cursor de total."""

    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    connector = aiohttp.TCPConnector(limit=max(1, concurrency))
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    async with aiohttp.ClientSession(headers=headers, timeout=timeout, connector=connector) as session:
        first = await fetch_page(
            session,
            url=url,
            data_inicial=data_inicial,
            data_final=data_final,
            pagina=1,
            tamanho_pagina=tamanho_pagina,
            max_retries=max_retries,
            backoff_base=backoff_base,
            backoff_max=backoff_max,
        )
        yield first

        total_pages = first.total_paginas
        if total_pages is None:
            logger.warning("PNCP nao informou totalPaginas; usando varredura sequencial ate pagina vazia.")
            page = 2
            empty_pages = 0
            while max_pages is None or page <= max_pages:
                result = await fetch_page(
                    session,
                    url=url,
                    data_inicial=data_inicial,
                    data_final=data_final,
                    pagina=page,
                    tamanho_pagina=tamanho_pagina,
                    max_retries=max_retries,
                    backoff_base=backoff_base,
                    backoff_max=backoff_max,
                )
                yield result
                empty_pages = empty_pages + 1 if not result.items else 0
                if empty_pages >= 1:
                    break
                page += 1
            return

        last_page = total_pages if max_pages is None else min(total_pages, max_pages)
        if last_page <= 1:
            return

        semaphore = asyncio.Semaphore(max(1, concurrency))

        async def _bounded(page: int) -> PageResult:
            async with semaphore:
                return await fetch_page(
                    session,
                    url=url,
                    data_inicial=data_inicial,
                    data_final=data_final,
                    pagina=page,
                    tamanho_pagina=tamanho_pagina,
                    max_retries=max_retries,
                    backoff_base=backoff_base,
                    backoff_max=backoff_max,
                )

        tasks = [asyncio.create_task(_bounded(page)) for page in range(2, last_page + 1)]
        for task in asyncio.as_completed(tasks):
            yield await task


async def run_async(args: argparse.Namespace) -> int:
    """Executa a extracao PNCP e grava o NDJSON de saida."""

    data_inicial = args.data_inicial
    data_final = args.data_final
    if not data_inicial or not data_final:
        data_inicial, data_final = _default_dates(args.dias)

    if data_inicial > data_final:
        raise ValueError("dataInicial nao pode ser maior que dataFinal.")

    output_uri = str(args.output)
    gcs_target = output_uri.startswith("gs://")
    if gcs_target:
        tmp = tempfile.NamedTemporaryFile(prefix="pncp_contratos_", suffix=".ndjson", delete=False)
        tmp.close()
        output_path = Path(tmp.name)
    else:
        output_path = Path(output_uri)
        if args.overwrite and output_path.exists():
            output_path.unlink()

    logger.info(
        "PNCP ingestion starting: url=%s dataInicial=%s dataFinal=%s tamanhoPagina=%s concurrency=%s output=%s",
        args.url,
        data_inicial,
        data_final,
        args.tamanho_pagina,
        args.concurrency,
        output_uri,
    )

    total_records = 0
    async for page in iter_pncp_pages(
        url=args.url,
        data_inicial=data_inicial,
        data_final=data_final,
        tamanho_pagina=args.tamanho_pagina,
        concurrency=args.concurrency,
        max_pages=args.max_pages,
        max_retries=args.max_retries,
        backoff_base=args.backoff_base,
        backoff_max=args.backoff_max,
        timeout_seconds=args.timeout_seconds,
    ):
        records = (
            _envelope_item(
                item,
                source_url=args.url,
                data_inicial=data_inicial,
                data_final=data_final,
                pagina=page.pagina,
            )
            for item in page.items
        )
        written = _write_records(output_path, records)
        total_records += written
        logger.info(
            "PNCP page persisted: pagina=%s written=%s total_written=%s path=%s",
            page.pagina,
            written,
            total_records,
            output_path,
        )

    if gcs_target:
        upload_to_gcs(output_path, output_uri)
        if not args.keep_temp:
            output_path.unlink(missing_ok=True)

    logger.info("PNCP ingestion finished: records=%s output=%s", total_records, output_uri)
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Cria parser de CLI da engine 00."""

    parser = argparse.ArgumentParser(description="Engine 00: PNCP contratos -> NDJSON local/GCS.")
    parser.add_argument("--url", default=PNCP_CONTRATOS_URL, help="Endpoint PNCP de contratos.")
    parser.add_argument("--data-inicial", type=_validate_yyyymmdd, default=None, help="YYYYMMDD.")
    parser.add_argument("--data-final", type=_validate_yyyymmdd, default=None, help="YYYYMMDD.")
    parser.add_argument("--dias", type=int, default=int(os.environ.get("PNCP_DIAS", "1")))
    parser.add_argument("--tamanho-pagina", type=int, default=DEFAULT_PAGE_SIZE)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--backoff-base", type=float, default=DEFAULT_BACKOFF_BASE)
    parser.add_argument("--backoff-max", type=float, default=DEFAULT_BACKOFF_MAX)
    parser.add_argument("--timeout-seconds", type=float, default=float(os.environ.get("PNCP_TIMEOUT_SECONDS", "120")))
    parser.add_argument(
        "--output",
        default=os.environ.get("PNCP_OUTPUT", "data/raw/pncp_contratos.ndjson"),
        help="Arquivo NDJSON local ou URI gs://bucket/path.ndjson.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Sobrescreve arquivo local existente.")
    parser.add_argument("--keep-temp", action="store_true", help="Mantem arquivo temporario apos upload GCS.")
    return parser


def main() -> int:
    """Ponto de entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        return asyncio.run(run_async(args))
    except KeyboardInterrupt:
        logger.warning("PNCP ingestion interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("PNCP ingestion failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
