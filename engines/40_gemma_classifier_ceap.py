#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/40_gemma_classifier_ceap.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Classifier paralelo CEAP via Gemma 27B local na L4.
Roda em paralelo ao run_l4_massive.sh sem conflito de GPU.

DIRETIVAS:
  - ZERO Firestore. Saída exclusiva GCS (gs://datalake-tbr-clean/ceap_classified/).
  - Gemma roda LOCAL via Ollama (http://127.0.0.1:11434). NÃO usa Vertex.
  - Idempotente: verifica GCS antes de invocar Gemma; não duplica saída.
  - Hard-stop integrado: respeita billing_guardrail.check_daily_spend().
  - max_workers=4 para não saturar Ollama (1 GPU compartilhada).
  - Saída: JSONL particionado por {ano}/{id_deputado}/notas.jsonl no GCS.

Variáveis de ambiente relevantes:
  GCS_CLEAN_BUCKET          — bucket de saída (default: datalake-tbr-clean)
  CEAP_YEARS                — anos a processar, separados por vírgula
                              (default: 2018,2019,2020,2021,2022,2023,2024,2025,2026)
  CEAP_LIMIT_PER_PARLAMENTAR — limite de notas por parlamentar, "" = sem limite
                              (default: ""; usar "100" para testes)
  GCP_PROJECT_ID            — projeto GCP (default: transparenciabr)
  LOG_LEVEL                 — nível de log (default: INFO)

Uso:
  python3 engines/40_gemma_classifier_ceap.py
  CEAP_YEARS=2024 CEAP_LIMIT_PER_PARLAMENTAR=100 python3 engines/40_gemma_classifier_ceap.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import time
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests

# ── Ajuste de path para importações relativas ─────────────────────────────────
_ENG_DIR = Path(__file__).resolve().parent
if str(_ENG_DIR) not in sys.path:
    sys.path.insert(0, str(_ENG_DIR))

from lib.billing_guardrail import check_daily_spend, record_spend
from lib.project_config import gcp_project_id

# ── Configuração de logging estruturado ──────────────────────────────────────
_LOG_DIR = Path.home() / "transparenciabr" / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = _LOG_DIR / f"gemma_classifier_{datetime.date.today().strftime('%Y%m%d')}.log"

_LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=_LOG_LEVEL,
    format="%(asctime)s | %(levelname)s | engine=40_gemma_classifier | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(_LOG_FILE), encoding="utf-8"),
    ],
)
logger = logging.getLogger("transparenciabr.engine40")

# ── Constantes e configurações ────────────────────────────────────────────────
OLLAMA_URL  = "http://127.0.0.1:11434/api/generate"
MODEL       = "gemma2:27b-instruct-q4_K_M"   # já carregado na L4

GCS_CLEAN_BUCKET         = os.environ.get("GCS_CLEAN_BUCKET", "datalake-tbr-clean")
GCS_CLEAN_PREFIX         = "ceap_classified"
GCS_RAW_BUCKET           = os.environ.get("GCS_RAW_BUCKET", "datalake-tbr-raw")
GCS_RAW_FALLBACK_PREFIX  = "ceap"

CEAP_YEARS_STR           = os.environ.get("CEAP_YEARS", "2018,2019,2020,2021,2022,2023,2024,2025,2026")
CEAP_YEARS               = [int(a.strip()) for a in CEAP_YEARS_STR.split(",") if a.strip()]

_LIMIT_STR               = os.environ.get("CEAP_LIMIT_PER_PARLAMENTAR", "").strip()
CEAP_LIMIT_PER_PARLAMENTAR: Optional[int] = int(_LIMIT_STR) if _LIMIT_STR else None

MAX_WORKERS              = 4    # Threads paralelas para Ollama; não saturar GPU única
OLLAMA_TIMEOUT_S         = 90   # Timeout por requisição (Gemma 27B pode ser lento)
BILLING_CHECK_INTERVAL   = 1000 # Verifica billing a cada N notas processadas
OLLAMA_RETRY_MAX         = 3    # Tentativas em caso de falha transitória
OLLAMA_RETRY_DELAY_S     = 5    # Pausa entre tentativas

