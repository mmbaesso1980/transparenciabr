#!/usr/bin/env python3
"""
NERO Emendas Resolver — Constrói grafo {parlamentar → emenda → executor → gasto}
================================================================================
Cruza:
  - CEAP classificado (gs://datalake-tbr-clean/ceap_classified/)
  - TransfereGov emendas Pix (gs://datalake-tbr-raw/transferegov/)
  - PNCP contratos classificados (gs://datalake-tbr-clean/pncp_classified/)
  - BrasilAPI CNPJ (lookups bajo demanda)

Saída: gs://datalake-tbr-clean/emendas_graph/{parlamentar_id}.json
Cada arquivo contém o "micro-universo" do parlamentar (CRITICAL pro dossiê).

Uso:
  python3 emendas_resolver.py --ano 2025
"""
from __future__ import annotations
import asyncio, json, os, time, argparse, logging, gzip
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
import httpx

LOG_DIR = Path("/var/log/tbr")
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.FileHandler(LOG_DIR / "emendas_resolver.log"), logging.StreamHandler()])
log = logging.getLogger("resolver")

GCS_RAW = os.getenv("GCS_RAW", "gs://datalake-tbr-raw")
GCS_CLEAN = os.getenv("GCS_CLEAN", "gs://datalake-tbr-clean")

# ---------------------------------------------------------------------------
async def gsutil_cat(blob: str) -> str:
    proc = await asyncio.create_subprocess_shell(f"gsutil cat {blob}",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    out, _ = await proc.communicate()
    return out.decode()

async def gsutil_ls(prefix: str) -> list[str]:
    proc = await asyncio.create_subprocess_shell(f"gsutil ls {prefix}",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    out, _ = await proc.communicate()
    return [l.strip() for l in out.decode().splitlines() if l.strip()]

# ---------------------------------------------------------------------------
async def lookup_cnpj(client: httpx.AsyncClient, cnpj: str, cache: dict) -> dict:
    cnpj = "".join(c for c in cnpj if c.isdigit())
    if not cnpj or len(cnpj) != 14:
        return {}
    if cnpj in cache:
        return cache[cnpj]
    try:
        r = await client.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}", timeout=20)
        r.raise_for_status()
        data = r.json()
        cache[cnpj] = data
        return data
    except Exception:
        return {}

# ---------------------------------------------------------------------------
async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", type=int, default=2025)
    args = ap.parse_args()

    log.info("Resolver: carregando dados…")

    # 1. Carregar roster
    roster = json.loads(await gsutil_cat(f"{GCS_CLEAN}/universe/roster.json"))
    log.info(f"  · {len(roster)} parlamentares no roster")

    # 2. Carregar emendas Pix
    emendas_blobs = await gsutil_ls(f"{GCS_RAW}/transferegov/emendas_pix/")
    emendas_by_autor = defaultdict(list)
    for blob in emendas_blobs[-3:]:  # últimos 3 dumps
        text = await gsutil_cat(blob)
        if blob.endswith(".gz"):
            import io
            text = gzip.decompress(text.encode("latin-1") if isinstance(text, str) else text).decode()
        for line in text.splitlines():
            if not line.strip(): continue
            try:
                e = json.loads(line)
                aut = e.get("autor") or e.get("parlamentar") or e.get("nomeAutor")
                if aut:
                    emendas_by_autor[aut].append(e)
            except Exception:
                pass
    log.info(f"  · {sum(len(v) for v in emendas_by_autor.values())} emendas Pix carregadas")

    # 3. Carregar CEAP classificado
    ceap_blobs = await gsutil_ls(f"{GCS_CLEAN}/ceap_classified/")
    ceap_by_dep = {}
    for blob in ceap_blobs:
        try:
            dep_id = int(Path(blob).stem)
        except ValueError:
            continue
        text = await gsutil_cat(blob)
        ceap_by_dep[dep_id] = [json.loads(l) for l in text.splitlines() if l.strip()]
    log.info(f"  · {len(ceap_by_dep)} deputados com CEAP classificado")

    # 4. Construir grafo por parlamentar
    cnpj_cache = {}
    async with httpx.AsyncClient() as client:
        for dep in roster:
            dep_id = dep.get("camara_id")
            nome = dep.get("nome", "")
            if not dep_id:
                continue

            grafo = {
                "parlamentar": {"id": dep_id, "nome": nome, "partido": dep.get("partido"), "uf": dep.get("uf")},
                "ceap": {"total_notas": 0, "alto_risco": 0, "valor_total": 0.0},
                "emendas_pix": [],
                "fornecedores_recorrentes": [],
                "geracao": datetime.now(timezone.utc).isoformat(),
            }

            # CEAP
            notas = ceap_by_dep.get(dep_id, [])
            grafo["ceap"]["total_notas"] = len(notas)
            grafo["ceap"]["alto_risco"] = sum(1 for n in notas if (n.get("_score_l4") or 0) >= 70)
            grafo["ceap"]["valor_total"] = sum(float(n.get("vlrLiquido") or 0) for n in notas)

            # Fornecedores recorrentes
            fornec = defaultdict(lambda: {"count": 0, "total": 0.0, "cnpj": None})
            for n in notas:
                key = (n.get("txtFornecedor") or "").strip().upper()
                if not key:
                    continue
                fornec[key]["count"] += 1
                fornec[key]["total"] += float(n.get("vlrLiquido") or 0)
                fornec[key]["cnpj"] = n.get("txtCNPJCPF")
            recorrentes = sorted(fornec.items(), key=lambda kv: kv[1]["total"], reverse=True)[:10]
            for nome_f, info in recorrentes:
                cnpj_data = {}
                if info["cnpj"]:
                    cnpj_data = await lookup_cnpj(client, info["cnpj"], cnpj_cache)
                grafo["fornecedores_recorrentes"].append({
                    "fornecedor": nome_f, "cnpj": info["cnpj"],
                    "notas_count": info["count"], "valor_total": info["total"],
                    "atividade_principal": cnpj_data.get("cnae_fiscal_descricao"),
                    "data_abertura": cnpj_data.get("data_inicio_atividade"),
                    "porte": cnpj_data.get("porte"),
                })

            # Emendas Pix
            grafo["emendas_pix"] = emendas_by_autor.get(nome.upper(), [])[:20]

            # Salvar
            tmp = f"/tmp/grafo_{dep_id}.json"
            Path(tmp).write_text(json.dumps(grafo, ensure_ascii=False, indent=2))
            proc = await asyncio.create_subprocess_shell(f"gsutil -q cp {tmp} {GCS_CLEAN}/emendas_graph/{dep_id}.json")
            await proc.wait()
            Path(tmp).unlink(missing_ok=True)

    log.info(f"Resolver complete. CNPJ cache size: {len(cnpj_cache)}")

if __name__ == "__main__":
    asyncio.run(main())
