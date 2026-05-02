#!/usr/bin/env python3
"""
NERO Crawlers — 30+ tarefas asyncio paralelas, CPU-only.
========================================================
Lê arsenal_mestre.json e roda TODOS os crawlers ao mesmo tempo.
Cada um escreve em gs://datalake-tbr-raw/{grupo}/{endpoint}/{ts}.jsonl

NÃO toca GPU — pode rodar lado a lado com burner_v4_nero.py.
Saturação esperada: ~50% CPU, ~50 MB/s rede.

Uso:
  python3 crawlers_nero.py --arsenal arsenal_mestre.json --portal-key $PORTAL_KEY
  python3 crawlers_nero.py --once --groups camara,senado  # só uma rodada
"""
from __future__ import annotations
import asyncio, json, os, sys, time, argparse, logging, gzip
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any
import httpx

LOG_DIR = Path("/var/log/tbr")
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_DIR / "crawlers.log"), logging.StreamHandler()],
)
log = logging.getLogger("crawlers")

GCS_RAW = os.getenv("GCS_RAW", "gs://datalake-tbr-raw")

# ---------------------------------------------------------------------------
async def fetch_paginated(client: httpx.AsyncClient, base: str, path: str, headers: dict, params: dict, rate: int) -> list[dict]:
    """Fetch genérico com paginação. Detecta automaticamente formato {dados:[...]} ou lista raw."""
    out = []
    page = 1
    interval = 60.0 / rate
    while True:
        url = f"{base}{path}"
        try:
            full_params = {**params, "pagina": page}
            r = await client.get(url, headers=headers, params=full_params, timeout=60)
            if r.status_code == 429:
                log.warning(f"{path} rate-limited, sleeping 30s")
                await asyncio.sleep(30)
                continue
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log.warning(f"{path} p{page}: {e}")
            break

        items = data.get("dados") or data.get("results") or data.get("items") or (data if isinstance(data, list) else [])
        if not items:
            break
        out.extend(items)
        page += 1
        if page > 200:  # hard cap
            break
        await asyncio.sleep(interval)
    return out

async def upload_gcs(grupo: str, endpoint: str, items: list[dict]) -> None:
    if not items:
        return
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tmp = f"/tmp/{grupo}_{endpoint}_{ts}.jsonl.gz"
    with gzip.open(tmp, "wt") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    dest = f"{GCS_RAW}/{grupo}/{endpoint}/{ts}.jsonl.gz"
    proc = await asyncio.create_subprocess_shell(f"gsutil -q cp {tmp} {dest}")
    await proc.wait()
    Path(tmp).unlink(missing_ok=True)
    log.info(f"  ↑ {grupo}/{endpoint}: {len(items)} items → {dest}")

# ---------------------------------------------------------------------------
async def crawl_endpoint(client: httpx.AsyncClient, grupo: str, group_meta: dict, name: str, path: str, args):
    """Roda um endpoint específico. Faz substituição de placeholders básicos."""
    headers = {}
    if group_meta.get("auth"):
        if grupo == "portal_transparencia":
            if not args.portal_key:
                log.warning(f"⏭  {grupo}/{name}: skipped (no PORTAL_KEY)")
                return
            headers[group_meta["auth_header"]] = args.portal_key
    headers.setdefault("User-Agent", "TransparenciaBR/1.0 (+https://github.com/mmbaesso1980/transparenciabr)")

    # Placeholders
    today = datetime.now(timezone.utc).date()
    d2 = today.strftime("%d/%m/%Y")
    d1 = (today - timedelta(days=30)).strftime("%d/%m/%Y")
    d2_iso = today.strftime("%Y-%m-%d")
    d1_iso = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    ano = today.year
    path_filled = path.format(
        page="{page}", ano=ano, mes=today.month,
        d1=d1, d2=d2, d1_iso=d1_iso, d2_iso=d2_iso,
        autor="", funcao="", orgao="", mod="1",
        id="X", codigo="X", id_emenda="X", id_municipio="X",
        cod_mun="X", cnpj="X", numero="X", uid="X", seq="X",
    )

    # Endpoints com placeholders não-substituíveis (ex: {id}) — pulamos por enquanto
    if "{" in path_filled.replace("{page}", ""):
        log.info(f"⏭  {grupo}/{name}: skipped (needs runtime params)")
        return

    rate = group_meta.get("rate_per_min", 30)
    try:
        items = await fetch_paginated(client, group_meta["base"], path_filled, headers, {}, rate)
        await upload_gcs(grupo, name, items)
    except Exception as e:
        log.error(f"✗ {grupo}/{name}: {e}")

async def crawl_group(client: httpx.AsyncClient, sem: asyncio.Semaphore, grupo: str, group_meta: dict, args):
    async with sem:
        log.info(f"▶ {grupo} ({group_meta['priority']}, {len(group_meta['endpoints'])} endpoints)")
        tasks = [crawl_endpoint(client, grupo, group_meta, name, path, args) for name, path in group_meta["endpoints"]]
        await asyncio.gather(*tasks, return_exceptions=True)

# ---------------------------------------------------------------------------
async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arsenal", default="arsenal_mestre.json")
    ap.add_argument("--portal-key", default=os.getenv("PORTAL_KEY", ""))
    ap.add_argument("--groups", help="Filtrar grupos (csv)", default="")
    ap.add_argument("--once", action="store_true", help="1 rodada e sai")
    ap.add_argument("--interval-min", type=int, default=60, help="Minutos entre rodadas")
    ap.add_argument("--max-parallel-groups", type=int, default=4)
    args = ap.parse_args()

    arsenal = json.loads(Path(args.arsenal).read_text())
    groups = arsenal["groups"]
    if args.groups:
        wanted = set(args.groups.split(","))
        groups = {k: v for k, v in groups.items() if k in wanted}

    log.info(f"NERO crawlers: {len(groups)} grupos · portal_key={'SET' if args.portal_key else 'MISSING'}")

    sem = asyncio.Semaphore(args.max_parallel_groups)
    while True:
        t0 = time.time()
        async with httpx.AsyncClient(http2=True, follow_redirects=True, limits=httpx.Limits(max_connections=200)) as client:
            tasks = [crawl_group(client, sem, name, meta, args) for name, meta in groups.items()]
            await asyncio.gather(*tasks, return_exceptions=True)
        log.info(f"=== Rodada completa em {(time.time()-t0)/60:.1f}min ===")
        if args.once:
            break
        await asyncio.sleep(args.interval_min * 60)

if __name__ == "__main__":
    asyncio.run(main())
