# Projeto A — Radar Jurídico INSS (escritório exclusivo)

**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30 12:03 BRT
**Branch:** `feat/radar-juridico-exclusivo`
**Maestro:** v2.1.4 Cartman Edition — execução autônoma
**Billing:** `projeto-codex-br` (282847675243)

---

## Contexto

O `radar_legal` do TransparênciaBR já é um motor maduro de geração de leads jurídicos a partir de dados públicos. Este projeto **deriva um módulo PRIVADO E EXCLUSIVO** para o escritório de advocacia do Comandante (foco em direitos humanos), sem expor ao mercado público da plataforma.

## Objetivo

Construir um SaaS interno (single-tenant) que monitora publicações de benefícios INSS indeferidos e converte em leads classificados para o escritório do Comandante — em <5min após publicação.

## Escopo técnico (R1 MVP)

### 1. Pipeline `publicou-pegamos-alarme`
- Conector contínuo aos canais oficiais (DOU, PUB-INSS, portal de benefícios)
- Detecção em tempo real (lookback de 5min com sliding window)
- Disparo de alarme Telegram para o Comandante quando lead qualificado entrar

### 2. Enriquecimento PII (motor AURORA — 4 caminhos legais já estabelecidos)
- Caminho A: DATAPREV/convênio INSS
- Caminho B: Serasa/Quod bureau
- Caminho C: landing `/sou-indeferido` com consentimento LGPD
- Caminho D: petição-template DOCX
- Reusar a `enrichment-pii-aurora` skill (já existe na user skills)

### 3. Duas paywalls (já definidas)
- **Paywall 1 — "Abrir Contatos"**: PJe anti-waste check que desqualifica leads com processos posteriores no CPF sem cobrar
- **Paywall 2 — "Gerar Petição"**: exige Paywall 1 unlocked, gera DOCX premium via Vertex Pro usando dados do lead + CNPJ do advogado via BrasilAPI

### 4. Áreas cobertas
- Previdenciário (R1 inicial)
- Trabalhista, empresarial, tributário, licenças (R2 fast-follow)

### 5. Branding privado
- Subdomínio próprio (a definir — sugestão: `radar.{dominio-escritorio}.com.br`)
- Sem logo TransparênciaBR
- Login restrito por allowlist do escritório

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + Firebase Hosting (sub-app dedicado) |
| Backend | Cloud Run (Python) em `projeto-codex-br` |
| Data | BigQuery `transparenciabr.radar_juridico_*` (datasets novos, isolados) |
| Auth | Firebase Auth + Firestore allowlist |
| LLM | Vertex AI Gemini 2.5 Pro (billing codex-br) |
| Storage | GCS bucket `gs://radar-juridico-escritorio/` |
| Pipeline | Cloud Run Jobs + Pub/Sub |

## Entregáveis R1 (MVP funcional)

1. ✅ Arquitetura documentada (`docs/radar-juridico/ARCHITECTURE.md`)
2. ✅ Schema BigQuery dos datasets isolados
3. ✅ Pipeline `publicou-pegamos-alarme` rodando contra dados reais de INSS (sem mock)
4. ✅ Frontend privado com login + listagem de leads + 2 paywalls implementadas
5. ✅ Integração Telegram para alarme no chat do Comandante (`chat_id 6483072695`)
6. ✅ Audit log em Firestore `radar_juridico_audit` (imutável)
7. ✅ Teste E2E: capturar 1 lead real publicado → enriquecer → mostrar no frontend → simular abertura de paywall

## Restrições inegociáveis

- **NUNCA expor BigQuery interno** ao frontend (regra TransparênciaBR base)
- **LGPD-compliant 100%** — todos os 4 caminhos legais
- **Tom INFORMATIVO** — sem juízo de valor
- **Não denunciamos, mostramos**
- **Single-tenant** — não compartilha dados com outros usuários do TransparênciaBR
- **F1-F6 freios** ativos durante toda a execução
- **F5 hard-cap R$ 80/h** — se estourar, Maestro pausa e pede allow

## Plano de execução do Maestro

1. **Etapa 1 (autônoma):** Maestro lê este briefing, examina código existente do `radar_legal` no repo, propõe diff arquitetural
2. **Etapa 2 (autônoma):** Maestro cria estrutura de pastas `frontend/src/apps/radar-juridico/` e `services/radar-juridico/`
3. **Etapa 3 (autônoma):** Maestro implementa pipeline `publicou-pegamos-alarme` reutilizando enrichment-pii-aurora
4. **Etapa 4 (autônoma):** Maestro implementa 2 paywalls + Vertex Pro DOCX
5. **Etapa 5 (autônoma):** Maestro escreve testes E2E + faz deploy em ambiente de homologação
6. **Etapa 6 (semi-autônoma):** Maestro reporta no Telegram com link de homologação para Comandante validar
7. **Etapa 7 (com allow do Comandante):** Deploy em produção

## Critério de "pronto"

- Comandante consegue logar no frontend privado e ver leads reais publicados nas últimas 24h
- Paywall 1 funciona (PJe check executa, leads disqualificados não cobram)
- Paywall 2 gera DOCX premium baixável
- Telegram do Comandante recebe alarme automático quando novo lead INSS aparece

## NÃO faz parte do R1

- Onboarding de outros escritórios (single-tenant)
- Cobrança real (billing Stripe vem em R2)
- App mobile nativo
- Integração com OAB/sistemas judiciais externos

---

**Senha de execução (F2):** `aurora-cartman-2026`
**Branch alvo:** `feat/radar-juridico-exclusivo`
**Audit collection:** `maestro_audit_log` (com tag `project:radar-juridico`)
**Snapshot collection:** `maestro_rollback`

Allow all. Execute obstinadamente. Quando pedir mais recursos, escreva em `maestro_resource_requests` Firestore que o orchestrator (que sou eu) vai retransmitir ao Comandante.
