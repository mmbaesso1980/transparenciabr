#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/ingestors/runners/crawl_ibge_tse_us.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coletor Unificado: IBGE · TSE · OFAC · SEC · OpenSanctions · USASpending
                   · World Bank — TransparênciaBR Pipeline L4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coleta dados estruturados (JSON/XML) de 8 fontes e salva em:
  gs://datalake-tbr-clean/<dominio>/...

Fontes:
  1. IBGE SIDRA       — tabelas de população, PIB, IDH (api.sidra.ibge.gov.br)
  2. IBGE Localidades — municípios, UFs (servicodados.ibge.gov.br)
  3. TSE candidaturas — ciclos 2018, 2020, 2022, 2024
  4. OFAC SDN         — sanções US (diário)
  5. SEC EDGAR        — filings empresas BR
  6. OpenSanctions    — base global PEPs/sanções
  7. USASpending      — gastos federais EUA (cruzamento contratos)
  8. World Bank       — indicadores macroeconômicos BR

Dados de texto estruturado → gs://datalake-tbr-clean/ (não precisam de OCR).

Ambiente:
  GCS_CLEAN_BUCKET         — bucket clean (padrão: datalake-tbr-clean)
  OPENSANCTIONS_API_KEY    — chave OpenSanctions (obrigatória para match)
  SEC_EDGAR_USER_AGENT     — User-Agent SEC EDGAR (obrigatório; ex: "Org email@email.com")
  GCS_RAW_BUCKET           — para OFAC (raw)

Uso:
  python crawl_ibge_tse_us.py --fontes todas
  python crawl_ibge_tse_us.py --fontes ibge_sidra,ofac_sdn,tse
  python crawl_ibge_tse_us.py --fontes ibge_sidra --dry-run
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

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
logger = logging.getLogger("tbr.crawl_ibge_tse_us")

# ── Configuração ───────────────────────────────────────────────────────────────
GCS_CLEAN_BUCKET       = os.environ.get("GCS_CLEAN_BUCKET",      "datalake-tbr-clean")
GCS_RAW_BUCKET         = os.environ.get("GCS_RAW_BUCKET",        "datalake-tbr-raw")
OPENSANCTIONS_API_KEY  = os.environ.get("OPENSANCTIONS_API_KEY", "")
SEC_EDGAR_USER_AGENT   = os.environ.get("SEC_EDGAR_USER_AGENT",  "TransparenciaBR contato@transparenciabr.org")
RATE_LIMIT_DELAY       = 1.0
MAX_RETRIES            = 5
TIMEOUT_HTTP           = 90

TSE_CICLOS   = [2018, 2020, 2022, 2024]
TODAS_UFS    = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS",
                "MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC",
                "SE","SP","TO"]

# Tabelas SIDRA de interesse (código → descrição)
SIDRA_TABELAS = {
    "9514": "censo_2022_populacao_municipio",
    "6579": "estimativa_populacao_anual",
    "9605": "domicilios_censo_2022",
    "6691": "pib_percapita_municipal",
    "1209": "area_territorial_municipios",
    "7358": "mortalidade_infantil",
    "5938": "populacao_por_sexo_censo",
}

# Indicadores World Bank de interesse
WB_INDICATORS = [
    "NY.GDP.MKTP.CD",    # PIB (US$ correntes)
    "SP.POP.TOTL",        # População total
    "SE.ADT.LITR.ZS",    # Taxa de alfabetização adultos
    "SL.UEM.TOTL.ZS",    # Desemprego (% força de trabalho)
    "SI.POV.GINI",        # Índice Gini
    "NY.GDP.PCAP.CD",     # PIB per capita
    "SH.IMM.MEAS",        # Imunização sarampo
]

