# PLANO MESTRE V3 — TransparênciaBR
## Protocolo A.S.M.O.D.E.U.S. | Arquitetura Forense | Guia de Execução Completo

> **Gerado em:** 2026-04-27 | **Agente:** Perplexity AI + Vertex AI Agent `agent_1777236402725`  
> **Status:** Documento de referência operacional para toda a equipe técnica  
> **Repos:** `mmbaesso1980/transparenciabr` · `mmbaesso1980/fiscalizapa`

---

## 📋 ÍNDICE

1. [Visão Geral e Estado Atual](#1-visão-geral-e-estado-atual)
2. [Arquitetura Técnica Completa](#2-arquitetura-técnica-completa)
3. [Data Warehouse BigQuery — Modelo Dimensional](#3-data-warehouse-bigquery--modelo-dimensional)
4. [Protocolo A.S.M.O.D.E.U.S. — Algoritmos Forenses](#4-protocolo-asmodeus--algoritmos-forenses)
5. [Arsenal de APIs — Mapa Completo](#5-arsenal-de-apis--mapa-completo)
6. [Mega Bloco 2 — Mapa Forense de Emendas](#6-mega-bloco-2--mapa-forense-de-emendas)
7. [Backend Forense — Plano de Implementação](#7-backend-forense--plano-de-implementação)
8. [Frontend — Hotpage e UX Spec](#8-frontend--hotpage-e-ux-spec)
9. [Monetização Freemium](#9-monetização-freemium)
10. [Sprint Roadmap — Próximas 6 Semanas](#10-sprint-roadmap--próximas-6-semanas)
11. [Gap Analysis vs Concorrência](#11-gap-analysis-vs-concorrência)
12. [Glossário Técnico](#12-glossário-técnico)

---

## 1. VISÃO GERAL E ESTADO ATUAL

### 1.1 Missão
A plataforma TransparênciaBR v2.0 é um sistema de inteligência cívica forense que consolida, cruza e analisa dados de **513 deputados federais**, **81 senadores**, **5.570 municípios** e **bilhões de reais** em gastos públicos para detectar automaticamente padrões de corrupção, nepotismo, superfaturamento e má gestão.

### 1.2 Diferencial Estratégico vs Concorrência

| Dimensão | De Olho em Você (concorrente) | TransparênciaBR v2.0 |
|----------|-------------------------------|----------------------|
| Emendas cobertas | Apenas PIX (RP99) | **RP6 + RP7 + RP8 + RP9 + RP99** |
| Motor de detecção | Nenhum | **A.S.M.O.D.E.U.S.** (Lei Benford, ARIMA, K-Means, Gemini 2.5 Pro) |
| Mapa | GeoJSON bruto (lag mobile) | **PMTiles + MapLibre** (vector tiles, 60fps) |
| ID próprio | Espelho das APIs (sem ofuscação) | **ID proprietário** + camada de transformação |
| Base eleitoral | Não | **TSE → IBGE DE-PARA** (voto mapeado por cidade) |
| Score de risco | Não | **Score composto** (Benford + ML + CNPJ + TCU/CEIS) |
| Dossiê em PDF | Não | **PDF forense** gerado por Gemini 2.5 Pro |
| SEO por parlamentar | Meta tag genérica | **SSG por deputado** (indexável no Google) |

### 1.3 Estado Real do Repositório (2026-04-27)

#### Frontend (`frontend/`)
- ✅ React 19 + Vite 8 + Tailwind 4 + React Router 7
- ✅ TanStack Query com cache 24h para KPIs
- ✅ `UniverseGraph` (React Three Fiber) — grafo 3D funcionando
- ✅ `BrazilHeatmap` com MapLibre GL JS + PMTiles configurado
- ✅ `DossiePage` com CEAP, OSINT, bússola ideológica, PDF
- ⚠️ `Section4Placeholder.jsx` — seção de correlação ainda sem dados reais
- ⚠️ Config Firebase inconsistente (`transparenciabr` vs `fiscallizapa`)
- ❌ Mapa de emendas PIX/RP6 por município ainda não implementado

#### Backend (`functions/`)
- ✅ Stripe webhook + `createCheckoutSession`
- ✅ `syncBigQueryToFirestore` + `retroactiveScanBigQueryToFirestore`
- ✅ CEAP → Gemini 2.5 Pro ("Líder Supremo") com fallback heurístico
- ✅ `onDiarioAtoCreated` trigger (scanner de diário oficial)
- ⚠️ Genkit/Vertex (`oraculoFlow`, `dossieExecutivoFlow`) — **definidos mas não exportados** em `index.js`
- ❌ `agente-nepotismo.js` e outros agentes forenses — **stubs** apenas
- ❌ Agentes de licitação, laboratórios, rachadinhas — não implementados

#### Débitos Técnicos Prioritários
1. Unificar nome do projeto Firebase (escolher `fiscallizapa` definitivamente)
2. Exportar flows Genkit em `index.js` ou migrar para `@google/generative-ai` único
3. Implementar agentes forenses reais (saindo dos stubs)
4. Popular `Section4Placeholder` com dados de correlação emenda×IDH
5. Configurar `VITE_BR_PM_TILES_URL` em produção

---

## 2. ARQUITETURA TÉCNICA COMPLETA

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMADA DE INGESTÃO (ETL)                      │
│  APIs Gov → Cloud Functions (Node.js) → BigQuery (particionado) │
│  Transferegov · CGU · Câmara · Senado · TSE · IBGE · TCU · PNCP │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│               DATA WAREHOUSE — Google BigQuery                   │
│  Projeto: fiscallizapa                                           │
│  Datasets: raw_*, staging_*, analytics_*, ml_*                   │
│  Particionamento: por data | Clusterização: parlamentar_id, UF   │
│  BigQuery ML: ARIMA_PLUS, K-MEANS, AUTOML_CLASSIFIER            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│           MOTOR FORENSE — A.S.M.O.D.E.U.S.                      │
│  Lei Benford · ARIMA anomalias · K-Means clusters · Gemini 2.5  │
│  Document AI · CEIS/CNEP/CADIRREG · TSE base eleitoral          │
│  Módulo ESPECTRO (posicionamento) · Protocolo FLAVIO (rachadinha)│
│  Operação DRACULA (saúde) · Protocol ORACULO (LLM Judge)        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              CAMADA CACHE — Firebase Firestore                   │
│  politicos/ · transparency_reports/ · alertas_bodes/            │
│  radar_dossiers/ (premium) · dossies_factuais/ (god_mode)       │
│  Desnormalização extrema → 1 Read por perfil de parlamentar      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              FRONTEND — React 19 + Vite 8                        │
│  HomePage · UniverseGraph 3D · MapaPage (MapLibre + PMTiles)    │
│  DossiePage · Dashboard · Ranking · AlertasPage                 │
│  Auth via Firebase · Stripe créditos · TanStack Query cache      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Princípios de Engenharia
- **Zero full table scan**: toda query BigQuery usa partição temporal + cluster
- **Serverless-first**: Cloud Functions para ETL, sem servidores persistentes
- **Cache agressivo**: Firestore como CDN de dados pré-computados
- **LLM determinístico**: Gemini 2.5 Pro responde apenas em JSON estruturado
- **PMTiles > GeoJSON**: vector tiles servidos de CDN para mobile 60fps

---

## 3. DATA WAREHOUSE BIGQUERY — MODELO DIMENSIONAL

### 3.1 Tabelas de Dimensão

```sql
-- dim_parlamentar: 513 deputados + 81 senadores
CREATE TABLE `fiscallizapa.analytics.dim_parlamentar`
PARTITION BY DATE(_PARTITIONTIME)
CLUSTER BY casa, uf, partido
AS SELECT
  id_parlamentar    STRING NOT NULL,  -- ID proprietário (hash interno)
  id_api_camara     STRING,           -- ID da API oficial da Câmara
  id_api_senado     STRING,           -- Código do Senado
  id_candidato_tse  STRING,           -- ID TSE para DE-PARA eleitoral
  casa              STRING,           -- 'CAMARA' | 'SENADO'
  nome_completo     STRING,
  nome_civil        STRING,
  nome_urna         STRING,
  cpf_hash          STRING,           -- SHA-256 do CPF (nunca expor raw)
  partido           STRING,
  sigla_partido     STRING,
  uf                STRING,
  foto_url          STRING,
  email             STRING,
  id_legislatura    INT64,
  situacao          STRING,           -- 'EXERCICIO' | 'LICENCA' | 'FALECIDO'
  data_posse        DATE,
  score_asmodeus    FLOAT64,          -- Score composto forense (0-100)
  nivel_risco       STRING,           -- 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO'
  _updated_at       TIMESTAMP;

-- dim_municipio: 5.570 municípios com chaves cruzadas
CREATE TABLE `fiscallizapa.analytics.dim_municipio`
CLUSTER BY uf, regiao
AS SELECT
  cod_ibge          STRING NOT NULL,  -- 7 dígitos (chave primária)
  cod_ibge_6        STRING,           -- 6 dígitos (chave TSE)
  cod_tse_5         STRING,           -- 5 dígitos (chave TSE eleitoral)
  nome              STRING,
  uf                STRING,
  regiao            STRING,
  latitude          FLOAT64,
  longitude         FLOAT64,
  populacao         INT64,            -- Censo IBGE 2022
  area_km2          FLOAT64,
  idhm              FLOAT64,          -- Atlas Brasil PNUD
  idhm_renda        FLOAT64,
  idhm_longevidade  FLOAT64,
  idhm_educacao     FLOAT64,
  ideb_ef_anos_finais FLOAT64,        -- INEP 2023
  leitos_sus_100k   FLOAT64,          -- CNES/km2
  pct_saneamento    FLOAT64,          -- SNIS/SINISA
  pct_extrema_pobreza FLOAT64,        -- Atlas Brasil
  _updated_at       TIMESTAMP;
```

### 3.2 Tabelas de Fato — Emendas

```sql
-- fato_emenda_pix: Transferências Especiais (Transferegov)
CREATE TABLE `fiscallizapa.analytics.fato_emenda_pix`
PARTITION BY DATE(data_empenho)
CLUSTER BY id_parlamentar, uf_destino, situacao_execucao
AS SELECT
  id_emenda           STRING NOT NULL,
  nr_emenda           STRING,
  ano_orcamento       INT64,
  id_parlamentar      STRING,           -- FK dim_parlamentar
  casa                STRING,
  cod_ibge            STRING,           -- FK dim_municipio (7 dígitos)
  uf_destino          STRING,
  nome_municipio      STRING,           -- Desnormalizado para performance
  valor_indicado      NUMERIC,
  valor_empenhado     NUMERIC,
  valor_pago          NUMERIC,
  valor_liquidado     NUMERIC,
  situacao_execucao   STRING,           -- 'PAGO' | 'EMPENHADO' | 'CANCELADO' | 'INDICADO'
  data_empenho        DATE,
  data_pagamento      DATE,
  objeto              STRING,
  _ingestao_at        TIMESTAMP;

-- fato_emenda_rp6: Emendas Individuais Impositivas (CGU)
CREATE TABLE `fiscallizapa.analytics.fato_emenda_rp6`
PARTITION BY DATE(data_empenho)
CLUSTER BY id_parlamentar, uf_destino, acao_orcamentaria
AS SELECT
  id_emenda           STRING NOT NULL,
  nr_emenda           STRING,
  ano_orcamento       INT64,
  id_parlamentar      STRING,
  casa                STRING,
  cod_ibge            STRING,
  uf_destino          STRING,
  orgao_executor      STRING,
  acao_orcamentaria   STRING,
  funcao              STRING,           -- Saúde, Educação, Infraestrutura...
  subfuncao           STRING,
  programa            STRING,
  valor_dotacao       NUMERIC,
  valor_empenhado     NUMERIC,
  valor_pago          NUMERIC,
  situacao            STRING,
  _ingestao_at        TIMESTAMP;

-- fato_emenda_rp7: Emendas de Bancada Estadual
CREATE TABLE `fiscallizapa.analytics.fato_emenda_rp7`
PARTITION BY DATE(data_empenho)
CLUSTER BY uf_bancada, uf_destino, funcao
AS SELECT
  id_emenda           STRING NOT NULL,
  nr_emenda           STRING,
  ano_orcamento       INT64,
  uf_bancada          STRING,           -- UF da bancada autora
  cod_ibge            STRING,
  uf_destino          STRING,
  funcao              STRING,
  valor_empenhado     NUMERIC,
  valor_pago          NUMERIC,
  situacao            STRING,
  _ingestao_at        TIMESTAMP;

-- fato_emenda_rp9: Histórico Orçamento Secreto (2020-2022)
CREATE TABLE `fiscallizapa.analytics.fato_emenda_rp9`
PARTITION BY DATE(data_empenho)
CLUSTER BY orgao_relator, uf_destino
AS SELECT
  id_emenda           STRING NOT NULL,
  ano_orcamento       INT64,
  orgao_relator       STRING,
  cod_ibge            STRING,
  uf_destino          STRING,
  funcao              STRING,
  valor_empenhado     NUMERIC,
  valor_pago          NUMERIC,
  situacao            STRING,
  _ingestao_at        TIMESTAMP;
```

### 3.3 Tabelas de Fato — Fiscalização

```sql
-- fato_ceap_despesa: Cota Parlamentar (CEAP)
CREATE TABLE `fiscallizapa.analytics.fato_ceap_despesa`
PARTITION BY DATE(data_emissao)
CLUSTER BY parlamentar_id, uf_fornecedor, cnpj_fornecedor
AS SELECT
  id_despesa          STRING NOT NULL,
  parlamentar_id      STRING,
  ano                 INT64,
  mes                 INT64,
  tipo_despesa        STRING,
  cnpj_fornecedor     STRING,
  nome_fornecedor     STRING,
  uf_fornecedor       STRING,
  valor_liquido       NUMERIC,
  data_emissao        DATE,
  url_documento       STRING,
  flag_benford        BOOL,             -- Saída da Lei Benford
  flag_fracionamento  BOOL,             -- Detecção de split
  score_anomalia      FLOAT64,          -- Z-score Benford
  _ingestao_at        TIMESTAMP;

-- fato_contrato: Contratos públicos (PNCP + CGU)
CREATE TABLE `fiscallizapa.analytics.fato_contrato`
PARTITION BY DATE(data_assinatura)
CLUSTER BY cnpj_fornecedor, orgao_contratante, uf
AS SELECT
  id_contrato         STRING NOT NULL,
  orgao_contratante   STRING,
  cnpj_fornecedor     STRING,
  nome_fornecedor     STRING,
  uf                  STRING,
  cod_ibge            STRING,
  objeto_contrato     STRING,
  modalidade          STRING,           -- Dispensa, Pregão, Concorrência...
  valor_inicial       NUMERIC,
  valor_atual         NUMERIC,
  data_assinatura     DATE,
  data_vigencia_fim   DATE,
  flag_licitacao_deserta BOOL,
  flag_dispensa_suspeita BOOL,
  ics_score           FLOAT64,          -- Índice de Corrupção calculado
  _ingestao_at        TIMESTAMP;

-- fato_votacao + fato_voto (câmara e senado)
CREATE TABLE `fiscallizapa.analytics.fato_votacao`
PARTITION BY DATE(data_votacao)
CLUSTER BY casa, resultado
AS SELECT
  id_votacao          STRING NOT NULL,
  casa                STRING,           -- 'CAMARA' | 'SENADO'
  data_votacao        TIMESTAMP,
  descricao           STRING,
  proposicao_ref      STRING,
  resultado           STRING,           -- 'APROVADO' | 'REJEITADO' | 'PREJUDICADO'
  votos_sim           INT64,
  votos_nao           INT64,
  votos_abstencao     INT64,
  votos_ausente       INT64;

CREATE TABLE `fiscallizapa.analytics.fato_voto`
PARTITION BY DATE(_PARTITIONTIME)
CLUSTER BY id_parlamentar, voto
AS SELECT
  id_votacao          STRING NOT NULL,
  id_parlamentar      STRING NOT NULL,
  casa                STRING,
  voto                STRING,           -- 'SIM' | 'NAO' | 'ABSTENCAO' | 'AUSENTE'
  partido             STRING,
  uf                  STRING;
```

### 3.4 Views Materializadas — Agregações Pré-computadas

```sql
-- vm_emendas_por_municipio: Base do mapa forense
CREATE MATERIALIZED VIEW `fiscallizapa.analytics.vm_emendas_por_municipio`
PARTITION BY DATE(_PARTITIONTIME)
CLUSTER BY cod_ibge, ano_orcamento
AS
SELECT
  cod_ibge,
  ano_orcamento,
  COUNT(DISTINCT id_parlamentar) AS parlamentares_ativos,
  SUM(valor_pago) AS total_pago,
  SUM(valor_empenhado) AS total_empenhado,
  SUM(valor_indicado) AS total_indicado,
  ROUND(SUM(valor_pago) / NULLIF(SUM(valor_indicado), 0) * 100, 2) AS pct_execucao,
  COUNTIF(situacao_execucao = 'CANCELADO') AS emendas_canceladas
FROM `fiscallizapa.analytics.fato_emenda_pix`
GROUP BY 1, 2;

-- vm_score_parlamentar: Score composto por político
CREATE MATERIALIZED VIEW `fiscallizapa.analytics.vm_score_parlamentar`
CLUSTER BY id_parlamentar, nivel_risco
AS
SELECT
  p.id_parlamentar,
  p.nome_completo,
  p.partido,
  p.uf,
  p.casa,
  -- Score A.S.M.O.D.E.U.S. ponderado
  ROUND(
    COALESCE(b.score_benford, 0) * 0.25 +
    COALESCE(c.score_contratos, 0) * 0.30 +
    COALESCE(n.score_nepotismo, 0) * 0.20 +
    COALESCE(s.score_sancoes, 0) * 0.25
  , 2) AS score_asmodeus,
  CASE
    WHEN score_asmodeus >= 75 THEN 'CRITICO'
    WHEN score_asmodeus >= 50 THEN 'ALTO'
    WHEN score_asmodeus >= 25 THEN 'MEDIO'
    ELSE 'BAIXO'
  END AS nivel_risco,
  CURRENT_TIMESTAMP() AS _computed_at
FROM `fiscallizapa.analytics.dim_parlamentar` p
LEFT JOIN `fiscallizapa.ml.resultados_benford` b USING (id_parlamentar)
LEFT JOIN `fiscallizapa.ml.score_contratos` c USING (id_parlamentar)
LEFT JOIN `fiscallizapa.ml.score_nepotismo` n USING (id_parlamentar)
LEFT JOIN `fiscallizapa.ml.score_sancoes` s USING (id_parlamentar);
```

---

## 4. PROTOCOLO A.S.M.O.D.E.U.S. — ALGORITMOS FORENSES

> **A**utomação de **S**istemas de **M**onitoramento e **D**etecção de **E**squemas no **U**so de **S**ubsídios

### 4.1 Lei de Benford — Filtro Primário

Detecta manipulação artificial de valores financeiros. Desvios > 30% do esperado geram flags automáticas.

```sql
-- benford_scan.sql — executar como BigQuery Scheduled Query (diária)
WITH ExtracaoDigito AS (
  SELECT
    parlamentar_id,
    CAST(SUBSTR(CAST(ABS(valor_liquido) AS STRING), 1, 1) AS INT64) AS primeiro_digito,
    COUNT(*) AS freq_absoluta
  FROM `fiscallizapa.analytics.fato_ceap_despesa`
  WHERE valor_liquido > 0
    AND DATE(data_emissao) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
  GROUP BY 1, 2
),
FreqObservada AS (
  SELECT
    parlamentar_id,
    primeiro_digito,
    freq_absoluta / SUM(freq_absoluta) OVER (PARTITION BY parlamentar_id) AS pct_real
  FROM ExtracaoDigito
),
FreqEsperada AS (
  SELECT d AS primeiro_digito,
         LOG10(1 + 1/d) AS pct_esperado
  FROM UNNEST(GENERATE_ARRAY(1, 9)) AS d
),
AnomaliaZ AS (
  SELECT
    o.parlamentar_id,
    o.primeiro_digito,
    o.pct_real,
    e.pct_esperado,
    ABS(o.pct_real - e.pct_esperado) / e.pct_esperado AS desvio_z
  FROM FreqObservada o
  JOIN FreqEsperada e USING (primeiro_digito)
)
SELECT
  parlamentar_id,
  ROUND(AVG(desvio_z), 4) AS score_benford,
  COUNTIF(desvio_z > 0.30) AS digitos_anomalos,
  IF(AVG(desvio_z) > 0.20, TRUE, FALSE) AS flag_investigacao
FROM AnomaliaZ
GROUP BY 1
ORDER BY score_benford DESC;
```

### 4.2 ARIMA_PLUS — Detecção de Anomalias Temporais

Identifica surtos anômalos em séries temporais de gastos. Alertas quando valores ultrapassam intervalo de confiança 95%.

```sql
-- Treinar modelo ARIMA por parlamentar
CREATE OR REPLACE MODEL `fiscallizapa.ml.arima_gastos_parlamentar`
OPTIONS(
  model_type = 'ARIMA_PLUS',
  time_series_timestamp_col = 'mes_referencia',
  time_series_data_col = 'total_gasto',
  time_series_id_col = 'parlamentar_id',
  DECOMPOSE_TIME_SERIES = TRUE,
  CLEAN_SPIKES_AND_DIPS = TRUE
) AS
SELECT
  parlamentar_id,
  DATE_TRUNC(data_emissao, MONTH) AS mes_referencia,
  SUM(valor_liquido) AS total_gasto
FROM `fiscallizapa.analytics.fato_ceap_despesa`
GROUP BY 1, 2;

-- Detectar anomalias nos últimos 6 meses
SELECT
  parlamentar_id,
  mes_referencia,
  total_gasto,
  forecast_value,
  prediction_interval_lower_bound,
  prediction_interval_upper_bound,
  IF(total_gasto > prediction_interval_upper_bound, TRUE, FALSE) AS anomalia_alta
FROM ML.DETECT_ANOMALIES(
  MODEL `fiscallizapa.ml.arima_gastos_parlamentar`,
  STRUCT(0.95 AS anomaly_prob_threshold)
)
WHERE anomalia_alta = TRUE
ORDER BY mes_referencia DESC;
```

### 4.3 K-Means — Clustering de Fornecedores Suspeitos

Agrupa fornecedores por perfil de risco. Outliers nos percentis 95+ são classificados como shell companies.

```sql
CREATE OR REPLACE MODEL `fiscallizapa.ml.kmeans_fornecedores`
OPTIONS(model_type='KMEANS', num_clusters=5) AS
SELECT
  cnpj_fornecedor,
  -- Features de risco
  DATE_DIFF(CURRENT_DATE(), MIN(data_abertura_cnpj), DAY) / 365.0 AS anos_empresa,
  LOG(capital_social + 1) AS log_capital,
  COUNT(DISTINCT parlamentar_id) AS parlamentares_clientes,
  SUM(valor_liquido) AS valor_total_recebido,
  COUNT(*) AS num_contratos,
  AVG(valor_liquido) AS ticket_medio,
  -- Flag de risco: CEIS/CNEP
  MAX(IF(flag_ceis = TRUE, 1, 0)) AS tem_sancao_ceis,
  MAX(IF(flag_cnep = TRUE, 1, 0)) AS tem_sancao_cnep
FROM `fiscallizapa.analytics.fato_ceap_despesa` c
JOIN `fiscallizapa.raw.cnpj_dados` d USING (cnpj_fornecedor)
GROUP BY 1, d.capital_social, d.data_abertura_cnpj;
```

### 4.4 Módulo E.S.P.E.C.T.R.O. — Posicionamento Ideológico

Classifica parlamentares por comportamento real (votos) e não por legenda partidária.

```sql
-- Matriz de coerência: voto do parlamentar vs posição do partido
SELECT
  v.id_parlamentar,
  p.partido,
  COUNT(*) AS total_votacoes,
  COUNTIF(v.voto = pos_partido.voto_majoritario) AS votos_alinhados,
  ROUND(
    COUNTIF(v.voto = pos_partido.voto_majoritario) / COUNT(*) * 100, 2
  ) AS pct_fidelidade_partidaria,
  -- Fidelidade < 40% = dissidente; > 90% = linha dura
  CASE
    WHEN pct_fidelidade_partidaria < 40 THEN 'DISSIDENTE'
    WHEN pct_fidelidade_partidaria > 90 THEN 'LINHA_DURA'
    ELSE 'MODERADO'
  END AS perfil_espectro
FROM `fiscallizapa.analytics.fato_voto` v
JOIN `fiscallizapa.analytics.dim_parlamentar` p USING (id_parlamentar)
JOIN `fiscallizapa.analytics.vw_posicao_partido` pos_partido 
  ON pos_partido.id_votacao = v.id_votacao AND pos_partido.partido = p.partido
GROUP BY 1, 2;
```

### 4.5 Protocolo F.L.A.V.I.O. — Detecção de Rachadinha

Identifica funcionários fantasmas cruzando folha de pagamento com registros de deslocamento e ausência em Brasília.

**Lógica de detecção:**
1. Coletar nomeados de gabinete com domicílio fora de Brasília/DF
2. Verificar se há despesas de voo/fretamento da CEAP do chefe para a cidade natal do nomeado
3. Verificar ausência de despesas do nomeado em Brasília por mais de 90 dias consecutivos
4. Se: nomeado mora no reduto eleitoral + sem deslocamentos Brasília + chefe tem viagens ao local = **flag FLAVIO LEVEL 3**

### 4.6 Operação D.R.A.C.U.L.A. — Saúde Pública

Foca em 16 CNAEs de saúde. Empresas ME/EPP sem ANVISA que recebem contratos >R$1M são classificadas como "Laboratório Fantasma".

**Score ICS (Índice de Corrupção em Saúde):**
- CNPJ ME/EPP + contrato saúde > R$500k = **+20 pts**
- Sem registro DATAVISA/ANVISA = **+25 pts**
- Subcontratação irrestrita em cláusula contratual = **+15 pts** (Gemini 2.5 Pro analisa PDF)
- CNPJ com < 1 ano de abertura = **+20 pts**
- Sócio com relação com parlamentar (TSE/CEAP cruzado) = **+20 pts**
- **Total > 65 pts = LABORATÓRIO FANTASMA**

### 4.7 Protocolo Oráculo — Gemini 2.5 Pro como Juiz Forense

```javascript
// functions/src/flows/oraculoFlow.js — A SER EXPORTADO EM index.js
import { defineFlow } from '@genkit-ai/core';
import { gemini25Pro } from '@genkit-ai/vertexai';

export const oraculoFlow = defineFlow(
  { name: 'oraculo', inputSchema: z.object({ documentoPdf: z.string(), tipo: z.string() }) },
  async (input) => {
    const resultado = await generate({
      model: gemini25Pro,
      system: `Você é um juiz forense especializado em direito administrativo brasileiro.
        RESPONDA SOMENTE EM JSON ESTRUTURADO.
        Analise o documento fornecido e identifique:
        - clausulas_irregulares: array de strings
        - score_corrupcao: número de 0 a 100
        - nivel_risco: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO'
        - recomendacao: string de até 200 caracteres
        NUNCA invente informações. Se não souber, retorne null no campo.`,
      prompt: input.documentoPdf,
      config: { maxOutputTokens: 1024, temperature: 0.1 }, // Temperatura baixa = determinístico
    });
    return JSON.parse(resultado.text());
  }
);
```

---

## 5. ARSENAL DE APIs — MAPA COMPLETO

### 5.1 APIs de Alta Prioridade (Implementar Já)

| # | API | Base URL | Auth | Dados para o TransparênciaBR |
|---|-----|----------|------|------------------------------|
| 1 | **Câmara — Deputados** | `https://dadosabertos.camara.leg.br/api/v2/` | Não | Lista, perfis, despesas CEAP, votações, agenda |
| 2 | **Senado — Dados Abertos** | `https://legis.senado.leg.br/dadosabertos/` | Não | Senadores, votações nominais, despesas, agenda |
| 3 | **Transferegov (Emendas PIX)** | `https://docs.api.transferegov.gestao.gov.br/transferenciasespeciais/` | Não | Emendas RP99 por parlamentar/município |
| 4 | **Portal Transparência — CGU** | `https://api.portaldatransparencia.gov.br/` | API Key grátis | RP6/RP7/RP8/RP9/RP99, contratos, CEIS, CNEP |
| 5 | **PNCP** | `https://pncp.gov.br/api/pncp/v1/` | Não | Contratos, licitações, PCA |
| 6 | **TSE — Dados Abertos** | `https://dadosabertos.tse.jus.br` | Não | Base eleitoral municipal, candidatos |
| 7 | **IBGE — Localidades** | `https://servicodados.ibge.gov.br/api/v1/localidades/` | Não | 5.570 municípios com código IBGE |
| 8 | **IBGE — SIDRA** | `https://apisidra.ibge.gov.br/values/` | Não | Censo 2022, PIB, mortalidade |
| 9 | **TCU — Acórdãos/Sanções** | `https://dados-abertos.apps.tcu.gov.br/` | Não | Sanções, CADIRREG, acórdãos |
| 10 | **BrasilAPI** | `https://brasilapi.com.br/api/` | Não | CNPJ, bancos, CEP, câmbio |

### 5.2 APIs de IDH e Contexto Social

| # | API | URL | Dados |
|---|-----|-----|-------|
| 11 | **Atlas Brasil (PNUD)** | `http://www.atlasbrasil.org.br/acervo/atlas` | IDH municipal 1991-2021, 120+ indicadores ODS |
| 12 | **INEP — IDEB** | `https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb` | IDEB por município 2005-2023 |
| 13 | **CNES — Saúde** | `https://cnes.datasus.gov.br` + FTP `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/` | Leitos SUS, estabelecimentos, profissionais |
| 14 | **SINISA — Saneamento** | `https://app4.mdr.gov.br/serieHistorica/` | % cobertura água/esgoto por município |
| 15 | **Base dos Dados (BD)** | `basedosdados.org` → BigQuery `basedosdados` | Censo 2022, IDEB, RAIS, SNIS já prontos em BQ |

### 5.3 Endpoints Detalhados — Câmara dos Deputados

```
Base: https://dadosabertos.camara.leg.br/api/v2/

GET /deputados                          → Lista completa com filtros (uf, partido, legislatura)
GET /deputados/{id}                     → Perfil completo + foto URL
GET /deputados/{id}/despesas            → CEAP item a item (cnpj, valor, data, tipo)
GET /deputados/{id}/votacoes            → Votações do parlamentar
GET /deputados/{id}/eventos             → Agenda individual (comissões, plenário)
GET /deputados/{id}/mandatos            → Histórico de mandatos e legislaturas
GET /votacoes                           → Listagem paginada de votações (?dataInicio=&dataFim=)
GET /votacoes/{id}                      → Detalhes + proposição referenciada
GET /votacoes/{id}/votos                → Voto de CADA deputado (SIM/NAO/ABSTENCAO/AUSENTE)
GET /eventos                            → Agenda geral por data (plenário + comissões)
GET /proposicoes/{id}                   → Detalhes de PL/MP/PEC
GET /partidos                           → Lista de partidos com IDs
```

### 5.4 Endpoints Detalhados — Transferegov (Emendas PIX)

```
Base: https://docs.api.transferegov.gestao.gov.br/transferenciasespeciais/

GET /emendas?ano=&autor=&municipio={codIbge}&pagina=   → Lista emendas com valores
GET /emendas/{id}                                       → Detalhe completo da emenda
GET /emendas/{id}/planos-acao                           → Planos de trabalho vinculados
GET /municipios?uf={uf}&pagina=                         → Municípios com emendas por UF
GET /executor_especial                                  → Dados bancários dos entes executores
GET /relatorio_gestao_novo_especial                     → Execução orçamentária detalhada
```

### 5.5 IBGE — SIDRA — Cheat Sheet de Tabelas

```
Formato: https://apisidra.ibge.gov.br/values/t/{tabela}/n6/all/v/{variavel}/p/{periodo}

t/9514  → Censo 2022: população por município, sexo, faixa etária
t/6579  → Estimativa populacional anual (mais recente)
t/9605  → Domicílios Censo 2022 (saneamento, tipo)
t/7358  → Taxa de mortalidade infantil por município
t/7421  → Esperança de vida ao nascer
t/6691  → PIB per capita municipal
t/1209  → Área territorial dos municípios (km²)
t/6318  → Taxa de desocupação (PNAD)

EXEMPLO — Pará, todos municípios, população Censo 2022:
https://apisidra.ibge.gov.br/values/t/9514/n6/1500107,1501402,1502103/v/93/p/2022/c2/6794
```

### 5.6 Diários Oficiais — Monitoramento Automatizado

```
Federal (DOU — INLABS):  https://inlabs.in.gov.br  → Gratuito, cadastro, XML completo
Pará (IOEPA):            https://www.ioepa.com.br  → Scraping + extração de nomeações
Belém (Diário Municipal): https://dom.belem.pa.gov.br → Contratos, licitações municipais

Ro-DOU (alertas): https://github.com/planojr/ro-dou → Referência para triggers por palavra-chave
```

---

## 6. MEGA BLOCO 2 — MAPA FORENSE DE EMENDAS

> Este é o próximo grande entregável. O objetivo é superar visualmente o concorrente "De Olho em Você" entregando um mapa choroplético municipal com PMTiles, toggle por modalidade de emenda e hover cards com dados reais.

### 6.1 Arquitetura do Mapa

```
[ETL Cloud Function] → BigQuery (fato_emenda_pix + fato_emenda_rp6)
       ↓
[Scheduled Query: vm_emendas_por_municipio] → Agregação por cod_ibge
       ↓
[Cloud Function: exportMapData] → JSON por UF → Cloud Storage CDN
       ↓
[Frontend: MapaPage] → MapLibre GL JS lê JSON de CDN
       ↓
[PMTiles CDN] → Geometria municipal (tiles já configurados)
       ↓
[Choropleth ColorBrewer YlOrRd] + [Hover Cards] + [Legend]
```

### 6.2 Componente React — Mapa de Emendas

```jsx
// frontend/src/components/maps/EmendasChoroMap.jsx
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import { useQuery } from '@tanstack/react-query';
import { scaleQuantile } from 'd3-scale';
import { schemeYlOrRd } from 'd3-scale-chromatic';

const PALETA_YL_OR_RD = schemeYlOrRd[7]; // 7 classes de cor

export function EmendasChoroMap({ parlamentarId = null, modalidade = 'TODAS', ano = 2025 }) {
  const { data: emendasData } = useQuery({
    queryKey: ['emendas-mapa', parlamentarId, modalidade, ano],
    queryFn: () => fetchEmendasAgregadas({ parlamentarId, modalidade, ano }),
    staleTime: 1000 * 60 * 60, // 1h cache
  });

  const scale = useMemo(() => {
    if (!emendasData) return null;
    const valores = Object.values(emendasData).map(d => d.total_pago);
    return scaleQuantile().domain(valores).range(PALETA_YL_OR_RD);
  }, [emendasData]);

  const fillColor = useMemo(() => {
    if (!scale || !emendasData) return '#e0e0e0';
    const matchExpr = ['match', ['get', 'codarea']];
    Object.entries(emendasData).forEach(([cod, dados]) => {
      matchExpr.push(cod, scale(dados.total_pago));
    });
    matchExpr.push('#e0e0e0'); // default
    return matchExpr;
  }, [scale, emendasData]);

  const [hoverInfo, setHoverInfo] = useState(null);

  return (
    <div className="relative w-full h-full">
      <Map
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        initialViewState={{ longitude: -53, latitude: -14, zoom: 4 }}
      >
        <Source id="municipios" type="vector" url={import.meta.env.VITE_BR_PM_TILES_URL}>
          <Layer
            id="municipios-fill"
            type="fill"
            source-layer={import.meta.env.VITE_PM_TILES_SOURCE_LAYER}
            paint={{ 'fill-color': fillColor, 'fill-opacity': 0.8 }}
          />
          <Layer
            id="municipios-line"
            type="line"
            source-layer={import.meta.env.VITE_PM_TILES_SOURCE_LAYER}
            paint={{ 'line-color': '#ffffff', 'line-width': 0.3, 'line-opacity': 0.4 }}
          />
        </Source>
      </Map>

      {/* Hover Card */}
      {hoverInfo && (
        <div
          className="absolute bg-gray-900 text-white p-3 rounded-lg shadow-xl text-sm pointer-events-none z-50"
          style={{ left: hoverInfo.x + 10, top: hoverInfo.y - 10 }}
        >
          <p className="font-bold text-base">{hoverInfo.nome}</p>
          <p className="text-gray-300">{hoverInfo.uf}</p>
          <div className="mt-2 space-y-1">
            <p>💰 Pago: <span className="text-green-400 font-semibold">
              {formatCurrency(hoverInfo.total_pago)}
            </span></p>
            <p>📋 Empenhado: <span className="text-yellow-400">
              {formatCurrency(hoverInfo.total_empenhado)}
            </span></p>
            <p>📊 Execução: <span className="text-blue-400">
              {hoverInfo.pct_execucao}%
            </span></p>
            <p>🏛️ Parlamentares: {hoverInfo.parlamentares_ativos}</p>
          </div>
        </div>
      )}

      {/* Legend */}
      <MapLegend paleta={PALETA_YL_OR_RD} scale={scale} />

      {/* Toggle Modalidade */}
      <ModalidadeToggle
        value={modalidade}
        options={['TODAS', 'PIX', 'RP6', 'RP7']}
        onChange={setModalidade}
      />
    </div>
  );
}
```

### 6.3 Sprints de Implementação

#### Sprint A — Fundação de Dados (2 semanas)
- [ ] Criar tabelas `fato_emenda_pix`, `fato_emenda_rp6` no BigQuery (schema acima)
- [ ] Cloud Function ETL para Transferegov (paginação automática)
- [ ] Cloud Function ETL para CGU/Portal Transparência (emendas RP6)
- [ ] View materializada `vm_emendas_por_municipio`
- [ ] Cloud Function `exportMapData` → salva JSON no Cloud Storage (CDN)
- [ ] Configurar `VITE_BR_PM_TILES_URL` no `.env.production`
- [ ] Tabela `dim_municipio` com DE-PARA cod_ibge 7 dígitos → todos os sistemas

#### Sprint B — Mapa Forense na UI (1 semana)
- [ ] Instalar `d3-scale`, `d3-scale-chromatic`
- [ ] Criar `EmendasChoroMap.jsx` (código acima como base)
- [ ] Nova rota `/mapa/emendas` em React Router
- [ ] Hover cards com totais financeiros por município
- [ ] Toggle PIX / RP6 / RP7 / Todas
- [ ] Legenda com 7 classes YlOrRd acessível (+ texto para daltonismo)
- [ ] Mobile: debounce 16ms no hover, lazy loading tiles por viewport

#### Sprint C — Unificação do Backend Forense (2 semanas)
- [ ] Exportar `oraculoFlow` e `dossieExecutivoFlow` em `functions/index.js`
- [ ] Decisão: manter `@google/generative-ai` OU migrar 100% para Vertex/Genkit (escolher uma via)
- [ ] Implementar `agente-nepotismo.js` real (cruzamento CEAP × TSE × folha salarial)
- [ ] Implementar Cloud Scheduler para scans periódicos (não full-scan)
- [ ] Popular `Section4Placeholder` com dados reais de correlação emenda×IDH
- [ ] Logs estruturados + alertas se `GEMINI_API_KEY` ausente em produção

---

## 7. BACKEND FORENSE — PLANO DE IMPLEMENTAÇÃO

### 7.1 Cloud Functions — Mapa de Exports

```javascript
// functions/index.js — exports completos alvo

// === JÁ EXISTENTES ===
exports.createCheckoutSession = ...;
exports.stripeWebhook = ...;
exports.grantRole = ...;
exports.listMyClaims = ...;
exports.syncBigQueryToFirestore = ...;
exports.retroactiveScanBigQueryToFirestore = ...;
exports.onDiarioAtoCreated = ...;

// === A ADICIONAR — Sprint C ===
exports.oraculo = onCall({ region: 'southamerica-east1' }, oraculoFlow);    // Vertex Gemini 2.5 Pro
exports.dossieExecutivo = onCall({ region: 'southamerica-east1' }, dossieExecutivoFlow);
exports.exportMapData = onSchedule('every 24 hours', exportMapDataJob);     // Gera JSON de mapa
exports.benfordScan = onSchedule('every 24 hours', benfordScanJob);         // Lei Benford diária
exports.nepoScan = onCall({ region: 'southamerica-east1' }, nepoScanAgent); // Nepotismo on-demand
exports.ingestTransferegov = onSchedule('every 6 hours', ingestTransferegovJob);
exports.ingestEmendas = onSchedule('every 6 hours', ingestEmendasCguJob);
```

### 7.2 ETL — Cloud Function Transferegov

```javascript
// functions/src/jobs/ingestTransferegovJob.js
import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch';

const BASE_URL = 'https://docs.api.transferegov.gestao.gov.br/transferenciasespeciais';
const bq = new BigQuery({ projectId: 'fiscallizapa' });

export async function ingestTransferegovJob() {
  const anos = [2023, 2024, 2025];
  const rows = [];

  for (const ano of anos) {
    let pagina = 1;
    let hasMore = true;

    while (hasMore) {
      const resp = await fetch(`${BASE_URL}/emendas?ano=${ano}&pagina=${pagina}&tamanhoPagina=100`);
      const data = await resp.json();

      if (!data.content || data.content.length === 0) {
        hasMore = false;
        break;
      }

      for (const emenda of data.content) {
        rows.push({
          id_emenda: emenda.idEmenda,
          nr_emenda: emenda.nrEmenda,
          ano_orcamento: ano,
          id_parlamentar: `CAMARA_${emenda.codAutor}`, // Normalizar para ID proprietário
          casa: 'CAMARA',
          cod_ibge: emenda.codIbge?.toString().padStart(7, '0'),
          uf_destino: emenda.uf,
          nome_municipio: emenda.nomeMunicipio,
          valor_indicado: emenda.valorIndicado || 0,
          valor_empenhado: emenda.valorEmpenhado || 0,
          valor_pago: emenda.valorPago || 0,
          valor_liquidado: emenda.valorLiquidado || 0,
          situacao_execucao: emenda.situacaoTransferencia || 'INDICADO',
          data_empenho: emenda.dataEmpenho ? emenda.dataEmpenho.substring(0, 10) : null,
          data_pagamento: emenda.dataPagamento ? emenda.dataPagamento.substring(0, 10) : null,
          objeto: emenda.objeto,
          _ingestao_at: new Date().toISOString(),
        });
      }

      hasMore = !data.last;
      pagina++;

      // Rate limiting respeitoso
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Batch insert no BigQuery (deduplicação por id_emenda)
  const table = bq.dataset('analytics').table('fato_emenda_pix');
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await table.insert(rows.slice(i, i + CHUNK_SIZE), { skipInvalidRows: true });
  }

  console.log(`✅ Transferegov: ${rows.length} emendas ingeridas`);
}
```

### 7.3 DE-PARA TSE ↔ IBGE ↔ Câmara (Chave de Ligação)

```sql
-- Criar tabela de-para para ligar TSE (5 dígitos) → IBGE (7 dígitos)
-- e candidato TSE → deputado Câmara via CPF hash
CREATE TABLE `fiscallizapa.analytics.de_para_municipios` AS
SELECT
  ibge.cod_ibge,
  ibge.cod_ibge_6,
  LPAD(CAST(tse.codigo_municipio_tse AS STRING), 5, '0') AS cod_tse_5,
  ibge.nome,
  ibge.uf
FROM `fiscallizapa.analytics.dim_municipio` ibge
JOIN `fiscallizapa.raw.tse_municipios` tse
  ON UPPER(ibge.nome) = UPPER(tse.nome_municipio)
  AND ibge.uf = tse.uf;

-- Candidatos TSE → Deputados Câmara (via CPF SHA-256)
CREATE TABLE `fiscallizapa.analytics.de_para_parlamentar_tse` AS
SELECT
  c.id_parlamentar,
  t.nr_cpf_candidato,
  SHA256(t.nr_cpf_candidato) AS cpf_hash,
  t.sg_partido,
  t.ano_eleicao,
  t.ds_cargo
FROM `fiscallizapa.raw.tse_candidatos` t
JOIN `fiscallizapa.analytics.dim_parlamentar` c
  ON SHA256(REGEXP_REPLACE(t.nr_cpf_candidato, r'[^0-9]', '')) = c.cpf_hash
  AND t.sg_partido = c.sigla_partido;
```

---

## 8. FRONTEND — HOTPAGE E UX SPEC

### 8.1 Hotpage do Parlamentar — Seções Completas

```
/parlamentar/{id}  →  Hotpage individual

┌─────────────────────────────────────────────────────┐
│  [HEADER] Foto · Nome · Partido · UF · Cargo        │
│  [BADGES] Score A.S.M.O.D.E.U.S. · Nível de Risco  │
│  [QUICK ACTIONS] Dossiê PDF · Compartilhar · Alerta │
├─────────────────────────────────────────────────────┤
│  TAB 1: EMENDAS                                     │
│    - Mapa choroplético dos municípios beneficiados   │
│    - Toggle: PIX / RP6 / RP7 / Todas                │
│    - Ranking de municípios por valor pago            │
│    - Timeline de execução orçamentária               │
├─────────────────────────────────────────────────────┤
│  TAB 2: GASTOS (CEAP)                               │
│    - Total anual vs média parlamentar               │
│    - Top 10 fornecedores (com CNPJ + alertas CEIS)  │
│    - Gráfico temporal por tipo de despesa           │
│    - Alertas Benford ativas                         │
├─────────────────────────────────────────────────────┤
│  TAB 3: VOTAÇÕES                                    │
│    - Últimas 20 votações com resultado              │
│    - Alinhamento com o partido (%)                   │
│    - Mapa: como votou nos temas mais polêmicos      │
│    - E.S.P.E.C.T.R.O.: posição ideológica calculada │
├─────────────────────────────────────────────────────┤
│  TAB 4: CONTRATOS & FORNECEDORES                    │
│    - Empresas que receberam da CEAP (rede de grafo) │
│    - Alertas: empresas em CEIS/CNEP                 │
│    - Empresas com sócios ligados ao parlamentar     │
├─────────────────────────────────────────────────────┤
│  TAB 5: DOSSIÊ FORENSE                              │
│    - Relatório A.S.M.O.D.E.U.S. completo           │
│    - Flags ativas com evidências                   │
│    - Gerar PDF (consome créditos)                   │
│    - Seção 4: Correlação emendas × IDH municipal    │
└─────────────────────────────────────────────────────┘
```

### 8.2 Rotas Alvo (React Router 7)

```javascript
// frontend/src/routes/index.jsx
const routes = [
  { path: '/', element: <HomePage /> },                          // UniverseGraph 3D
  { path: '/mapa', element: <MapaPage /> },                      // Mapa alertas por UF
  { path: '/mapa/emendas', element: <MapaEmendasPage /> },       // Mapa emendas municipal ← NOVO
  { path: '/parlamentar/:id', element: <HotPage /> },            // Perfil completo
  { path: '/ranking', element: <RankingPage /> },                // Ranking geral
  { path: '/votacoes', element: <VotacoesPage /> },              // Feed de votações
  { path: '/votacoes/:id', element: <VotacaoDetailPage /> },     // Votação individual
  { path: '/dossie/:id', element: <DossiePage /> },              // Dossiê forense
  { path: '/agenda', element: <AgendaPage /> },                  // Agenda do dia
  { path: '/alertas', element: <AlertasPage /> },                // Alertas A.S.M.O.D.E.U.S.
  { path: '/login', element: <LoginPage /> },
  { path: '/painel', element: <DashboardLayout /> },             // Admin/operacional
];
```

### 8.3 SEO — Meta Tags por Parlamentar (ISR)

```javascript
// O concorrente falha aqui: meta tag genérica para todos os parlamentares
// TransparênciaBR deve gerar meta tag única por deputado → dominar Google

// Em: frontend/src/pages/HotPage.jsx
useEffect(() => {
  if (parlamentar) {
    document.title = `${parlamentar.nomeCompleto} | TransparênciaBR`;
    
    // Open Graph
    setMeta('og:title', `${parlamentar.nomeCompleto} — Dados e Alertas | TransparênciaBR`);
    setMeta('og:description',
      `Veja gastos, emendas, votações e score forense de ${parlamentar.nomeCompleto} ` +
      `(${parlamentar.siglaPartido}-${parlamentar.uf}). Score A.S.M.O.D.E.U.S.: ${parlamentar.scoreAsmodeus}/100`
    );
    setMeta('og:image', parlamentar.fotoUrl);
    
    // Canonical para indexação
    setCanonical(`https://transparenciabr.com.br/parlamentar/${parlamentar.id}`);
  }
}, [parlamentar]);
```

---

## 9. MONETIZAÇÃO FREEMIUM

### 9.1 Modelo de Créditos Atômicos

| Ação | Créditos | Tier mínimo |
|------|----------|-------------|
| Ver hotpage básica (emendas + CEAP) | 0 | Gratuito |
| Ver votações nominais | 0 | Gratuito |
| Dossiê forense completo | 50 créditos | Free (recebe 100/mês) |
| Gerar PDF forense | 100 créditos | Free ou Oráculo |
| Relatório de correlação emenda×IDH | 200 créditos | Oráculo |
| Análise Gemini de contrato (PDF upload) | 300 créditos | Oráculo |
| Acesso a `dossies_factuais` | ∞ | God Mode |
| API key para uso externo | — | Premium R$99/mês |

### 9.2 Tiers

```
GRATUITO     → 100 créditos/mês, todas hotpages, mapas, votações
ORÁCULO      → R$29/mês | 2.000 créditos | PDF ilimitado | Sem ads
PREMIUM      → R$99/mês | 10.000 créditos | API key | Alertas push
GOD MODE     → R$299/mês | Ilimitado | dossies_factuais | SLA
PLAN JORNALISTA → Negociação | Exportação em massa | Créditos custom
```

### 9.3 Stripe Integration (já implementada)

O Stripe já está em `functions/index.js` (`createCheckoutSession` + `stripeWebhook`). O hook `grantRole` já existe. Próximos passos:
- Mapear `price_id` do Stripe para cada tier acima
- Criar custom claims Firebase: `{ tier: 'oraculo', creditos: 2000 }`
- Dedutar créditos via `useUserCredits` hook (já existe)
- Reset diário de créditos para tier gratuito (Cloud Scheduler)

---

## 10. SPRINT ROADMAP — PRÓXIMAS 6 SEMANAS

```
SEMANA 1-2:  Sprint A — Dados geográficos emendas
  ├── ETL Transferegov → BigQuery (fato_emenda_pix)
  ├── ETL CGU/RP6 → BigQuery (fato_emenda_rp6)
  ├── View materializada vm_emendas_por_municipio
  ├── Cloud Function exportMapData → Cloud Storage JSON
  └── Configurar VITE_BR_PM_TILES_URL em produção

SEMANA 3:    Sprint B — Mapa forense na UI
  ├── EmendasChoroMap.jsx (MapLibre + PMTiles + YlOrRd)
  ├── Rota /mapa/emendas
  ├── Hover cards com totais financeiros
  ├── Toggle PIX/RP6/Todas
  └── Testes mobile (60fps validado)

SEMANA 4-5:  Sprint C — Backend forense unificado
  ├── Exportar oraculoFlow e dossieExecutivoFlow em index.js
  ├── Implementar agente-nepotismo.js real
  ├── Cloud Scheduler para scans automáticos
  ├── Popular Section4Placeholder com correlação emenda×IDH
  └── Logs estruturados + alertas produção

SEMANA 6:    Sprint D — SEO + Monetização + QA
  ├── Meta tags únicas por parlamentar (ISR)
  ├── Sitemap dinâmico dos 594 parlamentares
  ├── Tiers Stripe mapeados corretamente
  ├── Testes E2E das rotas principais
  └── Consistência Firebase: definir projeto final (fiscallizapa)
```

---

## 11. GAP ANALYSIS VS CONCORRÊNCIA

### 11.1 O Que o Concorrente Tem (Paridade Necessária)
- [x] ✅ Hotpage por deputado (temos, mais completa)
- [x] ✅ Mapa de emendas PIX (em Sprint B)
- [x] ✅ Ranking de gastos parlamentares (temos)
- [x] ✅ Votações nominais (temos)
- [ ] ⏳ Mapa coroplético por município (Sprint B)

### 11.2 O Que Só o TransparênciaBR Tem
- [ ] Emendas RP6 + RP7 + RP8 + RP9 no mapa (Sprint A)
- [ ] Score A.S.M.O.D.E.U.S. com algoritmos ML
- [ ] Lei Benford aplicada em CEAP
- [ ] Detecção de rachadinha (Protocolo FLAVIO)
- [ ] Análise Gemini de PDFs de contratos
- [ ] Grafo 3D de relações (UniverseGraph)
- [ ] Mapa de base eleitoral TSE → município
- [ ] Correlação emenda × IDH municipal
- [ ] Dossiê PDF forense gerado por IA
- [ ] SEO por parlamentar (domina Google)
- [ ] Sistema de créditos + monetização

---

## 12. GLOSSÁRIO TÉCNICO

| Termo | Definição |
|-------|-----------|
| **A.S.M.O.D.E.U.S.** | Automação de Sistemas de Monitoramento e Detecção de Esquemas no Uso de Subsídios — protocolo forense central |
| **CEAP** | Cota para o Exercício da Atividade Parlamentar — verba de gabinete dos deputados |
| **CEIS** | Cadastro de Empresas Inidôneas e Suspensas (CGU) |
| **CNEP** | Cadastro Nacional de Empresas Punidas — Lei Anticorrupção |
| **CADIRREG** | Cadastro de Responsáveis com Contas Julgadas Irregulares (TCU) |
| **E.S.P.E.C.T.R.O.** | Módulo de posicionamento ideológico por comportamento de voto real |
| **F.L.A.V.I.O.** | Funcionários Lotados Ausentes Via Irregularidade Oculta — detecção de rachadinha |
| **D.R.A.C.U.L.A.** | Operação de detecção de desvios em contratos de saúde pública |
| **ICS** | Índice de Corrupção em Saúde — score 0-100 para contratos com OSS/hospitais |
| **RP6** | Emenda Individual Impositiva |
| **RP7** | Emenda de Bancada Estadual |
| **RP8** | Emenda de Comissão |
| **RP9** | Emenda de Relator ("Orçamento Secreto", extinto pela ADPF 854) |
| **RP99** | Transferências Especiais ("Emendas PIX") |
| **PMTiles** | Formato de vector tiles em arquivo único, servido de CDN — substitui GeoJSON para mapas |
| **Lei de Benford** | Distribuição logarítmica de primeiros dígitos em dados financeiros naturais — desvios indicam manipulação |
| **ARIMA_PLUS** | Modelo BigQuery ML para detecção de anomalias em séries temporais |
| **K-Means** | Algoritmo de clustering para agrupar fornecedores por perfil de risco |

---

*Documento gerado em 2026-04-27 22:28 BRT*  
*Próxima revisão: após Sprint A (estimativa 2026-05-11)*  
*Comando: iniciar Sprint A — ETL Transferegov + BigQuery*