# ── Template de prompt ────────────────────────────────────────────────────────
PROMPT_TEMPLATE = """\
Você é um auditor público brasileiro. Analise esta nota fiscal de CEAP \
(Cota para Exercício da Atividade Parlamentar).

Parlamentar: {nome} ({partido}/{uf}) — Cargo: {cargo}
Tipo de despesa: {tipo}
Fornecedor: {fornecedor} (CNPJ {cnpj})
Valor: R$ {valor}
Data: {data}
Descrição: {descricao}

Classifique em JSON estrito (sem markdown, sem prosa fora do JSON):
{{
  "categoria": "<combustivel|hospedagem|divulgacao|alimentacao|transporte|consultoria|escritorio|telefonia|outros>",
  "anomalia": "<nenhuma|valor_atipico|fornecedor_suspeito|fracionamento|repeticao|round_number>",
  "score_risco": <0-10>,
  "justificativa": "<frase única em PT-BR explicando o score>"
}}\
"""

# ── Esquema esperado do BigQuery ──────────────────────────────────────────────
# transparenciabr.ceap_despesas
BQ_TABLE_PRIMARY  = "transparenciabr.ceap_despesas"
BQ_TABLE_FALLBACK = "basedosdados.br_camara_dados_abertos.despesa"

# Mapeamento de campos por tabela: (campo_primário, campo_fallback)
_CAMPO_MAP = {
    "id_deputado":       ("id_deputado",       "id_deputado"),
    "nome_deputado":     ("nome_deputado",      "nome_parlamentar"),
    "partido":           ("partido",            "sigla_partido"),
    "uf":                ("uf",                 "sigla_uf"),
    "ano":               ("ano",                "ano"),
    "mes":               ("mes",                "mes"),
    "tipo_despesa":      ("tipo_despesa",       "tipo_despesa"),
    "fornecedor":        ("fornecedor",         "nome_fornecedor"),
    "cnpj_fornecedor":   ("cnpj_fornecedor",    "cnpj_cpf_fornecedor"),
    "valor_liquido":     ("valor_liquido",      "valor_liquido"),
    "data_emissao":      ("data_emissao",       "data_emissao"),
    "descricao":         ("descricao",          ""),   # pode não existir
}


# ─────────────────────────────────────────────────────────────────────────────
# Seção 1 — Clientes GCS / BQ (lazy)
# ─────────────────────────────────────────────────────────────────────────────

def _gcs_client():
    """Retorna cliente GCS (lazy import)."""
    from google.cloud import storage  # type: ignore
    return storage.Client()


def _bq_client():
    """Retorna cliente BigQuery (lazy import)."""
    from google.cloud import bigquery  # type: ignore
    return bigquery.Client(project=gcp_project_id())


# ─────────────────────────────────────────────────────────────────────────────
# Seção 2 — Idempotência GCS
# ─────────────────────────────────────────────────────────────────────────────

def _gcs_blob_path(ano: int, id_deputado: str) -> str:
    """Retorna o caminho do blob JSONL de saída no GCS."""
    return f"{GCS_CLEAN_PREFIX}/{ano}/{id_deputado}/notas.jsonl"


def _contagem_linhas_gcs(gcs: Any, blob_path: str) -> int:
    """
    Retorna o número de linhas do blob JSONL em GCS.
    Retorna -1 se o blob não existir.
    """
    try:
        bucket = gcs.bucket(GCS_CLEAN_BUCKET)
        blob   = bucket.blob(blob_path)
        if not blob.exists():
            return -1
        conteudo = blob.download_as_text(encoding="utf-8")
        return sum(1 for l in conteudo.splitlines() if l.strip())
    except Exception as exc:
        logger.warning("Falha ao verificar GCS blob '%s': %s", blob_path, exc)
        return -1


