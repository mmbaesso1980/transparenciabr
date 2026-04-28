# 🧠 MEMORIES — Agente Autônomo G.O.A.T. | TransparênciaBR
> Arquivo de memória persistente do agente. Atualizar ao fim de cada operação.
> Localização canônica: `.cursor/MEMORIES.md` no repo `mmbaesso1980/transparenciabr`
> ⚠️ O projeto canônico é **transparenciabr** — NUNCA usar fiscallizapa ou fiscalizapa como referência de destino.
> Última atualização: 2026-04-27

---

## ⚡ ATIVAÇÃO — O QUE “LIGAR” NA PRÁTICA

O MEMORIES **não** é um ficheiro de feature flags: “ativar tudo” significa **concluir o checklist abaixo** (env + deploy + fases). Itens já embutidos no repositório não precisam de toggle.

### Já está no código (sem flag extra)

| Área | Onde |
|------|------|
| Créditos GOD (`manusalt13@gmail.com`) + 300/dia para demais | `frontend/src/lib/firebase.js` — `ensureUsuarioDoc` |
| Motor IA único Gemini 2.5 / Líder Supremo `agent_1777236402725` | `functions/index.js`, `functions/src/genkit.config.js`, `functions/src/radar/diarioScanner.js` |
| CEAP sem `[object Object]` / `urlDocumento` | `frontend/src/utils/dataParsers.js`, `CeapMonitorSection.jsx` |

### Checklist para produção “ligada”

1. **Frontend (Vite / Hosting):** preencher **todas** as `VITE_FIREBASE_*` no build (CI ou `.env.production.local`). Sem isso Auth/Firestore ficam desativados (`HAS_FULL_FIREBASE_CONFIG`).
2. **Firebase:** projeto alvo de deploy **`fiscallizapa`** (dois L) — é o *target* do Hosting/Functions, não o nome do repositório Git.
3. **Cloud Functions:** definir secrets/env `GEMINI_API_KEY` ou `GOOGLE_API_KEY`, `STRIPE_*` se checkout, `RADAR_OWNER_UID` se usar scanner de diário, etc. — **nunca** commitar chaves.
4. **APIs externas:** `PORTAL_API_KEY` (scripts/ETL), BigQuery/GCP conforme engines — ver secção **VARIÁVEIS DE AMBIENTE**.
5. **Roadmap funcional:** correções listadas em **BUGS CONHECIDOS** e **PRÓXIMAS FASES** são trabalho incremental (slug dossiê, Asmodeus default, SEO, RP6, etc.), não um único deploy.

### Itens do MEMORIES que dependem de execução (não de “ativar” no repo)

- Gerar `AUDITORIA.md` / Fase 0 quando for política do sprint.
- Componentes referidos em versões antigas do doc (ex.: `PoliticoPage.jsx`, `CreditGate`) podem não existir neste snapshot do repo — **sempre verificar o caminho no Git antes de assumir**.

---

## 🗂️ IDENTIDADE DO PROJETO

- **Nome:** TransparênciaBR / FiscalizaPA
- **Repositório canônico:** `mmbaesso1980/transparenciabr`
- **Missão:** Plataforma de transparência política brasileira — rastreamento de emendas parlamentares, gastos CEAP, votações nominais e auditorias forenses de nepotismo/superfaturamento
- **Motor de scoring:** Protocolo A.S.M.O.D.E.U.S.
- **NUNCA expor** "Asmodeus" em código/UI público → usar "Motor Forense TransparênciaBR"
- **Conta master Firebase:** UID `X8cHski54Dd6FiHULRJSk3Mjbol2`
- **Firebase target:** `fiscallizapa` (double L — apenas o target de deploy, não o nome do repo)

---

## ⚙️ STACK ATUAL

```
Frontend:    React + Vite (artefatos em frontend/dist/)
Hosting:     Firebase Hosting (target: fiscallizapa — double L)
Backend/DB:  Firebase Firestore + Cloud Functions (GCP)
Data WH:     BigQuery (codex-br / projeto-codex-br)
CI/CD:       GitHub Actions (mmbaesso1980/transparenciabr)
Mapa:        MapLibre GL JS (migrado do Leaflet)
UI:          Tailwind CSS, Cabinet Grotesk + Satoshi, glassmorphism
Auth:        Firebase Authentication
Engines:     Python scripts (engines/01–25)
Logo:        Orbe Colorido (3 anéis) — já corrigido com useId()
Design ref:  data.gov.uk: Fraunces serif hero, mint #eef5f0, forest green #1B5E3B
```

---

## ✅ O QUE JÁ EXISTE (Implementado)

- Rankings Top 10 / Bottom 10 (Câmara)
- Páginas de dossiê por parlamentar (`DossiePage.jsx`)
- `PoliticoPage.jsx` com tabs de emendas, CEAP, votações
- Login funcionando (Firebase Auth)
- Galaxy3D (visualização de nós 3D)
- Motor Asmodeus (`calculateAsmodeusScore` em Cloud Functions)
- CEAP / gastos nota a nota
- Protocolo Sangue e Poder (engines 15 e 16)
- Operação D.R.A.C.U.L.A. (engines 17 e 18) ✅
- Módulo E.S.P.E.C.T.R.O. (engines 24 e 25) ✅ — bússola política 2D
- MapLibre GL JS (migrado) — aguardar validação 60fps mobile

---

## 🐛 BUGS CONHECIDOS / PENDENTES

