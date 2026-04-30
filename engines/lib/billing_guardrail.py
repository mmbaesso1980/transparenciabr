#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/lib/billing_guardrail.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Guarda-chuva de gastos diários — TransparênciaBR Pipeline L4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIRETIVA: Hard-stop US$50/dia (free tier).
  - Contador primário: GCS gs://datalake-tbr-raw/_billing/daily_YYYYMMDD.txt
  - Contador secundário: Cloud Billing API (opcional, via gcloud).
  - Toda chamada paga importa este módulo e chama check_daily_spend() antes
    de executar qualquer operação que gere custo.

Formato do arquivo GCS de controle:
  Uma linha por chamada paga, cada linha:
    <timestamp_iso>  <servico>  <custo_usd_estimado>
  Exemplo:
    2025-04-20T03:12:00Z  document_ai  0.0015
  A soma da coluna 3 é o gasto do dia.

Uso:
    from engines.lib.billing_guardrail import check_daily_spend, record_spend
    if not check_daily_spend(threshold_usd=50.0):
        sys.exit("HARD-STOP: limite US$50/dia atingido.")
    # ... executa chamada paga ...
    record_spend(servico="paddleocr_gpu", custo_usd=0.00)   # OCR local = gratuito
    record_spend(servico="document_ai_fallback", custo_usd=custo)
"""

from __future__ import annotations

import datetime
import io
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configurações globais ─────────────────────────────────────────────────────
GCS_BUCKET       = os.environ.get("GCS_RAW_BUCKET", "datalake-tbr-raw")
GCS_BILLING_PATH = "_billing"
DEFAULT_THRESHOLD = 50.0          # US$ hard-stop
_lock = threading.Lock()          # Protege acesso concorrente ao contador GCS

# ── Lazy import GCS ───────────────────────────────────────────────────────────

def _gcs_client():
    """Retorna cliente GCS com lazy import para não quebrar ambientes sem SDK."""
    try:
        from google.cloud import storage  # type: ignore
        return storage.Client()
    except ImportError:
        logger.warning("google-cloud-storage não disponível; billing GCS desativado.")
        return None


def _blob_name_hoje() -> str:
    """Retorna o nome do blob de faturamento do dia atual (UTC)."""
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")
    return f"{GCS_BILLING_PATH}/daily_{hoje}.txt"


# ── Leitura do gasto diário ───────────────────────────────────────────────────

def _ler_gasto_gcs() -> float:
    """
    Lê o arquivo de controle GCS e soma os valores da coluna 3 (custo_usd).
    Retorna 0.0 em caso de falha (fail-open — log de alerta emitido).
    """
    cliente = _gcs_client()
    if cliente is None:
        return 0.0
    try:
        bucket = cliente.bucket(GCS_BUCKET)
        blob = bucket.blob(_blob_name_hoje())
        if not blob.exists():
            return 0.0
        conteudo = blob.download_as_text(encoding="utf-8")
        total = 0.0
        for linha in conteudo.splitlines():
            partes = linha.strip().split()
            if len(partes) >= 3:
                try:
                    total += float(partes[2])
                except ValueError:
                    pass
        return total
    except Exception as exc:
        logger.error("billing_guardrail: falha ao ler GCS — %s. Continuando (fail-open).", exc)
        return 0.0


def _ler_gasto_cloud_billing() -> Optional[float]:
    """
    Consulta Cloud Billing API para obter gasto do dia corrente.
    Retorna None se a API não estiver disponível ou configurada.
    NOTA: requer permissão billing.accounts.get e env var BILLING_ACCOUNT_ID.
    """
    billing_account = os.environ.get("BILLING_ACCOUNT_ID")
    if not billing_account:
        return None
    try:
        from google.cloud import billing_v1  # type: ignore
        client = billing_v1.CloudBillingClient()
        # Cloud Billing API não provê custo em tempo real por dia diretamente;
        # usamos o budget via BudgetService se disponível.
        # Aqui retornamos None e confiamos no contador GCS como primário.
        return None
    except Exception:
        return None


# ── API pública ───────────────────────────────────────────────────────────────

def check_daily_spend(threshold_usd: float = DEFAULT_THRESHOLD) -> bool:
    """
    Verifica se o gasto diário estimado está abaixo do limite.

    Retorna:
        True  — seguro para continuar (gasto < threshold_usd).
        False — hard-stop: gasto >= threshold_usd; engine deve abortar.

    Estratégia de leitura (por prioridade):
        1. Cloud Billing API (se configurada e disponível).
        2. Contador local em GCS.
        3. Fail-open com alerta (não bloqueia em ambiente sem GCS).
    """
    with _lock:
        # Tenta Cloud Billing primeiro
        gasto_billing = _ler_gasto_cloud_billing()
        if gasto_billing is not None:
            if gasto_billing >= threshold_usd:
                logger.critical(
                    "HARD-STOP billing_guardrail: Cloud Billing reporta US$%.4f >= US$%.2f/dia.",
                    gasto_billing, threshold_usd,
                )
                return False
            logger.debug("billing_guardrail (Cloud Billing): US$%.4f / US$%.2f.", gasto_billing, threshold_usd)
            return True

        # Fallback: contador GCS
        gasto_gcs = _ler_gasto_gcs()
        if gasto_gcs >= threshold_usd:
            logger.critical(
                "HARD-STOP billing_guardrail: contador GCS = US$%.4f >= US$%.2f/dia.",
                gasto_gcs, threshold_usd,
            )
            return False
        logger.debug("billing_guardrail (GCS): US$%.4f / US$%.2f.", gasto_gcs, threshold_usd)
        return True


def record_spend(servico: str, custo_usd: float) -> None:
    """
    Registra uma chamada paga no arquivo de controle GCS.

    Parâmetros:
        servico   — identificador do serviço (ex: 'document_ai_fallback').
        custo_usd — custo estimado em dólares americanos (float).

    Nota: chamadas ao PaddleOCR local (GPU) têm custo_usd=0.0 mas devem ser
    registradas para fins de auditoria de volume.
    """
    if custo_usd < 0:
        raise ValueError(f"custo_usd não pode ser negativo: {custo_usd}")

    cliente = _gcs_client()
    if cliente is None:
        logger.warning("billing_guardrail.record_spend: GCS indisponível; gasto não registrado.")
        return

    with _lock:
        timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        linha = f"{timestamp}  {servico}  {custo_usd:.6f}\n"
        blob_name = _blob_name_hoje()

        try:
            bucket = cliente.bucket(GCS_BUCKET)
            blob = bucket.blob(blob_name)

            # Append: download → concatena → upload
            try:
                conteudo_atual = blob.download_as_text(encoding="utf-8")
            except Exception:
                conteudo_atual = ""

            novo_conteudo = conteudo_atual + linha
            blob.upload_from_string(novo_conteudo.encode("utf-8"), content_type="text/plain")
            logger.debug("billing_guardrail.record_spend: %s US$%.6f registrado.", servico, custo_usd)
        except Exception as exc:
            logger.error("billing_guardrail.record_spend: falha GCS — %s.", exc)


def assert_within_budget(threshold_usd: float = DEFAULT_THRESHOLD) -> None:
    """
    Atalho que lança RuntimeError se o orçamento diário foi excedido.
    Ideal para uso no topo de funções de processamento em lote.

    Lança:
        RuntimeError — se check_daily_spend() retornar False.
    """
    if not check_daily_spend(threshold_usd=threshold_usd):
        raise RuntimeError(
            f"HARD-STOP: limite de US${threshold_usd:.2f}/dia atingido. "
            "Operação abortada pela billing_guardrail."
        )