# CIKs de empresas BR com ADR/dupla listagem na SEC (amostra inicial)
SEC_CIK_BR_LIST = [
    "0001296802",  # Petrobras
    "0001009672",  # Vale (VALE)
    "0001423689",  # Itaú Unibanco
    "0001062613",  # Ambev
    "0001000275",  # Embraer
    "0001161154",  # Gerdau
    "0001166126",  # Ultrapar
    "0001279695",  # Braskem
]


def _sessao_http(user_agent: str = "TransparenciaBR/1.0") -> requests.Session:
    sessao = requests.Session()
    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    sessao.mount("https://", HTTPAdapter(max_retries=retry))
    sessao.mount("http://",  HTTPAdapter(max_retries=retry))
    sessao.headers.update({"User-Agent": user_agent})
    return sessao


# ── GCS helpers ────────────────────────────────────────────────────────────────

def _upload_gcs(bucket_name: str, blob_name: str, dados: bytes, content_type: str = "application/json") -> bool:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        bucket  = cliente.bucket(bucket_name)
        blob    = bucket.blob(blob_name)
        blob.upload_from_string(dados, content_type=content_type)
        logger.debug("GCS: gs://%s/%s (%d bytes)", bucket_name, blob_name, len(dados))
        return True
    except Exception as exc:
        logger.error("GCS upload falhou %s: %s", blob_name, exc)
        return False


def _blob_existe(bucket_name: str, blob_name: str) -> bool:
    try:
        from google.cloud import storage  # type: ignore
        cliente = storage.Client()
        return cliente.bucket(bucket_name).blob(blob_name).exists()
    except Exception:
        return False


def _salvar_json(bucket_name: str, blob_name: str, dados: Any) -> bool:
    return _upload_gcs(
        bucket_name, blob_name,
        json.dumps(dados, ensure_ascii=False, default=str).encode("utf-8"),
        "application/json"
    )


# ── 1. IBGE SIDRA ─────────────────────────────────────────────────────────────

def coletar_ibge_sidra(dry_run: bool = False) -> dict:
    logger.info("=== IBGE SIDRA ===")
    assert_within_budget()
    sessao = _sessao_http()
    metricas = {"tabelas_ok": 0, "tabelas_err": 0}

    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    for codigo_tabela, nome_tabela in SIDRA_TABELAS.items():
        blob_name = f"ibge/sidra/{nome_tabela}/{hoje}.json"
        if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
            logger.info("SIDRA tabela %s já existe — pulando.", codigo_tabela)
            metricas["tabelas_ok"] += 1
            continue

        url = f"https://apisidra.ibge.gov.br/values/t/{codigo_tabela}/n6/all/v/all/p/last 1/f/u"
        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, timeout=TIMEOUT_HTTP)
            resp.raise_for_status()
            dados = resp.json()
            if not dry_run:
                _salvar_json(GCS_CLEAN_BUCKET, blob_name, dados)
                record_spend("ibge_sidra", 0.0)
                metricas["tabelas_ok"] += 1
                logger.info("SIDRA tabela %s: %d registros salvos.", codigo_tabela, len(dados))
            else:
                logger.info("[DRY-RUN] SIDRA tabela %s: %d registros.", codigo_tabela, len(dados))
        except Exception as exc:
            logger.error("SIDRA tabela %s: %s", codigo_tabela, exc)
            metricas["tabelas_err"] += 1

    return metricas


# ── 2. IBGE Localidades ───────────────────────────────────────────────────────

