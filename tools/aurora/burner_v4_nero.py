#!/usr/bin/env python3
"""
AURORA Burner v4 NERO — Saturação total da L4 + Vertex Gemini 2.5 Pro (motor único)
====================================================================================
Arquitetura (G.O.A.T. — Líder Supremo agent_1777236402725 / gemini-2.5-pro):
  - 6 streams Ollama paralelos (asyncio + httpx) — saturam a L4 em ~95-100%
  - Batch 50 notas/chamada — paraleliza dentro do Gemma 27B q4
  - Vertex triagem (2.5 Pro) quando score local >= 85 (alto risco)
  - Vertex parecer profundo (2.5 Pro) quando score da triagem >= 92 (forense)
  - Output: gs://datalake-tbr-clean/ceap_classified/{deputado_id}.jsonl
  - Logs em /var/log/tbr/burner.log + STDOUT

Hardware alvo: g2-standard-8 (8 vCPU · 32 GB RAM · 1× L4 24 GB)
NUNCA usar mais de 6 streams Ollama (a L4 trava acima disso).

Uso:
  python3 burner_v4_nero.py --workers 6 --batch 50 --vertex-screen on --vertex-deep on
"""
from __future__ import annotations
import asyncio, json, os, re, sys, time, argparse, logging, signal
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
import httpx

LOG_DIR = Path("/var/log/tbr")
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_DIR / "burner.log"), logging.StreamHandler()],
)
log = logging.getLogger("nero")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:27b-instruct-q4_K_M")
GCS_RAW = os.getenv("GCS_RAW", "gs://datalake-tbr-raw")
GCS_CLEAN = os.getenv("GCS_CLEAN", "gs://datalake-tbr-clean")
VERTEX_PROJECT = os.getenv("VERTEX_PROJECT", "transparenciabr")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
# Motor único Vertex — alinhado ao Líder Supremo (Agent Builder agent_1777236402725).
VERTEX_MODEL = os.getenv("VERTEX_MODEL", "gemini-2.5-pro")
SUPREME_AGENT_ID = "agent_1777236402725"

# Heurística regex pré-LLM — score 0-100
RISK_PATTERNS = [
    (r"\b(combust[íi]vel|posto|gasolina)\b", 15),
    (r"\b(passagem|hospedagem|hotel|di[áa]rias?)\b", 10),
    (r"\b(consultoria|assessoria)\b", 25),
    (r"\b(divulgaç[ãa]o|publicidade|panfleto)\b", 20),
    (r"\b(escrit[óo]rio|locaç[ãa]o de im[óo]vel)\b", 18),
    (r"\b(reembolso|ressarcimento)\b", 12),
    (r"\b(t[áa]xi|uber|deslocamento)\b", 8),
]

# ---------------------------------------------------------------------------
# Score regex
# ---------------------------------------------------------------------------
def regex_score(nota: dict) -> int:
    desc = (nota.get("txtFornecedor") or "") + " " + (nota.get("txtDescricao") or "")
    desc = desc.lower()
    s = 0
    for pat, w in RISK_PATTERNS:
        if re.search(pat, desc):
            s += w
    valor = float(nota.get("vlrLiquido") or 0)
    if valor > 5000:
        s += 15
    if valor > 20000:
        s += 25
    return min(s, 100)

# ---------------------------------------------------------------------------
# Ollama batch
# ---------------------------------------------------------------------------
PROMPT_BATCH = """Você é um auditor sênior do TCU. Analise estas {n} notas fiscais (CEAP) e classifique cada uma:

Para cada nota, retorne JSON com:
- score (0-100): risco de irregularidade
- categoria: combustivel|hospedagem|consultoria|divulgacao|escritorio|outros
- alerta: string curta com motivo do risco (vazio se score<30)

Retorne UM ÚNICO JSON com chave "notas": [...].

Notas:
{notas}
"""

async def ollama_batch(client: httpx.AsyncClient, notas: list[dict]) -> list[dict]:
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 2048, "num_ctx": 8192},
        "prompt": PROMPT_BATCH.format(
            n=len(notas),
            notas="\n".join(f"{i+1}. fornecedor={n.get('txtFornecedor')} desc={n.get('txtDescricao')} valor=R${n.get('vlrLiquido')}" for i, n in enumerate(notas))
        ),
    }
    try:
        r = await client.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=180)
        r.raise_for_status()
        out = r.json().get("response", "{}")
        parsed = json.loads(out)
        results = parsed.get("notas", [])
        if len(results) < len(notas):
            results += [{"score": 0, "categoria": "outros", "alerta": ""}] * (len(notas) - len(results))
        return results
    except Exception as e:
        log.warning(f"Ollama batch failed: {e} — fallback regex-only")
        return [{"score": regex_score(n), "categoria": "outros", "alerta": ""} for n in notas]

