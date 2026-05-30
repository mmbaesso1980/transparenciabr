/maestro execute-autonomous-afk-night-30mai

# DIRETIVA AFK NOTURNA — 30/mai/2026 16:23 BRT
# Comandante Baesso está no celular, parado. Autonomia TOTAL.
# senha_dia=aurora-cartman-2026 · allow_all=true · max_turns=120
# F1 chat_id=6483072695 · F5 hard cap R$ 80/h Vertex em projeto-codex-br

## REGRAS INVIOLÁVEIS DA NOITE

1. **NÃO ME PERGUNTE NADA.** Decida sozinho. Se travar, registre em maestro_audit_log com tag `decisao_autonoma` e continue.
2. **NUNCA PARE POR PAT 401.** Reload secret `projects/projeto-codex-br/secrets/maestro-github-pat/versions/latest` e teste com `GET https://api.github.com/user`. Se 401 persistir, abra issue no repo com label `auth-broken` e siga para a próxima sub-tarefa. NUNCA salve código em Firestore como workaround — sempre branch+PR no GitHub.
3. **3x mesma tarefa → PARE essa sub-tarefa, NÃO a sessão.** Mude de abordagem ou pule. Audit log entry obrigatório.
4. **Snapshot Firestore (F4) antes de qualquer ação irreversível.**
5. **PT-BR formal, "Comandante Baesso", tom INFORMATIVO.** Sem "fraude/corrupto/roubou".
6. **Commits Conventional:** `feat(radar):`, `feat(oceanways):`, `fix(...)`, `chore(...)`, `docs(...)`, `test(...)`.
7. **Branches:** `feat/radar-juridico-exclusivo` (Projeto A) e `feat/oceanways-mvp` (Projeto B). Sub-branches `feat/radar/<modulo>` permitidas, sempre PR para a branch pai.
8. **PR aberto, NUNCA mergeado sem aval humano.** Use draft PR se preferir.
9. **Não denunciamos. Mostramos.** Toda saída forense INFORMATIVA.
10. **CPF mascarado `***.XXX.XXX-**` em log; hash SHA256(cpf+"asmodeus_v1") em BQ.**

## CONTEXTO TÉCNICO

- Repo: `mmbaesso1980/transparenciabr` (default `main`, público)
- VM execução: `aurora-cacador-br` sa-east1-a (você roda no worker Cloud Run em `projeto-codex-br/us-east1`)
- Vertex: `gemini-2.5-pro` em `projeto-codex-br/us-east1`, temp 0.1, max_tokens 32768
- BigQuery datasets (já provisionados ou serão pelo Comandante via `aplicar_ddl_radar_juridico.sh` em `ops/wake-30mai`):
  - `transparenciabr:radar_juridico` (sa-east1) — Projeto A
  - `projeto-codex-br:oceanways_dev` e `oceanways_prod` (US) — Projeto B
- Firestore: coleções `maestro_audit_log`, `maestro_memory`, `maestro_code_delivery` (DEPRECIADA), `maestro_rollback`
- Firebase Hosting alvo: `fiscallizapa` (dois L)
- Telegram chat_id: `6483072695`

## CASO A DDL AINDA NÃO TENHA SIDO APLICADA

Se ao tentar criar tabela receber `dataset not found` em `transparenciabr:radar_juridico` ou `projeto-codex-br:oceanways_*`:
1. **NÃO crie o dataset você mesmo** (Comandante quer rastreabilidade do runbook).
2. Salve o erro em `maestro_audit_log` com tag `aguardando_ddl_fase_0`.
3. Pule para sub-tarefas que NÃO dependem do BQ ainda (frontend, schemas Pydantic, testes unitários com mock local SQLite, docs, CI yaml, código de ingestão sem run).
4. Quando uma branch de feature acumular 10 commits sem precisar de BQ, abra PR draft para `main` com checklist do que falta.

## PROJETO A — RADAR JURÍDICO INSS EXCLUSIVO

**Branch base:** `feat/radar-juridico-exclusivo` (SHA atual `28d42017`)

