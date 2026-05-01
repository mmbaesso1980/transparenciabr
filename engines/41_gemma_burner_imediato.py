#!/usr/bin/env python3
"""
41_gemma_burner_imediato.py — Burner L4 Resiliente
Triagem forense massiva via Gemma 27B (Ollama local).

Estratégia: lê o roster.json (594 parlamentares) do GCS, e para CADA UM:
1. Baixa CEAP do mês corrente direto da API Câmara
2. Para cada nota, manda Gemma 27B classificar (ThreadPool com BURNER_WORKERS threads)
3. Salva INCREMENTALMENTE em ~/transparenciabr/temp_classified/<id>.jsonl (append nota a nota)
4. Faz upload periódico para gs://datalake-tbr-clean/ceap_classified/<ano>/<id>/notas.jsonl

Melhorias v2 (refatoração resiliente):
- Salvamento incremental: nenhuma nota processada é perdida mesmo em crash
- try/except por future individual: TimeoutError em 1 nota não aborta o lote
- Path.home() dinâmico: compatível com manusalt13 e mmbaesso (sem hardcode)
- BURNER_WORKERS=8 default: satura a L4 ao máximo
- Warmup com keep_alive=24h: Gemma não descarrega da VRAM entre lotes
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.cloud import storage

# ─────────────────────────────────────────────────────────────────────────────
# Config — tudo via env var ou Path.home() dinâmico (sem hardcode de usuário)
# ─────────────────────────────────────────────────────────────────────────────
PROJECT_ROOT  = Path.home() / "transparenciabr"
TEMP_DIR      = PROJECT_ROOT / "temp_classified"
LOGS_DIR      = PROJECT_ROOT / "logs"

OLLAMA_URL    = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
GEMMA_MODEL   = os.environ.get("OLLAMA_MODEL", "gemma2:27b-instruct-q4_K_M")
GCS_CLEAN     = os.environ.get("GCS_CLEAN_BUCKET", "datalake-tbr-clean")
ROSTER_PATH   = "universe/roster.json"
ANOS          = [int(a) for a in os.environ.get("CEAP_YEARS", "2024,2025,2026").split(",")]
MAX_WORKERS   = int(os.environ.get("BURNER_WORKERS", "8"))        # era 4 → 8 para saturar L4
MAX_PARLAMENTARES = int(os.environ.get("BURNER_MAX_PARLAMENTARES", "0"))  # 0 = todos
BATCH_UPLOAD_EVERY = int(os.environ.get("BATCH_UPLOAD_EVERY", "50"))      # upload GCS a cada N notas
FUTURE_TIMEOUT = int(os.environ.get("FUTURE_TIMEOUT", "120"))             # timeout por nota (s)
CAMARA_API    = "https://dadosabertos.camara.leg.br/api/v2"

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
LOGS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

log_file = LOGS_DIR / f"burner_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
    datefmt="%Y-%m-%dT%H:%M:%S%z",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("burner")

# ─────────────────────────────────────────────────────────────────────────────
# GCS Client (singleton)
# ─────────────────────────────────────────────────────────────────────────────
_gcs: storage.Client | None = None

def gcs_client() -> storage.Client:
    global _gcs
    if _gcs is None:
        _gcs = storage.Client()
    return _gcs

def upload_local_to_gcs(local_path: Path, blob_path: str, bucket_name: str = GCS_CLEAN) -> bool:
    """Upload arquivo local para GCS. Sobrescreve se existir."""
    try:
        bucket = gcs_client().bucket(bucket_name)
        blob = bucket.blob(blob_path)
        blob.upload_from_filename(str(local_path))
        log.info("  ☁️  GCS OK: gs://%s/%s (%d bytes)", bucket_name, blob_path, local_path.stat().st_size)
        return True
    except Exception as e:
        log.error("  ❌ GCS FALHOU: %s — %s", blob_path, e)
        return False

# ─────────────────────────────────────────────────────────────────────────────
# Salvamento Incremental — append nota a nota, upload periódico
# ─────────────────────────────────────────────────────────────────────────────
class IncrementalSaver:
    """Salva nota a nota em JSONL local e faz upload periódico para GCS."""

    def __init__(self, id_dep: str, ano: int):
        safe = f"{id_dep}_{ano}"
        self.gcs_blob_path = f"ceap_classified/{ano}/{id_dep}/notas.jsonl"
        self.local_file = TEMP_DIR / f"{safe}.jsonl"
        self.count_since_upload = 0
        self.total_saved = 0
        self.total_errors = 0

    def save(self, registro: dict) -> None:
        """Append imediato de UMA nota no arquivo local."""
        try:
            with open(self.local_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(registro, ensure_ascii=False, default=str) + "\n")
            self.count_since_upload += 1
            self.total_saved += 1
            if self.count_since_upload >= BATCH_UPLOAD_EVERY:
                self.flush_to_gcs()
        except Exception as e:
            log.error("  ❌ Erro ao salvar nota localmente: %s", e)
            self.total_errors += 1

    def flush_to_gcs(self) -> None:
        if self.local_file.exists() and self.local_file.stat().st_size > 0:
            upload_local_to_gcs(self.local_file, self.gcs_blob_path)
            self.count_since_upload = 0  # reseta contador, NÃO apaga arquivo local

    def finalize(self) -> tuple[int, int]:
        self.flush_to_gcs()
        log.info(
            "  📊 finalize: %d notas salvas, %d erros → %s",
            self.total_saved, self.total_errors, self.local_file,
        )
        return self.total_saved, self.total_errors

# ─────────────────────────────────────────────────────────────────────────────
# Roster
# ─────────────────────────────────────────────────────────────────────────────
def carregar_roster() -> List[Dict[str, Any]]:
    blob = gcs_client().bucket(GCS_CLEAN).blob(ROSTER_PATH)
    payload = json.loads(blob.download_as_text())
    roster = payload.get("roster", [])
    log.info("Roster carregado: %d parlamentares", len(roster))
    return roster

# ─────────────────────────────────────────────────────────────────────────────
# CEAP via API Câmara
# ─────────────────────────────────────────────────────────────────────────────
def baixar_ceap_deputado(id_dep: str, ano: int) -> List[Dict[str, Any]]:
    notas: List[Dict[str, Any]] = []
    pagina = 1
    while True:
        try:
            r = requests.get(
                f"{CAMARA_API}/deputados/{id_dep}/despesas",
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
            if pagina > 30:
                break
        except Exception as exc:
            log.warning("Falha CEAP id=%s ano=%d pag=%d: %s", id_dep, ano, pagina, exc)
            break
    return notas

# ─────────────────────────────────────────────────────────────────────────────
# Classificador Gemma — com retry por falha de conexão
# ─────────────────────────────────────────────────────────────────────────────
PROMPT = """Você é um auditor público brasileiro. Analise esta nota fiscal de CEAP.

