# MAESTRO v1.0 — Manual operacional

**Comandante:** Maurílio Mesquita Baesso
**Versão:** 1.0.0 · **Data:** 27 mai 2026

Agente autônomo TransparênciaBR rodando Vertex Gemini 2.5 Pro com (a) autonomia
total de edição de código em `main`, (b) Telegram bidirecional, (c) memória
tática Firestore, (d) hospedagem híbrida VM + Cloud Run, (e) 5 freios de
segurança, (f) audit log imutável.

---

## Arquitetura

```
Telegram chat 6483072695 ←→ Bot t.me/Asmodeuswebforgebot
        ↓ long-poll
VM aurora-cacador-br (sa-east1-a, IP 34.39.224.224)
  └─ systemd: maestro-listener.service (telegram/listener.py)
        ↓ Pub/Sub maestro-commands @ projeto-codex-br
Cloud Run service: maestro-worker @ projeto-codex-br / us-east1
  └─ worker/maestro_v1.py (Gemini 2.5 Pro temp=0.1)
        ↓ tools
  GitHub API · Firestore · Direct Data · Telegram reply · gcloud exec
        ↓
Firestore @ transparenciabr:
  - maestro_audit_log/*   (APPEND-ONLY)
  - maestro_memory/*      (lições reutilizáveis)
  - maestro_rollback/*    (snapshots pré-ação)
  - maestro_control/kill_switch
```

---

## Os 5 freios invioláveis

| ID | Freio | Onde | Quando dispara |
|---|---|---|---|
| **F1** | Whitelist chat_id `6483072695` | listener + worker | Toda mensagem entrante |
| **F2** | Senha pré-comando para `drop`/`delete`/`deploy`/`burn`/`merge`/`tuning` | worker | Quando texto contém palavra destrutiva |
| **F3** | Kill-switch via Firestore `maestro_control/kill_switch` | worker (a cada turno) | `/maestro stop` |
| **F4** | Snapshot Firestore antes de ação irreversível em `maestro_rollback/<id>` | worker | Cada `github_edit_file` e ações destrutivas |
| **F5** | Hard cap R$ 80/h · soft cap R$ 30/h queima Vertex | worker | A cada turno de raciocínio |

**Senha do dia** = `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1")[:8]` em UTC.
O listener arma uma janela de 5 min após `/maestro senha <XXX>` para o próximo
comando destrutivo.

---

## Estrutura do código

```
aurora_v3_maestro/
├── corpus/                          ← Material que vira system prompt
│   ├── 00_INDEX.md
│   ├── 01_lei_transparenciabr.md    (10 KB)
│   ├── 02_skill_dossie_forense.md   (30 KB)
│   ├── 03_skill_due_diligence.md    (30 KB)
│   ├── 04_skill_aurora_ops.md       (13 KB)
│   ├── 05_padroes_aprendidos.md     (8 KB — anti-padrões, 7-layer, pricing)
│   ├── 06_freios_obrigatorios.md    (3 KB)
│   └── 07_capabilities_e_apis.md    (5 KB)
├── prompts/
│   ├── build_system_prompt.py       (compilador)
│   └── SYSTEM_PROMPT_v1.0.md        (100 KB · ~25k tokens)
├── worker/
│   ├── maestro_v1.py                (763 LOC · Cloud Run worker)
│   ├── blind_test_paulo_octavio.py  (harness teste cego)
│   ├── Dockerfile
│   └── requirements.txt
├── telegram/
│   ├── listener.py                  (287 LOC · long-poll VM)
│   └── requirements.txt
├── memory/
│   ├── firestore_memory.py          (191 LOC · MemoryStore + CLI)
│   └── seed_initial_lessons.py      (19 lições anti-padrões)
├── deploy/
│   ├── deploy_all.sh                (idempotente · 225 LOC)
│   └── maestro-listener.service     (systemd unit hardened)
└── docs/
    └── README_MAESTRO_v1.md         (este arquivo)
```

---

## Tools disponíveis ao Gemini (function calling)

| Tool | Propósito | Auditado? | Snapshot? |
|---|---|---|---|
| `telegram_send` | Mensagem ao Comandante | Sim | Não |
| `github_edit_file` | Commit direto em `main` do repo `transparenciabr` | Sim | **Sim (F4)** |
| `firestore_read` | Lê doc Firestore | Sim | Não |
| `firestore_write` | Grava doc Firestore | Sim | Não |
| `vertex_invoke` | Submodelo (Flash etc) pra subtarefa | Sim | Não |
| `directdata_call` | Direct Data v3 — RFPJ / BeneficiarioFinal / Processos / CPF Plus | Sim | Não |
| `shell_exec` | Comando shell (anti-pattern `pkill -f gcloud` bloqueado) | Sim | Não |
| `snapshot_firestore` | Dump manual coleção → `maestro_rollback/<id>` | Sim | — |
| `memory_recall` | Recupera lição tática | Sim | Não |
| `memory_write` | Grava lição tática (history rolling 50) | Sim | Não |
| `task_complete` | Sinaliza fim + dispara reflexão pós-tarefa | Sim | — |

