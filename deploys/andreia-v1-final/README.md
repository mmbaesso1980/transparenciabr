# AURORA Deploy Package · Andreia Siqueira (MDB-PA) v1.0-FINAL

Pacote pronto para disparar pipeline AURORA Forensic no Cloud Shell.

## Conteúdo

| Arquivo | Função |
|---|---|
| `dossie.pdf` | Dossiê v1.0-FINAL (29 páginas, 137 KB) |
| `findings.json` | 50 findings estruturados |
| `firestore_payload.json` | Documento `dossies_v1/andreia-siqueira` |
| `pubsub_payload.json` | Mensagem para tópico `dossie-v1-pipeline` |
| `deploy_pipeline.sh` | Script de 5 fases (validação SHA → GCS → Firestore → Pub/Sub → Telegram) |
| `SHA256SUMS` | Hash do PDF para verificação |

## Como rodar (Cloud Shell)

```bash
# 1. Abrir Cloud Shell: https://shell.cloud.google.com
# 2. Subir o diretório aurora_deploy_andreia (botão "Upload" do Cloud Shell)
# 3. Executar:
cd ~/aurora_deploy_andreia
chmod +x deploy_pipeline.sh
bash deploy_pipeline.sh
```

## O que acontece

| Fase | Ação | Recurso afetado |
|---|---|---|
| 0 | Verifica SHA-256 do PDF | local |
| 1 | Upload PDF + findings.json | `gs://datalake-tbr-clean/dossies_v1/andreia-siqueira/` |
| 2 | PATCH no Firestore via REST API | `dossies_v1/andreia-siqueira` (status=in_review) |
| 3 | Publish no Pub/Sub | `projeto-codex-br/topics/dossie-v1-pipeline` |
| 4 | Signed URL 7 dias | URL temporária assinada |
| 5 | Notifica Telegram | chat 6483072695 com botões para PDF/HQ/Revisão |

## Após disparar

- **Escritório HQ Phaser**: https://transparenciabr.web.app/escritorio-hq?slug=andreia-siqueira
- **Painel revisão**: https://transparenciabr.web.app/revisao?slug=andreia-siqueira
- **Console Pub/Sub**: https://console.cloud.google.com/cloudpubsub/topic/detail/dossie-v1-pipeline?project=projeto-codex-br
- **Logs Cloud Run Job**: `gcloud run jobs executions list --job=dossieV1Pipeline --region=us-east1 --project=projeto-codex-br --limit=5`

## Revisão automatizada (6 agentes)

| Agente | Função |
|---|---|
| `revisor_fonte_primaria` | URL pública verificável em cada finding |
| `revisor_tom` | Blocklist v1.0 (fraudou, desviou, roubou…) |
| `revisor_contraditorio` | Template 3-partes em findings ≥ MÉDIA |
| `revisor_falso_positivo` | FP-BANCADA + CONTRATO_RECORRENTE |
| `revisor_mascara_pii` | CPFs mascarados, Classe C bloqueada |
| `revisor_severidade` | Cap MÉDIA com prerrogativa legal/decisão favorável |

Duração esperada: 3-6 minutos. Custo: ~R$ 1,56 (crédito codex-br).

## Critérios de fechamento

✅ Status Firestore vira `published` (sem warnings) ou `published_with_observations` (com warnings)
✅ Telegram recebe segunda mensagem com resultado da revisão
✅ Sprites do `/escritorio-hq` voltam ao estado `idle` ou `done`
✅ PDF acessível em `https://transparenciabr.web.app/dossie/andreia-siqueira`
