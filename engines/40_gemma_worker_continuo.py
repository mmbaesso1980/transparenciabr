#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
engines/40_gemma_worker_continuo.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Worker contínuo Gemma 27B — mantém L4 saturada 24/7.

DIRETIVAS IRREVOGÁVEIS:
  - ZERO Firestore. Saída exclusiva GCS (gs://datalake-tbr-clean/).
  - Gemma roda LOCAL via Ollama (http://127.0.0.1:11434). NÃO usa Vertex para inferência.
  - Vertex Gemini Pro usado APENAS para geração de novas tarefas (fila dinâmica), a cada 30min.
  - Loop infinito: nunca termina sozinho. Encerra apenas via SIGTERM ou billing hard-stop.
  - Idempotente: verifica GCS antes de chamar Gemma. Não duplica saída.
  - max_workers adaptativo: 4 em estado normal, 1 durante Fase 5 OCR (PaddleOCR ativo).
  - Hard-stop integrado: respeita billing_guardrail.check_daily_spend() a cada 1000 itens.

ARQUITETURA:
  Thread principal    → main_loop() — itera TAREFAS_BASE + TAREFAS_DINAMICAS
  Thread paralela     → idea_generator_vertex_thread() — consulta Vertex a cada 30min
  ThreadPoolExecutor  → máx. 4 workers (ou 1 se PaddleOCR detectado)

Saída GCS:
  gs://datalake-tbr-clean/ceap_classified/{ano}/{id}/notas.jsonl
  gs://datalake-tbr-clean/ner_ceap/{ano}/{id}/entidades.jsonl
  gs://datalake-tbr-clean/cnpj/qsa_resumos/{cnpj}.json
  gs://datalake-tbr-clean/alertas/round_numbers/{ano}.jsonl
  gs://datalake-tbr-clean/alertas/repeated_amounts/{ano}.jsonl
  gs://datalake-tbr-clean/gemma_worker/vertex_tasks.jsonl  ← tarefas geradas pelo Vertex

Variáveis de ambiente:
  GCS_CLEAN_BUCKET              default: datalake-tbr-clean
  GCS_RAW_BUCKET                default: datalake-tbr-raw
  GCP_PROJECT_ID                default: transparenciabr
  VERTEX_LOCATION               default: us-central1
  VERTEX_MODEL                  default: gemini-2.5-pro
  OLLAMA_URL                    default: http://127.0.0.1:11434
  OLLAMA_MODEL                  default: gemma2:27b-instruct-q4_K_M
  CEAP_LIMIT_PER_PARLAMENTAR    default: "" (sem limite; "100" para teste)
  LOG_LEVEL                     default: INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import re
import signal
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple

# ── Ajuste de path ────────────────────────────────────────────────────────────
_ENG_DIR = Path(__file__).resolve().parent
if str(_ENG_DIR) not in sys.path:
    sys.path.insert(0, str(_ENG_DIR))

from lib.billing_guardrail import check_daily_spend, record_spend
from lib.project_config import gcp_project_id
from lib.ollama_client import OllamaClient, get_client

# ── Logging estruturado ───────────────────────────────────────────────────────
_LOG_DIR = Path.home() / "transparenciabr" / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)
_LOG_FILE = _LOG_DIR / f"gemma_worker_{datetime.date.today().strftime('%Y%m%d')}.log"

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | worker=40_continuo | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(_LOG_FILE), encoding="utf-8"),
    ],
)
logger = logging.getLogger("transparenciabr.worker40")

# ── Constantes ────────────────────────────────────────────────────────────────
GCS_CLEAN_BUCKET  = os.environ.get("GCS_CLEAN_BUCKET", "datalake-tbr-clean")
GCS_RAW_BUCKET    = os.environ.get("GCS_RAW_BUCKET",   "datalake-tbr-raw")
ANOS_CEAP         = list(range(2018, 2027))
BILLING_INTERVAL  = 1000   # verifica billing a cada N itens processados
VERTEX_INTERVAL_S = 1800   # 30min entre consultas Vertex

_LIMIT_STR        = os.environ.get("CEAP_LIMIT_PER_PARLAMENTAR", "").strip()
CEAP_LIMIT: Optional[int] = int(_LIMIT_STR) if _LIMIT_STR else None

# ── Controle de encerramento via SIGTERM ──────────────────────────────────────
_sigterm_recebido = threading.Event()

def _handler_sigterm(signum: int, frame: Any) -> None:
    logger.warning("SIGTERM recebido — encerrando loop após tarefa corrente...")
    _sigterm_recebido.set()

signal.signal(signal.SIGTERM, _handler_sigterm)
signal.signal(signal.SIGINT,  _handler_sigterm)

def recebeu_sigterm() -> bool:
    return _sigterm_recebido.is_set()

# ── Fila dinâmica (alimentada pelo Vertex em thread paralela) ─────────────────
TAREFAS_DINAMICAS: List[Dict[str, Any]] = []
_fila_lock = threading.Lock()

# ── Contador global de itens processados ─────────────────────────────────────
_itens_processados = 0
_itens_lock = threading.Lock()

def _incrementar_itens(n: int = 1) -> int:
    global _itens_processados
    with _itens_lock:
        _itens_processados += n
        return _itens_processados

# ── Índice do ciclo de tarefas base ──────────────────────────────────────────
_ciclo_idx = 0
_ciclo_lock = threading.Lock()

def get_next_idx() -> int:
    global _ciclo_idx
    with _ciclo_lock:
        idx = _ciclo_idx
        _ciclo_idx += 1
        return idx


# ─────────────────────────────────────────────────────────────────────────────
# FILA DE TAREFAS
# ─────────────────────────────────────────────────────────────────────────────

