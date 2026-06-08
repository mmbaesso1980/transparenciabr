"""Unit tests for engines.lib.resilience — CircuitBreaker and backoff."""
from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from engines.lib.resilience import (
    CircuitBreaker,
    CircuitState,
    breaker_for,
    call_with_exponential_backoff,
    exponential_backoff_sleep,
)


class TestCircuitBreaker:
    def test_initial_state_closed(self):
        cb = CircuitBreaker()
        assert cb.state == CircuitState.CLOSED
        assert cb.failures == 0

    def test_allows_request_when_closed(self):
        cb = CircuitBreaker()
        assert cb.allow_request() is True

    def test_opens_after_failure_threshold(self):
        cb = CircuitBreaker(failure_threshold=3)
        for _ in range(3):
            cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is False

    def test_stays_closed_below_threshold(self):
        cb = CircuitBreaker(failure_threshold=5)
        for _ in range(4):
            cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_success_resets_failures(self):
        cb = CircuitBreaker(failure_threshold=5)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.failures == 0
        assert cb.state == CircuitState.CLOSED

    def test_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout_sec=0.01)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(0.02)
        assert cb.allow_request() is True
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_success_closes(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout_sec=0.01)
        cb.record_failure()
        time.sleep(0.02)
        cb.allow_request()  # transitions to HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb.opened_at is None

    def test_half_open_failure_reopens(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout_sec=0.01)
        cb.record_failure()
        time.sleep(0.02)
        cb.allow_request()  # transitions to HALF_OPEN
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_half_open_max_calls_respected(self):
        cb = CircuitBreaker(
            failure_threshold=1,
            recovery_timeout_sec=0.01,
            half_open_max_calls=2,
        )
        cb.record_failure()
        time.sleep(0.02)
        cb.allow_request()  # transitions to HALF_OPEN
        assert cb.allow_request() is True  # successes_half=0 < 2
        cb.successes_half = 2
        assert cb.allow_request() is False

    def test_open_without_opened_at_denies(self):
        cb = CircuitBreaker(failure_threshold=1)
        cb.state = CircuitState.OPEN
        cb.opened_at = None
        assert cb.allow_request() is False


class TestExponentialBackoff:
    @patch("engines.lib.resilience.time.sleep")
    def test_exponential_backoff_sleep_calls_sleep(self, mock_sleep):
        exponential_backoff_sleep(0, base_sec=1.0, max_sec=60.0, jitter_ratio=0.0)
        mock_sleep.assert_called_once()
        slept = mock_sleep.call_args[0][0]
        assert 0.9 <= slept <= 1.1  # base_sec=1, jitter_ratio=0 → exactly 1.0

    @patch("engines.lib.resilience.time.sleep")
    def test_exponential_backoff_capped_at_max(self, mock_sleep):
        exponential_backoff_sleep(100, base_sec=1.0, max_sec=5.0, jitter_ratio=0.0)
        slept = mock_sleep.call_args[0][0]
        assert slept <= 5.0 + 0.01


class TestCallWithExponentialBackoff:
    @patch("engines.lib.resilience.exponential_backoff_sleep")
    def test_success_on_first_attempt(self, mock_sleep):
        result = call_with_exponential_backoff(lambda: 42)
        assert result == 42
        mock_sleep.assert_not_called()

    @patch("engines.lib.resilience.exponential_backoff_sleep")
    def test_retries_on_failure(self, mock_sleep):
        counter = {"n": 0}

        def flaky():
            counter["n"] += 1
            if counter["n"] < 3:
                raise ValueError("transient")
            return "ok"

        result = call_with_exponential_backoff(flaky, max_attempts=5)
        assert result == "ok"
        assert mock_sleep.call_count == 2

    @patch("engines.lib.resilience.exponential_backoff_sleep")
    def test_raises_after_max_attempts(self, mock_sleep):
        def always_fail():
            raise RuntimeError("permanent")

        with pytest.raises(RuntimeError, match="permanent"):
            call_with_exponential_backoff(always_fail, max_attempts=3)
        assert mock_sleep.call_count == 2

    @patch("engines.lib.resilience.exponential_backoff_sleep")
    def test_retry_on_filter(self, mock_sleep):
        counter = {"n": 0}

        def flaky():
            counter["n"] += 1
            if counter["n"] == 1:
                raise ValueError("retry this")
            if counter["n"] == 2:
                raise TypeError("do not retry")
            return "unreachable"

        with pytest.raises(TypeError, match="do not retry"):
            call_with_exponential_backoff(
                flaky,
                max_attempts=5,
                retry_on=lambda exc: isinstance(exc, ValueError),
            )


class TestBreakerFor:
    def test_returns_same_instance_for_same_id(self):
        b1 = breaker_for("test-api-a")
        b2 = breaker_for("test-api-a")
        assert b1 is b2

    def test_returns_different_for_different_id(self):
        b1 = breaker_for("api-x")
        b2 = breaker_for("api-y")
        assert b1 is not b2
