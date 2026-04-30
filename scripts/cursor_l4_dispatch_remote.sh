#!/usr/bin/env bash
# Reproduz o dispatch L4 descrito no runbook (gcloud + Firebase + VM).
# Uso na máquina do operador (com gcloud/firebase já autenticados):
#   bash scripts/cursor_l4_dispatch_remote.sh
#   bash scripts/cursor_l4_dispatch_remote.sh --validate-after   # inclui espera 5 min + nvidia-smi remoto
#
# Variáveis opcionais:
#   REPO_DIR   — raiz do clone (default: diretório pai deste script/..)
#   GCP_PROJECT — default: transparenciabr
#   GCP_ZONE   — default: us-central1-a
#   VM_NAME    — default: tbr-mainframe

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-transparenciabr}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-tbr-mainframe}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

if [[ -f "/opt/google-cloud-sdk/path.bash.inc" ]]; then
  # shellcheck source=/dev/null
  source "/opt/google-cloud-sdk/path.bash.inc"
fi

echo "══════════════════════════════════════════════════════════════"
echo "L4 dispatch — projeto=${GCP_PROJECT} zone=${GCP_ZONE} vm=${VM_NAME}"
echo "Repo: ${REPO_DIR}"
echo "══════════════════════════════════════════════════════════════"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERRO: '$1' não está no PATH. Instale e tente de novo." >&2
    exit 1
  }
}

require_cmd gcloud
require_cmd curl
require_cmd python3

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  echo "ERRO: nenhuma conta gcloud ativa. Execute: gcloud auth login" >&2
  echo "       (ou gcloud auth activate-service-account --key-file=...)" >&2
  exit 1
fi

gcloud config set project "${GCP_PROJECT}"
gcloud config set compute/zone "${GCP_ZONE}"

echo ""
echo "── Passo 2: Firebase deploy seedUniverseRoster ──"
if command -v firebase >/dev/null 2>&1; then
  (cd "${REPO_DIR}/functions" && npm install --silent)
  (cd "${REPO_DIR}" && firebase deploy --only "functions:seedUniverseRoster" --project "${GCP_PROJECT}" --force)
else
  echo "AVISO: firebase não instalado; pulando deploy. npm i -g firebase-tools"
fi

echo ""
echo "── Passo 3: Popular roster (HTTP) + validar ≥500 ──"
SEED_URL="https://us-central1-${GCP_PROJECT}.cloudfunctions.net/seedUniverseRoster"
ROSTER_GET_URL="https://southamerica-east1-${GCP_PROJECT}.cloudfunctions.net/getUniverseRoster"

curl -sS -X POST "${SEED_URL}" -H "Content-Type: application/json" -d '{}' --max-time 300 | python3 -c "import json,sys; print(json.load(sys.stdin))"

curl -sS "${ROSTER_GET_URL}" --max-time 120 | python3 -c "
import json, sys
d = json.load(sys.stdin)
if isinstance(d, dict) and 'roster' not in d:
    print('Resposta inesperada:', d)
    sys.exit(1)
arr = len(d.get('roster', []))
print(f'roster_array={arr} | total={d.get(\"total\")} | dep={d.get(\"deputados\")} | sen={d.get(\"senadores\")}')
assert arr >= 500, f'Roster com apenas {arr} entradas'
print('OK roster')
"

echo ""
echo "── Passo 4: SSH na VM e disparar run_l4_massive.sh (ENABLE_AUTO_SHUTDOWN=true) ──"
# stdin → bash -s na VM (evita problemas de quoting com --command=...)
gcloud compute ssh "${VM_NAME}" --zone="${GCP_ZONE}" --project="${GCP_PROJECT}" -- bash -s <<'REMOTE'
set -e
echo "════════════════════════════════════════════"
echo "L4 DISPATCH — $(date)"
echo "════════════════════════════════════════════"
cd ~/transparenciabr
git pull origin main
echo "Último commit: $(git log -1 --oneline)"
sudo apt-get update -qq
sudo apt-get install -y -qq python3-pip python3-venv python3-dev poppler-utils \
  libgl1 libglib2.0-0 libsm6 libxrender1 libxext6
[ ! -d .venv ] && python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel --quiet
pip install --quiet pdfplumber pdf2image google-cloud-storage google-cloud-documentai \
  requests beautifulsoup4 lxml tenacity firebase-admin
pip install --quiet paddlepaddle-gpu==2.6.1 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html || \
  pip install --quiet paddlepaddle-gpu==2.5.2 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html
pip install --quiet "paddleocr>=2.7.0" "python-doctr[torch]"
python3 -c "import paddle; assert paddle.is_compiled_with_cuda(); print('Paddle CUDA OK', paddle.device.cuda.device_count())"
export SEC_EDGAR_USER_AGENT="TransparenciaBR mmbaesso@hotmail.com"
export ENABLE_AUTO_SHUTDOWN=true
pkill -f run_l4_massive.sh 2>/dev/null || true
sleep 2
nohup bash ~/transparenciabr/scripts/run_l4_massive.sh > "$HOME/l4_dispatch_$(date +%Y%m%d_%H%M%S).log" 2>&1 &
PID=$!
disown
echo "L4 PID=$PID"
sleep 30
echo "=== nvidia-smi após 30s ==="
nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv || true
echo "=== Processos ==="
ps -ef | grep -E "run_l4|paddleocr|crawl_|30_ocr" | grep -v grep | head -5 || true
echo "=== Log l4_massive (tail) ==="
LATEST=$(ls -t ~/transparenciabr/logs/l4_massive_*.log 2>/dev/null | head -1)
echo "→ $LATEST"
[ -n "$LATEST" ] && tail -30 "$LATEST" || true
echo "DISPATCH COMPLETO"
REMOTE

echo ""
echo "── Passo 5 (opcional): aguarde 5 min e rode com --validate-after na mesma sessão ──"
if [[ "${1:-}" == "--validate-after" ]]; then
  sleep 300
  gcloud compute ssh "${VM_NAME}" --zone="${GCP_ZONE}" --project="${GCP_PROJECT}" -- bash -s <<'REMOTE2'
echo "=== Status 5min ==="
nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv
ps -ef | grep run_l4_massive | grep -v grep || true
tail -20 "$(ls -t ~/transparenciabr/logs/l4_massive_*.log | head -1)"
gsutil du -sh gs://datalake-tbr-raw/diarios/ 2>/dev/null || true
gsutil du -sh gs://datalake-tbr-raw/loa/ 2>/dev/null || true
gsutil du -sh gs://datalake-tbr-raw/ibge/ 2>/dev/null || true
REMOTE2
fi