| Bug | Prioridade | Status |
|---|---|---|
| "Politician not found" em dossiês — lookup por slug (`politicos` / `parlamentares`) após falha por ID | CRÍTICA | 🟠 Parcial (frontend) |
| Scores Asmodeus defaultando para 100 após ETL | CRÍTICA | 🔴 Pendente |
| SEO zero — mesma meta tag genérica em todas as páginas | ALTA | 🟠 Pendente |
| Apenas Emendas PIX cobertas — faltam RP6, RP7, RP8 | ALTA | 🟠 Pendente |
| Senadores sem cobertura completa | ALTA | 🟠 Pendente |
| Sem agenda do dia (Câmara e Senado) | MÉDIA | 🟡 Pendente |
| Build com erros de auth Firebase no deploy | ALTA | 🟠 Pendente |
| ProjetosSection: `idLegislatura=57` retorna 400 | ALTA | 🟠 Pendente |
| CreditGate: `PREVIEW_COUNT` deve ser 4 (está 3) | MÉDIA | 🟡 Pendente |
| Créditos "Missing or insufficient permissions" | ALTA | 🟠 Pendente |
| Componentes órfãos não removidos: AlertDashboard, AttendanceCard, CreditWallet, ChatIA, EmptyState | BAIXA | 🟡 Pendente |

### Fixes Documentados

**Fix "Politician not found":**
```javascript
const isNumeric = /^\d+$/.test(param)
const docRef = isNumeric
  ? db.collection('parlamentares').doc(param)
  : db.collection('parlamentares').where('slug', '==', param).limit(1)
```

**Fix Asmodeus score 100:**
```javascript
// Substituir: valor ?? 100  →  valor ?? 0
// Substituir: valor || 100  →  valor || 0
```

**Fix ProjetosSection (idLegislatura=57 → 400):**
```javascript
// Remover: const LEGISLATURA_ATUAL = 57
// URL correta: /api/v2/proposicoes?idDeputadoAutor={id}&ano=2023&ano=2024&ano=2025&ano=2026&itens=100&pagina=${p}
```

**Fix Créditos (creditsFirestore.js linha 45):**
```javascript
creditos_bonus: 5  →  creditos_bonus: 10
```

**Fix VITE_FIREBASE_MESSAGING_SENDER_ID:** número de 12 dígitos — NÃO email.

---

## 🗄️ ARQUITETURA DE DADOS

### Firestore Collections
| Coleção | Chave | Descrição |
|---|---|---|
| `parlamentares` | `String(idDeputado)` ou `"SEN-{codigo}"` | Perfil completo desnormalizado |
| `emendas_pix` | `nrEmenda` | Emendas Transferências Especiais (RP99) |
| `alertas_bodes` | auto | Resultados consolidados dos motores forenses |
| `alertas_saude` | auto | Alertas da Operação D.R.A.C.U.L.A. (engine 17) |
| `oss_contratos` | auto | Contratos OSS analisados (engine 18) |
| `espectro_scores` | `parlamentar_id` | Scores do Módulo ESPECTRO (engines 24/25) |
| `voting_clusters` | `cluster_id` | Bancadas reais por co-votação (engine 25) |
| `usuarios` | `UID Firebase` | Permissões + saldo de créditos |
| `diarios_atos` | auto | Textos extraídos de Diários Oficiais |
| `denuncias` | auto | Denúncias de cidadãos (status: PENDENTE) |

### Esquema Canônico de Parlamentar
```javascript
{
  id: String,           // idDeputado ou "SEN-{codigo}"
  casa: 'CAMARA'|'SENADO',
  nome: String,
  slug: String,         // ex: "nikolas-ferreira"
  siglaPartido: String,
  uf: String,
  fotoUrl: String,
  scoreAsmodeus: Number|null,
  flags: String[],
  _atualizadoEm: Timestamp
}
// Campos a unificar: deputado_id/idDeputado → id | foto_url/urlFoto → fotoUrl | siglaUf/estado → uf
```

### BigQuery — Tabelas Core
```sql
dim_parlamentar      -- id_parlamentar, casa, nome_completo, partido, uf, foto_url
dim_municipio        -- cod_ibge (7 dígitos), nome, uf, latitude, longitude, populacao
fato_emenda_pix      -- id_emenda, id_parlamentar, cod_ibge, valor_indicado/empenhado/pago
fato_emenda_rp6      -- id_emenda, id_parlamentar, cod_ibge, acao_orcamentaria, valores
fato_votacao         -- id_votacao, casa, data, resultado, votos_sim/nao/abstencao
fato_voto            -- id_votacao, id_parlamentar, voto (SIM|NAO|ABSTENCAO|AUSENTE)
fato_despesa_ceap    -- id_deputado, mes, ano, tipo_despesa, cnpj_cpf, valor_liquido
political_spectrum   -- parlamentar_id, score_economico, score_social, ics, quadrante
alliance_map         -- cluster_id, cohesion_score, membros[], temas_coesos[]
health_anomalies     -- CNPJ, valor_total, score_fantasma, nivel_alerta (engine 17)
oss_anomalias        -- id_contrato, oss_nome, indice_corrupcao, clausulas_suspeitas (engine 18)
```

### Views Materializadas (BigQuery)
```sql
vw_emendas_pix_mapa       -- JOIN emendas + municípios + parlamentar → para o mapa choroplético
vw_ranking_custo_parlamentar -- salário_anual + total_ceap + total_emendas_pix_pagas
```

---

## 🔬 MOTORES FORENSES (engines/)