Parlamentar: {nome} ({partido}/{uf})
Tipo: {tipo}
Fornecedor: {fornecedor} (CNPJ {cnpj})
Valor: R$ {valor:.2f}
Data: {data}

Responda APENAS JSON estrito (sem markdown):
{{"categoria":"<combustivel|hospedagem|divulgacao|alimentacao|transporte|consultoria|escritorio|telefonia|outros>","anomalia":"<nenhuma|valor_atipico|fornecedor_suspeito|fracionamento|repeticao|round_number>","score_risco":<0-10>,"justificativa":"<frase única em PT-BR>"}}"""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((requests.ConnectionError, requests.Timeout)),
)
def _chamar_ollama(prompt: str) -> str:
    r = requests.post(
        OLLAMA_URL,
        json={
            "model": GEMMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1, "num_predict": 200},
        },
        timeout=FUTURE_TIMEOUT,
    )
    r.raise_for_status()
    return r.json().get("response", "{}")


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
        out = _chamar_ollama(prompt)
        analise = json.loads(out)
        return {**nota, "_gemma": analise, "_ts": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        return {**nota, "_gemma_error": str(exc)[:200], "_ts": datetime.now(timezone.utc).isoformat()}

# ─────────────────────────────────────────────────────────────────────────────
# Idempotência
# ─────────────────────────────────────────────────────────────────────────────
def jah_processado(id_dep: str, ano: int, n_notas_atual: int) -> bool:
    blob = gcs_client().bucket(GCS_CLEAN).blob(f"ceap_classified/{ano}/{id_dep}/notas.jsonl")
    if not blob.exists():
        return False
    n_existente = sum(1 for line in blob.download_as_text().splitlines() if line.strip())
    if n_existente >= n_notas_atual:
        log.info("✅ Skip id=%s ano=%d: já tem %d/%d notas", id_dep, ano, n_existente, n_notas_atual)
        return True
    return False

# ─────────────────────────────────────────────────────────────────────────────
# Processamento de um parlamentar/ano — salvamento incremental + retry por nota
# ─────────────────────────────────────────────────────────────────────────────
def processar_parlamentar_ano(parl: Dict[str, Any], ano: int) -> dict:
    id_dep = str(parl.get("id"))
    notas = baixar_ceap_deputado(id_dep, ano)
    if not notas:
        return {"id": id_dep, "ano": ano, "total": 0, "ok": 0, "erros": 0}
    if jah_processado(id_dep, ano, len(notas)):
        return {"id": id_dep, "ano": ano, "total": len(notas), "ok": len(notas), "erros": 0, "skip": True}

    log.info("[id=%s ano=%d] %d notas → Gemma (%d workers)", id_dep, ano, len(notas), MAX_WORKERS)
    saver = IncrementalSaver(id_dep, ano)
    ok = 0
    erros = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futs = {pool.submit(classificar_nota, n, parl): i for i, n in enumerate(notas)}

        for fut in as_completed(futs, timeout=FUTURE_TIMEOUT * len(notas) + 60):
            idx = futs[fut]
            try:
                resultado = fut.result(timeout=FUTURE_TIMEOUT)
                saver.save(resultado)
                ok += 1

                score = resultado.get("_gemma", {}).get("score_risco", -1)
                if isinstance(score, int) and score >= 7:
                    log.warning(
                        "  🚨 RISCO ALTO (%d/10) nota #%d id=%s: %s",
                        score, idx, id_dep,
                        resultado.get("_gemma", {}).get("justificativa", "?")[:120],
                    )
            except TimeoutError:
                log.error("  ⏰ Timeout nota #%d id=%s — PULANDO, lote continua", idx, id_dep)
                erros += 1
            except Exception as e:
                log.error("  ❌ Erro nota #%d id=%s: %s — PULANDO", idx, id_dep, e)
                erros += 1

    saved, save_err = saver.finalize()
    erros += save_err
    log.info("[id=%s ano=%d] ✅ %d/%d OK | %d erros | %d salvas GCS", id_dep, ano, ok, len(notas), erros, saved)
    return {"id": id_dep, "ano": ano, "total": len(notas), "ok": ok, "erros": erros}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    log.info("=" * 60)
    log.info("🔥 Gemma Burner v2 — Triagem Forense Massiva (resiliente)")
    log.info("   Modelo:      %s", GEMMA_MODEL)
    log.info("   Workers:     %d", MAX_WORKERS)
    log.info("   Anos:        %s", ANOS)
    log.info("   Upload cada: %d notas", BATCH_UPLOAD_EVERY)
    log.info("   Timeout/nota:%ds", FUTURE_TIMEOUT)
    log.info("   Temp local:  %s", TEMP_DIR)
    log.info("   GCS clean:   gs://%s", GCS_CLEAN)
    log.info("   User:        %s | Home: %s", os.getenv("USER", "?"), Path.home())
    log.info("=" * 60)

    # Warmup — carrega Gemma na VRAM e mantém por 24h
    log.info("♨️  Warmup Ollama (keep_alive=24h)...")
    try:
        requests.post(
            OLLAMA_URL,
            json={"model": GEMMA_MODEL, "prompt": "ok", "stream": False, "keep_alive": "24h"},
            timeout=120,
        ).raise_for_status()
        log.info("♨️  Gemma carregado na L4 ✅")
    except Exception as exc:
        log.error("❌ Gemma indisponível: %s", exc)
        sys.exit(1)

    roster = carregar_roster()
    deputados = [p for p in roster if p.get("cargo") == "deputado"]
    if MAX_PARLAMENTARES > 0:
        deputados = deputados[:MAX_PARLAMENTARES]
    log.info("Processando %d deputados × %d anos = %d combinações", len(deputados), len(ANOS), len(deputados) * len(ANOS))

    total_notas = 0
    total_ok = 0
    t0 = time.time()

    for idx, parl in enumerate(deputados, 1):
        nome = parl.get("nome") or parl.get("nome_eleitoral") or parl.get("id")
        log.info("\n%s", "─" * 50)
        log.info("📦 [%d/%d] %s", idx, len(deputados), nome)

        for ano in ANOS:
            try:
                result = processar_parlamentar_ano(parl, ano)
                if not result.get("skip"):
                    total_notas += result["total"]
                    total_ok += result["ok"]

                dt = time.time() - t0
                rate = total_notas / dt * 3600 if dt > 0 else 0
                log.info("📈 Acumulado: %d notas | %d OK | %.0f notas/hora | %.0fs elapsed",
                         total_notas, total_ok, rate, dt)
            except KeyboardInterrupt:
                log.info("🛑 Interrompido. Dados já salvos estão seguros em %s", TEMP_DIR)
                sys.exit(0)
            except Exception as exc:
                log.exception("💥 Erro fatal id=%s ano=%d: %s", parl.get("id"), ano, exc)

    dt = time.time() - t0
    log.info("\n%s", "=" * 60)
    log.info("🏁 BURNER FINALIZADO")
    log.info("   Total notas: %d", total_notas)
    log.info("   Total OK:    %d", total_ok)
    log.info("   Tempo total: %.1f min", dt / 60)
    log.info("   Taxa média:  %.0f notas/hora", total_notas / dt * 3600 if dt > 0 else 0)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