# ─────────────────────────────────────────────────────────────────────────────
# Seção 3 — Leitura das notas CEAP
# ─────────────────────────────────────────────────────────────────────────────

def _montar_query_bq(tabela: str, anos: List[int], eh_fallback: bool) -> str:
    """
    Monta query SQL para extrair notas CEAP do BigQuery.
    Adapta nomes de colunas conforme tabela primária ou fallback.
    """
    idx = 1 if eh_fallback else 0
    c = {k: v[idx] for k, v in _CAMPO_MAP.items()}

    # Campo descricao pode ser vazio na tabela de fallback
    sel_descricao = (
        f"'' AS descricao" if not c["descricao"]
        else f"CAST({c['descricao']} AS STRING) AS descricao"
    )
    anos_str = ", ".join(str(a) for a in anos)

    return f"""
        SELECT
            CAST({c['id_deputado']}    AS STRING)  AS id_deputado,
            CAST({c['nome_deputado']}  AS STRING)  AS nome_deputado,
            CAST({c['partido']}        AS STRING)  AS partido,
            CAST({c['uf']}             AS STRING)  AS uf,
            CAST({c['ano']}            AS INT64)   AS ano,
            CAST({c['mes']}            AS INT64)   AS mes,
            CAST({c['tipo_despesa']}   AS STRING)  AS tipo_despesa,
            CAST({c['fornecedor']}     AS STRING)  AS fornecedor,
            CAST({c['cnpj_fornecedor']} AS STRING) AS cnpj_fornecedor,
            CAST({c['valor_liquido']}  AS FLOAT64) AS valor_liquido,
            CAST({c['data_emissao']}   AS STRING)  AS data_emissao,
            {sel_descricao}
        FROM `{tabela}`
        WHERE CAST({c['ano']} AS INT64) IN ({anos_str})
        ORDER BY {c['id_deputado']}, {c['ano']}, {c['mes']}
    """


def _ler_notas_bq(anos: List[int]) -> List[Dict[str, Any]]:
    """
    Lê notas CEAP do BigQuery.
    Tenta tabela primária; em caso de falha ou resultado vazio,
    usa tabela fallback de basedosdados.
    Retorna lista de dicts com schema padronizado.
    """
    bq = _bq_client()

    for eh_fallback, tabela in [(False, BQ_TABLE_PRIMARY), (True, BQ_TABLE_FALLBACK)]:
        try:
            query  = _montar_query_bq(tabela, anos, eh_fallback)
            logger.info("Consultando BQ: %s (anos=%s)", tabela, anos)
            df     = bq.query(query).to_dataframe()
            if df.empty:
                logger.warning("Tabela '%s' retornou 0 linhas. Tentando fallback.", tabela)
                continue
            logger.info("BQ '%s': %d notas carregadas.", tabela, len(df))
            return df.to_dict("records")
        except Exception as exc:
            logger.warning("Falha ao consultar '%s': %s. Tentando próxima fonte.", tabela, exc)

    logger.warning("Ambas as tabelas BQ indisponíveis ou vazias. Usando fallback GCS.")
    return []


