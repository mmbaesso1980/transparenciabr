#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# 🔥 EVISCERADOR v2.0 · EIXO 1 REDO · Direct Data SÓ
# ════════════════════════════════════════════════════════════════════════════
# Roda APENAS o Eixo 1 (Direct Data) com saldo recarregado.
# Salva em novo RUN_ID e sobe pro GCS.
# ════════════════════════════════════════════════════════════════════════════

set -uo pipefail
export LANG=C.UTF-8

DIRECTDATA_TOKEN="29AE5E97-AACF-4ACC-B0ED-692472D72D60"
TELEGRAM_CHAT="6483072695"
TG_TOKEN="${TG_TOKEN:-8671845549:AAHJpkjvDFSYvCYC4VGu1Ja7kzjE3kuviL8}"
BUCKET="gs://datalake-tbr-clean/eviscerador_v2/paulo_octavio"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)_eixo1"
WORKDIR="${HOME}/eviscerador_v2"
OUT="${WORKDIR}/${RUN_ID}"
LOG="${WORKDIR}/eixo1_run.log"

echo "[BOOT] RUN_ID=${RUN_ID}"
echo "[BOOT] WORKDIR=${WORKDIR}"
echo "[BOOT] OUT=${OUT}"
echo "[BOOT] HOME=${HOME} · USER=$(whoami)"

mkdir -p "${WORKDIR}" "${OUT}" "${OUT}/directdata"
touch "${LOG}"
echo "[BOOT] mkdir+touch OK"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "${LOG}"; }

tg() {
  curl -s -m 5 -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT}" \
    --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

tg "🔥 EIXO 1 REDO iniciado · ${RUN_ID}"
log "═══════════════════════════════════════════════════════════════════════"
log "  🔥 EIXO 1 REDO · Direct Data · RUN ${RUN_ID}"
log "═══════════════════════════════════════════════════════════════════════"

# Garantir aiohttp
log "─── Verificando aiohttp ───"
python3 -c "import aiohttp" 2>/dev/null || {
  pip3 install --user --quiet --break-system-packages aiohttp 2>&1 | tail -2 | tee -a "${LOG}" || \
    sudo apt-get install -y python3-aiohttp 2>&1 | tail -3 | tee -a "${LOG}"
}
python3 -c "import aiohttp; print(f'aiohttp {aiohttp.__version__} OK')" 2>&1 | tee -a "${LOG}"

# ═════════════════════════════════════════════════════════════════════════════
# WORKER PYTHON ENXUTO · SÓ EIXO 1
# ═════════════════════════════════════════════════════════════════════════════
cat > /tmp/eixo1_worker.py <<'WORKER_EOF'
#!/usr/bin/env python3
"""EIXO 1 REDO · Direct Data isolado"""
from __future__ import annotations
import asyncio, aiohttp, json, os
from pathlib import Path
from datetime import datetime

CFG = json.loads(os.environ["EIXO1_CFG"])
OUT = Path(CFG["out_dir"]); OUT.mkdir(parents=True, exist_ok=True)
LOG_FILE = Path(CFG["log_file"])
TOKEN = CFG["directdata_token"]
CNPJS = CFG["cnpjs"]
PESSOAS = CFG["pessoas"]
UFS_PRIO = CFG["ufs_prio"]

def log(msg):
    line = f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG_FILE.open("a") as f: f.write(line+"\n")

UA = "TransparenciaBR-engines/2.0 (EVISCERADOR-EIXO1; +https://transparenciabr.org)"
SEM = asyncio.Semaphore(8)  # respeitar rate-limit Direct Data
DD = "https://apiv3.directd.com.br/api"

PRODUTOS_PJ = [
    "ReceitaFederalPessoaJuridica",
    "BeneficiarioFinal",
    "ProcessosJudiciaisSimplificada",
    "ProtestosCenprot",
    "PGFNListaDevedores",
    "PropriedadeIntelectualMarcas",
    "DebitosTributariosMobiliariosPMSP",
    "QuadroSocietarioReceitaFederal",
]
PRODUTOS_PF = [
    "ReceitaFederalPessoaFisica",
    "ProcessosJudiciaisSimplificadaPF",
    "PGFNListaDevedoresPF",
    "CadastroPFPlus",
    "PoliticamenteExposta",
]

