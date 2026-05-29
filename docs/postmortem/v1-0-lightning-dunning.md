# Postmortem · Maestro v1.0 → Lightning Dunning Lock (27 mai 2026)

**Severidade:** S2 — Production blocked
**Duração:** 27/05/2026 ~17:00 → em curso (pendente Google Support + pagamento)
**Owner:** Comandante Baesso · operador-em-chefe TransparênciaBR
**Postmortem author:** Computer (assistente Perplexity)
**Versões afetadas:** Maestro Cloud Run v1.0.0 / v1.0.1 / v1.0.2 (todas no projeto-codex-br)
**Ticket interno:** `0ecc2a5f-3957-453d-9b42-1738bae728db` (item 7)

---

## TL;DR

Maestro v1.0 foi deployado três vezes durante a tarde (path bug → health bug → jlog kwarg bug). Cada redeploy + smoke test queimou Vertex 2.5 Pro em `projeto-codex-br`, somando ao consumo de dossiês manuais da semana (Erika Hilton, Paulo Otávio). Quando o crédito promocional R$ 5.952 (expira 07/04/2027) cruzou um threshold interno do Google, o sistema **Lightning dunning** marcou a **billing account inteira** (`01061C-9EC54F-3C6B7B`) como `deny`. Resultado: HTTP 403 PERMISSION_DENIED em **todos** os projetos vinculados (`transparenciabr` 89728155070 + `projeto-codex-br` 282847675243), bloqueando Maestro 95% pronto.

A causa raiz **não é técnica** — é de **disciplina FinOps**: o agente assistente (Computer) tinha 100% de awareness contextual sobre os caps F5 da skill `maestro-autonomo` (R$ 30/h soft, R$ 80/h hard) e ignorou a regra em operações manuais. Os caps só foram pensados para Maestro autônomo rodando, não para o operador manual disparando Vertex via scripts.

---

## Timeline

| Hora (UTC-3) | Evento |
|---|---|
| 25/05 03:38 | Dossiê Kim Kataguiri v1.0 — Vertex queima estimada R$ 8 |
| 25/05 madrugada | Dossiês Erika Hilton, Paulo Otávio v1/v2/v2.3 — Vertex queima estimada R$ 35 |
| 26/05 | Blind tests Paulo Otávio (3 rounds) — Vertex queima estimada R$ 15 |
| 27/05 11:00 | Deploy Maestro v1.0.0 — falha path absoluto |
| 27/05 13:30 | Deploy Maestro v1.0.1 — falha Cloud Run health probe (sem HTTP server) |
| 27/05 15:45 | Deploy Maestro v1.0.2 — sucesso técnico, worker recebe `/ping` |
| 27/05 16:30 | Primeira chamada Vertex do worker → **HTTP 403 Lightning dunning** |
| 27/05 17:00 | Diagnóstico confirma billing account toda bloqueada |
| 27/05 17:15 | Maestro v1.0.2 pausado (Cloud Run deletado, listener stopped) |
| 27/05 17:30 | Email pro Google Cloud Support preparado |
| 27/05 17:30 | Postmortem iniciado, M13 spec proposto |

---

## Análise 5-whys

1. **Por que o Maestro v1.0 não responde?**
   Worker recebeu `/ping`, entrou em `reason_loop`, mas Vertex retornou 403.

2. **Por que Vertex retornou 403?**
   `Lightning dunning decision is deny for project: projects/282847675243`. Não é IAM, não é quota — é flag administrativa.

3. **Por que a flag foi acionada?**
   O sistema interno do Google avaliou a billing account `01061C-9EC54F-3C6B7B` como em estado de "dunning" (cobrança em risco), provavelmente porque o crédito promocional R$ 5.952 está sendo queimado em ritmo alto sem método de pagamento de fallback robusto.

4. **Por que houve queima em ritmo alto?**
   3 deploys do Maestro no mesmo dia (todos com bugs) + 6 sessões de dossiês manuais em 72h + blind tests, sem nenhum pre-flight check de saldo.

5. **Por que não havia pre-flight check?**
   A skill `maestro-autonomo` definiu F5 (caps R$ 30/h soft, R$ 80/h hard) **apenas** para o Maestro autônomo. Operações manuais (deploy, blind test, dossiê via Cloud Shell) **não eram cobertas**. O Computer (agente assistente) tinha awareness do risco, mas tratava cada chamada como isolada, sem somar em janela.

---

## Causa raiz

**Disciplina FinOps de operações manuais nunca foi instrumentada.** O agente assistente tem skill carregada que descreve caps de queima Vertex (`maestro-autonomo` F5), mas o cap nunca foi aplicado fora do loop autônomo. Quando o operador humano (Comandante Baesso) executa `bash deploy_all.sh` ou `python blind_test.py --run-vertex`, nenhum guard intercepta a chamada.

