# Ocean Ways — Arquitetura

**Versão:** R1 MVP  
**Data:** 2026-05-30  
**Aprovado por:** Comandante Maurílio Baesso  

---

## Por que monorepo no R1

Ocean Ways vive em `apps/oceanways/` dentro do repositório TransparênciaBR por três razões concretas:

1. **Reuso de stack e billing**: CI/CD, Artifact Registry, IAM, Project GCP (`projeto-codex-br`), Firebase projeto, secrets do GitHub Actions — todos já configurados. Criar um repo separado duplicaria essa infraestrutura sem benefício imediato.
2. **Velocidade para MVP**: o Maestro (Vertex Pro) pode executar sobre o monorepo com contexto de todo o codebase — padrões de naming, helpers compartilhados, DDL existente. Contexto zero em repo separado custaria tempo e tokens.
3. **Separação posterior é simples**: quando Ocean Ways ganhar tração e precisar de billing isolado, time próprio ou CI diferenciado, `git subtree split` ou `git filter-repo` extraem `apps/oceanways/` para um repo autônomo em < 2h sem perder histórico.

**Trade-off aceito:** branching (`feat/oceanways-mvp`) corre em paralelo ao `main` do TransparênciaBR. PRs de oceanways serão etiquetados com `scope: oceanways` para não poluir o changelog principal.

---

## Componentes

```
apps/oceanways/
├── frontend/          # Vite + React · Firebase Hosting · subdomínio oceanways.transparenciabr.web.app
├── backend/           # FastAPI · Cloud Run · southamerica-east1
├── search-engine/     # Módulo async de busca multi-source (importado pelo backend)
├── billing/           # Créditos + Stripe + MercadoPago
├── schemas/           # BigQuery DDL
└── docs/              # Este arquivo e os demais
```

---

## Fontes de dados

| Fonte             | Tipo            | Status R1 | Notas |
|-------------------|-----------------|-----------|-------|
| seek.travel       | Agregador award  | Pesquisar | Verificar se tem API pública / affiliate |
| point.me          | Agregador award  | Pesquisar | Verificar plano API |
| AwardWallet       | Rastreamento     | Pesquisar | Foco em rastrear saldo, não disponibilidade direta |
| United MileagePlus| Direto (Star)    | R1        | Offers API documentada |
| Air France Flying Blue | Direto (Sky) | R1       | API parceiro disponível |
| British Airways Avios | Direto (OW)  | R2        | API requer credencial comercial |
| Smiles / LATAM    | Direto (misto)   | R2        | HTML parsing · alto risco TOS |

**Regra de ouro**: preferir sempre API oficial documentada. Parsing de HTML é último recurso e deve ser encapsulado em `sources/` com flag `RISK_LEVEL=HIGH` no módulo.

---

## Fluxo de busca

```
Usuário (frontend)
    │  POST /api/search  {origin, dest, dates, cabin, programs}
    ▼
Backend (FastAPI)
    │  1. Autenticar Firebase JWT
    │  2. Verificar créditos do usuário (Firestore users/{uid})
    │  3. Checar cache Firestore TTL=4h  ──► CACHE HIT → retorna imediatamente
    │  4. CACHE MISS → chama search-engine/aggregator.py
    ▼
search-engine/aggregator.py
    │  Dispara coroutines async para cada source ativo
    │  ├── sources/seek.py
    │  ├── sources/awardwallet.py
    │  ├── sources/direct_airlines.py (United, AF, BA…)
    │  └── sources/point_me.py
    │  Normaliza resultados para schema unificado AvailabilityResult
    │  Agrega + ordena por custo de milhas
    ▼
Backend
    │  5. Grava resultado no Firestore cache (TTL 4h)
    │  6. Grava evento em BigQuery oceanways.searches (sem PII direta)
    │  7. Decrementa 1 crédito do usuário
    │  8. Retorna JSON ao frontend
    ▼
Frontend
    └── Exibe ResultCards com disponibilidade comparada
```

---

## Cache

- **Nível 1 — Firestore** (quente): chave `{origin}_{dest}_{date}_{cabin}`, TTL 4h. Evita rechamar fontes externas para mesma rota/data.
- **Nível 2 — BigQuery** (frio): histórico completo para análise de tendências e retreino de alertas.

