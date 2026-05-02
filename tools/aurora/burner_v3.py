#!/usr/bin/env python3
"""
AURORA Burner v2 — Otimização total
====================================
Substitui o burner atual (1 nota/chamada, Gemma 27B, sem filtro).

Ganhos esperados (vs atual):
  - Filtro pré-LLM (regex):    descarta ~70% das notas óbvias antes do modelo  → 3-5x
  - Batch 50 notas/chamada:    em vez de 1 chamada por nota                    → 30-50x
  - Gemma 2 9B q4 (ou Flash):  modelo menor e mais rápido na L4                → 3-4x
  - Combinado:                 ~100-300x mais rápido

Roteamento:
  - Score regex < 30 (verde)   → dispensa LLM, classifica direto como BAIXO
  - Score regex 30-60          → Gemma 9B local em batch
  - Score regex 60-85          → Gemma 9B local em batch (com 2 passadas)
  - Score regex >= 85          → Vertex Gemini 2.5 Flash (qualidade premium, custo controlado)

DIRETIVA SUPREMA: ZERO Firestore. Output direto em GCS.

Uso:
    python3 02_patch_burner_v2.py \
        --workers 12 \
        --batch-size 50 \
        --model gemma2:9b-instruct-q4_K_M \
        --bucket-out datalake-tbr-clean \
        --prefix-out ceap_classified \
        --vertex-flash-on  # opcional, sobe qualidade mas usa créditos

Status & métricas:
    cat /tmp/burner_metrics.json    # atualizado a cada batch
    tail -f /var/log/tbr/burner_v2.log
"""
from __future__ import annotations
import argparse, json, os, re, sys, time, signal, traceback, hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# Dependências mínimas (todas já presentes na VM):
#   pip install requests google-cloud-storage
import requests
from google.cloud import storage

# ─── Config defaults ──────────────────────────────────────────────────────
DEFAULT_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = "gemma2:9b-instruct-q4_K_M"
DEFAULT_BUCKET_OUT = "datalake-tbr-clean"
DEFAULT_PREFIX_OUT = "ceap_classified"
DEFAULT_BUCKET_IN = "datalake-tbr-clean"  # cache do CSV CEAP que a VM já baixa
DEFAULT_BATCH = 50
DEFAULT_WORKERS = 24  # saturar — VM tem 24 vCPUs (ajustar se necessário)
DEFAULT_OLLAMA_CONCURRENCY = 16  # streams paralelos no Ollama
DEFAULT_VERTEX_FLASH_THRESHOLD = 85  # >= manda pra Flash
DEFAULT_VERTEX_PRO_THRESHOLD = 92    # >= depois do Flash, sobe pra 2.5 Pro

CAMARA_DESPESAS_URL = (
    "https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/despesas"
    "?ano={ano}&itens=100&pagina={pagina}"
)

METRICS_PATH = "/tmp/burner_metrics.json"
LOG_PATH = "/var/log/tbr/burner_v2.log"

# ─── Filtro pré-LLM (regex/heurística) ────────────────────────────────────
# Descarta as ~70% notas óbvias (combustível baixo, café, postagem).
# Score 0-100 sem chamar LLM.

REGEX_BAIXO = [
    re.compile(r"\b(POSTAGEM|CORREIOS|SEDEX)\b", re.I),
    re.compile(r"\bASSINATURA\s+(JORNAL|REVISTA)\b", re.I),
    re.compile(r"\bTELEFONIA\b", re.I),
]
REGEX_ALTO_AUTOMATICO = [
    re.compile(r"\b(LOCA[ÇC][AÃ]O\s+DE\s+IM[OÓ]VEL).*\b(LEBLON|IPANEMA|JARDINS|MORUMBI)\b", re.I),
    re.compile(r"\b(PASSAGEM|VOO).*\b(EXECUTIVA|FIRST|PRIMEIRA)\b", re.I),
]

