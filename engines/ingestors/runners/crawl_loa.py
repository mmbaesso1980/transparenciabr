#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/ingestors/runners/crawl_loa.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Crawler LOA Federal 2015–2026 — TransparênciaBR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Baixa PDFs e microdados (JSON) da LOA Federal via Portal da Transparência.

Fontes (traduzidas de loaPortalUrls.js):
  1. LOA PDF principal — portaldatransparencia.gov.br/paginas/download.aspx?ano={ano}
  2. API de emendas parlamentares — api.portaldatransparencia.gov.br/api-de-dados/
     emendas-parlamentares?ano={ano}  (requer CGU_API_KEY)
  3. Microdados SIOP LOA — siop.planejamento.gov.br/sioplegado/publico/

Saída GCS:
  PDFs:     gs://datalake-tbr-raw/loa/{YYYY}/loa_{YYYY}.pdf
  Emendas:  gs://datalake-tbr-raw/loa/{YYYY}/emendas_parlamentares_{YYYY}.json
  SIOP:     gs://datalake-tbr-raw/loa/{YYYY}/siop_loa_{YYYY}.json

Ambiente:
  CGU_API_KEY    — chave Portal Transparência (obrigatória para endpoint emendas)
  GCS_RAW_BUCKET — bucket raw (padrão: datalake-tbr-raw)

Uso:
  python crawl_loa.py --ano-inicio 2015 --ano-fim 2026
  python crawl_loa.py --ano 2024
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import List, Optional
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter, Retry

# ── Billing guardrail ─────────────────────────────────────────────────────────
try:
    sys.path.insert(0, str(Path(__file__).parents[4]))
    from engines.lib.billing_guardrail import assert_within_budget, record_spend
except ImportError:
    def assert_within_budget(threshold_usd=50.0): pass
    def record_spend(servico, custo_usd): pass

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("tbr.crawl_loa")

# ── Constantes ─────────────────────────────────────────────────────────────────
CGU_API_BASE   = "https://api.portaldatransparencia.gov.br"
PORTAL_BASE    = "https://portaldatransparencia.gov.br"
SIOP_BASE      = "https://siop.planejamento.gov.br"
GCS_RAW_BUCKET = os.environ.get("GCS_RAW_BUCKET", "datalake-tbr-raw")
GCS_PREFIX_LOA = "loa"
CGU_API_KEY    = os.environ.get("CGU_API_KEY", "")
ANO_MIN        = 2015
ANO_MAX        = 2026
RATE_LIMIT_DELAY = 1.0
MAX_RETRIES      = 5
TIMEOUT_HTTP     = 120


def _sessao_http() -> requests.Session:
    sessao = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    sessao.mount("https://", adapter)
    sessao.mount("http://", adapter)
    sessao.headers.update({
        "User-Agent": "TransparenciaBR-OCR/1.0 (pipeline-l4; contato@transparenciabr.org)"
    })
    if CGU_API_KEY:
        sessao.headers["chave-api-dados"] = CGU_API_KEY
    return sessao


# ── GCS helpers ────────────────────────────────────────────────────────────────

def _upload_gcs(bucket_name: str, blob_name: str, dados: bytes, content_type: str) -> bool:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(blob_name)
        blob.upload_from_string(dados, content_type=content_type)
        logger.debug("GCS upload OK: gs://%s/%s", bucket_name, blob_name)
        return True
    except Exception as exc:
        logger.error("GCS upload falhou %s: %s", blob_name, exc)
        return False


def _blob_existe(bucket_name: str, blob_name: str) -> bool:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        return bucket.blob(blob_name).exists()
    except Exception:
        return False


# ── URLs LOA (traduzidas de loaPortalUrls.js) ─────────────────────────────────

def loa_download_portal_url(ano: int) -> str:
    """URL de download de microdados LOA no Portal da Transparência."""
    return f"{PORTAL_BASE}/paginas/download.aspx?ano={ano}"


def emendas_parlamentares_api_url(ano: int) -> str:
    """URL da API de emendas parlamentares (CGU_API_KEY obrigatória)."""
    return f"{CGU_API_BASE}/api-de-dados/emendas-parlamentares?ano={ano}"