| # | Nome | Descrição | Status |
|---|---|---|---|
| 01–06 | ETL Base | Ingestão parlamentares, CEAP, emendas PIX/RP6 | ✅ |
| 07 | gemini_translator | Circuit Breaker + análise Gemini de documentos | ✅ |
| 08–10 | Análise CEAP | Lei de Benford, padrões de fraude | ✅ |
| 11–12 | Votações | Módulo E.S.P.E.C.T.R.O., alinhamento partidário | ✅ |
| 13–14 | Protocolo F.L.A.V.I.O. | Rachadinhas, funcionários fantasmas | ✅ |
| 15–16 | Sangue e Poder | Nepotismo, cruzamento familiar + QSA | ✅ |
| **17** | **health_scanner** | **D.R.A.C.U.L.A.: CNAE saúde + ANVISA + Lab Fantasma** | **✅** |
| **18** | **oss_scanner** | **D.R.A.C.U.L.A.: OSS + Gemini + Índice Corrupção** | **✅** |
| 19–21 | (reserva) | Próximos motores | 🔲 |
| 22–23 | Projeto I.R.O.N.M.A.N. | LGPD + Kill Switch + neutralidade | ✅ |
| **24** | **spectrum_analyzer** | **ESPECTRO: eixo eco×social por votações nominais** | **✅** |
| **25** | **alliance_scanner** | **ESPECTRO: co-votação, k-means, bancadas reais** | **✅** |

---

## 🧭 MÓDULO E.S.P.E.C.T.R.O. (engines 24–25)
**E.S.P.E.C.T.R.O.** = Escala de Posicionamento Estocástico e Classificação Técnica de Representantes e Orientações

- **Data:** 2026-04-09 | **Fase:** 11 | **Status:** ✅ Implementado
- Engines 22–23 = Projeto IRONMAN (reservados)

### Eixos (0–100 cada)
- **Econômico:** 0 = Estatizante extremo → 100 = Liberal extremo
- **Social/Cultural:** 0 = Conservador extremo → 100 = Progressista extremo

### Fontes e Pesos
| Fonte | Peso |
|---|---|
| Votações nominais (Câmara API) | 50% |
| Proposições de autoria | 25% |
| Discursos plenário (keywords) | 15% |
| Histórico de emendas destinadas | 10% |

### ICS (Índice de Confiança do Score)
```
ICS = min(votos_analisados / 50, 1.0) * 100
ICS ≥ 80 → Alta confiança | 50–79 → Média | < 50 → Insuficiente
```

### Arquivos
- `engines/24_spectrum_analyzer.py` — CLI: `--dep-id`, `--partido`, `--dry-run`, `--since`
- `engines/25_alliance_scanner.py` — k-means k=8, cohesion_score por cluster
- `frontend/src/components/PoliticalCompass.jsx` — scatter plot 2D, hover, comparador
- `frontend/src/pages/EspectroPage.jsx` — rota `/espectro`

### Quadrantes (cores)
```jsx
LIB_PROG:  "#6366f1"   // Liberal Progressista
LIB_CONS:  "#f59e0b"   // Liberal Conservador
EST_PROG:  "#10b981"   // Estatizante Progressista
EST_CONS:  "#ef4444"   // Estatizante Conservador
```

---

## 🏥 OPERAÇÃO D.R.A.C.U.L.A. + Protocolo A.F.R.O.D.I.T.E. (engines 17–18)
- **Data:** 2026-04-08 | **Fase:** 10 | **Status:** ✅ Implementado

### CNAEs de Saúde Cobertos (16)
```
8610-1/01 · Hospital (geral)        8640-2/01 · Lab. anatomia patológica
8610-1/02 · Pronto-socorro          8640-2/02 · Laboratório clínico
8621-6/01 · UTI Móvel               8640-2/03 · Diálise / Nefrologia
8621-6/02 · Urgência móvel          8640-2/99 · Diagnóstico complementar
8630-5/01 · Ambulatório c/ cirurgia 8650-0/01 · Fisioterapia
8630-5/02 · Ambulatório c/ exames   8650-0/99 · Outros serviços humanos
8630-5/03 · Consultório médico      8630-5/06 · Vacinação / Imunização
8630-5/08 · Terapia ocupacional     8711-5/02 · Clínica de repouso
```

### Algoritmo Laboratório Fantasma (engine 17)
```
🚩 +30pts → Recebe > R$ 1M em contratos públicos
🚩 +40pts → SEM autorização ANVISA ativa (DATAVISA)
🚩 +25pts → Porte ME/EPP com contratos de alto volume
🚩 +20pts → Empresa aberta < 1 ano antes do 1º contrato

Threshold: 2+ bandeiras E score ≥ 50 → gera alerta
score ≥ 85 → NIVEL_5 | score ≥ 65 → ALTA | score ≥ 50 → MEDIA
```
ANVISA API: `https://consultas.anvisa.gov.br/api/consulta/empresas?cnpj={cnpj}`

### Padrões OSS Suspeitos (engine 18)
```
1. repasse_emergencial  (+35pts)
2. prestacao_fraca      (+30pts)
3. subcontratacao_livre (+25pts)
4. reajuste_automatico  (+20pts)
5. sem_devolucao        (+25pts)
6. meta_vaga            (+20pts)
```

### Protocolo A.F.R.O.D.I.T.E. — CSS Variables
```css
--afrodite-clean:  #00f5d4   /* Verde Médico */
--dracula-red:     #ff0054   /* Carmesim Pulsante */
--dracula-bg:      #0a0a1e   /* Fundo escuro */
/* .glass → blur(25px) | .glass-medical → verde | .glass-alert → carmesim */
```

### Arquivos DRACULA
| Arquivo | Tipo |
|---|---|
| `engines/17_health_scanner.py` | NOVO |
| `engines/18_oss_scanner.py` | NOVO |
| `frontend/src/components/SankeyChart.jsx` | NOVO |
| `frontend/src/pages/HealthMap.jsx` | NOVO (reimplementar com dados reais) |
| `frontend/src/index.css` | ATUALIZADO — paleta AFRODITE |
| `frontend/src/components/Layout.jsx` | ATUALIZADO — 5 orbs + parallax |

---

## 🎨 CURSOR SCRIPT v4 — PoliticoPage (Tarefas Prioritárias)

