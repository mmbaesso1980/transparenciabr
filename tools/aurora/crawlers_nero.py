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

        # Aceita: {dados:[...]}, {results:[...]}, {items:[...]}, lista direta, ou dict com 'data'
        if isinstance(data, list):
            items = data
            single_page = True  # APIs que retornam lista direta normalmente nao paginam
        elif isinstance(data, dict):
            items = data.get("dados") or data.get("results") or data.get("items") or data.get("data") or []
            single_page = False
            if not isinstance(items, list):
                items = []
        else:
            items = []
            single_page = True
        if not items:
            break
        out.extend(items)
        if single_page:
            break
        page += 1
        if page > 200:  # hard cap
            break
        await asyncio.sleep(interval)
    return out

# Mapeamento (grupo, endpoint) -> subdir RAW EXISTENTE no datalake-tbr-raw.
# Respeita estrutura ja' criada para nao poluir o lake com duplicatas.
PATH_MAP = {
    ("camara", "deputados"):                      "funcionarios_camara",
    ("camara", "despesas"):                       "ceap_camara",
    ("camara", "eventos"):                        "funcionarios_camara/eventos",
    ("camara", "orgaos"):                         "funcionarios_camara/orgaos",
    ("camara", "frentes"):                        "funcionarios_camara/frentes",
    ("camara", "ocupacoes"):                      "funcionarios_camara/ocupacoes",
    ("camara", "mandatosExternos"):               "funcionarios_camara/mandatos",
    ("camara", "profissoes"):                     "funcionarios_camara/profissoes",
    ("camara", "historico"):                      "funcionarios_camara/historico",
    ("senado", "senadores_atual"):                "servidores_senado",
    ("senado", "senador_dados"):                  "servidores_senado/dados",
    ("senado", "senador_apartes"):                "ceaps_senado/apartes",
    ("senado", "senador_discursos"):              "ceaps_senado/discursos",
    ("senado", "senador_votacoes"):               "ceaps_senado/votacoes",
    ("senado", "senador_relatorias"):             "ceaps_senado/relatorias",
    ("portal_transparencia", "servidores"):       "funcionarios_camara/cgu_servidores",
    ("portal_transparencia", "viagens"):          "funcionarios_camara/cgu_viagens",
    ("portal_transparencia", "emendas_parlamentar"): "emendas_parlamentares",
    ("portal_transparencia", "emendas_localidade"): "cgu_emendas_localidade",
    ("portal_transparencia", "contratos"):        "pncp_contratos/cgu",
    ("portal_transparencia", "convenios"):        "transferegov_relatorio_gestao/convenios",
    ("portal_transparencia", "gastos_diretos"):   "transferegov_relatorio_gestao/gastos",
    ("portal_transparencia", "licitacoes"):       "pncp_contratos/licitacoes",
    ("portal_transparencia", "ceis"):              "sancoes/ceis",
    ("portal_transparencia", "cnep"):              "sancoes/cnep",
    ("portal_transparencia", "cepim"):             "sancoes/cepim",
    ("pncp", "contratos_publicacao"):              "pncp_contratos",
    ("pncp", "contratacoes_publicacao"):           "pncp_contratos/contratacoes",
    ("pncp", "planos_contratacao"):                "pncp_contratos/planos",
    ("pncp", "planos_itens"):                      "pncp_contratos/planos_itens",
    ("pncp", "atas"):                              "pncp_contratos/atas",
    ("transferegov", "emendas_pix"):               "emendas_pix",
    ("transferegov", "detalhes_emenda"):           "emendas_pix/detalhes",
    ("transferegov", "planos_acao"):               "emendas_pix_planos",
    ("transferegov", "executor_especial"):         "emendas_pix_executor",
    ("transferegov", "municipios"):                "transferegov_relatorio_gestao/municipios",
    ("tcu", "acordaos"):                           "sancoes/tcu_acordaos",
    ("tcu", "pj_publica"):                         "sancoes/tcu_pj",
    ("tcu", "sancoes"):                            "sancoes/tcu_sancoes",
    ("tcu", "cadirreg"):                           "sancoes/tcu_cadirreg",
    ("querido_diario", "gazettes_recentes"):       "querido_diario/recentes",
    ("querido_diario", "gazettes_search_general"): "querido_diario/search",
    ("querido_diario", "cities"):                  "querido_diario/cities",
    ("querido_diario", "territories"):             "querido_diario/territories",
    ("dou", "publicacoes"):                        "querido_diario/dou",
    ("datasus", "estabelecimentos"):               "saude/cnes_estabelecimentos",
    ("datasus", "leitos"):                         "saude/cnes_leitos",
    ("datasus", "profissionais"):                  "saude/cnes_profissionais",
    ("ibge", "municipios"):                        "ibge/municipios",
    ("ibge", "estados"):                           "ibge/estados",
    ("ibge", "populacao"):                         "ibge/populacao",
    ("atlas_brasil", "idh_municipio"):             "ibge/idh",
    ("brasilapi_cnpj", "cnpj"):                    "funcionarios_camara/cnpjs",
    ("tse", "candidato"):                          "funcionarios_camara/tse_candidatos",
}

async def upload_gcs(grupo: str, endpoint: str, items: list[dict]) -> None:
    if not items:
        return
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tmp = f"/tmp/{grupo}_{endpoint}_{ts}.jsonl.gz"
    with gzip.open(tmp, "wt") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    # Usa subdir EXISTENTE do datalake quando possivel (PATH_MAP),
    # senao cria estrutura nova com prefix "_aurora_" (visivel pra reorganizar depois).
    subdir = PATH_MAP.get((grupo, endpoint), f"_aurora_{grupo}/{endpoint}")
    dest = f"{GCS_RAW}/{subdir}/aurora_{ts}.jsonl.gz"
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
    # DOU retorna HTML (nao JSON) - precisa scraper proprio, removido por enquanto
    groups.pop("dou", None)
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
