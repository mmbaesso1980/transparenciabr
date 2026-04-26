#!/usr/bin/env python3
"""
Engine 05 - OCR Document AI para contratos e notas fiscais baixados.

Este motor varre PDFs/imagens em um diretorio local ou em um prefixo GCS,
processa cada arquivo exclusivamente por um processador Document AI do tipo
OCR_PROCESSOR (Enterprise Document OCR) e salva somente o texto extraido em
arquivos .txt locais. Nao envia dados para banco de dados.

Exemplos:
  python3 engines/05_engine_vision.py --processor-id OCR_ID
  python3 engines/05_engine_vision.py --input gs://bucket/raw_pdfs --processor-id OCR_ID
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import mimetypes
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

from google.api_core import exceptions as google_exceptions
from google.api_core.client_options import ClientOptions
from google.cloud import documentai_v1 as documentai
from google.cloud import storage
from tenacity import (
    AsyncRetrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import gcp_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_05_vision")

DEFAULT_INPUT = os.environ.get("VISION_INPUT", "/raw_pdfs")
DEFAULT_OUTPUT = os.environ.get("VISION_OUTPUT", "/extracted_texts")
DEFAULT_LOCATION = os.environ.get("DOCUMENTAI_LOCATION", "us")
DEFAULT_CONCURRENCY = int(os.environ.get("DOCUMENTAI_CONCURRENCY", "4"))
DEFAULT_MAX_RETRIES = int(os.environ.get("DOCUMENTAI_MAX_RETRIES", "6"))
DEFAULT_BACKOFF_INITIAL = float(os.environ.get("DOCUMENTAI_BACKOFF_INITIAL_SECONDS", "1.0"))
DEFAULT_BACKOFF_MAX = float(os.environ.get("DOCUMENTAI_BACKOFF_MAX_SECONDS", "60.0"))

OCR_PROCESSOR_TYPE = "OCR_PROCESSOR"
SUPPORTED_SUFFIXES = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".gif",
    ".bmp",
    ".webp",
}
MIME_OVERRIDES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
}
RETRYABLE_DOCUMENTAI_ERRORS = (
    google_exceptions.ResourceExhausted,
    google_exceptions.ServiceUnavailable,
    google_exceptions.DeadlineExceeded,
    google_exceptions.InternalServerError,
    google_exceptions.TooManyRequests,
)


@dataclass(frozen=True)
class SourceDocument:
    """Arquivo de entrada a processar."""

    source_id: str
    display_name: str
    mime_type: str
    local_path: Optional[Path] = None
    gcs_uri: Optional[str] = None


@dataclass(frozen=True)
class ProcessResult:
    """Resultado resumido de OCR para logs e codigo de saida."""

    source_id: str
    output_path: Path
    text_chars: int
    elapsed_seconds: float
    ok: bool
    error: Optional[str] = None


def _parse_gs_uri(uri: str) -> Tuple[str, str]:
    """Separa bucket e prefixo/objeto de uma URI gs://."""

    if not uri.startswith("gs://"):
        raise ValueError(f"URI GCS invalida: {uri}")
    rest = uri[5:]
    bucket, _, blob = rest.partition("/")
    if not bucket:
        raise ValueError(f"URI GCS sem bucket: {uri}")
    return bucket, blob


def _is_supported_name(name: str) -> bool:
    """Retorna True quando a extensao e suportada pelo OCR."""

    return Path(name).suffix.lower() in SUPPORTED_SUFFIXES


def _guess_mime_type(name: str) -> str:
    """Infere MIME type com overrides para formatos de OCR."""

    suffix = Path(name).suffix.lower()
    if suffix in MIME_OVERRIDES:
        return MIME_OVERRIDES[suffix]
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def _safe_output_name(source_id: str) -> str:
    """Cria nome de arquivo .txt seguro a partir do ID/nome original."""

    path = source_id[5:] if source_id.startswith("gs://") else source_id
    stem = Path(path).stem or "document"
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem).strip("._-")
    return f"{safe or 'document'}.txt"


def list_local_documents(input_dir: Path) -> List[SourceDocument]:
    """Lista PDFs/imagens locais para processamento."""

    if not input_dir.exists():
        logger.warning("Input directory does not exist: path=%s", input_dir)
        return []
    documents: List[SourceDocument] = []
    for path in sorted(input_dir.rglob("*")):
        if not path.is_file() or not _is_supported_name(path.name):
            continue
        documents.append(
            SourceDocument(
                source_id=str(path),
                display_name=path.name,
                mime_type=_guess_mime_type(path.name),
                local_path=path,
            ),
        )
    logger.info("Local discovery finished: input=%s files=%s", input_dir, len(documents))
    return documents