### Regras Absolutas
- NUNCA expor "Asmodeus" em código/UI público → "Motor Forense TransparênciaBR"
- Chaves de API SEMPRE em env vars
- Banco = projeto "codex" / "fiscallizapa" (double L — apenas no Firebase)

### Ordem de Execução
| # | Tarefa | Arquivos |
|---|---|---|
| 1 | LIMPEZA — remover MOCK_VOTES, CEAP simulado, links sociais falsos | DossiePage.jsx |
| 2 | LIMPEZA — remover componentes órfãos + seção Fretamento | Vários |
| 3 | LIMPEZA — remover páginas mock (HealthMap fake, AlertasPage stub) | App.jsx, Navbar.jsx |
| 4 | BUG — ProjetosSection: fix idLegislatura | ProjetosSection.jsx |
| 5 | BUG — CreditGate: PREVIEW_COUNT = 4 | CreditGate.jsx |
| 6 | BUG — Créditos "Missing or insufficient permissions" | useCreditSystem.js, creditsFirestore.js |
| 7 | FEATURE — Emendas: sufixo M/K + cidades destino com ranking | EmendasAba.jsx |
| 8 | FEATURE — Proposições: autor + relator + taxa aprovação | ProjetosSection.jsx |
| 9 | FEATURE — Gabinete scraping via Cloud Function | Nova CF + VerbaGabineteSection.jsx |
| 10 | VISUAL — Redesign PoliticoPage limpa como DossiePage | PoliticoPage.jsx |

### Formatação de Valores
```javascript
function fmtEmenda(v) {
  if (Math.abs(v) >= 1_000_000) return "R$ " + (v/1_000_000).toFixed(2) + "M"
  if (Math.abs(v) >= 1_000) return "R$ " + (v/1_000).toFixed(1) + "K"
  return v.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})
}
```

### Componentes Órfãos a Deletar
```
frontend/src/components/AlertDashboard.jsx    ← não importado
frontend/src/components/AttendanceCard.jsx    ← não importado
frontend/src/components/CreditWallet.jsx      ← não importado
frontend/src/components/ChatIA.jsx            ← não importado
frontend/src/components/EmptyState.jsx        ← não importado
frontend/src/components/AlertasFretamento.jsx ← remover após confirmar não usado
```

### Páginas Mock a Remover
- `HealthMap.jsx` — 100% dados simulados (MOCK_HEALTH_UNITS, MOCK_HEALTH_SCORES, MOCK_SANKEY_DATA)
  - **Atenção:** Quando reimplementado com dados reais (DRACULA), criar do zero
- `AlertasPage.jsx` — stub de 993 bytes, verificar antes de remover
- `ComparadorPage.jsx` — verificar se usa dados mock

---

## 🏆 ANÁLISE COMPETITIVA — DeOlhoEmVoce.com.br

### Stack do Concorrente (Engenharia Reversa)
| Camada | Tecnologia | Brecha |
|---|---|---|
| Framework | Next.js 14+ App Router | ISR leve |
| Mapa | **Leaflet + GeoJSON bruto** | **Lag em mobile — nossa maior vantagem** |
| UI | Tailwind + shadcn/ui | — |
| Banco | PostgreSQL (Supabase/Neon) | Sem BigQuery/data warehouse pesado |
| SEO | **Meta tags genéricas em todas as páginas** | **Não indexa por nome do parlamentar** |

### Gap Estratégico — O Que Eles NÃO Têm
| Tipo | Código | Nossa Vantagem |
|---|---|---|
| Emendas Individuais Impositivas | RP6 | Alta — têm finalidade rastreável |
| Emendas de Bancada Estadual | RP7 | Alta — recorte por UF |
| Emendas de Comissão | RP8 | Alta |
| Emendas de Relator (extintas) | RP9 | Histórico 2020-2022 não indexado |
| Protocolo Asmodeus | — | Diferencial absoluto |
| Nepotismo/Superfaturamento | — | Diferencial absoluto |
| Bússola política (ESPECTRO) | — | Diferencial absoluto |

### Estratégia de Mapa — Superação
- **Abordagem 1 (rápida):** MapLibre + GeoJSON simplificado (Mapshaper 5%) → ~3–5MB → 60fps mobile
- **Abordagem 2 (gold standard):** PMTiles (tippecanoe) no Cloud Storage + deck.gl para torres 3D
- **Paleta:** ColorBrewer YlOrRd (substitui verde/vermelho — acessível para daltônicos)

### Rotas do Concorrente (Referência)
```
/ | /emendas-pix | /cota-parlamentar | /deputy/{id} | /senator/{id}
/voting/{id} | /votings | /ranking | /analises | /about
```

### SEO — Nossa Arma (react-helmet-async)
```jsx
<title>{parlamentar.nome} ({partido}-{uf}) — Emendas, Gastos e Votações | TransparênciaBR</title>
<meta name="description" content={`${nome} enviou ${totalEmendas} em emendas e gastou ${totalCEAP}...`} />
<meta property="og:image" content={parlamentar.fotoUrl} />
<link rel="canonical" href={`https://transparenciabr.com.br/dossie/${parlamentar.slug}`} />
```

### Estratégia Voto no Mapa (2 fases)
1. **Sprint 1:** Por UF (rápido, sem TSE) — pinta mapa por % Sim da bancada estadual
2. **Sprint 3–4:** Base Eleitoral Municipal — DE-PARA TSE↔IBGE
   - Narrativa: *"Em Belém, o dep. com maior base eleitoral votou **Contra** X"*

---

## 💰 MODELO DE MONETIZAÇÃO

- **Freemium com créditos:** visão geral pública gratuita
- **Paywall glassmorphism** para: Laboratório Oráculo, Módulo 4 (grafos 3D), PDF gerado por IA
- **Conversão:** "200 créditos" em vez de valor monetário (reduz pain of paying)
- **Cotas diárias:** `dossies_gratuitos_restantes` renovados via Cloud Scheduler CRON
- **Pagamento:** Stripe → Firebase Webhooks → runTransaction atômica no Firestore
- **Novo usuário:** `creditos_bonus: 10` (não 5)

---

## 🔒 SEGURANÇA (Projeto I.R.O.N.M.A.N.) — engines 22–23

- **LGPD Shield:** SHA-256 anonimização de PII encontrada nos crawlers (CPFs, emails de civis)
- **Security Rules:** `isValidCreditDeduction()` — créditos só decrementam, nunca incrementam pelo cliente
- **Kill Switch:** painel admin para imobilizar motores em caso de falsos positivos em massa
- **Neutralidade:** Índice de Cobertura Proporcional (ICP) + Coeficiente de Gini por partido

---

## 📡 ARSENAL COMPLETO DE APIs

### APIs Legislativas
| API | URL Base | Uso |
|---|---|---|
| Câmara dos Deputados | `https://dadosabertos.camara.leg.br/api/v2` | Parlamentares, votações, CEAP, proposições, agenda |
| Senado Federal | `https://legis.senado.leg.br/dadosabertos` | Senadores, agenda, votações, despesas |

