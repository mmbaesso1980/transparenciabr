#!/usr/bin/env bash
# ============================================================
# DIAGNÓSTICO COMPLETO MAESTRO — 30/mai/2026 16:37 BRT
# Coleta tudo numa Gist GitHub e me retorna a URL.
# Comandante Baesso · roda na aurora-cacador-br
# ============================================================
set +e   # NÃO abortar se algo falhar — quero diagnóstico completo

OUT=/tmp/maestro_diag_$(date +%H%M).txt
{
  echo "================================================================="
  echo "MAESTRO DIAG  ·  $(date -Iseconds)  ·  $(hostname)"
  echo "================================================================="
  echo ""

  echo "==[ 1. Listener systemd na VM ]=="
  systemctl is-active maestro-listener.service 2>&1
  systemctl status maestro-listener.service --no-pager -l 2>&1 | head -20
  echo ""

  echo "==[ 2. Últimas 30 linhas do journal do listener ]=="
  sudo journalctl -u maestro-listener.service -n 30 --no-pager 2>&1
  echo ""

  echo "==[ 3. Subscription maestro-commands-sub em projeto-codex-br ]=="
  gcloud pubsub subscriptions describe maestro-commands-sub \
    --project=projeto-codex-br --format=json 2>&1 | head -40
  echo ""

  echo "==[ 4. Mensagens não-ackeadas (backlog Pub/Sub) ]=="
  gcloud monitoring metrics list --project=projeto-codex-br \
    --filter='metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages"' \
    --format='value(metric.type)' 2>&1 | head -3
  echo ""

  echo "==[ 5. Estado do worker Cloud Run maestro-worker ]=="
  gcloud run services describe maestro-worker \
    --project=projeto-codex-br --region=us-east1 \
    --format='value(status.url,status.conditions[0].status,status.conditions[0].message,status.latestReadyRevisionName,status.traffic[0].revisionName)' 2>&1
  echo ""

  echo "==[ 6. Últimos 50 logs do worker Cloud Run ]=="
  gcloud run services logs read maestro-worker \
    --project=projeto-codex-br --region=us-east1 --limit=50 2>&1 | tail -60
  echo ""

  echo "==[ 7. Últimos 10 docs em maestro_audit_log (Firestore projeto transparenciabr) ]=="
  gcloud firestore documents list maestro_audit_log \
    --project=transparenciabr --page-size=10 \
    --format='value(name,createTime,updateTime)' 2>&1 | head -30
  echo ""

  echo "==[ 8. Branches do repo (sanity check) ]=="
  for b in feat/radar-juridico-exclusivo feat/oceanways-mvp main ops/wake-30mai; do
    sha=$(curl -s "https://api.github.com/repos/mmbaesso1980/transparenciabr/branches/${b}" \
      | python3 -c "import json,sys; o=json.load(sys.stdin); print(o['commit']['sha'][:8],o['commit']['commit']['author']['date'])" 2>&1)
    echo "  $b :: $sha"
  done
  echo ""

  echo "==[ 9. Kill switch maestro_control ]=="
  gcloud firestore documents describe maestro_control/kill_switch \
    --project=transparenciabr --format=json 2>&1 | head -20
  echo ""

  echo "================================================================="
  echo "FIM DO DIAGNÓSTICO"
  echo "================================================================="
} > "$OUT" 2>&1

echo ""
echo "Diagnóstico salvo em: $OUT"
echo "Tamanho: $(wc -l < $OUT) linhas"
echo ""

# Subir como Gist secreta para o Computer ler
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  echo "==> Enviando para Gist..."
  GIST_URL=$(gh gist create "$OUT" --desc "Maestro diag 30mai $(date +%H%M)" 2>&1 | tail -1)
  echo "    $GIST_URL"
else
  echo "(gh CLI não autenticada — cole o arquivo manualmente no chat)"
  echo "    cat $OUT  # para ver"
  echo ""
  echo "==[ RESUMO RÁPIDO ]=="
  grep -E "(Active:|backlog|num_undelivered|condition|sha :: |kill_switch)" "$OUT" | head -20
fi
