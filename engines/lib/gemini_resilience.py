"""
Resiliência para chamadas Gemini — backoff exponencial e circuit breaker de custo/quota.

Objetivo: evitar estrangular cota (429), degradar graciosamente sob falhas repetidas
e impedir loops caros quando a API está indisponível.
"""

import logging
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    """Abre o circuito após falhas consecutivas; cooldown antes de nova tentativa."""

    failure_threshold: int = 5
    recovery_seconds: float = 60.0


@dataclass
class CircuitBreaker:
    """
    Circuit breaker simples (padrão Martin Fowler adaptado).

    - **CLOSED**: tráfego normal; falhas incrementam contador.
    - **OPEN**: chamadas falham imediatamente sem bater na API (protege cota/custo).
    - **HALF_OPEN**: após cooldown, uma tentativa; sucesso fecha, falha reabre.
    """

    config: CircuitBreakerConfig = field(default_factory=CircuitBreakerConfig)
    state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    opened_at: Optional[float] = None

    def call(self, fn: Callable[[], T], *, operation: str = "gemini") -> T:
        now = time.monotonic()

        if self.state == CircuitState.OPEN:
            if self.opened_at is not None and now - self.opened_at < self.config.recovery_seconds:
                remaining = self.config.recovery_seconds - (now - self.opened_at)
                raise RuntimeError(
                    f"Circuit breaker OPEN — '{operation}' bloqueado ~{remaining:.0f}s "
                    "(proteção de cota/custo). Verifique API key, quota e saúde do serviço."
                )
            logger.warning("[%s] Circuit breaker → HALF_OPEN (janela de teste).", operation)
            self.state = CircuitState.HALF_OPEN

        try:
            result = fn()
        except Exception:
            self._record_failure(operation)
            raise

        self._record_success(operation)
        return result

    def _record_failure(self, operation: str) -> None:
        self.consecutive_failures += 1
        logger.warning(
            "[%s] Falha consecutiva %d/%d.",
            operation,
            self.consecutive_failures,
            self.config.failure_threshold,
        )
        if self.consecutive_failures >= self.config.failure_threshold:
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()
            logger.error(
                "[%s] Circuit breaker → OPEN — pausa de %.0fs antes de novo teste.",
                operation,
                self.config.recovery_seconds,
            )

    def _record_success(self, operation: str) -> None:
        self.consecutive_failures = 0
        self.state = CircuitState.CLOSED
        self.opened_at = None


def exponential_backoff_sleep(
    attempt: int,
    *,
    base_seconds: float = 2.0,
    max_seconds: float = 120.0,
    jitter_ratio: float = 0.1,
) -> None:
    """Espera 2^attempt * base com jitter leve (evita thundering herd em 429)."""
    raw = min(base_seconds * (2**attempt), max_seconds)
    jitter = raw * jitter_ratio * random.random()
    delay = raw + jitter
    logger.info("Backoff: dormindo %.2fs (tentativa=%d).", delay, attempt + 1)
    time.sleep(delay)


def is_retryable_gemini_error(exc: BaseException) -> bool:
    """Heurística para erros transitórios de quota/rede."""
    msg = str(exc).lower()
    retry_tokens = (
        "429",
        "503",
        "504",
        "quota",
        "rate",
        "resource exhausted",
        "timeout",
        "temporarily",
        "unavailable",
    )
    return any(t in msg for t in retry_tokens)


def call_with_retries(
    fn: Callable[[], T],
    *,
    max_attempts: int = 5,
    operation: str = "gemini",
) -> T:
    """Executa ``fn`` com backoff exponencial em falhas retryáveis."""
    last_exc: Optional[BaseException] = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if not is_retryable_gemini_error(exc) or attempt == max_attempts - 1:
                raise
            exponential_backoff_sleep(attempt)
    assert last_exc is not None
    raise last_exc
