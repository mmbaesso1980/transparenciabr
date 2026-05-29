# RUNBOOK — Ambiente Único de Execução (P0.5 GOD v2.0)

> **Regra de Ouro:** existe um único ambiente correto para cada tarefa. Não há margem para "rodar em qualquer lugar".

## Tabela de roteamento

| Tarefa | Ambiente | Comando-padrão | Motivo |
|---|---|---|---|
| Build imagem Docker worker | **Cloud Build** | `gcloud builds submit --tag gcr.io/projeto-codex-br/maestro-worker:vX.Y.Z .` | Stateless, paralelo, sem disco local |
| Deploy Cloud Run | **De qualquer auth** | `gcloud run deploy maestro-worker --image=...` | Idempotente |
| Deploy Cloud Functions | **VM aurora-cacador-br** | `firebase deploy --only functions` | node_modules 8GB+ → mata Cloud Shell |
| Deploy Firebase Hosting | **VM aurora-cacador-br** | `firebase deploy --only hosting` | Build frontend ~6GB |
| Frontend `npm install/build` | **VM aurora-cacador-br** | `cd frontend && npm install && npm run build` | Phaser+ArcGIS+Three+MapLibre |
| Queries BigQuery ad-hoc | **VM ou Cloud Console** | `bq query --use_legacy_sql=false ...` | Latência |
| Edição de prompt/corpus Maestro | **Computer (Perplexity)** → PR → merge → VM redeploy | `git add . && git commit && git push` | Versionamento + revisão |
| systemd listener | **VM aurora-cacador-br** | `sudo systemctl restart maestro-listener.service` | Persistência |
| Operação Firestore (read/write/delete) | **VM ou Computer via API REST** | `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" ...` | Auth |
| Comando único `/maestro X` | **Telegram → bot → listener → worker** | (pelo app Telegram do Comandante) | Pipeline produtivo |

## Anti-padrões PROIBIDOS

| Anti-padrão | Por quê |
|---|---|
| `npm install` em **Cloud Shell** | ENOSPC (5GB disco) — falha histórica |
| `gcloud builds submit` em **Cloud Shell** | OK na teoria, mas mistura ambientes — use direto da VM |
| `firebase deploy` em **Computer** | Sandbox Computer não tem auth gcloud do Comandante |
| Build com `tar -cf` sem `-C` em Cloud Shell | Quebra paths relativos (bug histórico do `deploy_all.sh`) |
| `pkill -f <nome>` dentro de `gcloud ssh --command='...'` | Mata o próprio SSH (armadilha registrada) |
| Edição direta em `main` sem PR | Viola regra projeto — todo write em prompt/corpus passa por PR |

## Quando algo der errado

1. **Não tente brute-force.** Se um comando falhou, releia a tabela acima.
2. **Logs primeiro:** `gcloud logging read 'resource.type=cloud_run_revision' --project=projeto-codex-br --limit=20`
3. **Estado do Firestore:** `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" "https://firestore.googleapis.com/v1/projects/transparenciabr/databases/(default)/documents/maestro_audit_log?pageSize=10"`
4. **Estado do listener:** `sudo systemctl status maestro-listener.service`

## Comandos single-line para SSH mobile

> Nota técnica: SSH mobile come bracketed-paste markers `[200~ ... ~`. Use **um comando por vez**, **sem barras invertidas** no fim de linha.

### Status geral do Maestro
```
gcloud run services describe maestro-worker --project=projeto-codex-br --region=us-east1 --format='value(status.url,status.latestReadyRevisionName)' && sudo systemctl is-active maestro-listener.service
```

### Smoke test pós-deploy
Direto no Telegram: `/maestro consegue me entender?`
Esperado: resposta começando com "Sim, Comandante Baesso..."

### Emergência (kill switch)
```
gcloud firestore documents update maestro_control/kill_switch --project=transparenciabr --data='{"active":true}'
```

### Reativar
```
gcloud firestore documents update maestro_control/kill_switch --project=transparenciabr --data='{"active":false}'
```

---

**Este runbook é fonte única de verdade sobre onde executar o quê. Se há dúvida, consulta-se este arquivo antes de qualquer ação.**
