#!/usr/bin/env bash
# ============================================================
# DESPACHO GRANDE — versão 2 com prompt completo de 9.5KB
# Baixa o markdown da branch ops/wake-30mai e publica no Pub/Sub.
# Comandante Baesso · 30/mai/2026 16:33 BRT
# ============================================================
set -euo pipefail

PROJECT_CODEX="projeto-codex-br"
TOPIC="maestro-commands"
CHAT_ID=6483072695
SENHA="aurora-cartman-2026"
MSG_ID=$(date +%s)
PROMPT_URL="https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/ops/runbooks/prompt_maestro_afk_30mai_1623.md"
TMP_PROMPT=$(mktemp /tmp/maestro_prompt.XXXXXX.md)
TMP_PAYLOAD=$(mktemp /tmp/maestro_payload.XXXXXX.json)
trap "rm -f $TMP_PROMPT $TMP_PAYLOAD" EXIT

echo "==> Baixando prompt completo de $PROMPT_URL..."
curl -fsSL "$PROMPT_URL" -o "$TMP_PROMPT"
echo "    $(wc -c < $TMP_PROMPT) bytes baixados"

echo "==> Montando payload F1-compliant com prompt completo..."
python3 - <<PYEOF
import json, pathlib
prompt = pathlib.Path("$TMP_PROMPT").read_text(encoding="utf-8")
payload = {
    "chat_id": $CHAT_ID,
    "message_id": $MSG_ID,
    "from_id": $CHAT_ID,
    "senha": "$SENHA",
    "max_turns": 120,
    "allow_all": True,
    "text": prompt,
}
pathlib.Path("$TMP_PAYLOAD").write_text(json.dumps(payload, ensure_ascii=False))
print(f"    payload final: {pathlib.Path('$TMP_PAYLOAD').stat().st_size} bytes")
PYEOF

echo "==> Validando gcloud auth..."
gcloud config set project "$PROJECT_CODEX" >/dev/null

echo "==> Publicando no Pub/Sub $PROJECT_CODEX/$TOPIC..."
MSG_PUBSUB=$(gcloud pubsub topics publish "$TOPIC" \
  --project="$PROJECT_CODEX" \
  --message="$(cat $TMP_PAYLOAD)" \
  --format="value(messageIds)")

echo ""
echo "============================================================"
echo "✅ DESPACHO COMPLETO. Pub/Sub message id: $MSG_PUBSUB"
echo "   Prompt de $(wc -c < $TMP_PROMPT) bytes entregue ao Maestro."
echo "============================================================"
echo "Diretivas completas: Projetos A+B, Fases 1-5, max_turns=120, allow_all."
echo "Acompanhe os commits nas branches feat/radar-juridico-exclusivo e feat/oceanways-mvp."
