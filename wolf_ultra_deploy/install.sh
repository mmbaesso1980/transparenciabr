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

echo "===== [3/4] Ambiente do servico: Telegram + blindagens de risco ====="
DROPIN=/etc/systemd/system/wolf-trader.service.d
sudo mkdir -p $DROPIN
# (re)escreve sempre o drop-in de ambiente do ULTRA (idempotente)
TOK=""
for f in $REPO/.wolf_risco.env /opt/wolf/.wolf_risco.env /opt/wolf/.env; do
  [ -f "$f" ] && TOK=$(grep -E '^(WOLF_TG_TOKEN|TELEGRAM_TOKEN|TG_TOKEN)=' "$f" | head -1 | cut -d= -f2-) && [ -n "$TOK" ] && break
done
sudo bash -c "printf '[Service]\nEnvironment=WOLF_TG_CHAT=6483072695\n' > $DROPIN/ultra-env.conf"
[ -n "$TOK" ] && sudo bash -c "echo 'Environment=WOLF_TG_TOKEN=$TOK' >> $DROPIN/ultra-env.conf" && echo "token reaproveitado."
# Blindagens de risco: se existir .wolf_risco.env, propaga as WOLF_* p/ o servico.
# Sem arquivo, valem os DEFAULTS do codigo (stop -5 / take +6 / trail 2.5 / cooldown 45s ...).
for f in $REPO/.wolf_risco.env /opt/wolf/.wolf_risco.env; do
  if [ -f "$f" ]; then
    grep -E '^WOLF_(TRIGGER_PCT|FLATTEN_MIN|COOLDOWN_S|STOP_LOSS_USD|TAKE_PROFIT_USD|TRAIL_GIVEBACK_USD|MIN_PRICE|MAX_PRICE|MAX_STAKE_GAME_USD|POLL_S)=' "$f" \
      | while IFS= read -r line; do sudo bash -c "echo 'Environment=$line' >> $DROPIN/ultra-env.conf"; done
    echo "blindagens de risco carregadas de $f"
    break
  fi
done
echo "-- drop-in de ambiente (segredos mascarados) --"
sudo sed 's/\(WOLF_TG_TOKEN=\).*/\1***TOKEN***/' $DROPIN/ultra-env.conf | cat

echo "===== [4/4] Reiniciando robo ====="
sudo systemctl daemon-reload
sudo systemctl restart wolf-trader.service
sleep 4
echo "-- status --"; sudo systemctl is-active wolf-trader.service
sudo journalctl -u wolf-trader.service -n 10 --no-pager | sed 's/[A-Fa-f0-9]\{40,\}/***PK***/g' | cat
echo ""
echo "PRONTO. No Telegram: /status  e depois /startwolfultra"
