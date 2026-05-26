#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# 🔥 EVISCERADOR v2.0 · COMANDOS DIRETOS NA VM L4 (sem orquestrador externo)
# ════════════════════════════════════════════════════════════════════════════
# Para: Comandante Baesso + Equipe de Agentes (comparação 3-vias)
# Alvo: Paulo Octávio Alves Pereira
# Como usar: SSH na VM e cole este script INTEIRO num arquivo, depois execute.
#
# ─── PASSO 0 · NO CLOUD SHELL (entra na aurora-cacador-br via SSH) ───
#
# ⚠️ tbr-mainframe-us-east1-d está em STOCKOUT (GPU L4 indisponível).
# Usamos aurora-cacador-br (southamerica-east1-a) — já em execução.
#
#   gcloud compute ssh aurora-cacador-br \
#     --zone=southamerica-east1-a --project=transparenciabr --tunnel-through-iap
#
# ─── PASSO 1 · DENTRO DA VM (já logado via SSH) ───
#
#   mkdir -p /home/baesso/eviscerador_v2 && cd /home/baesso/eviscerador_v2
#   nano EXECUTAR_NA_VM.sh                  # cola este arquivo inteiro
#   export AUTO_SHUTDOWN=0                  # ⚠️ CRÍTICO: VM é produtiva, NÃO desligar
#   chmod +x EXECUTAR_NA_VM.sh
#   nohup bash EXECUTAR_NA_VM.sh > run.log 2>&1 &
#   echo "PID=$!"
#   tail -f run.log
#
# Ctrl+C apenas no tail (não mata o nohup background)
# Pode dar `exit` no SSH — o nohup continua rodando.
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail
export LANG=C.UTF-8  # universal, evita locale faltando na VM

# ═════════════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO
# ═════════════════════════════════════════════════════════════════════════════
DIRECTDATA_TOKEN="29AE5E97-AACF-4ACC-B0ED-692472D72D60"
TELEGRAM_CHAT="6483072695"
TG_TOKEN="${TG_TOKEN:-8671845549:AAHJpkjvDFSYvCYC4VGu1Ja7kzjE3kuviL8}"
BUCKET="gs://datalake-tbr-clean/eviscerador_v2/paulo_octavio"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
# Usa $HOME (auto-detecta usuário real da VM: manusalt13_gmail_com, baesso, etc)
WORKDIR="${HOME}/eviscerador_v2"
OUT="${WORKDIR}/${RUN_ID}"
LOG="${WORKDIR}/run.log"
AUTO_SHUTDOWN="${AUTO_SHUTDOWN:-0}"  # default OFF — segurança extra em VM produtiva

mkdir -p "${OUT}"/{directdata,osint,sancoes,diarios,judicial,reguladoras,grafo}
touch "${LOG}"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "${LOG}"; }

log "═══════════════════════════════════════════════════════════════════════"
log "  🔥 EVISCERADOR v2.0 · DIRETO NA VM · RUN ${RUN_ID}"
log "  Alvo: Paulo Octávio Alves Pereira"
log "  Output: ${OUT}"
log "═══════════════════════════════════════════════════════════════════════"

# Telegram notify
tg() {
  curl -s -m 5 -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT}" \
    --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

tg "🔥 EVISCERADOR v2.0 INICIADO direto-na-VM · ${RUN_ID}"

# Instala deps
log "─── Instalando aiohttp ───"
pip3 install --user --quiet --break-system-packages aiohttp 2>&1 | tail -2 | tee -a "${LOG}" || \
  pip3 install --user --quiet aiohttp 2>&1 | tail -2 | tee -a "${LOG}" || \
  true
python3 -c "import aiohttp; print(f'aiohttp {aiohttp.__version__} OK')" 2>&1 | tee -a "${LOG}" || {
  log "❌ aiohttp não disponível — instalando via apt"
  sudo apt-get install -y python3-aiohttp 2>&1 | tail -3 | tee -a "${LOG}"
}

