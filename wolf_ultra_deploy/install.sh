#!/usr/bin/env bash
# WOLF ULTRA — instalador via repo (Comandante Baesso).
# Uso na VM:
#   cd /opt/wolf/repo && git pull && bash wolf_ultra_deploy/install.sh
# Integra o modo ULTRA ao robo existente. Rollback automatico. Renan-YES blindada.
set -e
REPO=/opt/wolf/repo
PKG=$REPO/wolf_trader
PY=$REPO/.venv/bin/python3
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /tmp/wolf_ctl

echo "===== [1/4] Robo normal ANTES ====="
sudo systemctl is-active wolf-trader.service || echo "(atencao: nao active)"

echo "===== [2/4] Aplicando patch idempotente (rollback automatico) ====="
sudo $PY "$HERE/patch_ultra.py"

echo "===== [3/4] Token Telegram no ambiente do servico ====="
DROPIN=/etc/systemd/system/wolf-trader.service.d
sudo mkdir -p $DROPIN
if [ ! -f $DROPIN/ultra-env.conf ]; then
  TOK=""
  for f in $REPO/.wolf_risco.env /opt/wolf/.wolf_risco.env /opt/wolf/.env; do
    [ -f "$f" ] && TOK=$(grep -E '^(WOLF_TG_TOKEN|TELEGRAM_TOKEN|TG_TOKEN)=' "$f" | head -1 | cut -d= -f2-) && [ -n "$TOK" ] && break
  done
  sudo bash -c "printf '[Service]\nEnvironment=WOLF_TG_CHAT=6483072695\n' > $DROPIN/ultra-env.conf"
  [ -n "$TOK" ] && sudo bash -c "echo 'Environment=WOLF_TG_TOKEN=$TOK' >> $DROPIN/ultra-env.conf" && echo "token reaproveitado."
fi

echo "===== [4/4] Reiniciando robo ====="
sudo systemctl daemon-reload
sudo systemctl restart wolf-trader.service
sleep 4
echo "-- status --"; sudo systemctl is-active wolf-trader.service
sudo journalctl -u wolf-trader.service -n 10 --no-pager | sed 's/[A-Fa-f0-9]\{40,\}/***PK***/g' | cat
echo ""
echo "PRONTO. No Telegram: /status  e depois /startwolfultra"