def _ler_notas_gcs_fallback(anos: List[int]) -> Generator[Dict[str, Any], None, None]:
    """
    Fallback: lê notas CEAP de arquivos JSONL em
    gs://datalake-tbr-raw/ceap/*.jsonl quando BQ está vazio.
    """
    gcs = _gcs_client()
    bucket = gcs.bucket(GCS_RAW_BUCKET)
    prefixo = GCS_RAW_FALLBACK_PREFIX
    blobs   = list(bucket.list_blobs(prefix=prefixo))
    logger.info("GCS fallback: %d blobs em gs://%s/%s/", len(blobs), GCS_RAW_BUCKET, prefixo)

    for blob in blobs:
        if not blob.name.endswith(".jsonl"):
            continue
        try:
            conteudo = blob.download_as_text(encoding="utf-8")
            for linha in conteudo.splitlines():
                if not linha.strip():
                    continue
                nota = json.loads(linha)
                ano  = int(nota.get("ano", 0))
                if ano in anos:
                    # Normaliza campos para schema padrão
                    nota.setdefault("id_deputado",    nota.get("idDeputado", ""))
                    nota.setdefault("nome_deputado",  nota.get("nomeParlamentar", nota.get("nome_parlamentar", "")))
                    nota.setdefault("partido",        nota.get("siglaPartido", nota.get("sigla_partido", "")))
                    nota.setdefault("uf",             nota.get("siglaUf", nota.get("sigla_uf", "")))
                    nota.setdefault("tipo_despesa",   nota.get("tipoDespesa", ""))
                    nota.setdefault("fornecedor",     nota.get("nomeFornecedor", nota.get("nome_fornecedor", "")))
                    nota.setdefault("cnpj_fornecedor",nota.get("cnpjCpf", nota.get("cnpj_cpf_fornecedor", "")))
                    nota.setdefault("valor_liquido",  float(nota.get("valorLiquido", nota.get("valor_liquido", 0.0))))
                    nota.setdefault("data_emissao",   nota.get("dataEmissao", nota.get("data_emissao", "")))
                    nota.setdefault("descricao",      nota.get("descricao", ""))
                    yield nota
        except Exception as exc:
            logger.warning("Erro ao ler blob GCS '%s': %s", blob.name, exc)


def _carregar_notas(anos: List[int]) -> List[Dict[str, Any]]:
    """
    Ponto de entrada unificado: tenta BQ, fallback para GCS.
    """
    notas = _ler_notas_bq(anos)
    if not notas:
        notas = list(_ler_notas_gcs_fallback(anos))
    logger.info("Total de notas carregadas: %d", len(notas))
    return notas


# ─────────────────────────────────────────────────────────────────────────────
# Seção 4 — Classificação via Gemma (Ollama local)
# ─────────────────────────────────────────────────────────────────────────────

def _montar_campos_prompt(nota: Dict[str, Any]) -> Dict[str, str]:
    """Extrai e normaliza campos da nota para uso no prompt."""
    def s(k: str, default: str = "") -> str:
        v = nota.get(k, default)
        return str(v).strip() if v is not None else default

    return {
        "nome":       s("nome_deputado", "Desconhecido"),
        "partido":    s("partido", "?"),
        "uf":         s("uf", "?"),
        "cargo":      s("cargo", "Deputado Federal"),
        "tipo":       s("tipo_despesa", "Não informado"),
        "fornecedor": s("fornecedor", "Não informado"),
        "cnpj":       s("cnpj_fornecedor", "Não informado"),
        "valor":      f"{float(nota.get('valor_liquido', 0.0)):.2f}",
        "data":       s("data_emissao", "?"),
        "descricao":  s("descricao", ""),
    }


