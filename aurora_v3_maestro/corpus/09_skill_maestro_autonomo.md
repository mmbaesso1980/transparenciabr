---
name: maestro-autonomo
description: Operação e evolução do Maestro v1.0 — agente autônomo TransparênciaBR rodando Vertex Gemini 2.5 Pro com autonomia total de edição de código em main, Telegram bidirecional, memória tática Firestore, hospedagem híbrida VM aurora-cacador-br + Cloud Run em projeto-codex-br, 5 freios de segurança e audit log imutável. Use sempre que o Comandante Baesso pedir para acordar, parar, debugar, evoluir, fazer rollback, queimar crédito Vertex via Maestro, rodar teste cego com Maestro, gerar dossiê via Maestro, ler memória tática, ou modificar o system prompt v1.0. NÃO carregar para dossiês manuais — use `dossie-forense-parlamentar` ou `due-diligence-pro` para esses.
---

# Maestro v1.0 — Skill de operação

## Quando carregar

- Comandante Baesso pede `/maestro <algo>` ou menciona explicitamente "o Maestro"
- Tarefa envolve `maestro_audit_log`, `maestro_memory`, `maestro_rollback`, `maestro_control`
- Operação sobre o worker Cloud Run `maestro-worker` em `projeto-codex-br`
- Operação sobre o listener systemd `maestro-listener.service` em `aurora-cacador-br`
- Edição do `SYSTEM_PROMPT_v1.0.md` ou de qualquer arquivo em `aurora_v3_maestro/`
- Pedido de teste cego usando o Maestro
- Necessidade de matar, retomar ou auditar execuções autônomas

## NÃO carregar quando

- Dossiê forense parlamentar manual → `dossie-forense-parlamentar`
- Due diligence manual de não-parlamentar → `due-diligence-pro`
- Pipeline AURORA Forensic v1.0 sem envolver Maestro → `aurora-forensic-ops`
- Lei do projeto sem operação do Maestro → `transparenciabr-lei` é suficiente

## Identidade do Maestro

| Campo | Valor |
|---|---|
| Modelo | `gemini-2.5-pro` em `projeto-codex-br/us-east1` |
| Temperatura | `0.1` (forense determinístico) |
| Max tokens | 32.768 |
| Worker | Cloud Run `maestro-worker` SA `maestro-worker@projeto-codex-br` |
| Listener | VM `aurora-cacador-br` (sa-east1-a) systemd `maestro-listener.service` |
| Bot Telegram | `t.me/Asmodeuswebforgebot` |
| Whitelist chat | `6483072695` (8 dígitos) |
| Pub/Sub topic | `projects/projeto-codex-br/topics/maestro-commands` |
| Subscription | `maestro-commands-sub` |
| Repo autoedita | `mmbaesso1980/transparenciabr` branch `main` |

## Os 5 freios

1. **F1 whitelist** chat_id `6483072695` — listener + worker filtram
2. **F2 senha do dia** = `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1")[:8]` UTC
   Necessária para `drop`/`delete`/`deploy`/`burn`/`merge`/`tuning`
   Listener arma janela de 5 min após `/maestro senha <XXX>`
3. **F3 kill-switch** Firestore `maestro_control/kill_switch.active=true`
   Worker checa a cada turno do loop de raciocínio
4. **F4 snapshot** Firestore coleção → `maestro_rollback/snap-YYYYMMDD-HHMMSS-xxxxxx`
   Disparado automaticamente antes de `github_edit_file` e ações irreversíveis
5. **F5 FinOps** soft cap R$ 30/h, hard cap R$ 80/h em queima Vertex
   Reset a cada janela de 1h

## Operações comuns

### Acordar o Maestro (deploy do zero)

```bash
# Cloud Shell
cd ~/transparenciabr/aurora_v3_maestro/deploy
bash deploy_all.sh
```

### Pedir status (Telegram)

```
/maestro status
```

### Matar tudo (emergência)

```
/maestro stop
```

ou direto via gcloud:
```bash
gcloud firestore documents update \
  maestro_control/kill_switch \
  --project=transparenciabr \
  --data='{"active":true}'
```

### Auditar últimos eventos

```
/maestro audit 20
```

ou via Firestore:
```bash
python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py audit 20
```

### Ensinar lição nova manualmente

```bash
python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py \
  write <topic-slug> "<lição em texto>" --tags tag1 tag2
```

### Rodar teste cego

```bash
cd /home/user/workspace/aurora_v3_maestro/worker
python blind_test_paulo_octavio.py --dry-run    # valida bundle
python blind_test_paulo_octavio.py --run-vertex # queima ~R$ 5-10
```

Saída em `aurora_v3_maestro/blind_test_paulo_octavio/`.

### Atualizar o system prompt

Editar `corpus/0X_*.md` → rebuild → commit → redeploy:

```bash
cd /home/user/workspace/aurora_v3_maestro/prompts
python build_system_prompt.py
git -C /home/user/workspace/aurora_v3_maestro add corpus/ prompts/SYSTEM_PROMPT_v1.0.md
git commit -m "feat(maestro): atualiza prompt v1.0.1"
git push
# Redeploy
cd ../deploy && bash deploy_all.sh
```

## Tools disponíveis ao Gemini (no system prompt v1.0)

`telegram_send` · `github_edit_file` · `firestore_read` · `firestore_write`
`vertex_invoke` · `directdata_call` · `shell_exec` · `snapshot_firestore`
`memory_recall` · `memory_write` · `task_complete`

## Armadilhas (já gravadas em maestro_memory)

| Topic | Lição |
|---|---|
| `pkill-armadilha` | NUNCA `pkill -f X` dentro de `gcloud --command` — mata o SSH |
| `glyph-render-pdf` | `▸` (U+25B8) não renderiza em Inter; usar `›` (U+203A) |
| `vm-worker-silent-fail` | `try/except: pass` em worker grava 0 bytes — sempre logar `errors/<key>.err` |
| `tbr-reader-sa-comprometida` | NUNCA expor output bruto de `google_cloud-run-query` |

## Localização do código

```
/home/user/workspace/aurora_v3_maestro/
├── corpus/        ← 7 módulos do system prompt
├── prompts/       ← build_system_prompt.py + SYSTEM_PROMPT_v1.0.md
├── worker/        ← maestro_v1.py + Dockerfile + blind_test
├── telegram/      ← listener.py + requirements
├── memory/        ← firestore_memory.py + seed_initial_lessons.py
├── deploy/        ← deploy_all.sh + maestro-listener.service
└── docs/          ← README_MAESTRO_v1.md
```

## Roadmap

- v1.0 ✅ Worker + Listener + Memory + Deploy + Teste cego harness
- v1.1 ⏳ HQ "The Sims tier" — frontend visualizando crews + execuções
- v1.2 ⏳ Tuning Vertex (camada estratégica) com dataset de `maestro_audit_log`
- v1.3 ⏳ Auto-melhoria do system prompt — Maestro edita o próprio prompt
- v1.4 ⏳ Multi-Maestro com voto de Condorcet para findings críticos

## Regras invioláveis (herda transparenciabr-lei)

- Português formal, "Comandante Baesso", tom INFORMATIVO
- PROIBIDO em PDF/UI: bigquery/vw_/fato_emenda/asmodeus/fraudou/desviou/corrupto
- "Não denunciamos. Mostramos."
- Sem mock, sem fake — só dados verificáveis com URL primária
- CPF mascarado `***.XXX.XXX-**`
- Contraditório 3-partes obrigatório em finding ≥ MÉDIA