**Endpoints críticos Câmara:**
- `GET /deputados/{id}/despesas` — CEAP item a item
- `GET /deputados/{id}/votacoes` — votações do parlamentar
- `GET /deputados/{id}/eventos` — agenda individual
- `GET /votacoes/{id}/votos` — voto de cada deputado
- `GET /eventos` — agenda geral por data (AgendaDoDia)
- `GET /proposicoes?idDeputadoAutor={id}&ano=2023&ano=2024&ano=2025&ano=2026&itens=100&pagina={p}` — proposições SEM idLegislatura

**Endpoints críticos Senado:**
- `GET /senador/{codigo}/votacoes`
- `GET /plenario/votacoes/{ano}`
- `GET /agenda/{data}` — Agenda do Dia Senado

### APIs de Controle e Transparência
| API | URL Base | Auth | Uso |
|---|---|---|---|
| Portal Transparência (CGU) | `https://api.portaldatransparencia.gov.br/api-de-dados` | API Key gratuita | CEAP, contratos, emendas RP6-99, CEIS, CNEP |
| Transferegov (Emendas PIX) | `https://docs.api.transferegov.gestao.gov.br/transferenciasespeciais` | Não | Emendas RP99 por parlamentar/município |
| TCU Webservices | `https://contas.tcu.gov.br/ords/api/publica` | Não | Acórdãos, sanções, CADIRREG, inabilitados |
| PNCP | `https://pncp.gov.br/api/pncp/v1` | Não | Contratos, licitações, PCA (detectar fraudes antes da licitação) |
| ANVISA DATAVISA | `https://consultas.anvisa.gov.br/api/consulta/empresas` | Não | Autorização sanitária por CNPJ |

### APIs de Dados Geográficos e Contexto
| API | URL | Uso |
|---|---|---|
| IBGE Localidades | `https://servicodados.ibge.gov.br/api/v1/localidades/municipios` | 5.570 municípios com cod IBGE |
| IBGE GeoJSON BR | `.../api/v3/malhas/paises/BR?resolucao=municipio&formato=geojson` | Geometria todos os municípios |
| IBGE SIDRA | `https://apisidra.ibge.gov.br/values/t/{tabela}/n6/all/v/{var}/p/{periodo}` | t/9514=Censo, t/6579=Pop, t/7358=Mortalidade, t/6691=PIB |
| BrasilAPI | `https://brasilapi.com.br/api` | CEP, CNPJ, bancos, câmbio, PIX |
| OpenCNPJ | `https://api.opencnpj.org/{cnpj}` | CNPJ + CNO gratuito |
| Minha Receita | `https://minhareceita.org/{cnpj}` | Dados Receita Federal formatados |

### APIs de Empresas e Cadastros
| API | URL | Uso |
|---|---|---|
| Receita Federal Dados Brutos | `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/` | ~85GB todos os CNPJs |
| Brasil.IO QSA | `https://brasil.io/api/dataset/socios-brasil/empresas/data/?cnpj=` | Sócios e administradores |
| TSE Dados Abertos | `https://dadosabertos.tse.jus.br` | Candidatos, votação por município/zona, doadores |

### APIs de Saúde e Contexto Social
| API | URL | Uso |
|---|---|---|
| CNES Web | `https://cnes.datasus.gov.br` | Estabelecimentos, leitos por município |
| ElastiCNES | `https://elasticnes.saude.gov.br` | Dashboard leitos SUS |
| OpenDataSUS | `https://opendatasus.saude.gov.br/dataset` | Dados abertos SUS |
| Atlas Brasil (PNUD) | `http://www.atlasbrasil.org.br` | IDH por município (1991–2021), 200+ indicadores |
| SINISA/SNIS | `https://app4.mdr.gov.br/serieHistorica/` | Saneamento por município (1995–2023) |
| Educação Inteligente | `http://educacao.dadosabertosbr.org/api` | Escolas, IDEB por município |
| IVS IPEA | `https://ivs.ipea.gov.br/` | Índice de Vulnerabilidade Social por município |

### Base dos Dados (BD+) — Atalho BigQuery Público
| Dataset BigQuery | Fonte | Cobertura |
|---|---|---|
| `basedosdados.br_ibge_censo_demografico` | IBGE | Censo 2022 |
| `basedosdados.br_ibge_populacao` | IBGE | Estimativas populacionais anuais |
| `basedosdados.br_ibge_pib` | IBGE | PIB municipal anual |
| `basedosdados.br_inep_ideb` | INEP | IDEB histórico por escola e município |
| `basedosdados.br_mdr_snis` | SNIS | Saneamento por município |
| `basedosdados.br_me_rais` | RAIS | Empregos formais desde 1985 |
| `basedosdados.br_ms_cnes` | DATASUS/CNES | Estabelecimentos e leitos de saúde |
| `basedosdados.br_tse_eleicoes` | TSE | Resultados eleitorais 1994–atual |
| `basedosdados.br_dou` | DOU | Diário Oficial da União estruturado |
| `basedosdados.br_bd_diretorios_brasil.municipio` | BD+ | DE-PARA todos os códigos (IBGE, TSE, Receita, BC) |

