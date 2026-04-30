#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/ingestors/runners/crawl_dou_inlabs.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Crawler DOU — INLABS + Imprensa Nacional (fallback) — TransparênciaBR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Baixa edições do Diário Oficial da União, Seções 1, 2, 3 e E (Extra),
anos 2018-2026.

Estratégia:
  1. Tenta INLABS API (https://inlabs.in.gov.br) com credenciais via env var.
     - Autenticação: POST /open-data/login.php → token JWT.
     - Download: GET /open-data/index.php?data=YYYY-MM-DD&secao=do{N} → JSON.
     - ZIPs de edições disponíveis via link no JSON.
  2. Se INLABS indisponível (sem credenciais ou erro 4xx/5xx), fallback para
     portal aberto Imprensa Nacional (https://www.in.gov.br/leiturajornal).

Saída GCS:
  gs://datalake-tbr-raw/diarios/dou/YYYY/MM/DD/<secao>/<arquivo>

Ambiente:
  INLABS_USER     — login INLABS (opcional)
  INLABS_PASSWORD — senha INLABS (opcional)
  INLABS_API_KEY  — token JWT pré-gerado (opcional; usa user/pass se ausente)
  GCS_RAW_BUCKET  — nome do bucket raw (padrão: datalake-tbr-raw)

Uso:
  python crawl_dou_inlabs.py --ano-inicio 2018 --ano-fim 2026 --secoes 1,2,3,E
  python crawl_dou_inlabs.py --data 2025-04-20  # dia único
"""

from __future__ import annotations

import argparse
import datetime
import io
import json
import logging
import os
import sys
import time
import zipfile
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
logger = logging.getLogger("tbr.crawl_dou_inlabs")

# ── Constantes ─────────────────────────────────────────────────────────────────
INLABS_BASE       = "https://inlabs.in.gov.br"
IN_GOV_BASE       = "https://www.in.gov.br"
GCS_RAW_BUCKET    = os.environ.get("GCS_RAW_BUCKET", "datalake-tbr-raw")
GCS_PREFIX_DOU    = "diarios/dou"
SECOES_VALIDAS    = {"1", "2", "3", "E"}
RATE_LIMIT_DELAY  = 1.5   # segundos entre requisições
MAX_RETRIES       = 5
TIMEOUT_HTTP      = 60    # segundos


def _sessao_http() -> requests.Session:
    """Cria sessão HTTP com retry automático e backoff exponencial."""
    sessao = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    sessao.mount("https://", adapter)
    sessao.mount("http://", adapter)
    sessao.headers.update({
        "User-Agent": "TransparenciaBR-OCR/1.0 (pipeline-l4; contato@transparenciabr.org)"
    })
    return sessao


# ── Autenticação INLABS ────────────────────────────────────────────────────────

def _obter_token_inlabs(sessao: requests.Session) -> Optional[str]:
    """
    Obtém token JWT INLABS.
    Prioridade: env INLABS_API_KEY → login user/pass.
    Retorna None se credenciais não disponíveis.
    """
    token = os.environ.get("INLABS_API_KEY")
    if token:
        logger.info("INLABS: usando INLABS_API_KEY do ambiente.")
        return token

    usuario = os.environ.get("INLABS_USER")
    senha   = os.environ.get("INLABS_PASSWORD")
    if not (usuario and senha):
        logger.warning("INLABS: credenciais não configuradas (INLABS_USER/INLABS_PASSWORD). Usando fallback Imprensa Nacional.")
        return None

    try:
        resp = sessao.post(
            f"{INLABS_BASE}/open-data/login.php",
            json={"email": usuario, "password": senha},
            timeout=TIMEOUT_HTTP,
        )
        resp.raise_for_status()
        dados = resp.json()
        token = dados.get("token") or dados.get("jwt") or dados.get("access_token")
        if token:
            logger.info("INLABS: autenticado com sucesso.")
            return token
        logger.warning("INLABS: resposta de login sem token: %s", dados)
        return None
    except Exception as exc:
        logger.error("INLABS: falha de autenticação — %s. Fallback ativado.", exc)
        return None


# ── Download via INLABS ────────────────────────────────────────────────────────

def _listar_edicoes_inlabs(
    sessao: requests.Session,
    token: str,
    data: datetime.date,
    secao: str,
) -> List[dict]:
    """
    Consulta index INLABS para data/seção e retorna lista de edições com URL de download.
    """
    secao_cod = f"do{secao}" if secao.isdigit() else f"doe"  # do1, do2, do3, doe
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{INLABS_BASE}/open-data/index.php"
    params = {"data": data.strftime("%Y-%m-%d"), "secao": secao_cod}

    time.sleep(RATE_LIMIT_DELAY)
    resp = sessao.get(url, headers=headers, params=params, timeout=TIMEOUT_HTTP)
    if resp.status_code == 404:
        logger.debug("INLABS %s seção %s: sem edição (404).", data, secao)
        return []
    resp.raise_for_status()

    dados = resp.json()
    if isinstance(dados, list):
        return dados
    if isinstance(dados, dict) and "items" in dados:
        return dados["items"]
    return []


def _baixar_zip_inlabs(
    sessao: requests.Session,
    token: str,
    url_zip: str,
) -> Optional[bytes]:
    """Baixa ZIP de edição INLABS e retorna bytes brutos."""
    headers = {"Authorization": f"Bearer {token}"}
    time.sleep(RATE_LIMIT_DELAY)
    try:
        resp = sessao.get(url_zip, headers=headers, timeout=120, stream=True)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.error("Erro ao baixar ZIP INLABS %s: %s", url_zip, exc)
        return None


# ── Fallback Imprensa Nacional ─────────────────────────────────────────────────

def _baixar_edicao_imprensa_nacional(
    sessao: requests.Session,
    data: datetime.date,
    secao: str,
) -> Optional[bytes]:
    """
    Tenta baixar edição DOU diretamente do portal Imprensa Nacional (sem auth).
    URL pattern: https://www.in.gov.br/leiturajornal/download/{YYYY-MM-DD}/do{N}
    """
    secao_cod = f"do{secao}" if secao.isdigit() else "doe"
    data_str  = data.strftime("%Y-%m-%d")
    url = f"{IN_GOV_BASE}/leiturajornal/download/{data_str}/{secao_cod}"

    time.sleep(RATE_LIMIT_DELAY)
    try:
        resp = sessao.get(url, timeout=120, stream=True)
        if resp.status_code == 404:
            logger.debug("Imprensa Nacional %s seção %s: sem edição.", data, secao)
            return None
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("Fallback Imprensa Nacional %s seção %s: %s", data, secao, exc)
        return None


# ── Upload GCS ─────────────────────────────────────────────────────────────────

def _upload_gcs(bucket_name: str, blob_name: str, dados: bytes, content_type: str = "application/zip") -> bool:
    """Faz upload de bytes para GCS. Retorna True em caso de sucesso."""
    try:
        from google.cloud import storage  # type: ignore
        cliente  = storage.Client()
        bucket   = cliente.bucket(bucket_name)
        blob     = bucket.blob(blob_name)
        blob.upload_from_string(dados, content_type=content_type)
        logger.debug("GCS upload OK: gs://%s/%s", bucket_name, blob_name)
        return True
    except Exception as exc:
        logger.error("GCS upload falhou %s: %s", blob_name, exc)
        return False


def _extrair_e_salvar_zip(
    zip_bytes: bytes,
    bucket_name: str,
    prefixo_gcs: str,
) -> int:
    """
    Extrai ZIP e salva cada arquivo internamente no GCS.
    Retorna número de arquivos salvos.
    """
    contador = 0
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for nome_arquivo in zf.namelist():
                dados_arquivo = zf.read(nome_arquivo)
                extensao = Path(nome_arquivo).suffix.lower()
                content_type = "application/pdf" if extensao == ".pdf" else "application/octet-stream"
                blob_name = f"{prefixo_gcs}/{nome_arquivo}"
                if _upload_gcs(bucket_name, blob_name, dados_arquivo, content_type):
                    contador += 1
    except zipfile.BadZipFile:
        # Pode ser PDF direto (não ZIP)
        extensao = ".pdf"
        blob_name = f"{prefixo_gcs}/edicao.pdf"
        if _upload_gcs(bucket_name, blob_name, zip_bytes, "application/pdf"):
            contador += 1
    return contador


# ── Checkpoint GCS ─────────────────────────────────────────────────────────────

def _checkpoint_path(secao: str) -> str:
    return f"_checkpoint/crawl_dou_inlabs_secao{secao}.json"


def _carregar_checkpoint(bucket_name: str, secao: str) -> set:
    """Carrega set de datas já processadas do GCS."""
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(_checkpoint_path(secao))
        if blob.exists():
            dados = json.loads(blob.download_as_text())
            return set(dados.get("datas_ok", []))
    except Exception:
        pass
    return set()


def _salvar_checkpoint(bucket_name: str, secao: str, datas_ok: set) -> None:
    """Persiste checkpoint no GCS."""
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(_checkpoint_path(secao))
        blob.upload_from_string(
            json.dumps({"datas_ok": sorted(datas_ok)}).encode(),
            content_type="application/json"
        )
    except Exception as exc:
        logger.warning("Checkpoint save falhou: %s", exc)


# ── Gerador de datas úteis ─────────────────────────────────────────────────────

def _datas_uteis(data_inicio: datetime.date, data_fim: datetime.date) -> List[datetime.date]:
    """Retorna lista de dias úteis (segunda a sexta) no intervalo."""
    datas = []
    atual = data_inicio
    while atual <= data_fim:
        if atual.weekday() < 5:  # 0=seg, 4=sex
            datas.append(atual)
        atual += datetime.timedelta(days=1)
    return datas


# ── Entrada principal ──────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Crawler DOU INLABS + Imprensa Nacional")
    parser.add_argument("--ano-inicio", type=int, default=2018)
    parser.add_argument("--ano-fim",    type=int, default=2026)
    parser.add_argument("--data",       type=str, default=None,
                        help="Data única YYYY-MM-DD (sobrescreve --ano-*)")
    parser.add_argument("--secoes",     type=str, default="1,2,3,E",
                        help="Seções a baixar (padrão: 1,2,3,E)")
    parser.add_argument("--dry-run",    action="store_true")
    args = parser.parse_args()

    secoes_solicitadas = [s.strip().upper() for s in args.secoes.split(",")]
    secoes_invalidas   = set(secoes_solicitadas) - SECOES_VALIDAS
    if secoes_invalidas:
        logger.error("Seções inválidas: %s. Válidas: %s", secoes_invalidas, SECOES_VALIDAS)
        sys.exit(1)

    # Intervalo de datas
    if args.data:
        data_inicio = data_fim = datetime.date.fromisoformat(args.data)
    else:
        data_inicio = datetime.date(args.ano_inicio, 1, 1)
        data_fim    = datetime.date(args.ano_fim, 12, 31)

    logger.info("━━━━ Crawler DOU INLABS iniciado ━━━━")
    logger.info("Período: %s → %s | Seções: %s", data_inicio, data_fim, secoes_solicitadas)

    assert_within_budget(threshold_usd=50.0)

    sessao = _sessao_http()
    token  = _obter_token_inlabs(sessao)

    datas = _datas_uteis(data_inicio, data_fim)
    logger.info("Dias úteis a processar: %d", len(datas))

    totais = {"datas": 0, "arquivos": 0, "erros": 0}

    for secao in secoes_solicitadas:
        datas_ok = _carregar_checkpoint(GCS_RAW_BUCKET, secao)
        logger.info("Seção %s — %d datas já no checkpoint.", secao, len(datas_ok))

        for data in datas:
            data_str = data.strftime("%Y-%m-%d")
            if data_str in datas_ok:
                continue

            assert_within_budget(threshold_usd=50.0)

            prefixo_gcs = f"{GCS_PREFIX_DOU}/{data.year}/{data.month:02d}/{data.day:02d}/{secao}"
            zip_bytes   = None

            # Tentativa 1: INLABS
            if token:
                try:
                    edicoes = _listar_edicoes_inlabs(sessao, token, data, secao)
                    for edicao in edicoes:
                        url_zip = edicao.get("urlDownload") or edicao.get("url") or edicao.get("href")
                        if url_zip:
                            zip_bytes = _baixar_zip_inlabs(sessao, token, url_zip)
                            if zip_bytes:
                                break
                except Exception as exc:
                    logger.warning("INLABS %s seção %s: %s. Tentando fallback...", data_str, secao, exc)

            # Tentativa 2: Fallback Imprensa Nacional
            if not zip_bytes:
                zip_bytes = _baixar_edicao_imprensa_nacional(sessao, data, secao)

            if not zip_bytes:
                logger.debug("Sem edição para %s seção %s.", data_str, secao)
                datas_ok.add(data_str)  # Marca como processado (sem edição)
                continue

            if args.dry_run:
                logger.info("[DRY-RUN] Baixaria: %s seção %s", data_str, secao)
                datas_ok.add(data_str)
                continue

            # Extrai e salva no GCS
            n_arquivos = _extrair_e_salvar_zip(zip_bytes, GCS_RAW_BUCKET, prefixo_gcs)
            record_spend("crawl_dou_download", 0.0)

            logger.info("DOU %s seção %s — %d arquivo(s) salvos em GCS.", data_str, secao, n_arquivos)
            totais["arquivos"] += n_arquivos
            totais["datas"]    += 1
            datas_ok.add(data_str)

        _salvar_checkpoint(GCS_RAW_BUCKET, secao, datas_ok)

    logger.info("━━━━ Crawler DOU concluído ━━━━")
    logger.info("Datas processadas: %d | Arquivos salvos: %d | Erros: %d",
                totais["datas"], totais["arquivos"], totais["erros"])


if __name__ == "__main__":
    main()
