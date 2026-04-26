#!/usr/bin/env python3
"""
Engine 00 — Ingestão assíncrona PNCP (Portal Nacional de Contratações Públicas).

Extrai contratos públicos da API ``https://pncp.gov.br/api/pncp/v1/contratos``
(configurável via ``PNCP_CONTRATOS_URL``) usando paginação por cursor com os
parâmetros ``dataInicial``, ``dataFinal``, ``pagina`` e ``tamanhoPagina``.

Características arquiteturais:
    * 100% assíncrono (``aiohttp``). Nada de ``requests`` síncrono.
    * Exponential backoff em HTTP 429 / 5xx / falhas de rede transitórias.
    * Saída em NDJSON local **ou** Google Cloud Storage (``gs://...``).
    * Sem gravação em banco de dados — esta engine só faz extração bruta.
    * Logging estruturado compatível com Google Cloud Logging.

Uso típico (dia D):

    python engines/00_engine_ingestion.py \\
        --data-inicial 20260101 --data-final 20260131 \\
        --output gs://transparenciabr-raw/pncp/contratos_2026_01.ndjson

    python engines/00_engine_ingestion.py \\
        --data-inicial 20260101 --data-final 20260131 \\
        --output ./out/contratos.ndjson --tamanho-pagina 50

Variáveis de ambiente:
    PNCP_CONTRATOS_URL   URL da API de contratos (default: PNCP v1).
    PNCP_TAMANHO_PAGINA  Tamanho de página (default 50, máx 500 do PNCP).
    PNCP_MAX_CONCURRENCY Concorrência interna (default 4).
    PNCP_MAX_RETRIES     Máx. tentativas por requisição (default 6).
    PNCP_REQUEST_TIMEOUT Timeout por requisição em segundos (default 60).
    PNCP_USER_AGENT      User-Agent customizado.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional, Tuple

try:
    import aiohttp
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "aiohttp é obrigatório. Instale com: pip install aiohttp",
    ) from exc


# ---------------------------------------------------------------------------
# Logging — formato Cloud Logging-friendly (severity + JSON-ish payload).
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | engine=00_ingestion | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("transparenciabr.engine00")


# ---------------------------------------------------------------------------
# Configuração imutável da engine.
# ---------------------------------------------------------------------------

DEFAULT_PNCP_URL = os.environ.get(
    "PNCP_CONTRATOS_URL",
    "https://pncp.gov.br/api/pncp/v1/contratos",
)
DEFAULT_USER_AGENT = os.environ.get(
    "PNCP_USER_AGENT",
    "TransparenciaBR-engines/00_ingestion (+https://github.com/transparenciabr)",
)
DEFAULT_TAMANHO_PAGINA = int(os.environ.get("PNCP_TAMANHO_PAGINA", "50"))
DEFAULT_MAX_RETRIES = int(os.environ.get("PNCP_MAX_RETRIES", "6"))
DEFAULT_TIMEOUT_SEC = float(os.environ.get("PNCP_REQUEST_TIMEOUT", "60"))
DEFAULT_MAX_CONCURRENCY = int(os.environ.get("PNCP_MAX_CONCURRENCY", "4"))


@dataclass(frozen=True)
class IngestionConfig:
    """Configuração resolvida da execução."""

    url: str
    data_inicial: str  # AAAAMMDD
    data_final: str    # AAAAMMDD
    tamanho_pagina: int
    max_pages: Optional[int]
    max_retries: int
    timeout_sec: float
    user_agent: str
    extra_params: Dict[str, str] = field(default_factory=dict)


@dataclass
class IngestionStats:
    """Métricas agregadas para Cloud Logging / observabilidade."""

    pages_fetched: int = 0
    records_emitted: int = 0
    http_429: int = 0
    http_5xx: int = 0
    retries: int = 0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_log_payload(self) -> Dict[str, Any]:
        return {
            "pages_fetched": self.pages_fetched,
            "records_emitted": self.records_emitted,
            "http_429": self.http_429,
            "http_5xx": self.http_5xx,
            "retries": self.retries,
            "started_at": self.started_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Validação de entrada.
# ---------------------------------------------------------------------------

def _validate_yyyymmdd(value: str, *, field_name: str) -> str:
    """Garante que o valor está no formato AAAAMMDD exigido pelo PNCP."""
    value = (value or "").strip()
    try:
        datetime.strptime(value, "%Y%m%d")
    except ValueError as exc:
        raise ValueError(
            f"{field_name} deve estar no formato AAAAMMDD, recebido: {value!r}",
        ) from exc
    return value


# ---------------------------------------------------------------------------
# Backoff exponencial com jitter para 429 / 5xx / falhas de rede.
# ---------------------------------------------------------------------------

def _compute_backoff(attempt: int, retry_after_header: Optional[str]) -> float:
    """Calcula o tempo de espera (segundos) entre tentativas."""
    if retry_after_header:
        try:
            return max(1.0, float(retry_after_header))
        except (TypeError, ValueError):
            pass
    base = min(2 ** attempt, 60)
    jitter = random.uniform(0.0, 1.0)
    return float(base) + jitter


async def _fetch_page(
    session: aiohttp.ClientSession,
    cfg: IngestionConfig,
    pagina: int,
    stats: IngestionStats,
) -> Dict[str, Any]:
    """Busca uma página com paginação por cursor e backoff exponencial.

    Levanta ``aiohttp.ClientError`` em falha permanente após esgotar tentativas.
    """
    params: Dict[str, str] = {
        "dataInicial": cfg.data_inicial,
        "dataFinal": cfg.data_final,
        "pagina": str(pagina),
        "tamanhoPagina": str(cfg.tamanho_pagina),
        **cfg.extra_params,
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": cfg.user_agent,
    }

    last_exc: Optional[BaseException] = None
    for attempt in range(cfg.max_retries):
        try:
            async with session.get(
                cfg.url,
                params=params,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=cfg.timeout_sec),
            ) as resp:
                if resp.status == 429:
                    stats.http_429 += 1
                    sleep_for = _compute_backoff(attempt, resp.headers.get("Retry-After"))
                    logger.warning(
                        "HTTP 429 (rate limit) page=%s attempt=%s retry_in=%.2fs",
                        pagina,
                        attempt + 1,
                        sleep_for,
                    )
                    stats.retries += 1
                    await asyncio.sleep(sleep_for)
                    continue
                if 500 <= resp.status < 600:
                    stats.http_5xx += 1
                    sleep_for = _compute_backoff(attempt, None)
                    body = (await resp.text())[:300]
                    logger.warning(
                        "HTTP %s page=%s attempt=%s retry_in=%.2fs body=%s",
                        resp.status,
                        pagina,
                        attempt + 1,
                        sleep_for,
                        body,
                    )
                    stats.retries += 1
                    await asyncio.sleep(sleep_for)
                    continue
                resp.raise_for_status()
                payload = await resp.json(content_type=None)
                if not isinstance(payload, dict):
                    payload = {"data": payload if isinstance(payload, list) else []}
                return payload
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_exc = exc
            sleep_for = _compute_backoff(attempt, None)
            logger.warning(
                "Falha de rede page=%s attempt=%s err=%s retry_in=%.2fs",
                pagina,
                attempt + 1,
                exc.__class__.__name__,
                sleep_for,
            )
            stats.retries += 1
            await asyncio.sleep(sleep_for)
            continue

    raise RuntimeError(
        f"Esgotadas {cfg.max_retries} tentativas para a página {pagina} "
        f"({cfg.url}). Último erro: {last_exc!r}",
    )


# ---------------------------------------------------------------------------
# Iterador assíncrono que percorre a paginação até o fim.
# ---------------------------------------------------------------------------

def _extract_records(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normaliza o envelope da resposta do PNCP em uma lista de registros."""
    for key in ("data", "items", "registros", "content"):
        chunk = payload.get(key)
        if isinstance(chunk, list):
            return [r for r in chunk if isinstance(r, dict)]
    return []


