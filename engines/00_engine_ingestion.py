#!/usr/bin/env python3
"""
Engine 00 — Extração assíncrona PNCP (contratos) → NDJSON local ou GCS.

Consome a API pública de contratos PNCP com paginação por cursor
(``dataInicial``, ``dataFinal``, ``pagina``, ``tamanhoPagina``).

O path canónico exposto em produção costuma ser
``https://pncp.gov.br/api/consulta/v1/contratos`` (OpenAPI "consulta").
Alguns ambientes expõem o alias ``/api/pncp/v1/contratos`` — ajuste ``--url``
ou ``PNCP_PNCP_V1_URL`` se necessário.

- **HTTP**: apenas ``aiohttp`` (sem ``requests``).
- **429**: backoff exponencial com jitter.
- **Persistência**: arquivo NDJSON ou upload opcional para bucket GCS (sem banco).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, TextIO

import aiohttp

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

# -----------------------------------------------------------------------------
# Logging — formato compatível com Cloud Logging (stdout JSON-like opcional)
# -----------------------------------------------------------------------------
_LOG_JSON = os.environ.get("ENGINE_LOG_JSON", "").lower() in ("1", "true", "yes")


class _JsonFormatter(logging.Formatter):
    """Emite uma linha JSON por registro (útil no Cloud Run / Cloud Logging)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging(level: int) -> logging.Logger:
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
    return logging.getLogger("engine00_pncp")


logger = _configure_logging(logging.INFO)

DEFAULT_PNCP_URL = os.environ.get(
    "PNCP_PNCP_V1_URL",
    os.environ.get(
        "PNCP_INGESTION_URL",
        "https://pncp.gov.br/api/consulta/v1/contratos",
    ),
)
USER_AGENT = os.environ.get(
    "PNCP_USER_AGENT",
    "TransparenciaBR-engines/00_engine_ingestion (aiohttp; PNCP)",
)
# A API de consulta rejeita tamanhos < 10 ("Tamanho de página inválido").
_PNCP_PAGE_DEFAULT = int(os.environ.get("PNCP_TAMANHO_PAGINA", "100"))
DEFAULT_PAGE_SIZE = min(500, max(10, _PNCP_PAGE_DEFAULT))
DEFAULT_CONCURRENCY = int(os.environ.get("PNCP_FETCH_CONCURRENCY", "2"))
INTER_REQUEST_DELAY_SEC = float(os.environ.get("PNCP_INTER_REQUEST_DELAY_SEC", "0.25"))
MAX_RETRIES = int(os.environ.get("PNCP_HTTP_MAX_RETRIES", "8"))
BACKOFF_BASE_SEC = float(os.environ.get("PNCP_BACKOFF_BASE_SEC", "1.0"))
BACKOFF_CAP_SEC = float(os.environ.get("PNCP_BACKOFF_CAP_SEC", "120.0"))
REQUEST_TIMEOUT_SEC = float(os.environ.get("PNCP_REQUEST_TIMEOUT_SEC", "120"))


def _ymd_compact(d: date) -> str:
    """Data no formato AAAAMMDD exigido pela API de consulta PNCP."""
    return d.strftime("%Y%m%d")


def _parse_compact_date(s: str) -> date:
    s = s.strip()
    if len(s) == 8 and s.isdigit():
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
    raise ValueError(f"Data inválida (use YYYYMMDD ou YYYY-MM-DD): {s!r}")