# ---------------------------------------------------------------------------
# Vertex Gemini 2.5 Pro — duas passagens de prompt (lazy import — só se ON)
# ---------------------------------------------------------------------------
_vertex_initialized = False
def _init_vertex():
    global _vertex_initialized
    if _vertex_initialized:
        return
    from google.cloud import aiplatform
    aiplatform.init(project=VERTEX_PROJECT, location=VERTEX_LOCATION)
    _vertex_initialized = True

async def vertex_screen(nota: dict, score_l4: int) -> dict:
    """Triagem via Gemini 2.5 Pro (motor Líder Supremo agent_1777236402725). Gate: score_l4 >= 85."""
    _init_vertex()
    from vertexai.preview.generative_models import GenerativeModel
    model = GenerativeModel(VERTEX_MODEL)
    prompt = f"""Você é o motor Gemini 2.5 Pro do Líder Supremo (Agent ID {SUPREME_AGENT_ID}). Auditor TCU.
Reanalise esta nota CEAP e dê JSON:
{{ "score": 0-100, "categoria": "...", "alerta": "...", "fundamento_legal": "Art. X / Resolução Y" }}

Nota: fornecedor={nota.get('txtFornecedor')} desc={nota.get('txtDescricao')} valor=R${nota.get('vlrLiquido')} score_l4={score_l4}
"""
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt, generation_config={"temperature": 0.1, "response_mime_type": "application/json"}))
    try:
        return json.loads(resp.text)
    except Exception as e:
        log.warning(f"Vertex screen parse fail: {e}")
        return {"score": score_l4, "categoria": "outros", "alerta": "vertex_screen_parse_error"}

async def vertex_deep(nota: dict, score_screen: int) -> dict:
    """Parecer forense via Gemini 2.5 Pro. Gate: score_screen >= 92."""
    _init_vertex()
    from vertexai.preview.generative_models import GenerativeModel
    model = GenerativeModel(VERTEX_MODEL)
    prompt = f"""Você é o motor Gemini 2.5 Pro do Líder Supremo (Agent ID {SUPREME_AGENT_ID}). Juiz do TCU. Faça o parecer técnico desta nota CEAP no formato:
{{
  "veredicto": "irregular|suspeito|regular_com_ressalvas|regular",
  "fundamento_legal": "...",
  "precedente_tcu": "Acórdão XXXX/AAAA-Plenário ...",
  "recomendacao": "...",
  "score_final": 0-100
}}
Nota: {json.dumps(nota, ensure_ascii=False)}
"""
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt, generation_config={"temperature": 0.0, "response_mime_type": "application/json"}))
    try:
        return json.loads(resp.text)
    except Exception as e:
        log.warning(f"Vertex deep parse fail: {e}")
        return {"veredicto": "regular_com_ressalvas", "score_final": score_screen}

# ---------------------------------------------------------------------------
# Pipeline por deputado
# ---------------------------------------------------------------------------
async def fetch_despesas(client: httpx.AsyncClient, dep_id: int, ano: int) -> list[dict]:
    notas = []
    for mes in range(1, 13):
        page = 1
        while True:
            url = f"https://dadosabertos.camara.leg.br/api/v2/deputados/{dep_id}/despesas?ano={ano}&mes={mes}&itens=100&pagina={page}"
            try:
                r = await client.get(url, timeout=30)
                r.raise_for_status()
                data = r.json().get("dados", [])
            except Exception as e:
                log.warning(f"dep {dep_id} {ano}/{mes} p{page} fail: {e}")
                break
            if not data:
                break
            notas.extend(data)
            page += 1
            if page > 30:
                break
    return notas

async def upload_gcs(jsonl_text: str, dep_id: int):
    """Upload via gcloud storage (gsutil deprecated). Salva em ceap_classified/."""
    tmp = f"/tmp/dep_{dep_id}.jsonl"
    Path(tmp).write_text(jsonl_text)
    cmd = f"gcloud storage cp {tmp} {GCS_CLEAN}/ceap_classified/{dep_id}.jsonl --quiet"
    proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await proc.wait()
    Path(tmp).unlink(missing_ok=True)

