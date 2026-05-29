# Lições do dia 27/05/2026 — Sprint Maestro v1.0 + M11 + M12

**Owner:** Computer (assistente Perplexity) + Comandante Baesso
**Sessão:** ~12h consecutivas, foco deploy Maestro v1.0 + roadmap v10 emergencial
**Para carregar em:** `maestro_memory` collection no Firestore (após Vertex voltar)

---

## L01 · `vertex-lightning-dunning`

**Tópico:** Lightning dunning em Vertex AI bloqueia billing account inteira, não projeto específico.

**Lição:** HTTP 403 com mensagem `Lightning dunning decision is deny for project: projects/<NUMBER>` **não** é problema técnico (IAM, quota, API desligada). É flag administrativa do Google no nível da billing account. Acionada quando crédito promocional consumido em ritmo agressivo sem método de pagamento de fallback robusto. **Não tem banner amigável no console** — só o 403 enigmático na API.

**Tags:** `billing`, `vertex`, `finops`, `incident-resolution`

**Remediação:**
1. Pagar o débito (manual no [Billing Console](https://console.cloud.google.com/billing/01061C-9EC54F-3C6B7B))
2. Abrir ticket S2 no Google Cloud Support pedindo remoção da flag
3. SLA típico: 24-72h após pagamento confirmado

**Prevenção:** Pre-flight check antes de operação Vertex pesada (ver L05).

---

## L02 · `cloudrun-maxscale-zero`

**Tópico:** Cloud Run não aceita `--max-instances=0`.

**Lição:** Tentativa de pausar Cloud Run zerando ambos `min-instances` e `max-instances` falha com:

```
ERROR: (gcloud.run.services.update) spec.template.metadata.annotations:
Invalid value 0. autoscaling.knative.dev/maxScale annotation must be a positive integer.
```

**Tags:** `cloud-run`, `cost-optimization`, `pause`

**Soluções válidas para pausar:**
1. **Deletar o serviço** (`gcloud run services delete`) — custo zero absoluto, retomada via `bash deploy_all.sh`
2. **`--min-instances=0 --max-instances=1`** — custo ~zero quando idle, mas serviço ainda existe

**Escolha:** delete é mais limpo quando não há tráfego externo esperado.

---

## L03 · `jlog-event-collision`

**Tópico:** `event` é kwarg reservado do logger `structlog`.

**Lição:** Função wrapper sobre `structlog.get_logger().bind(...).info(...)` recebendo `event=...` como kwarg explícito **colide** com o primeiro arg posicional do `info()`. Erro:

```
TypeError: jlog() got multiple values for argument 'event'
```

**Tags:** `python`, `structlog`, `logging`, `kwargs`

**Fix:** renomear o kwarg da wrapper para `audit_event` (ou qualquer outro nome não-reservado). Commit `274d906f` no branch `maestro/deploy-v1`.

```python
# Antes (quebrava):
def jlog(level, event, **kwargs):
    logger.bind(**kwargs).log(level, event)

# Depois:
def jlog(level, audit_event, **kwargs):
    logger.bind(**kwargs).log(level, audit_event)
```

---

## L04 · `pep668-debian-12-venv`

**Tópico:** Debian 12 bloqueia `pip install` global por padrão.

**Lição:** Em `aurora-cacador-br` (Debian 12 + Python 3.11), `pip install` na user-area ou system-area retorna:

```
error: externally-managed-environment
× This environment is externally managed
```

**Tags:** `debian-12`, `pep-668`, `venv`, `systemd`

**Solução padrão para serviços systemd:**

```bash
# Criar venv dedicado
sudo python3 -m venv /opt/maestro/venv
sudo /opt/maestro/venv/bin/pip install -r /opt/maestro/requirements.txt

# Service unit aponta para venv
[Service]
Environment="PATH=/opt/maestro/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/opt/maestro/venv/bin/python /opt/maestro/listener.py
```

**Outras opções (não preferidas):**
- `pip install --break-system-packages` (gambiarra, evita)
- `pipx install` (ok para CLIs standalone, não pra services)

---

## L05 · `vertex-preflight-billing`

**Tópico:** Operações manuais (não-Maestro) também precisam de FinOps guard.

**Lição:** A skill `maestro-autonomo` define F5 (R$ 30/h soft, R$ 80/h hard) **apenas** para o loop autônomo. Operações manuais (deploys, blind tests, dossiês via Cloud Shell) **não** passavam por esse cap. Resultado: somatório de chamadas pequenas → estouro do crédito → Lightning dunning (ver L01).

**Tags:** `finops`, `preflight`, `vertex`, `manual-operations`

**Solução:** M13 introduz `scripts/preflight_billing_check.sh` chamado **antes** de:
- `deploy_all.sh` (deploy Maestro)
- `blind_test_*.py --run-vertex`
- `gerar_dossie_v1.py`
- `engines/vertex/client.py` inicializador

**Regra atualizada (a entrar em `transparenciabr-lei` regra 11):**
> Toda operação que dispare Vertex com custo esperado > R$ 1 deve passar por `preflight_billing_check` com exit code 0 **antes** da chamada.

**Custo do check:** ~50ms + ~R$ 0,0001 (1 token gemini-2.5-flash de ping).

---

## L06 · `co-author-cant-approve-own-pr`

**Tópico:** GitHub não deixa o autor (ou co-autor) aprovar próprio PR.

**Lição:** Tentativa de `gh pr review --approve` em PR onde o usuário é listado como co-author retorna:

```
GraphQL: Review Can not approve your own pull request (addPullRequestReview)
```

**Tags:** `github`, `pr-review`, `co-author`, `workflow`

**Fix:**
1. Usar `gh pr comment` em vez de `--approve` (registra audit trail)
2. Mergear com `gh pr merge --admin` se for repo de admin único
3. Se for repo com múltiplos devs: solicitar review de outro membro

**Aplicado em:** PR #245 (M12 sanitizer PII) — Cursor agent + mmbaesso1980 como co-authors, então tive que usar comment + `--admin`.

---

## L07 · `branches-cursor-roadmap-v10-stack`

**Tópico:** Cursor mergeia PRs em `cursor/roadmap-v10` (não em `main`) para batch release.

**Lição:** PRs #244 (M11) e #245 (M12) reportaram `MERGED` mas estavam em `cursor/roadmap-v10`, não `main`. Maestro v1.0 deployado naquele dia rodava **sem** M11/M12 ativos (deploy clona main).

**Tags:** `branch-strategy`, `cursor`, `release-management`

**Estratégia padrão a seguir:**
1. Features novas → branch `feature/*` → PR para `cursor/roadmap-v10`
2. Quando bloco de roadmap completo → PR `cursor/roadmap-v10 → main` (este libera batch)
3. Hot-fixes que não podem esperar batch → PR direto para `main` + cherry-pick em `cursor/roadmap-v10`

**Aplicado em:** PR #246 (release roadmap v10 fase 1: M11+M12 → main).

---

## Como carregar essas lições no Maestro

Após Vertex voltar:

```bash
# Da VM aurora-cacador-br
source /opt/maestro/venv/bin/activate
cd /opt/maestro/aurora_v3_maestro

for slug in vertex-lightning-dunning cloudrun-maxscale-zero jlog-event-collision \
            pep668-debian-12-venv vertex-preflight-billing co-author-cant-approve-own-pr \
            branches-cursor-roadmap-v10-stack; do
    python memory/firestore_memory.py write "$slug" \
        --file docs/maestro/licoes-27-05.md \
        --tags maestro v1.0 27-05-2026
done
```

(O `--file` extrai a seção correspondente do arquivo markdown.)

---

**Última atualização:** 27/05/2026 17:45 — sessão Maestro v1.0 deploy + roadmap v10 fase 1
