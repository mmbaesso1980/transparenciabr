#!/usr/bin/env python3
"""
AURORA Burner v4 NERO — Saturação total da L4 + Vertex Flash + Vertex Pro
=========================================================================
Arquitetura:
  - 6 streams Ollama paralelos (asyncio + httpx) — saturam a L4 em ~95-100%
  - Batch 50 notas/chamada — paraleliza dentro do Gemma 27B q4
  - Vertex Flash sempre ON pra score regex >= 85 (alto risco)
  - Vertex 2.5 Pro paralelo pra score Flash >= 92 (forense)
  - Output: gs://datalake-tbr-clean/ceap_classified/{deputado_id}.jsonl
  - Logs em /var/log/tbr/burner.log + STDOUT

Hardware alvo: g2-standard-8 (8 vCPU · 32 GB RAM · 1× L4 24 GB)
NUNCA usar mais de 6 streams Ollama (a L4 trava acima disso).

Uso:
  python3 burner_v4_nero.py --workers 6 --batch 50 --vertex-flash on --vertex-pro on
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
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:27b")
GCS_RAW = os.getenv("GCS_RAW", "gs://datalake-tbr-raw")
GCS_CLEAN = os.getenv("GCS_CLEAN", "gs://datalake-tbr-clean")
VERTEX_PROJECT = os.getenv("VERTEX_PROJECT", "transparenciabr")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
# G.O.A.T.: motor alinhado ao Líder Supremo (Agent Builder agent_1777236402725) — sem Gemini 2.0 legado.
SUPREME_AGENT_ID = os.getenv("VERTEX_SUPREME_AGENT_ID", "agent_1777236402725")
VERTEX_FLASH = os.getenv("VERTEX_FLASH_MODEL", "gemini-2.5-flash")
VERTEX_PRO = os.getenv("VERTEX_PRO_MODEL", "gemini-2.5-pro")

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
# Vertex Flash + Pro (lazy import — só se ON)
# ---------------------------------------------------------------------------
_vertex_initialized = False
def _init_vertex():
    global _vertex_initialized
    if _vertex_initialized:
        return
    from google.cloud import aiplatform
    aiplatform.init(project=VERTEX_PROJECT, location=VERTEX_LOCATION)
    _vertex_initialized = True

async def vertex_flash(nota: dict, score_l4: int) -> dict:
    """Reanálise via Gemini 2.5 Flash (mesma linha de governaça do Líder Supremo). Só roda se score_l4 >= 85 (gate)."""
    _init_vertex()
    from vertexai.preview.generative_models import GenerativeModel
    model = GenerativeModel(VERTEX_FLASH)
    prompt = f"""Você opera em conformidade com o motor do Líder Supremo (Vertex Agent ID {SUPREME_AGENT_ID}).

Auditor TCU. Reanalise esta nota CEAP e dê JSON:
{{ "score": 0-100, "categoria": "...", "alerta": "...", "fundamento_legal": "Art. X / Resolução Y" }}

Nota: fornecedor={nota.get('txtFornecedor')} desc={nota.get('txtDescricao')} valor=R${nota.get('vlrLiquido')} score_l4={score_l4}
"""
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt, generation_config={"temperature": 0.1, "response_mime_type": "application/json"}))
    try:
        return json.loads(resp.text)
    except Exception as e:
        log.warning(f"Flash parse fail: {e}")
        return {"score": score_l4, "categoria": "outros", "alerta": "flash_parse_error"}

async def vertex_pro(nota: dict, score_flash: int) -> dict:
    """Forense profundo via Gemini 2.5 Pro (Líder Supremo agent_1777236402725). Só roda se score_flash >= 92."""
    _init_vertex()
    from vertexai.preview.generative_models import GenerativeModel
    model = GenerativeModel(VERTEX_PRO)
    prompt = f"""Você opera em conformidade com o motor do Líder Supremo (Vertex Agent ID {SUPREME_AGENT_ID}).

Você é juiz do TCU. Faça o parecer técnico desta nota CEAP no formato:
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
        log.warning(f"Pro parse fail: {e}")
        return {"veredicto": "regular_com_ressalvas", "score_final": score_flash}

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
    """Upload via gsutil (síncrono mas rápido). Salva em ceap_classified/."""
    tmp = f"/tmp/dep_{dep_id}.jsonl"
    Path(tmp).write_text(jsonl_text)
    cmd = f"gsutil -q cp {tmp} {GCS_CLEAN}/ceap_classified/{dep_id}.jsonl"
    proc = await asyncio.create_subprocess_shell(cmd)
    await proc.wait()
    Path(tmp).unlink(missing_ok=True)

async def process_deputado(client: httpx.AsyncClient, sem: asyncio.Semaphore, dep_id: int, ano: int, batch_size: int, use_flash: bool, use_pro: bool):
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

        # Vertex Flash (paralelo, só score_l4 >= 85)
        if use_flash:
            high_risk = [n for n in notas if n["_score_l4"] >= 85]
            if high_risk:
                results = await asyncio.gather(*(vertex_flash(n, n["_score_l4"]) for n in high_risk[:200]), return_exceptions=True)
                for n, r in zip(high_risk[:200], results):
                    if isinstance(r, dict):
                        n["_flash"] = r

        # Vertex Pro (forense, só Flash >= 92)
        if use_pro:
            forense = [n for n in notas if n.get("_flash", {}).get("score", 0) >= 92]
            if forense:
                results = await asyncio.gather(*(vertex_pro(n, n["_flash"]["score"]) for n in forense[:50]), return_exceptions=True)
                for n, r in zip(forense[:50], results):
                    if isinstance(r, dict):
                        n["_pro"] = r

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
    ap.add_argument("--vertex-flash", choices=["on", "off"], default="on")
    ap.add_argument("--vertex-pro", choices=["on", "off"], default="on")
    ap.add_argument("--roster", default="gs://datalake-tbr-clean/universe/roster.json")
    ap.add_argument("--start-from", type=int, default=0, help="Skip primeiros N deputados")
    args = ap.parse_args()

    if args.workers > 6:
        log.error("MAX 6 workers — a L4 trava acima disso. Abortando.")
        sys.exit(1)

    # Carregar roster
    proc = await asyncio.create_subprocess_shell(f"gsutil cat {args.roster}", stdout=asyncio.subprocess.PIPE)
    out, _ = await proc.communicate()
    roster = json.loads(out)
    deputados = sorted([d for d in roster if d.get("camara_id")], key=lambda d: d.get("camara_id", 0))
    if args.start_from:
        deputados = deputados[args.start_from:]
    log.info(f"NERO start: {len(deputados)} deputados · {args.workers} workers · ano={args.ano} · flash={args.vertex_flash} · pro={args.vertex_pro}")

    sem = asyncio.Semaphore(args.workers)
    async with httpx.AsyncClient(http2=True, limits=httpx.Limits(max_connections=50)) as client:
        tasks = [process_deputado(client, sem, d["camara_id"], args.ano, args.batch, args.vertex_flash == "on", args.vertex_pro == "on") for d in deputados]
        await asyncio.gather(*tasks, return_exceptions=True)

    log.info("NERO complete.")

if __name__ == "__main__":
    asyncio.run(main())