# ═════════════════════════════════════════════════════════════════════════════
# GERA WORKER PYTHON
# ═════════════════════════════════════════════════════════════════════════════
cat > /tmp/eviscerador_worker.py <<'WORKER_EOF'
#!/usr/bin/env python3
"""EVISCERADOR Worker · Paulo Octávio · 6 eixos paralelos"""
from __future__ import annotations
import asyncio, aiohttp, json, os, re, sys, time
from pathlib import Path
from datetime import datetime

CFG = json.loads(os.environ["EVISCERADOR_CFG"])
OUT = Path(CFG["out_dir"]); OUT.mkdir(parents=True, exist_ok=True)
LOG_FILE = Path(CFG["log_file"])

def log(msg):
    line = f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG_FILE.open("a") as f: f.write(line+"\n")

TOKEN = CFG["directdata_token"]
CNPJS = CFG["cnpjs"]
PESSOAS = CFG["pessoas"]  # dict nome→cpf11
UFS_PRIO = CFG["ufs_prio"]

UA = "TransparenciaBR-engines/2.0 (EVISCERADOR; +https://transparenciabr.org)"
SEM = asyncio.Semaphore(20)

async def fetch(session, url, name, subdir, params=None, headers=None):
    async with SEM:
        try:
            h = {"User-Agent": UA, **(headers or {})}
            async with session.get(url, params=params, headers=h, timeout=aiohttp.ClientTimeout(total=45)) as r:
                txt = await r.text()
                d = OUT / subdir; d.mkdir(parents=True, exist_ok=True)
                (d / f"{name}.json").write_text(txt, encoding="utf-8")
                return {"name": name, "status": r.status, "size": len(txt)}
        except Exception as e:
            return {"name": name, "status": "ERR", "error": str(e)[:200]}

# ═════════════ EIXO 1 · DIRECT DATA (8 produtos × 8 CNPJs + 5 pessoas) ═════════════
async def eixo1_directdata(session):
    log("EIXO 1 · Direct Data — 8 produtos PJ × 8 CNPJs + 5 produtos PF × 5 pessoas + ImóveisPrevia 6 UFs")
    tasks = []
    DD = "https://apiv3.directd.com.br/api"
    produtos_pj = [
        "ReceitaFederalPessoaJuridica", "BeneficiarioFinal", "ProcessosJudiciaisSimplificada",
        "ProtestosCenprot", "PGFNListaDevedores", "PropriedadeIntelectualMarcas",
        "DebitosTributariosMobiliariosPMSP", "MovimentacaoFuncionariosRAIS"
    ]
    for cnpj in CNPJS:
        for prod in produtos_pj:
            url = f"{DD}/{prod}"
            tasks.append(fetch(session, url, f"{prod}_{cnpj}", "directdata",
                params={"CNPJ": cnpj, "TOKEN": TOKEN}))
        # ImóveisPrevia por UF prioritária
        for uf in UFS_PRIO:
            tasks.append(fetch(session, f"{DD}/ImoveisPrevia", f"ImoveisPrevia_{cnpj}_{uf}", "directdata",
                params={"CNPJ": cnpj, "UF": uf, "TOKEN": TOKEN}))
        # Veicular limit 20
        tasks.append(fetch(session, f"{DD}/PesquisaVeicular", f"Veicular_{cnpj}", "directdata",
            params={"CNPJ": cnpj, "LIMITE": "20", "TOKEN": TOKEN}))

    produtos_pf = ["BeneficiarioFinal","ProcessosJudiciaisSimplificada","CadastroPessoaFisicaPlus",
                   "RegistrationDataBrazil","ProtestosCenprot"]
    for nome, cpf in PESSOAS.items():
        if not cpf or cpf == "00000000000": continue
        slug = re.sub(r'\W+', '_', nome)[:30]
        for prod in produtos_pf:
            tasks.append(fetch(session, f"{DD}/{prod}", f"{prod}_{slug}", "directdata",
                params={"CPF": cpf, "TOKEN": TOKEN}))
        # Imóveis CPF 6 UFs
        for uf in UFS_PRIO:
            tasks.append(fetch(session, f"{DD}/ImoveisPrevia", f"ImoveisPrevia_{slug}_{uf}", "directdata",
                params={"CPF": cpf, "UF": uf, "TOKEN": TOKEN}))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 1 · Direct Data — {ok}/{len(tasks)} OK")
    return {"eixo": 1, "total": len(tasks), "ok": ok}

