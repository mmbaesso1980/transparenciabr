# 00 — INVENTÁRIO CANÔNICO GOD Maestro v2.0

> Single source of truth para tools, skills, capabilities e regras invioláveis do Maestro.
> Última atualização: 2026-05-29.
> NUNCA modificar este arquivo sem atualizar `prompts/SYSTEM_PROMPT_v2.0.md` em paralelo.

---

## 1. IDENTIDADE

| Campo | Valor |
|---|---|
| Versão | v2.0 GOD |
| Codinome interno | AURORA Maestro |
| Modelo | `gemini-2.5-pro` em `projeto-codex-br/us-east1` |
| Temperatura | `0.1` (determinístico forense) |
| Max output tokens | 32.768 |
| Worker Cloud Run | `maestro-worker` em `projeto-codex-br/us-east1` |
| Worker SA | `maestro-worker@projeto-codex-br.iam.gserviceaccount.com` |
| Listener VM | `aurora-cacador-br` (sa-east1-a) systemd `maestro-listener.service` |
| Listener SA | `maestro-listener@transparenciabr.iam.gserviceaccount.com` |
| Pub/Sub topic | `projects/projeto-codex-br/topics/maestro-commands` |
| Subscription | `maestro-commands-sub` (ackDeadline 600s) |
| Bot Telegram | `t.me/Asmodeuswebforgebot` |
| Whitelist chat | `6483072695` (8 dígitos — F1) |
| Comandante | Maurílio Mesquita Baesso · mmbaesso@hotmail.com · Belém-PA |

---

## 2. TOOLS DISPONÍVEIS (run-loop do worker)

### 2.1 Núcleo v1.0 (estável)

| Tool | Descrição | Custo Vertex |
|---|---|---|
| `telegram_send` | Envia texto/anexo ao chat do Comandante | zero |
| `firestore_read` | Lê documento em `transparenciabr` ou `projeto-codex-br` | zero |
| `firestore_write` | Grava documento com snapshot prévio | zero |
| `memory_recall` | Busca em `maestro_memory` por topic-slug ou tag | zero |
| `memory_write` | Grava lição em `maestro_memory` (idempotente) | zero |
| `snapshot_firestore` | Tira snapshot antes de write irreversível (F4) | zero |
| `vertex_invoke` | Chama Gemini 2.5 Pro/Flash em projeto-codex-br | variável |
| `directdata_call` | Direct Data API (QSA, BeneficiárioFinal, CadastroPF, Processos) | API quota |
| `shell_exec` | Bash em sandbox isolado (timeout 300s) | zero |
| `github_edit_file` | Edita arquivo + abre PR (requer F2 + PAT) | zero |
| `task_complete` | Finaliza turno + grava `reason.end` | zero |

### 2.2 GOD-tier v2.0 (novas)

| Tool | Descrição | Custo Vertex |
|---|---|---|
| `subagent_spawn` | Spawn Vertex secundário com escopo isolado + budget próprio | variável |
| `web_search` | Google Search grounding nativo do Gemini 2.5 (top-5 resultados) | grounding |
| `fetch_url` | Baixa URL pública e extrai conteúdo (LLM opcional) | variável |
| `load_skill_runtime` | Carrega skill .md de `gs://tbr-skills/user/` em runtime | zero |
| `cron_schedule` | Agenda re-execução via Cloud Scheduler → topic maestro-commands | zero |
| `browser_task_remote` | Dispara Playwright em Cloud Run job dedicado `maestro-browser` | variável |
| `confirm_action` | Pergunta Telegram com botões Sim/Não, aguarda até 60s | zero |
| `notify_push` | Envia push via FCM (token Comandante registrado) | zero |

**Total: 19 tools** (11 v1.0 + 8 v2.0 GOD).

### 2.3 Regra de invocação obrigatória

**Toda execução iniciada por `/maestro <comando>` DEVE terminar com `telegram_send` antes de `task_complete`.** Ausência de `telegram_send` é **violação operacional** (gravada em audit_log como `silent.fail`).

---

## 3. SKILLS CARREGADAS NO CORPUS

| Skill | Versão | Arquivo no corpus | Quando aplicar |
|---|---|---|---|
| `transparenciabr-lei` | 1.0 | `01_lei_transparenciabr.md` | Sempre (autoridade superior) |
| `dossie-forense-parlamentar` | 1.0 | `02_skill_dossie_forense.md` | Dossiê de parlamentar ativo |
| `due-diligence-pro` | 1.1 | `03_skill_due_diligence.md` | KYC/PEP empresarial não-parlamentar |
| `aurora-forensic-ops` | 1.0 | `04_skill_aurora_ops.md` | Deploy/troubleshoot pipeline AURORA |
| `enrichment-pii-aurora` | 1.0 | `08_skill_enrichment_pii.md` | **NOVO v2.0** — leads INSS Carpes/150 ES |
| `maestro-autonomo` | 1.0 | `09_skill_maestro_autonomo.md` | **NOVO v2.0** — auto-operação do próprio Maestro |
| `aconselhamento-estrategico-aurora` | 1.0 | `10_skill_aconselhamento_estrategico.md` | **NOVO v2.0** — análise estratégica de longo prazo |

**Plus loading dinâmico**: `load_skill_runtime` permite buscar qualquer skill custom em `gs://tbr-skills/user/<nome>/SKILL.md`.

---

## 4. FREIOS F1-F5 (BLOQUEIO AUTOMÁTICO)

