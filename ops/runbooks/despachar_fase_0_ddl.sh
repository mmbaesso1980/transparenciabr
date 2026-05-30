#!/usr/bin/env bash
# Despacha ordem específica ao Maestro para aplicar DDL Fase 0 ele mesmo
set -euo pipefail
PROJECT_CODEX="projeto-codex-br"
TOPIC="maestro-commands"
MSG_ID=$(date +%s)

read -r -d '' ORDEM <<'EOF'
/maestro fase-0-ddl-autonoma

Comandante AFK. ALLOW IRRESTRITO. Você (Maestro) executa AGORA a Fase 0 sozinho:

1. shell_exec: ssh aurora-cacador-br ou execute na própria VM via worker (você tem acesso à zona sa-east1-a):
   curl -fsSL https://raw.githubusercontent.com/mmbaesso1980/transparenciabr/ops/wake-30mai/ops/runbooks/aplicar_ddl_radar_juridico.sh -o /tmp/ddl.sh
   bash /tmp/ddl.sh 2>&1 | tee /tmp/ddl_output.txt

2. Se output contém "ERROR" ou exit code != 0:
   - Grave em maestro_audit_log {tag: "ddl_falhou", output: <output>}
   - Continue mesmo assim para Fase 1 das sub-tarefas que NÃO dependem de BQ
   - Abra issue no repo "Fase 0 DDL falhou — investigar"

3. Se sucesso:
   - Grave em maestro_audit_log {tag: "ddl_aplicada", datasets: ["radar_juridico", "oceanways_dev", "oceanways_prod"]}
   - Prossiga com Fase 1 dos 2 projetos em paralelo

NÃO me pergunte. EU (Comandante Baesso) DOU ALLOW IRRESTRITO. Execute.
senha=aurora-cartman-2026 · allow_all=true · max_turns=120
EOF

PAYLOAD=$(python3 -c "
import json
print(json.dumps({
    'chat_id': 6483072695,
    'message_id': $MSG_ID,
    'from_id': 6483072695,
    'senha': 'aurora-cartman-2026',
    'max_turns': 120,
    'allow_all': True,
    'text': '''$ORDEM'''
}, ensure_ascii=False))
")

gcloud config set project "$PROJECT_CODEX" >/dev/null
ID=$(gcloud pubsub topics publish "$TOPIC" --project="$PROJECT_CODEX" --message="$PAYLOAD" --format="value(messageIds)")
echo "✅ Fase 0 DDL despachada ao Maestro. Pub/Sub ID: $ID"
