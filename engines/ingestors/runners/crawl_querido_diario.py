#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/ingestors/runners/crawl_querido_diario.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Crawler Querido Diário — 27 Diários Estaduais — TransparênciaBR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coleta diários oficiais de todos os 27 estados brasileiros via API pública
do Querido Diário (queridodiario.ok.org.br/api/v1/).

Fase 1 — apenas nível estadual (UF capitals):
  Endpoint /api/v1/gazettes com filtro territory_id por UF.
  O territory_id de uma UF é o código IBGE do município capital.

Saída GCS:
  Metadados JSON:
    gs://datalake-tbr-raw/diarios/estaduais/<UF>/YYYY/MM/<gazette_id>.json
  PDF da edição (se URL disponível):
    gs://datalake-tbr-raw/diarios/estaduais/<UF>/YYYY/MM/<gazette_id>.pdf

Ambiente:
  GCS_RAW_BUCKET — bucket raw (padrão: datalake-tbr-raw)
  QD_PAGE_SIZE   — itens por página (padrão: 100, máx recomendado: 100)

Uso:
  python crawl_querido_diario.py --uf SP --ano-inicio 2018 --ano-fim 2026
  python crawl_querido_diario.py --todas-ufs --paralelo 6
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional

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
logger = logging.getLogger("tbr.crawl_querido_diario")

# ── Constantes ─────────────────────────────────────────────────────────────────
QD_BASE_URL    = "https://queridodiario.ok.org.br/api/v1"
GCS_RAW_BUCKET = os.environ.get("GCS_RAW_BUCKET", "datalake-tbr-raw")
GCS_PREFIX     = "diarios/estaduais"
QD_PAGE_SIZE   = int(os.environ.get("QD_PAGE_SIZE", "100"))
RATE_LIMIT_DELAY = 0.5   # segundos entre requisições
MAX_RETRIES      = 5
TIMEOUT_HTTP     = 60

# ── Mapeamento UF → territory_id (código IBGE da capital) ─────────────────────
# Querido Diário identifica territórios pelo código IBGE de 7 dígitos.
# Para diários estaduais, usamos o code da capital (nível UF cobertura QD).
# Fonte: IBGE Localidades API + documentação QD.
UF_TERRITORY_MAP: Dict[str, str] = {
    "AC": "1200401",  # Rio Branco
    "AL": "2704302",  # Maceió
    "AM": "1302603",  # Manaus
    "AP": "1600303",  # Macapá
    "BA": "2927408",  # Salvador
    "CE": "2304400",  # Fortaleza
    "DF": "5300108",  # Brasília
    "ES": "3205309",  # Vitória
    "GO": "5208707",  # Goiânia
    "MA": "2111300",  # São Luís
    "MG": "3106200",  # Belo Horizonte
    "MS": "5002704",  # Campo Grande
    "MT": "5103403",  # Cuiabá
    "PA": "1501402",  # Belém
    "PB": "2507507",  # João Pessoa
    "PE": "2611606",  # Recife
    "PI": "2211001",  # Teresina
    "PR": "4106902",  # Curitiba
    "RJ": "3304557",  # Rio de Janeiro
    "RN": "2408102",  # Natal
    "RO": "1100205",  # Porto Velho
    "RR": "1400100",  # Boa Vista
    "RS": "4314902",  # Porto Alegre
    "SC": "4205407",  # Florianópolis
    "SE": "2800308",  # Aracaju
    "SP": "3550308",  # São Paulo
    "TO": "1721000",  # Palmas
}

TODAS_UFS = sorted(UF_TERRITORY_MAP.keys())


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
    return sessao


# ── GCS helpers ────────────────────────────────────────────────────────────────

def _upload_gcs(bucket_name: str, blob_name: str, dados: bytes, content_type: str = "application/json") -> bool:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(blob_name)
        blob.upload_from_string(dados, content_type=content_type)
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


# ── Checkpoint ─────────────────────────────────────────────────────────────────