# ═════════════ EIXO 2 · DIÁRIOS OFICIAIS (Querido Diário + INLABS DOU) ═════════════
async def eixo2_diarios(session):
    log("EIXO 2 · Diários Oficiais — Querido Diário sweep")
    tasks = []
    termos = ["paulo octavio", "paulo octavio alves pereira", "AKP enterprise",
              "principal construções", "radio JK FM", "kubitschek barbara"]
    ufs = ["DF","GO","SP","RJ"]
    for termo in termos:
        for uf in ufs:
            url = "https://queridodiario.ok.org.br/api/gazettes"
            slug_t = re.sub(r'\W+', '_', termo)[:30]
            tasks.append(fetch(session, url, f"qd_{uf}_{slug_t}", "diarios",
                params={"querystring": termo, "territory_uf": uf, "size": 100}))
    # DOU via API Imprensa Nacional (pública)
    for termo in termos:
        url = "https://www.in.gov.br/consulta/-/buscar/dou"
        slug_t = re.sub(r'\W+', '_', termo)[:30]
        tasks.append(fetch(session, url, f"dou_{slug_t}", "diarios",
            params={"q": termo, "s": "todos"}))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 2 · Diários — {ok}/{len(tasks)} OK")
    return {"eixo": 2, "total": len(tasks), "ok": ok}

# ═════════════ EIXO 3 · SANÇÕES (Portal Transparência CEPIM/CEIS/CNEP) ═════════════
async def eixo3_sancoes(session):
    log("EIXO 3 · Sanções — CEPIM/CEIS/CNEP × 8 CNPJs")
    tasks = []
    bases = ["cepim", "ceis", "cnep"]
    for cnpj in CNPJS:
        for base in bases:
            url = f"https://api.portaldatransparencia.gov.br/api-de-dados/{base}"
            tasks.append(fetch(session, url, f"{base}_{cnpj}", "sancoes",
                params={"cnpjSancionado": cnpj, "pagina": 1}))
    # CNJ Improbidade (por CPF do alvo)
    if ALVO_CPF := CFG.get("alvo_cpf", "01762163160"):
        url = "https://www.cnj.jus.br/improbidade_adm/consultar_requerido.php"
        tasks.append(fetch(session, url, f"cnj_improbidade_{ALVO_CPF}", "sancoes",
            params={"cpf_requerido": ALVO_CPF}))
    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 3 · Sanções — {ok}/{len(tasks)} OK")
    return {"eixo": 3, "total": len(tasks), "ok": ok}

# ═════════════ EIXO 4 · REGULADORAS (ANAC RAB, ANATEL, IBAMA, INPI, Marinha) ═════════════
async def eixo4_reguladoras(session):
    log("EIXO 4 · Reguladoras — ANAC RAB + ANATEL + IBAMA + INPI + Marinha REB")
    tasks = []
    for cnpj in CNPJS:
        # ANAC RAB (aeronaves)
        tasks.append(fetch(session, "https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados/aeronaves.csv",
            f"anac_csv_{cnpj}", "reguladoras"))
        # ANATEL (rádio/telecom)
        tasks.append(fetch(session, "https://sistemas.anatel.gov.br/areaarea/Consulta_Outorgas/tela.asp",
            f"anatel_{cnpj}", "reguladoras", params={"cnpj": cnpj}))
        # IBAMA CTF
        tasks.append(fetch(session, "https://servicos.ibama.gov.br/ctf/publico/areasembargadas/ConsultaPublicaAreasEmbargadas.php",
            f"ibama_{cnpj}", "reguladoras", params={"cnpj": cnpj}))
    # INPI por nome
    for termo in ["paulo octavio", "AKP enterprise", "principal construcoes"]:
        inpi_slug = re.sub(r'\W+', '_', termo)[:30]
        tasks.append(fetch(session, "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp",
            f"inpi_{inpi_slug}", "reguladoras", params={"q": termo}))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 4 · Reguladoras — {ok}/{len(tasks)} OK")
    return {"eixo": 4, "total": len(tasks), "ok": ok}