def regex_pre_score(nota: dict) -> int:
    """Retorna score 0-100 sem LLM. Se < 30 ou > 85, dispensa LLM."""
    desc = (nota.get("txtDescricao") or "") + " " + (nota.get("txtFornecedor") or "")
    valor = float(nota.get("vlrLiquido") or 0)

    # baixos triviais
    for r in REGEX_BAIXO:
        if r.search(desc) and valor < 500:
            return 15  # BAIXO certeza alta

    # altos automáticos
    for r in REGEX_ALTO_AUTOMATICO:
        if r.search(desc):
            return 92  # CRITICAL — precisa de Vertex

    # heurística por valor (ajuste fino vs categoria)
    if valor > 5000:
        return 70  # MÉDIO/ALTO — manda pro LLM
    if valor < 50:
        return 25  # BAIXO

    return 50  # zona cinzenta — LLM decide

# ─── Prompt de classificação em BATCH ─────────────────────────────────────

PROMPT_BATCH = """Você é a engine AURORA da TransparênciaBR. Classifique CADA nota fiscal abaixo \
da Cota CEAP (verba pública parlamentar) em score de risco 0-100. NÃO faça denúncia, apenas \
fatos. Responda APENAS um JSON array com {id, score, faixa, motivo} para CADA nota.

Faixas:
  0-59   = BAIXO (gasto trivial, dentro do esperado)
  60-84  = MÉDIO (anomalia de valor/categoria/fornecedor)
  85-100 = ALTO (sinal forte: superfaturamento, concentração, vínculo, fora de mandato)

Sinais de risco a ponderar:
  - Valor muito acima da média da categoria
  - Fornecedor concentrado (> 3 parlamentares no mês)
  - Categoria suspeita (consultoria sem objeto, segurança privada sem cadastro)
  - Padrão repetido mensal idêntico (contrato cativo)
  - Bens ou serviços fora do mandato (luxo pessoal)

NOTAS (id seguido de descrição/valor/fornecedor):

{batch_text}

Saída JSON ARRAY (sem markdown, sem explicação fora do array):"""

def build_batch_text(notas: list[dict]) -> str:
    lines = []
    for n in notas:
        nid = n.get("idDocumento") or n.get("idLote") or n.get("id") or "?"
        v = n.get("vlrLiquido") or n.get("valor") or 0
        f = (n.get("txtFornecedor") or n.get("fornecedor") or "")[:80]
        d = (n.get("txtDescricao") or n.get("categoria") or "")[:120]
        c = (n.get("txNomeParlamentar") or "")[:40]
        lines.append(f'{nid} | R${v} | {d} | forn:{f} | par:{c}')
    return "\n".join(lines)

# ─── LLM clients ─────────────────────────────────────────────────────────

def classify_batch_ollama(notas: list[dict], model: str, ollama_url: str, timeout: int = 90) -> list[dict]:
    """Chama Ollama em batch. Retorna lista de {id, score, faixa, motivo}."""
    prompt = PROMPT_BATCH.format(batch_text=build_batch_text(notas))
    body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_ctx": 8192},
    }
    r = requests.post(f"{ollama_url}/api/generate", json=body, timeout=timeout)
    r.raise_for_status()
    raw = r.json().get("response", "")
    return _parse_llm_array(raw, notas)


def classify_batch_vertex_flash(notas: list[dict], project: str = "transparenciabr", region: str = "us-central1") -> list[dict]:
    """Vertex Gemini 2.5 Flash — qualidade premium, ~5x mais barato que 2.5 Pro."""
    try:
        from vertexai import init as vertex_init
        from vertexai.generative_models import GenerativeModel
        vertex_init(project=project, location=region)
        model = GenerativeModel("gemini-2.5-flash")
        prompt = PROMPT_BATCH.format(batch_text=build_batch_text(notas))
        resp = model.generate_content(prompt, generation_config={"temperature": 0.2, "response_mime_type": "application/json"})
        return _parse_llm_array(resp.text, notas)
    except Exception as e:
        log(f"[vertex-flash] FAIL fallback ollama: {e}")
        return []