Política de invalidação: TTL estrito. Sem invalidação manual em R1 (complexidade desnecessária).

---

## Alertas

```
Cloud Scheduler  →  Pub/Sub topic: oceanways-alerts-tick  →  Cloud Run Job: alert-checker
    │
    ├── Lê alertas ativos de BigQuery oceanways.alerts (WHERE active=TRUE AND next_check <= NOW())
    ├── Para cada alerta, chama aggregator.py com os parâmetros do alerta
    ├── Se disponibilidade encontrada: publica em Pub/Sub oceanways-alert-hits
    │       → Cloud Run: notifier.py → envia e-mail (SendGrid) + push Firebase
    │       → Decrementa 2 créditos do usuário (se saldo > 0, senão suspende alerta)
    └── Atualiza oceanways.alerts.last_checked + next_check (+ 6h ou conforme preferência)
```

---

## Autenticação e autorização

- **Firebase Auth** (Google, e-mail/senha) — consistente com TBR
- JWT validado no backend via `firebase-admin` SDK em cada request
- Plano e saldo de créditos armazenados em Firestore `users/{uid}` (single source of truth)
- BigQuery recebe apenas `uid` anonimizado para analytics — nunca e-mail ou nome

---

## Deploy

| Módulo | Plataforma | Região |
|--------|------------|--------|
| frontend | Firebase Hosting (`oceanways.transparenciabr.web.app`) | global CDN |
| backend | Cloud Run service `oceanways-api` | southamerica-east1 |
| search-engine | importado pelo backend (mesmo container) | — |
| alert-checker | Cloud Run Job `oceanways-alert-checker` | southamerica-east1 |
| BigQuery | Dataset `oceanways` no projeto `projeto-codex-br` | us-central1 (padrão) |

---

## Visual

Ocean Ways tem identidade visual **própria** — não usa o teal do TransparênciaBR.

### Paleta proposta "Deep Ocean"

| Token          | Hex       | Uso |
|----------------|-----------|-----|
| `ocean-950`    | `#020B18` | Background escuro principal |
| `ocean-900`    | `#051929` | Cards em modo escuro |
| `ocean-700`    | `#0A3A6B` | Sidebar, nav |
| `ocean-500`    | `#1565C0` | Primário — botões, links |
| `ocean-300`    | `#42A5F5` | Hover state, highlights |
| `ocean-100`    | `#BBDEFB` | Superfícies claras |
| `white`        | `#FFFFFF` | Texto principal sobre escuro |
| `gold-400`     | `#FFCA28` | Accent — badges premium, CTAs de upgrade |
| `gold-600`     | `#F9A825` | Hover do accent |
| `neutral-600`  | `#546E7A` | Texto secundário |
| `neutral-100`  | `#ECEFF1` | Background claro (modo claro) |

**Modo padrão:** dark (`ocean-950` como background). Modo claro opcional em R2.

**Tipografia:**
- Headings: `Inter` 700 (já disponível em TBR)
- Body: `Inter` 400
- Mono (códigos de voo, milhas): `JetBrains Mono`

**Ícones:** Lucide React (consistente com aurora-comando)

**Logo conceito:** ondas estilizadas em `ocean-300` sobre fundo `ocean-950`, texto "Ocean Ways" em branco com "Ways" em `gold-400`.

---

## Segurança e LGPD

- Dados de busca gravados com `uid` (não e-mail/nome) — pseudonimização
- Consentimento explícito em cadastro para armazenar histórico de buscas
- Endpoint `DELETE /api/users/me` → apaga Firestore doc + BigQuery rows (right to erasure)
- Logs do Cloud Run filtrados para não logar payload de busca (apenas `search_id`)
- Secrets via GCP Secret Manager — nunca em variáveis de ambiente em texto claro em produção

---

## Decisões pendentes para R2

- [ ] Subdomínio próprio (`oceanways.com.br` ou similar)
- [ ] Separação em repo autônomo
- [ ] App mobile (React Native ou PWA endurecida)
- [ ] Integração direta com programas BR (Smiles API, TudoAzul)
- [ ] Modo claro
