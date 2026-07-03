# Checklist de deploy — VM WOLF-Trader (Polymarket)

> Execute no **Cloud Shell** (https://shell.cloud.google.com). O sandbox do agente não
> tem gcloud. Nada de segredo no chat — a chave da carteira você cola só no Secret Manager.

## Pré-requisitos
- [ ] Você é admin/owner do projeto `transparenciabr` (billing ativo).
- [ ] A ponte (`devin-vertex-bridge`) está versionada no repo, ex.: em `bridge/`.
      Se estiver em outro caminho, ajuste as duas linhas `cd .../bridge` no script.
- [ ] Carteira com **USDC na Polygon (chain 137)** e um pouco de **POL** para gás
      (se usar signature type 0/EOA). Ver tipos de carteira na doc CLOB.

## Passos
1. [ ] Abrir Cloud Shell e clonar o repo:
       `git clone https://github.com/mmbaesso1980/transparenciabr.git && cd transparenciabr/bridge/wolf_trader`
2. [ ] `bash deploy_wolf_trader.sh`
3. [ ] Na **Fase 3**, colar quando pedir (não ecoa na tela):
       - `WOLF_WALLET_PK` — chave privada L1 da carteira
       - `WOLF_DEPOSIT_ADDRESS` — endereço 0x da carteira/deposit
       - `TELEGRAM_BOT_TOKEN` — token do bot
4. [ ] Conferir o **smoke test** (Fase 6): deve imprimir "mercados lidos: N" — é só leitura.
5. [ ] Revisar os **limites de risco** (variáveis de ambiente) antes de ligar execução real.

## Variáveis de ambiente (limites e config)
| Env | Default | O que faz |
|---|---|---|
| `WOLF_ORDER_GATE_USDC` | 25 | Ordens acima disso exigem `/aprovar` no Telegram |
| `WOLF_MAX_ORDER_USDC` | 50 | Teto por ordem |
| `WOLF_MAX_MARKET_USDC` | 75 | Teto de exposição por mercado |
| `WOLF_MAX_DAILY_USDC` | 200 | Teto de gasto por dia |
| `WOLF_SIGNATURE_TYPE` | 3 | 0=EOA, 1=Proxy, 2=Safe, 3=POLY_1271 (ver doc) |
| `DRY_RUN` | true | **Mantém em `true`** até você validar; `false` habilita ordem real |
| `WOLF_ORDER_GATE_USDC` calibráveis também da doutrina: `OVERRIDE_TECNICO_LIMIAR`, `OVERRIDE_MASSA_MINIMA`, `FATOR_FUNDAMENTO_SOB_OVERRIDE` | — | ajuste fino do override técnico |

## Ligar execução real (só quando estiver seguro)
- [ ] Editar o `wolf-trader.service` (systemd) com `Environment=DRY_RUN=false` e os limites.
- [ ] `sudo systemctl daemon-reload && sudo systemctl enable --now wolf-trader`
- [ ] Acompanhar no Telegram: cada ordem grande chega como gate `/aprovar <id>`.

## Segurança (não pule)
- [ ] Confirmar que a SA `wolf-trader@transparenciabr...` **não** tem `owner`/`editor`.
- [ ] SSH só via IAP (a Fase 4 não abre porta 22 pública).
- [ ] A chave privada existe **apenas** no Secret Manager — nunca em arquivo na VM.
- [ ] `DRY_RUN=true` no primeiro boot; só vire `false` após o smoke test passar.

## Fontes
- Polymarket CLOB (host, chain 137, L1/L2, signature types):
  https://docs.polymarket.com/developers/CLOB/introduction