def coletar_ibge_localidades(dry_run: bool = False) -> dict:
    logger.info("=== IBGE Localidades ===")
    assert_within_budget()
    sessao = _sessao_http()
    metricas = {"endpoints_ok": 0, "endpoints_err": 0}
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    endpoints = {
        "estados": "https://servicodados.ibge.gov.br/api/v1/localidades/estados",
        "municipios": "https://servicodados.ibge.gov.br/api/v1/localidades/municipios",
        "regioes": "https://servicodados.ibge.gov.br/api/v1/localidades/regioes",
        "mesorregioes": "https://servicodados.ibge.gov.br/api/v1/localidades/mesorregioes",
        "microrregioes": "https://servicodados.ibge.gov.br/api/v1/localidades/microrregioes",
    }

    for nome, url in endpoints.items():
        blob_name = f"ibge/localidades/{nome}/{hoje}.json"
        if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
            logger.info("IBGE localidades/%s já existe — pulando.", nome)
            continue
        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, timeout=TIMEOUT_HTTP)
            resp.raise_for_status()
            dados = resp.json()
            if not dry_run:
                _salvar_json(GCS_CLEAN_BUCKET, blob_name, dados)
                record_spend("ibge_localidades", 0.0)
                metricas["endpoints_ok"] += 1
                logger.info("IBGE localidades/%s: %d itens.", nome, len(dados) if isinstance(dados, list) else 1)
        except Exception as exc:
            logger.error("IBGE localidades/%s: %s", nome, exc)
            metricas["endpoints_err"] += 1

    return metricas


# ── 3. TSE Candidaturas ────────────────────────────────────────────────────────

def coletar_tse_candidaturas(dry_run: bool = False) -> dict:
    logger.info("=== TSE Candidaturas ===")
    assert_within_budget()
    sessao   = _sessao_http()
    metricas = {"ciclos_ok": 0, "candidatos_total": 0, "erros": 0}

    for ano in TSE_CICLOS:
        for uf in TODAS_UFS:
            blob_name = f"tse/candidaturas/{ano}/{uf}.json"
            if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
                continue

            # TSE DivulgaCandContas API
            url = (f"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/"
                   f"candidatura/listar/{ano}/{uf}/0/0/0/0/0")
            time.sleep(RATE_LIMIT_DELAY)
            try:
                resp = sessao.get(url, timeout=TIMEOUT_HTTP)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                dados = resp.json()
                candidatos = dados.get("candidatos") or dados.get("data") or dados

                if not dry_run:
                    _salvar_json(GCS_CLEAN_BUCKET, blob_name, dados)
                    record_spend("tse_candidaturas", 0.0)
                    n = len(candidatos) if isinstance(candidatos, list) else 1
                    metricas["candidatos_total"] += n
                else:
                    logger.info("[DRY-RUN] TSE %d %s", ano, uf)

            except Exception as exc:
                logger.warning("TSE %d %s: %s", ano, uf, exc)
                metricas["erros"] += 1

        logger.info("TSE ciclo %d: concluído.", ano)
        metricas["ciclos_ok"] += 1

    # TSE dados abertos bulk (bens e prestação de contas)
    tse_bulk_base = "https://dadosabertos.tse.jus.br"
    for ano in TSE_CICLOS:
        for dataset, nome in [
            (f"bem_candidato_{ano}.zip", "bens"),
            (f"prestacao_contas_{ano}.zip", "prestacao_contas"),
        ]:
            blob_name = f"tse/bulk/{ano}/{nome}.zip"
            if _blob_existe(GCS_RAW_BUCKET, blob_name):
                continue
            url = f"{tse_bulk_base}/dataset/bem-candidato/resource/{dataset}"
            time.sleep(RATE_LIMIT_DELAY * 2)
            try:
                resp = sessao.get(url, timeout=180, stream=True)
                if resp.status_code == 200 and not dry_run:
                    _upload_gcs(GCS_RAW_BUCKET, blob_name, resp.content, "application/zip")
                    record_spend("tse_bulk_download", 0.0)
                    logger.info("TSE bulk %d %s: %d bytes.", ano, nome, len(resp.content))
            except Exception as exc:
                logger.warning("TSE bulk %d %s: %s", ano, nome, exc)

    return metricas


# ── 4. OFAC SDN ───────────────────────────────────────────────────────────────

