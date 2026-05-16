# TransparênciaBR — Contexto Completo para Gemini Code Assist

> **NÃO CLONE NADA. NÃO BAIXE NADA. Tudo já está neste repositório.**
> Você está dentro de `~/transparenciabr` na VM `tbr-mainframe-us-east1-d`.
> O repo já foi clonado. Use `git pull` para atualizar.

---

## 1. IDENTIDADE DO PROJETO

| Campo | Valor |
|---|---|
| Nome | TransparênciaBR — Auditoria Cidadã Inteligente |
| Codinome interno | Aurora (antes ASMODEUS) |
| Repo | `mmbaesso1980/transparenciabr` |
| Site produção | `https://transparenciabr.web.app` e `https://transparenciabr.com.br` |
| GCP Projeto (BigQuery/Functions) | `transparenciabr` |
| GCP Projeto (Vertex AI créditos) | `projeto-codex-br` (R$ 5.952 créditos, expira 07/04/2027) |
| BigQuery Dataset | `transparenciabr.transparenciabr` |
| BigQuery Dataset legado | `fiscallizapa.dadosBrutos` (algumas queries ainda referenciam) |
| Firebase Hosting | `transparenciabr.web.app` |
| Service Account | `tbr-ingestor@transparenciabr.iam.gserviceaccount.com` |
| Chave local | `/home/manusalt13/transparenciabr/key.json` |

---