TAREFAS_BASE: List[Dict[str, Any]] = [
    # === CICLO 1: classificações (rápidas, alto volume) ===
    {"tipo": "classify_ceap",          "anos": ANOS_CEAP},
    {"tipo": "ner_ceap_descricao",     "anos": ANOS_CEAP},
    {"tipo": "summarize_qsa",          "fonte": f"gs://{GCS_CLEAN_BUCKET}/cnpj/qsa/"},
    {"tipo": "detect_round_numbers",   "anos": ANOS_CEAP},
    {"tipo": "detect_repeated_amounts","threshold": 3, "anos": ANOS_CEAP},

    # === CICLO 2: análise forense ===
    {"tipo": "detect_nepotismo",       "fontes": ["funcionarios_camara", "senado"]},
    {"tipo": "detect_fracionamento_emendas","fonte": f"gs://{GCS_CLEAN_BUCKET}/emendas/"},
    {"tipo": "detect_ghost_employees", "fontes": ["funcionarios_camara", "senado"]},
    {"tipo": "cross_qsa_emendas",      "anos": list(range(2020, 2027))},
    {"tipo": "cross_ceap_fornecedor_qsa","score_min": 5},

    # === CICLO 3: diários oficiais (após OCR da Fase 5) ===
    {"tipo": "extract_nomeacoes_dou",  "anos": ANOS_CEAP},
    {"tipo": "extract_contratos_dou",  "anos": ANOS_CEAP},
    {"tipo": "extract_sancoes_dou",    "anos": ANOS_CEAP},
    {"tipo": "summarize_loa_2026",     "fonte": f"gs://{GCS_CLEAN_BUCKET}/loa/2026/"},
    {"tipo": "compare_loa_anos",       "anos": list(range(2015, 2027))},

    # === CICLO 4: dossiês ===
    {"tipo": "dossie_curto",           "fonte": f"gs://{GCS_CLEAN_BUCKET}/universe/roster.json"},
    {"tipo": "dossie_longo_top100",    "criterio": "score_risco_total"},
    {"tipo": "redes_aliancas",         "fonte": "votacoes_camara"},
    {"tipo": "perfil_discurso",        "limite": 10000},

    # === CICLO 5: cruzamentos internacionais ===
    {"tipo": "match_ofac_cnpj",        "fonte": "ofac_sdn"},
    {"tipo": "match_opensanctions_politicos","fonte": "opensanctions"},
    {"tipo": "match_sec_empresas_br",  "fonte": "sec_edgar"},

    # === CICLO 6: re-classificação e geração editorial ===
    {"tipo": "classify_ceap_v2",       "anos": ANOS_CEAP},
    {"tipo": "generate_audit_questions","score_min": 5},
    {"tipo": "generate_news_leads",    "criterio": "anomalias_top"},
]


def get_next_task() -> Dict[str, Any]:
    """
    Retorna a próxima tarefa: prioriza TAREFAS_DINAMICAS (idéias frescas do Vertex);
    quando vazia, itera TAREFAS_BASE em ciclo infinito.
    """
    with _fila_lock:
        if TAREFAS_DINAMICAS:
            tarefa = TAREFAS_DINAMICAS.pop(0)
            logger.info("Próxima tarefa (Vertex): tipo=%s", tarefa.get("tipo"))
            return tarefa
    idx = get_next_idx() % len(TAREFAS_BASE)
    tarefa = TAREFAS_BASE[idx]
    logger.info(
        "Próxima tarefa (base [%d/%d]): tipo=%s",
        idx + 1, len(TAREFAS_BASE), tarefa.get("tipo"),
    )
    return tarefa


# ─────────────────────────────────────────────────────────────────────────────
# Seção 1 — Clientes GCP (lazy)
# ─────────────────────────────────────────────────────────────────────────────

def _gcs() -> Any:
    from google.cloud import storage  # type: ignore
    return storage.Client()

def _bq() -> Any:
    from google.cloud import bigquery  # type: ignore
    return bigquery.Client(project=gcp_project_id())

def _gcs_blob_existe(bucket_name: str, blob_path: str) -> bool:
    """Verifica existência de blob GCS sem lançar exceção."""
    try:
        gcs    = _gcs()
        bucket = gcs.bucket(bucket_name)
        return bucket.blob(blob_path).exists()
    except Exception as exc:
        logger.warning("gcs_blob_existe('%s'): %s", blob_path, exc)
        return False

def _gcs_contar_linhas(bucket_name: str, blob_path: str) -> int:
    """Retorna número de linhas JSONL no blob; -1 se não existir."""
    try:
        gcs     = _gcs()
        bucket  = gcs.bucket(bucket_name)
        blob    = bucket.blob(blob_path)
        if not blob.exists():
            return -1
        conteudo = blob.download_as_text(encoding="utf-8")
        return sum(1 for l in conteudo.splitlines() if l.strip())
    except Exception as exc:
        logger.warning("gcs_contar_linhas('%s'): %s", blob_path, exc)
        return -1

def _gcs_escrever_jsonl(bucket_name: str, blob_path: str, linhas: List[Dict]) -> None:
    """Escreve lista de dicts como JSONL no GCS (sobrescreve)."""
    conteudo = "\n".join(json.dumps(l, ensure_ascii=False) for l in linhas) + "\n"
    gcs      = _gcs()
    bucket   = gcs.bucket(bucket_name)
    blob     = bucket.blob(blob_path)
    blob.upload_from_string(conteudo.encode("utf-8"), content_type="application/x-ndjson")
    logger.debug("GCS escrito: gs://%s/%s (%d linhas)", bucket_name, blob_path, len(linhas))

def _gcs_escrever_json(bucket_name: str, blob_path: str, obj: Dict) -> None:
    """Escreve um dict como JSON no GCS."""
    conteudo = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    gcs      = _gcs()
    bucket   = gcs.bucket(bucket_name)
    blob     = bucket.blob(blob_path)
    blob.upload_from_string(conteudo, content_type="application/json")
    logger.debug("GCS escrito: gs://%s/%s", bucket_name, blob_path)


# ─────────────────────────────────────────────────────────────────────────────
# Seção 2 — Detecção de carga da GPU (cede VRAM ao PaddleOCR na Fase 5)
# ─────────────────────────────────────────────────────────────────────────────

def _detectar_paddleocr_ativo() -> bool:
    """
    Detecta se a Fase 5 OCR (PaddleOCR) está rodando.
    Se ativa, reduz max_workers para 1 e cede VRAM ao OCR.
    """
    try:
        import psutil  # type: ignore
        for proc in psutil.process_iter(["cmdline"]):
            try:
                cmdline = " ".join(proc.info.get("cmdline") or [])
                if "paddleocr" in cmdline.lower() or "paddle" in cmdline.lower():
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return False
    except ImportError:
        # psutil não instalado: assume que OCR não está ativo
        return False

def _workers_adaptativos() -> int:
    """
    Retorna número de workers para ThreadPoolExecutor.
    4 em operação normal; 1 se PaddleOCR detectado (cede VRAM).
    """
    if _detectar_paddleocr_ativo():
        logger.warning(
            "PaddleOCR detectado na Fase 5 — reduzindo para max_workers=1 "
            "(cedendo VRAM ao OCR)."
        )
        return 1
    return 4


# ─────────────────────────────────────────────────────────────────────────────
# Seção 3 — Leitura de dados CEAP do BigQuery
# ─────────────────────────────────────────────────────────────────────────────

_BQ_TABLE_PRIMARY  = "transparenciabr.ceap_despesas"
_BQ_TABLE_FALLBACK = "basedosdados.br_camara_dados_abertos.despesa"

