#!/usr/bin/env bash
# =============================================================================
# RUNBOOK LIMPEZA GCP — Maestro Operações (30/mai/2026)
# Aprovado por: Comandante Maurilio Baesso 12:03 BRT
# Escopo: Limpeza A→H + Diagnóstico bridge Telegram→Maestro
# Idempotente. Rodar na VM aurora-cacador-br (manusalt13_gmail_com@...) ou Cloud Shell.
# =============================================================================
set -uo pipefail  # NÃO usar -e: queremos continuar mesmo com falhas isoladas

ORG_LABEL="trbr-cleanup-30mai"
LOG=/tmp/limpeza_${ORG_LABEL}_$(date +%Y%m%d_%H%M%S).log
exec > >(tee -a "$LOG") 2>&1

echo "==== INICIO LIMPEZA $(date -Iseconds) ===="

# =============================================================================
# DIAG 0 — Ressuscitar bridge Telegram→Maestro (PRIMEIRO!)
# =============================================================================
echo ""
echo "==== [DIAG 0] BRIDGE TELEGRAM ===="
sudo systemctl status maestro-listener --no-pager 2>&1 | head -15 || echo "  systemd unit não existe — listener nunca foi instalado"
echo "--- restart ---"
sudo systemctl restart maestro-listener 2>&1 || echo "  falha no restart — verificar instalação"
sleep 3
sudo systemctl status maestro-listener --no-pager 2>&1 | head -10
echo "--- últimos logs ---"
sudo journalctl -u maestro-listener -n 20 --no-pager 2>&1 || true

# =============================================================================
# INVENTÁRIO inicial (snapshot do que existe ANTES de mexer)
# =============================================================================
echo ""
echo "==== [INVENTÁRIO INICIAL] ===="

for PROJ in transparenciabr projeto-codex-br; do
  echo ""
  echo "### Projeto: $PROJ"
  echo "--- Cloud Run ---"
  gcloud run services list --project=$PROJ --format="table(metadata.name,status.url,status.conditions[0].status)" 2>&1 | head -20 || echo "  (sem permissão)"
  echo "--- Cloud Run revisões antigas (>2 mais recentes por service) ---"
  for SVC in $(gcloud run services list --project=$PROJ --format="value(metadata.name)" 2>/dev/null); do
    echo "  service: $SVC"
    gcloud run revisions list --service=$SVC --region=us-east1 --project=$PROJ --format="table(metadata.name,metadata.creationTimestamp,status.conditions[0].status)" 2>&1 | head -8
  done
  echo "--- Cloud Functions ---"
  gcloud functions list --project=$PROJ --regions=us-east1,southamerica-east1,us-central1 --format="table(name,state,environment)" 2>&1 | head -20 || true
  echo "--- VMs Compute ---"
  gcloud compute instances list --project=$PROJ --format="table(name,zone,status,machineType.scope():label=MACHINE,accelerators[0].acceleratorType.scope():label=GPU)" 2>&1 | head -20 || true
  echo "--- GCS Buckets ---"
  gsutil ls -p $PROJ 2>&1 | head -20 || true
done

# =============================================================================
# LIMPEZA A — Branches origin/cursor/* stale (no GitHub via gh)
# =============================================================================
echo ""
echo "==== [A] BRANCHES STALE ===="
if command -v gh &>/dev/null; then
  cd ~ && rm -rf .clean-tbr && git clone --bare https://github.com/mmbaesso1980/transparenciabr.git .clean-tbr 2>&1 | tail -2
  cd .clean-tbr
  STALE=$(git branch -r | grep -E "origin/cursor/" | head -30)
  echo "Branches encontradas:"
  echo "$STALE"
  echo "$STALE" | while read -r BR; do
    BR_CLEAN=$(echo "$BR" | sed 's|origin/||' | xargs)
    [ -z "$BR_CLEAN" ] && continue
    echo "  deletando $BR_CLEAN..."
    git push origin --delete "$BR_CLEAN" 2>&1 | tail -1 || true
  done
  cd ~ && rm -rf .clean-tbr
else
  echo "  (gh CLI ausente — skip)"
fi

# =============================================================================
# LIMPEZA B — PRs órfãos (>30 dias sem atividade, status open)
# =============================================================================
echo ""
echo "==== [B] PRs ÓRFÃOS ==== (apenas LISTA — fechamento manual)"
if command -v gh &>/dev/null; then
  gh pr list --repo mmbaesso1980/transparenciabr --state open --json number,title,updatedAt,author --limit 30 \
    | python3 -c "
