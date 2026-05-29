---
name: aurora-forensic-ops
description: "Operações do pipeline AURORA Forensic v1.0+ — Legião 100 integrada, cross-project billing transparenciabr↔projeto-codex-br, Cloud Run Jobs, Pub/Sub, escritório HQ Phaser, revisão automatizada de 6 agentes, deploy via Cloud Shell, ligar/desligar VM L4. Use quando o Comandante OPERADOR pedir: deploy AURORA, ligar/desligar VM tbr-mainframe-us-east1-d, queimar crédito codex-br, rodar dossiê v1.0, revisar dossiê (pipeline 6 revisores), abrir HQ, escritório virtual, troubleshoot Pub/Sub dossie-v1-pipeline, ou IAM cross-project. NÃO carregar para tarefas externas ao pipeline AURORA — usar transparenciabr-lei + dossie-forense-parlamentar para essas."
metadata:
  author: comandante
  version: '1.0'
  release_date: '2026-05-25'
  related_prs:
    - 'mmbaesso1980/transparenciabr#233'
    - 'mmbaesso1980/transparenciabr#234'
    - 'mmbaesso1980/transparenciabr#235'
---

# AURORA Forensic Ops — Skill operacional do pipeline v1.0+

## Quando carregar esta skill

Carregue **sempre** que a tarefa envolver operação do pipeline AURORA Forensic v1.0 ou superior. Sinais inequívocos:

- Comandante diz: "deploy AURORA", "rodar dossiê v1", "queimar crédito codex-br"
- Operação na VM L4: "ligar/desligar `tbr-mainframe-us-east1-d`", "religar mainframe", "auto-shutdown"
- Pipeline cross-project: Cloud Run Job em `projeto-codex-br` consumindo Firestore/GCS em `transparenciabr`
- Pub/Sub: tópico `dossie-v1-pipeline` (subs, publisher SA, ack, retry)
- Escritório virtual: rota `/escritorio-hq`, sprites Phaser, máquina de estados de agente
- Revisão automatizada: 6 revisores (`revisor_fonte_primaria`, `revisor_tom`, `revisor_contraditorio`, `revisor_falso_positivo`, `revisor_mascara_pii`, `revisor_severidade`)
- Crédito GenAI App Builder em `projeto-codex-br` (R$ 5.677,28, expira 03/05/2027)
- Service Account compartilhada: `queima-vertex@projeto-codex-br.iam.gserviceaccount.com`

Em conflito, a hierarquia é: **`transparenciabr-lei` > `dossie-forense-parlamentar` > `aurora-forensic-ops`**. Esta skill é operacional; as outras duas definem regras de tom, LGPD e padrão visual do produto.

## Núcleo inegociável (regras herdadas — sempre em contexto)

