#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/lib/ollama_client.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cliente HTTP reutilizável para Ollama (Gemma 27B local na L4).

Responsabilidades:
  - Encapsula POST /api/generate com retry exponencial e jitter.
  - Warmup: verifica se o modelo está carregado antes de processar.
  - Circuit breaker: após 5 falhas consecutivas, aguarda cooldown de 60s.
  - Timeout configurável via env OLLAMA_TIMEOUT_S (default: 90s).
  - Thread-safe: instância compartilhável entre workers.

Uso:
    from lib.ollama_client import OllamaClient
    client = OllamaClient()
    result = client.generate(prompt="Analise...", format="json")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import json
import logging
import os
import random
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

# ── Configurações padrão ──────────────────────────────────────────────────────
OLLAMA_BASE_URL   = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL     = os.environ.get("OLLAMA_MODEL", "gemma2:27b-instruct-q4_K_M")
DEFAULT_TIMEOUT_S = float(os.environ.get("OLLAMA_TIMEOUT_S", "90"))
DEFAULT_MAX_RETRY = int(os.environ.get("OLLAMA_MAX_RETRY", "3"))

# ── Parâmetros de geração padrão ──────────────────────────────────────────────
DEFAULT_OPTIONS: Dict[str, Any] = {
    "temperature":  0.1,
    "num_predict":  512,
    "top_k":        20,
    "top_p":        0.9,
    "repeat_penalty": 1.1,
}


@dataclass
class _CircuitBreaker:
    """
    Circuit breaker isolado para o endpoint Ollama.
    Após ``failure_threshold`` falhas consecutivas, bloqueia por
    ``recovery_sec`` segundos antes de permitir nova tentativa.
    """
    failure_threshold: int    = 5
    recovery_sec: float       = 60.0
    _failures: int            = field(default=0, init=False, repr=False)
    _opened_at: Optional[float] = field(default=None, init=False, repr=False)
    _lock: threading.Lock     = field(default_factory=threading.Lock, init=False, repr=False)

    def allow(self) -> bool:
        with self._lock:
            if self._opened_at is None:
                return True
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self.recovery_sec:
                logger.info("ollama_client: circuit breaker → HALF_OPEN (teste de recuperação).")
                self._opened_at = None
                self._failures  = 0
                return True
            remaining = self.recovery_sec - elapsed
            logger.warning(
                "ollama_client: circuit OPEN — Ollama bloqueado por mais %.0fs.", remaining
            )
            return False

    def success(self) -> None:
        with self._lock:
            self._failures  = 0
            self._opened_at = None

    def failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self.failure_threshold:
                self._opened_at = time.monotonic()
                logger.error(
                    "ollama_client: circuit → OPEN após %d falhas consecutivas. "
                    "Cooldown: %.0fs.", self._failures, self.recovery_sec,
                )


