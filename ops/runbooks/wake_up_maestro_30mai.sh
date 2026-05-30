#!/usr/bin/env bash
# =============================================================================
# WAKE-UP MAESTRO + DESPACHO PROJETOS A+B + LIMPEZA — 30/mai/2026
# =============================================================================
# Comandante Maurilio Baesso — execute na VM aurora-cacador-br (SSH)
#
# Faz em sequência:
#   1. Ressuscita listener systemd Telegram→Maestro
#   2. Confirma que listener publica em maestro-commands
#   3. Publica MANUALMENTE no topic os 2 comandos (Projeto A + Projeto B)
#      como fallback caso o listener Telegram não acorde os updates antigos
#   4. Roda limpeza GCP completa (A→H)
#   5. Salva log em ~/maestro-logs/
# =============================================================================
set -uo pipefail

mkdir -p ~/maestro-logs
LOG=~/maestro-logs/wake_$(date +%Y%m%d_%H%M%S).log
exec > >(tee -a "$LOG") 2>&1

echo "==== WAKE MAESTRO INÍCIO $(date -Iseconds) ===="

# -----------------------------------------------------------------------------
# 1) Ressuscitar listener
# -----------------------------------------------------------------------------
echo ""
echo "==== [1] LISTENER TELEGRAM ===="
sudo systemctl status maestro-listener --no-pager 2>&1 | head -10 || echo "(unit ausente)"
echo "--- restart ---"
sudo systemctl restart maestro-listener 2>&1 || {
  echo "FAIL: tentar habilitar e iniciar"
  sudo systemctl enable maestro-listener 2>&1
  sudo systemctl start maestro-listener 2>&1
}
sleep 4
echo "--- status pós-restart ---"
sudo systemctl is-active maestro-listener || echo "AINDA INATIVO"
sudo journalctl -u maestro-listener -n 15 --no-pager 2>&1 | tail -15

# -----------------------------------------------------------------------------
# 2) Publicar manualmente os 2 comandos no Pub/Sub (fallback)
# -----------------------------------------------------------------------------
echo ""
echo "==== [2] DESPACHO MANUAL PROJETOS A+B ===="

PAYLOAD_A=$(cat <<'JSON'
{"chat_id":6483072695,"text":"/maestro PROJETO-A RADAR-JURIDICO-EXCLUSIVO\n\nLer o briefing completo em briefings/projeto-a-radar-juridico.md na branch feat/radar-juridico-exclusivo. Tasklist em apps/radar-juridico/MAESTRO_TASKLIST.md.\n\nObjetivo: derivar modulo PRIVADO single-tenant do radar_legal para o escritorio do Comandante (direitos humanos). Pipeline publicou-pegamos-alarme + enrichment-pii-aurora + 2 paywalls + Vertex Pro DOCX.\n\nExecutar autonomamente as etapas do TASKLIST. Audit tagged project:radar-juridico. Branch alvo: feat/radar-juridico-exclusivo.\n\nFreios F1-F6 ativos. Senha F2: aurora-cartman-2026. Billing codex-br.\n\nSe precisar recursos GCP, escreva em maestro_resource_requests Firestore. Reporte progresso no Telegram chat 6483072695. Allow all. Execute obstinadamente.","command_id":"proj-A-radar-30mai","source":"orchestrator-perplexity"}
JSON
)

PAYLOAD_B=$(cat <<'JSON'
{"chat_id":6483072695,"text":"/maestro PROJETO-B OCEANWAYS-MVP\n\nLer briefing em briefings/projeto-b-oceanways.md branch feat/oceanways-mvp. Tasklist em apps/oceanways/MAESTRO_TASKLIST.md.\n\nObjetivo: SaaS busca global award flights credit-based (Free 30/mes, Pro R\\$49/600, top-up R\\$10/100). Multi-source (seek/AwardWallet/direct), conversao BRL PTAX, comparacao brokers (123milhas/100milhas). Stack monorepo apps/oceanways/.\n\nR1 MVP: GIG-JFK + GRU-LHR + GRU-FCO. Pagamento test mode. Audit tagged project:oceanways. Branch: feat/oceanways-mvp.\n\nFreios F1-F6 ativos. Senha F2: aurora-cartman-2026. Billing codex-br.\n\nReporte progresso. Allow all. Execute obstinadamente.","command_id":"proj-B-oceanways-30mai","source":"orchestrator-perplexity"}
JSON
)

echo "--- publicando PROJETO A ---"
gcloud pubsub topics publish maestro-commands --project=projeto-codex-br --message="$PAYLOAD_A" 2>&1 | tail -3

echo "--- publicando PROJETO B (atrasa 30s para Maestro decidir ordem) ---"
sleep 30
gcloud pubsub topics publish maestro-commands --project=projeto-codex-br --message="$PAYLOAD_B" 2>&1 | tail -3

# -----------------------------------------------------------------------------
# 3) Confirmar que worker pegou
# -----------------------------------------------------------------------------
echo ""
echo "==== [3] VERIFICAR WORKER PROCESSOU ===="
sleep 10
gcloud run services logs read maestro-worker --region=us-east1 --project=projeto-codex-br --limit=20 2>&1 | tail -20

# -----------------------------------------------------------------------------
# 4) Limpeza GCP (chamando o runbook separado)
# -----------------------------------------------------------------------------
echo ""
echo "==== [4] LIMPEZA GCP A→H ===="
if [ -f ~/runbook_limpeza_gcp_30mai.sh ]; then
  bash ~/runbook_limpeza_gcp_30mai.sh
else
  echo "Runbook não encontrado em ~/runbook_limpeza_gcp_30mai.sh"
  echo "Para baixá-lo:"
  echo "  gh release download --repo mmbaesso1980/transparenciabr --pattern 'runbook_limpeza_gcp_30mai.sh'"
  echo "Ou copie do ChatGPT/Computer."
fi

# -----------------------------------------------------------------------------
# 5) Status final
# -----------------------------------------------------------------------------
echo ""
echo "==== STATUS FINAL $(date -Iseconds) ===="
echo "Listener Telegram→Maestro: $(sudo systemctl is-active maestro-listener)"
echo "Worker Cloud Run last revision: $(gcloud run services describe maestro-worker --region=us-east1 --project=projeto-codex-br --format='value(status.latestReadyRevisionName)' 2>/dev/null)"
echo "Log completo: $LOG"
echo ""
echo "Próximos passos:"
echo "  - Acompanhe Telegram (chat 6483072695) para mensagens do Maestro"
echo "  - Veja audit live em https://console.firebase.google.com/project/transparenciabr/firestore/data/~2Fmaestro_audit_log"
echo "  - Veja resource requests em https://console.firebase.google.com/project/transparenciabr/firestore/data/~2Fmaestro_resource_requests"
echo ""
echo "==== FIM ===="