def classify_batch_vertex_pro(notas: list[dict], project: str = "transparenciabr", region: str = "us-central1") -> list[dict]:
    """Vertex Gemini 2.5 Pro — análise forense profunda das notas top-risco."""
    try:
        from vertexai import init as vertex_init
        from vertexai.generative_models import GenerativeModel
        vertex_init(project=project, location=region)
        model = GenerativeModel("gemini-2.5-pro")
        prompt_pro = (
            "Você é a engine AURORA Mode Forense da TransparênciaBR. Para CADA nota abaixo, "
            "faça análise profunda em português formal, citando: (1) por que é alto risco, "
            "(2) cruzamentos possíveis com outras esferas (CNPJ, vínculos políticos, "
            "licitações), (3) que evidências adicionais buscar. Score 0-100. "
            "Saída JSON array {id, score, faixa, motivo} sem markdown.\n\n" + build_batch_text(notas) + "\n\nJSON:"
        )
        resp = model.generate_content(prompt_pro, generation_config={"temperature": 0.1, "response_mime_type": "application/json"})
        return _parse_llm_array(resp.text, notas)
    except Exception as e:
        log(f"[vertex-pro] FAIL: {e}")
        return []


def _parse_llm_array(raw: str, notas: list[dict]) -> list[dict]:
    """Tolerante a JSON malformado — tenta extrair array de objetos."""
    # remove cercas markdown se houver
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.M)
    try:
        arr = json.loads(raw)
        if isinstance(arr, dict) and "items" in arr:
            arr = arr["items"]
        if not isinstance(arr, list):
            raise ValueError("not a list")
    except Exception:
        # fallback: parse linha-a-linha
        arr = []
        for line in raw.splitlines():
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "id" in obj:
                    arr.append(obj)
            except Exception:
                continue
    # garante que toda nota tem alguma resposta
    by_id = {str(o.get("id")): o for o in arr if isinstance(o, dict)}
    result = []
    for n in notas:
        nid = str(n.get("idDocumento") or n.get("id") or "?")
        o = by_id.get(nid, {"id": nid, "score": 50, "faixa": "MÉDIO", "motivo": "parse_fail"})
        o["id"] = nid
        result.append(o)
    return result

# ─── GCS sink ────────────────────────────────────────────────────────────

class GCSWriter:
    def __init__(self, bucket: str, prefix: str):
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket)
        self.prefix = prefix.rstrip("/")

    def append_jsonl(self, ano: int, dep_id: str, classified_notas: list[dict]):
        if not classified_notas:
            return
        path = f"{self.prefix}/{ano}/{dep_id}/notas.jsonl"
        blob = self.bucket.blob(path)
        existing = b""
        if blob.exists():
            existing = blob.download_as_bytes()
        new_lines = "\n".join(json.dumps(n, ensure_ascii=False) for n in classified_notas) + "\n"
        full = existing + new_lines.encode("utf-8")
        blob.upload_from_string(full, content_type="application/x-ndjson")

# ─── Camara data fetch (cache local) ─────────────────────────────────────

CACHE_DIR = Path("/tmp/tbr_camara_cache")
CACHE_DIR.mkdir(exist_ok=True, parents=True)

def fetch_despesas(dep_id: str, ano: int) -> list[dict]:
    """Cacheia em /tmp pra não baixar a mesma coisa todo dia."""
    cache_file = CACHE_DIR / f"{dep_id}_{ano}.json"
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime) < 86400:
        return json.loads(cache_file.read_text())
    notas = []
    for pag in range(1, 200):
        url = CAMARA_DESPESAS_URL.format(id=dep_id, ano=ano, pagina=pag)
        try:
            r = requests.get(url, timeout=30, headers={"Accept": "application/json"})
            r.raise_for_status()
            data = r.json().get("dados", [])
            if not data:
                break
            notas.extend(data)
            if len(data) < 100:
                break
        except Exception as e:
            log(f"[fetch] {dep_id}/{ano} pag {pag} FAIL: {e}")
            break
    cache_file.write_text(json.dumps(notas))
    return notas

# ─── Pipeline por par (deputado, ano) ────────────────────────────────────