def _checkpoint_path(uf: str) -> str:
    return f"_checkpoint/crawl_querido_diario_{uf}.json"


def _carregar_checkpoint(bucket_name: str, uf: str) -> set:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(_checkpoint_path(uf))
        if blob.exists():
            dados = json.loads(blob.download_as_text())
            return set(dados.get("gazette_ids_ok", []))
    except Exception:
        pass
    return set()


def _salvar_checkpoint(bucket_name: str, uf: str, ids_ok: set) -> None:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(_checkpoint_path(uf))
        blob.upload_from_string(
            json.dumps({"gazette_ids_ok": sorted(ids_ok)}).encode(),
            content_type="application/json"
        )
    except Exception as exc:
        logger.warning("Checkpoint save falhou (%s): %s", uf, exc)


# ── API Querido Diário ─────────────────────────────────────────────────────────

def _listar_gazettes(
    sessao: requests.Session,
    territory_id: str,
    data_inicio: datetime.date,
    data_fim: datetime.date,
    offset: int = 0,
) -> tuple[List[dict], int]:
    """
    Consulta /gazettes e retorna (lista de gazettes, total).
    """
    params = {
        "territory_id": territory_id,
        "since":        data_inicio.strftime("%Y-%m-%d"),
        "until":        data_fim.strftime("%Y-%m-%d"),
        "offset":       offset,
        "size":         QD_PAGE_SIZE,
    }
    time.sleep(RATE_LIMIT_DELAY)
    resp = sessao.get(f"{QD_BASE_URL}/gazettes", params=params, timeout=TIMEOUT_HTTP)
    resp.raise_for_status()
    dados = resp.json()
    gazettes = dados.get("gazettes", [])
    total    = dados.get("total_gazettes", len(gazettes))
    return gazettes, total


def _baixar_pdf_gazette(sessao: requests.Session, url_pdf: str) -> Optional[bytes]:
    """Baixa PDF de uma gazette. Retorna bytes ou None em falha."""
    time.sleep(RATE_LIMIT_DELAY)
    try:
        resp = sessao.get(url_pdf, timeout=120, stream=True)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("Download PDF falhou %s: %s", url_pdf, exc)
        return None


# ── Processamento por UF ───────────────────────────────────────────────────────

def processar_uf(
    uf: str,
    data_inicio: datetime.date,
    data_fim: datetime.date,
    dry_run: bool = False,
) -> dict:
    """
    Coleta todos os diários de uma UF no período e salva no GCS.
    Retorna métricas de execução.
    """
    territory_id = UF_TERRITORY_MAP.get(uf)
    if not territory_id:
        logger.error("UF inválida ou sem territory_id: %s", uf)
        return {"uf": uf, "erro": "UF inválida"}

    logger.info("UF %s (territory_id=%s): %s → %s", uf, territory_id, data_inicio, data_fim)
    assert_within_budget(threshold_usd=50.0)

    sessao  = _sessao_http()
    ids_ok  = _carregar_checkpoint(GCS_RAW_BUCKET, uf)
    metricas = {"uf": uf, "gazettes_novas": 0, "pdfs_salvos": 0, "erros": 0}

    offset = 0
    while True:
        try:
            gazettes, total = _listar_gazettes(
                sessao, territory_id, data_inicio, data_fim, offset
            )
        except Exception as exc:
            logger.error("UF %s offset=%d: erro na listagem — %s", uf, offset, exc)
            metricas["erros"] += 1
            break

        if not gazettes:
            break

        for gazette in gazettes:
            gid    = gazette.get("gazette_id") or gazette.get("file_url", "").split("/")[-1]
            date_s = gazette.get("date", "0000-00-00")

            if gid in ids_ok:
                continue

            # Deriva path GCS
            try:
                ano, mes, _ = date_s.split("-")
            except ValueError:
                ano, mes = date_s[:4], date_s[5:7]

            prefix_meta = f"{GCS_PREFIX}/{uf}/{ano}/{mes}"
            blob_json   = f"{prefix_meta}/{gid}.json"
            blob_pdf    = f"{prefix_meta}/{gid}.pdf"

            if dry_run:
                logger.info("[DRY-RUN] %s | %s", uf, date_s)
                ids_ok.add(gid)
                continue

            # Salva metadados JSON
            json_bytes = json.dumps(gazette, ensure_ascii=False).encode("utf-8")
            _upload_gcs(GCS_RAW_BUCKET, blob_json, json_bytes, "application/json")
            record_spend("crawl_querido_diario_meta", 0.0)

            # Baixa e salva PDF se URL disponível
            url_pdf = gazette.get("file_url") or gazette.get("url")
            if url_pdf and not _blob_existe(GCS_RAW_BUCKET, blob_pdf):
                pdf_bytes = _baixar_pdf_gazette(sessao, url_pdf)
                if pdf_bytes:
                    _upload_gcs(GCS_RAW_BUCKET, blob_pdf, pdf_bytes, "application/pdf")
                    metricas["pdfs_salvos"] += 1
                    record_spend("crawl_querido_diario_pdf", 0.0)

            ids_ok.add(gid)
            metricas["gazettes_novas"] += 1

        offset += len(gazettes)
        if offset >= total:
            break

    _salvar_checkpoint(GCS_RAW_BUCKET, uf, ids_ok)
    logger.info(
        "UF %s — concluído: %d gazettes novas, %d PDFs salvos, %d erros.",
        uf, metricas["gazettes_novas"], metricas["pdfs_salvos"], metricas["erros"]
    )
    return metricas