def coletar_ofac_sdn(dry_run: bool = False) -> dict:
    logger.info("=== OFAC SDN ===")
    assert_within_budget()
    sessao = _sessao_http()
    hoje   = datetime.datetime.utcnow().strftime("%Y/%m/%d")
    metricas = {"arquivos_ok": 0, "erros": 0}

    ofac_arquivos = {
        "sdn.xml":          "https://www.treasury.gov/ofac/downloads/sdn.xml",
        "sdn_advanced.xml": "https://www.treasury.gov/ofac/downloads/sdn_advanced.xml",
        "consolidated.xml": "https://www.treasury.gov/ofac/downloads/consolidated.xml",
    }

    for nome_arquivo, url in ofac_arquivos.items():
        blob_name = f"sancoes/ofac/{hoje}/{nome_arquivo}"
        if _blob_existe(GCS_RAW_BUCKET, blob_name):
            logger.info("OFAC %s já existe — pulando.", nome_arquivo)
            metricas["arquivos_ok"] += 1
            continue

        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, timeout=300, stream=True)
            resp.raise_for_status()
            xml_bytes = resp.content

            if dry_run:
                logger.info("[DRY-RUN] OFAC %s: %d bytes.", nome_arquivo, len(xml_bytes))
                continue

            # Salva XML raw
            _upload_gcs(GCS_RAW_BUCKET, blob_name, xml_bytes, "application/xml")
            record_spend("ofac_sdn_download", 0.0)

            # Converte XML → JSON estruturado e salva no clean
            try:
                raiz = ET.fromstring(xml_bytes)
                entidades = []
                for elem in raiz.iter():
                    if "sdnEntry" in elem.tag or "entry" in elem.tag.lower():
                        entidade = {child.tag.split("}")[-1]: child.text
                                    for child in elem if child.text}
                        entidades.append(entidade)
                if entidades:
                    blob_json = f"sancoes/ofac/{hoje}/{nome_arquivo.replace('.xml', '.json')}"
                    _salvar_json(GCS_CLEAN_BUCKET, blob_json, entidades)
                    logger.info("OFAC %s: %d entidades estruturadas.", nome_arquivo, len(entidades))
            except ET.ParseError as exc:
                logger.warning("OFAC %s parse XML: %s", nome_arquivo, exc)

            metricas["arquivos_ok"] += 1
        except Exception as exc:
            logger.error("OFAC %s: %s", nome_arquivo, exc)
            metricas["erros"] += 1

    return metricas


# ── 5. SEC EDGAR ──────────────────────────────────────────────────────────────

def coletar_sec_edgar(dry_run: bool = False) -> dict:
    logger.info("=== SEC EDGAR ===")
    assert_within_budget()
    sessao = _sessao_http(user_agent=SEC_EDGAR_USER_AGENT)
    metricas = {"ciks_ok": 0, "erros": 0}
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    for cik in SEC_CIK_BR_LIST:
        blob_name = f"sec_edgar/submissions/{hoje}/{cik}.json"
        if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
            continue

        url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        time.sleep(RATE_LIMIT_DELAY * 2)  # SEC: máx 10 req/s
        try:
            resp = sessao.get(url, timeout=TIMEOUT_HTTP)
            resp.raise_for_status()
            dados = resp.json()
            if not dry_run:
                _salvar_json(GCS_CLEAN_BUCKET, blob_name, dados)
                record_spend("sec_edgar", 0.0)
                metricas["ciks_ok"] += 1
                logger.info("SEC EDGAR CIK %s: %s.", cik, dados.get("name", "?"))
            else:
                logger.info("[DRY-RUN] SEC EDGAR CIK %s: %s.", cik, dados.get("name", "?"))
        except Exception as exc:
            logger.error("SEC EDGAR CIK %s: %s", cik, exc)
            metricas["erros"] += 1

    return metricas


# ── 6. OpenSanctions ──────────────────────────────────────────────────────────

