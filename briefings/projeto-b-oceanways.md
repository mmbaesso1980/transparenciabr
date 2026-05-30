# Projeto B — Ocean Ways (Award Flight SaaS)

**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30 12:03 BRT
**Branch:** `feat/oceanways-mvp`
**Maestro:** v2.1.4 Cartman Edition — execução autônoma
**Billing:** `projeto-codex-br` (282847675243)

---

## Contexto

Ocean Ways é uma plataforma SaaS de busca global de passagens em milhas (award flights) com comparação contra brokers de milhas (modelos "100milhas", "123milhas") e modelo de monetização credit-based. **Co-fundado pelo Comandante.**

Este projeto é independente do TransparênciaBR — domínio totalmente diferente (travel-tech) — mas reutiliza a stack GCP/Firebase/Vertex/Cloud Run por conhecimento prévio do Comandante.

## Objetivo

Construir o MVP buscável: usuário entra, escolha origem/destino/datas, sistema retorna passagens disponíveis em milhas globalmente, mostra custo real em BRL (incluindo taxas), e compara contra o preço de brokers de milhas.

## Escopo técnico (R1 MVP)

### 1. Busca de award flights
- Cobertura: alianças globais — Star Alliance, SkyTeam, OneWorld + cias independentes
- Origem/destino: aeroportos IATA (autocomplete)
- Datas flexíveis (±3 dias)
- Cabines: economy / premium / business / first
- Backend de busca: estratégia híbrida (APIs públicas + web extraction quando necessário)
- Maestro decide arquitetura de fontes (seek.travel API, AwardWallet, ou alternatives) — pesquisar e propor

### 2. Conversão para BRL
- Preço da passagem em milhas + taxas em USD
- Conversão BRL: cotação corrente PTAX (Banco Central API)
- Inclui IOF e markup de cartão (configurável)

### 3. Comparação com brokers
- Brokers cobertos no R1: 123milhas, 100milhas, MaxMilhas, HotMilhas
- Maestro pesquisa preços comparáveis (mesma rota/data/cabine)
- Mostra "economia em BRL" para o usuário

### 4. Modelo de monetização (já definido)
- **Free:** 30 créditos/mês
- **Pro:** R$ 49/mês com 600 créditos
- **Top-up:** R$ 10 = 100 créditos
- **Custo por ação:** 1 crédito = 1 busca · 2 créditos = 1 alerta bidirecional
- Stripe ou Mercado Pago (Maestro decide e justifica)

### 5. Alertas bidirecionais (R1 opcional, R2 obrigatório)
- Usuário define rota + budget alvo (em milhas ou BRL)
- Sistema monitora 2x/dia e notifica quando aparece

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + Firebase Hosting (subdomínio `oceanways.app` ou similar) |
| Backend | Cloud Run (Python ou Node — Maestro decide) em `projeto-codex-br` |
| Data | BigQuery `oceanways.searches_*`, `oceanways.results_*` |
| Auth | Firebase Auth (Google + email/senha) |
| LLM | Vertex AI Gemini 2.5 Pro (para classificação de resultados e alertas inteligentes) |
| Cache | Redis ou Firestore TTL — Maestro decide |
| Pagamento | Stripe ou Mercado Pago |
| Email/Push | SendGrid + FCM |

## Entregáveis R1 (MVP funcional)

1. ✅ Landing page pública com formulário de busca
2. ✅ Backend de busca operacional para pelo menos 3 cias (escolher as 3 maiores rotas BR→US/EU)
3. ✅ Conversão BRL com cotação PTAX em tempo real
4. ✅ Comparação contra 2 brokers (mínimo)
5. ✅ Sistema de créditos funcional (Free tier + Pro plan + top-up)
6. ✅ Cadastro/login + dashboard básico do usuário
7. ✅ Histórico de buscas do usuário
8. ✅ Integração de pagamento operacional (modo test do Stripe/MP é OK no R1)

## Restrições

- **Não viola TOS de companhias aéreas** — Maestro estuda TOS antes de implementar extração; se TOS proíbe, busca alternativa (API oficial, parceria, dataset público)
- **LGPD** — dados de usuário tratados conforme TransparênciaBR base
- **Performance:** P95 busca <8s
- **Cache obrigatório** — não fazer call repetido para mesma origem/destino/data em 1h
- **F5 hard-cap R$ 80/h** mantido

## Plano de execução do Maestro

1. **Etapa 1 (autônoma):** Maestro pesquisa landscape (seek.travel, AwardWallet, point.me, etc.) e propõe arquitetura de fontes
2. **Etapa 2 (autônoma):** Maestro cria estrutura de monorepo ou repo separado (decide)
3. **Etapa 3 (autônoma):** Maestro implementa busca para 3 rotas teste (ex: GIG→JFK, GRU→LHR, GRU→FCO)
4. **Etapa 4 (autônoma):** Maestro implementa conversão BRL + comparação brokers
5. **Etapa 5 (autônoma):** Maestro implementa sistema de créditos + auth + dashboard
6. **Etapa 6 (autônoma):** Maestro implementa pagamento test mode
7. **Etapa 7 (autônoma):** Deploy em homologação
8. **Etapa 8 (com allow do Comandante):** Domínio + deploy produção

## Critério de "pronto"

- Comandante consegue acessar URL pública, buscar GIG→JFK economy próximas 30 dias, ver resultados reais em milhas + BRL, ver comparação com pelo menos 1 broker, criar conta, consumir crédito, fazer top-up em modo test

## NÃO faz parte do R1

- App mobile nativo
- Programa de afiliados
- White-label
- Cobertura de todas as cias (R1 = 3 cias, R2 expande)
- Multilíngua (R1 só PT-BR)

---

**Senha de execução (F2):** `aurora-cartman-2026`
**Branch alvo:** `feat/oceanways-mvp`
**Audit collection:** `maestro_audit_log` (com tag `project:oceanways`)
**Snapshot collection:** `maestro_rollback`

**Decisão arquitetural pendente:** monorepo dentro de `transparenciabr` (pasta `apps/oceanways/`) OU repo dedicado novo `mmbaesso1980/oceanways`. Maestro analisa prós/cons e decide na Etapa 2.

Allow all. Execute obstinadamente. Quando pedir mais recursos, escreva em `maestro_resource_requests` Firestore.