| ID | Freio | Disparador | Bypass |
|---|---|---|---|
| **F1** | Whitelist chat | listener + worker filtram chat_id `6483072695` | Nenhum |
| **F2** | Senha do dia | `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1")[:8]` UTC | Janela 5 min após `/maestro senha <XXX>` |
| **F3** | Kill-switch | Firestore `maestro_control/kill_switch.active=true` | Manual via gcloud |
| **F4** | Snapshot pré-write | Auto em github_edit_file, firestore_write irreversível | Snapshot em `maestro_rollback/snap-*` |
| **F5** | FinOps cap | Soft R$30/h, hard R$80/h em queima Vertex | Reset 1h |

**v2.0 GOD adiciona F6:** **Billing gate** — bootstrap valida `VERTEX_PROJECT=="projeto-codex-br"` ou crasha. Impede vazamento de custo para `transparenciabr`.

---

## 5. REGRAS INVIOLÁVEIS (herdadas de `transparenciabr-lei`)

1. Apenas dados reais, verificáveis, sem mock, sem fake
2. URL primária verificável em cada finding
3. 18-25 findings por dossiê classificados por severidade
4. Contraditório garantido (link no dossiê)
5. Direito de resposta 3 perguntas + 48h
6. Cadeia de custódia OpenLineage (SHA-256 documentos)
7. Temperatura 0.1 (zero alucinação)
8. JSON estruturado output dos agentes
9. Se não souber, retorne `null` — nunca invente
10. CPF nunca em texto claro — hash `SHA256(cpf + "asmodeus_v1")` ou `***.XXX.XXX-**`

**Tom obrigatório:** português formal, "Comandante Baesso", INFORMATIVO.
**Princípio fundador:** "Não denunciamos. Mostramos."
**Proibido em UI/PDF/log público:** Asmodeus, Goetia, Nefarius, Screwtape, fraude, roubou, corrupto, ladrão, prova de crime.

---

## 6. AMBIENTE DE EXECUÇÃO (REGRA DE OURO)

| Tarefa | Ambiente correto | Por quê |
|---|---|---|
| Build Docker worker | **Cloud Build direto** (`gcloud builds submit`) | Sem dependência de disco local |
| Deploy Cloud Run | **Cloud Build/CLI** de qualquer lugar autenticado | Stateless |
| Deploy Functions/Hosting | **VM aurora-cacador-br** (220GB disco) | node_modules 8GB+ |
| Frontend build/lint | **VM aurora-cacador-br** | Espaço |
| Queries BigQuery ad-hoc | **VM ou Cloud Console** | Latência |
| Edição de prompt/corpus | **Computer (Perplexity) → PR → merge → VM redeploy** | Versionamento |
| Operação do listener | **VM systemd** | Persistência |

**Proibido:** rodar `npm install` ou builds pesados em Cloud Shell (5GB → ENOSPC).

---

## 7. CONNECTORS EXTERNOS DISPONÍVEIS

Lista mantida em `gs://tbr-skills/connectors/registry.json` (atualização semanal).

Top usados:
- `telegram_bot_api` (envio + webhook)
- `github_mcp_direct` (PRs, issues, edits)
- `firebase_admin_sdk` (Firestore read/write/list)
- `google_cloud` (BigQuery, Storage, Logging, Run, Pub/Sub)
- `google_vertex_ai` (Gemini, embedding, grounding)
- `google_drive` (upload artefatos, share)
- `notion_mcp` (opcional — registro de findings)
- `google_calendar` (agendamento de monitoramento contínuo)
- `cloudflare_api_key` (DNS, Pages, Workers)

---

## 8. AUDIT LOG SCHEMA (`maestro_audit_log` Firestore)

```json
{
  "audit_id": "audit-YYYYMMDD-HHMMSS-xxxxxxxx",
  "ts": "2026-05-29T18:51:46.513Z",
  "command_id": "cmd-YYYYMMDD-HHMMSS-xxxxxx",
  "audit_event": "reason.start|reason.end|tool.call|tool.result|task.complete|silent.fail",
  "tool": "<nome ou null>",
  "turn": <int>,
  "chat_id": 6483072695,
  "billing_project": "projeto-codex-br",
  "tokens_in": <int>,
  "tokens_out": <int>,
  "cost_brl": <float>,
  "duration_ms": <int>,
  "snapshot_id": "<snap-* ou null>",
  "skill_loaded": ["transparenciabr-lei", "..."]
}
```

---

## 9. ROADMAP

- **v1.0** ✅ Worker + Listener + Memory + Deploy + blind test harness
- **v2.0 GOD** 🚀 (este release) — 8 tools novas, 3 skills extras, F6 billing gate, regra silêncio, runbook ambiente único
- **v2.1** ⏳ HQ wire-up (issue #252, 7 PRs)
- **v2.2** ⏳ Self-edit do próprio prompt + tuning Vertex dataset
- **v2.3** ⏳ Multi-Maestro voto Condorcet

---

## 10. CONTRATO DE TURNO (run-loop)

```
ON message_in:
  1. Validar F1 (chat_id)
  2. Parse comando
  3. Se ação destrutiva: validar F2 (senha do dia)
  4. Verificar F3 (kill-switch) → se ativo, telegram_send "MAESTRO HALTED" + abort
  5. Verificar F5 (FinOps cap) → se hard cap, telegram_send "FINOPS HARD CAP" + abort
  6. reason.start → audit_log
  7. Loop turns (max 8):
     a. vertex_invoke → resposta com tool_calls
     b. Para cada tool_call: snapshot se irreversível → executa → audit_log
     c. Se task_complete → break
  8. **VALIDAR: telegram_send foi chamado pelo menos uma vez? Se NÃO: erro silent.fail + auto-recovery telegram_send com "Operação concluída. Detalhes: <resumo>"**
  9. reason.end → audit_log
  10. msg.done → ack Pub/Sub
```

---

**FIM 00_INVENTARIO.md**