def siop_loa_url(ano: int) -> str:
    """URL de consulta pública SIOP LOA."""
    return f"{SIOP_BASE}/sioplegado/publico/loa?ano={ano}&formato=json"


# ── Download LOA PDF ───────────────────────────────────────────────────────────

def _baixar_loa_pdf(sessao: requests.Session, ano: int) -> Optional[bytes]:
    """
    Tenta baixar o PDF da LOA de múltiplas fontes conhecidas.
    Portal Transparência → Câmara → Planalto.
    """
    urls_candidatas = [
        # Portal Transparência (redirect para PDF)
        f"{PORTAL_BASE}/paginas/download.aspx?ano={ano}",
        # Câmara dos Deputados — LOA publicada
        f"https://www.camara.leg.br/Internet/comissao/index/esp/OrcTot{ano}.pdf",
        # Planalto — Casa Civil
        f"https://www.planalto.gov.br/ccivil_03/_Ato{ano-3}-{ano-1}/{ano}/Lei/L{14000 + (ano-2021)*300}.htm",
    ]

    for url in urls_candidatas:
        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, timeout=TIMEOUT_HTTP, stream=True, allow_redirects=True)
            content_type = resp.headers.get("Content-Type", "")
            if resp.status_code == 200 and ("pdf" in content_type or len(resp.content) > 10_000):
                logger.info("LOA %d: PDF obtido de %s (%d bytes)", ano, url, len(resp.content))
                return resp.content
        except Exception as exc:
            logger.debug("LOA %d: falha em %s — %s", ano, url, exc)

    logger.warning("LOA %d: não foi possível baixar o PDF de nenhuma fonte.", ano)
    return None


# ── Download emendas parlamentares ────────────────────────────────────────────

def _baixar_emendas(sessao: requests.Session, ano: int) -> Optional[List[dict]]:
    """
    Baixa emendas parlamentares da API CGU com paginação.
    Retorna None se CGU_API_KEY não configurada.
    """
    if not CGU_API_KEY:
        logger.warning("LOA emendas %d: CGU_API_KEY não configurada — pulando.", ano)
        return None

    url   = emendas_parlamentares_api_url(ano)
    todos = []
    pagina = 1

    while True:
        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, params={"pagina": pagina}, timeout=TIMEOUT_HTTP)
            if resp.status_code == 404:
                break
            resp.raise_for_status()
            dados = resp.json()
            if not dados:
                break
            if isinstance(dados, list):
                todos.extend(dados)
                if len(dados) < 500:   # menos que página cheia → última página
                    break
            else:
                todos.append(dados)
                break
            pagina += 1
        except Exception as exc:
            logger.error("Emendas %d página %d: %s", ano, pagina, exc)
            break

    logger.info("LOA %d: %d emendas coletadas.", ano, len(todos))
    return todos if todos else None


# ── Download SIOP ─────────────────────────────────────────────────────────────

def _baixar_siop(sessao: requests.Session, ano: int) -> Optional[dict]:
    """Baixa dados SIOP LOA (tentativa — endpoint pode variar)."""
    url = siop_loa_url(ano)
    time.sleep(RATE_LIMIT_DELAY)
    try:
        resp = sessao.get(url, timeout=TIMEOUT_HTTP)
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:
        logger.debug("SIOP %d: %s", ano, exc)
    return None


# ── Processamento por ano ──────────────────────────────────────────────────────