async def process_deputado(client: httpx.AsyncClient, sem: asyncio.Semaphore, dep_id: int, ano: int, batch_size: int, use_screen: bool, use_deep: bool):
    async with sem:
        t0 = time.time()
        notas = await fetch_despesas(client, dep_id, ano)
        if not notas:
            log.info(f"dep {dep_id}: 0 notas")
            return

        # Score regex pré-LLM
        for n in notas:
            n["_score_regex"] = regex_score(n)

        # Ollama em batch
        out_lines = []
        for i in range(0, len(notas), batch_size):
            batch = notas[i:i+batch_size]
            scores_l4 = await ollama_batch(client, batch)
            for n, s in zip(batch, scores_l4):
                n["_score_l4"] = int(s.get("score", 0))
                n["_categoria_l4"] = s.get("categoria", "outros")
                n["_alerta_l4"] = s.get("alerta", "")

        # Vertex triagem 2.5 Pro (paralelo, só score_l4 >= 85)
        if use_screen:
            high_risk = [n for n in notas if n["_score_l4"] >= 85]
            if high_risk:
                results = await asyncio.gather(*(vertex_screen(n, n["_score_l4"]) for n in high_risk[:200]), return_exceptions=True)
                for n, r in zip(high_risk[:200], results):
                    if isinstance(r, dict):
                        n["_vertex_screen"] = r

        # Vertex parecer profundo (só triagem >= 92)
        if use_deep:
            forense = [n for n in notas if n.get("_vertex_screen", {}).get("score", 0) >= 92]
            if forense:
                results = await asyncio.gather(*(vertex_deep(n, n["_vertex_screen"]["score"]) for n in forense[:50]), return_exceptions=True)
                for n, r in zip(forense[:50], results):
                    if isinstance(r, dict):
                        n["_vertex_deep"] = r

        # Linha JSONL
        for n in notas:
            n["_processed_at"] = datetime.now(timezone.utc).isoformat()
            out_lines.append(json.dumps(n, ensure_ascii=False))

        await upload_gcs("\n".join(out_lines), dep_id)
        dt = time.time() - t0
        log.info(f"dep {dep_id}: {len(notas)} notas em {dt:.1f}s · {len(notas)/dt:.1f}/s")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6, help="Streams Ollama paralelos (max 6 na L4)")
    ap.add_argument("--batch", type=int, default=50)
    ap.add_argument("--ano", type=int, default=2025)
    ap.add_argument("--vertex-screen", choices=["on", "off"], default="on", help="Triagem Vertex Gemini 2.5 Pro (gate score local >= 85)")
    ap.add_argument("--vertex-deep", choices=["on", "off"], default="on", help="Parecer forense Vertex Gemini 2.5 Pro (gate triagem >= 92)")
    ap.add_argument("--roster", default="gs://datalake-tbr-clean/universe/roster.json")
    ap.add_argument("--start-from", type=int, default=0, help="Skip primeiros N deputados")
    args = ap.parse_args()

    if args.workers > 6:
        log.error("MAX 6 workers — a L4 trava acima disso. Abortando.")
        sys.exit(1)

    # Carregar roster (formato real: dict com chave 'roster' contendo lista)
    proc = await asyncio.create_subprocess_shell(f"gcloud storage cat {args.roster}", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    if proc.returncode != 0:
        log.error(f"Falha lendo roster: {err.decode()[:500]}")
        sys.exit(2)
    roster_doc = json.loads(out)
    if isinstance(roster_doc, dict) and "roster" in roster_doc:
        roster_list = roster_doc["roster"]
    elif isinstance(roster_doc, list):
        roster_list = roster_doc
    else:
        log.error(f"Formato de roster inesperado: {type(roster_doc).__name__}")
        sys.exit(2)

    # Aceita 'id' (str) OU 'camara_id' (int) e filtra apenas deputados
    def _norm_id(d):
        raw = d.get("camara_id") or d.get("id")
        try:
            return int(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    deputados = []
    for d in roster_list:
        if not isinstance(d, dict):
            continue
        if d.get("cargo") and d.get("cargo") != "deputado":
            continue  # pula senadores nesse burner (CEAP é só da Câmara)
        cid = _norm_id(d)
        if cid:
            d["_dep_id"] = cid
            deputados.append(d)
    deputados.sort(key=lambda d: d["_dep_id"])

    if args.start_from:
        deputados = deputados[args.start_from:]
    log.info(f"NERO start: {len(deputados)} deputados · {args.workers} workers · ano={args.ano} · vertex_screen={args.vertex_screen} · vertex_deep={args.vertex_deep}")

    sem = asyncio.Semaphore(args.workers)
    async with httpx.AsyncClient(http2=True, limits=httpx.Limits(max_connections=50)) as client:
        tasks = [process_deputado(client, sem, d["_dep_id"], args.ano, args.batch, args.vertex_screen == "on", args.vertex_deep == "on") for d in deputados]
        await asyncio.gather(*tasks, return_exceptions=True)

    log.info("NERO complete.")

if __name__ == "__main__":
    asyncio.run(main())