def _carregar_ceap_bq(anos: List[int]) -> List[Dict[str, Any]]:
    """
    Lê notas CEAP do BigQuery com fallback automático.
    Tenta tabela primária; em caso de falha ou resultado vazio usa fallback basedosdados.
    """
    anos_str = ", ".join(str(a) for a in anos)

    consultas = [
        (
            _BQ_TABLE_PRIMARY,
            f"""
            SELECT
                CAST(id_deputado       AS STRING) AS id_deputado,
                CAST(nome_deputado     AS STRING) AS nome_deputado,
                CAST(partido           AS STRING) AS partido,
                CAST(uf                AS STRING) AS uf,
                CAST(ano               AS INT64)  AS ano,
                CAST(mes               AS INT64)  AS mes,
                CAST(tipo_despesa      AS STRING) AS tipo_despesa,
                CAST(fornecedor        AS STRING) AS fornecedor,
                CAST(cnpj_fornecedor   AS STRING) AS cnpj_fornecedor,
                CAST(valor_liquido     AS FLOAT64)AS valor_liquido,
                CAST(data_emissao      AS STRING) AS data_emissao,
                COALESCE(CAST(descricao AS STRING), '') AS descricao
            FROM `{_BQ_TABLE_PRIMARY}`
            WHERE CAST(ano AS INT64) IN ({anos_str})
            ORDER BY id_deputado, ano, mes
            """,
        ),
        (
            _BQ_TABLE_FALLBACK,
            f"""
            SELECT
                CAST(id_deputado          AS STRING) AS id_deputado,
                CAST(nome_parlamentar     AS STRING) AS nome_deputado,
                CAST(sigla_partido        AS STRING) AS partido,
                CAST(sigla_uf             AS STRING) AS uf,
                CAST(ano                  AS INT64)  AS ano,
                CAST(mes                  AS INT64)  AS mes,
                CAST(tipo_despesa         AS STRING) AS tipo_despesa,
                CAST(nome_fornecedor      AS STRING) AS fornecedor,
                CAST(cnpj_cpf_fornecedor  AS STRING) AS cnpj_fornecedor,
                CAST(valor_liquido        AS FLOAT64)AS valor_liquido,
                CAST(data_emissao         AS STRING) AS data_emissao,
                '' AS descricao
            FROM `{_BQ_TABLE_FALLBACK}`
            WHERE CAST(ano AS INT64) IN ({anos_str})
            ORDER BY id_deputado, ano, mes
            """,
        ),
    ]

    bq = _bq()
    for tabela, query in consultas:
        try:
            logger.info("BQ: consultando '%s' anos=%s...", tabela, anos)
            df = bq.query(query).to_dataframe()
            if df.empty:
                logger.warning("BQ '%s': resultado vazio. Tentando fallback.", tabela)
                continue
            logger.info("BQ '%s': %d notas carregadas.", tabela, len(df))
            return df.to_dict("records")
        except Exception as exc:
            logger.warning("BQ '%s': falha — %s. Tentando fallback.", tabela, exc)

    logger.error(
        "Todas as fontes BQ indisponíveis. "
        "Verifique permissões e se transparenciabr.ceap_despesas foi criada."
    )
    # Anti-loop-vazio: se BQ totalmente indisponível, dorme 5min antes de tentar de novo.
    # Sem isso o worker entra em loop rápido consumindo CPU à toa.
    logger.warning("Dormindo 300s para evitar loop vazio. Reduzir intervalo só quando BQ estiver populada.")
    time.sleep(300)
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Seção 4 — Handler 1: classify_ceap (COMPLETO)
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_CLASSIFY_CEAP = """\
Você é um auditor público brasileiro. Analise esta nota fiscal de CEAP \
(Cota para Exercício da Atividade Parlamentar).

Parlamentar: {nome} ({partido}/{uf})
Tipo de despesa: {tipo}
Fornecedor: {fornecedor} (CNPJ {cnpj})
Valor: R$ {valor}
Data: {data}
Descrição: {descricao}

Classifique em JSON estrito (sem markdown):
{{
  "categoria": "<combustivel|hospedagem|divulgacao|alimentacao|transporte|consultoria|escritorio|telefonia|outros>",
  "anomalia": "<nenhuma|valor_atipico|fornecedor_suspeito|fracionamento|repeticao|round_number>",
  "score_risco": <0-10>,
  "justificativa": "<frase única em PT-BR explicando o score>"
}}\
"""

def _classify_ceap_nota(nota: Dict, cliente: OllamaClient) -> Dict:
    """Classifica uma nota CEAP individual via Gemma."""
    def s(k: str, d: str = "") -> str:
        v = nota.get(k, d)
        return str(v).strip() if v is not None else d

    prompt = _PROMPT_CLASSIFY_CEAP.format(
        nome      = s("nome_deputado", "Desconhecido"),
        partido   = s("partido", "?"),
        uf        = s("uf", "?"),
        tipo      = s("tipo_despesa", "Não informado"),
        fornecedor= s("fornecedor", "Não informado"),
        cnpj      = s("cnpj_fornecedor", ""),
        valor     = f"{float(nota.get('valor_liquido', 0.0) or 0.0):.2f}",
        data      = s("data_emissao", "?"),
        descricao = s("descricao", ""),
    )
    try:
        return cliente.generate_json(prompt)
    except Exception as exc:
        logger.warning("classify_ceap: erro Gemma — %s", exc)
        return {"categoria": "outros", "anomalia": "nenhuma", "score_risco": -1,
                "justificativa": f"Erro: {exc}"}


