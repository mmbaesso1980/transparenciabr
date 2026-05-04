# BRIEFING VERTEX — Sprint 4: Reestruturação de Páginas + Novas Hotpages
**Gerado por:** Perplexity AI + Comandante  
**Data:** 2026-05-04  
**Agente executor:** agent_1777236402725 (Vertex AI Jules)  
**Repositório:** mmbaesso1980/transparenciabr  
**Prioridade:** CRÍTICA — bloqueia lançamento público

---

## DIAGNÓSTICO DAS PÁGINAS EXISTENTES

### ✅ MANTER SEM ALTERAÇÃO ESTRUTURAL
| Página | Motivo |
|--------|--------|
| `HomePage.jsx` | Vitrine pública com universo 3D, busca, orbes-portal — **bem construída**. Ajustes pontuais apenas (ver seção 1). |
| `UniversePage.jsx` | Motor central animado. Gerar versão estática paralela (ver seção 2). |
| `CreditosPage.jsx` | Página de cobrança Stripe — checar se fluxo está funcional, não reescrever. |
| `LoginPage.jsx` | Funcional. |
| `RadarJuridico.jsx` | Mais robusto do projeto (42kb) — manter. |
| `DossiePage.jsx` | Base para nova PoliticoPage (ver seção 3 — TRANSFORMAR, não apagar). |

### ❌ APAGAR (confirmar rota inexistente antes de deletar)
| Página | Motivo |
|--------|--------|
| `RankingPage.jsx` | Obsoleta — funcionalidade absorvida pelo UniversePage e PoliticoPage. |
| `RadarPage.jsx` | Obsoleta — substituída por RadarJuridico. |
| `PainelMestrePage.jsx` | Obsoleta se as novas hotpages cobrirem o conteúdo. Verificar se há rota ativa em `App.jsx` — se sim, redirecionar para `/universo` antes de apagar. |
| `OperationsOverviewPage.jsx` | Obsoleta — conteúdo de ops vai para StatusPage estática (seção 2). |
| `AlvosPage.jsx` | Funcional mas redundante — lista de parlamentares por score AURORA vai integrar a UniversePage e o ranking da PoliticoPage. Se rota `/alvos` ainda usada, redirecionar para `/universo`. |
| `LandingComercial.jsx` | Stub de 2kb — substituir por `PartidoPage.jsx` (ver seção 6). |

### ⚠️ TRANSFORMAR / EXPANDIR
| Página | Ação |
|--------|------|
| `DossiePage.jsx` | Tornar a PoliticoPage completa (ver seção 3) |
| `PerfilPage.jsx` | Expandir para Hotpage Pessoal completa (ver seção 4) |
| `LandingPage.jsx` | **NÃO APAGAR** — é a vitrine pública `/`. Ajustes pontuais (seção 1). |
| `MapaPage.jsx` | Elaborar como mapa interativo forense (seção 5) |
| `AlertasPage.jsx` | Expandir para SOC completo (seção 7) |

### ❌ STUBS — IMPLEMENTAR CONTEÚDO REAL
| Página | Conteúdo Necessário |
|--------|---------------------|
| `MetodologiaPage.jsx` | Explicação da metodologia de scoring AURORA, fontes, pesos, disclaimer |
| `SobrePage.jsx` | Missão, equipe, contato para jornalistas, financiamento |
| `PrivacidadePage.jsx` | Política de privacidade completa com base legal LGPD art. 7º IX |
| `TermosPage.jsx` | Termos de Uso com cláusula de aceite obrigatório no cadastro |

---

## SEÇÃO 1 — AJUSTES PONTUAIS NA HomePage.jsx

A `LandingPage.jsx` (rota `/`) já está excelente. Ajustes pontuais necessários:

1. **Contador real de dados:** substituir os valores fixos `513 deputados, 81 senadores, 5.569 municípios` por dados dinâmicos vindos do hook `useLandingKPIs()` — se o hook já retorna esses valores, garantir que estão conectados.
2. **CTA de assinatura:** o botão "Entrar" leva ao `/login` — adicionar um segundo CTA para `/creditos` (assinar plano) visível apenas para usuários não autenticados.
3. **Badge de atualização:** o `updatedBadge` já existe mas só aparece se `kpiFresh` — validar que o pipeline está alimentando `landing_kpis` no Firestore corretamente.
4. **SEO/OG:** adicionar `og:image` com card gerado dinamicamente ou estático da plataforma.
5. **Footer:** adicionar links para `/privacidade`, `/termos`, `/metodologia` — hoje estão ausentes na LandingPage.