def processar_ano(ano: int, dry_run: bool = False) -> dict:
    """Coleta todos os artefatos LOA de um exercício fiscal."""
    assert_within_budget(threshold_usd=50.0)

    if not (ANO_MIN <= ano <= ANO_MAX):
        return {"ano": ano, "erro": f"Ano fora do intervalo {ANO_MIN}-{ANO_MAX}"}

    logger.info("━ LOA %d: iniciando...", ano)
    sessao  = _sessao_http()
    metricas = {"ano": ano, "pdf_ok": False, "emendas_ok": False, "siop_ok": False}

    # 1. PDF
    blob_pdf = f"{GCS_PREFIX_LOA}/{ano}/loa_{ano}.pdf"
    if not _blob_existe(GCS_RAW_BUCKET, blob_pdf):
        if not dry_run:
            pdf_bytes = _baixar_loa_pdf(sessao, ano)
            if pdf_bytes:
                _upload_gcs(GCS_RAW_BUCKET, blob_pdf, pdf_bytes, "application/pdf")
                record_spend("crawl_loa_pdf", 0.0)
                metricas["pdf_ok"] = True
        else:
            logger.info("[DRY-RUN] Baixaria: LOA %d PDF", ano)
    else:
        logger.info("LOA %d PDF já existe no GCS — pulando.", ano)
        metricas["pdf_ok"] = True

    # 2. Emendas parlamentares
    blob_emendas = f"{GCS_PREFIX_LOA}/{ano}/emendas_parlamentares_{ano}.json"
    if not _blob_existe(GCS_RAW_BUCKET, blob_emendas):
        if not dry_run:
            emendas = _baixar_emendas(sessao, ano)
            if emendas is not None:
                _upload_gcs(
                    GCS_RAW_BUCKET, blob_emendas,
                    json.dumps(emendas, ensure_ascii=False).encode("utf-8"),
                    "application/json"
                )
                record_spend("crawl_loa_emendas", 0.0)
                metricas["emendas_ok"] = True
        else:
            logger.info("[DRY-RUN] Baixaria: LOA %d emendas", ano)
    else:
        logger.info("LOA %d emendas já existem no GCS — pulando.", ano)
        metricas["emendas_ok"] = True

    # 3. SIOP
    blob_siop = f"{GCS_PREFIX_LOA}/{ano}/siop_loa_{ano}.json"
    if not _blob_existe(GCS_RAW_BUCKET, blob_siop):
        if not dry_run:
            siop = _baixar_siop(sessao, ano)
            if siop is not None:
                _upload_gcs(
                    GCS_RAW_BUCKET, blob_siop,
                    json.dumps(siop, ensure_ascii=False).encode("utf-8"),
                    "application/json"
                )
                record_spend("crawl_loa_siop", 0.0)
                metricas["siop_ok"] = True
    else:
        logger.info("LOA %d SIOP já existe no GCS — pulando.", ano)
        metricas["siop_ok"] = True

    logger.info(
        "LOA %d concluído: PDF=%s | Emendas=%s | SIOP=%s",
        ano,
        "✓" if metricas["pdf_ok"] else "✗",
        "✓" if metricas["emendas_ok"] else "✗",
        "✓" if metricas["siop_ok"] else "✗",
    )
    return metricas


# ── Entrada principal ──────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Crawler LOA Federal 2015-2026")
    parser.add_argument("--ano",        type=int, default=None,
                        help="Ano único (2015–2026). Ignora --ano-inicio/--ano-fim.")
    parser.add_argument("--ano-inicio", type=int, default=ANO_MIN)
    parser.add_argument("--ano-fim",    type=int, default=ANO_MAX)
    parser.add_argument("--dry-run",    action="store_true")
    args = parser.parse_args()

    anos = [args.ano] if args.ano else list(range(args.ano_inicio, args.ano_fim + 1))
    anos = [a for a in anos if ANO_MIN <= a <= ANO_MAX]

    logger.info("━━━━ Crawler LOA iniciado: %s ━━━━", anos)
    assert_within_budget(threshold_usd=50.0)

    if not CGU_API_KEY:
        logger.warning(
            "CGU_API_KEY não configurada — endpoint de emendas parlamentares será ignorado."
        )

    resultados = []
    for ano in anos:
        try:
            metricas = processar_ano(ano, dry_run=args.dry_run)
            resultados.append(metricas)
        except RuntimeError as exc:
            logger.critical("HARD-STOP: %s", exc)
            break
        except Exception as exc:
            logger.error("LOA %d: erro fatal — %s", ano, exc)
            resultados.append({"ano": ano, "erro": str(exc)})

    logger.info("━━━━ Crawler LOA concluído ━━━━")
    for r in resultados:
        logger.info("  %s", r)


if __name__ == "__main__":
    main()