def list_gcs_documents(input_uri: str) -> List[SourceDocument]:
    """Lista PDFs/imagens em um prefixo GCS."""

    bucket_name, prefix = _parse_gs_uri(input_uri)
    client = storage.Client()
    blobs = client.list_blobs(bucket_name, prefix=prefix)
    documents: List[SourceDocument] = []
    for blob in blobs:
        if blob.name.endswith("/") or not _is_supported_name(blob.name):
            continue
        gcs_uri = f"gs://{bucket_name}/{blob.name}"
        documents.append(
            SourceDocument(
                source_id=gcs_uri,
                display_name=Path(blob.name).name,
                mime_type=_guess_mime_type(blob.name),
                gcs_uri=gcs_uri,
            ),
        )
    logger.info("GCS discovery finished: input=%s files=%s", input_uri, len(documents))
    return documents


async def discover_documents(input_uri: str) -> List[SourceDocument]:
    """Descobre documentos localmente ou em GCS sem bloquear o event loop."""

    if input_uri.startswith("gs://"):
        return await asyncio.to_thread(list_gcs_documents, input_uri)
    return await asyncio.to_thread(list_local_documents, Path(input_uri))


async def read_document_bytes(doc: SourceDocument) -> bytes:
    """Le bytes do documento local ou baixa o objeto GCS."""

    if doc.local_path is not None:
        return await asyncio.to_thread(doc.local_path.read_bytes)
    if doc.gcs_uri is None:
        raise ValueError(f"Documento sem origem legivel: {doc}")

    def _download() -> bytes:
        bucket_name, blob_name = _parse_gs_uri(doc.gcs_uri or "")
        return storage.Client().bucket(bucket_name).blob(blob_name).download_as_bytes()

    return await asyncio.to_thread(_download)


def build_processor_name(project: str, location: str, processor_id: str) -> str:
    """Monta o resource name do processador Document AI."""

    return f"projects/{project}/locations/{location}/processors/{processor_id}"


def build_documentai_client(location: str) -> documentai.DocumentProcessorServiceAsyncClient:
    """Cria cliente async do Document AI no endpoint regional correto."""

    endpoint = f"{location}-documentai.googleapis.com"
    return documentai.DocumentProcessorServiceAsyncClient(
        client_options=ClientOptions(api_endpoint=endpoint),
    )


async def assert_ocr_processor(
    client: documentai.DocumentProcessorServiceAsyncClient,
    processor_name: str,
) -> None:
    """Falha se o processador configurado nao for OCR_PROCESSOR."""

    processor = await client.get_processor(name=processor_name)
    processor_type = str(getattr(processor, "type_", "") or getattr(processor, "type", ""))
    logger.info(
        "Document AI processor resolved: name=%s display_name=%s type=%s",
        processor_name,
        getattr(processor, "display_name", ""),
        processor_type,
    )
    if processor_type != OCR_PROCESSOR_TYPE:
        raise RuntimeError(
            "Processor type blocked by cost routing policy: "
            f"expected={OCR_PROCESSOR_TYPE} actual={processor_type}. "
            "Use an Enterprise Document OCR processor; invoice/specialized parsers are not allowed.",
        )


async def process_document_with_backoff(
    client: documentai.DocumentProcessorServiceAsyncClient,
    *,
    processor_name: str,
    content: bytes,
    mime_type: str,
    max_retries: int,
    backoff_initial: float,
    backoff_max: float,
) -> documentai.Document:
    """Chama Document AI OCR com exponential backoff para limites/RPM."""

    raw_document = documentai.RawDocument(content=content, mime_type=mime_type)
    request = documentai.ProcessRequest(name=processor_name, raw_document=raw_document)

    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type(RETRYABLE_DOCUMENTAI_ERRORS),
        wait=wait_exponential_jitter(initial=backoff_initial, max=backoff_max),
        stop=stop_after_attempt(max_retries),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    ):
        with attempt:
            response = await client.process_document(request=request)
            return response.document

    raise RuntimeError("Document AI retry loop ended unexpectedly.")


async def write_text_output(output_dir: Path, doc: SourceDocument, text: str) -> Path:
    """Salva texto extraido em arquivo .txt local isolado."""

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / _safe_output_name(doc.source_id)
    await asyncio.to_thread(output_path.write_text, text or "", "utf-8")
    return output_path