---

## SEÇÃO 2 — StatusPage.jsx (versão estática do Universo)

**Criar:** `frontend/src/pages/StatusPage.jsx`  
**Rota:** `/status`  
**Conceito:** mesmos dados do UniversePage mas SEM animações Three.js. Página de carregamento rápido, ideal para mobile e SEO.

### Conteúdo (sem animações):
```
[ HEADER ]
  - Logo + "Status Operacional — TransparênciaBR"
  - Timestamp última atualização do pipeline

[ GRID DE STATS — 6 cards estáticos ]
  - Total de parlamentares monitorados
  - Total de notas CEAP processadas
  - Total de alertas gerados (motor AURORA)
  - Emendas PIX mapeadas
  - Contratos PNCP auditados
  - Inconsistências detectadas este mês

[ TABELA: STATUS DOS PIPELINES ]
  - CEAP Câmara: último run, status (✅/⚠️/❌), próxima execução
  - Emendas PIX: idem
  - Contratos PNCP: idem
  - Portal Transparência: idem
  - BigDataCorp KYC: idem (quando integrado)

[ LISTA: TOP 10 PARLAMENTARES MAIOR RISCO ]
  - Tabela estática com nome, partido, UF, score AURORA, nº alertas
  - Link para /dossie/:id em cada linha

[ RODAPÉ LGPD ]
  - Disclaimer padrão do projeto
```

**Fonte de dados:** Firestore `status_operacional` (criar coleção se não existir) + `politicos` (top 10 por score).

---

## SEÇÃO 3 — PoliticoPage.jsx (Hotpage do Político — PRINCIPAL)

**Transformar:** `DossiePage.jsx` → `PoliticoPage.jsx`  
**Rota:** `/politico/:id`  
**Conceito:** Perfil completo público + Bento Boxes + venda do Dossiê Completo (200 créditos)

### ESTRUTURA DA PÁGINA

```
[ HERO — ACIMA DO FOLD ]
  ┌─────────────────────────────────────────────────────────┐
  │ Foto oficial (API Câmara)  │ Nome completo               │
  │ PoliticianOrb animado      │ Partido · UF · Mandato      │
  │                            │ Votos recebidos: XX.XXX     │
  │                            │ Custo por voto: R$ XX,XX    │
  │                            │ Gasto campanha: R$ XXX.XXX  │
  │                            │ [ VER MAPA ELEITORAL → ]    │
  └─────────────────────────────────────────────────────────┘

[ SCORE AURORA — GAUGE ANIMADO ]
  Score de risco: 0-100  |  Posição no ranking nacional
  [#XX] ← 3 acima (nomes clicáveis) → [#XX+3]

[ BENTO BOXES — GRID 3x2 ]

  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ 💰 GASTOS CEAP      │  │ 🏛️ GABINETE          │  │ 📊 ESPECTRO POLÍTICO│
  │ Total: R$ XXX.XXX   │  │ Nº assessores: XX    │  │ Radar de posições   │
  │ [EXPANDIR — PAGO]   │  │ Folha: R$ XXX.XXX/mês│  │ (RadarChart 8 eixos)│
  │ Nota a nota, link   │  │ [EXPANDIR — PAGO]    │  │ Livre ← → Conserv. │
  │ direto transparencia│  │ CPFs + vínculos      │  │                     │
  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘

  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ 💊 EMENDAS          │  │ 📋 PRODUTIVIDADE     │  │ ⚠️ RISCO JURÍDICO   │
  │ Discricionárias: R$ │  │ Presença: XX%        │  │ Processos: XX       │
  │ De bancada: R$      │  │ Proposições: XX      │  │ Bens: R$ XXX.XXX    │
  │ Emendas PIX: R$     │  │ Comissões: XX        │  │ Ficha limpa: ✅/❌   │
  │ [EXPANDIR — PAGO]   │  │ Discursos: XX        │  │ [VER RADAR JURÍDICO]│
  │ Linha a linha       │  │ Agenda pública       │  │                     │
  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘

[ INCONSISTÊNCIAS DETECTADAS ]
  "Motor AURORA detectou X inconsistências neste mandato"
  Preview das 3 principais (resumo 1 linha cada)
  [ DESBLOQUEAR DOSSIÊ COMPLETO — 200 CRÉDITOS ]
    → Abre DossiePage.jsx existente (manter como subpágina premium)

[ DOSSIÊ COMPLETO — CTA FINAL ]
  Card escurecido com cadeado
  "Acesse nota a nota, vínculos societários, análise Gemini e relatório forense completo"
  Botão: "Gerar Dossiê Completo — 200 Créditos"
```

