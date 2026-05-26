#!/bin/bash
# AURORA Forensic v1.0 · Pipeline de publicação · Dossiê Andreia Siqueira (MDB-PA)
# Comandante Baesso · 26/05/2026 · Versão v1.0-FINAL
#
# Pré-requisito: rodar no Cloud Shell autenticado com conta-mestre Comandante.
# Uso:
#   git clone https://github.com/mmbaesso1980/transparenciabr.git
#   cd transparenciabr
#   # (copiar este diretório aurora_deploy_andreia para ./ via Cloud Shell upload)
#   bash aurora_deploy_andreia/deploy_pipeline.sh

set -euo pipefail

SLUG="andreia-siqueira"
PROJ_HOST="transparenciabr"
PROJ_PIPE="projeto-codex-br"
BUCKET="datalake-tbr-clean"
TOPIC="dossie-v1-pipeline"
PDF_LOCAL="$(dirname "$0")/dossie.pdf"
PAYLOAD_FS="$(dirname "$0")/firestore_payload.json"
PAYLOAD_PS="$(dirname "$0")/pubsub_payload.json"
SHA_EXPECTED="eb61343b41f09580ab2eb15f200be918a4dd4df93e67bc60b815eeabfd01aa73"

echo "════════════════════════════════════════════════════════════════════"
echo "  AURORA Forensic v1.0 · Pipeline publicação · ${SLUG}"
echo "════════════════════════════════════════════════════════════════════"

# Fase 0 · Validação local
echo ""
echo "▶ Fase 0 · Validação local do PDF"
SHA_ACTUAL=$(sha256sum "$PDF_LOCAL" | awk '{print $1}')
if [ "$SHA_ACTUAL" != "$SHA_EXPECTED" ]; then
  echo "❌ BLOQUEIO · SHA-256 não bate"
  echo "   Esperado: $SHA_EXPECTED"
  echo "   Atual:    $SHA_ACTUAL"
  exit 1
fi
echo "✅ SHA-256 confere · $SHA_ACTUAL"

# Fase 1 · Upload PDF para GCS
echo ""
echo "▶ Fase 1 · Upload PDF para gs://${BUCKET}/dossies_v1/${SLUG}/dossie.pdf"
gcloud storage cp "$PDF_LOCAL" "gs://${BUCKET}/dossies_v1/${SLUG}/dossie.pdf" \
  --project="${PROJ_HOST}" \
  --content-type="application/pdf" \
  --cache-control="private, max-age=300"
echo "✅ PDF publicado"

# Fase 1b · Upload findings.json
echo ""
echo "▶ Fase 1b · Upload findings.json"
gcloud storage cp "$(dirname "$0")/findings.json" \
  "gs://${BUCKET}/dossies_v1/${SLUG}/findings.json" \
  --project="${PROJ_HOST}" \
  --content-type="application/json"
echo "✅ findings.json publicado"

# Fase 2 · Criar documento Firestore
echo ""
echo "▶ Fase 2 · Criar documento Firestore dossies_v1/${SLUG}"
# Usa REST API do Firestore via gcloud auth token
ACCESS_TOKEN=$(gcloud auth print-access-token)
curl -sf -X PATCH \
  "https://firestore.googleapis.com/v1/projects/${PROJ_HOST}/databases/(default)/documents/dossies_v1/${SLUG}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @<(python3 -c "
import json
data = json.load(open('${PAYLOAD_FS}'))
def to_fs(v):
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, float): return {'doubleValue': v}
    if isinstance(v, str): return {'stringValue': v}
    if isinstance(v, list): return {'arrayValue': {'values': [to_fs(x) for x in v]}}
    if isinstance(v, dict): return {'mapValue': {'fields': {k: to_fs(x) for k,x in v.items()}}}
    return {'nullValue': None}
print(json.dumps({'fields': {k: to_fs(v) for k,v in data.items()}}))
") > /tmp/fs_response.json
echo "✅ Documento Firestore criado/atualizado"

# Fase 3 · Publicar mensagem Pub/Sub no projeto-codex-br
echo ""
echo "▶ Fase 3 · Pub/Sub publish em ${PROJ_PIPE}/topics/${TOPIC}"
gcloud pubsub topics publish "${TOPIC}" \
  --project="${PROJ_PIPE}" \
  --message="$(cat ${PAYLOAD_PS})" \
  --attribute="slug=${SLUG},versao=v1.0-FINAL,action=review_pipeline"
echo "✅ Mensagem publicada no Pub/Sub · 6 revisores acionados"

# Fase 4 · Signed URL para PDF (válida 7 dias)
echo ""
echo "▶ Fase 4 · Gerar signed URL"
SIGNED_URL=$(gcloud storage sign-url \
  "gs://${BUCKET}/dossies_v1/${SLUG}/dossie.pdf" \
  --project="${PROJ_HOST}" \
  --duration=7d \
  --format='value(signed_url)' 2>/dev/null) || SIGNED_URL="(gerar manualmente · gcloud storage sign-url)"
echo "✅ Signed URL: ${SIGNED_URL:0:80}..."

# Fase 5 · Notificação Telegram (chat 6483072695)
echo ""
echo "▶ Fase 5 · Notificação Telegram"
BOT_TOKEN=$(gcloud secrets versions access latest --secret=telegram-bot-token --project="${PROJ_HOST}" 2>/dev/null || echo "")
if [ -n "$BOT_TOKEN" ]; then
  MSG="🎯 *Dossiê AURORA v1.0-FINAL publicado*

*Alvo:* Andreia Siqueira (MDB-PA)
*ID Câmara:* 220676
*Versão:* v1.0-FINAL · 29 páginas · 137 KB

*Pirâmide de severidade:*
🔴 12 CRÍTICA · 🟠 17 ALTA · 🟡 13 MÉDIA · ⚪ 8 INFO
*Universo:* R\$ 76,47 mi · *Score:* ELEVADO · *CNPJs:* 9

*Status:* em revisão automatizada (6 agentes)
- revisor_fonte_primaria
- revisor_tom
- revisor_contraditorio
- revisor_falso_positivo
- revisor_mascara_pii
- revisor_severidade

[📄 Abrir PDF](${SIGNED_URL})
[🏢 Escritório HQ](https://transparenciabr.web.app/escritorio-hq?slug=${SLUG})
[📊 Revisão](https://transparenciabr.web.app/revisao?slug=${SLUG})"
  curl -sf -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=6483072695" \
    -d "parse_mode=Markdown" \
    -d "disable_web_page_preview=true" \
    --data-urlencode "text=${MSG}" > /tmp/tg_response.json
  echo "✅ Telegram enviado · chat 6483072695"
else
  echo "⚠️  Secret telegram-bot-token não acessível · envie manualmente via @Asmodeuswebforgebot"
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  PIPELINE DISPARADO COM SUCESSO"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "  • Dossiê:       https://transparenciabr.web.app/dossie/${SLUG}"
echo "  • Escritório:   https://transparenciabr.web.app/escritorio-hq?slug=${SLUG}"
echo "  • Revisão:      https://transparenciabr.web.app/revisao?slug=${SLUG}"
echo "  • Firestore:    dossies_v1/${SLUG} (status=in_review)"
echo "  • Pub/Sub:      ${PROJ_PIPE}/topics/${TOPIC} (6 revisores acionados)"
echo ""
echo "  Acompanhar logs do Cloud Run Job:"
echo "    gcloud run jobs executions list --job=dossieV1Pipeline \\"
echo "      --region=us-east1 --project=${PROJ_PIPE} --limit=5"
echo ""
echo "  Revisão concluída em ~3-6 min. Telegram notifica ao final."
echo ""
