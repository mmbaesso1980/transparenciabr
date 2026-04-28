# ROADMAP VERTEX — TransparênciaBR (pós–Fase 1)

Documento de planeamento tático gerado por varredura do repositório corrente (`frontend/`, `functions/`, `firestore.rules`). Não substitui `.cursor/MEMORIES.md`; complementa-o com estado verificado no código.

**Última revisão:** 2026-04-27

---

## 1. Resumo executivo — estado actual

### 1.1 Frontend (`frontend/`)

| Área | Situação |
|------|----------|
| **Stack** | React 19, Vite 8, Tailwind 4, React Router 7, TanStack Query, Firebase JS SDK 11. |
| **Auth / SecOps** | Login explícito em `/login`; `AuthContext` só `onAuthStateChanged`. `firebase.js` usa `VITE_FIREBASE_*`; sem bootstrap anónimo; config incompleta → `getFirebaseApp()` null + aviso (não rebenta build). Débito residual: alinhar documentação interna com **projectId** real (repo mistura `transparenciabr` em `.env.production` vs memórias `fiscallizapa`) para evitar confusão operacional. |
| **Home / “Universo”** | `HomePage` + `UniverseGraph` (React Three Fiber): grafo 3D com dados de `fetchPoliticosCollection`; `GlobalSearch` com cache de catálogo. **Não é stub** — depende de Firestore + env. |
| **Painel (Dashboard)** | `OperationsOverviewPage`: KPIs reais (`politicos`, `alertas_bodes` via React Query, cache 24h). `DashboardLayout`: navegação completa. |
| **Mapa** | `MapaPage`: agregação **por UF** a partir de `alertas_bodes` + mapa de UF (`BrazilUFTileMap`). `BrazilHeatmap`: **MapLibre GL JS + PMTiles** (`registerPmtilesProtocolOnce`), choropleth municipal via `municipalityRiskMap` + `getRiskHex` em `colorUtils.js`. **Já há base forense municipal** quando `VITE_BR_PM_TILES_URL` e dados de risco por código IBGE existem. |
| **Dossiê** | `DossiePage` carrega `transparency_reports` via `useTransparencyReport`; secções CEAP, OSINT, bússola, PDF, etc. **`Section4Placeholder.jsx`** é **placeholder textual** (correlação / resumo executivo sem dados ligados). |
| **Outros** | `GaugeSkeleton`, `PanelSkeleton`: componentes de loading/estrutura, não produto “vazio”. |

### 1.2 Backend (`functions/`)

| Componente | Estado |
|------------|--------|
| **`index.js` (deployed surface)** | Stripe (webhook + `createCheckoutSession`), `grantRole` / `listMyClaims`, HTTP `syncBigQueryToFirestore` + `retroactiveScanBigQueryToFirestore` (CEAP → Gemini “Líder Supremo” via `@google/generative-ai`, fallback heurístico sem API key), Firestore trigger `onDiarioAtoCreated` (Gemini via `diarioScanner`). |
| **Genkit / Vertex** | `src/genkit.config.js` + `flows/oraculoFlow.js`, `dossieExecutivoFlow.js` — **definidos no repo, não exportados em `index.js`**. Ou seja: **fluxos Vertex AI (Gemini 2.5 Pro) não estão expostos como Cloud Functions deployadas** neste entrypoint. |
| **Agentes** | `src/agents/agente-nepotismo.js` (e similares): **stubs** (`console.log('[STUB]...')`). |
| **Integração dados → UI** | Pipeline CEAP escreve `politicos` + `transparency_reports`. O dossiê consome sobretudo Firestore **público** (`transparency_reports` leitura aberta com limite em list). Radar jurídico privado: `radar_dossiers` só dono. |

### 1.3 Regras Firestore (`firestore.rules`)