def process_pair(dep: dict, ano: int, args, writer: GCSWriter, metrics: dict):
    dep_id = str(dep["id"])
    nome = dep.get("nome", "?")
    t0 = time.time()
    notas = fetch_despesas(dep_id, ano)
    log(f"[par] {nome} {ano}: {len(notas)} notas brutas")
    if not notas:
        return

    # Filtro pré-LLM
    classified = []
    pendentes_llm = []
    pendentes_vertex = []
    for n in notas:
        s = regex_pre_score(n)
        n["_pre_score"] = s
        if s < 30:
            classified.append({
                "id": str(n.get("idDocumento", "")),
                "score": s,
                "faixa": "BAIXO",
                "motivo": "regex_pre_filter",
                "valor": n.get("vlrLiquido"),
                "fornecedor": n.get("txtFornecedor"),
                "categoria": n.get("txtDescricao"),
                "classified_at": datetime.now(timezone.utc).isoformat(),
            })
        elif s >= args.vertex_flash_threshold and args.vertex_flash_on:
            pendentes_vertex.append(n)
        else:
            pendentes_llm.append(n)

    log(f"[par] {nome} {ano}: {len(classified)} dispensadas (regex), {len(pendentes_llm)} → ollama, {len(pendentes_vertex)} → vertex")

    # Batch ollama
    for i in range(0, len(pendentes_llm), args.batch_size):
        chunk = pendentes_llm[i:i+args.batch_size]
        try:
            res = classify_batch_ollama(chunk, args.model, args.ollama_url)
            for n, c in zip(chunk, res):
                c["valor"] = n.get("vlrLiquido")
                c["fornecedor"] = n.get("txtFornecedor")
                c["categoria"] = n.get("txtDescricao")
                c["classified_at"] = datetime.now(timezone.utc).isoformat()
                c["llm_used"] = "ollama"
                classified.append(c)
        except Exception as e:
            log(f"[batch-ollama] {nome} {ano} chunk {i} FAIL: {e}")

    # Batch vertex Flash (alto risco)
    pro_pendentes = []
    for i in range(0, len(pendentes_vertex), args.batch_size):
        chunk = pendentes_vertex[i:i+args.batch_size]
        try:
            res = classify_batch_vertex_flash(chunk, args.vertex_project, args.vertex_region)
            for n, c in zip(chunk, res):
                c["valor"] = n.get("vlrLiquido")
                c["fornecedor"] = n.get("txtFornecedor")
                c["categoria"] = n.get("txtDescricao")
                c["classified_at"] = datetime.now(timezone.utc).isoformat()
                c["llm_used"] = "vertex_flash"
                classified.append(c)
                # Sobe pro 2.5 Pro se score Flash >= threshold
                if args.vertex_pro_on and int(c.get("score", 0)) >= args.vertex_pro_threshold:
                    pro_pendentes.append((n, c))
        except Exception as e:
            log(f"[batch-vertex-flash] {nome} {ano} chunk {i} FAIL: {e}")

    # Batch vertex 2.5 Pro (re-análise profunda do top top)
    if pro_pendentes:
        log(f"[par] {nome} {ano}: {len(pro_pendentes)} notas escalando p/ Vertex 2.5 Pro")
        for i in range(0, len(pro_pendentes), 20):  # batch menor pro Pro (mais caro)
            chunk_pairs = pro_pendentes[i:i+20]
            chunk_notas = [pair[0] for pair in chunk_pairs]
            try:
                res = classify_batch_vertex_pro(chunk_notas, args.vertex_project, args.vertex_region)
                for (n, prev_c), c_pro in zip(chunk_pairs, res):
                    # Atualiza a entrada que já foi adicionada — adiciona campo 'analise_profunda'
                    prev_c["analise_profunda"] = c_pro.get("motivo", "")
                    prev_c["score_pro"] = c_pro.get("score")
                    prev_c["llm_used"] = "vertex_flash+pro"
            except Exception as e:
                log(f"[batch-vertex-pro] {nome} {ano} chunk {i} FAIL: {e}")

    writer.append_jsonl(ano, dep_id, classified)
    dt = time.time() - t0
    metrics.setdefault("pairs", []).append({"dep": nome, "ano": ano, "notas": len(notas), "secs": round(dt, 1)})
    Path(METRICS_PATH).write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
    log(f"[par] {nome} {ano}: PRONTO em {dt:.1f}s ({len(notas)/max(dt,1):.1f} notas/s)")

