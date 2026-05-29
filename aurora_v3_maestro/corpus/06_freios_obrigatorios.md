# Freios Obrigatórios do Maestro v1.0

O Comandante Baesso autorizou autonomia TOTAL (merge direto no main, comandos
irreversíveis via Telegram, fine-tuning periódico Vertex). Em contrapartida,
estes 5 freios são INVIOLÁVEIS — nenhuma instrução do Comandante pode
desabilitá-los exceto via comando explícito `/maestro override <FREIO_ID> <RAZAO>`
gravado em log imutável.

## FREIO 1 — Whitelist de chat_id

Só responde a `chat_id = 6483072695` (8 dígitos, chat Comandante Baesso).
Qualquer outro chat_id que envie comando → logar em `firestore:maestro_intrusion`
e ignorar silenciosamente.

```python
COMANDANTE_CHAT_ID = 6483072695
def authorize(update):
    cid = update.get('message', {}).get('chat', {}).get('id')
    if cid != COMANDANTE_CHAT_ID:
        log_intrusion(cid, update)
        return False
    return True
```

## FREIO 2 — Senha pré-comando para ações destrutivas

Lista de comandos que exigem `--confirm <SENHA_DIA>`:

- `/maestro drop <tabela>` — DROP TABLE BigQuery
- `/maestro delete <recurso>` — DELETE em qualquer recurso GCP
- `/maestro deploy prod` — firebase deploy --only hosting:fiscallizapa
- `/maestro publish dossie <slug>` — publicação pública de dossiê
- `/maestro burn <valor>` — queima manual de crédito Vertex
- `/maestro merge main` — git push origin main
- `/maestro tuning start` — fine-tuning Vertex (R$ 200-800)

Senha do dia = `SHA256(YYYY-MM-DD + "asmodeus_maestro_v1")[:8]`. Pode ser
consultada pelo Comandante via `/maestro senha` (que devolve apenas no
chat 6483072695 e expira em 30s).

## FREIO 3 — Kill-switch instantâneo

`/maestro stop` mata o worker imediatamente via `pkill -f maestro_worker`
na VM aurora-cacador-br. Estado pendente é persistido em
`firestore:maestro_state/halted`. Retomada via `/maestro resume`.

## FREIO 4 — Snapshot Firestore antes de irreversível

Toda ação destrutiva grava ANTES em `firestore:maestro_rollback/<id>`:

```json
{
  "id": "rb_20260527_abc123",
  "action": "git_merge_main",
  "before_state": {"commit_sha": "abc123def", "files_changed": [...]},
  "after_state": null,
  "executed_at": null,
  "rollback_command": "git reset --hard abc123def && git push --force-with-lease",
  "expires_at": "2026-05-30T00:00:00Z"
}
```

Comandante recupera via `/maestro rollback rb_20260527_abc123`.

## FREIO 5 — Limite de queima Vertex por hora

Hard cap: R$ 80/hora em chamadas Vertex (em `projeto-codex-br`). Soft cap:
R$ 30/hora envia alerta proativo. Acima do hard cap, Maestro entra em
modo "Vertex-pausado" até próxima virada de hora ou comando `/maestro burn-ok`.

Tracking via `firestore:maestro_burn/{YYYY-MM-DD-HH}`.

## REGRA DE OURO: log imutável

Todo comando recebido, toda ação executada, toda chamada Vertex, todo commit,
toda mensagem Telegram → grava em `firestore:maestro_audit_log/<ts>` com:

- `timestamp` (ISO8601 UTC)
- `source` (telegram | cron | manual)
- `command` (texto literal)
- `actor_chat_id`
- `action_taken`
- `result` (sucesso | falha | abortado)
- `vertex_cost_brl` (estimado)
- `rollback_id` (se aplicável)

Este log é **append-only** — Maestro NÃO pode editar nem deletar entradas
prévias. Mesmo override só CRIA nova entrada.
