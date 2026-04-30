#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# scripts/run_l4_massive.sh
# Orquestrador noturno L4 MASSIVO — TransparênciaBR Pipeline
# ═══════════════════════════════════════════════════════════════════════════════
# Substitui: scripts/run_l4_overnight.sh
#
# Fases:
#   0 — Warmup: PaddleOCR + nvidia-smi + verificação de ambiente
#   1 — Crawler DOU INLABS (4 anos em paralelo)
#   2 — Crawler Querido Diário (27 UFs, paralelo 6)
#   3 — Crawler LOA 2015-2026
#   4 — Crawler IBGE / TSE / OFAC / SEC / OpenSanctions / USASpending / WB
#   5 — OCR Documental (PaddleOCR PP-OCRv4 — SATURA L4 AQUI)
#   6 — Extração de entidades Gemini (classify_ceap.js generalizado)
#   7 — Resumo bucket + auto-shutdown
#
# Hard-stop: US$50/dia verificado a cada 1000 PDFs (via billing_guardrail.py)
# Logs: ~/transparenciabr/logs/l4_massive_YYYYMMDD_HHMMSS.log
#
# Uso:
#   chmod +x scripts/run_l4_massive.sh
#   nohup ./scripts/run_l4_massive.sh > /dev/null 2>&1 &
#   ./scripts/run_l4_massive.sh --dry-run          # apenas lista, não baixa
#   ./scripts/run_l4_massive.sh --fase 5           # executa apenas fase 5 (OCR)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuração ─────────────────────────────────────────────────────────────
PROJETO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${HOME}/transparenciabr/logs"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/l4_massive_${TIMESTAMP}.log"
GCS_RAW_BUCKET="${GCS_RAW_BUCKET:-datalake-tbr-raw}"
GCS_CLEAN_BUCKET="${GCS_CLEAN_BUCKET:-datalake-tbr-clean}"
PYTHON="${PYTHON:-python3}"
BILLING_THRESHOLD_USD="${BILLING_THRESHOLD_USD:-50}"
DRY_RUN=""
FASE_UNICA=""
ANO_DOU_INICIO="${ANO_DOU_INICIO:-2018}"
ANO_DOU_FIM="${ANO_DOU_FIM:-2026}"

# ── Parse de argumentos ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --fase)
            FASE_UNICA="$2"
            shift 2
            ;;
        --ano-dou-inicio)
            ANO_DOU_INICIO="$2"
            shift 2
            ;;
        --ano-dou-fim)
            ANO_DOU_FIM="$2"
            shift 2
            ;;
        *)
            echo "[ERRO] Argumento desconhecido: $1" >&2
            exit 1
            ;;
    esac
done

# ── Inicialização de log ──────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${1:-INFO}] ${2:-}"
}

log "INFO" "══════════════════════════════════════════════════════════════"
log "INFO" "  TransparênciaBR — Pipeline L4 MASSIVO"
log "INFO" "  Timestamp: ${TIMESTAMP}"
log "INFO" "  Log: ${LOG_FILE}"
log "INFO" "  Projeto: ${PROJETO_DIR}"
log "INFO" "  DRY-RUN: ${DRY_RUN:-NÃO}"
log "INFO" "  Fase única: ${FASE_UNICA:-todas}"
log "INFO" "══════════════════════════════════════════════════════════════"

# ── Verificação de ambiente ───────────────────────────────────────────────────
verificar_ambiente() {
    log "INFO" "Verificando ambiente..."

    # Python
    if ! command -v "${PYTHON}" &>/dev/null; then
        log "ERRO" "Python não encontrado: ${PYTHON}"
        exit 1
    fi

    # gcloud
    if ! command -v gcloud &>/dev/null; then
        log "AVISO" "gcloud não encontrado — billing via Cloud Billing API indisponível."
    else
        # Cloud Billing budget alert (configurado via gcloud se ainda não existir)
        log "INFO" "gcloud disponível: $(gcloud --version 2>&1 | head -1)"
    fi

    # GCS buckets
    log "INFO" "GCS RAW:   gs://${GCS_RAW_BUCKET}"
    log "INFO" "GCS CLEAN: gs://${GCS_CLEAN_BUCKET}"

    # Exports de segurança
    export GCS_RAW_BUCKET GCS_CLEAN_BUCKET BILLING_THRESHOLD_USD
}