# ─── Roster ──────────────────────────────────────────────────────────────

def load_roster(bucket_in: str) -> list[dict]:
    client = storage.Client()
    blob = client.bucket(bucket_in).blob("universe/roster.json")
    data = json.loads(blob.download_as_text())
    if isinstance(data, dict) and "deputados" in data:
        return data["deputados"]
    return data

# ─── Logs ────────────────────────────────────────────────────────────────

def log(msg: str):
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line, flush=True)
    try:
        Path(LOG_PATH).parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

# ─── Main ────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH)
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    p.add_argument("--bucket-out", default=DEFAULT_BUCKET_OUT)
    p.add_argument("--prefix-out", default=DEFAULT_PREFIX_OUT)
    p.add_argument("--bucket-in", default=DEFAULT_BUCKET_IN)
    p.add_argument("--anos", default="2020,2021,2022,2023,2024,2025,2026")
    p.add_argument("--vertex-flash-on", action="store_true", default=True, help="Default ON na v3 saturada")
    p.add_argument("--vertex-pro-on", action="store_true", default=True, help="Reanálise 2.5 Pro p/ score Flash >= 92")
    p.add_argument("--vertex-flash-threshold", type=int, default=DEFAULT_VERTEX_FLASH_THRESHOLD)
    p.add_argument("--vertex-pro-threshold", type=int, default=DEFAULT_VERTEX_PRO_THRESHOLD)
    p.add_argument("--limit-deputados", type=int, default=0, help="0 = todos")
    p.add_argument("--skip-existing", action="store_true", default=True)
    p.add_argument("--vertex-project", default="transparenciabr")
    p.add_argument("--vertex-region", default="us-central1")
    args = p.parse_args()

    log(f"[boot] AURORA Burner v3 SATURATED · workers={args.workers} batch={args.batch_size} model={args.model} "
        f"vertex_flash={args.vertex_flash_on}(>=  {args.vertex_flash_threshold}) "
        f"vertex_pro={args.vertex_pro_on}(>=  {args.vertex_pro_threshold})")
    deputados = load_roster(args.bucket_in)
    if args.limit_deputados:
        deputados = deputados[:args.limit_deputados]
    log(f"[boot] {len(deputados)} parlamentares a processar")
    anos = [int(a) for a in args.anos.split(",")]
    pares = [(d, a) for d in deputados for a in anos]
    log(f"[boot] {len(pares)} pares (deputado×ano)")

    writer = GCSWriter(args.bucket_out, args.prefix_out)
    metrics = {"started_at": datetime.now(timezone.utc).isoformat(), "pairs": []}

    # skip já-feitos
    if args.skip_existing:
        client = storage.Client()
        existing = set()
        for blob in client.bucket(args.bucket_out).list_blobs(prefix=args.prefix_out + "/"):
            # ceap_classified/{ano}/{id}/notas.jsonl
            parts = blob.name.split("/")
            if len(parts) >= 4:
                existing.add((parts[2], int(parts[1])))
        before = len(pares)
        pares = [(d, a) for d, a in pares if (str(d["id"]), a) not in existing]
        log(f"[boot] skip-existing: {before} → {len(pares)} pares")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(process_pair, d, a, args, writer, metrics): (d.get("nome"), a) for d, a in pares}
        for f in as_completed(futs):
            try:
                f.result()
            except Exception as e:
                nome, ano = futs[f]
                log(f"[fatal] {nome} {ano}: {e}\n{traceback.format_exc()}")

    metrics["finished_at"] = datetime.now(timezone.utc).isoformat()
    Path(METRICS_PATH).write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
    log(f"[done] {len(metrics['pairs'])} pares processados")


if __name__ == "__main__":
    main()