class OllamaClient:
    """
    Cliente HTTP thread-safe para Ollama com:
      - Retry exponencial com jitter (full-jitter strategy).
      - Circuit breaker por endpoint.
      - Model warmup automático na primeira chamada.
      - Logging estruturado compatível com Cloud Logging.

    Parâmetros:
        base_url  — URL base do Ollama (default: http://127.0.0.1:11434).
        model     — Nome do modelo (default: gemma2:27b-instruct-q4_K_M).
        timeout_s — Timeout por requisição em segundos.
        max_retry — Número máximo de tentativas por chamada.
    """

    def __init__(
        self,
        base_url:  str   = OLLAMA_BASE_URL,
        model:     str   = DEFAULT_MODEL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        max_retry: int   = DEFAULT_MAX_RETRY,
    ) -> None:
        self.base_url  = base_url.rstrip("/")
        self.model     = model
        self.timeout_s = timeout_s
        self.max_retry = max_retry
        self._session  = requests.Session()
        self._cb       = _CircuitBreaker()
        self._warmed   = False
        self._warm_lock = threading.Lock()

    # ── API pública ───────────────────────────────────────────────────────────

    def warmup(self) -> bool:
        """
        Verifica disponibilidade do Ollama e confirma modelo carregado.
        Retorna True se OK, False em caso de falha.
        Chamado automaticamente na primeira generate().
        """
        with self._warm_lock:
            if self._warmed:
                return True
            try:
                resp = self._session.get(
                    f"{self.base_url}/api/tags", timeout=10
                )
                resp.raise_for_status()
                modelos = [m.get("name", "") for m in resp.json().get("models", [])]
                prefixo = self.model.split(":")[0]
                if not any(prefixo in m for m in modelos):
                    logger.critical(
                        "ollama_client.warmup: modelo '%s' NÃO encontrado. "
                        "Disponíveis: %s", self.model, modelos,
                    )
                    return False
                logger.info(
                    "ollama_client.warmup: Ollama OK — modelo '%s' confirmado.", self.model
                )
                self._warmed = True
                return True
            except Exception as exc:
                logger.critical("ollama_client.warmup: falha — %s", exc)
                return False

    def generate(
        self,
        prompt:  str,
        *,
        format:  str                  = "",
        options: Optional[Dict[str, Any]] = None,
        system:  str                  = "",
    ) -> str:
        """
        Envia prompt ao Gemma via Ollama e retorna o texto de resposta.

        Parâmetros:
            prompt  — Texto do prompt.
            format  — "" (texto livre) ou "json" (força saída JSON).
            options — Parâmetros de geração (sobrepõem DEFAULT_OPTIONS).
            system  — System prompt opcional.

        Retorna:
            String com resposta do modelo.

        Lança:
            RuntimeError — quando circuit breaker está aberto ou esgota retries.
        """
        # Warmup na primeira chamada
        if not self._warmed:
            if not self.warmup():
                raise RuntimeError("ollama_client: Ollama indisponível. Abortando.")

        if not self._cb.allow():
            raise RuntimeError(
                "ollama_client: circuit breaker OPEN — Ollama temporariamente bloqueado."
            )

        merged_options = {**DEFAULT_OPTIONS, **(options or {})}
        payload: Dict[str, Any] = {
            "model":   self.model,
            "prompt":  prompt,
            "stream":  False,
            "options": merged_options,
        }
        if format:
            payload["format"] = format
        if system:
            payload["system"] = system

        return self._post_with_retry(payload)

    def generate_json(
        self,
        prompt:  str,
        *,
        options: Optional[Dict[str, Any]] = None,
        system:  str                      = "",
    ) -> Dict[str, Any]:
        """
        Conveniência: generate() com format="json" + parse automático.
        Tenta reparar JSON truncado (fechamento de chave ausente).

        Retorna:
            Dict parseado da resposta do modelo.

        Lança:
            ValueError — se resposta não for JSON válido após reparo.
        """
        raw = self.generate(prompt, format="json", options=options, system=system)
        raw = raw.strip()
        if raw and not raw.endswith("}"):
            raw += "}"
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            # Tenta extrair o primeiro objeto JSON válido
            inicio = raw.find("{")
            fim    = raw.rfind("}") + 1
            if inicio >= 0 and fim > inicio:
                try:
                    return json.loads(raw[inicio:fim])
                except json.JSONDecodeError:
                    pass
            raise ValueError(
                f"ollama_client: resposta não é JSON válido. Início: '{raw[:120]}' | Erro: {exc}"
            ) from exc

    def is_healthy(self) -> bool:
        """Verifica saúde do endpoint sem contar como falha no circuit breaker."""
        try:
            resp = self._session.get(f"{self.base_url}/api/tags", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    # ── Internos ──────────────────────────────────────────────────────────────

    def _post_with_retry(self, payload: Dict[str, Any]) -> str:
        """POST /api/generate com retry exponencial + jitter (full-jitter)."""
        url = f"{self.base_url}/api/generate"
        ultimo_erro: Optional[Exception] = None

        for tentativa in range(self.max_retry):
            try:
                resp = self._session.post(url, json=payload, timeout=self.timeout_s)
                resp.raise_for_status()
                texto = resp.json().get("response", "")
                self._cb.success()
                logger.debug(
                    "ollama_client.generate: OK tentativa=%d chars=%d",
                    tentativa + 1, len(texto),
                )
                return texto

            except requests.Timeout as exc:
                logger.warning(
                    "ollama_client: timeout (tentativa %d/%d, timeout=%.0fs): %s",
                    tentativa + 1, self.max_retry, self.timeout_s, exc,
                )
                ultimo_erro = exc
                self._cb.failure()

            except requests.HTTPError as exc:
                codigo = getattr(exc.response, "status_code", 0)
                logger.warning(
                    "ollama_client: HTTP %d (tentativa %d/%d): %s",
                    codigo, tentativa + 1, self.max_retry, exc,
                )
                ultimo_erro = exc
                self._cb.failure()
                # 4xx não recuperáveis: não retenta
                if codigo and 400 <= codigo < 500:
                    break

            except requests.RequestException as exc:
                logger.warning(
                    "ollama_client: rede (tentativa %d/%d): %s",
                    tentativa + 1, self.max_retry, exc,
                )
                ultimo_erro = exc
                self._cb.failure()

            # Backoff full-jitter: uniforme em [0, min(cap, base*2^attempt)]
            if tentativa < self.max_retry - 1:
                cap   = min(30.0, 2.0 * (2 ** tentativa))
                delay = random.uniform(0, cap)
                logger.debug("ollama_client: backoff %.2fs antes de nova tentativa.", delay)
                time.sleep(delay)

        raise RuntimeError(
            f"ollama_client: esgotadas {self.max_retry} tentativas. "
            f"Último erro: {ultimo_erro}"
        )


# ── Instância global (singleton por processo) ─────────────────────────────────
_cliente_global: Optional[OllamaClient] = None
_global_lock = threading.Lock()


def get_client(
    base_url:  str   = OLLAMA_BASE_URL,
    model:     str   = DEFAULT_MODEL,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> OllamaClient:
    """
    Retorna instância global do OllamaClient (singleton por processo).
    Thread-safe. Adequado para uso em ThreadPoolExecutor.
    """
    global _cliente_global
    with _global_lock:
        if _cliente_global is None:
            _cliente_global = OllamaClient(
                base_url=base_url, model=model, timeout_s=timeout_s
            )
    return _cliente_global


__all__ = ["OllamaClient", "get_client", "DEFAULT_MODEL", "DEFAULT_OPTIONS"]