**Missão:** Construir backend + frontend de captação e classificação de indeferidos INSS via PJe + DataJud + DJEN, com enriquecimento AURORA, alertas e billing por crédito.

**Fases (entregue Fase-a-Fase, commits frequentes ≥1 a cada 10min de trabalho):**

### Fase 1 — Backend skeleton (já tem scaffold, completar miolo)
- [ ] `backend/services/pje_checker.py` — cliente PJe consulta pública com retry exponencial, User-Agent `TransparenciaBR-engines/1.0`, parser de movimentações
- [ ] `backend/services/aurora_enricher.py` — fanout para DataJud + DJEN + cruzamento com `tbr_leads_prev.indeferimentos_brasil_raw`
- [ ] `backend/services/bq_service.py` — wrapper com `--use_legacy_sql=false`, location auto-detect (sa-east1 para `transparenciabr:*`, US para `projeto-codex-br:*`)
- [ ] `backend/services/firestore_service.py` — leads, alertas, créditos, sessões
- [ ] `backend/routes/leads.py` — list/get/filter por advogado, paginação
- [ ] `backend/routes/alertas.py` — webhook DJEN, fila de notificação
- [ ] `backend/routes/pje.py` — busca CPF/processo
- [ ] `backend/routes/creditos.py` — saldo, débito por consulta, recarga Stripe/MP (Mercado Pago)
- [ ] `backend/main.py` — FastAPI app factory, CORS, middleware LGPD, healthcheck
- [ ] `backend/requirements.txt` — fixar versões
- [ ] `backend/Dockerfile` — Cloud Run otimizado, multi-stage
- [ ] `backend/tests/test_pje_checker.py` — mocks com `responses` lib
- [ ] `backend/tests/test_aurora_enricher.py`
- [ ] `backend/tests/test_bq_service.py`
- [ ] `.github/workflows/ci-radar.yml` — pytest + black + ruff + mypy

### Fase 2 — Frontend Radar Jurídico
- [ ] `frontend/src/pages/RadarJuridico.jsx` — tabela leads + filtros + drilldown
- [ ] `frontend/src/pages/RadarJuridicoDetalhe.jsx` — ficha completa do lead
- [ ] `frontend/src/components/LeadCard.jsx`, `AlertaBadge.jsx`, `CreditoCounter.jsx`
- [ ] `frontend/src/services/radarApi.js` — axios client com interceptor de auth
- [ ] Paleta teal `#01696F`, DM Sans + Inter
- [ ] Responsivo mobile-first (Comandante usa celular)
- [ ] Skeleton loaders, error boundaries

### Fase 3 — Billing e LGPD
- [ ] Header LGPD em todo export CSV
- [ ] Termo de aceite no signup com versionamento (`accepted_terms_version`)
- [ ] Pseudonimização de CPF de PEP
- [ ] Bloqueio classe C (CPF civil, endereço, saúde)
- [ ] Página `/lgpd-descadastro` com formulário

### Fase 4 — Deploy Cloud Run + Hosting
- [ ] `deploy/deploy_radar_backend.sh` (Cloud Run, sa-east1, min-instances=0)
- [ ] `deploy/deploy_radar_frontend.sh` (Firebase Hosting target `fiscallizapa`)
- [ ] `deploy/README.md` com rollback steps

### Fase 5 — PR Draft para main
- Checklist do que foi entregue
- Screenshots/GIFs do frontend (gere via Playwright headless se possível, senão skip)
- Lista de TODOs restantes

---

## PROJETO B — OCEAN WAYS MVP R1

**Branch base:** `feat/oceanways-mvp` (SHA atual `94973db6`)

**Missão:** MVP de busca de passagens aéreas com agregação multi-fonte, billing por crédito, alertas de queda de preço.

**Fases:**