**Exemplo JOIN multi-fonte por município (Pará):**
```sql
SELECT m.nome AS municipio, m.sigla_uf, p.populacao,
       i.ideb_anos_finais_2023, s.indice_atendimento_esgoto
FROM `basedosdados.br_bd_diretorios_brasil.municipio` m
LEFT JOIN `basedosdados.br_ibge_populacao.municipio` p USING (id_municipio)
LEFT JOIN `basedosdados.br_inep_ideb.municipio` i USING (id_municipio)
LEFT JOIN `basedosdados.br_mdr_snis.municipio_agua_esgoto` s USING (id_municipio)
WHERE m.sigla_uf = 'PA'
ORDER BY p.populacao DESC
```

### Diários Oficiais
| API | URL | Uso |
|---|---|---|
| INLABS (DOU) | `https://inlabs.in.gov.br` | PDF + XML do DOU desde 2020 (cadastro gratuito) |
| Querido Diário (OKBR) | `https://queridodiario.ok.org.br/api/` | +2.700 municípios, busca full-text, 60 req/min |

### Rate Limits Resumidos
| API | Limite |
|---|---|
| Portal Transparência (CGU) | 500 req/hora |
| Querido Diário | 60 req/min |
| BrasilAPI | 100 req/min |
| NewsAPI | 100 req/dia (free) |
| SIOP/SIAFI | Certificado Digital, dias úteis |

### Prioridade de Implementação das APIs
| Prioridade | API | Motivo |
|---|---|---|
| 🔴 Imediata | PNCP (PCA) | Detectar fraudes ANTES da licitação |
| 🔴 Imediata | CGU Portal Transparência | CEIS, CNEP, contratos, emendas RP6–RP99 |
| 🔴 Imediata | TCU Webservices | Acórdãos e sanções oficiais |
| 🔴 Imediata | Base dos Dados (DE-PARA municípios) | JOIN de todos os datasets |
| 🟠 Sprint 2 | INLABS (DOU) | Monitorar portarias, contratos publicados |
| 🟠 Sprint 2 | Querido Diário | Diários municipais do Pará |
| 🟠 Sprint 2 | Senado Federal | Paridade com concorrente |
| 🟠 Sprint 2 | TSE microdados | Base eleitoral municipal |
| 🟡 Sprint 3 | CNES / ElastiCNES | Indicador de saúde por município |
| 🟡 Sprint 3 | SINISA / Base dos Dados | % população com água/esgoto |
| 🟡 Sprint 3 | INPE PRODES/DETER | Municípios em alerta ambiental |
| 🟡 Sprint 3 | OpenCNPJ / BrasilAPI CNPJ | Enriquecimento de fornecedores |
| 🟢 Futuro | NewsAPI / APITube | Cruzamento notícias + dados |
| 🟢 Futuro | Banco Mundial / OCDE | Benchmarks internacionais |

---

## 🔑 VARIÁVEIS DE AMBIENTE NECESSÁRIAS

```bash
# Firebase
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=fiscallizapa.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=fiscallizapa
VITE_FIREBASE_STORAGE_BUCKET=fiscallizapa.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID   # número 12 dígitos — NÃO email
VITE_FIREBASE_APP_ID               # formato: 1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID       # formato: G-XXXXXXXXXX

# APIs Governamentais
PORTAL_API_KEY          # portaldatransparencia.gov.br/api-de-dados
GEMINI_API_KEY          # para engines 07, 18

# GCP (scripts backend)
GOOGLE_CLOUD_PROJECT=codex-br
BIGQUERY_DATASET=projeto_codex_br
```

---

## 🚀 PRÓXIMAS FASES (Ordem de Prioridade)

### FASE 0 — Auditoria Estrutural (EXECUTAR PRIMEIRO)
1. Mapear todos os arquivos (caminho, propósito, status: OK|QUEBRADO|INCOMPLETO|DUPLICADO|MORTO)
2. Diagnosticar bugs ativos antes de qualquer mudança
3. Gerar `AUDITORIA.md` na raiz

### FASE 1 — Correções Críticas
1. Corrigir "Politician not found" (slug lookup + migração Firestore)
2. Corrigir scores Asmodeus defaultando para 100
3. Esquema canônico de Parlamentar (`src/types/parlamentar.js`)
4. Executar tarefas 1–6 do Cursor Script v4

### FASE 2 — SEO e Performance
1. `react-helmet-async`: meta tags únicas por parlamentar
2. MapLibre GL JS (já migrado — validar 60fps mobile)
3. Lazy loading + bundle < 200KB gzipped

### FASE 3 — Novas Funcionalidades
1. ETL Emendas RP6 (`scripts/ingest-emendas-rp6.js`)
2. Cobertura completa de Senadores
3. Componente `AgendaDoDia` (Câmara + Senado, refresh 5min)
4. Hotpage com 5 tabs: Emendas | Cota | Votações | Agenda | Alertas Asmodeus
5. Executar tarefas 7–10 do Cursor Script v4

### FASE 4 — Qualidade e Deploy
1. `.env.example` documentado
2. GitHub Actions CI/CD completo
3. Checklist de qualidade (10 critérios de pronto)