# ═════════════ EIXO 5 · JUDICIAL (STJ + TJDFT + TRF1 + DJEN) ═════════════
async def eixo5_judicial(session):
    log("EIXO 5 · Judicial — STJ AREsp 1.079.064 + DJEN + TJDFT")
    tasks = []
    # DJEN API CNJ
    for nome in PESSOAS.keys():
        url = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
        djen_slug = re.sub(r'\W+', '_', nome)[:30]
        tasks.append(fetch(session, url, f"djen_{djen_slug}", "judicial",
            params={"nomeParte": nome, "itensPorPagina": 200}))
    # STJ AREsp específico
    url_stj = "https://scon.stj.jus.br/SCON/jurisprudencia/toc.jsp"
    tasks.append(fetch(session, url_stj, "stj_aresp_1079064", "judicial",
        params={"livre": "AREsp 1079064", "tipo_visualizacao": "RESUMO"}))
    # Maré Alta / Number One / Caixa de Pandora (via DuckDuckGo HTML para evitar bloqueio Google)
    operacoes = ["Maré Alta", "Number One", "Caixa de Pandora", "Mensalão DEM"]
    for op in operacoes:
        op_slug = re.sub(r'\W+', '_', op)[:30]
        tasks.append(fetch(session, "https://html.duckduckgo.com/html/", f"op_{op_slug}", "judicial",
            params={"q": f'"{op}" "Paulo Octavio" site:tjdft.jus.br OR site:stj.jus.br'}))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 5 · Judicial — {ok}/{len(tasks)} OK")
    return {"eixo": 5, "total": len(tasks), "ok": ok}

# ═════════════ EIXO 6 · OSINT (Wayback + BrasilAPI + ReceitaWS + Casa dos Dados) ═════════════
async def eixo6_osint(session):
    log("EIXO 6 · OSINT — Wayback + BrasilAPI + ReceitaWS + minhareceita")
    tasks = []
    for cnpj in CNPJS:
        tasks.append(fetch(session, f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}",
            f"brasilapi_{cnpj}", "osint"))
        tasks.append(fetch(session, f"https://minhareceita.org/{cnpj}",
            f"minhareceita_{cnpj}", "osint"))
        tasks.append(fetch(session, f"https://www.receitaws.com.br/v1/cnpj/{cnpj}",
            f"receitaws_{cnpj}", "osint"))
        # Wayback
        tasks.append(fetch(session, "https://web.archive.org/cdx/search/cdx",
            f"wayback_{cnpj}", "osint",
            params={"url": f"casadosdados.com.br/solucao/cnpj/{cnpj}", "output": "json", "limit": 100}))
    # Wayback dos domínios do grupo
    dominios = ["paulo-octavio.com.br","akpenterprise.com.br","radiojk.com.br","principalfm.com.br",
                "pooenergy.com.br","poii.com.br"]
    for dom in dominios:
        tasks.append(fetch(session, "https://web.archive.org/cdx/search/cdx",
            f"wayback_dom_{dom}", "osint",
            params={"url": dom, "output": "json", "limit": 200, "matchType": "domain"}))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = sum(1 for r in results if isinstance(r, dict) and r.get("status") == 200)
    log(f"EIXO 6 · OSINT — {ok}/{len(tasks)} OK")
    return {"eixo": 6, "total": len(tasks), "ok": ok}

