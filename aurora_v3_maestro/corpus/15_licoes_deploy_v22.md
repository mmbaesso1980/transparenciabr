# 15 — LIÇÕES DO DEPLOY v2.2 (2026-06-04)

> Registro operacional do deploy produtivo do Maestro v2.2, realizado em 2026-06-04.
> Tom INFORMATIVO. Comandante Baesso é a autoridade de decisão.
> ZERO secrets em valor — apenas referências a Secret Manager e placeholders.

---

## 1. CONTEXTO DO DEPLOY

| Item | Valor |
|---|---|
| Data | 2026-06-04 |
| Worker Cloud Run | `maestro-worker` em `projeto-codex-br/us-east1` |
| Worker URL | `https://maestro-worker-evkxdmnelq-ue.a.run.app` |
| Listener (AUTORITATIVO) | **Webhook FastAPI** em Cloud Run — `https://transparenciabr-glwbe3qhjq-uc.a.run.app/webhook` (PR #263, venceu o polling) |
| Listener VM (legacy) | systemd na VM `aurora-cacador-br` (sa-east1-a) `/opt/maestro/listener.py` — long-poll **DEPRECATED** após PR #263 (ver §3.3 e §7) |
| Cloud Scheduler | `maestro-heartbeat` em `projeto-codex-br/us-east1` — cron `*/30 * * * *` |
| Secrets | Secret Manager de `transparenciabr` (project NUMBER `89728155070`), 8 secrets reais |
| SO da VM | Debian 12 — PEP 668 (externally-managed-environment) |
| Gist canônico | `https://gist.githubusercontent.com/mmbaesso1980/08bc1905afa72c3824508be094cddccb/raw/797eb732938928f4048f31447b4068ccba61fe15/` |

---

## 2. HISTÓRICO E PATHS CANÔNICOS (VM — LEGACY)

> Esta seção documenta o caminho de instalação do listener **na VM**, hoje **LEGACY**. A produção migrou para o webhook Cloud Run (§3.3 e §7). Mantida como referência histórica e para eventual reversão a polling (runbook em `00_INVENTARIO.md` não cobre reversão; ver AUDITORIA C).

### 2.1 — PEP 668 (Debian 12) — venv obrigatório (legacy)
A VM `aurora-cacador-br` roda Debian 12, que aplica **PEP 668** (`externally-managed-environment`). `pip install` global é bloqueado. O listener, **quando rodava na VM**, exigia virtualenv dedicado:

```bash
python3 -m venv ~/maestro-venv
~/maestro-venv/bin/pip install --upgrade pip
~/maestro-venv/bin/pip install -r /opt/maestro/requirements.txt
```

O unit systemd aponta o `ExecStart` para o interpretador do venv, não para o Python do sistema:
```
ExecStart=/home/<usuario>/maestro-venv/bin/python /opt/maestro/listener.py
```

### 2.2 — Origem canônica do listener (gist)
O `listener.py` (265 linhas) é mantido no gist canônico do Comandante Baesso. Para sincronizar a VM, baixar do raw:
```bash
curl -fsSL \
  https://gist.githubusercontent.com/mmbaesso1980/08bc1905afa72c3824508be094cddccb/raw/797eb732938928f4048f31447b4068ccba61fe15/listener.py \
  -o /opt/maestro/listener.py
```
> O raw inclui o commit hash no path (`.../raw/797eb73.../`), portanto é imutável e versionável. Atualizar o hash quando o gist evoluir.

### 2.3 — Layout de paths na VM
| Path | Conteúdo |
|---|---|
| `/opt/maestro/listener.py` | listener long-poll (265 linhas) |
| `/opt/maestro/requirements.txt` | dependências do listener |
| `~/maestro-venv/` | virtualenv PEP 668 |
| `/etc/systemd/system/maestro-listener.service` | unit systemd |

---

## 3. ERROS ENCONTRADOS + FIXES

### 3.1 — Cross-project secrets: sintaxe project NAME falha (FIX: usar NUMBER)
**Sintoma:** no deploy do Cloud Run, o worker falhava no startup com erro de secret não encontrado, mesmo com o secret existindo em `transparenciabr`.

**Causa raiz:** a referência usava o **project NAME** (`projects/transparenciabr/secrets/...`). Para montagem **cross-project** (worker em `projeto-codex-br` lendo secrets de `transparenciabr`), o Cloud Run resolve apenas pelo **project NUMBER**.

**Fix canônico — usar o NUMBER `89728155070`:**
```
TELEGRAM_BOT_TOKEN=projects/89728155070/secrets/telegram-bot-token:latest
```
Aplicar a mesma sintaxe para os 8 secrets (ver tabela seção 5). **NUNCA** usar o name `transparenciabr` na referência cross-project.

**IAM correlato:** a SA do worker precisa de `roles/secretmanager.secretAccessor` no projeto dono dos secrets. Descobrir a SA:
```bash
gcloud run services describe maestro-worker \
  --region=us-east1 --project=projeto-codex-br \
  --format="value(spec.template.spec.serviceAccountName)"
```
Conceder o acesso (substituir `<SA_DO_WORKER>` pelo retorno acima):
```bash
gcloud secrets add-iam-policy-binding telegram-bot-token \
  --project=transparenciabr \
  --member="serviceAccount:<SA_DO_WORKER>" \
  --role="roles/secretmanager.secretAccessor"
```

### 3.2 — Listener "silent fail" via FileHandler
**Sintoma:** o listener subia pelo systemd, ficava `active`, mas não processava mensagens e não deixava rastro útil — falha silenciosa.

**Causa raiz:** logging configurado com `FileHandler` apontando para um caminho sem permissão de escrita para o usuário do serviço (e/ou diretório inexistente). A exceção de logging era engolida, e o serviço seguia "vivo" sem fazer nada — mesmo padrão da lição `vm-worker-silent-fail` (try/except: pass grava 0 bytes).

**Fix canônico:**
1. Logar em `StreamHandler` (stdout/stderr) e deixar o `journald` capturar — evita dependência de path de arquivo:
   ```python
   logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler()])
   ```
2. Se `FileHandler` for necessário, garantir diretório e permissão antes (`os.makedirs(..., exist_ok=True)`), e **nunca** silenciar a exceção do handler.
3. Validar com:
   ```bash
   journalctl -u maestro-listener.service -n 50 --no-pager
   ```

### 3.3 — Conflito polling-vs-webhook (FIX: webhook venceu, desligar VM)
**Sintoma:** dois caminhos de ingestão coexistiam — o systemd long-poll na VM e o webhook FastAPI do PR #263 — gerando dúvida sobre quem consome as mensagens e risco de perda silenciosa.

**Diagnóstico (AUDITORIA C, 2026-06-09):**
- `getWebhookInfo` retorna `url = https://transparenciabr-glwbe3qhjq-uc.a.run.app/webhook` e `pending_update_count = 0` → o **Telegram entrega por PUSH ao Cloud Run**; o webhook está ativo.
- O `listener.py` atual (pós PR #263) é FastAPI (`@app.post("/webhook")`) e **não tem loop `getUpdates`**. O `maestro-listener.service` invoca `python listener.py`, que não sobe servidor sozinho → processo entra em **loop de falha/restart** e **não consome nada útil** na VM.

**Decisão final:** **o webhook Cloud Run (PR #263) é o autoritativo.** O polling systemd da VM está **DEPRECATED/zumbi**.

**Fix canônico:**
1. Garantir o secret do webhook (fail-closed): `setup_webhook_secret.sh` cria `maestro-telegram-webhook-secret`, concede IAM ao SA do Cloud Run e registra `setWebhook` com `secret_token`.
2. Validar saúde: `curl -s https://transparenciabr-glwbe3qhjq-uc.a.run.app/healthz` → esperar `"webhook_secret_loaded": true`. Se `false`, o endpoint descarta TODAS as mensagens com `401`.
3. Desligar o polling na VM: `sudo systemctl stop maestro-listener && sudo systemctl disable maestro-listener`.

> Telegram permite UM método por bot. Com o webhook registrado, `getUpdates` (polling) fica indisponível por design — manter os dois é tecnicamente impossível, então a VM apenas consome recurso à toa.

---

## 4. COMANDOS CANÔNICOS — PRÓXIMO REDEPLOY

> Substituir `<SA_DO_WORKER>` e `<usuario>` pelos valores reais. Nenhum secret aparece em valor: tudo via referência Secret Manager.

### 4.1 — Worker Cloud Run (deploy com cross-project secrets)
```bash
gcloud run deploy maestro-worker \
  --region=us-east1 --project=projeto-codex-br \
  --no-cpu-throttling \
  --update-secrets="\
TELEGRAM_BOT_TOKEN=projects/89728155070/secrets/telegram-bot-token:latest,\
GITHUB_PAT=projects/89728155070/secrets/github-pat:latest,\
DIRECTDATA_TOKEN=projects/89728155070/secrets/directdata-token:latest,\
DATAJUD_TOKEN=projects/89728155070/secrets/datajud-token:latest,\
SERPAPI_KEY=projects/89728155070/secrets/serpapi-key:latest,\
BRAVE_SEARCH_KEY=projects/89728155070/secrets/brave-search-key:latest,\
GOOGLE_CSE_KEY=projects/89728155070/secrets/google-cse-key:latest,\
GOOGLE_CSE_CX=projects/89728155070/secrets/google-cse-cx:latest"
```
> `--no-cpu-throttling` confirmado pelo PR #269 (necessário para o run-loop assíncrono não congelar entre requisições).

### 4.2 — Descobrir SA e conceder secretAccessor
```bash
SA=$(gcloud run services describe maestro-worker \
  --region=us-east1 --project=projeto-codex-br \
  --format="value(spec.template.spec.serviceAccountName)")

for s in telegram-bot-token github-pat directdata-token datajud-token \
         serpapi-key brave-search-key google-cse-key google-cse-cx; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project=transparenciabr \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4.3 — Webhook Telegram (AUTORITATIVO) + desligar polling da VM
```bash
# (a) Provisionar secret do webhook (idempotente) e registrar setWebhook com secret_token
bash aurora_v3_maestro/telegram/setup_webhook_secret.sh \
  https://transparenciabr-glwbe3qhjq-uc.a.run.app

# (b) Validar saúde — deve retornar "webhook_secret_loaded": true
curl -s https://transparenciabr-glwbe3qhjq-uc.a.run.app/healthz

# (c) Desligar o polling legacy na VM (não consome mensagens; é zumbi)
gcloud compute ssh aurora-cacador-br \
  --zone=southamerica-east1-a --project=transparenciabr --tunnel-through-iap \
  --command='sudo systemctl stop maestro-listener; sudo systemctl disable maestro-listener; sudo systemctl is-enabled maestro-listener || true'
```
> Caminho VM long-poll (venv PEP 668) é **legacy** — só usar em reversão deliberada para polling (ver AUDITORIA C, runbook alternativo).

### 4.4 — Cloud Scheduler heartbeat (30 min)
```bash
gcloud scheduler jobs create http maestro-heartbeat \
  --location=us-east1 --project=projeto-codex-br \
  --schedule="*/30 * * * *" \
  --uri="https://maestro-worker-evkxdmnelq-ue.a.run.app" \
  --http-method=POST
# (se já existir, usar `jobs update http maestro-heartbeat ...`)
```

---

## 5. REFERÊNCIA — 8 SECRETS (Secret Manager `transparenciabr`, NUMBER 89728155070)

| Secret | Variável | Referência cross-project |
|---|---|---|
| `telegram-bot-token` | `TELEGRAM_BOT_TOKEN` | `projects/89728155070/secrets/telegram-bot-token:latest` |
| `github-pat` | `GITHUB_PAT` | `projects/89728155070/secrets/github-pat:latest` |
| `directdata-token` | `DIRECTDATA_TOKEN` | `projects/89728155070/secrets/directdata-token:latest` |
| `datajud-token` | `DATAJUD_TOKEN` | `projects/89728155070/secrets/datajud-token:latest` |
| `serpapi-key` | `SERPAPI_KEY` | `projects/89728155070/secrets/serpapi-key:latest` |
| `brave-search-key` | `BRAVE_SEARCH_KEY` | `projects/89728155070/secrets/brave-search-key:latest` |
| `google-cse-key` | `GOOGLE_CSE_KEY` | `projects/89728155070/secrets/google-cse-key:latest` |
| `google-cse-cx` | `GOOGLE_CSE_CX` | `projects/89728155070/secrets/google-cse-cx:latest` |

---

## 6. PRs CORRELATOS AO DEPLOY v2.2

| PR | Autor | Tema | Efeito no corpus |
|---|---|---|---|
| #263 | Jules | Listener FastAPI webhook | **VENCEU o polling** — webhook é autoritativo (`00_INVENTARIO.md §11`, §3.3). VM listener DEPRECATED. |
| #264 | Jules | `cloudbuild` na raiz | Pipeline de build do worker |
| #265 | Jules | Corrections | Ajustes pontuais |
| #266 | Jules | Skills path `/opt/maestro/skills/` | Caminho de carga de skills em runtime |
| #267 | Jules | Dockerfile | Imagem do worker |
| #268 | Jules | **Removeu F2 (janela de senha)** | Ver `06_freios_obrigatorios.md` — F2 REMOVIDO; auth passa a F1 + `X-Telegram-Bot-Api-Secret-Token` |
| #269 | Jules | `--no-cpu-throttling` | Refletido no comando de deploy (§4.1) |
| #270 | Devin | Testes (72 unit) | Cobertura dos módulos de engine menos cobertos |
| #271 | Devin | Security hardening | Token Telegram em git history + RCE em `shell_exec` (+ auth/CORS/XSS) |
| #272 | Devin | Refactor shared utils | Formatters, GCP config, logging |
| #273 | Devin | Error handling `HttpsError v2` | Para de engolir erros silenciosamente — alinhado ao fix §3.2 |

> **Nota de segurança (PR #271):** o token do bot Telegram foi encontrado em histórico de git e em relatórios de auditoria em texto claro. Tratar como **comprometido**: rotacionar via `@BotFather /revoke` e manter exclusivamente em Secret Manager (`telegram-bot-token`). Este corpus não registra o valor do token.

---

## 7. LIÇÃO FINAL — VM `aurora-cacador-br` NÃO É MAIS NECESSÁRIA PARA O LISTENER

Com o webhook FastAPI no Cloud Run como ponto de entrada autoritativo (§3.3), **a VM `aurora-cacador-br` deixou de ser necessária para receber comandos do Telegram**.

- **Pode permanecer `stopped`** na maior parte do tempo — economia de compute contínuo (estimativa ~USD 48/mês de uma e2-standard-2 ligada 24/7).
- **Religar manualmente apenas para batch jobs** legítimos da VM: pipeline AURORA `radar_legal`, ingestão BR noturna, OCR pesado — exatamente o critério já aplicado à VM `tbr-mainframe` (ver `13_memoria_destilada.md §4`).
- **Antes de desligar:** garantir `systemctl disable maestro-listener` para que a VM não tente subir o listener zumbi no próximo boot.
- **Heartbeat:** o `maestro-heartbeat` (Cloud Scheduler, 30 min) bate no worker Cloud Run, **não** na VM — portanto independe do estado da VM.

**Regra canônica:** o listener é serverless (Cloud Run webhook). A VM é compute sob demanda para batch, não infraestrutura de always-on do Maestro.

---

**FIM 15_licoes_deploy_v22.md**
