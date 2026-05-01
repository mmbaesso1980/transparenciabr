#!/usr/bin/env python3
"""
GEMMA BURNER IMEDIATO — satura a L4 SEM depender de BigQuery populado.

Estratégia: lê o roster.json (594 parlamentares) do GCS, e para CADA UM:
1. Baixa CEAP do mês corrente direto da API Câmara
2. Para cada nota, manda Gemma 27B classificar
3. Salva em gs://datalake-tbr-clean/ceap_classified/<ano>/<id>/notas.jsonl

Usa Ollama local (porta 11434) — sem BQ, sem Vertex remoto, sem pip novo.
Dispara saturação real da L4 dentro de 60 segundos.

Uso:
    python3 41_gemma_burner_imediato.py
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import requests
from google.cloud import storage

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
OLLAMA_URL    = "http://127.0.0.1:11434/api/generate"
GEMMA_MODEL   = "gemma2:27b-instruct-q4_K_M"
GCS_CLEAN     = os.environ.get("GCS_CLEAN_BUCKET", "datalake-tbr-clean")
ROSTER_PATH   = "universe/roster.json"
ANOS          = [int(a) for a in os.environ.get("CEAP_YEARS", "2024,2025,2026").split(",")]
MAX_WORKERS   = int(os.environ.get("BURNER_WORKERS", "4"))
MAX_PARLAMENTARES = int(os.environ.get("BURNER_MAX_PARLAMENTARES", "0"))  # 0 = todos
CAMARA_API    = "https://dadosabertos.camara.leg.br/api/v2"

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("burner")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Roster
# ─────────────────────────────────────────────────────────────────────────────
def carregar_roster() -> List[Dict[str, Any]]:
    cli = storage.Client()
    blob = cli.bucket(GCS_CLEAN).blob(ROSTER_PATH)
    payload = json.loads(blob.download_as_text())
    roster = payload.get("roster", [])
    log.info("Roster carregado: %d parlamentares", len(roster))
    return roster


# ─────────────────────────────────────────────────────────────────────────────
# 2. CEAP via API Câmara (deputados) — sem BQ
# ─────────────────────────────────────────────────────────────────────────────
def baixar_ceap_deputado(id_dep: str, ano: int) -> List[Dict[str, Any]]:
    """Retorna todas as notas CEAP de um deputado num ano via API oficial."""
    notas: List[Dict[str, Any]] = []
    pagina = 1
    while True:
        try:
            url = f"{CAMARA_API}/deputados/{id_dep}/despesas"
            r = requests.get(
                url,
                params={"ano": ano, "ordem": "ASC", "ordenarPor": "ano", "itens": 100, "pagina": pagina},
                timeout=20,
            )
            if r.status_code != 200:
                break
            dados = r.json().get("dados", [])
            if not dados:
                break
            notas.extend(dados)
            if len(dados) < 100:
                break
            pagina += 1
            if pagina > 30:  # limite de segurança
                break
        except Exception as exc:
            log.warning("Falha CEAP id=%s ano=%d pag=%d: %s", id_dep, ano, pagina, exc)
            break
    return notas


# ─────────────────────────────────────────────────────────────────────────────
# 3. Classificador Gemma
# ─────────────────────────────────────────────────────────────────────────────
PROMPT = """Você é um auditor público brasileiro. Analise esta nota fiscal de CEAP.

Parlamentar: {nome} ({partido}/{uf})
Tipo: {tipo}
Fornecedor: {fornecedor} (CNPJ {cnpj})
Valor: R$ {valor:.2f}
Data: {data}