## 2. AUTENTICAÇÃO — FAÇA ISSO PRIMEIRO

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/home/manusalt13/transparenciabr/key.json"
export GCP_PROJECT_ID="transparenciabr"
export BQ_DATASET="transparenciabr"
gcloud auth activate-service-account --key-file=key.json
gcloud config set project transparenciabr
```

**Teste:**
```bash
python3 engines/99_gcp_smoke_check.py
# Deve retornar: OK BigQuery — project=transparenciabr row={'ok': 1}
```

---

## 3. BUGS CRÍTICOS — CORRIGIR NESTA ORDEM

### Bug 1: Score concentração retorna 100% para todos ✅ CORRIGIDO
- **Arquivo:** `functions/src/datalake/getRiscoKPIs.js`
- **Causa:** Usava `MAX(valor_empenhado)` que retorna o mesmo valor para todos
- **Fix aplicado:** Commit `9dc97f58` — usa `ROW_NUMBER()` para calcular % relativa

### Bug 2: Emendas 2023-2025 vazias
- **Arquivo:** `engines/02_ingest_emendas.py`
- **Causa:** Ingestão parou em 2022. Precisa de `CGU_API_TOKEN`
- **Fix:** Rodar `python3 engines/02_ingest_emendas.py` (já cobre 2018-ano_atual automaticamente)
- **Requisito:** `export CGU_API_TOKEN=<token do Portal da Transparência CGU>`
- **Se não tiver token:** A API CGU pública funciona sem token mas com rate limit. Tente sem.
- **Validação:** `bq query --use_legacy_sql=false 'SELECT EXTRACT(YEAR FROM data_emenda) AS ano, COUNT(*) FROM transparenciabr.transparenciabr.emendas GROUP BY 1 ORDER BY 1 DESC LIMIT 5'`

### Bug 3: Pulso CEAP zerado
- **Arquivo:** `engines/27_ceap_prisma_piloto.py`
- **Causa:** Falta cron job diário. O engine classifica notas CEAP por 12 prismas investigativos.
- **Fix:** Rodar `python3 engines/27_ceap_prisma_piloto.py --deputado-id 220645 --gravar-alertas --merge-report`
- **Para todos:** Iterar sobre todos os IDs de deputados

### Bug 4: Apenas 30 parlamentares no score de risco ✅ CORRIGIDO
- **Arquivo:** `functions/src/datalake/getRiscoKPIs.js`
- **Causa:** `LIMIT 30` hardcoded
- **Fix aplicado:** Commit `9dc97f58` — removido LIMIT, agora retorna todos os 594

### Bug 5: Mata UF todos zeros
- **Causa:** Classificação CEAP por UF não populada no BigQuery
- **Fix:** Rodar engine 27 para todos os deputados, depois `engines/05_sync_bodes.py`

---

## 4. MAPA DE DADOS — ONDE ESTÁ CADA COISA

### BigQuery (projeto: transparenciabr, dataset: transparenciabr)

| Tabela/View | O que contém | Status |
|---|---|---|
| `ceap_despesas` | Notas CEAP de deputados (600k+) | ✅ Populada |
| `ceap_despesas_ext` | CEAP com campos extras | ✅ Populada |
| `emendas` | Emendas parlamentares | ⚠️ Só até 2022 |
| `emendas_parlamentares` | Emendas com nome do parlamentar | ⚠️ Só até 2022 |
| `score_risco_parlamentar` | Score de risco agregado | ⚠️ Precisa recalcular |
| `tse_patrimonio` | Patrimônio declarado TSE | ✅ Populada |
| `nepotismo_cruzado` | Cruzamento nepotismo | ✅ Populada |
| `nepotismo_detectado` | Nepotismo confirmado | ✅ Populada |
| `ml_benford_score` | Score Lei de Benford | ✅ Populada |
| `tb_dossie_aurora_360` | Dossiê completo 360° | ✅ Populada |
| `transferegov_pagamentos` | Pagamentos Transferegov (1M+) | ✅ Populada |
| `vw_benford_ceap_audit` | View Benford audit | ✅ View |
| `vw_ceap_zscore_roll` | View Z-Score rolling | ✅ View |
| `vw_emendas_concentracao_municipal` | Concentração municipal | ✅ View (76 registros) |
| `vw_emendas_funcao_x_fornecedor_ceap` | Função×Fornecedor | ✅ View (10.252) |
| `vw_emendas_x_ceap_fornecedor` | Emenda×CEAP fornecedor | ✅ View (175.012) |
| `vw_emendas_x_ceap_cnpj_direto` | Emenda×CEAP CNPJ direto | ✅ View (770.417) |
| `vw_show_municipio_pequeno` | Show em cidade pequena | ✅ View (2.134) |
| `vw_universo_completo` | Triangulações CEAP×Emenda×Diário | ✅ View (329.047) |

### Firestore (projeto: transparenciabr)

| Coleção | O que contém |
|---|---|
| `politicos` | Perfis de parlamentares + `alertas_anexados` |
| `alertas_bodes` | Alertas forenses para fila/mapa |
| `transparency_reports/{id}` | Dossiê por parlamentar |
| `diarios_atos` | Atos de diários oficiais (Querido Diário) |
| `credits` | Créditos de usuários |
| `users` | Usuários autenticados |

### Cloud Storage

| Bucket | Conteúdo |
|---|---|
| `datalake-tbr-raw` | Dados brutos ingeridos |
| `datalake-tbr-clean` | Dados processados/classificados |
| `datalake-tbr-clean/ceap_classified/` | CEAP classificada por deputado |
| `datalake-tbr-clean/forensic/` | Análises forenses |

---

## 5. CLOUD FUNCTIONS — TODAS DEPLOYADAS

| Function | Região | O que faz |
|---|---|---|
| `getDashboardKPIs` | southamerica-east1 | KPIs do painel principal |
| `getRiscoKPIs` | southamerica-east1 | Score de risco (CORRIGIDO) |
| `getEmendasKPIs` | southamerica-east1 | KPIs de emendas |
| `getPatrimonioKPIs` | southamerica-east1 | KPIs de patrimônio TSE |
| `getViagensKPIs` | southamerica-east1 | KPIs de viagens |
| `getNepotismoKPIs` | southamerica-east1 | KPIs de nepotismo |
| `getNepotismoCruzadoKPIs` | southamerica-east1 | Nepotismo cruzado |
| `getAnomaliasKPIs` | southamerica-east1 | Anomalias detectadas |
| `getAlvos` | southamerica-east1 | Alvos de risco |
| `getDossieCeapKPIs` | southamerica-east1 | Dossiê CEAP por parlamentar |
| `getDossieAurora` | southamerica-east1 | Dossiê completo 360° (16 queries paralelas) |
| `getSacanagens` | southamerica-east1 | Sacanagens detectadas (NOVO) |
| `getPoliticoDespesas` | southamerica-east1 | Despesas de um político |
| `getEmpresasPrefeiturasKPIs` | southamerica-east1 | Empresas×Prefeituras |
| `getUniverseRoster` | southamerica-east1 | Lista completa de parlamentares |
| `askVertexAgent` | southamerica-east1 | Agente Vertex AI para perguntas |
| `generateDossieOnDemand` | southamerica-east1 | Gera dossiê sob demanda |
| `processDossieJob` | southamerica-east1 | Processa fila de dossiês |
| `syncBigQueryToFirestore` | us-central1 | Sync BQ→Firestore |
| `seedUniverseRoster` | us-central1 | Seed de parlamentares |
| `stripeWebhook` | southamerica-east1 | Webhook Stripe |
| `createCheckoutSession` | southamerica-east1 | Checkout Stripe |
| `grantRole` | southamerica-east1 | Concede role a usuário |
| `listMyClaims` | southamerica-east1 | Lista claims do usuário |
| `getSprintStatus` | southamerica-east1 | Status do sprint |
| `onDiarioAtoCreated` | southamerica-east1 | Trigger Querido Diário |

---

## 6. ENGINES — MAPA COMPLETO

### Ingestão de Dados
| Engine | Arquivo | O que faz | Dependências |
|---|---|---|---|
| 02 | `engines/02_ingest_emendas.py` | Emendas CGU → BigQuery | `CGU_API_TOKEN` (opcional) |
| 10 | `engines/10_universal_crawler.py` | Querido Diário → Firestore | Firestore |
| 14 | `engines/14_ingest_senadores.py` | Senadores → BigQuery | BigQuery |
| 15 | `engines/15_ingest_pncp.py` | PNCP contratos → BigQuery | BigQuery |
| 17 | `engines/17_ingest_siop_budget.py` | SIOP orçamento → BigQuery | BigQuery |
| 18 | `engines/18_ingest_pncp_pca.py` | PNCP PCA → BigQuery | BigQuery |

### Análise e Classificação
| Engine | Arquivo | O que faz | Dependências |
|---|---|---|---|
| 27 | `engines/27_ceap_prisma_piloto.py` | 12 prismas CEAP (Benford etc) | BigQuery + Firestore |
| 26 | `engines/26_ceap_dossier.py` | Dossiê CEAP completo | BigQuery |
| 40 | `engines/40_gemma_classifier_ceap.py` | Classificação CEAP via Gemma | GPU L4 + Ollama |
| 40 | `engines/40_gemma_worker_continuo.py` | Worker contínuo Gemma | GPU L4 + Ollama |
| 41 | `engines/41_gemma_burner_imediato.py` | Burner imediato Gemma | GPU L4 + Ollama |

### Sincronização
| Engine | Arquivo | O que faz |
|---|---|---|
| 05 | `engines/05_sync_bodes.py` | BigQuery → Firestore (alertas + politicos) |
| 06 | `engines/06_sync_context_socio.py` | Contexto socioeconômico |
| 17 | `engines/17_engine_sync.py` | Sync geral |

### Forense
| Engine | Arquivo | O que faz |
|---|---|---|
| 07 | `engines/07_gemini_translator.py` | Traduz alertas via Gemini |
| 11 | `engines/11_ghost_hunter.py` | Caça fantasmas (empresas) |
| 12 | `engines/12_family_ties.py` | Laços familiares |
| 30 | `engines/30_ocr_documental.py` | OCR de documentos |

### Ferramentas Aurora (VM L4)
| Tool | Arquivo | O que faz |
|---|---|---|
| Burner v4 | `tools/aurora/burner_v4_nero.py` | 6 streams Ollama + Vertex |
| Crawlers | `tools/aurora/crawlers_nero.py` | 30 crawlers async |
| PNCP | `tools/aurora/pncp_classifier.py` | Classificação PNCP |
| Emendas | `tools/aurora/emendas_resolver.py` | Grafo de emendas |

---

## 7. FRONTEND — PÁGINAS E STATUS

### Stack Frontend
- React 19 + Vite + Tailwind + React Router
- Diretório: `frontend/`
- Build: `cd frontend && npm run build`
- Deploy: `firebase deploy --only hosting`

### Páginas Principais
| Página | Arquivo | Status |
|---|---|---|
| Landing | `pages/LandingPage.jsx` | ✅ Funciona |
| Painel | `pages/PainelPage.jsx` | ⚠️ Pulso CEAP zerado |
| Dossiê | `pages/DossiePage.jsx` | ✅ Funciona (16 seções) |
| Político | `pages/PoliticoPage.jsx` | ✅ Funciona |
| Risco | `pages/RiscoPage.jsx` | ✅ Corrigido (594 parlamentares) |
| Emendas | `pages/EmendasPage.jsx` | ⚠️ Vazio (falta dados 2023+) |
| Patrimônio | `pages/PatrimonioPage.jsx` | ✅ Funciona |
| Viagens | `pages/ViagensPage.jsx` | ⚠️ Verificar dados |
| Nepotismo | `pages/NepotismoPage.jsx` | ✅ Funciona |
| Gabinete | `pages/GabinetePage.jsx` | ⚠️ Verificar dados |
| Mapa | `pages/MapaPage.jsx` | ⚠️ Depende do sync_bodes |
| Universo | `pages/UniversoPage.jsx` | ✅ Funciona |
| Alertas | `pages/AlertasPage.jsx` | ⚠️ Depende do sync_bodes |

### Hooks de Dados
| Hook | Arquivo | Cloud Function |
|---|---|---|
| `usePainelData` | `hooks/usePainelData.js` | `getDashboardKPIs` |
| `useDashboardKPIs` | `hooks/useDashboardKPIs.js` | `getDashboardKPIs` |
| `useDossieAurora` | `hooks/useDossieAurora.js` | `getDossieAurora` |
| `useDossieCeapKPIs` | `hooks/useDossieCeapKPIs.js` | `getDossieCeapKPIs` |

---

## 8. PIPELINE GO-LIVE — EXECUTAR NESTA ORDEM

```bash
# 0. Auth (JÁ FEITO se seguiu seção 2)
export GOOGLE_APPLICATION_CREDENTIALS="/home/manusalt13/transparenciabr/key.json"

