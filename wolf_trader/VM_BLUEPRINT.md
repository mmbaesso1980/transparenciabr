# Blueprint — VM WOLF-Trader (operação Polymarket fora do Brasil)

> **Contexto (Comandante Baesso):** o Polymarket aplica geobloqueio ao Brasil. Esta VM
> roda numa região liberada e hospeda o motor WOLF de decisão + execução na Polymarket
> CLOB (chain 137 / Polygon). Segue as leis do projeto TransparênciaBR/AURORA.

---

## ⚠️ Aviso de risco (leia antes de subir)

Operação de ponta a ponta envolve **custódia de chave privada de carteira** numa VM 24/7
e **contorno de geobloqueio**. Riscos assumidos pelo Comandante:

- **Perda irreversível:** ordem executada on-chain não volta. Não há "desfazer".
- **Custódia:** se a chave L1 vazar da VM, os fundos podem ser drenados na hora.
- **Legal/ToS:** acessar de região liberada pode contrariar os Termos do Polymarket e
  regras locais. Decisão e responsabilidade são do Comandante.

**Mitigação adotada por padrão (desenho seguro):**
- Chave privada **L1 nunca em disco/env em texto claro** — fica em **Secret Manager**
  (idealmente envelopada por **Cloud KMS**), lida só em memória no momento de assinar.
- Credenciais **L2** (api_key/secret/passphrase) derivadas em runtime via
  `createOrDeriveApiKey` e mantidas apenas em memória.
- **Gate de valor:** ordens acima de `WOLF_ORDER_GATE_USDC` (default US$ 25) exigem
  aprovação do Comandante no Telegram (`/aprovar`). Abaixo disso, executa autônomo.
- **Limites duros:** exposição máxima diária (`WOLF_MAX_DAILY_USDC`) e por mercado;
  R1 da doutrina corta a ordem se estourar. R2 (sem dado) → não opera.
- Toda ordem é **auditada** (BigQuery + Firestore) e **notificada** no Telegram.

---

## 1. Especificação da VM

| Item | Valor |
|---|---|
| Nome | `wolf-trader-us-east1` |
| Projeto GCP | `transparenciabr` (nº 89728155070) — billing já ativo |
| Região/zona | `us-east1-b` (EUA — região onde a Polymarket é acessível) |
| Tipo | `e2-small` (2 vCPU burst, 2 GB) — trading é leve; sem GPU |
| Disco | 20 GB pd-balanced |
| SO | Debian 12 (bookworm) |
| IP externo | Estático (reservar) — sai pelo IP da região liberada |
| Firewall | Egress liberado 443; ingress SSH só via **IAP** (sem porta 22 pública) |
| Service Account | `wolf-trader@transparenciabr.iam.gserviceaccount.com` |

### IAM mínimo da SA (princípio do menor privilégio)
- `roles/secretmanager.secretAccessor` — ler a chave da carteira + tokens.
- `roles/cloudkms.cryptoKeyDecrypter` — se envelopar a chave com KMS.
- `roles/datastore.user` (Firestore em `transparenciabr`) — estado/gate/memória.
- `roles/bigquery.dataEditor` + `roles/bigquery.jobUser` (em `projeto-codex-br`) — auditoria.
- `roles/aiplatform.user` (em `projeto-codex-br`) — Gemini/WOLF (persona `/wolf`).

> Observação: NÃO dar `owner`/`editor`. Sem chave de SA em arquivo — usar a SA anexada à VM.

## 2. Rede / geobloqueio
- A VM em `us-east1` já sai por IP dos EUA — atende ao requisito "VM na região liberada".
- Sem VPN adicional (opção escolhida). Se a Polymarket bloquear datacenter/ASN da GCP,
  o plano B é rota por VPN comercial na saída (não configurado agora).
- Infra de menor latência do Polymarket é `eu-west-2`; para só ler odds a latência não é
  crítica. Se quiser co-location de baixa latência no futuro, avaliar `europe-west2`.

## 3. Segredos (Secret Manager em `transparenciabr`)
| Secret | Conteúdo | Observação |
|---|---|---|
| `WOLF_WALLET_PK` | chave privada L1 da carteira | **NUNCA** em env/disco; só em memória ao assinar |
| `WOLF_DEPOSIT_ADDRESS` | endereço da carteira/deposit | público, mas centralizado aqui |
| `WOLF_SIGNATURE_TYPE` | `0`/`1`/`2`/`3` (EOA/Proxy/Safe/1271) | ver doc CLOB |
| `TELEGRAM_BOT_TOKEN` | token do bot de alertas/gate | já usado pela ponte |
| (L2 api_key/secret/passphrase) | **derivados em runtime** | não persistir em texto |

## 4. Serviços na VM (systemd)
- `wolf-trader.service` — laço principal: coleta Polymarket → WOLF `avaliar()` → ordem
  (com gate de valor). Reinício automático.
- `devin-listener.service` / `devin-monitor.service` — se quiser concentrar o bot aqui
  também (opcional; hoje planejado na `devin-bridge-listener`).

## 5. Fluxo de execução (com freios)
```
loop:
  mercados = polymarket.listar_mercados(tags=WOLF_TAGS)         # leitura pública
  para cada mercado priorizado:
      obs = mapear_sinais(mercado)          # técnico(preço/momentum), macro, político...
      veredito = wolf_doctrine.avaliar(obs) # override técnico + neutralidade de lado
      if veredito.sinal in (COMPRAR_FORTE, COMPRAR, VENDER, REDUZIR):
          size = dimensionar(veredito.convccao, limites)   # R1 corta se estourar
          if size.usdc > WOLF_ORDER_GATE_USDC:
              telegram.pedir_gate(ordem)     # aguarda /aprovar
          else:
              executar(ordem)                # assina L1->deriva L2->posta ordem
          audit.log("wolf.ordem", ...); telegram.notificar(...)
      # R2 (sem dado) -> não opera; SEM_CONVICCAO -> ignora
  dormir(intervalo)
```

## 6. Deploy (Cloud Shell — o sandbox não tem gcloud)
Ver `wolf_trader/deploy_wolf_trader.sh` e o checklist em `wolf_trader/DEPLOY_CHECKLIST.md`.
Fases: reservar IP → criar SA + IAM → gravar segredos → criar VM → instalar código +
systemd → smoke test (só leitura de mercados, sem postar ordem).

## Fontes
- Polymarket CLOB — Overview (host, chain 137, L1/L2 auth, signature types):
  https://docs.polymarket.com/developers/CLOB/introduction