### Definição de Pronto (10 critérios)
1. ✅ Zero páginas "Politician not found"
2. ✅ Scores Asmodeus corretos e diferentes entre parlamentares
3. ✅ Mapa MapLibre com choropleth de Emendas PIX (60fps mobile)
4. ✅ Emendas RP6 ingeridas e exibidas (toggle PIX/RP6/Todas)
5. ✅ Senadores com hotpage completa
6. ✅ Componente AgendaDoDia funcionando
7. ✅ Hotpage com 5 tabs completas
8. ✅ Meta tags únicas por parlamentar visíveis no view-source
9. ✅ GitHub Actions deploy automático (badge verde na main)
10. ✅ Bundle inicial < 200KB gzipped

---

## 📋 REGRAS DO AGENTE

1. **Começar pela Fase 0** — NENHUMA mudança de código antes do mapeamento
2. **Nunca quebrar o deploy** — reverter imediatamente se build falhar
3. **Preservar o que funciona:** Galaxy3D, login, rankings
4. **Commit atômico por tarefa** com mensagem convencional: `fix:`, `feat:`, `perf:`, `seo:`, `chore:`
5. **Dado ausente = null/loading** — nunca placeholder inventado
6. **Variável de ambiente faltando** → documentar, pular a tarefa, continuar as demais
7. **Ordem de prioridade absoluta:** Fase 0 → 1 → 2 → 3 → 4
8. **Relatar ao fim de cada fase:** ✅ Feito | ⚠️ Parcial | 🔴 Bloqueio | ⏭️ Próximo
9. **Engines D.R.A.C.U.L.A.** (17 e 18): rodar com `--mock --dry-run` para validação
10. **Antes de qualquer mudança:** verificar se arquivo já existe no repo para não sobrescrever

---

## 📄 PROMPT COMPLETO — Cursor Agent Mode (FISCALIZAPA v2)

> Fonte: `PROMPT_CURSOR_FISCALIZAPA.md` — Abril 2026

### Contexto da Equipe de IA
Você é uma equipe de engenheiros sênior responsável pela revisão completa e evolução do projeto **TransparênciaBR / FiscallizaPA**. Stack: React+Vite, Firebase Hosting (target `fiscallizapa`), Firestore, Cloud Functions, BigQuery (`codex-br/projeto-codex-br`), MapLibre, Tailwind, Firebase Auth.

### Missão
Revisão cirúrgica total do repositório + implementação das melhorias em ordem de prioridade. Trabalhe autonomamente, arquivo por arquivo, commit por commit. Não espere aprovação para cada passo.

### FASE 0 — Auditoria Estrutural
- Listar todos arquivos com: caminho, propósito, status `[OK|QUEBRADO|INCOMPLETO|DUPLICADO|MORTO]`, dependências críticas
- Focar em: componentes React, rotas (App.jsx), Cloud Functions, scripts ETL, configs (firebase.json, .env, vite.config.js), coleções Firestore
- **Entrega:** `AUDITORIA.md` na raiz antes de qualquer mudança de código

### FASE 1 — Correções Críticas

**Bug 1 — "Politician not found":**
```javascript
// scripts/fix-parlamentares-lookup.js
const resp = await fetch('https://dadosabertos.camara.leg.br/api/v2/deputados?itens=513&ordem=ASC&ordenarPor=nome')
const { dados } = await resp.json()
const batch = db.batch()
for (const dep of dados) {
  const slug = dep.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const ref = db.collection('parlamentares').doc(String(dep.id))
  batch.set(ref, { id: String(dep.id), casa: 'CAMARA', nome: dep.nome,
    siglaPartido: dep.siglaPartido, siglaUf: dep.siglaUf,
    urlFoto: dep.urlFoto, slug, _migradoEm: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
}
await batch.commit()
```

**Bug 2 — Asmodeus score 100:**
```javascript
// Localizar em functions/src/calculateAsmodeusScore.js
// Substituir: valor ?? 100 → valor ?? 0
// Adicionar: console.log(`[Asmodeus] ${parlamentarId} | Eixo ${eixo}: ${valor}`)
```

**Bug 3 — Build auth intermitente:**
- Verificar VITE_FIREBASE_MESSAGING_SENDER_ID = número 12 dígitos, NÃO email

**Esquema canônico `src/types/parlamentar.js`:**
```javascript
// Campos a unificar no codebase inteiro:
// deputado_id / idDeputado → id
// partido_sigla → siglaPartido
// foto_url / urlFoto → fotoUrl
// estado / siglaUf / uf_eleicao → uf
```

### FASE 2 — SEO e Performance

**Meta tags únicas (react-helmet-async):**
```jsx
// npm install react-helmet-async
// Em DossieDeputado.jsx:
<Helmet>
  <title>{parlamentar.nome} ({parlamentar.siglaPartido}-{parlamentar.uf}) — Emendas, Gastos e Votações | TransparênciaBR</title>
  <meta name="description" content={`${parlamentar.nome} enviou ${totalEmendas} em emendas e gastou ${totalCEAP}. Score: ${parlamentar.scoreAsmodeus ?? 'N/A'}/100.`} />
  <meta property="og:image" content={parlamentar.fotoUrl} />
  <link rel="canonical" href={`https://transparenciabr.com.br/dossie/${parlamentar.slug}`} />