- `usuarios/{uid}`: leitura própria; updates restritos (débito Oráculo 200 créditos, reset diário); anti-escalonamento de admin/GOD.
- `politicos`, `alertas_bodes`, `transparency_reports`: leitura pública (lista `transparency_reports` limit ≤ 50).
- `dossies_factuais`: leitura **premium/god_mode** apenas.
- **Risco de produto:** motores que geram narrativa sensível devem preferir escrita via Admin SDK + campos já previstos em `transparency_reports` / coleções dedicadas, respeitando estas regras.

### 1.4 Débito técnico pós-batalha Auth (consolidado)

1. **Consistência de projeto Firebase** entre env, MEMORIES e `.env.production` (nomes `transparenciabr` vs `fiscallizapa`).
2. **`useUserCredits`:** sem utilizador, créditos ficam `null` — comportamento correcto; garantir UX no dossiê (mensagens claras).
3. **Genkit órfão:** código Vertex em `functions/src/flows/` sem export → duplicação conceptual com `GoogleGenerativeAI` em `index.js`.
4. **Agentes forenses** em `functions/src/agents/` não produtivos.

---

## 2. Prontidão — Mega Bloco 2 (Mapa forense Emendas PIX / RP6)

### 2.1 O que já existe (dependências)

- **maplibre-gl**, **pmtiles**, **deck.gl** (+ React bindings) já em `package.json`.
- **Malha municipal:** `BrazilHeatmap` + protocolo PMTiles; variáveis `VITE_BR_PM_TILES_URL`, `VITE_PM_TILES_SOURCE_LAYER`.
- **Mapa por UF** de alertas: `MapaPage` + `BrazilUFTileMap`.

### 2.2 Lacunas para superar a concorrência

| Lacuna | Detalhe |
|--------|---------|
| **Dados agregados por município** | Falta camada analítica (BigQuery ou CF) que agregue **emendas PIX e RP6** por `codigo_ibge` (ou equivalente), com métricas: valor indicado, empenhado, pago, contagem, por parlamentar filtrado. |
| **Fonte única para o choropleth** | `DossiePage` já espera `mapa_risco_municipal` / `risco_por_municipio` no documento — é preciso ** popular estes campos** via pipeline (ETL + regra de normalização IBGE). |
| **Performance mobile** | PMTiles no CDN já é o caminho; validar tamanho do ficheiro, **simplificação GeoJSON** (Mapshaper) vs vector tiles, e **limitar** features activas em `deck.gl` se se sobrepor ao MapLibre. |
| **Toggle PIX / RP6 / Todas** | UI e queries parametrizadas ainda não mapeadas neste repo de forma unificada. |

### 2.3 ColorBrewer + hover cards

- **Hoje:** `colorUtils.js` usa escala **HSL para risco** (`getRiskHex` para MapLibre `match`). Não é ColorBrewer **YlOrRd**.
- **Próximo passo técnico:**
  - Introduzir paleta **ColorBrewer YlOrRd** (array de hex por quantis ou `d3-scale-chromatic` / paleta fixa documentada).
  - **Hover:** `map.on('mousemove', 'fill-layer-id', …)` + `Popup` MapLibre ou estado React com **card flutuante** mostrando totais do município (empenho/pago) vindos de um **mapa `cod_ibge → métricas`** carregado junto com o político ou vista global.
  - Para **mapa nacional** (sem parlamentar): endpoint callable ou documento Firestore agregado **read-only** com regras adequadas, ou BigQuery atrás de Cloud Function com cache.

---

## 3. Backend forense — Protocolo A.S.M.O.D.E.U.S. (estado real)

| Capacidade | Estado no código |
|------------|------------------|
| **Gemini em CF** | CEAP scan usa **Gemini 2.5 Pro** via API key (`GEMINI_API_KEY` / `GOOGLE_API_KEY`); há fallback heurístico. |
| **Vertex / Genkit** | Configurado em `genkit.config.js` (Vertex `gemini-2.5-pro`); fluxos Oráculo / dossiê executivo **não ligados ao deploy**. |
| **Nepotismo / licitações / laboratórios** | Agentes em `src/agents/` são **stubs**; não há triggers que escrevam automaticamente nos campos do dossiê para esses protocolos. |
| **Pontes para a UI** | Parcialmente feitas via **`transparency_reports`** e CEAP retroactivo; secções específicas do dossiê precisam de **contratos de dados** estáveis (campos versionados) e jobs que os preencham. |