### BENTO BOX "GASTOS CEAP" — DETALHAMENTO (versão expandida paga):
- Tabela com: Data | Descrição | Fornecedor | CNPJ | Valor | Link direto para nota no Portal da Transparência
- Filtros: categoria (combustível, alimentação, hospedagem, etc.), período, valor
- Badge de risco AURORA em cada nota (🟢🟡🔴)

### BENTO BOX "EMENDAS" — DETALHAMENTO (versão expandida paga):
- Tabela: Tipo (Discricionária/Bancada/PIX) | Beneficiário | Município | Valor indicado | Valor empenhado | Valor pago
- Filtro por tipo de emenda e estado
- Link para mapa de distribuição geográfica

### FONTE DE DADOS:
- Hero: `politicos/{id}` no Firestore
- Votos/campanha: TSE (via pipeline já existente ou a criar)
- Bento Boxes free: `politicos/{id}` campos agregados
- Bento Boxes pagos: `transparency_reports/{id}` + `dossies_factuais/{id}`
- Score/ranking: campo `indice_risco_aurora` de `politicos`

---

## SEÇÃO 4 — PerfilPage.jsx (Hotpage Pessoal — EXPANDIR)

**Expandir:** `PerfilPage.jsx` (atual 4.7kb — raso)  
**Rota:** `/perfil`  
**Conceito:** Dashboard pessoal do usuário investigador

### ESTRUTURA:
```
[ HEADER DO USUÁRIO ]
  UserOrb | Nome | Email | Plano atual (Freemium/Pro/GOD)
  Créditos disponíveis (gauge visual) | Renovação em: XX horas

[ TABS ]
  [ Minha Conta ] [ Extrato de Créditos ] [ Meus Dossiês ] [ Segurança ]

TAB: MINHA CONTA
  - Dados do perfil (nome, email, data de cadastro)
  - Plano atual + botão upgrade
  - Histórico de pagamentos

TAB: EXTRATO DE CRÉDITOS
  - Tabela cronológica: Data | Operação | Créditos consumidos/ganhos | Saldo
  - Operações: Login diário (+300), Dossiê gerado (-200), Upgrade (+bonus), etc.
  - Gráfico de consumo últimos 30 dias (Recharts LineChart)

TAB: MEUS DOSSIÊS
  - Grid de cards dos dossiês já gerados
  - Card: Foto político | Nome | Data geração | Status (completo/processando)
  - Botões: [ Ver Dossiê ] [ Baixar PDF ] [ Compartilhar Link ]
  - Busca e filtro por data/nome

TAB: SEGURANÇA
  - Alterar senha
  - Encerrar sessão em todos os dispositivos
  - Solicitar exclusão de conta (LGPD art. 18)
  - Download de todos os dados pessoais (LGPD art. 20)
```

### FONTE DE DADOS:
- `usuarios/{uid}`: créditos, plano, datas
- `usuarios/{uid}/extrato_creditos` (subcoleção a criar): transações de crédito
- `dossies_factuais` filtrado por `uid_dono`

---

## SEÇÃO 5 — MapaPage.jsx (ELABORAR — Mapa Interativo Forense)

**Elaborar:** `MapaPage.jsx` (atual 5kb — incipiente)  
**Rota:** `/mapa` + subrota via PoliticoPage: `/politico/:id/mapa`

### MODO 1 — Mapa Nacional (acesso via /mapa)
- Choropleth por UF/município com heatmap de gastos CEAP + emendas
- Paleta YlOrRd (ColorBrewer)
- Hover card: município, total emendas, total CEAP, nº alertas, parlamentar principal
- Toggle: [ Emendas PIX ] [ CEAP ] [ Contratos ] [ Risco AURORA ]
- Filtro por período e tipo de parlamentar