async def process_one_document(
    doc: SourceDocument,
    *,
    client: documentai.DocumentProcessorServiceAsyncClient,
    processor_name: str,
    output_dir: Path,
    semaphore: asyncio.Semaphore,
    max_retries: int,
    backoff_initial: float,
    backoff_max: float,
) -> ProcessResult:
    """Processa um arquivo com OCR e grava o texto extraido."""

    start = time.perf_counter()
    async with semaphore:
        logger.info("OCR started: source=%s mime_type=%s", doc.source_id, doc.mime_type)
        try:
            content = await read_document_bytes(doc)
            document = await process_document_with_backoff(
                client,
                processor_name=processor_name,
                content=content,
                mime_type=doc.mime_type,
                max_retries=max_retries,
                backoff_initial=backoff_initial,
                backoff_max=backoff_max,
            )
            output_path = await write_text_output(output_dir, doc, document.text or "")
            elapsed = time.perf_counter() - start
            logger.info(
                "OCR success: source=%s output=%s chars=%s elapsed_seconds=%.2f",
                doc.source_id,
                output_path,
                len(document.text or ""),
                elapsed,
            )
            return ProcessResult(
                source_id=doc.source_id,
                output_path=output_path,
                text_chars=len(document.text or ""),
                elapsed_seconds=elapsed,
                ok=True,
            )
        except Exception as exc:
            elapsed = time.perf_counter() - start
            logger.exception(
                "OCR failed: source=%s elapsed_seconds=%.2f error=%s",
                doc.source_id,
                elapsed,
                exc,
            )
            return ProcessResult(
                source_id=doc.source_id,
                output_path=output_dir / _safe_output_name(doc.source_id),
                text_chars=0,
                elapsed_seconds=elapsed,
                ok=False,
                error=str(exc),
            )


async def run_async(args: argparse.Namespace) -> int:
    """Executa a engine 05 de ponta a ponta."""

    project = args.project or gcp_project_id()
    processor_name = build_processor_name(project, args.location, args.processor_id)
    client = build_documentai_client(args.location)

    await assert_ocr_processor(client, processor_name)

    documents = await discover_documents(args.input)
    if args.limit is not None:
        documents = documents[: max(0, args.limit)]
    if not documents:
        logger.warning("No supported PDF/image files found: input=%s", args.input)
        return 0

    logger.info(
        "OCR batch starting: files=%s processor=%s concurrency=%s output_dir=%s",
        len(documents),
        processor_name,
        args.concurrency,
        args.output_dir,
    )

    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    tasks = [
        asyncio.create_task(
            process_one_document(
                doc,
                client=client,
                processor_name=processor_name,
                output_dir=Path(args.output_dir),
                semaphore=semaphore,
                max_retries=args.max_retries,
                backoff_initial=args.backoff_initial,
                backoff_max=args.backoff_max,
            ),
        )
        for doc in documents
    ]
    results = await asyncio.gather(*tasks)

    successes = sum(1 for result in results if result.ok)
    failures = len(results) - successes
    total_chars = sum(result.text_chars for result in results)
    logger.info(
        "OCR batch finished: files=%s success=%s failures=%s total_chars=%s",
        len(results),
        successes,
        failures,
        total_chars,
    )
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    """Cria parser de CLI da engine 05."""

    parser = argparse.ArgumentParser(description="Engine 05: Document AI OCR -> extracted .txt files.")
    parser.add_argument(
        "--input",
        default=DEFAULT_INPUT,
        help="Diretorio local ou prefixo gs:// com PDFs/imagens baixados.",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT,
        help="Diretorio local para arquivos .txt extraidos.",
    )
    parser.add_argument("--project", default=gcp_project_id(), help="Projeto GCP.")
    parser.add_argument("--location", default=DEFAULT_LOCATION, help="Regiao do processador Document AI.")
    parser.add_argument(
        "--processor-id",
        default=os.environ.get("DOCUMENTAI_OCR_PROCESSOR_ID"),
        required=os.environ.get("DOCUMENTAI_OCR_PROCESSOR_ID") is None,
        help="ID de um processador Document AI do tipo OCR_PROCESSOR. Invoice/parsers sao bloqueados.",
    )
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--backoff-initial", type=float, default=DEFAULT_BACKOFF_INITIAL)
    parser.add_argument("--backoff-max", type=float, default=DEFAULT_BACKOFF_MAX)
    parser.add_argument("--limit", type=int, default=None, help="Limita quantidade de arquivos para testes.")
    return parser


def main() -> int:
    """Ponto de entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        return asyncio.run(run_async(args))
    except KeyboardInterrupt:
        logger.warning("OCR interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("Engine 05 failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