def _classificar_nota_ollama(nota: Dict[str, Any]) -> Dict[str, Any]:
    """
    Envia uma nota ao Gemma 27B via Ollama e retorna o JSON classificado.
    Inclui retry com backoff em caso de falha transitória.
    Gemma = custo zero (GPU local); record_spend com custo_usd=0.0.
    """
    campos  = _montar_campos_prompt(nota)
    prompt  = PROMPT_TEMPLATE.format(**campos)
    payload = {
        "model":   MODEL,
        "prompt":  prompt,
        "stream":  False,
        "format":  "json",
        "options": {
            "temperature": 0.1,
            "num_predict": 256,
            "stop":        ["}"],
        },
    }

    ultimo_erro: Optional[Exception] = None
    for tentativa in range(1, OLLAMA_RETRY_MAX + 1):
        try:
            resp = requests.post(
                OLLAMA_URL,
                json=payload,
                timeout=OLLAMA_TIMEOUT_S,
            )
            resp.raise_for_status()
            raw_json = resp.json()
            resposta = raw_json.get("response", "")

            # Garante que o JSON está completo (Gemma pode truncar)
            if not resposta.strip().endswith("}"):
                resposta = resposta.strip() + "}"

            classificacao = json.loads(resposta)

            # Registra uso local (custo = 0.0; Gemma local)
            record_spend("gemma27b_ceap_local", 0.0)

            return classificacao

        except json.JSONDecodeError as exc:
            logger.warning(
                "Tentativa %d/%d — JSON inválido do Gemma para nota '%s': %s",
                tentativa, OLLAMA_RETRY_MAX,
                nota.get("id_deputado", "?"), exc,
            )
            ultimo_erro = exc
        except requests.RequestException as exc:
            logger.warning(
                "Tentativa %d/%d — Falha HTTP Ollama para nota '%s': %s",
                tentativa, OLLAMA_RETRY_MAX,
                nota.get("id_deputado", "?"), exc,
            )
            ultimo_erro = exc

        if tentativa < OLLAMA_RETRY_MAX:
            time.sleep(OLLAMA_RETRY_DELAY_S * tentativa)

    # Esgotadas as tentativas — retorna classificação de erro
    logger.error(
        "Falha definitiva ao classificar nota '%s' após %d tentativas: %s",
        nota.get("id_deputado", "?"), OLLAMA_RETRY_MAX, ultimo_erro,
    )
    return {
        "categoria":    "outros",
        "anomalia":     "nenhuma",
        "score_risco":  -1,
        "justificativa": f"Erro de classificação: {ultimo_erro}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Seção 5 — Escrita no GCS
# ─────────────────────────────────────────────────────────────────────────────

def _escrever_jsonl_gcs(
    gcs: Any,
    blob_path: str,
    linhas: List[Dict[str, Any]],
) -> None:
    """
    Escreve lista de dicts como JSONL no GCS.
    Sobrescreve o blob integralmente (operação idempotente quando chamada
    após verificação de contagem).
    """
    conteudo = "\n".join(json.dumps(l, ensure_ascii=False) for l in linhas) + "\n"
    bucket   = gcs.bucket(GCS_CLEAN_BUCKET)
    blob     = bucket.blob(blob_path)
    blob.upload_from_string(
        conteudo.encode("utf-8"),
        content_type="application/x-ndjson",
    )
    logger.debug("GCS escrito: gs://%s/%s (%d linhas)", GCS_CLEAN_BUCKET, blob_path, len(linhas))


# ─────────────────────────────────────────────────────────────────────────────
# Seção 6 — Agrupamento e processamento por parlamentar
# ─────────────────────────────────────────────────────────────────────────────

def _agrupar_por_parlamentar_ano(
    notas: List[Dict[str, Any]],
) -> Dict[Tuple[str, int], List[Dict[str, Any]]]:
    """
    Agrupa as notas em {(id_deputado, ano): [nota, ...]}.
    """
    grupos: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    for nota in notas:
        chave = (str(nota.get("id_deputado", "desconhecido")), int(nota.get("ano", 0)))
        grupos.setdefault(chave, []).append(nota)
    return grupos


def _processar_grupo(
    chave: Tuple[str, int],
    notas_grupo: List[Dict[str, Any]],
    gcs: Any,
) -> Tuple[int, int, float]:
    """
    Processa todas as notas de um (parlamentar, ano).

    Fluxo:
      1. Verifica se blob GCS já existe com mesmo nº de linhas (idempotência).
      2. Para cada nota, invoca _classificar_nota_ollama.
      3. Mescla resultado da classificação à nota original.
      4. Escreve JSONL no GCS ao final.

    Retorna: (n_processadas, n_anomalias, soma_score)
    """
    id_dep, ano = chave
    blob_path   = _gcs_blob_path(ano, id_dep)

    # Aplica limite por parlamentar, se configurado
    if CEAP_LIMIT_PER_PARLAMENTAR:
        notas_grupo = notas_grupo[:CEAP_LIMIT_PER_PARLAMENTAR]

    n_total = len(notas_grupo)

    # ── Verificação de idempotência ───────────────────────────────────────────
    linhas_existentes = _contagem_linhas_gcs(gcs, blob_path)
    if linhas_existentes == n_total and n_total > 0:
        logger.debug(
            "Pulando (idempotente): gs://%s/%s já tem %d linhas.",
            GCS_CLEAN_BUCKET, blob_path, n_total,
        )
        return 0, 0, 0.0

    # ── Classificação paralela ────────────────────────────────────────────────
    resultados: List[Dict[str, Any]] = []
    n_anomalias = 0
    soma_score  = 0.0

    # Submete ao ThreadPoolExecutor do chamador (via submit externo),
    # mas aqui processa sequencialmente dentro do grupo para simplificar
    # o controle de erros por nota. O paralelismo ocorre entre GRUPOS.
    for nota in notas_grupo:
        clf = _classificar_nota_ollama(nota)
        nota_enriquecida = {**nota, "classificacao_gemma": clf}
        resultados.append(nota_enriquecida)

        score = clf.get("score_risco", 0)
        if isinstance(score, (int, float)) and score >= 0:
            soma_score += float(score)
            if clf.get("anomalia", "nenhuma") != "nenhuma":
                n_anomalias += 1

    # ── Escrita no GCS ────────────────────────────────────────────────────────
    if resultados:
        _escrever_jsonl_gcs(gcs, blob_path, resultados)

    return len(resultados), n_anomalias, soma_score


# ─────────────────────────────────────────────────────────────────────────────
# Seção 7 — Verificação do Ollama
# ─────────────────────────────────────────────────────────────────────────────

def _verificar_ollama() -> bool:
    """
    Confirma que Ollama está respondendo e que o modelo Gemma está disponível.
    Aborta o script se não estiver.
    """
    try:
        resp = requests.get("http://127.0.0.1:11434/api/tags", timeout=10)
        resp.raise_for_status()
        modelos = [m.get("name", "") for m in resp.json().get("models", [])]
        # Aceita prefixo do nome (ex: gemma2:27b-instruct-q4_K_M)
        gemma_ok = any("gemma2:27b" in m.lower() for m in modelos)
        if not gemma_ok:
            logger.critical(
                "Modelo Gemma 27B não encontrado em Ollama. Modelos disponíveis: %s",
                modelos,
            )
            return False
        logger.info("Ollama OK — modelo '%s' confirmado.", MODEL)
        return True
    except Exception as exc:
        logger.critical("Ollama indisponível em %s: %s", OLLAMA_URL, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Seção 8 — Pipeline principal
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    """
    Pipeline principal do classifier CEAP.

    Retorna código de saída: 0 = sucesso, 1 = erro crítico.
    """
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )
    logger.info(
        "Engine 40 — Gemma CEAP Classifier | anos=%s | limit_por_parlamentar=%s",
        CEAP_YEARS, CEAP_LIMIT_PER_PARLAMENTAR or "sem limite",
    )
    logger.info("Saída GCS: gs://%s/%s/", GCS_CLEAN_BUCKET, GCS_CLEAN_PREFIX)
    logger.info("Log: %s", _LOG_FILE)
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )

    # ── 0. Verifica Ollama ────────────────────────────────────────────────────
    if not _verificar_ollama():
        logger.critical("ABORT: Gemma não disponível. Encerrando engine 40.")
        return 1

    # ── 1. Verifica billing antes de qualquer processamento ───────────────────
    if not check_daily_spend():
        logger.critical("HARD-STOP: limite de gastos diários atingido. Encerrando.")
        return 1

    # ── 2. Carrega notas do BQ (ou fallback GCS) ──────────────────────────────
    ts_inicio = time.time()
    notas = _carregar_notas(CEAP_YEARS)

    if not notas:
        logger.warning(
            "Nenhuma nota CEAP encontrada para os anos %s. "
            "Verifique a tabela '%s' no BigQuery ou os blobs em "
            "gs://%s/%s/*.jsonl.",
            CEAP_YEARS, BQ_TABLE_PRIMARY, GCS_RAW_BUCKET, GCS_RAW_FALLBACK_PREFIX,
        )
        return 0

    # ── 3. Agrupa por parlamentar × ano ──────────────────────────────────────
    grupos = _agrupar_por_parlamentar_ano(notas)
    n_grupos  = len(grupos)
    logger.info("Grupos parlamentar×ano: %d", n_grupos)

    # ── 4. Inicializa cliente GCS (compartilhado entre threads) ──────────────
    gcs = _gcs_client()

    # ── 5. Processa grupos em paralelo (max_workers=4) ────────────────────────
    total_processadas = 0
    total_anomalias   = 0
    soma_scores       = 0.0
    grupos_concluidos = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futuros = {
            executor.submit(_processar_grupo, chave, notas_grupo, gcs): chave
            for chave, notas_grupo in grupos.items()
        }

        for futuro in as_completed(futuros):
            chave = futuros[futuro]
            id_dep, ano = chave
            try:
                n_proc, n_anom, soma_sc = futuro.result()
                total_processadas += n_proc
                total_anomalias   += n_anom
                soma_scores       += soma_sc
                grupos_concluidos += 1

                if n_proc > 0:
                    logger.info(
                        "Grupo concluído: deputado=%s | ano=%d | "
                        "notas=%d | anomalias=%d | score_médio=%.2f",
                        id_dep, ano, n_proc, n_anom,
                        (soma_sc / n_proc) if n_proc else 0.0,
                    )

                # ── Verificação de billing a cada N notas ─────────────────
                if total_processadas > 0 and total_processadas % BILLING_CHECK_INTERVAL == 0:
                    logger.info(
                        "Progresso: %d notas processadas de ~%d grupos (%d/%d grupos). "
                        "Verificando billing...",
                        total_processadas, n_grupos, grupos_concluidos, n_grupos,
                    )
                    if not check_daily_spend():
                        logger.critical(
                            "HARD-STOP billing: encerrando após %d notas.",
                            total_processadas,
                        )
                        # Cancela futuros pendentes
                        for f in futuros:
                            f.cancel()
                        break

            except Exception as exc:
                logger.error(
                    "Erro inesperado no grupo (deputado=%s, ano=%d): %s",
                    id_dep, ano, exc, exc_info=True,
                )

    # ── 6. Estatísticas finais ────────────────────────────────────────────────
    duracao = time.time() - ts_inicio
    score_medio = (soma_scores / total_processadas) if total_processadas > 0 else 0.0

    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )
    logger.info("RELATÓRIO FINAL — Engine 40 Gemma CEAP Classifier")
    logger.info("─────────────────────────────────────────────────────────")
    logger.info("  Total de notas processadas : %d", total_processadas)
    logger.info("  Anomalias detectadas        : %d", total_anomalias)
    logger.info(
        "  Taxa de anomalias           : %.2f%%",
        (total_anomalias / total_processadas * 100) if total_processadas else 0.0,
    )
    logger.info("  Score de risco médio        : %.2f / 10", score_medio)
    logger.info("  Grupos parlamentar×ano      : %d / %d concluídos", grupos_concluidos, n_grupos)
    logger.info("  Duração total               : %.1f s (%.1f min)", duracao, duracao / 60)
    logger.info(
        "  Throughput                  : %.1f notas/s",
        (total_processadas / duracao) if duracao > 0 else 0.0,
    )
    logger.info(
        "  Saída GCS                   : gs://%s/%s/",
        GCS_CLEAN_BUCKET, GCS_CLEAN_PREFIX,
    )
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )

    return 0


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sys.exit(main())