def _handler_classify_ceap(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Handler classify_ceap:
      1. Carrega notas do BQ.
      2. Agrupa por (id_deputado, ano).
      3. Verifica idempotência GCS.
      4. Classifica via Gemma em paralelo (ThreadPoolExecutor).
      5. Escreve JSONL no GCS.
    """
    anos   = tarefa.get("anos", ANOS_CEAP)
    notas  = _carregar_ceap_bq(anos)
    if not notas:
        logger.warning("classify_ceap: sem notas para anos=%s.", anos)
        return 0

    # Agrupa por (id_deputado, ano)
    grupos: Dict[Tuple, List[Dict]] = defaultdict(list)
    for nota in notas:
        chave = (str(nota.get("id_deputado", "x")), int(nota.get("ano", 0)))
        grupos[chave].append(nota)

    total = 0
    max_w = _workers_adaptativos()

    def _processar_grupo(chave: Tuple, notas_g: List[Dict]) -> int:
        id_dep, ano = chave
        if CEAP_LIMIT:
            notas_g = notas_g[:CEAP_LIMIT]
        blob_path = f"ceap_classified/{ano}/{id_dep}/notas.jsonl"
        n_gcs = _gcs_contar_linhas(GCS_CLEAN_BUCKET, blob_path)
        if n_gcs == len(notas_g) and n_gcs > 0:
            logger.debug("classify_ceap: pula (idempotente) %s/%s", ano, id_dep)
            return 0
        resultados = []
        for nota in notas_g:
            clf = _classify_ceap_nota(nota, cliente)
            resultados.append({**nota, "classificacao_gemma": clf})
        if resultados:
            _gcs_escrever_jsonl(GCS_CLEAN_BUCKET, blob_path, resultados)
        return len(resultados)

    with ThreadPoolExecutor(max_workers=max_w) as ex:
        futuros = {ex.submit(_processar_grupo, ch, ng): ch for ch, ng in grupos.items()}
        for fut in as_completed(futuros):
            if recebeu_sigterm():
                break
            try:
                total += fut.result()
                n = _incrementar_itens(fut.result() if fut.result() > 0 else 0)
                if n > 0 and n % BILLING_INTERVAL == 0:
                    if not check_daily_spend():
                        logger.critical("HARD-STOP billing durante classify_ceap.")
                        _sigterm_recebido.set()
                        break
            except Exception as exc:
                logger.error("classify_ceap: erro grupo %s: %s", futuros[fut], exc)

    logger.info("classify_ceap: %d notas escritas no GCS.", total)
    record_spend("gemma27b_classify_ceap", 0.0)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Seção 5 — Handler 2: ner_ceap_descricao (COMPLETO)
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_NER = """\
Você é um analista forense. Extraia entidades nomeadas desta descrição de despesa CEAP.

Parlamentar: {nome} ({partido}/{uf}) | Ano: {ano}
Fornecedor: {fornecedor} | Valor: R$ {valor}
Descrição: {descricao}

Retorne JSON estrito (sem markdown):
{{
  "pessoas": ["<nome completo>"],
  "empresas": ["<nome empresa>"],
  "cnpjs": ["<xx.xxx.xxx/xxxx-xx>"],
  "cpfs": ["<xxx.xxx.xxx-xx>"],
  "valores": [<float>],
  "datas": ["<YYYY-MM-DD>"],
  "locais": ["<cidade/estado>"],
  "palavras_chave": ["<termo relevante>"]
}}\
"""

def _handler_ner_ceap_descricao(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Handler NER:
      - Extrai entidades nomeadas das descrições das notas CEAP.
      - Saída: gs://datalake-tbr-clean/ner_ceap/{ano}/{id}/entidades.jsonl
    """
    anos  = tarefa.get("anos", ANOS_CEAP)
    notas = _carregar_ceap_bq(anos)
    if not notas:
        return 0

    # Filtra notas com descrição não vazia
    notas_com_desc = [n for n in notas if str(n.get("descricao", "")).strip()]
    if not notas_com_desc:
        logger.warning("ner_ceap: nenhuma nota com campo 'descricao' preenchido.")
        return 0

    grupos: Dict[Tuple, List[Dict]] = defaultdict(list)
    for nota in notas_com_desc:
        chave = (str(nota.get("id_deputado", "x")), int(nota.get("ano", 0)))
        grupos[chave].append(nota)

    total = 0
    max_w = _workers_adaptativos()

    def _processar_ner(chave: Tuple, notas_g: List[Dict]) -> int:
        id_dep, ano = chave
        if CEAP_LIMIT:
            notas_g = notas_g[:CEAP_LIMIT]
        blob_path = f"ner_ceap/{ano}/{id_dep}/entidades.jsonl"
        n_gcs = _gcs_contar_linhas(GCS_CLEAN_BUCKET, blob_path)
        if n_gcs == len(notas_g) and n_gcs > 0:
            return 0

        resultados = []
        for nota in notas_g:
            def s(k: str, d: str = "") -> str:
                v = nota.get(k, d)
                return str(v).strip() if v is not None else d

            prompt = _PROMPT_NER.format(
                nome      = s("nome_deputado", "?"),
                partido   = s("partido", "?"),
                uf        = s("uf", "?"),
                ano       = nota.get("ano", "?"),
                fornecedor= s("fornecedor", ""),
                valor     = f"{float(nota.get('valor_liquido', 0.0) or 0.0):.2f}",
                descricao = s("descricao", ""),
            )
            try:
                entidades = cliente.generate_json(prompt)
            except Exception as exc:
                logger.warning("ner_ceap: erro Gemma — %s", exc)
                entidades = {}
            resultados.append({
                "id_deputado":  nota.get("id_deputado"),
                "ano":          nota.get("ano"),
                "mes":          nota.get("mes"),
                "fornecedor":   nota.get("fornecedor"),
                "valor_liquido":nota.get("valor_liquido"),
                "entidades":    entidades,
            })

        if resultados:
            _gcs_escrever_jsonl(GCS_CLEAN_BUCKET, blob_path, resultados)
        return len(resultados)

    with ThreadPoolExecutor(max_workers=max_w) as ex:
        futuros = {ex.submit(_processar_ner, ch, ng): ch for ch, ng in grupos.items()}
        for fut in as_completed(futuros):
            if recebeu_sigterm():
                break
            try:
                n = fut.result()
                total += n
                _incrementar_itens(n)
            except Exception as exc:
                logger.error("ner_ceap: erro grupo %s: %s", futuros[fut], exc)

    logger.info("ner_ceap: %d registros de entidades escritos.", total)
    record_spend("gemma27b_ner_ceap", 0.0)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Seção 6 — Handler 3: summarize_qsa (COMPLETO)
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_QSA = """\
Você é um analista forense de dados empresariais brasileiros.
Analise o Quadro de Sócios e Administradores (QSA) desta empresa.

CNPJ: {cnpj}
Razão Social: {razao_social}
Situação: {situacao}
Atividade Principal: {atividade}
Capital Social: R$ {capital}
Sócios/Administradores:
{socios_text}

Gere resumo em JSON estrito (sem markdown):
{{
  "perfil": "<descricao factual em 1 frase>",
  "total_socios": <int>,
  "socios_pessoa_fisica": <int>,
  "socios_pessoa_juridica": <int>,
  "possui_socio_estrangeiro": <true|false>,
  "capital_concentrado": <true|false>,
  "flags_risco": ["<flag>"],
  "score_opacidade": <0-10>,
  "justificativa": "<frase>"
}}\
"""

def _handler_summarize_qsa(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Handler QSA:
      - Lê blobs JSONL de gs://datalake-tbr-clean/cnpj/qsa/*.jsonl
      - Para cada empresa, gera resumo via Gemma.
      - Saída: gs://datalake-tbr-clean/cnpj/qsa_resumos/{cnpj}.json
      (Idempotente: verifica se resumo já existe antes de chamar Gemma.)
    """
    gcs_prefix = "cnpj/qsa"
    out_prefix = "cnpj/qsa_resumos"
    gcs_client = _gcs()
    bucket     = gcs_client.bucket(GCS_CLEAN_BUCKET)
    blobs      = list(bucket.list_blobs(prefix=gcs_prefix))

    if not blobs:
        logger.warning("summarize_qsa: nenhum blob em gs://%s/%s/", GCS_CLEAN_BUCKET, gcs_prefix)
        return 0

    total   = 0
    max_w   = _workers_adaptativos()
    empresas: List[Dict] = []

    for blob in blobs:
        if not blob.name.endswith(".jsonl"):
            continue
        try:
            for linha in blob.download_as_text(encoding="utf-8").splitlines():
                if linha.strip():
                    empresas.append(json.loads(linha))
        except Exception as exc:
            logger.warning("summarize_qsa: erro lendo blob '%s': %s", blob.name, exc)

    if not empresas:
        logger.warning("summarize_qsa: nenhuma empresa extraída dos blobs.")
        return 0

    logger.info("summarize_qsa: %d empresas a analisar.", len(empresas))

    def _resumir_empresa(empresa: Dict) -> int:
        cnpj = str(empresa.get("cnpj", empresa.get("nu_cnpj", "sem_cnpj"))).strip()
        cnpj_clean = re.sub(r"\D", "", cnpj)
        blob_out   = f"{out_prefix}/{cnpj_clean}.json"
        if _gcs_blob_existe(GCS_CLEAN_BUCKET, blob_out):
            return 0

        socios = empresa.get("socios", empresa.get("qsa", []))
        socios_text = "\n".join(
            f"  - {s.get('nome_socio', s.get('nm_socio', '?'))} | "
            f"Qualificação: {s.get('qualificacao_socio', '?')} | "
            f"CPF/CNPJ: {s.get('cpf_representante_legal', s.get('nu_cpf_cnpj', '?'))}"
            for s in (socios if isinstance(socios, list) else [])
        ) or "  (sem sócios cadastrados)"

        prompt = _PROMPT_QSA.format(
            cnpj       = cnpj,
            razao_social=str(empresa.get("razao_social", empresa.get("nm_razao_social", "?"))),
            situacao   = str(empresa.get("situacao_cadastral", "?")),
            atividade  = str(empresa.get("cnae_fiscal_descricao", empresa.get("de_cnae_fiscal", "?"))),
            capital    = f"{float(empresa.get('capital_social', 0.0) or 0.0):.2f}",
            socios_text= socios_text,
        )
        try:
            resumo = cliente.generate_json(prompt)
        except Exception as exc:
            logger.warning("summarize_qsa: erro Gemma CNPJ=%s — %s", cnpj, exc)
            return 0

        saida = {
            "cnpj": cnpj,
            "cnpj_numerico": cnpj_clean,
            "razao_social": empresa.get("razao_social", empresa.get("nm_razao_social", "")),
            "resumo_gemma": resumo,
            "ts_processado": datetime.datetime.utcnow().isoformat() + "Z",
        }
        _gcs_escrever_json(GCS_CLEAN_BUCKET, blob_out, saida)
        return 1

    with ThreadPoolExecutor(max_workers=max_w) as ex:
        futuros = [ex.submit(_resumir_empresa, e) for e in empresas]
        for fut in as_completed(futuros):
            if recebeu_sigterm():
                break
            try:
                total += fut.result()
                _incrementar_itens(1)
                if _itens_processados % BILLING_INTERVAL == 0:
                    if not check_daily_spend():
                        logger.critical("HARD-STOP billing durante summarize_qsa.")
                        _sigterm_recebido.set()
                        break
            except Exception as exc:
                logger.error("summarize_qsa: erro futuro: %s", exc)

    logger.info("summarize_qsa: %d resumos escritos.", total)
    record_spend("gemma27b_qsa", 0.0)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Seção 7 — Handler 4: detect_round_numbers (COMPLETO)
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_ROUND = """\
Você é auditor forense. Esta lista contém despesas CEAP com valores redondos \
(múltiplos de R$100, R$500 ou R$1000) de um mesmo parlamentar em um ano.

Parlamentar: {nome} ({partido}/{uf}) | Ano: {ano}
Total de notas round-number: {total}
Soma total: R$ {soma:.2f}
Fornecedores envolvidos: {fornecedores}

Amostras (até 10):
{amostras}

Analise em JSON estrito (sem markdown):
{{
  "padrao_detectado": "<descricao factual do padrão>",
  "risco_fracionamento": <true|false>,
  "score_suspeita": <0-10>,
  "recomendacao": "<ação de auditoria sugerida>"
}}\
"""

def _handler_detect_round_numbers(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Handler detect_round_numbers:
      - Filtra notas CEAP com valores redondos (múltiplos de 100).
      - Agrupa por parlamentar × ano.
      - Gera análise de padrão via Gemma.
      - Saída: gs://datalake-tbr-clean/alertas/round_numbers/{ano}/{id}.json
    """
    anos  = tarefa.get("anos", ANOS_CEAP)
    notas = _carregar_ceap_bq(anos)
    if not notas:
        return 0

    # Filtra valores redondos (múltiplos de 100 >= 100)
    notas_round = [
        n for n in notas
        if (v := float(n.get("valor_liquido") or 0.0)) >= 100.0
        and abs(v % 100.0) < 0.01
    ]
    if not notas_round:
        logger.info("detect_round_numbers: nenhuma nota com valor redondo encontrada.")
        return 0

    logger.info("detect_round_numbers: %d notas com valor redondo.", len(notas_round))

    grupos: Dict[Tuple, List[Dict]] = defaultdict(list)
    for nota in notas_round:
        chave = (str(nota.get("id_deputado", "x")), int(nota.get("ano", 0)))
        grupos[chave].append(nota)

    total = 0

    def _analisar_grupo(chave: Tuple, notas_g: List[Dict]) -> int:
        id_dep, ano = chave
        blob_path   = f"alertas/round_numbers/{ano}/{id_dep}.json"
        if _gcs_blob_existe(GCS_CLEAN_BUCKET, blob_path):
            return 0

        soma        = sum(float(n.get("valor_liquido") or 0.0) for n in notas_g)
        fornecedores= list({str(n.get("fornecedor", "?")) for n in notas_g})[:10]
        amostras    = "\n".join(
            f"  R$ {float(n.get('valor_liquido', 0.0) or 0.0):.2f} | {n.get('fornecedor','?')} | {n.get('tipo_despesa','?')}"
            for n in notas_g[:10]
        )
        nome = str(notas_g[0].get("nome_deputado", "?"))
        partido = str(notas_g[0].get("partido", "?"))
        uf  = str(notas_g[0].get("uf", "?"))

        prompt = _PROMPT_ROUND.format(
            nome=nome, partido=partido, uf=uf, ano=ano,
            total=len(notas_g), soma=soma,
            fornecedores=", ".join(fornecedores),
            amostras=amostras,
        )
        try:
            analise = cliente.generate_json(prompt)
        except Exception as exc:
            logger.warning("detect_round_numbers: erro Gemma %s/%s — %s", ano, id_dep, exc)
            return 0

        saida = {
            "id_deputado": id_dep,
            "nome":        nome,
            "partido":     partido,
            "uf":          uf,
            "ano":         ano,
            "total_notas_round": len(notas_g),
            "soma_total":  soma,
            "analise_gemma": analise,
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
        }
        _gcs_escrever_json(GCS_CLEAN_BUCKET, blob_path, saida)
        return 1

    max_w = _workers_adaptativos()
    with ThreadPoolExecutor(max_workers=max_w) as ex:
        futuros = {ex.submit(_analisar_grupo, ch, ng): ch for ch, ng in grupos.items()}
        for fut in as_completed(futuros):
            if recebeu_sigterm():
                break
            try:
                total += fut.result()
                _incrementar_itens(1)
            except Exception as exc:
                logger.error("round_numbers: erro grupo %s: %s", futuros[fut], exc)

    logger.info("detect_round_numbers: %d alertas escritos.", total)
    record_spend("gemma27b_round_numbers", 0.0)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Seção 8 — Handler 5: detect_repeated_amounts (COMPLETO)
# ─────────────────────────────────────────────────────────────────────────────

_PROMPT_REPETICAO = """\
Você é auditor forense especializado em CEAP. O seguinte parlamentar realizou \
{total_repeticoes} pagamentos ao mesmo fornecedor com valores idênticos ou \
muito próximos (diferença < R$1,00) em {ano}.

Parlamentar: {nome} ({partido}/{uf})
Fornecedor: {fornecedor} (CNPJ {cnpj})
Valor repetido: R$ {valor:.2f}
Ocorrências: {ocorrencias}
Datas: {datas}

Análise em JSON estrito (sem markdown):
{{
  "hipotese_principal": "<fracionamento|duplicidade|contrato_parcelado|uso_legitimo|inconclusivo>",
  "score_risco": <0-10>,
  "evidencias": ["<fato observado>"],
  "justificativa": "<frase técnica em PT-BR>"
}}\
"""

def _handler_detect_repeated_amounts(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Handler detect_repeated_amounts:
      - Detecta valores idênticos (ou ≈ idênticos) ao mesmo fornecedor no mesmo ano.
      - threshold: mínimo de repetições para alertar.
      - Saída: gs://datalake-tbr-clean/alertas/repeated_amounts/{ano}/{id}/{cnpj_hash}.json
    """
    anos      = tarefa.get("anos", ANOS_CEAP)
    threshold = int(tarefa.get("threshold", 3))
    notas     = _carregar_ceap_bq(anos)
    if not notas:
        return 0

    # Agrupa por (id_deputado, ano, cnpj_fornecedor, valor_arredondado)
    AgrupKey = Tuple[str, int, str, float]
    grupos_rep: Dict[AgrupKey, List[Dict]] = defaultdict(list)
    for nota in notas:
        val   = round(float(nota.get("valor_liquido") or 0.0), 2)
        cnpj  = str(nota.get("cnpj_fornecedor") or "")
        chave = (
            str(nota.get("id_deputado", "x")),
            int(nota.get("ano", 0)),
            cnpj,
            val,
        )
        grupos_rep[chave].append(nota)

    # Filtra apenas grupos com repetições acima do threshold
    alertas = {k: v for k, v in grupos_rep.items() if len(v) >= threshold}
    if not alertas:
        logger.info("detect_repeated_amounts: nenhuma repetição >= %d.", threshold)
        return 0

    logger.info("detect_repeated_amounts: %d combinações com repetição detectada.", len(alertas))

    total = 0

    def _analisar_repeticao(chave: AgrupKey, notas_g: List[Dict]) -> int:
        id_dep, ano, cnpj, valor = chave
        import hashlib
        cnpj_hash = hashlib.md5(cnpj.encode()).hexdigest()[:12]
        blob_path = f"alertas/repeated_amounts/{ano}/{id_dep}/{cnpj_hash}.json"
        if _gcs_blob_existe(GCS_CLEAN_BUCKET, blob_path):
            return 0

        nome       = str(notas_g[0].get("nome_deputado", "?"))
        partido    = str(notas_g[0].get("partido", "?"))
        uf         = str(notas_g[0].get("uf", "?"))
        fornecedor = str(notas_g[0].get("fornecedor", "?"))
        datas      = sorted({str(n.get("data_emissao", "?")) for n in notas_g})

        prompt = _PROMPT_REPETICAO.format(
            nome=nome, partido=partido, uf=uf, ano=ano,
            fornecedor=fornecedor, cnpj=cnpj,
            valor=valor,
            total_repeticoes=len(notas_g),
            ocorrencias=len(notas_g),
            datas=", ".join(datas[:10]),
        )
        try:
            analise = cliente.generate_json(prompt)
        except Exception as exc:
            logger.warning("repeated_amounts: erro Gemma %s/%s/%s — %s", ano, id_dep, cnpj, exc)
            return 0

        saida = {
            "id_deputado":    id_dep,
            "nome":           nome,
            "partido":        partido,
            "uf":             uf,
            "ano":            ano,
            "cnpj_fornecedor":cnpj,
            "fornecedor":     fornecedor,
            "valor_repetido": valor,
            "ocorrencias":    len(notas_g),
            "datas":          datas,
            "analise_gemma":  analise,
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
        }
        _gcs_escrever_json(GCS_CLEAN_BUCKET, blob_path, saida)
        return 1

    max_w = _workers_adaptativos()
    with ThreadPoolExecutor(max_workers=max_w) as ex:
        futuros = {ex.submit(_analisar_repeticao, ch, ng): ch for ch, ng in alertas.items()}
        for fut in as_completed(futuros):
            if recebeu_sigterm():
                break
            try:
                total += fut.result()
                _incrementar_itens(1)
            except Exception as exc:
                logger.error("repeated_amounts: erro futuro: %s", exc)

    logger.info("detect_repeated_amounts: %d alertas escritos.", total)
    record_spend("gemma27b_repeated_amounts", 0.0)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Seção 9 — Stubs (handlers 6-25)
# ─────────────────────────────────────────────────────────────────────────────

def _stub_handler(tarefa: Dict, cliente: OllamaClient, nome: str) -> int:
    # Anti-loop-vazio: stubs DORMEM 30s pra não saturar logs e não mascarar trabalho real.
    # Quando Vertex implementa o handler, esta linha desaparece naturalmente.
    time.sleep(30)
    """Stub genérico: registra a tarefa e aguarda implementação futura (gerada pelo Vertex)."""
    logger.info(
        "STUB '%s': tarefa recebida mas não implementada. "
        "Vertex gerará implementação completa. tarefa=%s",
        nome, json.dumps(tarefa, ensure_ascii=False)[:200],
    )
    return 0

def _handler_detect_nepotismo(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "detect_nepotismo")

def _handler_detect_fracionamento_emendas(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "detect_fracionamento_emendas")

def _handler_detect_ghost_employees(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "detect_ghost_employees")

def _handler_cross_qsa_emendas(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "cross_qsa_emendas")

def _handler_cross_ceap_fornecedor_qsa(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "cross_ceap_fornecedor_qsa")

def _handler_extract_nomeacoes_dou(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "extract_nomeacoes_dou")

def _handler_extract_contratos_dou(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "extract_contratos_dou")

def _handler_extract_sancoes_dou(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "extract_sancoes_dou")

def _handler_summarize_loa_2026(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "summarize_loa_2026")

def _handler_compare_loa_anos(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "compare_loa_anos")

def _handler_dossie_curto(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "dossie_curto")

def _handler_dossie_longo_top100(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "dossie_longo_top100")

def _handler_redes_aliancas(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "redes_aliancas")

def _handler_perfil_discurso(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "perfil_discurso")

def _handler_match_ofac_cnpj(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "match_ofac_cnpj")

def _handler_match_opensanctions_politicos(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "match_opensanctions_politicos")

def _handler_match_sec_empresas_br(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "match_sec_empresas_br")

def _handler_classify_ceap_v2(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "classify_ceap_v2")

def _handler_generate_audit_questions(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "generate_audit_questions")

def _handler_generate_news_leads(t: Dict, c: OllamaClient) -> int:
    return _stub_handler(t, c, "generate_news_leads")


# ── Roteador de handlers ──────────────────────────────────────────────────────
_HANDLERS: Dict[str, Callable[[Dict, OllamaClient], int]] = {
    "classify_ceap":               _handler_classify_ceap,
    "ner_ceap_descricao":          _handler_ner_ceap_descricao,
    "summarize_qsa":               _handler_summarize_qsa,
    "detect_round_numbers":        _handler_detect_round_numbers,
    "detect_repeated_amounts":     _handler_detect_repeated_amounts,
    "detect_nepotismo":            _handler_detect_nepotismo,
    "detect_fracionamento_emendas":_handler_detect_fracionamento_emendas,
    "detect_ghost_employees":      _handler_detect_ghost_employees,
    "cross_qsa_emendas":           _handler_cross_qsa_emendas,
    "cross_ceap_fornecedor_qsa":   _handler_cross_ceap_fornecedor_qsa,
    "extract_nomeacoes_dou":       _handler_extract_nomeacoes_dou,
    "extract_contratos_dou":       _handler_extract_contratos_dou,
    "extract_sancoes_dou":         _handler_extract_sancoes_dou,
    "summarize_loa_2026":          _handler_summarize_loa_2026,
    "compare_loa_anos":            _handler_compare_loa_anos,
    "dossie_curto":                _handler_dossie_curto,
    "dossie_longo_top100":         _handler_dossie_longo_top100,
    "redes_aliancas":              _handler_redes_aliancas,
    "perfil_discurso":             _handler_perfil_discurso,
    "match_ofac_cnpj":             _handler_match_ofac_cnpj,
    "match_opensanctions_politicos":_handler_match_opensanctions_politicos,
    "match_sec_empresas_br":       _handler_match_sec_empresas_br,
    "classify_ceap_v2":            _handler_classify_ceap_v2,
    "generate_audit_questions":    _handler_generate_audit_questions,
    "generate_news_leads":         _handler_generate_news_leads,
}


def _executar_tarefa(tarefa: Dict, cliente: OllamaClient) -> int:
    """
    Despacha uma tarefa para o handler correspondente.
    Tarefas dinâmicas geradas pelo Vertex (tipo não registrado) são executadas
    como stubs e logadas para implementação posterior.
    """
    tipo = tarefa.get("tipo", "")
    handler = _HANDLERS.get(tipo)
    if handler is None:
        logger.info(
            "Tarefa dinâmica (tipo='%s') não possui handler registrado — "
            "será executada como stub.", tipo,
        )
        return _stub_handler(tarefa, cliente, tipo)
    try:
        logger.info("▶ Iniciando tarefa: tipo=%s", tipo)
        n = handler(tarefa, cliente)
        logger.info("✓ Tarefa concluída: tipo=%s | itens=%d", tipo, n)
        return n
    except Exception as exc:
        logger.error("✗ Erro inesperado na tarefa tipo=%s: %s", tipo, exc, exc_info=True)
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Seção 10 — Thread do gerador de tarefas via Vertex
# ─────────────────────────────────────────────────────────────────────────────

def _contar_artefatos_gcs(prefixo: str, extensao: str = ".jsonl") -> int:
    """Conta blobs em um prefixo GCS (para estatísticas do prompt Vertex)."""
    try:
        gcs    = _gcs()
        bucket = gcs.bucket(GCS_CLEAN_BUCKET)
        return sum(1 for b in bucket.list_blobs(prefix=prefixo) if b.name.endswith(extensao))
    except Exception:
        return 0

_PROMPT_VERTEX_IDEIAS = """\
Você é o estrategista-chefe do TransparênciaBR, plataforma de auditoria de \
dados públicos brasileiros baseada em IA.

Estado atual do Data Lake (atualizado agora):
- {n_ceap} arquivos de notas CEAP classificadas
- {n_ner} arquivos de extração NER de descrições CEAP
- {n_qsa} resumos QSA de empresas gerados
- {n_alertas_round} alertas de valores redondos
- {n_alertas_rep} alertas de valores repetidos

Tarefas já na fila (não repita):
{fila_atual}

Regras inegociáveis:
1. Análises NEUTRAS, FACTUAIS — sem rótulos ideológicos.
2. Use SOMENTE dados disponíveis no Data Lake (paths GCS listados acima).
3. Cada nova tarefa DEVE ser executável por Gemma 27B local (sem acesso externo).
4. Nomes de tipo em snake_case, únicos.

Gere exatamente 5 NOVAS análises forenses em JSON array estrito (sem markdown):
[
  {{
    "tipo": "<snake_case_handler_name>",
    "descricao": "<frase factual de 1 linha descrevendo o que analisa>",
    "input_gcs": "<gs://datalake-tbr-clean/path/glob>",
    "output_gcs": "<gs://datalake-tbr-clean/path/output/>",
    "prompt_template": "<prompt curto para Gemma com placeholders {{campo}}>",
    "prioridade": <1-5>
  }}
]
"""

def idea_generator_vertex_thread() -> None:
    """
    Thread paralela: consulta Vertex Gemini Pro a cada 30min para gerar
    novas tarefas de análise. Adiciona à TAREFAS_DINAMICAS.
    Em caso de falha (quota, auth, rede), pula a rodada e tenta de novo em 30min.
    Salva tarefas geradas em GCS para rastreabilidade.
    """
    from lib.vertex_agent import load_config, NEUTRALITY_PREFIX

    logger.info("Thread Vertex ideas: iniciada (intervalo=%ds).", VERTEX_INTERVAL_S)

    while not recebeu_sigterm():
        time.sleep(VERTEX_INTERVAL_S)
        if recebeu_sigterm():
            break

        try:
            cfg = load_config()

            # Coleta estatísticas para contextualizar o prompt
            n_ceap        = _contar_artefatos_gcs("ceap_classified")
            n_ner         = _contar_artefatos_gcs("ner_ceap")
            n_qsa         = _contar_artefatos_gcs("cnpj/qsa_resumos", ".json")
            n_round       = _contar_artefatos_gcs("alertas/round_numbers", ".json")
            n_rep         = _contar_artefatos_gcs("alertas/repeated_amounts", ".json")

            with _fila_lock:
                tipos_na_fila = [t.get("tipo","?") for t in TAREFAS_DINAMICAS]
            tipos_base     = [t.get("tipo","?") for t in TAREFAS_BASE]
            fila_atual_str = "\n".join(f"  - {t}" for t in tipos_base + tipos_na_fila)

            prompt = _PROMPT_VERTEX_IDEIAS.format(
                n_ceap        = n_ceap,
                n_ner         = n_ner,
                n_qsa         = n_qsa,
                n_alertas_round = n_round,
                n_alertas_rep   = n_rep,
                fila_atual    = fila_atual_str or "  (vazia)",
            )

            logger.info("Thread Vertex: consultando %s@%s...", cfg.model, cfg.location)

            try:
                from google import genai as _genai  # type: ignore
            except ImportError:
                logger.warning("Thread Vertex: google-genai não instalado. Pulando rodada.")
                continue

            client = _genai.Client(
                vertexai=True,
                project=cfg.project,
                location=cfg.location,
            )
            resp = client.models.generate_content(
                model=cfg.model,
                contents=f"{NEUTRALITY_PREFIX}\n\n{prompt}",
            )
            texto = getattr(resp, "text", "") or ""

            # Extrai o JSON array da resposta
            ini = texto.find("[")
            fim = texto.rfind("]") + 1
            if ini < 0 or fim <= ini:
                logger.warning("Thread Vertex: resposta não contém JSON array válido.")
                continue

            novas_tarefas = json.loads(texto[ini:fim])
            if not isinstance(novas_tarefas, list):
                logger.warning("Thread Vertex: JSON não é lista. Pulando.")
                continue

            # Filtra tarefas com tipo já existente na base + fila
            tipos_existentes = set(tipos_base + tipos_na_fila)
            novas_validas = [
                t for t in novas_tarefas
                if isinstance(t, dict) and t.get("tipo") and t["tipo"] not in tipos_existentes
            ]

            with _fila_lock:
                TAREFAS_DINAMICAS.extend(novas_validas)

            # Persiste no GCS para rastreabilidade
            if novas_validas:
                ts  = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
                blob_path = f"gemma_worker/vertex_tasks_{ts}.jsonl"
                _gcs_escrever_jsonl(GCS_CLEAN_BUCKET, blob_path, novas_validas)

            logger.info(
                "Thread Vertex: %d novas tarefas adicionadas à fila. "
                "(total dinâmicas: %d)",
                len(novas_validas), len(TAREFAS_DINAMICAS),
            )

        except json.JSONDecodeError as exc:
            logger.warning("Thread Vertex: falha ao parsear JSON de resposta — %s", exc)
        except Exception as exc:
            # Qualquer falha (quota, auth, rede): pula rodada
            logger.warning(
                "Thread Vertex: falha na rodada — %s. Próxima tentativa em %ds.",
                exc, VERTEX_INTERVAL_S,
            )

    logger.info("Thread Vertex ideas: encerrada.")


# ─────────────────────────────────────────────────────────────────────────────
# Seção 11 — Loop principal
# ─────────────────────────────────────────────────────────────────────────────

def main_loop() -> None:
    """
    Loop infinito de tarefas.
    Encerra apenas via SIGTERM ou billing hard-stop.
    """
    cliente = get_client()

    # Warmup do Ollama — falha crítica se não disponível
    if not cliente.warmup():
        logger.critical("ABORT: Gemma 27B não disponível no Ollama. Encerrando worker.")
        sys.exit(1)

    # Verificação de billing antes de qualquer processamento
    if not check_daily_spend():
        logger.critical("HARD-STOP: limite de gastos diários atingido no início. Encerrando.")
        sys.exit(1)

    ciclo = 0
    while not recebeu_sigterm():
        ciclo += 1
        tarefa = get_next_task()
        tipo   = tarefa.get("tipo", "?")

        logger.info(
            "══ CICLO %d | tarefa=%s | itens_total=%d | "
            "fila_dinamica=%d ══",
            ciclo, tipo, _itens_processados, len(TAREFAS_DINAMICAS),
        )

        _executar_tarefa(tarefa, cliente)

        # Verifica billing a cada BILLING_INTERVAL itens
        if _itens_processados > 0 and _itens_processados % BILLING_INTERVAL == 0:
            if not check_daily_spend():
                logger.critical(
                    "HARD-STOP billing após %d itens. Encerrando worker.",
                    _itens_processados,
                )
                _sigterm_recebido.set()
                break

    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )
    logger.info("Worker encerrado. Total de itens processados: %d", _itens_processados)
    logger.info("Ciclos completos: %d | Tarefas base: %d", ciclo, len(TAREFAS_BASE))
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )
    logger.info("Engine 40 — Gemma Worker Contínuo | L4 24/7")
    logger.info(
        "GCS_CLEAN_BUCKET=%s | CEAP_LIMIT=%s | LOG=%s",
        GCS_CLEAN_BUCKET, CEAP_LIMIT or "sem_limite", _LOG_FILE,
    )
    logger.info(
        "═══════════════════════════════════════════════════════════════════"
    )

    # Inicia thread geradora de tarefas (Vertex) em background
    thread_vertex = threading.Thread(
        target=idea_generator_vertex_thread,
        name="vertex-idea-generator",
        daemon=True,
    )
    thread_vertex.start()
    logger.info("Thread Vertex idea generator iniciada (PID thread=%s).", thread_vertex.ident)

    # Inicia loop principal (bloqueia até SIGTERM ou billing hard-stop)
    main_loop()

    # Aguarda thread Vertex encerrar (máximo 10s)
    thread_vertex.join(timeout=10)
    return 0


if __name__ == "__main__":
    sys.exit(main())
