#!/usr/bin/env bash
# ============================================================
# Despacha prompt AFK gigante ao Maestro v2.1.4 via Pub/Sub
# direto da VM aurora-cacador-br (sa-east1-a).
# Comandante Baesso · 30/mai/2026 16:25 BRT
# ============================================================
# COMO USAR:
#   1. Acessar Cloud Shell OU SSH da VM aurora-cacador-br
#   2. cd ~/transparenciabr && git pull origin ops/wake-30mai
#   3. bash ops/runbooks/despachar_maestro_via_vm.sh
# OU, sem clonar, colar o conteúdo inteiro num shell logado.
# ============================================================

set -euo pipefail

PROJECT_CODEX="projeto-codex-br"
TOPIC="maestro-commands"
CHAT_ID=6483072695
SENHA_DIA="aurora-cartman-2026"
MSG_ID=$(date +%s)   # fake message_id baseado em epoch

echo "==> Validando gcloud auth..."
gcloud config set project "${PROJECT_CODEX}" >/dev/null
gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1

echo "==> Validando que o tópico existe..."
gcloud pubsub topics describe "${TOPIC}" --project="${PROJECT_CODEX}" >/dev/null

echo "==> Montando payload F1-compliant..."
PAYLOAD_FILE=$(mktemp /tmp/maestro_afk_payload.XXXXXX.json)
trap "rm -f ${PAYLOAD_FILE}" EXIT

cat > "${PAYLOAD_FILE}" <<'PAYLOAD_EOF'
{
  "chat_id": 6483072695,
  "message_id": __MSG_ID__,
  "from_id": 6483072695,
  "senha": "__SENHA__",
  "max_turns": 120,
  "allow_all": true,
  "text": "__TEXTO_PROMPT__"
}
PAYLOAD_EOF

# Injetar prompt grande (lê do markdown se existir, senão usa inline curto)
PROMPT_FILE="${HOME}/transparenciabr/ops/runbooks/prompt_maestro_afk_30mai_1623.md"
if [[ -f "${PROMPT_FILE}" ]]; then
  echo "==> Lendo prompt completo de ${PROMPT_FILE}..."
  PROMPT_TEXT=$(cat "${PROMPT_FILE}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
  # PROMPT_TEXT já vem com aspas em volta — remover
  PROMPT_TEXT="${PROMPT_TEXT:1:-1}"
else
  echo "!! Prompt markdown não encontrado, usando versão curta inline."
  PROMPT_TEXT="/maestro execute-autonomous-afk-night-30mai · senha=${SENHA_DIA} · allow_all=true · max_turns=120 · Projetos A (Radar Jurídico) e B (Ocean Ways) em paralelo, branches feat/radar-juridico-exclusivo e feat/oceanways-mvp. NÃO me pergunte nada. NUNCA salve em Firestore — sempre branch+PR. Alterne A↔B. Audit log obrigatório. Comandante AFK no celular."
fi

# Substituir placeholders
sed -i "s/__MSG_ID__/${MSG_ID}/" "${PAYLOAD_FILE}"
sed -i "s/__SENHA__/${SENHA_DIA}/" "${PAYLOAD_FILE}"
# Para o texto grande, usar python pra evitar problemas com sed e caracteres especiais
python3 - "${PAYLOAD_FILE}" "${PROMPT_TEXT}" <<'PYEOF'
import json, sys
path, prompt = sys.argv[1], sys.argv[2]
with open(path) as f:
    obj = json.load(f)
obj["text"] = prompt
with open(path, "w") as f:
    json.dump(obj, f, ensure_ascii=False)
print(f"   Payload final: {len(json.dumps(obj))} bytes")
PYEOF

echo "==> Publicando no Pub/Sub ${PROJECT_CODEX}/${TOPIC}..."
MSG_ID_PUBSUB=$(gcloud pubsub topics publish "${TOPIC}" \
  --project="${PROJECT_CODEX}" \
  --message="$(cat ${PAYLOAD_FILE})" \
  --format="value(messageIds)")

echo ""
echo "============================================================"
echo "✅ DESPACHADO. Pub/Sub message id: ${MSG_ID_PUBSUB}"
echo "============================================================"
echo "Acompanhe os commits em:"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/radar-juridico-exclusivo"
echo "  https://github.com/mmbaesso1980/transparenciabr/commits/feat/oceanways-mvp"
echo ""
echo "Cron de monitoramento 70e45707 já notifica o Comandante a cada hora se houver SHA novo."
echo "Boa noite. Maestro queimando Vertex em ${PROJECT_CODEX}."