**Erro do agente assistente:** raciocínio econômico de curto prazo. Cada deploy era visto como "1 chamada Vertex pequena, ~R$ 5". Em janela de 72h, **soma de chamadas pequenas + 6 dossiês forenses = ~R$ 200-400** de queima real, suficiente pra Google marcar dunning.

---

## Ações corretivas

### Imediatas (em curso)

- [x] Maestro v1.0.2 pausado (Cloud Run deletado, listener stopped)
- [x] Email pro Google Support preparado (S2 severity, Case TBD)
- [ ] **Pagamento manual** do que faltou (Comandante)
- [ ] Aguardar Google remover flag (24-72h após pagamento)

### Estruturais (M13)

- [x] Script `scripts/preflight_billing_check.sh` criado
- [ ] Integração obrigatória em:
  - `aurora_v3_maestro/deploy/deploy_all.sh` (antes de `gcloud run deploy`)
  - `aurora_v3_maestro/worker/blind_test_paulo_octavio.py` (antes de `--run-vertex`)
  - `manus_office/dossie_v1/scripts/gerar_dossie_v1.py`
  - `engines/vertex/client.py` (no inicializador)
- [ ] Sentinela `Lightning dunning` em `engines/incident/sentinels.yaml` (HIGH)
- [ ] Lição em `maestro_memory` com tópico `vertex-lightning-dunning` (após Vertex voltar)

### Process (skill `maestro-autonomo`)

- [ ] Atualizar definição F5 para incluir **operações manuais**:
  - Adicionar regra: "antes de qualquer chamada Vertex pesada (>R$ 1 esperada), executar `preflight_billing_check`"
  - Adicionar regra: "soft cap R$ 30/h aplica-se à soma de TODAS as fontes (autônomo + manual)"
- [ ] Atualizar skill `transparenciabr-lei` regra 11 (NOVA): "Operação custosa em Vertex exige pre-flight billing check com exit code 0"

### Process (agente assistente Computer)

- [x] Ticket interno item 7 registrado
- [ ] Auditoria estática proativa **incluindo FinOps**: antes de qualquer comando que dispare Vertex, verificar contexto de janela 1h
- [ ] Ao detectar 3+ chamadas Vertex em 1h, alertar Comandante antes da 4ª

---

## Métricas de sucesso (lições aprendidas)

- **Zero** incidentes Lightning dunning recorrentes em 90 dias após M13 merged
- **100%** das chamadas Vertex em scripts críticos passando por `preflight_billing_check`
- Saldo de crédito promocional **visível** no dashboard `STATUS_ATUAL.md` (atualização semanal)
- Detector incident-scan capturando padrão `Lightning dunning` automaticamente

---

## Custo do incidente

- **Tempo do Comandante:** ~3h de sessão SSH no celular (deploy + diagnóstico + pausa)
- **Tempo morto do Maestro:** indeterminado até pagamento + Google remover flag (estimado 24-72h)
- **Crédito Vertex queimado em vão:** ~R$ 30-60 dos 3 deploys com bugs (que poderiam ter sido pegos por auditoria estática antes)
- **Risco reputacional:** zero (incidente interno, sem impacto externo)
- **Roadmap v10 atraso:** 1 dia (M13 spec não estava no plano original)

---

## Lições

1. **FinOps não é só pra Maestro autônomo** — operações manuais somam no mesmo bucket de janela 1h
2. **Crédito promocional ≠ pay-as-you-go saudável** — bloqueio quando esgota é hard stop com flag administrativa
3. **Lightning dunning não tem banner amigável no console** — só HTTP 403 enigmático
4. **Pre-flight checks custam ~R$ 0,0001 por chamada** (ping gemini-2.5-flash com 1 token) — relação custo/benefício enorme
5. **Agente assistente com awareness de regra ≠ agente que aplica regra** — disciplina exige instrumentação, não apenas conhecimento
6. **Ticket interno + postmortem público = circuito fechado de aprendizado** — sem isso, mesmo erro repete

---

## Referências

- Ticket interno Computer: `0ecc2a5f-3957-453d-9b42-1738bae728db`
- Spec M13: [cursor_pacote_v10/docs/roadmap_v10/M13.md](../../cursor_pacote_v10/docs/roadmap_v10/M13.md)
- Email Google Support: `google_support_email_lightning_dunning.md` (workspace)
- Skill `maestro-autonomo`: F5 caps R$ 30/h soft, R$ 80/h hard
- Console billing: [01061C-9EC54F-3C6B7B](https://console.cloud.google.com/billing/01061C-9EC54F-3C6B7B)

---

**Status:** Em curso. Atualizar quando Vertex voltar e M13 for mergeado integralmente.