import json,sys,datetime
prs=json.load(sys.stdin)
cutoff=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=30)
for p in prs:
  ts=datetime.datetime.fromisoformat(p['updatedAt'].replace('Z','+00:00'))
  if ts < cutoff:
    print(f'  #{p[\"number\"]} ({ts.date()}): {p[\"title\"][:60]} — autor: {p[\"author\"][\"login\"]}')
" 2>&1 || echo "  (gh CLI sem auth)"
fi

# =============================================================================
# LIMPEZA C — Cloud Run revisões antigas (manter 2 mais recentes por service)
# =============================================================================
echo ""
echo "==== [C] CLOUD RUN REVISÕES ANTIGAS ===="
for PROJ in transparenciabr projeto-codex-br; do
  for SVC in $(gcloud run services list --project=$PROJ --format="value(metadata.name)" 2>/dev/null); do
    REVS=$(gcloud run revisions list --service=$SVC --region=us-east1 --project=$PROJ --format="value(metadata.name)" --sort-by="~metadata.creationTimestamp" 2>/dev/null)
    SKIP=0
    echo "$REVS" | while read -r REV; do
      [ -z "$REV" ] && continue
      SKIP=$((SKIP+1))
      if [ $SKIP -gt 2 ]; then
        echo "  delete: $PROJ/$SVC/$REV"
        gcloud run revisions delete "$REV" --region=us-east1 --project=$PROJ --quiet 2>&1 | tail -1 || true
      fi
    done
  done
done

# =============================================================================
# LIMPEZA D — Buckets GCS sem uso (>30 dias sem write, OU vazios)
# =============================================================================
echo ""
echo "==== [D] BUCKETS GCS SUSPEITOS ===="
for PROJ in transparenciabr projeto-codex-br; do
  echo "### $PROJ ###"
  for B in $(gsutil ls -p $PROJ 2>/dev/null); do
    COUNT=$(gsutil ls "$B" 2>/dev/null | wc -l)
    if [ "$COUNT" = "0" ]; then
      echo "  VAZIO: $B  ← candidato a delete"
    fi
  done
done

# =============================================================================
# LIMPEZA E — Cloud Functions com 0 invocations (relatório, não delete)
# =============================================================================
echo ""
echo "==== [E] CLOUD FUNCTIONS SUSPEITAS ===="
for PROJ in transparenciabr projeto-codex-br; do
  for FN in $(gcloud functions list --project=$PROJ --format="value(name)" 2>/dev/null); do
    NAME=$(echo "$FN" | awk -F/ '{print $NF}')
    INV=$(gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=$NAME" --project=$PROJ --limit=1 --format="value(timestamp)" --freshness=30d 2>/dev/null)
    if [ -z "$INV" ]; then
      echo "  $PROJ/$NAME: SEM invocations 30d ← candidato"
    fi
  done
done

# =============================================================================
# LIMPEZA F — VMs ephemeral
# =============================================================================
echo ""
echo "==== [F] VMs EPHEMERAL/TMP ===="
for PROJ in transparenciabr projeto-codex-br; do
  gcloud compute instances list --project=$PROJ --filter="labels.ephemeral=true OR name~^tmp-" --format="table(name,zone,status)" 2>&1 | head -10
done

# =============================================================================
# LIMPEZA G — GPUs L4 (inventário)
# =============================================================================
echo ""
echo "==== [G] GPUs INVENTÁRIO ===="
for PROJ in transparenciabr projeto-codex-br; do
  echo "### $PROJ ###"
  gcloud compute instances list --project=$PROJ --filter="guestAccelerators[].acceleratorType:*" --format="table(name,zone,status,guestAccelerators[0].acceleratorType.scope():label=GPU,guestAccelerators[0].acceleratorCount)" 2>&1 | head -10
done

# =============================================================================
# LIMPEZA H — Rotacionar PAT GitHub (instrução manual)
# =============================================================================
echo ""
echo "==== [H] ROTAÇÃO PAT GITHUB ===="
echo "  AÇÃO MANUAL pelo Comandante:"
echo "  1. https://github.com/settings/tokens — Gerar novo PAT (escopo: repo, workflow)"
echo "  2. Validade: 90 dias"
echo "  3. Atualizar secret: gcloud secrets versions add maestro-github-pat --data-file=<(echo -n NOVO_TOKEN) --project=projeto-codex-br"
echo "  4. Revogar PAT antigo no GitHub"
echo ""

# =============================================================================
# RELATÓRIO FINAL
# =============================================================================
echo ""
echo "==== FIM $(date -Iseconds) ===="
echo "Log completo: $LOG"
echo "Comandante: revise o log antes de aprovar delete dos itens [D] e [E]."