def coletar_opensanctions(dry_run: bool = False) -> dict:
    logger.info("=== OpenSanctions ===")
    assert_within_budget()

    if not OPENSANCTIONS_API_KEY:
        logger.warning("OPENSANCTIONS_API_KEY não configurada — pulando coleta paga.")
        # Coleta catálogo de datasets (público)
        sessao = _sessao_http()
        blob_name = "sancoes/opensanctions/datasets_catalog.json"
        url = "https://api.opensanctions.org/datasets/"
        try:
            resp = sessao.get(url, timeout=TIMEOUT_HTTP)
            resp.raise_for_status()
            if not dry_run:
                _salvar_json(GCS_CLEAN_BUCKET, blob_name, resp.json())
                logger.info("OpenSanctions: catálogo de datasets salvo.")
        except Exception as exc:
            logger.error("OpenSanctions catálogo: %s", exc)
        return {"status": "sem_api_key_coleta_parcial"}

    sessao = _sessao_http()
    sessao.headers["Authorization"] = f"ApiKey {OPENSANCTIONS_API_KEY}"
    metricas = {"datasets_ok": 0, "erros": 0}
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    # Datasets de interesse para cruzamento BR
    datasets_interesse = [
        "br_ceaf",           # Lista de inelegíveis BR
        "us_ofac_sdn",       # OFAC SDN (via OpenSanctions)
        "un_sc_sanctions",   # Sanções ONU
        "interpol_red_notices",
        "us_fbi_most_wanted",
        "worldbank_debarred", # World Bank Debarred
    ]

    for dataset in datasets_interesse:
        blob_name = f"sancoes/opensanctions/{dataset}/{hoje}.json"
        if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
            continue
        url = f"https://api.opensanctions.org/entities/"
        params = {"dataset": dataset, "limit": 1000, "offset": 0}

        todos = []
        while True:
            time.sleep(RATE_LIMIT_DELAY)
            try:
                resp = sessao.get(url, params=params, timeout=TIMEOUT_HTTP)
                resp.raise_for_status()
                dados = resp.json()
                itens = dados.get("results", [])
                todos.extend(itens)
                if len(itens) < 1000 or not dados.get("next"):
                    break
                params["offset"] += 1000
            except Exception as exc:
                logger.error("OpenSanctions dataset %s: %s", dataset, exc)
                metricas["erros"] += 1
                break

        if todos and not dry_run:
            _salvar_json(GCS_CLEAN_BUCKET, blob_name, todos)
            record_spend("opensanctions", 0.0)
            metricas["datasets_ok"] += 1
            logger.info("OpenSanctions %s: %d entidades.", dataset, len(todos))

    return metricas


# ── 7. USASpending ────────────────────────────────────────────────────────────

def coletar_usaspending(dry_run: bool = False) -> dict:
    logger.info("=== USASpending ===")
    assert_within_budget()
    sessao = _sessao_http()
    metricas = {"endpoints_ok": 0, "erros": 0}
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    # Busca contratos com fornecedores BR (place_of_performance ou recipient_country_code BR)
    payload = {
        "filters": {
            "recipient_location_country_code": "BRA",
            "time_period": [{"start_date": "2018-01-01", "end_date": "2026-12-31"}],
        },
        "fields": ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Award Date"],
        "sort": "Award Amount",
        "order": "desc",
        "limit": 100,
        "page": 1,
    }

    blob_name = f"usaspending/contratos_brasil/{hoje}.json"
    if not _blob_existe(GCS_CLEAN_BUCKET, blob_name) and not dry_run:
        try:
            time.sleep(RATE_LIMIT_DELAY)
            resp = sessao.post(
                "https://api.usaspending.gov/api/v2/search/spending_by_award/",
                json=payload,
                timeout=TIMEOUT_HTTP,
            )
            resp.raise_for_status()
            _salvar_json(GCS_CLEAN_BUCKET, blob_name, resp.json())
            record_spend("usaspending", 0.0)
            metricas["endpoints_ok"] += 1
            logger.info("USASpending contratos BR: salvos.")
        except Exception as exc:
            logger.error("USASpending: %s", exc)
            metricas["erros"] += 1
    elif dry_run:
        logger.info("[DRY-RUN] USASpending contratos BR")

    return metricas