def _extract_rows(payload: Any) -> List[Dict[str, Any]]:
    """Normaliza corpo JSON (lista raiz ou envelope ``data``)."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    return []


def _is_pncp_error_envelope(payload: Any) -> bool:
    """Alguns erros PNCP vêm como JSON com ``message`` sem lista ``data``."""
    if not isinstance(payload, dict):
        return False
    if isinstance(payload.get("data"), list):
        return False
    if payload.get("message") and (payload.get("error") is not None or payload.get("status")):
        return True
    return False


def _pagination_meta(payload: Any) -> Tuple[int, int]:
    """Retorna ``(total_paginas, total_registros)`` com fallbacks seguros."""
    if not isinstance(payload, dict):
        return (1, 0)
    total_pages = int(payload.get("totalPaginas") or payload.get("total_paginas") or 1)
    total_reg = int(payload.get("totalRegistros") or payload.get("total_registros") or 0)
    return (max(1, total_pages), max(0, total_reg))


async def _sleep_backoff(attempt: int) -> None:
    """Espera exponencial + jitter (mitiga rajadas 429)."""
    exp = min(BACKOFF_CAP_SEC, BACKOFF_BASE_SEC * (2**attempt))
    jitter = random.uniform(0, min(1.0, exp * 0.25))
    wait = exp + jitter
    logger.warning(
        "Backoff HTTP | attempt=%s | sleep_sec=%.2f | cap_sec=%.1f",
        attempt + 1,
        wait,
        BACKOFF_CAP_SEC,
    )
    await asyncio.sleep(wait)


async def fetch_page_json(
    session: aiohttp.ClientSession,
    *,
    url: str,
    params: Dict[str, Any],
    attempt: int = 0,
) -> Any:
    """
    GET JSON com retries em 429 / 503 e erros de rede transitórios.

    Raises
    ------
    aiohttp.ClientResponseError
        Para códigos não recuperáveis após esgotar tentativas.
    """
    last_err: Optional[BaseException] = None
    for try_idx in range(attempt, attempt + MAX_RETRIES):
        try:
            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SEC),
            ) as resp:
                if 400 <= resp.status < 500 and resp.status not in (429, 408):
                    # 401/403/404/400: não adianta backoff exponencial.
                    resp.raise_for_status()
                if resp.status in (408, 429, 503):
                    await _sleep_backoff(try_idx)
                    continue
                if resp.status >= 500:
                    await _sleep_backoff(try_idx)
                    continue
                resp.raise_for_status()
                data = await resp.json(content_type=None)
                if _is_pncp_error_envelope(data):
                    msg = str((data or {}).get("message") or "erro_desconhecido")
                    raise ValueError(f"Resposta PNCP inválida (HTTP {resp.status}): {msg}")
                return data
        except ValueError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_err = exc
            await _sleep_backoff(try_idx)
            continue
    if last_err:
        raise last_err
    raise RuntimeError("fetch_page_json: retries esgotados sem exceção capturada")


def _write_ndjson_line(fp: TextIO, row: Dict[str, Any]) -> None:
    fp.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


async def _upload_file_to_gcs(
    *,
    local_path: Path,
    bucket_name: str,
    blob_name: str,
) -> None:
    """Envia ``local_path`` para ``gs://bucket_name/blob_name``."""
    from google.cloud import storage

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    logger.info(
        "GCS upload iniciado | bucket=%s | blob=%s | bytes=%s",
        bucket_name,
        blob_name,
        local_path.stat().st_size,
    )
    blob.upload_from_filename(str(local_path))
    logger.info("GCS upload concluído | gs://%s/%s", bucket_name, blob_name)


async def ingest_window(
    *,
    url: str,
    data_inicial: str,
    data_final: str,
    tamanho_pagina: int,
    out_path: Path,
    concurrency: int,
    max_pages: Optional[int],
    gcs_bucket: Optional[str],
    gcs_blob: Optional[str],
) -> int:
    """
    Extrai todas as páginas da janela ``[data_inicial, data_final]`` e grava NDJSON.

    Returns
    -------
    int
        Número de registros (objetos JSON) escritos.
    """
    connector = aiohttp.TCPConnector(limit=max(32, concurrency * 2))
    headers = {
        "Accept": "application/json, */*",
        "User-Agent": USER_AGENT,
    }
    written = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiohttp.ClientSession(headers=headers, connector=connector) as session:
        first_params: Dict[str, Any] = {
            "dataInicial": data_inicial,
            "dataFinal": data_final,
            "pagina": 1,
            "tamanhoPagina": tamanho_pagina,
        }
        logger.info(
            "PNCP extração iniciada | url=%s | dataInicial=%s | dataFinal=%s | tamanhoPagina=%s",
            url,
            data_inicial,
            data_final,
            tamanho_pagina,
        )
        first = await fetch_page_json(session, url=url, params=first_params)
        total_pages, total_reg = _pagination_meta(first)
        if max_pages is not None:
            total_pages = min(total_pages, max(1, max_pages))
        rows_first = _extract_rows(first)
        logger.info(
            "PNCP primeira página | paginas=%s | registros_meta=%s | linhas_pag1=%s | limite_paginas=%s",
            total_pages,
            total_reg,
            len(rows_first),
            max_pages if max_pages is not None else "sem_limite",
        )

        # Escreve página 1 de forma síncrona no arquivo (streaming simples).
        sem = asyncio.Semaphore(max(1, concurrency))

        async def _one_page(page_no: int) -> List[Dict[str, Any]]:
            params = {
                "dataInicial": data_inicial,
                "dataFinal": data_final,
                "pagina": page_no,
                "tamanhoPagina": tamanho_pagina,
            }
            async with sem:
                logger.debug("PNCP fetch | pagina=%s", page_no)
                payload = await fetch_page_json(session, url=url, params=params)
                if INTER_REQUEST_DELAY_SEC > 0:
                    await asyncio.sleep(INTER_REQUEST_DELAY_SEC)
                return _extract_rows(payload)

        with out_path.open("w", encoding="utf-8") as fp:
            for row in rows_first:
                _write_ndjson_line(fp, row)
                written += 1

            # Lotes para não materializar O(total_pages) coroutines de uma vez.
            if total_pages > 1:
                page_no = 2
                while page_no <= total_pages:
                    batch_end = min(total_pages, page_no + max(1, concurrency) - 1)
                    batch_pages = list(range(page_no, batch_end + 1))
                    logger.debug(
                        "PNCP lote páginas | de=%s | ate=%s | lote=%s",
                        batch_pages[0],
                        batch_pages[-1],
                        len(batch_pages),
                    )
                    chunks = await asyncio.gather(*[_one_page(p) for p in batch_pages])
                    for chunk in chunks:
                        for row in chunk:
                            _write_ndjson_line(fp, row)
                            written += 1
                    page_no = batch_end + 1

    logger.info("PNCP extração concluída | registros_escritos=%s | arquivo=%s", written, out_path)

    if gcs_bucket and gcs_blob:
        await _upload_file_to_gcs(
            local_path=out_path,
            bucket_name=gcs_bucket,
            blob_name=gcs_blob,
        )

    return written