def _total_pages(payload: Dict[str, Any]) -> Optional[int]:
    for key in ("totalPaginas", "totalPages", "paginasTotais"):
        v = payload.get(key)
        if isinstance(v, int) and v > 0:
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return None


async def iter_contratos(
    session: aiohttp.ClientSession,
    cfg: IngestionConfig,
    stats: IngestionStats,
) -> AsyncIterator[Dict[str, Any]]:
    """Itera todas as páginas do PNCP para a janela [data_inicial, data_final]."""
    pagina = 1
    total_pag: Optional[int] = None
    while True:
        if cfg.max_pages is not None and pagina > cfg.max_pages:
            logger.info("Limite de páginas atingido (--max-pages=%s).", cfg.max_pages)
            return
        payload = await _fetch_page(session, cfg, pagina, stats)
        registros = _extract_records(payload)
        if total_pag is None:
            total_pag = _total_pages(payload)
        stats.pages_fetched += 1
        logger.info(
            "page=%s registros=%s total_paginas=%s",
            pagina,
            len(registros),
            total_pag if total_pag is not None else "?",
        )
        if not registros:
            return
        for r in registros:
            r.setdefault("_ingested_at", datetime.now(timezone.utc).isoformat())
            r.setdefault("_source_url", cfg.url)
            yield r
        if total_pag is not None and pagina >= total_pag:
            return
        if len(registros) < cfg.tamanho_pagina:
            # Heurística defensiva caso a API não preencha totalPaginas.
            return
        pagina += 1