### MODO 2 — Mapa Eleitoral do Político (acesso via VER MAPA na PoliticoPage)
- Mapa do Brasil com municípios coloridos por % de votos recebidos (TSE)
- Overlay de emendas enviadas para cada município
- Correlação visual: municípios que receberam mais emendas vs municípios que deram mais votos
- Detecta automaticamente "troca de favores" geoespacial

### INFRAESTRUTURA EXISTENTE (não reinventar):
- `maplibre-gl`, `pmtiles`, `deck.gl` já em `package.json` (ver ROADMAP_VERTEX.md seção 2)
- `BrazilHeatmap` e `BrazilUFTileMap` já existem como componentes
- Variáveis `VITE_BR_PM_TILES_URL`, `VITE_PM_TILES_SOURCE_LAYER` já mapeadas

---

## SEÇÃO 6 — PartidoPage.jsx (NOVA — substituir LandingComercial.jsx)

**Criar:** `frontend/src/pages/PartidoPage.jsx`  
**Apagar:** `LandingComercial.jsx` após criação  
**Rota:** `/partido/:sigla`

### ESTRUTURA:
```
[ HERO ]
  Brasão do partido (imagem da API TSE ou asset estático)
  Nome completo | Sigla | Número eleitoral | Fundação
  Presidente nacional | Sede

[ STATS GRID — 4 cards ]
  Parlamentares federais ativos: XX
  Governadores: XX
  Prefeitos: XX
  Vereadores: XX

[ FUNDO ELEITORAL — TABELA DESCRITA ]
  Ano | Fundo Partidário (R$) | Fundo Eleitoral (R$) | Total recebido
  Linha a linha por eleição (2018, 2020, 2022, 2024)

[ DESEMPENHO ELEITORAL ]
  Gráfico de barras: votos nas últimas 4 eleições
  Câmara Federal: X cadeiras (evolução)
  Senado: X cadeiras (evolução)

[ PARLAMENTARES DO PARTIDO — TOP 20 por Score ]
  Grid de mini-cards com PoliticianOrb + nome + UF + score AURORA
  Link para /politico/:id em cada card
  [ Ver todos os parlamentares do partido → ]

[ GASTOS CONSOLIDADOS DO PARTIDO ]
  Total CEAP de todos os membros: R$ XXX.XXX.XXX
  Média por parlamentar: R$ XX.XXX
  Top 3 maiores gastos do partido

[ RADAR DE COERÊNCIA INTERNA ]
  % de votos em bloco (disciplina partidária)
  Proposições do partido em pauta
```

### FONTE DE DADOS:
- TSE (via pipeline) para votos e fundo eleitoral
- `politicos` filtrado por `partido === sigla` para parlamentares
- Agregar CEAP por partido no BigQuery

---

## SEÇÃO 7 — AlertasPage.jsx (EXPANDIR para SOC completo)

**Expandir:** `AlertasPage.jsx` (atual 6kb — subdesenvolvida)  
**Rota:** `/alertas`  
**Referência:** PLANO_CEAP_INVESTIGATIVO.md e PLANO_MESTRE_V3.md no repositório

### ESTRUTURA SOC:
```
[ HEADER SOC ]
  "Centro de Operações de Segurança Cívica"
  Timestamp última varredura | Status do pipeline AURORA

[ FILTROS ]
  Tipo: [ Nepotismo ] [ Fracionamento ] [ CNPJ Suspeito ] [ Emenda Atípica ] [ CEAP Alto Risco ]
  Severidade: [ 🔴 Crítico ] [ 🟠 Alto ] [ 🟡 Médio ] [ 🟢 Baixo ]
  Período: date picker
  Parlamentar: busca autocomplete
  Estado: dropdown UF

[ FEED DE ALERTAS — cards ]
  Card: Timestamp | Tipo | Severidade | Parlamentar | Descrição curta
        Valor envolvido | [ Investigar → /politico/:id ] [ Exportar ]

[ PAINEL DE MÉTRICAS SOC ]
  Alertas hoje: XX | Esta semana: XX | Este mês: XX
  Distribuição por tipo (donut chart)
  Parlamentares com mais alertas (top 5, mini-ranking)

[ EXPORTAÇÃO ]
  Botões: [ Exportar CSV ] [ Exportar PDF ] [ Compartilhar Relatório ]
```