**Para “esteira completa” até ao dossiê:** (1) consolidar **uma** via Gemini (Vertex vs API key) em produção; (2) implementar jobs (scheduled/on-demand) que consultem BigQuery + regras de negócio; (3) mapear saída para `transparency_reports` / subcoleções; (4) tipar e consumir no frontend.

---

## 4. Próximas três sprints (tarefas atómicas)

### Sprint A — Dados geográficos emendas (fundação)

1. Documentar schema-alvo: tabela/view BigQuery `emendas_por_municipio` (PIX + RP6) com chave IBGE 7 dígitos.
2. Implementar query de agregação e job de materialização (scheduled query ou CF + tabela particionada).
3. Gerar **vector tile ou PMTiles** derivado para camada “densidade de emendas” **ou** expor JSON agregado por UF/município para choropleth sem tile pesado na primeira iteração.
4. Definir contrato JSON para `mapa_risco_municipal` / campos paralelos para **valor financeiro** (não só risco).
5. Testes de carga: tempo de resposta com filtro por `parlamentar_id`.

### Sprint B — Mapa forense na UI (MapLibre)

1. Nova rota ou extensão de `MapaPage`: modo **“Emendas”** vs modo actual “Alertas”.
2. Integrar paleta **YlOrRd** (função de escala + legenda acessível).
3. Implementar **hover card** (popup posicionado + dismiss) com empenho/pago/indicadores.
4. Mobile: reduzir listeners, debounce hover, validar 60fps em dispositivo médio.
5. Feature flag / env para URL PMTiles de emendas vs alertas.

### Sprint C — Backend forense e Oráculo unificado

1. Decisão arquitectural: **exportar** fluxos Genkit como HTTPS callable **ou** migrar CEAP scan para Vertex único.
2. Remover ou implementar `agente-nepotismo` / pipeline real com escrita **só** via Admin SDK.
3. Cloud Scheduler + HTTP autenticado para `retroactiveScan` / scans segmentados (evitar custo full-scan).
4. Campos dossiê: alinhar `Section4Placeholder` com dados reais ou substituir por componente alimentado por `dossies_factuais` / `transparency_reports` estendido.
5. Monitorização: logs estruturados + alarme se `GEMINI_API_KEY` ausente em prod.

---

## 5. Bibliotecas a instalar (próximo passo)

| Pacote | Motivo | Onde |
|--------|--------|------|
| `d3-scale-chromatic` ou `chroma-js` | Paletas ColorBrewer (YlOrRd) e escalas quantitativas com domínio controlado | `frontend` |
| Opcional: `d3-scale` | `scaleQuantile` / `scaleThreshold` para bins do choropleth | `frontend` |
| `tippecanoe` (CLI, não npm obrigatório) | Gerar PMTiles a partir de GeoJSON no pipeline de dados | CI / máquina de build |
| Sem obrigatoriedade imediata de novos pacotes MapLibre — **já presentes** `maplibre-gl` e `pmtiles`. |

**Functions:** Genkit já está em `dependencies`; pode ser necessário **ajustar** versões e wiring — não é obrigatório novo pacote até fechar o desenho Vertex vs API key.

---

## 6. Critérios de aceitação — Mega Bloco 2 (rascunho)

- [ ] Utilizador consegue ver **mapa municipal** com camada de emendas (PIX e/ou RP6) com legenda YlOrRd.
- [ ] Hover mostra **totais financeiros** correctos para o município (fonte BigQuery/Firestore documentada).
- [ ] Performance aceitável em **mobile** (scroll/zoom sem bloqueio > 100ms sustentado).
- [ ] Regras Firestore e custos BigQuery **revisados** para leitura pública vs dados sensíveis.

---

**ROADMAP VERTEX GERADO** — aguardando aprovação do Comandante para iniciar Mega Bloco 2 (Sprint A).
