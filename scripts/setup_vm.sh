#!/bin/bash
# ============================================================
# TransparenciaBR - VM Bootstrap Script (Bloco 2)
# Setup: Node 20 + Ollama + Gemma 27B + clone repo
# ============================================================
set -e

LOG_FILE="$HOME/setup_vm.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "INICIO: $(date)"
echo "============================================================"

echo ""
echo "=== [1/6] Update + ferramentas base ==="
sudo apt-get update -qq
sudo apt-get install -y -qq git curl jq build-essential

echo ""
echo "=== [2/6] Node.js 20 ==="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
  sudo apt-get install -y -qq nodejs
fi
echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

echo ""
echo "=== [3/6] Ollama install ==="
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
sleep 5
sudo systemctl enable ollama 2>/dev/null || true
sudo systemctl restart ollama
sleep 5
echo "Ollama: $(ollama --version 2>&1 | head -1)"

echo ""
echo "=== [4/6] Pull Gemma 27B Q4_K_M (~16GB, leva 5-10 min) ==="
ollama pull gemma2:27b-instruct-q4_K_M

echo ""
echo "=== [5/6] Smoke test Gemma na L4 ==="
echo "Responda apenas: OK rodando na L4." | timeout 120 ollama run gemma2:27b-instruct-q4_K_M
echo ""
echo "--- nvidia-smi pos-inferencia ---"
nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv

echo ""
echo "=== [6/6] Clone repo TransparenciaBR ==="
cd "$HOME"
if [ ! -d "transparenciabr" ]; then
  git clone https://github.com/mmbaesso1980/transparenciabr.git
fi
cd transparenciabr
git pull --quiet || echo "(pull falhou - pode ser primeira vez)"
echo "Branch: $(git branch --show-current)"
echo "Ultimo commit: $(git log -1 --oneline)"
ls -la engines/ 2>/dev/null || echo "(engines/ nao existe ainda - sera criada Sprint 3)"

echo ""
echo "============================================================"
echo "BLOCO 2 COMPLETO: $(date)"
echo "Resumo:"
echo "  Node:    $(node -v)"
echo "  Ollama:  $(ollama --version 2>&1 | head -1)"
echo "  Gemma:   $(ollama list 2>/dev/null | grep -i gemma | awk '{print $1}')"
echo "  Repo:    $HOME/transparenciabr"
echo "============================================================"