### LGPD/COMPLIANCE:
- Disclaimer fixo no footer (já existente em AlvosPage — reusar padrão)
- Todo acesso ao feed de alertas detalhado: requer autenticação
- Logs de acesso gravados em Firestore `audit_trail` (Admin SDK)
- Conteúdo de processos LGPD em `/privacidade` com aceite obrigatório no cadastro

---

## SEÇÃO 8 — PAGES STUB (IMPLEMENTAR CONTEÚDO REAL)

### PrivacidadePage.jsx + TermosPage.jsx
- **Aceite obrigatório:** na `LoginPage.jsx`, antes de criar conta, adicionar checkbox "Li e aceito os [Termos de Uso] e a [Política de Privacidade]" — ambos como links que abrem modal ou nova aba.
- **Base legal LGPD:** art. 7º, IX (interesse público) + art. 7º, II (execução de políticas públicas)
- **Conteúdo mínimo TermosPage:** definição de créditos, vedação de uso para perseguição pessoal, isenção de responsabilidade por dados de terceiros, DMCA
- **Conteúdo mínimo PrivacidadePage:** dados coletados, finalidade, retenção 180 dias (payload bruto), direitos do titular (arts. 17-22 LGPD), DPO de contato

### MetodologiaPage.jsx
- Como o motor AURORA calcula o score (pesos documentados)
- Fontes de dados (Portal Transparência, TSE, Receita Federal, etc.)
- Disclaimer jornalístico (dados são fatos, não acusações)
- Atualização e periodicidade dos dados

### SobrePage.jsx
- Missão do projeto
- Contato para jornalistas e pesquisadores
- Como contribuir/reportar erros
- Financiamento e independência editorial

---

## SEÇÃO 9 — LIMPEZA DE ROTAS (App.jsx)

Antes de apagar qualquer arquivo, verificar em `App.jsx` quais rotas estão ativas. Para cada página obsoleta:
1. Remover a rota do `App.jsx`
2. Adicionar redirect: `<Route path="/alvos" element={<Navigate to="/universo" replace />} />`
3. Deletar o arquivo .jsx após confirmar redirect funcionando

Rotas a redirecionar:
- `/alvos` → `/universo`
- `/painel` → `/universo` (se PainelMestrePage obsoleta)
- `/radar` → `/radar-juridico` (se RadarPage obsoleta)
- `/ranking` → `/universo` (se RankingPage obsoleta)

---

## ORDEM DE EXECUÇÃO SUGERIDA (Vertex)

1. **Ler** `App.jsx` para mapear todas as rotas ativas
2. **Criar** `StatusPage.jsx` (seção 2) — sem dependências externas
3. **Criar** `PartidoPage.jsx` (seção 6) — substituir LandingComercial
4. **Expandir** `PerfilPage.jsx` (seção 4) — extrato + dossiês
5. **Adicionar redirects** em App.jsx para páginas obsoletas
6. **Transformar** `DossiePage.jsx` → base da `PoliticoPage.jsx` (seção 3) — maior complexidade
7. **Elaborar** `MapaPage.jsx` (seção 5) — reuso de componentes existentes
8. **Expandir** `AlertasPage.jsx` (seção 7) — SOC completo
9. **Implementar stubs** MetodologiaPage, SobrePage, PrivacidadePage, TermosPage (seção 8)
10. **Deletar** páginas obsoletas após confirmação de redirects

---

## NOTAS FINAIS PARA O VERTEX

- **NÃO reinventar** componentes existentes: `PoliticianOrb`, `BrandLogo`, `UserOrb`, `LandingHeroGraph`, `BrazilHeatmap` estão prontos — reusar.
- **NÃO quebrar** o fluxo de autenticação existente em `AuthContext.jsx`.
- **NÃO expor** chaves de API no frontend — todas via Cloud Functions intermediárias.
- **MANTER** o padrão visual: dark mode `#02040a`/`#0d1117`, azul `#58A6FF`, amarelo `#FDE047`, verde-ciano `#7DD3FC`.
- **MANTER** Tailwind 4 + paleta de cores existente em `index.css`.
- Créditos do Dossiê = **200 créditos** (confirmado pelo Comandante).
- Créditos diários freemium = **300/dia** (já implementado, não alterar).
- O arquivo `SECRETS.md` na raiz contém credenciais sensíveis — **não ler, não commitar conteúdo novo nele**.

---

**FIM DO BRIEFING — AGUARDANDO EXECUÇÃO DO VERTEX**