Responda APENAS JSON estrito (sem markdown):
{{"categoria":"<combustivel|hospedagem|divulgacao|alimentacao|transporte|consultoria|escritorio|telefonia|outros>","anomalia":"<nenhuma|valor_atipico|fornecedor_suspeito|fracionamento|repeticao|round_number>","score_risco":<0-10>,"justificativa":"<frase única em PT-BR>"}}"""


def classificar_nota(nota: Dict[str, Any], parlamentar: Dict[str, Any]) -> Dict[str, Any]:
    prompt = PROMPT.format(
        nome=parlamentar.get("nome") or parlamentar.get("nome_eleitoral") or "?",
        partido=parlamentar.get("partido") or parlamentar.get("siglaPartido") or "?",
        uf=parlamentar.get("uf") or parlamentar.get("siglaUf") or "?",
        tipo=nota.get("tipoDespesa", "?"),
        fornecedor=nota.get("nomeFornecedor", "?"),
        cnpj=nota.get("cnpjCpfFornecedor", "?"),
        valor=float(nota.get("valorLiquido") or 0.0),
        data=nota.get("dataDocumento", "?"),
    )
    try:
        r = requests.post(
            OLLAMA_URL,
            json={
                "model": GEMMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.1, "num_predict": 200},
            },
            timeout=90,
        )
        out = r.json().get("response", "{}")
        analise = json.loads(out)
        return {**nota, "_gemma": analise}
    except Exception as exc:
        return {**nota, "_gemma_error": str(exc)[:200]}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Persistência idempotente
# ─────────────────────────────────────────────────────────────────────────────
def jah_processado(id_dep: str, ano: int, n_notas_atual: int) -> bool:
    cli = storage.Client()
    path = f"ceap_classified/{ano}/{id_dep}/notas.jsonl"
    blob = cli.bucket(GCS_CLEAN).blob(path)
    if not blob.exists():
        return False
    # Conta linhas no blob existente
    txt = blob.download_as_text()
    n_existente = sum(1 for line in txt.splitlines() if line.strip())
    if n_existente >= n_notas_atual:
        log.info("✅ Skip id=%s ano=%d: já tem %d/%d notas", id_dep, ano, n_existente, n_notas_atual)
        return True
    return False


def salvar_resultado(id_dep: str, ano: int, registros: List[Dict[str, Any]]) -> None:
    cli = storage.Client()
    path = f"ceap_classified/{ano}/{id_dep}/notas.jsonl"
    blob = cli.bucket(GCS_CLEAN).blob(path)
    body = "\n".join(json.dumps(r, ensure_ascii=False, default=str) for r in registros)
    blob.upload_from_string(body, content_type="application/x-ndjson")


# ─────────────────────────────────────────────────────────────────────────────
# 5. Loop principal
# ─────────────────────────────────────────────────────────────────────────────
def main():
    log.info("🔥 Gemma Burner — saturando L4 com CEAP via API Câmara")
    log.info("Anos: %s | Workers: %d | Modelo: %s", ANOS, MAX_WORKERS, GEMMA_MODEL)

    # warmup
    try:
        requests.post(OLLAMA_URL, json={"model": GEMMA_MODEL, "prompt": "ok", "stream": False}, timeout=60).raise_for_status()
        log.info("✅ Gemma respondendo")
    except Exception as exc:
        log.error("❌ Gemma indisponível: %s", exc)
        sys.exit(1)

    roster = carregar_roster()
    deputados = [p for p in roster if p.get("cargo") == "deputado"]
    if MAX_PARLAMENTARES > 0:
        deputados = deputados[:MAX_PARLAMENTARES]
    log.info("Processando %d deputados em %d anos = até %d combinações", len(deputados), len(ANOS), len(deputados) * len(ANOS))

    total_notas = 0
    total_ok = 0
    t0 = time.time()
    pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)

    for idx, parl in enumerate(deputados, 1):
        id_dep = str(parl.get("id"))
        for ano in ANOS:
            try:
                notas = baixar_ceap_deputado(id_dep, ano)
                if not notas:
                    continue
                if jah_processado(id_dep, ano, len(notas)):
                    continue

                log.info("[%d/%d] id=%s ano=%d: %d notas → Gemma", idx, len(deputados), id_dep, ano, len(notas))
                futs = [pool.submit(classificar_nota, n, parl) for n in notas]
                resultados = [f.result() for f in as_completed(futs, timeout=600)]

                salvar_resultado(id_dep, ano, resultados)
                total_notas += len(notas)
                total_ok += sum(1 for r in resultados if "_gemma" in r)

                dt = time.time() - t0
                rate = total_notas / dt if dt > 0 else 0
                log.info("📊 Total: %d notas | OK: %d | %.2f notas/s | elapsed=%.0fs", total_notas, total_ok, rate, dt)

            except Exception as exc:
                log.exception("Erro id=%s ano=%d: %s", id_dep, ano, exc)

    log.info("🏁 Burner finalizou: %d notas processadas, %d sucesso", total_notas, total_ok)


if __name__ == "__main__":
    main()