# 1. Atualizar repo
cd ~/transparenciabr && git pull origin main

# 2. Instalar deps Python
cd engines && pip install -r requirements.txt && cd ..

# 3. Smoke test
python3 engines/99_gcp_smoke_check.py

# 4. Ingestão de emendas 2023-2025
python3 engines/02_ingest_emendas.py

# 5. Classificação CEAP (12 prismas)
python3 engines/27_ceap_prisma_piloto.py --deputado-id 220645 --gravar-alertas --merge-report

# 6. Sync BigQuery → Firestore
python3 engines/05_sync_bodes.py

# 7. Deploy Cloud Functions
cd functions && npm install --legacy-peer-deps && cd ..
firebase deploy --only functions --force --project transparenciabr

# 8. Validação
bq query --use_legacy_sql=false 'SELECT EXTRACT(YEAR FROM data_emenda) AS ano, COUNT(*) AS total FROM transparenciabr.transparenciabr.emendas GROUP BY 1 ORDER BY 1 DESC LIMIT 5'
bq query --use_legacy_sql=false 'SELECT COUNT(DISTINCT nome_parlamentar) AS parlamentares FROM transparenciabr.transparenciabr.ceap_despesas'
```

---

## 9. REGRAS DE CUSTO (FINOPS)

| Recurso | Budget | Regra |
|---|---|---|
| Vertex AI Pro (Gemini 2.5 Pro) | Apenas score ≥ 92 | Forense profundo |
| Vertex AI Flash | Score ≥ 85 | Alto risco |
| Ollama local (L4) | Score < 85 | Bulk (R$0) |
| BigQuery query > 1TB | REQUER aprovação | Nunca `SELECT *` em tabelas > 1GB |
| VM L4 | ~R$4.000/mês | Preemptible para 2ª instância |

### Pirâmide de Custo CEAP
```
BASE 100% (~600k notas)     → Regex score Python (R$0)
TOP 30% (~180k)             → Gemma 27B local L4 (~R$0)
TOP 10% (~60k)              → Vertex Flash (~R$6)
TOP 1% (~6k)                → Vertex Pro (~R$30)
```

---

## 10. REFERÊNCIAS RÁPIDAS

### IDs Importantes
- Erika Hilton (deputada): ID `220645`
- Emendas tipos: RP6 (individual), RP7 (bancada), RP8 (comissão), RP9 (relator), RP99 (PIX)

### Deputados do Pará (piloto)
Airton Faleiro-PT, Andreia Siqueira-MDB, Antonio Doido-MDB, Celso Sabino-UNIÃO, Delegado Caveira-PL, Delegado Eder Mauro-PL, Dilvanda Faro-PT, Dra Alessandra Haber-MDB, Elcione-MDB, Henderson Pinto-MDB, Joaquim Passarinho-PL, Júnior Ferrari-PSD, Keniston-MDB, Olival Marques-MDB, Priante-MDB, Raimundo Santos-PSD, Renilce Nicodemos-MDB

### Severidade de Alertas
| Critério | Nível |
|---|---|
| Mesmo CNPJ em emenda e CEAP | ALTO |
| >40% emendas para 1 município | CRITICO |
| Emenda saúde + fornecedor divulgação CEAP | ALTO |
| Pagamento > R$500/habitante | ABSURDO |
| Pagamento > R$100/habitante | CRITICO |

---

## 11. O QUE NÃO FAZER

1. **NÃO clone o repo** — já está aqui
2. **NÃO crie projetos GCP** — use `transparenciabr` e `projeto-codex-br`
3. **NÃO use `fiscallizapa`** como projeto — é legado, use `transparenciabr`
4. **NÃO rode `SELECT *`** em tabelas grandes
5. **NÃO gaste Vertex Pro** em classificação bulk — use a pirâmide
6. **NÃO use dados mock** — sempre dados reais
7. **NÃO esqueça o `--force`** no firebase deploy
