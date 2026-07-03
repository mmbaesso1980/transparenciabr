# Deploy Checklist — Bridge TransparênciaBR / Protocolo WOLF

> **Executor:** Comandante Baesso (Cloud Shell)  
> **Ambiente:** GCP Cloud Shell autenticado no projeto `projeto-codex-br`  
> **Região:** `us-east1` (fora do Brasil, conforme arquitetura)

---

## Pré-requisitos

- [ ] Cloud Shell aberto e autenticado (`gcloud auth list`)
- [ ] Projeto correto selecionado: `gcloud config set project projeto-codex-br`
- [ ] Repositório clonado: `git clone https://github.com/mmbaesso1980/transparenciabr.git`
- [ ] Branch correta: `cd transparenciabr && git checkout main`

---

## Segredos a Cadastrar no Secret Manager

Todos os segredos abaixo devem ser criados **antes** de rodar o deploy script.

| Segredo | Descrição | Como obter |
|---------|-----------|------------|
| `DEVIN_API_KEY` | Token do service user Devin (prefixo `cog_`) | Painel Devin → Settings → API Keys |
| `DEVIN_ORG_ID` | ID da organização Devin | Painel Devin → Settings → Organization |
| `TELEGRAM_BOT_TOKEN` | Token do bot `@Asmodeuswebforgebot` | @BotFather no Telegram |
| `TELEGRAM_COMMANDER_CHAT_ID` | Chat ID do Comandante | Envie `/start` ao bot e consulte via API |

### Cadastrar cada segredo:

```bash
# Exemplo (substitua VALOR pelo valor real — NÃO cole tokens neste arquivo):
echo -n 'VALOR_REAL' | gcloud secrets versions add DEVIN_API_KEY --data-file=-
echo -n 'VALOR_REAL' | gcloud secrets versions add DEVIN_ORG_ID --data-file=-
echo -n 'VALOR_REAL' | gcloud secrets versions add TELEGRAM_BOT_TOKEN --data-file=-
echo -n 'VALOR_REAL' | gcloud secrets versions add TELEGRAM_COMMANDER_CHAT_ID --data-file=-
```

---

## Variáveis de Ambiente da Aplicação

Definidas no `.env` da VM (geradas automaticamente pelo deploy script):

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DEVIN_API_KEY` | (segredo) | Token Devin API |
| `DEVIN_ORG_ID` | (segredo) | Org ID Devin |
| `DEVIN_BASE_URL` | `https://api.devin.ai/v3` | Base URL da API |
| `DEVIN_POLL_INTERVAL` | `30` | Intervalo de polling (segundos) |
| `TELEGRAM_BOT_TOKEN` | (segredo) | Token do bot |
| `TELEGRAM_COMMANDER_CHAT_ID` | (segredo) | Chat ID do comandante |
| `TELEGRAM_RATE_LIMIT_RETRIES` | `5` | Max retries em 429 |
| `CODEX_PROJECT` | `projeto-codex-br` | Projeto GCP principal |
| `TBR_PROJECT` | `transparenciabr` | Projeto TransparênciaBR |
| `GCP_REGION` | `us-east1` | Região GCP |
| `AUDIT_DATASET` | `bridge_audit` | Dataset BigQuery |
| `AUDIT_TABLE` | `events` | Tabela de auditoria |
| `DEPLOY_ENV` | `staging` | Ambiente (staging/production) |
| `WOLF_OVERRIDE_TECNICO_LIMIAR` | `0.75` | Limiar de convicção para override técnico |
| `WOLF_OVERRIDE_MASSA_MINIMA` | `3` | Qtd mínima de sinais técnicos para override |
| `WOLF_FATOR_FUNDAMENTO_SOB_OVERRIDE` | `0.3` | Peso do fundamento sob override |

---

## Passo a Passo do Deploy

### 1. Criar segredos (se ainda não existem)

```bash
cd transparenciabr/bridge
# O script cria os segredos se não existirem:
# Mas você precisa adicionar os VALORES depois (ver seção acima)
```

### 2. Executar o deploy

```bash
cd transparenciabr/bridge
export CODEX_PROJECT=projeto-codex-br
export TBR_PROJECT=transparenciabr
chmod +x deploy/quickdeploy_bridge.sh
./deploy/quickdeploy_bridge.sh
```

### 3. Verificar serviços

```bash
# SSH na VM
gcloud compute ssh devin-bridge-listener --zone=us-east1-b

# Verificar status dos serviços
sudo systemctl status devin-bridge-listener
sudo systemctl status devin-bridge-monitor

# Ver logs em tempo real
journalctl -u devin-bridge-listener -f
```

### 4. Testar o bot

1. Abra o Telegram e envie `/status` para `@Asmodeuswebforgebot`
2. Deve responder: "Sistema operacional. Bridge ativa."
3. Teste `/arsenal` para ver todos os comandos disponíveis

---

## Arquitetura Deployada

```
Cloud Shell (Comandante)
    │
    ▼ quickdeploy_bridge.sh
┌─────────────────────────────────┐
│  VM: devin-bridge-listener      │
│  Zona: us-east1-b               │
│  Tipo: e2-small                 │
│                                 │
│  ┌─ devin-bridge-listener.svc ─┐│
│  │  listener/telegram_agent.py ││
│  │  (long-polling Telegram)    ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─ devin-bridge-monitor.svc ──┐│
│  │  devin_bridge/monitor.py    ││
│  │  (polling sessões Devin)    ││
│  └─────────────────────────────┘│
│                                 │
│  .env (segredos via SM)         │
└────────────┬────────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
Telegram  Devin API  BigQuery/Firestore
  Bot       v3        (auditoria)
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Bot não responde | `systemctl restart devin-bridge-listener` |
| Rate-limit 429 | Backoff automático; se persistir, verifique cota do bot |
| Erro 401/403 Devin | Verifique `DEVIN_API_KEY` e permissões do service user |
| BigQuery falha | Verifique se dataset `bridge_audit` existe e service account tem acesso |
| Offset perdido | Listener reprocessará mensagens recentes (idempotente) |

---

## IMPORTANTE

- **Nenhum deploy foi executado automaticamente** — este checklist é para execução manual pelo Comandante.
- **Gate humano**: qualquer operação em produção requer `/aprovar` explícito.
- **Segredos**: jamais cole tokens em arquivos commitados. Use Secret Manager.