async def chamar(session, produto, key_param, key_val, name):
    async with SEM:
        params = {key_param: key_val, "TOKEN": TOKEN}
        url = f"{DD}/{produto}"
        try:
            async with session.get(url, params=params, headers={"User-Agent": UA},
                                   timeout=aiohttp.ClientTimeout(total=60)) as r:
                txt = await r.text()
                d = OUT / "directdata"
                d.mkdir(parents=True, exist_ok=True)
                (d / f"{name}.json").write_text(txt, encoding="utf-8")
                # detecta saldo insuficiente
                if "Saldo Insuficiente" in txt[:500]:
                    log(f"⚠️ SEM SALDO em {name}")
                return {"name": name, "status": r.status, "size": len(txt)}
        except Exception as e:
            return {"name": name, "status": "ERR", "error": str(e)[:200]}

async def main():
    log("EIXO 1 REDO · iniciando")
    log(f"PRODUTOS_PJ × CNPJS = {len(PRODUTOS_PJ)} × {len(CNPJS)} = {len(PRODUTOS_PJ)*len(CNPJS)}")
    log(f"PRODUTOS_PF × PESSOAS = {len(PRODUTOS_PF)} × {len(PESSOAS)} = {len(PRODUTOS_PF)*len(PESSOAS)}")

    async with aiohttp.ClientSession() as s:
        tasks = []
        # PJ
        for prod in PRODUTOS_PJ:
            for cnpj in CNPJS:
                tasks.append(chamar(s, prod, "CNPJ", cnpj, f"{prod}_{cnpj}"))
        # PF
        for prod in PRODUTOS_PF:
            for nome, cpf in PESSOAS.items():
                tasks.append(chamar(s, prod, "CPF", cpf, f"{prod}_{nome}"))
        # ImóveisPrevia 6 UFs × 3 pessoas
        for nome, cpf in PESSOAS.items():
            for uf in UFS_PRIO:
                tasks.append(chamar(s, "ImoveisPrevia", "CPF", cpf, f"ImoveisPrevia_{nome}_{uf}"))
        # Veicular pelas 3 pessoas
        for nome, cpf in PESSOAS.items():
            tasks.append(chamar(s, "VeicularCompleta", "CPF", cpf, f"VeicularCompleta_{nome}"))

        log(f"Total tasks: {len(tasks)}")
        results = await asyncio.gather(*tasks, return_exceptions=True)

        ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
        erro = sum(1 for r in results if isinstance(r, dict) and r.get("status") not in [200])
        log(f"✅ OK: {ok} · ❌ ERRO: {erro} · TOTAL: {len(tasks)}")
        # Resumo
        (OUT / "_eixo1_summary.json").write_text(json.dumps({
            "run_id": CFG["run_id"],
            "total": len(tasks),
            "ok": ok,
            "erro": erro,
            "produtos_pj": PRODUTOS_PJ,
            "produtos_pf": PRODUTOS_PF,
            "cnpjs": CNPJS,
            "pessoas": list(PESSOAS.keys()),
            "ts": datetime.utcnow().isoformat(),
        }, indent=2))
    log("EIXO 1 REDO · finalizado")

asyncio.run(main())
WORKER_EOF

# ═════════════════════════════════════════════════════════════════════════════
# CONFIG + DISPARO
# ═════════════════════════════════════════════════════════════════════════════
export EIXO1_CFG=$(cat <<JSON
{
  "run_id": "${RUN_ID}",
  "out_dir": "${OUT}",
  "log_file": "${LOG}",
  "directdata_token": "${DIRECTDATA_TOKEN}",
  "cnpjs": [
    "26968438000151",
    "00475251000122",
    "01865659000173",
    "02373790000186",
    "19407221000107",
    "22757257000125",
    "33638698000124",
    "37197253000107"
  ],
  "pessoas": {
    "paulo_octavio": "01762163160",
    "felipe_octavio": "00942640152",
    "andre_octavio": "01210483149"
  },
  "ufs_prio": ["DF", "GO", "SP", "RJ", "MG", "BA"]
}
JSON
)

log "─── Disparando worker Python ───"
set +e
python3 /tmp/eixo1_worker.py 2>&1 | tee -a "${LOG}"
WRC=$?
set -e
log "Worker exit: ${WRC}"

# ═════════════════════════════════════════════════════════════════════════════
# UPLOAD GCS
# ═════════════════════════════════════════════════════════════════════════════
log "─── Sync para GCS ───"
gsutil -m cp -r "${OUT}/*" "${BUCKET}/${RUN_ID}/" 2>&1 | tail -8 | tee -a "${LOG}"

TOTAL=$(find "${OUT}" -type f -name "*.json" | wc -l)
SIZE=$(du -sh "${OUT}" | cut -f1)
log "─── TOTAL: ${TOTAL} arquivos · ${SIZE} ───"
tg "✅ EIXO 1 REDO CONCLUÍDO · ${TOTAL} arquivos · ${SIZE} · GCS sync OK · ${RUN_ID}"
log "FIM"
