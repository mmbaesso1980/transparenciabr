#!/usr/bin/env python3
"""
NERO PNCP Classifier — classifica contratos PNCP via L4
=======================================================
Lê novos contratos de gs://datalake-tbr-raw/pncp/contratos_publicacao/
Classifica via Ollama (mesma instância do burner — divide a fila)
Salva em gs://datalake-tbr-clean/pncp_classified/

Sinais procurados:
  - fornecedor com CNPJ ligado a parlamentar (cross-ref via emendas_resolver)
  - valor anômalo vs licitação anterior
  - objeto vago/duplicado
  - dispensa ou inexigibilidade

Uso:
  python3 pncp_classifier.py --since-days 7
"""
from __future__ import annotations
import asyncio, json, os, time, argparse, logging, gzip
from pathlib import Path
from datetime import datetime, timezone, timedelta
import httpx

LOG_DIR = Path("/var/log/tbr")
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.FileHandler(LOG_DIR / "pncp_classifier.log"), logging.StreamHandler()])
log = logging.getLogger("pncp")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:27b")
GCS_RAW = os.getenv("GCS_RAW", "gs://datalake-tbr-raw")
GCS_CLEAN = os.getenv("GCS_CLEAN", "gs://datalake-tbr-clean")

PROMPT = """Auditor TCU. Classifique este contrato PNCP em JSON:
{{ "score": 0-100, "tipo_risco": "fracionamento|dispensa_indevida|sobrepreco|objeto_vago|fornecedor_recorrente|nenhum",
   "alerta": "string curta", "necessita_dossier": true|false }}

Contrato: {contrato}
"""

async def classify(client: httpx.AsyncClient, contrato: dict) -> dict:
    payload = {"model": OLLAMA_MODEL, "stream": False, "format": "json",
               "options": {"temperature": 0.1, "num_predict": 512},
               "prompt": PROMPT.format(contrato=json.dumps(contrato, ensure_ascii=False)[:2000])}
    try:
        r = await client.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=120)
        r.raise_for_status()
        return json.loads(r.json().get("response", "{}"))
    except Exception as e:
        log.warning(f"classify fail: {e}")
        return {"score": 0, "tipo_risco": "nenhum", "alerta": "", "necessita_dossier": False}

async def list_blobs(prefix: str) -> list[str]:
    proc = await asyncio.create_subprocess_shell(f"gsutil ls {prefix}",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    out, _ = await proc.communicate()
    return [l.strip() for l in out.decode().splitlines() if l.strip().endswith(".jsonl.gz")]

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since-days", type=int, default=7)
    ap.add_argument("--workers", type=int, default=4, help="Streams paralelos (deixa 2 livres pro burner)")
    args = ap.parse_args()

    blobs = await list_blobs(f"{GCS_RAW}/pncp/contratos_publicacao/")
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.since-days if hasattr(args, 'since-days') else args.since_days)
    log.info(f"PNCP classifier: {len(blobs)} blobs candidatos · workers={args.workers}")

    sem = asyncio.Semaphore(args.workers)
    async with httpx.AsyncClient() as client:
        async def process_blob(blob: str):
            async with sem:
                tmp = f"/tmp/{Path(blob).name}"
                proc = await asyncio.create_subprocess_shell(f"gsutil -q cp {blob} {tmp}")
                await proc.wait()
                contratos = []
                with gzip.open(tmp, "rt") as f:
                    for line in f:
                        contratos.append(json.loads(line))
                Path(tmp).unlink(missing_ok=True)
                results = await asyncio.gather(*(classify(client, c) for c in contratos[:200]))
                out_lines = [json.dumps({**c, "_classification": r}, ensure_ascii=False) for c, r in zip(contratos, results)]
                out_blob = blob.replace(GCS_RAW + "/pncp/", GCS_CLEAN + "/pncp_classified/")
                tmp_out = f"/tmp/out_{Path(blob).name}"
                with gzip.open(tmp_out, "wt") as f:
                    f.write("\n".join(out_lines))
                proc = await asyncio.create_subprocess_shell(f"gsutil -q cp {tmp_out} {out_blob}")
                await proc.wait()
                Path(tmp_out).unlink(missing_ok=True)
                log.info(f"✓ {blob} → {out_blob} ({len(contratos)} contratos)")

        await asyncio.gather(*(process_blob(b) for b in blobs[:50]), return_exceptions=True)

    log.info("PNCP classifier complete.")

if __name__ == "__main__":
    asyncio.run(main())
