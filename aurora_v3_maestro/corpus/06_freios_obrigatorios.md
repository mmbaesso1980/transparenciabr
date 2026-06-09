# 06 — Freios Obrigatórios F1-F6

> Revisado em 2026-06-04 (v2.2). **F2 (senha do dia) REMOVIDO** pelo PR #268 — autenticação passa a ser F1 (whitelist) + header `X-Telegram-Bot-Api-Secret-Token` (webhook fail-closed). **F6** confirmado com sintaxe project NUMBER.

## F1 — Whitelist de chat (listener + worker)

- Único `chat_id` autorizado: `6483072695` (Comandante Baesso, 8 dígitos)
- Qualquer outra origem retorna silenciosamente (log `unauthorized.chat`)
- Bypass: nenhum

## F2 — Senha do dia (ações destrutivas) ❌ REMOVIDO (PR #268)

> **Status v2.2: REMOVIDO.** O PR #268 (MERGED, Jules, 2026-06-08) — "Remove Maestro password authentication window (F2)" — **eliminou a janela de senha do dia** do listener/worker. **F2 não existe mais em runtime.**

- Cálculo legado (histórico): `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1").hexdigest()[:8]` em UTC
- Comando legado `/maestro senha <XXX>` (janela 5 min) — **descontinuado**.

**Autenticação que substitui F2 na v2.2 (modelo webhook):**

1. **F1 — whitelist de `chat_id`** `6483072695`: continua sendo o filtro primário de origem. Mensagem de qualquer outro chat é descartada.
2. **`X-Telegram-Bot-Api-Secret-Token`** (header HTTP do webhook): o listener FastAPI (PR #263) valida este header em modo **fail-closed** — sem o secret carregado, **todas** as requisições recebem `401` e são descartadas. Garante que apenas o Telegram (que conhece o secret_token registrado via `setWebhook`) consiga injetar comandos no endpoint público.
   - Secret: `maestro-telegram-webhook-secret` no Secret Manager de `transparenciabr`.
   - Provisionamento: `setup_webhook_secret.sh` (idempotente — gera token 32-byte hex, cria/atualiza o secret, concede IAM ao SA do Cloud Run, chama `setWebhook` com `secret_token`).
   - Health: `curl -s https://transparenciabr-glwbe3qhjq-uc.a.run.app/healthz` deve retornar `"webhook_secret_loaded": true`.

**Camadas restantes para ações irreversíveis:** com F2 fora, o caminho destrutivo passa a depender de **F1 + secret_token** na borda e de **F3** (kill-switch), **F4** (snapshot pré-write) e **F5** (FinOps cap) no run-loop. Para confirmação interativa de operações de alto risco, o substituto recomendado é `confirm_action` (botão Sim/Não no Telegram). Decisão final de aposentadoria de F2 cabe ao Comandante Baesso; este corpus a registra como **removida**.

## F3 — Kill-switch (parada de emergência)

- Documento Firestore: `maestro_control/kill_switch.active` (boolean)
- Worker checa **antes de cada turno** do loop de raciocínio
- Se `active=true` → grava `reason.halted`, manda telegram_send "MAESTRO HALTED", encerra
- Reativação manual via gcloud:
  ```
  gcloud firestore documents update maestro_control/kill_switch --project=transparenciabr --data='{"active":false}'
  ```

## F4 — Snapshot Firestore (rollback)

- Antes de qualquer tool call em: `github_edit_file`, `firestore_write` com path crítico, `shell_exec` com `rm`/`drop`/`delete`
- Snapshot salvo em coleção `maestro_rollback/snap-YYYYMMDD-HHMMSS-xxxxxx`
- Conteúdo: `{tool, args, state_before, ts, command_id}`
- Retenção: 30 dias

## F5 — FinOps cap (proteção de crédito Vertex)

- Soft cap: R$ 30/h (janela rolante de 60min) → aviso telegram_send
- Hard cap: R$ 80/h → bloqueia novos `vertex_invoke` até janela resetar
- Métrica calculada de `audit_log.cost_brl` dos últimos 60min
- Reset automático a cada janela rolante de 1h

## F6 — Billing gate (v2.0 GOD) 🆕

- Bootstrap do worker valida obrigatoriamente:
  ```python
  assert os.environ["VERTEX_PROJECT"] == "projeto-codex-br", (
      "BILLING-VIOLATION: Vertex DEVE rodar em projeto-codex-br "
      "(crédito codex-br R$ 5.677,28). Configuração atual: "
      f"{os.environ.get('VERTEX_PROJECT', '(unset)')}"
  )
  ```
- Se assert falhar → worker crasha no startup, listener registra `billing.violation`
- Motivo: memória permanente do Comandante — "lembrar de focarmos em usar este crédito que está no projeto-codex-br"
- Crédito ativo: R$ 5.677,28 expira 03/05/2027

**Confirmação v2.2 — sintaxe project NUMBER (não confundir com F6):** o gate de billing valida o **billing project pelo NAME** (`VERTEX_PROJECT == "projeto-codex-br"`). Já a montagem de **secrets cross-project** (Secret Manager de `transparenciabr`) usa o **project NUMBER `89728155070`** na referência, NUNCA o name:
```
TELEGRAM_BOT_TOKEN=projects/89728155070/secrets/telegram-bot-token:latest
```
São dois identificadores distintos para dois projetos diferentes:
- Billing/Vertex/Run → `projeto-codex-br` (validado por NAME no F6).
- Secrets → `transparenciabr` → número `89728155070` (referência cross-project por NUMBER).

Detalhe e racional do erro de deploy em `15_licoes_deploy_v22.md` e seção `2.4` de `00_INVENTARIO.md`.

---

## REGRA OPERACIONAL — silêncio do worker (v2.0 GOD) 🆕

**Toda execução iniciada via `/maestro <comando>` no Telegram DEVE terminar com pelo menos uma chamada `telegram_send` antes de `task_complete`.**

Implementação no run-loop:
1. Worker mantém flag `telegram_sent_this_turn = False`
2. Cada `tool.call` com `name="telegram_send"` seta `True`
3. Antes de `task_complete`:
   - Se `telegram_sent_this_turn == False`:
     - Gravar audit `silent.fail`
     - Auto-recovery: `telegram_send(chat_id=6483072695, text=f"✅ Operação '{command_short}' concluída. Resumo: {turn_summary}")`
     - Só então permitir `task_complete`

**Motivo:** evita o bug observado em 2026-05-29 15:50 (comando `/maestro lembrar pkill-armadilha` completou ok mas Comandante não recebeu confirmação visual no chat).

---

## ORDEM DE VERIFICAÇÃO NO RUN-LOOP

```
ON message_in (webhook POST /webhook):
  Header X-Telegram-Bot-Api-Secret-Token → 401 se ausente/inválido (fail-closed)
  F1 (whitelist) → ABORT silencioso se falha
  F3 (kill-switch) → telegram_send + ABORT se ativo
  F5 (FinOps hard cap) → telegram_send + ABORT se estouro
  Parse comando
  (F2 senha do dia REMOVIDO no PR #268)
  
ANTES DE CADA tool_call IRREVERSÍVEL:
  F4 (snapshot)
  
ANTES DE task_complete:
  Regra silêncio (telegram_send obrigatório se origem=Telegram)
  
NO BOOTSTRAP:
  F6 (billing gate) → CRASH se VERTEX_PROJECT incorreto
```

**Violações são gravadas em `maestro_audit_log` com severidade `CRITICAL` e disparam push para o Comandante (via `notify_push`, v2.0 GOD).**
