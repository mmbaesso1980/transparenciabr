#!/usr/bin/env python3
"""
Engine 06 - Analise semantica forense de contratos extraidos por OCR.

Le arquivos .txt gerados pela Engine 05 em /extracted_texts, envia o conteudo
ao Gemini 2.5 Pro (motor unico; Lider Supremo agent_1777236402725) com instrucoes
de sistema restritas para auditoria forense
em direito administrativo brasileiro, e salva somente JSONs locais em
/semantic_results. Nao grava em Firestore, BigQuery ou qualquer banco.

Exemplo:
  python3 engines/06_engine_semantic.py --input-dir /extracted_texts --output-dir /semantic_results
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from google import genai
from google.genai import types
from tenacity import (
    AsyncRetrying,
    before_sleep_log,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential_jitter,
)

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.genai_client import require_gemini_api_key

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("engine_06_semantic")

DEFAULT_INPUT_DIR = os.environ.get("SEMANTIC_INPUT_DIR", "/extracted_texts")
DEFAULT_OUTPUT_DIR = os.environ.get("SEMANTIC_OUTPUT_DIR", "/semantic_results")
SUPREME_AGENT_ID = "agent_1777236402725"
DEFAULT_MODEL = os.environ.get("GEMINI_SEMANTIC_MODEL", "gemini-2.5-pro")
DEFAULT_BATCH_SIZE = int(os.environ.get("SEMANTIC_BATCH_SIZE", "5"))
DEFAULT_MAX_RETRIES = int(os.environ.get("SEMANTIC_MAX_RETRIES", "6"))
DEFAULT_BACKOFF_INITIAL = float(os.environ.get("SEMANTIC_BACKOFF_INITIAL_SECONDS", "1.0"))
DEFAULT_BACKOFF_MAX = float(os.environ.get("SEMANTIC_BACKOFF_MAX_SECONDS", "90.0"))
DEFAULT_MAX_CHARS = int(os.environ.get("SEMANTIC_MAX_CHARS", "700000"))

ALLOWED_MODELS = {"gemini-2.5-pro"}

SYSTEM_INSTRUCTION = """\
Voce e um auditor forense senior do TransparenciaBR, especialista em direito
administrativo brasileiro, licitacoes, contratos publicos, Lei 14.133/2021,
Lei 8.666/1993, improbidade administrativa, controle externo e padroes de
fraude contra a administracao publica.

Protocolo Oraculo:
1. Analise exclusivamente o texto fornecido. Nao invente fatos, orgaos,
   valores, pessoas, documentos ou jurisprudencia que nao estejam no texto.
2. Identifique apenas riscos juridico-administrativos plausiveis e explique
   achados com linguagem tecnica, curta e verificavel.
3. Diferencie suspeita, irregularidade formal e indicio material de fraude.
4. Se o texto for insuficiente, atribua risco baixo ou moderado e registre a
   limitacao no resumo. Nunca preencha lacunas por imaginacao.
5. Responda somente JSON valido no schema pedido. Nao use markdown.
"""

PROMPT_SCHEMA = """\
Retorne estritamente um JSON com este schema:
{
  "indice_risco": 0,
  "fraudes_detectadas": ["lista curta de strings com tipos de risco ou vazia"],
  "resumo_auditoria": "string curta, objetiva e sem markdown",
  "achados": [
    {
      "tipo": "sobrepreco|direcionamento|dispensa_indevida|fracionamento|conflito_interesse|fiscalizacao_fragil|pagamento_irregular|outro",
      "gravidade": "baixa|media|alta|critica",
      "trecho_relevante": "citacao curta do texto analisado",
      "fundamento": "explicacao tecnica curta baseada no texto"
    }
  ],
  "confianca": 0.0
}

