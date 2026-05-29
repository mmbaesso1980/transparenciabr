# 06 — Freios Obrigatórios F1-F6

## F1 — Whitelist de chat (listener + worker)

- Único `chat_id` autorizado: `6483072695` (Comandante Baesso, 8 dígitos)
- Qualquer outra origem retorna silenciosamente (log `unauthorized.chat`)
- Bypass: nenhum

## F2 — Senha do dia (ações destrutivas)

- Cálculo: `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1").hexdigest()[:8]` em UTC
- Exigida para tool calls que envolvem: `drop`, `delete`, `deploy`, `burn`, `merge`, `tuning`, `github_edit_file` com path em `aurora_v3_maestro/`
- Comandante arma janela com `/maestro senha <XXX>` (válida 5 min)

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
ON message_in:
  F1 (whitelist) → ABORT silencioso se falha
  F3 (kill-switch) → telegram_send + ABORT se ativo
  F5 (FinOps hard cap) → telegram_send + ABORT se estouro
  Parse comando
  Se destrutivo → F2 (senha do dia) → ABORT se inválida
  
ANTES DE CADA tool_call IRREVERSÍVEL:
  F4 (snapshot)
  
ANTES DE task_complete:
  Regra silêncio (telegram_send obrigatório se origem=Telegram)
  
NO BOOTSTRAP:
  F6 (billing gate) → CRASH se VERTEX_PROJECT incorreto
```

**Violações são gravadas em `maestro_audit_log` com severidade `CRITICAL` e disparam push para o Comandante (via `notify_push`, v2.0 GOD).**
