#!/usr/bin/env bash
# Maestro v2.1.4 — South Park Edition Deploy
# Roda na VM aurora-cacador-br, cwd=~/transparenciabr
set -Eeuo pipefail
echo "════════════════════════════════════════════════════════════"
echo " MAESTRO v2.1.4 CARTMAN EDITION — DEPLOY"
echo "════════════════════════════════════════════════════════════"
cd ~/transparenciabr
git fetch --all --prune 2>&1 | tail -3
git checkout feat/maestro-v214-southpark 2>&1 | tail -2
git pull --rebase origin feat/maestro-v214-southpark 2>&1 | tail -3

echo "════ STEP 1/4 — Firestore Rules ════"
firebase deploy --only firestore:rules --project transparenciabr --non-interactive 2>&1 | tail -8

echo ""
echo "════ STEP 2/4 — Frontend Build + Deploy ════"
(cd frontend && npm ci --no-audit --no-fund --silent 2>&1 | tail -3 && npm run build 2>&1 | tail -10)
firebase deploy --only hosting --project transparenciabr --non-interactive 2>&1 | tail -8

echo ""
echo "════ STEP 3/4 — Worker Docker Build ════"
gcloud builds submit aurora_v3_maestro/worker \
  --tag gcr.io/projeto-codex-br/maestro-worker:v2.1.4 \
  --project=projeto-codex-br 2>&1 | tail -15

echo ""
echo "════ STEP 4/4 — Cloud Run Deploy ════"
gcloud run deploy maestro-worker \
  --image=gcr.io/projeto-codex-br/maestro-worker:v2.1.4 \
  --project=projeto-codex-br \
  --region=us-east1 \
  --quiet 2>&1 | tail -10

echo ""
echo "════ SMOKE TEST ════"
TOKEN=$(gcloud auth print-access-token)
curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "https://firestore.googleapis.com/v1/projects/transparenciabr/databases/(default)/documents/maestro_audit_log?pageSize=3&orderBy=ts%20desc" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); docs=d.get('documents',[]); print(f'audit_log docs:{len(docs)}'); [print(' ',x.get('name','?').split('/')[-1]) for x in docs[:3]]"

echo ""
echo "════════════════════════════════════════════════════════════"
echo " ✅ MAESTRO v2.1.4 CARTMAN EDITION DEPLOYED"
echo " 🌐 https://transparenciabr.web.app/maestro-hq"
echo " 🎮 https://transparenciabr.web.app/escritorio-hq"
echo "════════════════════════════════════════════════════════════"
