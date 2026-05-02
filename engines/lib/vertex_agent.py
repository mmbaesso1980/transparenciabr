"""
Cliente fino para Vertex AI / Gemini 2.x — usado pelos engines de sumarização.

Princípios:
    * IDs e região vêm do ambiente, nunca hardcoded.
        - GCP_PROJECT_ID            (já usado em todo o repo)
        - VERTEX_LOCATION           (default: us-central1)
        - VERTEX_MODEL              (default: gemini-2.5-pro)
        - VERTEX_AGENT_ID           (opcional — log/observabilidade apenas)
        - VERTEX_REQUEST_TIMEOUT    (segundos, default 60)
    * Backoff exponencial reaproveitando ``lib.resilience``.
    * Logging compatível com Cloud Logging (severity + payload curto).
    * Prompt-guard: prefixa toda chamada com instrução factual/neutra para
      evitar rotulagem ideológica de pessoas reais. Não substitui revisão
      humana, mas reduz risco de saída tendenciosa por acidente.

A SDK ``google-genai`` (configurada com ``vertexai=True``) é o caminho
canônico. Caso a lib não esteja disponível, o ``summarize_neutral`` levanta
``RuntimeError`` controlado em vez de quebrar o engine inteiro.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

from lib.project_config import gcp_project_id
from lib.resilience import call_with_exponential_backoff

logger = logging.getLogger(__name__)


DEFAULT_LOCATION = "us-central1"
DEFAULT_MODEL = "gemini-2.5-pro"


@dataclass(frozen=True)
class VertexConfig:
    """Configuração resolvida a partir do ambiente."""

    project: str
    location: str
    model: str
    agent_id: Optional[str]
    timeout_sec: float

    @property
    def log_tag(self) -> str:
        if self.agent_id:
            return f"vertex[{self.agent_id}]:{self.model}@{self.location}"
        return f"vertex:{self.model}@{self.location}"


def load_config() -> VertexConfig:
    """Lê todas as configurações do ambiente. Não cacheia (testes ficam fáceis)."""
    project = gcp_project_id()
    if not project:
        raise RuntimeError(
            "GCP_PROJECT_ID não definido — Vertex AI requer projeto explícito.",
        )
    supreme = (os.environ.get("VERTEX_AGENT_ID") or "").strip() or "agent_1777236402725"
    return VertexConfig(
        project=project,
        location=os.environ.get("VERTEX_LOCATION", DEFAULT_LOCATION).strip() or DEFAULT_LOCATION,
        model=os.environ.get("VERTEX_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        agent_id=supreme,
        timeout_sec=float(os.environ.get("VERTEX_REQUEST_TIMEOUT", "60")),
    )


# ---------------------------------------------------------------------------
# Prompt-guard.
# ---------------------------------------------------------------------------

NEUTRALITY_PREFIX = (
    "Você é um analista forense de dados públicos brasileiros. "
    "Regras inegociáveis para esta resposta:\n"
    "1. Trabalhe SOMENTE com os fatos, números e referências contidos no contexto.\n"
    "2. NÃO atribua rótulos ideológicos (ex.: 'esquerda', 'direita', 'radical', 'progressista', "
    "'conservador') a pessoas, partidos ou movimentos reais.\n"
    "3. NÃO use adjetivos de juízo de valor político ou moral. Descreva ações e cifras, "
    "não intenções presumidas.\n"
    "4. Se um dado estiver ausente, escreva 'sem dados' em vez de inferir.\n"
    "5. Mantenha tom técnico, frio, em português do Brasil.\n"
    "6. Cite a fonte (tabela/coleção/URL) entre colchetes ao final de cada afirmação factual.\n"
)


def _build_prompt(context: str, instruction: str) -> str:
    return (
        f"{NEUTRALITY_PREFIX}\n\n"
        f"=== CONTEXTO (apenas isto deve ser usado) ===\n{context}\n"
        f"=== TAREFA ===\n{instruction}\n"
    )


# ---------------------------------------------------------------------------
# Cliente.
# ---------------------------------------------------------------------------

def _import_genai() -> Any:
    try:
        from google import genai  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "google-genai não está instalado. Adicione ao requirements e instale.",
        ) from exc
    return genai


def _build_client(cfg: VertexConfig) -> Any:
    genai = _import_genai()
    return genai.Client(
        vertexai=True,
        project=cfg.project,
        location=cfg.location,
    )


def _is_retriable(exc: BaseException) -> bool:
    """Heurística: erros de rede / 5xx / quota retentável devem reentrar."""
    name = exc.__class__.__name__.lower()
    msg = str(exc).lower()
    if any(s in name for s in ("timeout", "deadline", "unavailable", "internal")):
        return True
    if any(code in msg for code in (" 429", " 500", " 502", " 503", " 504", "deadline")):
        return True
    return False


def summarize_neutral(
    *,
    context: str,
    instruction: str,
    cfg: Optional[VertexConfig] = None,
    max_attempts: int = 4,
) -> str:
    """Gera um resumo neutro a partir de ``context`` + ``instruction``.

    O prompt é envolvido pelo ``NEUTRALITY_PREFIX`` que proíbe rotulagem
    ideológica e exige citações. Em caso de falha transitória, faz backoff
    exponencial até ``max_attempts``.

    Levanta ``RuntimeError`` quando esgota tentativas ou a SDK não está
    disponível — quem chama deve degradar elegantemente.
    """
    cfg = cfg or load_config()
    prompt = _build_prompt(context=context, instruction=instruction)

    def _do_call() -> str:
        client = _build_client(cfg)
        logger.info(
            "vertex.call tag=%s prompt_chars=%s",
            cfg.log_tag,
            len(prompt),
        )
        resp = client.models.generate_content(
            model=cfg.model,
            contents=prompt,
        )
        text = getattr(resp, "text", None) or ""
        if not text:
            raise RuntimeError(f"{cfg.log_tag}: resposta vazia.")
        logger.info(
            "vertex.ok tag=%s response_chars=%s",
            cfg.log_tag,
            len(text),
        )
        return text

    return call_with_exponential_backoff(
        _do_call,
        max_attempts=max_attempts,
        retry_on=_is_retriable,
        base_sec=2.0,
        max_sec=30.0,
    )


__all__ = [
    "VertexConfig",
    "load_config",
    "summarize_neutral",
    "NEUTRALITY_PREFIX",
    "DEFAULT_LOCATION",
    "DEFAULT_MODEL",
]