# ═════════════════════════ MAIN ═════════════════════════
async def main():
    t0 = time.time()
    log("═══ Iniciando 6 eixos paralelos ═══")
    connector = aiohttp.TCPConnector(limit=50, limit_per_host=20)
    async with aiohttp.ClientSession(connector=connector) as session:
        results = await asyncio.gather(
            eixo1_directdata(session),
            eixo2_diarios(session),
            eixo3_sancoes(session),
            eixo4_reguladoras(session),
            eixo5_judicial(session),
            eixo6_osint(session),
            return_exceptions=True
        )
    elapsed = time.time() - t0
    summary = {
        "run_id": CFG["run_id"],
        "elapsed_seconds": round(elapsed, 1),
        "eixos": [r if isinstance(r, dict) else {"erro": str(r)} for r in results],
        "timestamp_utc": datetime.utcnow().isoformat()
    }
    (OUT / "_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    log(f"═══ Worker concluído em {elapsed:.1f}s ═══")
    log(f"Output: {OUT}")

if __name__ == "__main__":
    asyncio.run(main())
WORKER_EOF

log "✅ Worker Python gerado em /tmp/eviscerador_worker.py ($(wc -l < /tmp/eviscerador_worker.py) LOC)"

# ═════════════════════════════════════════════════════════════════════════════
# CONFIG JSON (via env var pro worker)
# ═════════════════════════════════════════════════════════════════════════════
CFG_JSON=$(cat <<JSON
{
  "run_id": "${RUN_ID}",
  "out_dir": "${OUT}",
  "log_file": "${LOG}",
  "directdata_token": "${DIRECTDATA_TOKEN}",
  "alvo_cpf": "01762163160",
  "alvo_nome": "PAULO OCTAVIO ALVES PEREIRA",
  "cnpjs": [
    "26968438000151","00475251000122","01865659000173","02373790000186",
    "19407221000107","22757257000125","33638698000124","37197253000107"
  ],
  "pessoas": {
    "PAULO_OCTAVIO": "01762163160",
    "FELIPE_OCTAVIO": "00942640152",
    "ANDRE_OCTAVIO": "01210483149"
  },
  "ufs_prio": ["DF","GO","SP","RJ","BA","MG"],
  "ufs_sec": ["AL","AM","AP","AC","CE","ES","MA","MS","MT","PA","PB","PE","PI","PR","RN","RO","RR","RS","SC","SE","TO"]
}
JSON
)

export EVISCERADOR_CFG="${CFG_JSON}"

# ═════════════════════════════════════════════════════════════════════════════
# EXECUTA WORKER
# ═════════════════════════════════════════════════════════════════════════════
log "─── Disparando worker Python (asyncio · 6 eixos paralelos · sem 20) ───"
python3 /tmp/eviscerador_worker.py 2>&1 | tee -a "${LOG}"

log "─── Sincronizando para GCS ───"
gsutil -m rsync -r "${OUT}" "${BUCKET}/${RUN_ID}/" 2>&1 | tail -20 | tee -a "${LOG}"

# Contadores finais
TOTAL_FILES=$(find "${OUT}" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${OUT}" | cut -f1)
log "═══════════════════════════════════════════════════════════════════════"
log "  CONCLUÍDO · ${TOTAL_FILES} arquivos · ${TOTAL_SIZE}"
log "  GCS: ${BUCKET}/${RUN_ID}/"
log "═══════════════════════════════════════════════════════════════════════"

tg "✅ EVISCERADOR v2.0 CONCLUÍDO · ${TOTAL_FILES} arquivos · ${TOTAL_SIZE} · GCS sync OK · ${RUN_ID}"

# AUTO-SHUTDOWN (opcional)
if [[ "${AUTO_SHUTDOWN}" == "1" ]]; then
  log "─── Auto-shutdown em 5min ───"
  tg "⏻ Auto-shutdown VM em 5 minutos"
  sleep 300
  sudo shutdown -h now
fi