# ── 8. World Bank ─────────────────────────────────────────────────────────────

def coletar_worldbank(dry_run: bool = False) -> dict:
    logger.info("=== World Bank ===")
    assert_within_budget()
    sessao = _sessao_http()
    metricas = {"indicadores_ok": 0, "erros": 0}
    hoje = datetime.datetime.utcnow().strftime("%Y%m%d")

    for indicador in WB_INDICATORS:
        blob_name = f"worldbank/indicadores/{indicador.replace('.', '_')}/{hoje}.json"
        if _blob_existe(GCS_CLEAN_BUCKET, blob_name):
            continue

        url = f"https://api.worldbank.org/v2/country/BR/indicator/{indicador}"
        params = {"format": "json", "per_page": 100, "date": "2000:2026"}
        time.sleep(RATE_LIMIT_DELAY)
        try:
            resp = sessao.get(url, params=params, timeout=TIMEOUT_HTTP)
            resp.raise_for_status()
            dados = resp.json()
            if not dry_run:
                _salvar_json(GCS_CLEAN_BUCKET, blob_name, dados)
                record_spend("worldbank", 0.0)
                metricas["indicadores_ok"] += 1
                logger.info("World Bank %s: salvo.", indicador)
            else:
                logger.info("[DRY-RUN] World Bank %s", indicador)
        except Exception as exc:
            logger.error("World Bank %s: %s", indicador, exc)
            metricas["erros"] += 1

    return metricas


# ── Entrada principal ──────────────────────────────────────────────────────────

FONTES_DISPONIVEIS = {
    "ibge_sidra":        coletar_ibge_sidra,
    "ibge_localidades":  coletar_ibge_localidades,
    "tse":               coletar_tse_candidaturas,
    "ofac_sdn":          coletar_ofac_sdn,
    "sec_edgar":         coletar_sec_edgar,
    "opensanctions":     coletar_opensanctions,
    "usaspending":       coletar_usaspending,
    "worldbank":         coletar_worldbank,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Coletor unificado IBGE/TSE/US — L4")
    parser.add_argument(
        "--fontes",
        type=str,
        default="todas",
        help=f"Fontes a coletar (vírgulas) ou 'todas'. Disponíveis: {', '.join(FONTES_DISPONIVEIS)}"
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.fontes.lower() == "todas":
        fontes_sel = list(FONTES_DISPONIVEIS.keys())
    else:
        fontes_sel = [f.strip() for f in args.fontes.split(",")]
        invalidas  = [f for f in fontes_sel if f not in FONTES_DISPONIVEIS]
        if invalidas:
            logger.error("Fontes inválidas: %s. Disponíveis: %s", invalidas, list(FONTES_DISPONIVEIS))
            sys.exit(1)

    logger.info("━━━━ Coletor Unificado iniciado ━━━━")
    logger.info("Fontes: %s | DRY-RUN: %s", fontes_sel, args.dry_run)
    assert_within_budget(threshold_usd=50.0)

    resultados = {}
    for nome_fonte in fontes_sel:
        funcao = FONTES_DISPONIVEIS[nome_fonte]
        try:
            metricas = funcao(dry_run=args.dry_run)
            resultados[nome_fonte] = metricas
        except RuntimeError as exc:
            logger.critical("HARD-STOP: %s", exc)
            break
        except Exception as exc:
            logger.error("Fonte %s: erro fatal — %s", nome_fonte, exc)
            resultados[nome_fonte] = {"erro": str(exc)}

    logger.info("━━━━ Coletor Unificado concluído ━━━━")
    for fonte, metricas in resultados.items():
        logger.info("  %-20s: %s", fonte, metricas)


if __name__ == "__main__":
    main()
