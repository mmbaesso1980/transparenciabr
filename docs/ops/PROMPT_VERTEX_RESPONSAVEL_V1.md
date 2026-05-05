# Vertex / Datalake — Plano operacional responsável (v1)

**Uso:** colar no Cursor (Agent/Composer) ou seguir manualmente.  
**Substitui versões anteriores** que pediam “queima” de crédito, loops infinitos ou custo mínimo obrigatório — isso **não** é aceitável (risco financeiro, segurança, sustentabilidade).

---

## Princípios (não negociáveis)

1. **Orçamento explícito** — Definir **teto mensal e por job** (ex.: R$ / USD) e **parar** ao atingir. Nunca “esvaziar saldo até X”.
2. **Sem loops eternos** — Jobs são **agendados** (cron/Scheduler) com **duração máxima**, **retries** limitados e **alerta** se falhar.
3. **Idempotência** — Reexecutar o mesmo passo **não duplica** custo inútil (saltar ficheiros já processados, usar prefixos de versão no GCS).
4. **Leitura vs escrita** — Respeitar a política do produto: se “ZERO escrita Firestore” para export, **só leitura** + destino GCS/BQ; produção continua a usar regras atuais.
5. **Segredos** — JSON de service account e passwords **nunca** no repositório, nunca no chat. Só **Secret Manager**, **env** em CI, ou ficheiro local no `.gitignore`.
6. **Evidência** — Cada fase gera **log** e **artefacto** (ficheiro em `gs://` ou relatório em `docs/ops/relatorios/`) com *o que* correu, *quanto* custou (se conhecido), *erros*.
7. **Conformidade** — Dados pessoais: minimizar, respeitar LGPD; textos gerados por modelo: **tom factual**, fontes citadas, “sem evidência” quando não houver dado.

---

## Objetivo (realista)

Integrar de forma **controlada** fontes já existentes (GCS, BigQuery, export Firestore *se autorizado*) com **Vertex AI Search** / **Discovery Engine**, e expor no produto o que **já está** no frontend (ex.: busca v2, rotas stabilizadas), **sem** prometer 12 datastores ou N milhões de documentos até estarem **importados e testados**.

---

## Fase 0 — Inventário (baixo custo)

Executar localmente ou numa VM com `gcloud` e credenciais adequadas. **Não** exige GPU.

```bash
# Ajustar PROJECT / buckets aos teus nomes reais
export PROJ_DADOS=transparenciabr
export PROJ_VERTEX=projeto-codex-br   # se for o caso

# 0.1 Listar datasets BigQuery
bq ls --project_id=$PROJ_DADOS --format=prettyjson > docs/ops/relatorios/bq_datasets_$(date +%Y%m%d).json

# 0.2 Tamanho aproximado de buckets (amostra; listagens completas podem ter custo de listagem)
gsutil du -s gs://datalake-tbr-clean/ 2>/dev/null | head -20

# 0.3 (Opcional) Export Firestore **só** com aprovação e janela de manutenção
# gcloud firestore export gs://SEU_BUCKET_EXPORT/firestore_$(date +%Y%m%d) --project=$PROJ_DADOS
```

**Entregável:** ficheiro em `docs/ops/relatorios/` com output redigido (sem segredos).

---

## Fase 1 — Normalizar e ingerir (lotes)

- Converter JSONL / NDJSON para o **formato** esperado pelo Discovery Engine (documento com `id` + conteúdo/structData).
- **Lote pequeno primeiro** (ex.: 1.000 linhas), validar busca, **depois** ampliar.
- **Não** correr `normalize` em tudo em paralelo sem teste; limitar `max_workers` e tamanho de lote.

---

## Fase 2 — Embeddings / Vector Search (se necessário)

- Só ativar se a **busca por keywords** não chegar.  
- Usar **instância com auto-shutdown** ou **job** com **timeout**; **não** deixar GPU 24/7 “porque sim”.
- Medir **custo por 1M tokens** / **horas de VM** numa prova de conceito de 15 minutos antes de escalar.

---

## Fase 3 — HTTP / Cloud Functions

- Novas funções: **CORS** restrito se possível, **timeout** adequado, **autenticação** se expuser dados sensíveis.
- **Não** expor chaves de API no frontend; preferir **proxy** no teu domínio / Cloud Function.

---

## Fase 4 — Frontend

- Uma rota de cada vez; **testar** em `npm run build` e deploy.
- Ligar a URLs **de configuração** (`import.meta.env`) em vez de hardcode quando fizer sentido.

---

## Critérios de conclusão (responsáveis)

- [ ] Orçamento e alertas de billing **configurados** no GCP.
- [ ] Nenhum serviço “infinito” sem **limite** ou **agendamento**.
- [ ] Documentação **no repo** do que foi feito (`docs/ops/relatorios/`), sem credenciais.
- [ ] Smoke test manual: 3 queries na busca + 1 rota crítica do site.

---

## O que NÃO fazer

- Obrigar “gasto mínimo” em crédito cloud.
- Manter VM/GPU em loop enquanto saldo > X.
- Apagar ou escrever em Firestore de produção sem processo aprovado.
- Colar service account JSON no Cursor ou no Git.

---

*Versão 1 — alinhada a operação segura e auditável. Ajustar nomes de projeto/bucket à tua org.*