def _default_output_path(data_ini: str, data_fim: str) -> Path:
    base = Path(os.environ.get("PNCP_NDJSON_DIR", "engines/data/pncp"))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return base / f"contratos_pncp_{data_ini}_{data_fim}_{stamp}.ndjson"


async def _async_main(args: argparse.Namespace) -> int:
    global logger
    logger = _configure_logging(getattr(logging, args.log_level.upper(), logging.INFO))

    data_ini = _ymd_compact(_parse_compact_date(args.data_inicial))
    data_fim = _ymd_compact(_parse_compact_date(args.data_final))
    out = Path(args.output) if args.output else _default_output_path(data_ini, data_fim)

    n = await ingest_window(
        url=args.url,
        data_inicial=data_ini,
        data_final=data_fim,
        tamanho_pagina=min(500, max(10, args.page_size)),
        out_path=out,
        concurrency=args.concurrency,
        gcs_bucket=args.gcs_bucket,
        gcs_blob=args.gcs_blob,
        max_pages=None if args.max_pages == 0 else args.max_pages,
    )
    logger.info(
        "Engine 00 finalizado com sucesso | registros=%s | destino_local=%s",
        n,
        out.resolve(),
    )
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Engine 00 — Ingestão bruta PNCP (/api/pncp/v1/contratos) → NDJSON ou GCS.",
    )
    p.add_argument(
        "--url",
        default=DEFAULT_PNCP_URL,
        help="URL base do endpoint de contratos (inclui path /contratos).",
    )
    p.add_argument(
        "--data-inicial",
        required=True,
        help="Início da janela (YYYYMMDD ou YYYY-MM-DD).",
    )
    p.add_argument(
        "--data-final",
        required=True,
        help="Fim da janela (YYYYMMDD ou YYYY-MM-DD).",
    )
    p.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help="tamanhoPagina (mín. 10, máx. 500 na API PNCP de consulta).",
    )
    p.add_argument(
        "--output",
        default="",
        help="Caminho do arquivo NDJSON local. Se vazio, usa engines/data/pncp/....",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        help="Número máximo de requisições HTTP paralelas (páginas > 1).",
    )
    p.add_argument(
        "--max-pages",
        type=int,
        default=int(os.environ.get("PNCP_MAX_PAGES", "0") or "0"),
        help="Limita o número de páginas (0 = todas). Útil para smoke tests.",
    )
    p.add_argument(
        "--gcs-bucket",
        default=os.environ.get("PNCP_RAW_GCS_BUCKET", ""),
        help="Se definido, envia o NDJSON para este bucket após gravar localmente.",
    )
    p.add_argument(
        "--gcs-blob",
        default=os.environ.get("PNCP_RAW_GCS_BLOB", ""),
        help="Nome do objeto no bucket (ex.: pncp/contratos/run.ndjson).",
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
    if args.gcs_bucket and not args.gcs_blob:
        parser.error("--gcs-blob é obrigatório quando --gcs-bucket é informado.")
    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
