"""
Backoff exponencial e circuit breaker por endpoint (isolamento entre workers).
"""

import logging
import random
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    """Circuit breaker isolado por API — falhas não derrubam o enxame inteiro."""

    failure_threshold: int = 5
    recovery_timeout_sec: float = 60.0
    half_open_max_calls: int = 1
    state: CircuitState = CircuitState.CLOSED
    failures: int = 0
    successes_half: int = 0
    opened_at: Optional[float] = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def allow_request(self) -> bool:
        with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            if self.state == CircuitState.OPEN:
                if self.opened_at is None:
                    return False
                if time.monotonic() - self.opened_at >= self.recovery_timeout_sec:
                    self.state = CircuitState.HALF_OPEN
                    self.successes_half = 0
                    logger.info("Circuit HALF_OPEN — tentativa de recuperação.")
                    return True
                return False
            return self.successes_half < self.half_open_max_calls

    def record_success(self) -> None:
        with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.successes_half += 1
                self.failures = 0
                self.state = CircuitState.CLOSED
                self.opened_at = None
                logger.info("Circuit CLOSED — recuperado.")
                return
            self.failures = 0

    def record_failure(self) -> None:
        with self._lock:
            self.failures += 1
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                self.opened_at = time.monotonic()
                logger.warning("Circuit OPEN após falha em HALF_OPEN.")
                return
            if self.failures >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.opened_at = time.monotonic()
                logger.warning(
                    "Circuit OPEN — limiar de falhas (%s).", self.failure_threshold
                )


def exponential_backoff_sleep(
    attempt: int,
    *,
    base_sec: float = 1.0,
    max_sec: float = 60.0,
    jitter_ratio: float = 0.15,
) -> None:
    exp = min(max_sec, base_sec * (2**attempt))
    jitter = exp * jitter_ratio * random.random()
    time.sleep(exp + jitter)


def call_with_exponential_backoff(
    fn: Callable[[], T],
    *,
    max_attempts: int = 5,
    retry_on: Optional[Callable[[BaseException], bool]] = None,
    base_sec: float = 1.0,
    max_sec: float = 60.0,
) -> T:
    last_err: Optional[BaseException] = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except BaseException as exc:
            last_err = exc
            if retry_on is not None and not retry_on(exc):
                raise
            if attempt >= max_attempts - 1:
                break
            exponential_backoff_sleep(attempt, base_sec=base_sec, max_sec=max_sec)
    assert last_err is not None
    raise last_err


_REGISTRY_BREAKERS: Dict[str, CircuitBreaker] = {}
_REGISTRY_LOCK = threading.Lock()


def breaker_for(api_id: str, **kwargs: Any) -> CircuitBreaker:
    with _REGISTRY_LOCK:
        if api_id not in _REGISTRY_BREAKERS:
            _REGISTRY_BREAKERS[api_id] = CircuitBreaker(**kwargs)
        return _REGISTRY_BREAKERS[api_id]