### Fase 1 — Backend Ocean Ways
- [ ] `backend/services/search.py` — orquestrador busca com cache Redis (ou Firestore TTL se Redis não disponível)
- [ ] `backend/services/aggregator.py` — fanout async para fontes
- [ ] `backend/services/direct_airlines.py` — adapters para LATAM, GOL, Azul, Smiles (sem expor credenciais)
- [ ] `backend/services/auth.py` — Firebase Auth + JWT
- [ ] `backend/services/credits.py` + `credits_billing.py` — débito por busca, recarga
- [ ] `backend/services/payments.py` + `payments_stripe.py` + `payments_mercadopago.py`
- [ ] `backend/services/alerts.py` — alerta por preço-alvo
- [ ] `backend/main.py` — FastAPI factory
- [ ] `backend/Dockerfile`, `requirements.txt`
- [ ] `backend/tests/*` — pelo menos 1 teste por serviço com mock

### Fase 2 — Frontend Ocean Ways
- [ ] `frontend/src/pages/Home.jsx` — form de busca + resultados
- [ ] `frontend/src/pages/Resultado.jsx` — comparativo de voos
- [ ] `frontend/src/pages/Alertas.jsx`
- [ ] `frontend/src/pages/MinhaConta.jsx` — créditos, histórico, recarga
- [ ] Paleta marítima teal+azul; responsive mobile-first

### Fase 3 — Billing
- [ ] Webhook Stripe + Mercado Pago
- [ ] Idempotência por `event_id`
- [ ] Reconciliação diária via Cloud Scheduler

### Fase 4 — Deploy
- [ ] `deploy/deploy_oceanways_backend.sh` (Cloud Run, us-east1, projeto `projeto-codex-br`)
- [ ] `deploy/deploy_oceanways_frontend.sh` (Firebase Hosting separado se possível, senão subpath)

### Fase 5 — PR Draft
- Mesmo padrão do Projeto A

---

## EXECUÇÃO PARALELA RECOMENDADA

- Alterne entre A e B a cada ciclo de raciocínio (ex: 3 commits em A → 3 commits em B → repeat). Isso evita o Comandante acordar e ver só um avançou.
- Use `task_complete` ao final de cada Fase com payload `{"projeto": "A"|"B", "fase": N, "branch": "...", "commits_novos": [sha8,...], "pr_url": "...|null"}`.
- Telegram só quando fechar uma Fase inteira ou se aparecer bloqueio que dure >1h. NÃO encher o chat.

## DROGAS E ARMADILHAS JÁ GRAVADAS

- ❌ `pkill -f <script>` dentro de `gcloud --command` mata o SSH
- ❌ `▸` (U+25B8) não renderiza em Inter — use `›` (U+203A)
- ❌ `try/except: pass` em worker grava 0 bytes — sempre logar `errors/<key>.err`
- ❌ NUNCA expor output bruto de `google_cloud-run-query` (SA `tbr-reader` comprometida)
- ❌ `firebase_admin_sdk__pipedream` está broken — use `firestore_*` tools nativas
- ❌ Shallow clone (depth=50) sem `--unshallow` esconde branches — sempre clone full ou use API

## RELATÓRIO DE FIM-DE-NOITE (executar quando max_turns atingir 100)

`telegram_send`:
```
🌅 Bom dia, Comandante Baesso.
Noite de 30/mai → 31/mai consolidada.

PROJETO A — Radar Jurídico
- Branch: feat/radar-juridico-exclusivo
- Fases concluídas: <N>/5
- Commits: <total>
- PR: <url ou "não aberto ainda">
- Bloqueios: <lista ou "nenhum">

PROJETO B — Ocean Ways
- Branch: feat/oceanways-mvp
- Fases concluídas: <N>/5
- Commits: <total>
- PR: <url ou "não aberto ainda">
- Bloqueios: <lista ou "nenhum">

Vertex queimado: ~R$ <X> em projeto-codex-br
Próximo passo sugerido: <texto>
— Maestro v2.1.4
```

## EM CASO DE EMERGÊNCIA REAL (raríssimo)

Só notifique o Comandante via Telegram se:
- F5 estourou (R$ 80/h em Vertex)
- F3 kill-switch foi ativado externamente
- PAT GitHub revogado E renovação falhou 5x
- Cloud Run worker morreu e não conseguiu auto-restart

Para tudo o mais: AUDIT LOG e continue.

---

VAI. Não me peça permissão. Não pare. Não loope. Decida.
— Comandante Baesso (via Computer, 30/mai/2026 16:23 BRT)