# ---------------------------------------------------------------------------
# Sinks: arquivo local NDJSON ou Google Cloud Storage.
# ---------------------------------------------------------------------------

class NDJSONSink:
    """Sink genérico em NDJSON. Suporta arquivo local ou ``gs://``."""

    def __init__(self, destination: str) -> None:
        self.destination = destination
        self._is_gcs = destination.startswith("gs://")
        self._local_path: Optional[Path] = None
        self._fh: Optional[Any] = None
        self._gcs_blob: Optional[Any] = None
        self._gcs_temp: Optional[Path] = None
        self._records_written = 0

    def __enter__(self) -> "NDJSONSink":
        if self._is_gcs:
            from tempfile import NamedTemporaryFile

            tmp = NamedTemporaryFile(
                prefix="pncp_",
                suffix=".ndjson",
                delete=False,
                mode="w",
                encoding="utf-8",
            )
            self._gcs_temp = Path(tmp.name)
            self._fh = tmp
        else:
            self._local_path = Path(self.destination)
            self._local_path.parent.mkdir(parents=True, exist_ok=True)
            self._fh = self._local_path.open("w", encoding="utf-8")
        return self

    def write(self, record: Dict[str, Any]) -> None:
        assert self._fh is not None, "Sink não inicializado."
        self._fh.write(json.dumps(record, ensure_ascii=False, default=str))
        self._fh.write("\n")
        self._records_written += 1

    def close(self) -> None:
        if self._fh is not None:
            self._fh.flush()
            self._fh.close()
            self._fh = None
        if self._is_gcs and self._gcs_temp is not None:
            self._upload_to_gcs(self._gcs_temp, self.destination)
            self._gcs_temp.unlink(missing_ok=True)

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @property
    def records_written(self) -> int:
        return self._records_written

    @staticmethod
    def _upload_to_gcs(local: Path, gcs_uri: str) -> None:
        """Sobe o NDJSON para um bucket GCS."""
        try:
            from google.cloud import storage  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise SystemExit(
                "google-cloud-storage é necessário para destino gs://. "
                "Instale com: pip install google-cloud-storage",
            ) from exc

        if not gcs_uri.startswith("gs://"):
            raise ValueError(f"URI GCS inválida: {gcs_uri}")
        without_scheme = gcs_uri[len("gs://"):]
        bucket_name, _, object_name = without_scheme.partition("/")
        if not bucket_name or not object_name:
            raise ValueError(f"URI GCS deve ser gs://bucket/objeto.ndjson — recebido {gcs_uri}")
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        logger.info("Enviando NDJSON para GCS: gs://%s/%s", bucket_name, object_name)
        blob.upload_from_filename(str(local), content_type="application/x-ndjson")
        logger.info("Upload GCS concluído (%s bytes).", local.stat().st_size)


# ---------------------------------------------------------------------------
# Orquestração principal.
# ---------------------------------------------------------------------------