# ── Verificação de orçamento ──────────────────────────────────────────────────
verificar_orcamento() {
    log "INFO" "Verificando orçamento diário (limite US\$${BILLING_THRESHOLD_USD})..."
    if ! "${PYTHON}" - <<'PYEOF' 2>/dev/null
import sys, os
sys.path.insert(0, os.environ.get('PROJETO_DIR', '.'))
try:
    from engines.lib.billing_guardrail import check_daily_spend
    ok = check_daily_spend(float(os.environ.get('BILLING_THRESHOLD_USD', '50')))
    sys.exit(0 if ok else 99)
except Exception as e:
    print(f"billing_guardrail import falhou: {e}", file=sys.stderr)
    sys.exit(0)  # fail-open
PYEOF
    then
        CODIGO=$?
        if [[ ${CODIGO} -eq 99 ]]; then
            log "CRÍTICO" "HARD-STOP: limite de US\$${BILLING_THRESHOLD_USD}/dia atingido. Abortando."
            exit 2
        fi
    fi
    log "INFO" "Orçamento OK — continuando."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 0 — Warmup
# ══════════════════════════════════════════════════════════════════════════════
fase_0_warmup() {
    log "INFO" "┌─ FASE 0: Warmup GPU + PaddleOCR ─────────────────────────"

    # nvidia-smi
    if command -v nvidia-smi &>/dev/null; then
        log "INFO" "GPU detectada:"
        nvidia-smi --query-gpu=name,memory.total,memory.free,utilization.gpu \
            --format=csv,noheader,nounits | while IFS=',' read -r nome mem_tot mem_livre util; do
            log "INFO" "  GPU: ${nome} | MEM: ${mem_livre}/${mem_tot} MB | UTIL: ${util}%"
        done
    else
        log "AVISO" "nvidia-smi não encontrado — L4 pode não estar disponível."
    fi

    # Warmup PaddleOCR via Python inline
    log "INFO" "Inicializando PaddleOCR PP-OCRv4..."
    "${PYTHON}" - <<'PYEOF' || log "AVISO" "PaddleOCR warmup falhou (continuando)."
import sys
try:
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(use_angle_cls=True, lang='pt', use_gpu=True, show_log=False)
    print("PaddleOCR PP-OCRv4: pronto.")
except ImportError:
    print("paddleocr não instalado — instale via: pip install paddleocr", file=sys.stderr)
except Exception as e:
    print(f"PaddleOCR erro: {e}", file=sys.stderr)
PYEOF

    log "INFO" "└─ FASE 0 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 1 — Crawler DOU INLABS
# ══════════════════════════════════════════════════════════════════════════════
fase_1_dou_inlabs() {
    log "INFO" "┌─ FASE 1: Crawler DOU INLABS 2018-2026 ───────────────────"
    verificar_orcamento

    local CRAWLER="${PROJETO_DIR}/engines/ingestors/runners/crawl_dou_inlabs.py"
    local SECOES="1,2,3,E"

    # Paralelismo: 4 blocos de anos simultâneos
    # 2018-2019, 2020-2021, 2022-2023, 2024-2026
    declare -a BLOCOS=(
        "2018 2019"
        "2020 2021"
        "2022 2023"
        "2024 2026"
    )

    local PIDS=()
    for bloco in "${BLOCOS[@]}"; do
        local ANO_INI ANO_FIM
        read -r ANO_INI ANO_FIM <<< "${bloco}"
        log "INFO" "  Iniciando DOU ${ANO_INI}-${ANO_FIM} em background..."
        "${PYTHON}" "${CRAWLER}" \
            --ano-inicio "${ANO_INI}" \
            --ano-fim "${ANO_FIM}" \
            --secoes "${SECOES}" \
            ${DRY_RUN} \
            >> "${LOG_DIR}/fase1_dou_${ANO_INI}_${ANO_FIM}.log" 2>&1 &
        PIDS+=($!)
    done

    log "INFO" "  Aguardando 4 processos DOU paralelos (PIDs: ${PIDS[*]})..."
    local FALHAS=0
    for pid in "${PIDS[@]}"; do
        if ! wait "${pid}"; then
            log "AVISO" "  Processo DOU PID ${pid} falhou (código: $?)."
            FALHAS=$((FALHAS + 1))
        fi
    done

    log "INFO" "└─ FASE 1 concluída. Falhas: ${FALHAS}/4."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 2 — Crawler Querido Diário
# ══════════════════════════════════════════════════════════════════════════════
fase_2_querido_diario() {
    log "INFO" "┌─ FASE 2: Crawler Querido Diário 27 UFs ──────────────────"
    verificar_orcamento

    local CRAWLER="${PROJETO_DIR}/engines/ingestors/runners/crawl_querido_diario.py"

    "${PYTHON}" "${CRAWLER}" \
        --todas-ufs \
        --ano-inicio 2018 \
        --ano-fim 2026 \
        --paralelo 6 \
        ${DRY_RUN}

    log "INFO" "└─ FASE 2 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 3 — Crawler LOA
# ══════════════════════════════════════════════════════════════════════════════
fase_3_loa() {
    log "INFO" "┌─ FASE 3: Crawler LOA 2015-2026 ──────────────────────────"
    verificar_orcamento

    local CRAWLER="${PROJETO_DIR}/engines/ingestors/runners/crawl_loa.py"

    "${PYTHON}" "${CRAWLER}" \
        --ano-inicio 2015 \
        --ano-fim 2026 \
        ${DRY_RUN}

    log "INFO" "└─ FASE 3 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 4 — Crawler IBGE/TSE/US
# ══════════════════════════════════════════════════════════════════════════════
fase_4_ibge_tse_us() {
    log "INFO" "┌─ FASE 4: Coletor IBGE/TSE/OFAC/SEC/OpenSanctions/WB ─────"
    verificar_orcamento

    local CRAWLER="${PROJETO_DIR}/engines/ingestors/runners/crawl_ibge_tse_us.py"

    "${PYTHON}" "${CRAWLER}" \
        --fontes todas \
        ${DRY_RUN}

    log "INFO" "└─ FASE 4 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 5 — OCR Documental (SATURA L4 AQUI)
# ══════════════════════════════════════════════════════════════════════════════
fase_5_ocr() {
    log "INFO" "┌─ FASE 5: OCR Documental L4 (PaddleOCR PP-OCRv4) ─────────"
    verificar_orcamento

    local OCR_ENGINE="${PROJETO_DIR}/engines/30_ocr_documental.py"

    # GPU util pré-OCR
    if command -v nvidia-smi &>/dev/null; then
        local GPU_UTIL
        GPU_UTIL="$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 'N/A')"
        log "INFO" "  GPU util pré-OCR: ${GPU_UTIL}%"
    fi

    # Processa diários DOU + estaduais
    log "INFO" "  OCR: diarios/ ..."
    "${PYTHON}" "${OCR_ENGINE}" \
        --prefixo-raw "diarios/" \
        --prefixo-clean "diarios/" \
        --workers 8 \
        ${DRY_RUN}

    verificar_orcamento

    # Processa LOA
    log "INFO" "  OCR: loa/ ..."
    "${PYTHON}" "${OCR_ENGINE}" \
        --prefixo-raw "loa/" \
        --prefixo-clean "loa/" \
        --workers 8 \
        ${DRY_RUN}

    # GPU util pós-OCR
    if command -v nvidia-smi &>/dev/null; then
        local GPU_UTIL_POS
        GPU_UTIL_POS="$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 'N/A')"
        log "INFO" "  GPU util pós-OCR: ${GPU_UTIL_POS}%"
    fi

    log "INFO" "└─ FASE 5 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 6 — Extração de entidades Gemini
# ══════════════════════════════════════════════════════════════════════════════
fase_6_gemini_entities() {
    log "INFO" "┌─ FASE 6: Gemini — Extração de entidades ─────────────────"
    verificar_orcamento

    local CLASSIFY="${PROJETO_DIR}/engines/vertex/classify_ceap.js"

    if [[ ! -f "${CLASSIFY}" ]]; then
        log "AVISO" "  classify_ceap.js não encontrado em ${CLASSIFY}. Pulando fase 6."
        log "INFO" "└─ FASE 6 pulada."
        return 0
    fi

    # Executa extração de entidades — classify_ceap.js generalizado aceita prefixo GCS
    if command -v node &>/dev/null; then
        log "INFO" "  Executando classify_ceap.js (modo generalizado)..."
        node "${CLASSIFY}" \
            --bucket-clean "${GCS_CLEAN_BUCKET}" \
            --prefixo "diarios/" \
            --modo entidades \
            2>&1 | tee -a "${LOG_DIR}/fase6_gemini.log" || \
            log "AVISO" "  classify_ceap.js retornou erro (não-fatal)."
    else
        log "AVISO" "  Node.js não encontrado — fase 6 ignorada."
    fi

    log "INFO" "└─ FASE 6 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# FASE 7 — Resumo + Auto-shutdown
# ══════════════════════════════════════════════════════════════════════════════
fase_7_resumo_shutdown() {
    log "INFO" "┌─ FASE 7: Resumo de bucket + auto-shutdown ────────────────"

    # Resumo GCS
    if command -v gsutil &>/dev/null; then
        log "INFO" "  Contagem de objetos no RAW bucket:"
        gsutil ls -l "gs://${GCS_RAW_BUCKET}/" 2>/dev/null | tail -1 || true

        log "INFO" "  Contagem de objetos no CLEAN bucket:"
        gsutil ls -l "gs://${GCS_CLEAN_BUCKET}/" 2>/dev/null | tail -1 || true
    fi

    # Salva resumo de execução no GCS
    local RESUMO_BLOB="_execucoes/l4_massive_${TIMESTAMP}.json"
    "${PYTHON}" - <<PYEOF || true
import json, datetime, os, subprocess
from google.cloud import storage

resumo = {
    "timestamp": "${TIMESTAMP}",
    "log_file": "${LOG_FILE}",
    "dry_run": bool("${DRY_RUN}"),
    "fases_executadas": "${FASE_UNICA:-todas}",
    "gcs_raw": "${GCS_RAW_BUCKET}",
    "gcs_clean": "${GCS_CLEAN_BUCKET}",
    "concluido_em": datetime.datetime.utcnow().isoformat() + "Z",
}
try:
    cliente = storage.Client()
    bucket = cliente.bucket("${GCS_RAW_BUCKET}")
    blob = bucket.blob("${RESUMO_BLOB}")
    blob.upload_from_string(json.dumps(resumo, indent=2).encode(), content_type="application/json")
    print(f"Resumo salvo: gs://${GCS_RAW_BUCKET}/${RESUMO_BLOB}")
except Exception as e:
    print(f"Aviso: resumo não salvo — {e}")
PYEOF

    # Auto-shutdown (apenas se var de ambiente ENABLE_AUTO_SHUTDOWN=true)
    if [[ "${ENABLE_AUTO_SHUTDOWN:-false}" == "true" ]]; then
        log "INFO" "  Auto-shutdown ativado — desligando instância em 60s..."
        sleep 60
        if command -v gcloud &>/dev/null; then
            local INSTANCE_NAME
            INSTANCE_NAME="$(curl -sf \
                "http://metadata.google.internal/computeMetadata/v1/instance/name" \
                -H "Metadata-Flavor: Google" 2>/dev/null || echo "")"
            local ZONE
            ZONE="$(curl -sf \
                "http://metadata.google.internal/computeMetadata/v1/instance/zone" \
                -H "Metadata-Flavor: Google" 2>/dev/null | awk -F/ '{print $NF}' || echo "")"
            if [[ -n "${INSTANCE_NAME}" && -n "${ZONE}" ]]; then
                log "INFO" "  Desligando: ${INSTANCE_NAME} (${ZONE})"
                gcloud compute instances stop "${INSTANCE_NAME}" --zone="${ZONE}" --quiet
            else
                log "AVISO" "  Metadados de instância não obtidos — shutdown manual necessário."
            fi
        fi
    else
        log "INFO" "  Auto-shutdown desativado (ENABLE_AUTO_SHUTDOWN≠true)."
    fi

    log "INFO" "└─ FASE 7 concluída."
}

# ══════════════════════════════════════════════════════════════════════════════
# EXECUÇÃO PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════
main() {
    verificar_ambiente

    local INICIO
    INICIO="$(date +%s)"

    if [[ -n "${FASE_UNICA}" ]]; then
        log "INFO" "Executando apenas fase ${FASE_UNICA}..."
        case "${FASE_UNICA}" in
            0) fase_0_warmup ;;
            1) fase_1_dou_inlabs ;;
            2) fase_2_querido_diario ;;
            3) fase_3_loa ;;
            4) fase_4_ibge_tse_us ;;
            5) fase_5_ocr ;;
            6) fase_6_gemini_entities ;;
            7) fase_7_resumo_shutdown ;;
            *)
                log "ERRO" "Fase inválida: ${FASE_UNICA} (válidas: 0-7)"
                exit 1
                ;;
        esac
    else
        # Execução completa
        fase_0_warmup
        fase_1_dou_inlabs
        fase_2_querido_diario
        fase_3_loa
        fase_4_ibge_tse_us
        fase_5_ocr
        fase_6_gemini_entities
        fase_7_resumo_shutdown
    fi

    local FIM
    FIM="$(date +%s)"
    local DURACAO=$(( FIM - INICIO ))
    local HORAS=$(( DURACAO / 3600 ))
    local MINUTOS=$(( (DURACAO % 3600) / 60 ))

    log "INFO" "══════════════════════════════════════════════════════════════"
    log "INFO" "  Pipeline L4 MASSIVO — CONCLUÍDO"
    log "INFO" "  Duração total: ${HORAS}h ${MINUTOS}m"
    log "INFO" "  Log completo: ${LOG_FILE}"
    log "INFO" "══════════════════════════════════════════════════════════════"
}

main "$@"