1. **Tom INFORMATIVO** — "Comandante OPERADOR", português formal. Proibido: `fraudou`, `desviou`, `roubou`, `corrupto`, `ladrão`, `criminoso`, `prova de crime`.
2. **Sem mock, sem fake** — apenas dados reais e verificáveis.
3. **CPF mascarado** `***.XXX.XXX-**` em todo log, UI e PDF.
4. **Proibido em PDF/UI público**: `BigQuery`, `vw_*`, `transparenciabr.transparenciabr`, `fato_emenda_pagamento`, "Asmodeus".
5. **GitHub via `gh` CLI** com `api_credentials=["github"]` — NUNCA browser_task em URLs github.com.
6. **gcloud / firebase / gsutil** não estão disponíveis no sandbox — Comandante roda no [Cloud Shell](https://shell.cloud.google.com).
7. **Contraditório 3-partes** obrigatório em todo finding ≥ MÉDIA.
8. **Cap severidade MÉDIA** quando contraditório aponta prerrogativa legal ou decisão judicial favorável.

## Arquitetura cross-project (referência fundamental)

| Recurso | Projeto | Comentário |
|---|---|---|
| Firebase Hosting (`transparenciabr.web.app`) | `transparenciabr` | Frontend principal |
| Firestore `dossies_v1/` | `transparenciabr` | Estado dos dossiês |
| Cloud Function `iniciarDossieV1` | `transparenciabr` | Callable trigger |
| BigQuery `transparenciabr.*` + `tbr_leads_prev.*` | `transparenciabr` | Dados forenses (uso interno) |
| GCS `datalake-tbr-clean` | `transparenciabr` | PDFs gerados em `dossies_v1/{slug}/dossie.pdf` |
| Pub/Sub `dossie-v1-pipeline` | `projeto-codex-br` | Fila de jobs |
| Cloud Run Job `dossieV1Pipeline` | `projeto-codex-br` | Engine Python |
| Vertex AI (Gemini 2.5 Pro/Flash) | `projeto-codex-br` | R$ 5.677,28 créditos, expira 03/05/2027 |
| Artifact Registry | `projeto-codex-br` | Imagens Docker |
| Eventarc | `projeto-codex-br` | Pub/Sub → Cloud Run trigger |

### Service Accounts críticas

- **`queima-vertex@projeto-codex-br.iam.gserviceaccount.com`** — SA principal do pipeline
  - Em `transparenciabr`: `roles/datastore.user` + `roles/storage.objectAdmin`
  - Em `projeto-codex-br`: `roles/run.invoker` + `roles/aiplatform.user` + `roles/pubsub.subscriber`
- **`transparenciabr@appspot.gserviceaccount.com`** — SA da Cloud Function
  - Em `projeto-codex-br`: precisa `roles/pubsub.publisher` (publicar no `dossie-v1-pipeline`)
- **`tbr-reader@transparenciabr.iam.gserviceaccount.com`** — SA de leitura BQ (chave já comprometida; nunca expor outputs brutos do connector Pipedream)

Detalhes operacionais em [`references/cross-project-iam.md`](./references/cross-project-iam.md).

## Workflows operacionais (índice)

| Quando o Comandante pedir... | Leia... |
|---|---|
| Deploy completo do pipeline | [`references/cloud-shell-quickdeploy-runbook.md`](./references/cloud-shell-quickdeploy-runbook.md) |
| Ligar/desligar VM `tbr-mainframe-us-east1-d` ou `aurora-cacador-br` | [`references/vm-stop-restart.md`](./references/vm-stop-restart.md) |
| Configurar IAM cross-project (após criar SA nova ou em projeto novo) | [`references/cross-project-iam.md`](./references/cross-project-iam.md) |
| Rodar/debugar fase de revisão automatizada | [`references/review-pipeline.md`](./references/review-pipeline.md) |
| Incorporar regras Gemini v1.1 (FP-BANCADA, CONTRATO_RECORRENTE, prerrogativa legal) | [`references/gemini-v11-improvements.md`](./references/gemini-v11-improvements.md) |
| Comando rápido (gcloud, firebase, pubsub, bq) | [`references/command-cheatsheet.md`](./references/command-cheatsheet.md) |

## Deploy padrão (resumo do quickdeploy)

O Comandante NÃO executa gcloud no sandbox. Ele abre [Cloud Shell](https://shell.cloud.google.com) e roda:

```bash
git clone https://github.com/mmbaesso1980/transparenciabr.git
cd transparenciabr
bash cloud_shell_quickdeploy.sh
```

O script tem 6 fases (197 LOC):

1. **validate** — verifica gcloud auth, projetos ativos, billing
2. **IAM** — cria/atualiza SAs e role bindings cross-project
3. **Pub/Sub** — cria/atualiza tópico `dossie-v1-pipeline` em codex-br
4. **secret** — escreve token Direct Data + chave Vertex em Secret Manager
5. **deploy** — push Docker (Artifact Registry codex-br) + deploy Cloud Run Job + deploy Cloud Function callable
6. **smoke** — chama `iniciarDossieV1({slug: "smoke-test"})` e verifica ack no Firestore em ≤30s

Após deploy bem-sucedido, o frontend em [`https://transparenciabr.web.app/escritorio`](https://transparenciabr.web.app/escritorio) (ou `/escritorio-hq` para o app Phaser) recebe updates em tempo real via Firestore listener.

## VM L4 — gestão de custo

- VM: `tbr-mainframe-us-east1-d` (zona `us-east1-d`, projeto `transparenciabr`, GPU L4)
- Status atual: **STOPPED desde 2026-05-25** (economia ~R$ 800-1.500/mês)
- Religar quando precisar processar lote pesado (ex: ingestão massiva 6M+ leads):
  ```bash
  gcloud compute instances start tbr-mainframe-us-east1-d \
    --zone=us-east1-d --project=transparenciabr
  ```
- Scripts `run_overnight.sh` + `run_l4_massive.sh` têm `AUTO_SHUTDOWN=1` → auto-desligam após job
- Armadilha: NUNCA usar `pkill -f <nome_do_script>` em `gcloud ssh --command='...'` — mata o próprio SSH. Usar PID file.

Detalhes em [`references/vm-stop-restart.md`](./references/vm-stop-restart.md).

## Pipeline de revisão automatizada (v1.1)

Após o Maestro produzir `findings.json` e ANTES da geração do PDF, roda a fase de revisão com 6 agentes em paralelo:

| # | Revisor | Função | Severidade típica de warning |
|---|---|---|---|
| 1 | `revisor_fonte_primaria` | URL pública verificável; remove menções a BQ interno | ALTA se faltar URL |
| 2 | `revisor_tom` | Blocklist v1.0; sugere descritivos | CRÍTICA se verbo proibido |
| 3 | `revisor_contraditorio` | Template 3-partes em findings ≥ MÉDIA | MÉDIA |
| 4 | `revisor_falso_positivo` | FP-BANCADA + CONTRATO_RECORRENTE; reclassifica | reclassificação automática |
| 5 | `revisor_mascara_pii` | CPF → `***.XXX.XXX-**`; bloqueia Classe C | CRÍTICA se Classe C vaza |
| 6 | `revisor_severidade` | Cap MÉDIA com prerrogativa legal/decisão favorável | informativo |

Política de retry: **2 tentativas por agente**. Se persistir warning → publica com flag `review_warnings: [...]` no Firestore + selo "Publicado com observações de revisão" no PDF.

Estado em Firestore: `dossies_v1/{slug}/review/{revisor_id}`.

Detalhes operacionais e exemplos em [`references/review-pipeline.md`](./references/review-pipeline.md).

## Escritório HQ (Phaser pixel-art)

Rota: `/escritorio-hq` em `transparenciabr.web.app` (ou app standalone `aurora-comando.pplx.app`).

- Cena 2D top-down, 32×24 tiles 16px, 4 zonas (Forense, Revisão, Maestro, Copa)
- Sprites gerados procedural via canvas (zero binários)
- Listener Firestore `dossies_v1/{slug}/agents/*` → state machine do sprite
- Estados: `idle`, `working`, `calling_vertex`, `reviewing`, `done`, `error`
- Click no sprite → painel lateral com logs JSON do agente
- Mobile-first, FPS target 30, max 30 sprites simultâneos

Quando o Comandante pedir "abrir HQ", "ver os agentes trabalhando", "abrir escritório" → direcionar para [`/escritorio-hq`](https://transparenciabr.web.app/escritorio-hq).

## Custos estimados

| Recurso | Custo por dossiê | Mensal (assumindo 30 dossiês/mês) |
|---|---|---|
| Vertex AI Gemini (Pro+Flash) | R$ 1,20 | R$ 36,00 |
| Cloud Run Job (CPU+memory) | R$ 0,15 | R$ 4,50 |
| Pub/Sub + Eventarc | R$ 0,03 | R$ 0,90 |
| Revisão (6 agentes Flash) | R$ 0,15 | R$ 4,50 |
| Storage GCS (PDFs) | R$ 0,01 | R$ 0,30 |
| Firestore reads/writes | R$ 0,02 | R$ 0,60 |
| **Total** | **R$ 1,56** | **R$ 46,80** |

Cabe folgadamente nos R$ 5.677,28 de crédito do projeto codex-br (≥3.600 dossiês até expiração em 03/05/2027).

Para acompanhar consumo: [Console de créditos](https://console.cloud.google.com/billing/credits?project=projeto-codex-br).

## Telegram (notificações)

- Bot: [`@Asmodeuswebforgebot`](https://t.me/Asmodeuswebforgebot) (codinome interno, OK em canal privado de notificação)
- Chat do Comandante: `6483072695` (8 dígitos — `643072695` é ERRADO)
- Eventos notificados:
  - Pipeline iniciado (com link `/escritorio-hq`)
  - Revisão concluída (status + warnings)
  - PDF publicado (link signed URL)
  - Erro crítico (com slug + stack trace)

## URLs importantes

- [Repo](https://github.com/mmbaesso1980/transparenciabr)
- [Frontend principal](https://transparenciabr.web.app)
- [Escritório (tabela)](https://transparenciabr.web.app/escritorio)
- [Escritório HQ (Phaser)](https://transparenciabr.web.app/escritorio-hq) — após Bloco 0 mergeado
- [Revisão (6 agentes)](https://transparenciabr.web.app/revisao) — após Bloco 3 mergeado
- [App Comando standalone](https://aurora-comando.pplx.app) — após Bloco 2 publicado
- [Cloud Shell](https://shell.cloud.google.com)
- [Crédito codex-br](https://console.cloud.google.com/billing/credits?project=projeto-codex-br)

## Workflow padrão de invocação

1. Comandante pede operação AURORA
2. Carregue: `transparenciabr-lei` (lei superior) + `aurora-forensic-ops` (esta) + `dossie-forense-parlamentar` (se for dossiê)
3. Identifique qual referência ler (`references/*.md`)
4. Execute via:
   - `gh` CLI com `api_credentials=["github"]` para GitHub
   - Connector `google_cloud__pipedream` para BQ/instances (sem expor outputs brutos)
   - Connector `firebase_admin_sdk__pipedream` para Firestore writes do orquestrador
   - Sandbox `bash` para criar/editar código, NÃO para gcloud
   - Comandante roda gcloud/firebase no [Cloud Shell](https://shell.cloud.google.com)
5. Antes de qualquer publicação/deploy/drop → `confirm_action`
6. Após sucesso → atualizar `dossies_v1/{slug}.status` no Firestore + notificar Telegram

## Skills relacionadas

- [`transparenciabr-lei`](../transparenciabr-lei/SKILL.md) — autoridade superior, lei do projeto inteiro
- [`dossie-forense-parlamentar`](../dossie-forense-parlamentar/SKILL.md) — padrão dos dossiês forenses (tom, LGPD, visual)
- [`enrichment-pii-aurora`](../enrichment-pii-aurora/SKILL.md) — pipeline PII para leads INSS

## Changelog

### 1.0 (2026-05-25) — Release inicial
- Skill criada a partir das sessões de calibragem do Comandante (mai/2026)
- Consolida PRs #233 (Legião 100 + EscritórioPage), #234 (auditoria Gemini), #235 (quickdeploy)
- 6 referências bundled: cross-project-iam, vm-stop-restart, cloud-shell-quickdeploy-runbook, gemini-v11-improvements, review-pipeline, command-cheatsheet
- Cross-project billing transparenciabr↔projeto-codex-br operacional
- VM `tbr-mainframe-us-east1-d` STOPPED por padrão (economia ~R$ 1k/mês)
- Pipeline de 6 revisores automatizados (v1.1)
- Escritório HQ Phaser pixel-art

### Próximas iterações esperadas
- 1.1 — após primeiro mês em produção, calibrar custo real vs. estimado e taxa de warning dos revisores
- 1.2 — adicionar revisor #7 para checagem de homonímia (Similarity API Direct Data) em PEPs