@asynccontextmanager
async def _build_session(cfg: IngestionConfig) -> AsyncIterator[aiohttp.ClientSession]:
    connector = aiohttp.TCPConnector(limit=DEFAULT_MAX_CONCURRENCY)
    async with aiohttp.ClientSession(connector=connector) as session:
        yield session


async def run_ingestion(cfg: IngestionConfig, sink: NDJSONSink) -> IngestionStats:
    """Executa toda a ingestão e devolve estatísticas agregadas."""
    stats = IngestionStats()
    logger.info(
        "Iniciando ingestão PNCP url=%s janela=[%s..%s] tamanhoPagina=%s",
        cfg.url,
        cfg.data_inicial,
        cfg.data_final,
        cfg.tamanho_pagina,
    )
    async with _build_session(cfg) as session:
        async for record in iter_contratos(session, cfg, stats):
            sink.write(record)
            stats.records_emitted += 1
            if stats.records_emitted % 1000 == 0:
                logger.info("progresso records=%s pages=%s", stats.records_emitted, stats.pages_fetched)
    logger.info("Ingestão concluída. metrics=%s", json.dumps(stats.to_log_payload()))
    return stats


def _parse_extra_params(values: Iterable[str]) -> Dict[str, str]:
    """Permite passar ``--param chave=valor`` múltiplas vezes."""
    out: Dict[str, str] = {}
    for raw in values or []:
        if "=" not in raw:
            raise ValueError(f"--param inválido (esperado chave=valor): {raw}")
        k, v = raw.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def parse_args(argv: Optional[List[str]] = None) -> Tuple[IngestionConfig, str]:
    parser = argparse.ArgumentParser(
        description="Engine 00 — Ingestão assíncrona PNCP → NDJSON (local ou GCS).",
    )
    parser.add_argument("--data-inicial", required=True, help="AAAAMMDD")
    parser.add_argument("--data-final", required=True, help="AAAAMMDD")
    parser.add_argument(
        "--output",
        required=True,
        help="Arquivo NDJSON local OU URI gs://bucket/objeto.ndjson",
    )
    parser.add_argument("--url", default=DEFAULT_PNCP_URL, help="URL da API PNCP.")
    parser.add_argument(
        "--tamanho-pagina",
        type=int,
        default=DEFAULT_TAMANHO_PAGINA,
        help="Tamanho de página (default %(default)s).",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Limita o número total de páginas (debug).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help="Máx. tentativas com backoff exponencial (default %(default)s).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SEC,
        help="Timeout HTTP por requisição em segundos.",
    )
    parser.add_argument(
        "--user-agent",
        default=DEFAULT_USER_AGENT,
        help="User-Agent enviado ao PNCP.",
    )
    parser.add_argument(
        "--param",
        action="append",
        default=[],
        help="Parâmetro extra na query string, formato chave=valor. Pode repetir.",
    )

    ns = parser.parse_args(argv)
    cfg = IngestionConfig(
        url=ns.url,
        data_inicial=_validate_yyyymmdd(ns.data_inicial, field_name="--data-inicial"),
        data_final=_validate_yyyymmdd(ns.data_final, field_name="--data-final"),
        tamanho_pagina=max(1, min(int(ns.tamanho_pagina), 500)),
        max_pages=ns.max_pages if ns.max_pages and ns.max_pages > 0 else None,
        max_retries=max(1, int(ns.max_retries)),
        timeout_sec=max(5.0, float(ns.timeout)),
        user_agent=ns.user_agent,
        extra_params=_parse_extra_params(ns.param),
    )
    return cfg, ns.output


def main(argv: Optional[List[str]] = None) -> int:
    try:
        cfg, output = parse_args(argv)
    except ValueError as exc:
        logger.error("Argumentos inválidos: %s", exc)
        return 2

    try:
        with NDJSONSink(output) as sink:
            stats = asyncio.run(run_ingestion(cfg, sink))
        logger.info(
            "OK output=%s records=%s pages=%s",
            output,
            stats.records_emitted,
            stats.pages_fetched,
        )
        return 0
    except Exception:
        logger.exception("Falha não recuperável na engine 00.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