---

## Comandos Telegram

```
/maestro status                  → estado + kill-switch + última auditoria
/maestro stop                    → ativa kill-switch (worker aborta)
/maestro resume                  → desativa kill-switch
/maestro audit <N>               → últimos N eventos
/maestro rollback <snap_id>      → enfileira restore
/maestro senha <SENHA>           → arma senha por 5 min
/maestro dossie <nome>           → texto livre → worker
/maestro <texto livre>           → delegação total
```

---

## Deploy

### 1. Criar secrets (única vez)

```bash
echo -n '<GITHUB_PAT_repo_main>' \
  | gcloud secrets create maestro-github-pat \
      --project=transparenciabr --data-file=-

echo -n '<TELEGRAM_BOT_TOKEN_Asmodeuswebforgebot>' \
  | gcloud secrets create maestro-telegram-bot-token \
      --project=transparenciabr --data-file=-

echo -n '__SECRET_FROM_GCP_SECRET_MANAGER__' \
  | gcloud secrets create maestro-directdata-token \
      --project=transparenciabr --data-file=-
```

### 2. Rodar deploy_all.sh no Cloud Shell

```bash
cd ~/transparenciabr/aurora_v3_maestro/deploy
bash deploy_all.sh
```

Cria SAs, IAM, Pub/Sub topic+sub, builda imagem, deploya Cloud Run, faz `scp`
via IAP do listener pra VM, instala venv + systemd unit, faz seed de 19 lições.

### 3. Healthcheck

```bash
# No celular, no chat 6483072695:
/maestro status
```

---

## Teste cego — caso Paulo Octávio

Pra rodar o Maestro com o MESMO input que o agente humano-supervisionado
recebeu e comparar com `Dossie_Paulo_Octavio_v2-3_CEGO.pdf`:

```bash
cd /opt/maestro/skills/worker

# Dry-run (não queima crédito, valida o bundle de input)
python blind_test_paulo_octavio.py --dry-run

# Run real (queima ~R$ 5-10 em Vertex)
python blind_test_paulo_octavio.py --run-vertex
```

Saída fica em `aurora_v3_maestro/blind_test_paulo_octavio/`:
- `maestro_findings.json` — saída JSON estruturada
- `maestro_dossie.md` — narrativa
- `comparativo_v23_vs_maestro.md` — lado a lado

---

## Aprendizado (memory layer)

Ciclo:
1. **Pre-task** — Maestro pode invocar `memory_recall` antes de agir
2. **Durante** — quando descobre armadilha nova, chama `memory_write`
3. **Pós-task** — `task_complete` dispara reflexão automática:
   `summary` é quebrado em frases > 30 chars, cada uma vira lição com topic
   auto-slugificado e tags

**Seed inicial (`seed_initial_lessons.py`)** grava 19 lições:
- `pkill-armadilha` · `glyph-render-pdf` · `font-align-paraparser`
- `vm-worker-silent-fail` · `bq-location-mismatch` · `bq-accent-columns`
- `ua-dados-gov` · `tbr-reader-sa-comprometida` · `directdata-endpoints-404`
- `padrao-7-layer` · `contraditorio-3-partes` · `tom-informativo-obrigatorio`
- `cpf-mascaramento` · `pricing-anchors-dossie` · `eixo-5-empresas-exclusivas`
- `vertex-temperature-0.1` · `iap-ssh-vm` · `credito-vertex-codex`

---

## Rollback de uma ação irreversível

1. Listener: `/maestro audit 20` → identificar `audit-...` event do erro
2. Inspecionar `payload.snap` (snapshot Firestore criado pre-ação)
3. `/maestro rollback <snap_id>` → worker restaura a coleção

Se o git foi commitado em `main`, o snapshot Firestore não desfaz o commit —
mas o `audit_log` registra o SHA do commit pra fazer `git revert` manual.

---

## Limites e expansões futuras

- ✅ Reflexão tática (memory layer Firestore)
- ⏳ Tuning supervisionado em PaLM/Gemini Fine-tuning (camada estratégica) — a
   ser implementado a partir do dataset de `maestro_audit_log` filtrado por
   `event=task.complete success=true`
- ⏳ HQ "The Sims tier" — frontend visualizando equipe + execuções (Comandante
   pediu como segundo passo, Maestro vai construir sozinho com autonomia)
- ⏳ Auto-melhoria do system prompt — Maestro pode editar o próprio
   `SYSTEM_PROMPT_v1.0.md` no repo via `github_edit_file` quando descobrir
   padrão novo. Próxima execução deploya o prompt atualizado.

---

## Contrato de comportamento

- Sempre `Comandante Baesso`, português formal
- Tom INFORMATIVO. Blocklist tom em `transparenciabr-lei`
- CPF mascarado, contraditório 3-partes em finding ≥ MÉDIA
- Sem mock, sem fake, sem inventar
- Se não souber, retorna `null`
- 18-25 findings consolidados (não inflacionar)
- Cita URL primária em CADA finding