# ── Entrada principal ──────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Crawler Querido Diário — 27 UFs")
    parser.add_argument("--uf",          type=str, default=None,
                        help="UF única (ex: SP). Incompatível com --todas-ufs.")
    parser.add_argument("--todas-ufs",   action="store_true",
                        help="Processa todos os 27 estados.")
    parser.add_argument("--ano-inicio",  type=int, default=2018)
    parser.add_argument("--ano-fim",     type=int, default=2026)
    parser.add_argument("--paralelo",    type=int, default=6,
                        help="Número de UFs em paralelo (padrão: 6).")
    parser.add_argument("--dry-run",     action="store_true")
    args = parser.parse_args()

    if args.uf and args.todas_ufs:
        logger.error("Use --uf OU --todas-ufs, não ambos.")
        sys.exit(1)

    ufs = TODAS_UFS if args.todas_ufs else ([args.uf.upper()] if args.uf else TODAS_UFS)
    ufs_invalidas = [u for u in ufs if u not in UF_TERRITORY_MAP]
    if ufs_invalidas:
        logger.error("UFs inválidas: %s", ufs_invalidas)
        sys.exit(1)

    data_inicio = datetime.date(args.ano_inicio, 1, 1)
    data_fim    = datetime.date(args.ano_fim, 12, 31)

    logger.info("━━━━ Crawler Querido Diário iniciado ━━━━")
    logger.info("UFs: %s | Período: %s → %s | Paralelo: %d", ufs, data_inicio, data_fim, args.paralelo)

    assert_within_budget(threshold_usd=50.0)

    if len(ufs) == 1:
        processar_uf(ufs[0], data_inicio, data_fim, dry_run=args.dry_run)
    else:
        with ThreadPoolExecutor(max_workers=args.paralelo) as executor:
            futuros = {
                executor.submit(processar_uf, uf, data_inicio, data_fim, args.dry_run): uf
                for uf in ufs
            }
            for futuro in as_completed(futuros):
                uf = futuros[futuro]
                try:
                    metricas = futuro.result()
                    logger.info("UF %s finalizada: %s", uf, metricas)
                except Exception as exc:
                    logger.error("UF %s: erro fatal — %s", uf, exc)

    logger.info("━━━━ Crawler Querido Diário concluído ━━━━")


if __name__ == "__main__":
    main()