Regras de preenchimento:
- indice_risco deve ser inteiro de 0 a 100.
- fraudes_detectadas deve conter apenas strings, sem objetos.
- resumo_auditoria deve ter no maximo 500 caracteres.
- confianca deve ser numero entre 0 e 1.
"""


@dataclass(frozen=True)
class TextDocument:
    """Arquivo de texto extraido pela Engine 05."""

    source_path: Path
    contract_id: str
    output_path: Path


@dataclass(frozen=True)
class SemanticResult:
    """Resultado resumido de uma analise semantica."""

    contract_id: str
    output_path: Path
    ok: bool
    elapsed_seconds: float
    prompt_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    error: Optional[str] = None


def _is_retryable_gemini_error(exc: BaseException) -> bool:
    """Retorna True para erros transitorios de quota/rede do Gemini."""

    text = str(exc).lower()
    retry_tokens = (
        "429",
        "500",
        "502",
        "503",
        "504",
        "quota",
        "rate",
        "resource exhausted",
        "too many requests",
        "timeout",
        "temporarily",
        "unavailable",
        "deadline",
    )
    return any(token in text for token in retry_tokens)


def _safe_contract_id(path: Path) -> str:
    """Cria ID estavel a partir do nome do arquivo .txt."""

    raw = path.stem.strip() or "contrato"
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("._-")
    return safe or "contrato"


def _json_output_path(output_dir: Path, contract_id: str) -> Path:
    """Retorna caminho local do JSON semantico."""

    return output_dir / f"{contract_id}.json"


def discover_text_documents(input_dir: Path, output_dir: Path, *, overwrite: bool) -> List[TextDocument]:
    """Lista arquivos .txt locais a analisar."""

    if not input_dir.exists():
        logger.warning("Input directory does not exist: path=%s", input_dir)
        return []

    output_dir.mkdir(parents=True, exist_ok=True)
    docs: List[TextDocument] = []
    for path in sorted(input_dir.rglob("*.txt")):
        if not path.is_file():
            continue
        contract_id = _safe_contract_id(path)
        output_path = _json_output_path(output_dir, contract_id)
        if output_path.exists() and not overwrite:
            logger.info("Skipping already processed contract: id=%s output=%s", contract_id, output_path)
            continue
        docs.append(TextDocument(source_path=path, contract_id=contract_id, output_path=output_path))

    logger.info("Semantic discovery finished: input=%s pending_files=%s", input_dir, len(docs))
    return docs


async def read_text_file(path: Path, *, max_chars: int) -> str:
    """Le arquivo de texto sem bloquear o event loop."""

    text = await asyncio.to_thread(path.read_text, "utf-8", errors="replace")
    text = text.strip()
    if max_chars > 0 and len(text) > max_chars:
        logger.warning(
            "Text truncated to max_chars: path=%s original_chars=%s max_chars=%s",
            path,
            len(text),
            max_chars,
        )
        text = text[:max_chars]
    return text


def build_prompt(contract_id: str, contract_text: str) -> str:
    """Monta payload de analise enviado ao Gemini."""

    payload = {
        "contract_id": contract_id,
        "texto_contrato": contract_text,
        "schema_obrigatorio": PROMPT_SCHEMA,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def build_generation_config(temperature: float) -> types.GenerateContentConfig:
    """Configura Gemini para resposta JSON deterministica."""

    return types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        temperature=temperature,
        max_output_tokens=8192,
    )


def extract_usage_metadata(response: Any) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """Extrai contagem de tokens quando o SDK disponibiliza usage_metadata."""

    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return None, None, None

    prompt_tokens = getattr(usage, "prompt_token_count", None)
    output_tokens = getattr(usage, "candidates_token_count", None)
    total_tokens = getattr(usage, "total_token_count", None)
    return (
        int(prompt_tokens) if prompt_tokens is not None else None,
        int(output_tokens) if output_tokens is not None else None,
        int(total_tokens) if total_tokens is not None else None,
    )


def parse_json_response(raw_text: str) -> Dict[str, Any]:
    """Parseia JSON retornado pelo Gemini e normaliza campos obrigatorios."""

    text = (raw_text or "").strip()
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Resposta Gemini nao e um objeto JSON.")

    indice = data.get("indice_risco", 0)
    try:
        indice_int = int(indice)
    except (TypeError, ValueError):
        indice_int = 0
    data["indice_risco"] = max(0, min(100, indice_int))

    fraudes = data.get("fraudes_detectadas", [])
    if not isinstance(fraudes, list):
        fraudes = [str(fraudes)]
    data["fraudes_detectadas"] = [str(item) for item in fraudes if str(item).strip()]

    resumo = data.get("resumo_auditoria", "")
    data["resumo_auditoria"] = str(resumo).strip()[:500]

    achados = data.get("achados", [])
    data["achados"] = achados if isinstance(achados, list) else []

    confianca = data.get("confianca", 0.0)
    try:
        confianca_float = float(confianca)
    except (TypeError, ValueError):
        confianca_float = 0.0
    data["confianca"] = max(0.0, min(1.0, confianca_float))
    return data


async def call_gemini_with_backoff(
    client: genai.Client,
    *,
    model: str,
    prompt: str,
    config: types.GenerateContentConfig,
    max_retries: int,
    backoff_initial: float,
    backoff_max: float,
) -> Tuple[Dict[str, Any], Tuple[Optional[int], Optional[int], Optional[int]]]:
    """Chama Gemini em thread com tenacity para evitar 429/RPM."""

    async for attempt in AsyncRetrying(
        retry=retry_if_exception(_is_retryable_gemini_error),
        wait=wait_exponential_jitter(initial=backoff_initial, max=backoff_max),
        stop=stop_after_attempt(max_retries),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    ):
        with attempt:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=prompt,
                config=config,
            )
            raw_text = (getattr(response, "text", "") or "").strip()
            parsed = parse_json_response(raw_text)
            usage = extract_usage_metadata(response)
            return parsed, usage

    raise RuntimeError("Gemini retry loop ended unexpectedly.")


async def write_semantic_json(path: Path, payload: Dict[str, Any]) -> None:
    """Salva JSON semantico localmente."""

    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    await asyncio.to_thread(path.write_text, text + "\n", "utf-8")


async def analyze_one_document(
    doc: TextDocument,
    *,
    client: genai.Client,
    model: str,
    generation_config: types.GenerateContentConfig,
    max_retries: int,
    backoff_initial: float,
    backoff_max: float,
    max_chars: int,
) -> SemanticResult:
    """Analisa um contrato e grava o JSON resultante."""

    start = time.perf_counter()
    logger.info("Semantic analysis started: id=%s source=%s", doc.contract_id, doc.source_path)
    try:
        contract_text = await read_text_file(doc.source_path, max_chars=max_chars)
        if not contract_text:
            raise ValueError("Arquivo de texto vazio.")

        prompt = build_prompt(doc.contract_id, contract_text)
        analysis, usage = await call_gemini_with_backoff(
            client,
            model=model,
            prompt=prompt,
            config=generation_config,
            max_retries=max_retries,
            backoff_initial=backoff_initial,
            backoff_max=backoff_max,
        )
        prompt_tokens, output_tokens, total_tokens = usage
        payload = {
            "contract_id": doc.contract_id,
            "source_file": str(doc.source_path),
            "model": model,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "token_usage": {
                "prompt_tokens": prompt_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
            "analysis": analysis,
        }
        await write_semantic_json(doc.output_path, payload)

        elapsed = time.perf_counter() - start
        logger.info(
            "Semantic analysis success: id=%s output=%s risk=%s prompt_tokens=%s output_tokens=%s total_tokens=%s elapsed_seconds=%.2f",
            doc.contract_id,
            doc.output_path,
            analysis.get("indice_risco"),
            prompt_tokens,
            output_tokens,
            total_tokens,
            elapsed,
        )
        return SemanticResult(
            contract_id=doc.contract_id,
            output_path=doc.output_path,
            ok=True,
            elapsed_seconds=elapsed,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )
    except Exception as exc:
        elapsed = time.perf_counter() - start
        logger.exception(
            "Semantic analysis failed: id=%s source=%s elapsed_seconds=%.2f error=%s",
            doc.contract_id,
            doc.source_path,
            elapsed,
            exc,
        )
        return SemanticResult(
            contract_id=doc.contract_id,
            output_path=doc.output_path,
            ok=False,
            elapsed_seconds=elapsed,
            error=str(exc),
        )


async def process_in_batches(
    docs: List[TextDocument],
    *,
    client: genai.Client,
    model: str,
    generation_config: types.GenerateContentConfig,
    batch_size: int,
    max_retries: int,
    backoff_initial: float,
    backoff_max: float,
    max_chars: int,
) -> List[SemanticResult]:
    """Processa contratos em lotes com asyncio.gather."""

    results: List[SemanticResult] = []
    size = max(1, batch_size)
    for offset in range(0, len(docs), size):
        batch = docs[offset : offset + size]
        logger.info(
            "Semantic batch starting: batch_start=%s batch_size=%s model=%s",
            offset,
            len(batch),
            model,
        )
        batch_results = await asyncio.gather(
            *[
                analyze_one_document(
                    doc,
                    client=client,
                    model=model,
                    generation_config=generation_config,
                    max_retries=max_retries,
                    backoff_initial=backoff_initial,
                    backoff_max=backoff_max,
                    max_chars=max_chars,
                )
                for doc in batch
            ],
        )
        results.extend(batch_results)
    return results


async def run_async(args: argparse.Namespace) -> int:
    """Executa a engine semantica."""

    if args.model not in ALLOWED_MODELS:
        raise ValueError(
            f"Modelo nao permitido: {args.model}. Motor unico: gemini-2.5-pro "
            f"(Lider Supremo {SUPREME_AGENT_ID}).",
        )

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    docs = discover_text_documents(input_dir, output_dir, overwrite=args.overwrite)
    if args.limit is not None:
        docs = docs[: max(0, args.limit)]
    if not docs:
        logger.warning("No .txt files pending semantic analysis: input=%s", input_dir)
        return 0

    api_key = args.api_key or require_gemini_api_key()
    client = genai.Client(api_key=api_key)
    generation_config = build_generation_config(args.temperature)

    logger.info(
        "Semantic engine starting: files=%s model=%s batch_size=%s temperature=%.2f output_dir=%s",
        len(docs),
        args.model,
        args.batch_size,
        args.temperature,
        output_dir,
    )
    results = await process_in_batches(
        docs,
        client=client,
        model=args.model,
        generation_config=generation_config,
        batch_size=args.batch_size,
        max_retries=args.max_retries,
        backoff_initial=args.backoff_initial,
        backoff_max=args.backoff_max,
        max_chars=args.max_chars,
    )

    successes = sum(1 for result in results if result.ok)
    failures = len(results) - successes
    total_tokens = sum(result.total_tokens or 0 for result in results)
    logger.info(
        "Semantic engine finished: files=%s success=%s failures=%s total_tokens=%s",
        len(results),
        successes,
        failures,
        total_tokens if total_tokens else None,
    )
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    """Cria parser de CLI."""

    parser = argparse.ArgumentParser(description="Engine 06: Gemini 2.5 Pro semantic audit -> local JSON.")
    parser.add_argument("--input-dir", default=DEFAULT_INPUT_DIR, help="Diretorio com .txt da Engine 05.")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Diretorio local para JSONs semanticos.")
    parser.add_argument("--model", default=DEFAULT_MODEL, choices=sorted(ALLOWED_MODELS))
    parser.add_argument("--temperature", type=float, default=float(os.environ.get("SEMANTIC_TEMPERATURE", "0.1")))
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--backoff-initial", type=float, default=DEFAULT_BACKOFF_INITIAL)
    parser.add_argument("--backoff-max", type=float, default=DEFAULT_BACKOFF_MAX)
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    parser.add_argument("--limit", type=int, default=None, help="Limita quantidade de contratos para testes.")
    parser.add_argument("--overwrite", action="store_true", help="Reprocessa contratos que ja possuem JSON.")
    parser.add_argument("--api-key", default=None, help="Opcional; por padrao usa GEMINI_API_KEY/GOOGLE_API_KEY.")
    return parser


def main() -> int:
    """Ponto de entrada CLI."""

    parser = build_parser()
    args = parser.parse_args()
    try:
        return asyncio.run(run_async(args))
    except KeyboardInterrupt:
        logger.warning("Semantic engine interrupted by user.")
        return 130
    except Exception as exc:
        logger.exception("Semantic engine failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