</Helmet>
```

**MapLibre GL JS — paleta ColorBrewer YlOrRd:**
```javascript
const getColor = (valor) => {
  if (!valor || valor === 0) return '#cccccc'
  if (valor < 500000)   return '#ffffb2'
  if (valor < 2000000)  return '#fecc5c'
  if (valor < 10000000) return '#fd8d3c'
  if (valor < 50000000) return '#f03b20'
  return '#bd0026'
}
// Simplificar GeoJSON: mapshaper municipios-br.geojson -simplify 5% -o municipios-br-simplificado.geojson
// META: bundle inicial < 200KB gzipped
```

### FASE 3 — ETL Emendas RP6

```javascript
// scripts/ingest-emendas-rp6.js
// Requer: PORTAL_API_KEY no .env.local
const BASE = 'https://api.portaldatransparencia.gov.br/api-de-dados'
const HEADERS = { 'chave-api-dados': process.env.PORTAL_API_KEY }
// Endpoint: /emendas/parlamentar?ano={ANO}&codigoEmenda={cod}&pagina={p}
// Salvar em BigQuery: fato_emenda_rp6 (particionado por ano, clusterizado por id_parlamentar)
// Scripts npm:
// "ingest:emendas-pix:2024": "ANO_ORCAMENTO=2024 node scripts/ingest-emendas-pix.js"
// "ingest:emendas-rp6:2024": "ANO_ORCAMENTO=2024 node scripts/ingest-emendas-rp6.js"
```

---

## 🏗️ PLANO MESTRE v2.0 — Arquitetura Forense

> Fonte: `Plano-Mestre-TransparenciaBR-v2.0.docx` — Abril 2026

### Protocolo A.S.M.O.D.E.U.S.
**A**utomação de **S**istemas de **M**onitoramento e **D**etecção de **E**squemas no **U**so de **S**ubsídios

### BigQuery — Estratégias de Otimização
- **Particionamento por tempo:** todas as Fact Tables particionadas por `DATE(data_emissao)` ou `data_assinatura` → reduz fatura em até 90% em queries temporais
- **Clusterização:** até 4 colunas de alta cardinalidade — ex: `fato_despesa_ceap` → `parlamentar_id, uf_fornecedor, cnpj_fornecedor`
- **NUNCA fazer full table scan** — falha de engenharia inaceitável

### Lei de Benford via SQL (detecção de fraude)
```sql
WITH ExtracaoDigito AS (
  SELECT CAST(SUBSTR(CAST(ABS(valor_despesa) AS STRING), 1, 1) AS INT64) AS digito
  FROM `fiscallizapa.ceap_despesas` WHERE parlamentar_id = @id
),
FreqObservada AS (
  SELECT digito, COUNT(*) / SUM(COUNT(*)) OVER() AS pct_real FROM ExtracaoDigito GROUP BY 1
),
FreqEsperada AS (
  SELECT digito, LOG10(1 + 1/digito) AS pct_esperado FROM UNNEST(GENERATE_ARRAY(1,9)) AS digito
)
SELECT o.digito, o.pct_real, e.pct_esperado,
       ABS(o.pct_real - e.pct_esperado) / e.pct_esperado AS desvio_z
FROM FreqObservada o JOIN FreqEsperada e USING(digito)
ORDER BY desvio_z DESC
-- Desvio > 30% → flag para modelos supervisionados
```

### BigQuery ML — Detecção de Anomalias
```sql
-- ARIMA_PLUS para séries temporais de gastos
CREATE OR REPLACE MODEL `fiscallizapa.modelo_anomalia_gastos`
OPTIONS(model_type='ARIMA_PLUS', time_series_timestamp_col='data',
        time_series_data_col='valor_total', DECOMPOSE_TIME_SERIES=TRUE)
AS SELECT data, SUM(valor_liquido) AS valor_total
FROM `fiscallizapa.ceap_despesas` GROUP BY data;

-- K-Means para detectar empresas de fachada (shell companies)
-- Vetores: tempo_existencia_cnpj, capital_social, freq_contratos, dist_domicilio_eleitoral
-- Fornecedores no percentil 95 da distância do centroide = risco crítico
```

### Gemini 1.5 Pro — Protocolo Oráculo
- **Circuit Breaker** (`engines/07_gemini_translator.py`): batch de 10 docs, intervalo 1.5s, exponential backoff
- **Output obrigatoriamente JSON** — nunca respostas livres
- **Detecta:** cláusulas de reajuste automático, subcontratação irrestrita, dispensa de prestação de contas

### Firestore — Design Desnormalizado
```
deputados_federais  → 1 Read por perfil (nome, partido, UF, votos TOP5, gastosCeapTotal)
alertas_bodes       → paginado, indexado por UF+Data
usuarios            → 1 Read inicial, cache no App State; saldo créditos via runTransaction
diarios_atos        → paginado por cursor, textos truncados para reduzir payload
```

**Security Rules — isValidCreditDeduction():**
```javascript
// Créditos só decrementam pelo cliente, NUNCA incrementam
// isAdmin jamais modificável pelo cliente
// Adição de créditos: APENAS via Webhooks do backend de pagamento
```

### Protocolo SANGUE E PODER (engines 15–16)
- `engines/15_family_oracle.py` — extrai cônjuges/dependentes declarados no TSE
- `engines/16_contract_collision.py` — fuzzy matching Jaccard ≥ 80% entre QSA e árvore familiar → Nível 5

### MapLibre + PMTiles (Gold Standard)
```
tippecanoe -o municipios.pmtiles -Z4 -z12 municipios-br.geojson
→ Upload: gs://fiscallizapa.appspot.com/geo/municipios.pmtiles
→ Requisições HTTP parciais = apenas geometrias visíveis na tela
```

### Monetização — Economia de Créditos
| Tier | Créditos | Acesso |
|---|---|---|
| Free | 10 créditos boas-vindas + cotas diárias | Visão geral pública |
| Paywall | Débito por uso | Laboratório Oráculo, Grafos 3D, PDF IA |
| Admin | Ilimitado | Painel kill switch, logs, métricas |

---

*Última atualização: 2026-04-27. Consolida: MEMORIES original + PROMPT_CURSOR_FISCALIZAPA.md + Plano-Mestre-v2.0 + Arsenal-APIs + Arsenal-IDH-Social + Arquitetura-Espelho + COMPILADO_ASMODEUS.*
