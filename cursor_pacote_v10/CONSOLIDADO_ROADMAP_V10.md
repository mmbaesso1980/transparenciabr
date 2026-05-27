# 🚀 PACOTE CURSOR v10.0.0 — TransparênciaBR (CONSOLIDADO)

> **Comandante Baesso** · 23 tasks · 6 sprints · 133 pts

> Gerado em 2026-05-27 03:52 UTC

> Este documento concentra todos os 30 arquivos do pacote em um único Markdown.
> Copie e cole no Cursor web (chat lateral ou arquivo novo), ou divida pelos cabeçalhos `## 📁` em arquivos separados.


## 📑 Sumário

- [📌 INSTRUÇÕES DE USO](#📌-instruções-de-uso)
- [QUICK_START.md](#quick_startmd)
- [CURSOR_TASKS.md](#cursor_tasksmd)
- [PROMPT-MÃE (cole no chat do Cursor)](#prompt-mãe-cole-no-chat-do-cursor)
- [SCRIPT ORQUESTRADOR (scripts/EXECUTE_CURSOR.sh)](#script-orquestrador-scripts/execute_cursorsh)
- [ÍNDICE NAVEGÁVEL (docs/roadmap_v10/INDEX.md)](#índice-navegável-docs/roadmap_v10/indexmd)
- [CHECKLIST DE PROGRESSO (docs/roadmap_v10/PROGRESS.md)](#checklist-de-progresso-docs/roadmap_v10/progressmd)
- [POSTMORTEM v2.3 (leitura obrigatória antes do S0-EMERG)](#postmortem-v23-leitura-obrigatória-antes-do-s0-emerg)

### Specs do roadmap (23 tasks)

- **S0-EMERG · 15 pts · BLOQUEANTE**
  - [M11 — docs/roadmap_v10/M11.md](#-m11--docsroadmap_v10m11md)
  - [M12 — docs/roadmap_v10/M12.md](#-m12--docsroadmap_v10m12md)
  - [M01 — docs/roadmap_v10/M01.md](#-m01--docsroadmap_v10m01md)
- **S1 · 13 pts · Forense estrutural**
  - [S03 — docs/roadmap_v10/S03.md](#-s03--docsroadmap_v10s03md)
  - [S05 — docs/roadmap_v10/S05.md](#-s05--docsroadmap_v10s05md)
  - [M02 — docs/roadmap_v10/M02.md](#-m02--docsroadmap_v10m02md)
- **S2 · 18 pts · Visualização forense**
  - [S01 — docs/roadmap_v10/S01.md](#-s01--docsroadmap_v10s01md)
  - [S02 — docs/roadmap_v10/S02.md](#-s02--docsroadmap_v10s02md)
  - [M09 — docs/roadmap_v10/M09.md](#-m09--docsroadmap_v10m09md)
- **S3 · 18 pts · Inteligência ativa**
  - [S04 — docs/roadmap_v10/S04.md](#-s04--docsroadmap_v10s04md)
  - [S06 — docs/roadmap_v10/S06.md](#-s06--docsroadmap_v10s06md)
  - [S07 — docs/roadmap_v10/S07.md](#-s07--docsroadmap_v10s07md)
- **S4 · 29 pts · Cobertura global**
  - [S08 — docs/roadmap_v10/S08.md](#-s08--docsroadmap_v10s08md)
  - [S09 — docs/roadmap_v10/S09.md](#-s09--docsroadmap_v10s09md)
  - [S11 — docs/roadmap_v10/S11.md](#-s11--docsroadmap_v10s11md)
  - [M04 — docs/roadmap_v10/M04.md](#-m04--docsroadmap_v10m04md)
- **S5 · 16 pts · Hardening**
  - [S10 — docs/roadmap_v10/S10.md](#-s10--docsroadmap_v10s10md)
  - [M03 — docs/roadmap_v10/M03.md](#-m03--docsroadmap_v10m03md)
  - [M05 — docs/roadmap_v10/M05.md](#-m05--docsroadmap_v10m05md)
  - [M06 — docs/roadmap_v10/M06.md](#-m06--docsroadmap_v10m06md)
- **S6 · 24 pts · Plataforma**
  - [M07 — docs/roadmap_v10/M07.md](#-m07--docsroadmap_v10m07md)
  - [M08 — docs/roadmap_v10/M08.md](#-m08--docsroadmap_v10m08md)
  - [M10 — docs/roadmap_v10/M10.md](#-m10--docsroadmap_v10m10md)

---


## 📁 📌 INSTRUÇÕES DE USO

**Como usar este consolidado no Cursor web:**

1. Crie a estrutura de pastas no seu workspace local ou no Cursor:
   ```
   cursor_pacote_v10/
   ├── QUICK_START.md
   ├── CURSOR_TASKS.md
   ├── prompts/CURSOR_PROMPT_MASTER.md
   ├── scripts/EXECUTE_CURSOR.sh
   └── docs/
       ├── postmortems/2026-05-27_paulo_octavio_v23.md
       └── roadmap_v10/
           ├── INDEX.md  PROGRESS.md
           ├── S01.md … S11.md
           └── M01.md … M12.md
   ```
2. Cada bloco abaixo é precedido por `📁 <caminho do arquivo>` — copie o conteúdo do bloco para o arquivo correspondente.
3. Alternativa rápida: copie só o **PROMPT-MÃE** + **spec da task atual** no chat do Cursor.
4. Começar por: spec **M11** (primeira task do sprint bloqueante S0-EMERG).


## 📁 QUICK_START.md

`QUICK_START.md`

```markdown
# QUICK START — Roadmap v10.0.0 TransparênciaBR

**Comandante Baesso** · 23 tasks · 6 sprints · 133 pts · pacote pronto pra Cursor.

## 1. Abrir no Cursor (3 passos)

```bash
unzip cursor_pacote_v10_completo.zip
cd cursor_pacote_v10
chmod +x scripts/EXECUTE_CURSOR.sh
./scripts/EXECUTE_CURSOR.sh                    # menu interativo
```

Ou direto na primeira frente:

```bash
./scripts/EXECUTE_CURSOR.sh sprint S0-EMERG    # abre M11 + M12 + M01 + prompt-mãe
```

## 2. Ordem obrigatória

| Ordem | Sprint | Tasks | Pts | Bloqueante? |
|---|---|---|---|---|
| 1º | **S0-EMERG** | M11, M12, M01 | 15 | ✅ SIM (resposta ao v2.3) |
| 2º | S1 | S03, S05, M02 | 13 | — |
| 3º | S2 | S01, S02, M09 | 18 | — |
| 4º | S3 | S04, S06, S07 | 18 | — |
| 5º | S4 | S08, S09, S11, M04 | 29 | — |
| 6º | S5 | S10, M03, M05, M06 | 16 | — |
| 7º | S6 | M07, M08, M10 | 24 | — |

**Regra:** não sobe sprint sem fechar o anterior. S0-EMERG bloqueia qualquer dossiê novo.

## 3. Workflow Cursor por task

1. Abrir spec da task (ex: `docs/roadmap_v10/M11.md`)
2. Abrir `prompts/CURSOR_PROMPT_MASTER.md` (contexto + leis)
3. Atribuir ao Agent correto: A (backend), B (front), C (infra), D (Maestro)
4. Cursor implementa → roda CI lint de tom (M01) → PR
5. LLM-as-Judge (M02) revisa → merge
6. Atualizar `docs/roadmap_v10/PROGRESS.md` (marcar `[x]`)
7. Maestro confirma via Telegram

## 4. Estrutura do pacote

```
cursor_pacote_v10/
├── QUICK_START.md                       ← você está aqui
├── CURSOR_TASKS.md                      ← visão geral 23 tasks + 6 sprints
├── prompts/
│   └── CURSOR_PROMPT_MASTER.md          ← prompt-mãe (cole no Cursor)
├── scripts/
│   └── EXECUTE_CURSOR.sh                ← orquestrador (menu + sprint + next)
└── docs/
    ├── roadmap_v10/
    │   ├── INDEX.md                     ← índice navegável
    │   ├── PROGRESS.md                  ← checklist (mantenha atualizado)
    │   ├── S01.md … S11.md              ← 11 specs (sugestões originais)
    │   └── M01.md … M12.md              ← 12 specs (melhorias agente)
    └── postmortems/
        └── 2026-05-27_paulo_octavio_v23.md   ← causa-raiz do incidente
```

## 5. Comandos úteis do orquestrador

```bash
./scripts/EXECUTE_CURSOR.sh status          # dashboard (done/pending)
./scripts/EXECUTE_CURSOR.sh next            # abre a próxima pendente
./scripts/EXECUTE_CURSOR.sh open M11        # abre task específica
./scripts/EXECUTE_CURSOR.sh sprint S2       # abre todo o sprint S2
./scripts/EXECUTE_CURSOR.sh all             # abre as 23 specs (confirma antes)
```

## 6. Regras invioláveis (lembrete)

- Blocklist em PDF/UI: `fraude`, `desviou`, `corrupto`, `asmodeus`, `aurora 360`, `lobo mau`, `bigquery interno`
- **Identidade do solicitante NUNCA aparece no produto final** (esta foi a falha v2.3 → M12)
- CPF PEP: `***.XXX.XXX-**` · CPF civil: `[DADO PROTEGIDO POR LGPD]`
- Sem mock — só dados verificáveis com URL primária
- Findings ≥ MÉDIA exigem contraditório 3-partes
- Engines Vertex: `temperature=0.1`, JSON estruturado, `null` se não souber

## 7. Maestro v1.0

Maestro **já está pronto e empacotado** (`maestro_v1_0_complete.zip`, 123 KB, compartilhado). Falta apenas o deploy:

```bash
# No Cloud Shell (projeto-codex-br)
unzip maestro_v1_0_complete.zip
cd aurora_v3_maestro
bash deploy/deploy_all.sh
```

Secrets necessários: `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN`, `MAESTRO_PASSWORD_SEED`.

Após deploy, M10 (Cursor-bridge) habilita: Maestro abre PRs automaticamente no repositório a partir das specs deste pacote.

## 8. Postmortem v2.3 (leitura obrigatória)

Antes de iniciar S0-EMERG, ler `docs/postmortems/2026-05-27_paulo_octavio_v23.md` — análise 5-whys do incidente que motivou M11 e M12.

---

**Próxima ação recomendada:**

```bash
./scripts/EXECUTE_CURSOR.sh sprint S0-EMERG
```
```


## 📁 CURSOR_TASKS.md

`CURSOR_TASKS.md`

```markdown
# CURSOR — Roadmap TransparênciaBR v10.0.0 rumo ao 10/10
**Comandante:** Maurílio Mesquita Baesso · **Repo:** `mmbaesso1980/transparenciabr` · **Branch base:** `main` · **Versão alvo:** v10.0.0

23 tasks · 121 story points · 7 sprints (S0-EMERG → S6).

> ⚠️ **Lei do projeto (BLOQUEIO se violada):** tom INFORMATIVO, blocklist (`fraude/desviou/roubou/corrupto/asmodeus/aurora 360/lobo mau/fraudou/bigquery interno`), CPF mascarado `***.XXX.XXX-**`, contraditório 3-partes em finding ≥ MÉDIA, fontes primárias verificáveis, `temperature=0.1` em engines Vertex, sem mock/fake. Carregue `transparenciabr-lei` antes de qualquer arquivo.

## Sprint S0-EMERG — Contenção do incidente v2.3 (15 pts · 3 dias)
> **Causa:** auditoria do Comandante no PDF Paulo Octávio v2.3 (27/mai) detectou bugs `None`/`?` literais, PII do solicitante em F-78, e codinomes internos vazados. **Antes de qualquer outra coisa**, esses 3 itens entram.

| ID | Título | Pts | Why now |
|---|---|---|---|
| [M11](docs/roadmap_v10/M11.md) | Protocolo de Incidente + Retratação | 5 | Postmortem do v2.3 já incluso; templates de retratação prontos pra usar |
| [M12](docs/roadmap_v10/M12.md) | Sanitizador de PII do Solicitante | 5 | Camada final que remove nome/CPF/chat do operador antes do PDF sair |
| [M01](docs/roadmap_v10/M01.md) | CI lint de tom + skill manifest | 5 | PR com palavra proibida ou CPF cru fica vermelho automaticamente |

## Sprint S1 — Compliance forense + qualidade reprodutível (13 pts)
| [S03](docs/roadmap_v10/S03.md) | Cadeia de Custódia OpenLineage + SHA-256 | 3 | Hash em cada evidência — integridade forense incontestável |
|---|---|---|---|
| [S05](docs/roadmap_v10/S05.md) | Sanções Internacionais (OFAC/Interpol/GAFI/UN) | 5 | Cruzamento global + flag fornecedor × filiado partidário |
| [M02](docs/roadmap_v10/M02.md) | LLM-as-Judge (rubric 12 critérios) | 5 | Score 0-100 reprodutível pra evoluir o pipeline com base, não no olho |

## Sprint S2 — UX C-level + regression suite (18 pts)
| [S01](docs/roadmap_v10/S01.md) | Heatmap + Matriz de Risco Executiva | 5 | Página 1 lê em 5 segundos |
|---|---|---|---|
| [S02](docs/roadmap_v10/S02.md) | Grafo de Rede Societária Interativo | 8 | Cliques e laranjas saltam visualmente nos 32 CNPJs |
| [M09](docs/roadmap_v10/M09.md) | Replay-as-test (casos âncora) | 5 | Erika/Kataguiri/Paulo/Andreia viram bateria — nunca regride |

## Sprint S3 — NLP + event-driven + red team (18 pts)
| [S04](docs/roadmap_v10/S04.md) | Resumo Processual via NLP (Gemini Flash) | 5 | 1.704 processos sumarizados em 3 linhas cada |
|---|---|---|---|
| [S06](docs/roadmap_v10/S06.md) | Monitoramento Contínuo Event-Driven | 8 | Radar reativo Eventarc, alertas ≤ 15 min |
| [S07](docs/roadmap_v10/S07.md) | Red Teaming (Agente Advogado de Defesa) | 5 | Validade probatória sobe perto de 100% |

## Sprint S4 — Offshore + valuation + geo + ML (29 pts)
| [S08](docs/roadmap_v10/S08.md) | Rastreamento Offshore (ICIJ + OpenCorporates) | 8 | Panama/Paradise/Pandora/Bahamas |
|---|---|---|---|
| [S09](docs/roadmap_v10/S09.md) | Quantificação de Impacto Financeiro | 8 | Dano ao Erário · Passivo Oculto · Impacto EBITDA |
| [S11](docs/roadmap_v10/S11.md) | Validação Geoespacial (sede real?) | 5 | Earth Engine + Street View detecta noteira |
| [M04](docs/roadmap_v10/M04.md) | Distillation Gemma 9B fine-tuned | 8 | Custo cai 80% em tarefas repetitivas |

## Sprint S5 — Plataforma + observabilidade + ledger (16 pts)
| [S10](docs/roadmap_v10/S10.md) | Ancoragem em Ledger Descentralizado | 5 | OpenTimestamps — carimbo de tempo cego |
|---|---|---|---|
| [M03](docs/roadmap_v10/M03.md) | API pública /api/v1 + Swagger | 3 | Vira plataforma — B2B + jornalismo de dados |
| [M05](docs/roadmap_v10/M05.md) | Observabilidade OTel + Cloud Trace | 5 | Trace distribuído end-to-end |
| [M06](docs/roadmap_v10/M06.md) | Notebook Colab por dossiê | 3 | Auditor externo replica em 10 min |

## Sprint S6 — SaaS + HQ + Cursor bridge (24 pts)
| [M07](docs/roadmap_v10/M07.md) | Multi-tenant SaaS | 13 | Workspace por escritório, Stripe 3 planos |
|---|---|---|---|
| [M08](docs/roadmap_v10/M08.md) | HQ "The Sims tier" (substitui Pitfall) | 8 | 111 sprites animados, ping em tool exec |
| [M10](docs/roadmap_v10/M10.md) | Skill cursor-bridge (Cursor ↔ Maestro) | 3 | `@maestro <pergunta>` no chat do Cursor |

---

## Como atacar (resumo operacional)

1. Abra o repo no Cursor: `cursor ~/transparenciabr`
2. Cole `prompts/CURSOR_PROMPT_MASTER.md` no Composer (uma vez por sessão)
3. Para cada task, em ordem: `git checkout -b feat/<id>-<slug>` → leia `docs/roadmap_v10/<ID>.md` → implemente → testes → PR
4. CI roda: M01 (lint tom) · M02 (LLM-Judge) · M09 (replay) — todos verdes pra merge
5. Atualize `docs/roadmap_v10/PROGRESS.md` ao mergear
6. Notifique Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695` com:
   ```
   ✅ <ID> concluído — PR #<n>
   LLM-Judge: <score>/100 | Replay: ✓ | Custo Vertex: R$ <X>
   Próximo: <próximo-id>
   ```

## Distribuição entre agents Cursor (background)

| Agent | Focus | Tasks |
|---|---|---|
| **A — Backend forense** | Engines Python | M11, M12, M01, S03, S04, S05, S07, S08, S09, S11, M02, M04, M09 |
| **B — Frontend & UX** | React + Phaser | S01, S02, M03 (Swagger UI), M06, M08 |
| **C — Infra & DevOps** | Cloud Run + Eventarc + IAM | S06, S10, M03 (Cloud Functions), M05, M07 |
| **D — Maestro bridge** | Integração agente autônomo | M10, hooks Maestro nos workers |

## O que NÃO fazer

- ❌ Não tocar `transparenciabr.web.app` / hosting `fiscallizapa` sem aprovação
- ❌ Não rodar `gcloud auth login` no terminal Cursor (usa ADC)
- ❌ Não expor SA `tbr-reader` (comprometida — Workload Identity)
- ❌ Não `pkill -f <script>` dentro de `gcloud --command='...'` (mata SSH)
- ❌ Não push direto em `main` exceto via Maestro autônomo (rota separada com snapshot)
- ❌ Não esqueça que **Comandante Baesso** é tratamento interno; em PDF/UI vai como `solicitante` redacted via M12

## Estado do Maestro

Maestro v1.0 já está pronto (`/aurora_v3_maestro/`). Após M11+M12+M01 entregues e em CI, deploye com:
```bash
cd ~/transparenciabr/aurora_v3_maestro/deploy
bash deploy_all.sh
```
Depois disso, todo PR pode disparar `@maestro <comando>` via M10 (cursor-bridge).
```


## 📁 PROMPT-MÃE (cole no chat do Cursor)

`prompts/CURSOR_PROMPT_MASTER.md`

```markdown
# PROMPT-MÃE CURSOR · TransparênciaBR Roadmap v10.0.0

> **Cole este prompt no chat do Cursor antes de iniciar qualquer task.**
> Versão: v2 (pós-incidente Paulo Octávio v2.3 · 23 tasks · 133 pts)

---

## 1. Identidade do projeto

Você é um agente de engenharia trabalhando no **TransparênciaBR** (`mmbaesso1980/transparenciabr`), plataforma brasileira de prestação de contas parlamentar liderada pelo **Comandante Maurilio Mesquita Baesso**.

- **Tom obrigatório:** INFORMATIVO. Nunca acusatório.
- **Slogan:** "Não denunciamos. Mostramos."
- **Tratamento ao usuário:** "Comandante Baesso", português formal brasileiro.

## 2. Leis invioláveis (BLOQUEIO AUTOMÁTICO)

PROIBIDO em qualquer PDF / UI pública / código publicado:

```
fraude · desviou · roubou · corrupto · ladrão
asmodeus · goetia · aurora 360 · lobo mau
prova de crime · fraudou · bigquery interno
```

Outras regras com bloqueio:

- **Identidade do solicitante NUNCA aparece no produto final** (PDFs, logs públicos, UI). Caso v2.3 vazou o nome dele → motivo da M12.
- CPF de PEP: máscara `***.XXX.XXX-**` · CPF civil: `[DADO PROTEGIDO POR LGPD]`
- Sem dados mock/fake. Toda afirmação requer URL primária verificável.
- Findings ≥ severidade MÉDIA exigem **contraditório 3-partes** (acusação · defesa · síntese imparcial).
- Engines Vertex: `temperature=0.1`, output JSON estruturado, retorna `null` se não souber.
- 18-25 findings consolidados por dossiê (não mais, não menos).
- Codinomes internos (AURORA, asmodeus, goetia) nunca em UI/PDF público.

## 3. Roadmap v10.0.0 — 23 tasks · 6 sprints · 133 pts

Ordem obrigatória:

```
S0-EMERG (15) → S1 (13) → S2 (18) → S3 (18) → S4 (29) → S5 (16) → S6 (24)
```

### S0-EMERG · 15 pts · BLOQUEANTE (resposta ao incidente v2.3)
- **M11** Protocolo de Incidente + Retratação + Postmortem (5)
- **M12** Sanitizador de PII do Solicitante — defesa em profundidade (5)
- **M01** CI lint de tom (blocklist automático no PR) (5)

### S1 · 13 pts · Forense estrutural
- **S03** Cadeia de Custódia SHA-256 por fonte (3)
- **S05** Listas de sanções (OFAC, Interpol, GAFI, UN) (5)
- **M02** LLM-as-Judge (revisor automatizado) (5)

### S2 · 18 pts · Visualização forense
- **S01** Heatmap de Risco multifatorial (5)
- **S02** Grafo Societário interativo (D3.js + QSA) (8)
- **M09** Replay-as-test (golden fixtures) (5)

### S3 · 18 pts · Inteligência ativa
- **S04** Resumo Processual NLP (5)
- **S06** Pipeline Event-Driven (Eventarc + Pub/Sub) (8)
- **S07** Red Team de Defesa (5)

### S4 · 29 pts · Cobertura global
- **S08** Cruzamento Offshore Leaks ICIJ (8)
- **S09** Quantificação Financeira (CEAP × IBGE) (8)
- **S11** Camada Geoespacial (Maps + BigQuery GIS) (5)
- **M04** Distillation Gemma 9B (−70% custo Vertex) (8)

### S5 · 16 pts · Hardening
- **S10** Ledger OpenTimestamps (notarização Bitcoin) (5)
- **M03** API `/api/v1` + Swagger (3)
- **M05** OpenTelemetry + Cloud Trace (5)
- **M06** Notebook Colab público (3)

### S6 · 24 pts · Plataforma
- **M07** Multi-tenant SaaS white-label (13)
- **M08** HQ Phaser "Sims tier" (8)
- **M10** Cursor-bridge (Maestro abre PRs) (3)

## 4. Distribuição entre Cursor Agents

- **Agent A (Backend forense, Python/Vertex):** M11, M12, M01, S03, S04, S05, S07, S08, S09, S11, M02, M04, M09
- **Agent B (Frontend/UX, React+Vite):** S01, S02, M03 (Swagger UI), M06, M08
- **Agent C (Infra/DevOps, GCP):** S06, S10, M03 (Cloud Functions), M05, M07
- **Agent D (Maestro bridge):** M10

## 5. Workflow obrigatório por task

1. Ler spec da task em `docs/roadmap_v10/<ID>.md`.
2. Implementar respeitando as leis da seção 2.
3. Rodar lint local: `pre-commit run --all-files` (inclui M01 quando entregue).
4. Abrir PR com título `[<ID>] <título curto>`.
5. CI executa lint de tom + LLM-as-Judge (M02 quando entregue).
6. Maestro recebe notificação Telegram (M10 quando entregue).
7. Após merge, marcar `[x]` em `docs/roadmap_v10/PROGRESS.md` com link do PR.

## 6. Contexto técnico essencial

- **Repo:** `mmbaesso1980/transparenciabr` (branch `main`, público)
- **GCP main:** `transparenciabr` (project_number 89728155070)
- **GCP Vertex:** `projeto-codex-br` (créditos R$ 5.952 até 07/04/2027)
- **VM autônoma:** `aurora-cacador-br` (sa-east1-a, IP `34.39.224.224`, IAP-only)
- **Bot Telegram:** `t.me/Asmodeuswebforgebot` · chat autorizado `6483072695`
- **Hosting target:** `fiscallizapa` (dois L)
- **Direct Data v3 OK:** ReceitaFederalPessoaJuridica, BeneficiarioFinal, ProcessosJudiciaisSimplificada, CadastroPessoaFisicaPlus
- **Direct Data 404 (não usar):** QuadroSocietarioReceitaFederal, PGFNListaDevedores, ProtestosCenprot

## 7. Anti-padrões já documentados (NÃO repetir)

- `pkill -f` dentro de `gcloud --command` mata o próprio SSH → usar PID file.
- Glyph `▸` (U+25B8) não renderiza em Inter → usar `›` (U+203A).
- `<font align="right">` é inválido no paraparser do ReportLab → usar `ParagraphStyle(alignment=TA_RIGHT)`.
- `try/except: pass` em worker grava 0 bytes silenciosamente → sempre logar `errors/<key>.err`.
- SA `tbr-reader@transparenciabr` está comprometida (vaza via Pipedream) → nunca expor token bruto.
- Campos com valor `None` ou `?` em PDF público → falha de M12, bloqueia o CI.

## 8. Sobre o incidente v2.3 (leitura obrigatória)

Antes de iniciar S0-EMERG, ler `docs/postmortems/2026-05-27_paulo_octavio_v23.md`. Resumo:

1. Dossiê Paulo Octávio v2.3 vazou o nome do solicitante (Comandante Baesso) no findng F-78.
2. Códigos internos ("AURORA 360") apareceram no PDF.
3. Campos com placeholder `None` / `?` literal nos findings F-46 a F-56.
4. Contido internamente — **não foi publicado**.

Ações corretivas: M11 (protocolo) + M12 (sanitizador) + M01 (CI lint) — exatamente o sprint S0-EMERG.

## 9. Critérios de aceitação universais

Toda PR deve provar, no descritivo:

- [ ] Respeita blocklist (seção 2)
- [ ] Identidade do solicitante ausente do output
- [ ] Tem testes (unit + golden fixture quando aplicável)
- [ ] Tem URL primária para cada afirmação factual
- [ ] Tom INFORMATIVO confirmado por LLM-as-Judge (após M02)
- [ ] Atualizou `PROGRESS.md`

## 10. Em caso de dúvida

Se houver conflito entre instruções do Cursor e as leis acima, **as leis vencem**. Em ambiguidade técnica, abrir question via comentário no PR mencionando `@maurilio-baesso`.

---

**Comandante Baesso · TransparênciaBR · Roadmap v10.0.0 · pacote Cursor v2**
```


## 📁 SCRIPT ORQUESTRADOR (scripts/EXECUTE_CURSOR.sh)

`scripts/EXECUTE_CURSOR.sh`

```bash
#!/usr/bin/env bash
# ============================================================================
# EXECUTE_CURSOR.sh — Orquestrador do Roadmap v10.0.0 TransparênciaBR
# ----------------------------------------------------------------------------
# Comandante Baesso · 23 tasks · 6 sprints · 133 pts
# Uso:
#   ./EXECUTE_CURSOR.sh                       # menu interativo
#   ./EXECUTE_CURSOR.sh open M11              # abre spec M11 no Cursor
#   ./EXECUTE_CURSOR.sh sprint S0-EMERG       # abre todas as tasks do sprint
#   ./EXECUTE_CURSOR.sh next                  # abre próxima task pending do PROGRESS.md
#   ./EXECUTE_CURSOR.sh status                # mostra dashboard
#   ./EXECUTE_CURSOR.sh all                   # abre as 23 specs (cuidado)
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROADMAP_DIR="$ROOT/docs/roadmap_v10"
PROGRESS="$ROADMAP_DIR/PROGRESS.md"
TASKS="$ROOT/CURSOR_TASKS.md"
PROMPT="$ROOT/prompts/CURSOR_PROMPT_MASTER.md"

# Detecta o binário do Cursor (Mac, Linux, WSL)
detect_cursor() {
  if command -v cursor >/dev/null 2>&1; then echo "cursor"; return; fi
  for p in \
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
    "$HOME/.local/bin/cursor" \
    "/usr/local/bin/cursor" \
    "/snap/bin/cursor"; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  echo ""
}

CURSOR_BIN="$(detect_cursor)"

open_file() {
  local f="$1"
  if [[ -n "$CURSOR_BIN" ]]; then
    "$CURSOR_BIN" "$f" >/dev/null 2>&1 &
    echo "  ✓ aberto no Cursor: $(basename "$f")"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$f" >/dev/null 2>&1 &
    echo "  ✓ aberto (xdg): $(basename "$f")"
  elif command -v open >/dev/null 2>&1; then
    open "$f"
    echo "  ✓ aberto (macOS): $(basename "$f")"
  else
    echo "  ⚠ Cursor não encontrado. Caminho: $f"
  fi
}

cmd_open() {
  local id="$1"
  local f="$ROADMAP_DIR/${id}.md"
  [[ -f "$f" ]] || { echo "✗ Spec não existe: $id"; exit 1; }
  echo "▶ Abrindo $id"
  open_file "$f"
  open_file "$PROMPT"
}

cmd_sprint() {
  local sprint="$1"
  echo "▶ Sprint: $sprint"
  case "$sprint" in
    S0-EMERG|s0) IDS=(M11 M12 M01) ;;
    S1|s1)       IDS=(S03 S05 M02) ;;
    S2|s2)       IDS=(S01 S02 M09) ;;
    S3|s3)       IDS=(S04 S06 S07) ;;
    S4|s4)       IDS=(S08 S09 S11 M04) ;;
    S5|s5)       IDS=(S10 M03 M05 M06) ;;
    S6|s6)       IDS=(M07 M08 M10) ;;
    *) echo "Sprint inválido. Opções: S0-EMERG S1 S2 S3 S4 S5 S6"; exit 1 ;;
  esac
  for id in "${IDS[@]}"; do
    open_file "$ROADMAP_DIR/${id}.md"
  done
  open_file "$PROMPT"
  open_file "$TASKS"
}

cmd_next() {
  # Lê PROGRESS.md e abre a primeira task com status [ ]
  local next_id
  next_id="$(grep -E '^\| \[ \]' "$PROGRESS" | head -1 | awk -F'|' '{print $3}' | tr -d ' ' || true)"
  [[ -z "$next_id" ]] && { echo "✓ Todas as tasks marcadas como concluídas no PROGRESS.md"; exit 0; }
  echo "▶ Próxima task pendente: $next_id"
  cmd_open "$next_id"
}

cmd_status() {
  echo "================================================================"
  echo "  ROADMAP v10.0.0 — TransparênciaBR · Comandante Baesso"
  echo "================================================================"
  local total done_count pending
  total=$(grep -cE '^\| \[' "$PROGRESS" || echo 0)
  done_count=$(grep -cE '^\| \[x\]' "$PROGRESS" || echo 0)
  pending=$((total - done_count))
  echo "  Tasks totais:   $total"
  echo "  Concluídas:     $done_count"
  echo "  Pendentes:      $pending"
  echo ""
  echo "  Cursor binary:  ${CURSOR_BIN:-NÃO ENCONTRADO}"
  echo "  Roadmap dir:    $ROADMAP_DIR"
  echo "================================================================"
  echo ""
  echo "  Próximas 5 tasks pendentes:"
  grep -E '^\| \[ \]' "$PROGRESS" | head -5 | awk -F'|' '{printf "    %s  %s\n", $3, $4}'
}

cmd_all() {
  read -rp "Vai abrir 23 arquivos + prompt + tasks. Confirma? [y/N] " ans
  [[ "$ans" =~ ^[yY] ]] || { echo "Cancelado."; exit 0; }
  for f in "$ROADMAP_DIR"/*.md; do open_file "$f"; done
  open_file "$PROMPT"
  open_file "$TASKS"
}

cmd_menu() {
  echo ""
  echo "  ┌──────────────────────────────────────────────────┐"
  echo "  │  ROADMAP v10.0.0 — TransparênciaBR               │"
  echo "  │  23 tasks · 6 sprints · 133 pts                  │"
  echo "  └──────────────────────────────────────────────────┘"
  echo ""
  echo "  1) Status do roadmap"
  echo "  2) Abrir próxima task pendente"
  echo "  3) Abrir sprint S0-EMERG (M11 + M12 + M01)  ← INÍCIO"
  echo "  4) Abrir sprint específico (S1..S6)"
  echo "  5) Abrir task específica (ID)"
  echo "  6) Abrir TODAS as 23 specs"
  echo "  7) Abrir prompt-mãe + CURSOR_TASKS.md"
  echo "  0) Sair"
  echo ""
  read -rp "  Opção: " opt
  case "$opt" in
    1) cmd_status ;;
    2) cmd_next ;;
    3) cmd_sprint S0-EMERG ;;
    4) read -rp "  Sprint (S1..S6): " s; cmd_sprint "$s" ;;
    5) read -rp "  ID (ex: M11): " i; cmd_open "$i" ;;
    6) cmd_all ;;
    7) open_file "$PROMPT"; open_file "$TASKS" ;;
    0) exit 0 ;;
    *) echo "  Opção inválida." ;;
  esac
}

# ─── Dispatcher ─────────────────────────────────────────────────────────────
case "${1:-menu}" in
  open)    shift; cmd_open "$@" ;;
  sprint)  shift; cmd_sprint "$@" ;;
  next)    cmd_next ;;
  status)  cmd_status ;;
  all)     cmd_all ;;
  menu)    cmd_menu ;;
  *)       echo "Uso: $0 [menu|status|next|open <ID>|sprint <S0-EMERG..S6>|all]"; exit 1 ;;
esac
```


## 📁 ÍNDICE NAVEGÁVEL (docs/roadmap_v10/INDEX.md)

`docs/roadmap_v10/INDEX.md`

```markdown
# Roadmap v10.0.0 — Specs individuais (23 tasks)

**Total story points:** 133 | **Sprints:** S0-EMERG → S6

## Por sprint

### S0-EMERG (15 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [M11](./M11.md) | Protocolo de Incidente + Retratação (postmortem v2.3) | 5 | P0 | Crítico | transparenciabr-lei + maestro-autonomo |
| [M12](./M12.md) | Sanitizador de PII do Solicitante (defesa em profundidade) | 5 | P0 | Crítico | transparenciabr-lei |
| [M01](./M01.md) | CI Lint de tom + skill manifest em PR | 5 | P0 | Alto | transparenciabr-lei |

### S1 (13 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [S03](./S03.md) | Cadeia de Custódia OpenLineage + SHA-256 | 3 | P0 | Alto | transparenciabr-lei + aurora-forensic-ops |
| [S05](./S05.md) | Sanções Internacionais (OFAC/Interpol/GAFI/UN) | 5 | P0 | Alto | due-diligence-pro |
| [M02](./M02.md) | LLM-as-Judge (rubric 12 critérios) | 5 | P1 | Alto | dossie-forense-parlamentar + due-diligence-pro |

### S2 (18 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [S01](./S01.md) | Heatmap + Matriz de Risco Executiva (4 quadrantes) | 5 | P1 | Médio | dossie-forense-parlamentar + due-diligence-pro |
| [S02](./S02.md) | Grafo de Rede Societária Interativo (Cytoscape+NetworkX) | 8 | P1 | Alto | due-diligence-pro |
| [M09](./M09.md) | Replay-as-test (regression dos casos âncora) | 5 | P1 | Alto | maestro-autonomo + dossie-forense-parlamentar |

### S3 (18 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [S04](./S04.md) | Resumo Processual via NLP (Gemini Flash) | 5 | P2 | Médio | due-diligence-pro |
| [S06](./S06.md) | Monitoramento Contínuo Event-Driven (Eventarc) | 8 | P1 | Alto | aurora-forensic-ops + maestro-autonomo |
| [S07](./S07.md) | Red Teaming Automatizado (Advogado de Defesa) | 5 | P1 | Alto | aurora-forensic-ops |

### S4 (29 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [S08](./S08.md) | Rastreamento Offshore (OpenCorporates + ICIJ) | 8 | P2 | Médio | due-diligence-pro |
| [S09](./S09.md) | Quantificação de Impacto Financeiro (R$) | 8 | P2 | Alto | due-diligence-pro |
| [S11](./S11.md) | Validação Geoespacial (sede empresa real?) | 5 | P3 | Médio | due-diligence-pro |
| [M04](./M04.md) | Distillation Gemma 9B (tarefas específicas) | 8 | P1 | Alto | maestro-autonomo |

### S5 (16 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [S10](./S10.md) | Ancoragem em Ledger Distribuído (OpenTimestamps) | 5 | P3 | Médio | transparenciabr-lei |
| [M03](./M03.md) | API pública /api/v1 + Swagger | 3 | P0 | Alto | transparenciabr-lei |
| [M05](./M05.md) | Observabilidade OTel + Cloud Trace | 5 | P2 | Médio | aurora-forensic-ops + maestro-autonomo |
| [M06](./M06.md) | Notebook Colab reproduzível por dossiê | 3 | P3 | Médio | due-diligence-pro |

### S6 (24 pts)

| ID | Título | Pts | Prioridade | Impacto | Skill |
|---|---|---|---|---|---|
| [M07](./M07.md) | Multi-tenant SaaS (workspace por escritório) | 13 | P4 | Alto | transparenciabr-lei |
| [M08](./M08.md) | Painel HQ 'The Sims tier' (substitui Pitfall) | 8 | P3 | Médio | aurora-forensic-ops |
| [M10](./M10.md) | Skill cursor-bridge (Cursor ↔ Maestro) | 3 | P3 | Médio | maestro-autonomo |
```


## 📁 CHECKLIST DE PROGRESSO (docs/roadmap_v10/PROGRESS.md)

`docs/roadmap_v10/PROGRESS.md`

```markdown
# Progresso v10.0.0

Atualizar a cada PR mergeado. Notificar Telegram chat 6483072695 com summary.

**Legenda:** ✅ done · 🔄 in_progress · ⏳ pending · ❌ blocked · ⚠️ rollback

| Sprint | Task | Status | PR | LLM-Judge | Replay | Notas |
|---|---|---|---|---|---|---|
| S0-EMERG | M11 — Protocolo de Incidente + Retratação (postmortem v2.3) | ⏳ | — | — | — | — |
| S0-EMERG | M12 — Sanitizador de PII do Solicitante (defesa em profundidade) | ⏳ | — | — | — | — |
| S0-EMERG | M01 — CI Lint de tom + skill manifest em PR | ⏳ | — | — | — | — |
| S1 | S03 — Cadeia de Custódia OpenLineage + SHA-256 | ⏳ | — | — | — | — |
| S1 | S05 — Sanções Internacionais (OFAC/Interpol/GAFI/UN) | ⏳ | — | — | — | — |
| S1 | M02 — LLM-as-Judge (rubric 12 critérios) | ⏳ | — | — | — | — |
| S2 | S01 — Heatmap + Matriz de Risco Executiva (4 quadrantes) | ⏳ | — | — | — | — |
| S2 | S02 — Grafo de Rede Societária Interativo (Cytoscape+NetworkX) | ⏳ | — | — | — | — |
| S2 | M09 — Replay-as-test (regression dos casos âncora) | ⏳ | — | — | — | — |
| S3 | S04 — Resumo Processual via NLP (Gemini Flash) | ⏳ | — | — | — | — |
| S3 | S06 — Monitoramento Contínuo Event-Driven (Eventarc) | ⏳ | — | — | — | — |
| S3 | S07 — Red Teaming Automatizado (Advogado de Defesa) | ⏳ | — | — | — | — |
| S4 | S08 — Rastreamento Offshore (OpenCorporates + ICIJ) | ⏳ | — | — | — | — |
| S4 | S09 — Quantificação de Impacto Financeiro (R$) | ⏳ | — | — | — | — |
| S4 | S11 — Validação Geoespacial (sede empresa real?) | ⏳ | — | — | — | — |
| S4 | M04 — Distillation Gemma 9B (tarefas específicas) | ⏳ | — | — | — | — |
| S5 | S10 — Ancoragem em Ledger Distribuído (OpenTimestamps) | ⏳ | — | — | — | — |
| S5 | M03 — API pública /api/v1 + Swagger | ⏳ | — | — | — | — |
| S5 | M05 — Observabilidade OTel + Cloud Trace | ⏳ | — | — | — | — |
| S5 | M06 — Notebook Colab reproduzível por dossiê | ⏳ | — | — | — | — |
| S6 | M07 — Multi-tenant SaaS (workspace por escritório) | ⏳ | — | — | — | — |
| S6 | M08 — Painel HQ 'The Sims tier' (substitui Pitfall) | ⏳ | — | — | — | — |
| S6 | M10 — Skill cursor-bridge (Cursor ↔ Maestro) | ⏳ | — | — | — | — |
```


## 📁 POSTMORTEM v2.3 (leitura obrigatória antes do S0-EMERG)

`docs/postmortems/2026-05-27_paulo_octavio_v23.md`

```markdown
# Postmortem · Dossiê Paulo Octávio v2.3
**Data:** 27/mai/2026 · **Severidade:** ALTA (contida internamente) · **Status:** Em correção (M11+M12)

## TL;DR
Auditoria do Comandante Baesso no PDF v2.3 do caso Paulo Octávio identificou
três classes de vazamento que escaparam de todos os 6 revisores ativos:

1. **Bugs estruturais** — campos `None` e `?` literais em ~10 findings (F-46 a F-56, F-78)
2. **PII do solicitante vazada** — F-78 cita "Conta do solicitante: Maurilio Mesquita Baesso"
3. **Codinomes internos expostos** — "motor AURORA 360", "agentes técnicos", "pipeline automatizado"

Sem publicação externa. Risco zero materializado. Risco potencial alto se tivesse circulado.

## Timeline (UTC-3)
| Hora | Evento |
|---|---|
| 26/mai 23:35 | Geração v2.3 pelo eviscerador standalone na VM aurora-cacador-br |
| 27/mai 00:00 | Entrega pelo agente humano-supervisionado no chat |
| 27/mai 00:25 | Comandante envia análise externa identificando as 3 classes |
| 27/mai 00:38 | Contenção confirmada (não publicado) |
| 27/mai 00:42 | Postmortem aberto · M11 + M12 priorizadas |

## 5 Whys

**Por que `None` apareceu no PDF?**
→ O builder de PDF (`gerar_dossie_v23.py`) faz `f"Direct Data registra o processo {p['numero']} no TJDFT"` sem checar se `p['numero']` é `None`.

**Por que o builder não foi testado para esse caso?**
→ Não existe replay-as-test (M09) com casos âncora. O builder roda no caso novo e só dá pra ver problema no produto final.

**Por que o nome do solicitante apareceu em F-78?**
→ O template do finding F-78 ("Conta do solicitante") foi copiado de um relatório interno de auditoria de uso e nunca removido para os outputs externos. **Não existia sanitizador.**

**Por que codinomes "AURORA 360" e "agentes técnicos" vazaram?**
→ A blocklist da lei (`transparenciabr-lei`) lista palavras proibidas, mas o CI ainda não estava ativo (M01 pendente). Os 6 revisores leem em paralelo ao texto mas amostram, não fazem full-scan.

**Por que ninguém pegou em 6 revisores?**
→ Os revisores estão calibrados para tom (linguagem acusatória), fontes, CPF, severidade e contraditório. Não para bugs estruturais nem PII do operador. **Defesa em profundidade era incompleta.**

## Causa raiz
**Pipeline com defesas em paralelo (6 revisores) mas com gaps estruturais não cobertos por nenhuma camada:**
- Nenhuma camada checava sentinelas estruturais (`None`, `?`, `undefined`)
- Nenhuma camada checava identidade do operador no output
- CI lint de tom não estava ativo
- Não havia replay-as-test garantindo regressão zero

## Impacto
- **Externo:** zero (não publicado)
- **Interno:** confiança na automação parcialmente abalada — auditoria humana continua sendo gate obrigatório
- **Reputacional potencial:** se publicado, exposição do Comandante como contratante + descrédito do produto

## Ações corretivas (rastreáveis no roadmap v10.0.0)

| ID | Task | Prazo |
|---|---|---|
| **M11** | Protocolo de Incidente + Retratação + este postmortem | Sprint S1 |
| **M12** | Sanitizador de PII do solicitante (defesa em profundidade) | Sprint S1 |
| **M01** | CI lint de tom em PDFs em PR | Sprint S1 |
| **M09** | Replay-as-test (casos âncora) | Sprint S3 |
| novo | Adicionar `paulo_v23_known_issues.yaml` ao replay-suite | M09 |
| novo | Treinar 7º revisor `revisor_sentinelas_estruturais` | M09 |
| novo | Treinar 8º revisor `revisor_pii_solicitante` | M12 |

## Lições para o maestro_memory

```bash
python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  incident-pii-solicitante-v23 \
  "PII do solicitante (nome Maurilio Mesquita Baesso) vazou no finding F-78 do dossiê Paulo Octávio v2.3 porque o template copiado de auditoria interna não foi sanitizado. Defesa em profundidade exigia sanitizador independente (M12). Os 6 revisores não checavam identidade do operador." \
  --tags incident pii sanitization template lgpd

python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  sentinelas-estruturais-pdf \
  "Sempre escanear o output final por strings literais None, undefined, ?, [object Object], NaN. Bug do builder de PDF v2.3 deixou `processo None no TJDFT` em ~10 findings. Adicionar verificação no engines/incident/sentinels.yaml (M11)." \
  --tags incident pdf bugs sentinelas

python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  codinomes-internos-vazam-em-template \
  "Codinomes internos (AURORA 360, agentes técnicos, motor) vazaram no texto narrativo do v2.3. CI lint M01 precisa rodar full-scan, não só amostragem dos 6 revisores." \
  --tags incident tom codinomes blocklist
```

## Auditoria do incidente
Doc Firestore `maestro_incident_log/inc-2026-05-27-paulo-v23` (criar ao implementar M11).

## Owner
Maurilio Mesquita Baesso (Comandante) + Maestro v1.0

## Status
🔄 Em correção — Sprint S1 do roadmap v10.0.0 (encerramento previsto 03/jun/2026)
```


---

# 📚 ESPECIFICAÇÕES DAS 23 TASKS


## 🎯 S0-EMERG · 15 pts · BLOQUEANTE


### 📁 M11 — docs/roadmap_v10/M11.md

```markdown
# M11 · Protocolo de Incidente + Retratação

**Pontos:** 5 | **Skill:** `transparenciabr-lei` + `maestro-autonomo`
**Origem:** Incidente do dossiê Paulo Octávio v2.3 (27 mai 2026) — campos `None`/`?` literais, nome do solicitante vazado em F-78, codinomes internos expostos.

## Contexto (não repetir)

A auditoria do Comandante identificou **3 classes de vazamento** que não foram pegas por nenhum revisor:
- Bugs de pipeline (`None`, `?` em campos críticos)
- PII do solicitante dentro de finding (F-78 nominou Maurilio Mesquita Baesso)
- Linguagem operacional interna (motor AURORA 360, agentes técnicos, pipeline)

O dossiê não foi publicado externamente — contenção é só técnica. Mas o protocolo precisa existir antes do próximo caso.

## Contrato

Conjunto completo: **detecção → triagem → contenção → retratação → postmortem → aprendizado**.

### Componentes
1. **Detector**: hook pós-geração que escaneia o PDF/MD final por sentinelas (lista em `engines/incident/sentinels.yaml`):
   - Strings literais `None`, `null`, `undefined`, `?`, `[object Object]`, `NaN`
   - Codinomes proibidos (asmodeus, goetia, aurora 360, lobo mau, etc.)
   - PII do solicitante (configurável por tenant — começa com `mmbaesso`, `Maurilio`, `Baesso`, `6483072695`, `mmbaesso@hotmail.com`)
2. **Triagem**: severidade automática (LOW/MED/HIGH/CRITICAL) baseada em categoria.
3. **Contenção**:
   - HIGH/CRITICAL → bloqueia publicação, alerta Telegram com diff
   - MED → permite com warning visível no PDF
   - LOW → log apenas
4. **Templates de retratação**:
   - `docs/templates/retratacao_advogado.md`
   - `docs/templates/retratacao_mp.md`
   - `docs/templates/retratacao_jornalista.md`
   - Cada um com: descrição da falha, dossiê corrigido em anexo, pedido de não-circulação, certificação SHA-256 da versão corrigida.
5. **Postmortem template**: `docs/templates/postmortem.md` com 5-whys, timeline, ações corretivas, owner, prazo.
6. **Audit imutável**: cada incidente gera doc em Firestore `maestro_incident_log/<id>` com: detecção, severidade, dossiê afetado, ações tomadas, postmortem link.

## Arquivos a criar/editar

- `engines/incident/detector.py` (scanner por sentinelas)
- `engines/incident/sentinels.yaml` (config blocklist atual + customizável)
- `engines/incident/triagem.py` (classificação severidade)
- `engines/incident/retratacao.py` (gera comunicação formal)
- `docs/templates/retratacao_{advogado,mp,jornalista}.md`
- `docs/templates/postmortem.md`
- `docs/postmortems/2026-05-27_paulo_octavio_v23.md` ← **postmortem do incidente atual, já preenchido**
- `firestore/rules/incident.rules` (apenas Comandante lê `maestro_incident_log`)
- `frontend/src/pages/admin/IncidentLog.jsx` (visualização restrita)

## Definition of Done

- Detector roda em < 5s em PDF de 100 páginas
- Falsos positivos < 2% em bateria histórica (Erika, Kataguiri, Andreia, Paulo)
- HIGH/CRITICAL bloqueia hosting/publicação em qualquer canal
- Templates aprovados pela lei do projeto (tom INFORMATIVO, sem auto-incriminação)
- Postmortem do v2.3 fechado, com 5-whys completo e ações cadastradas como issues
- Maestro recebe lição `incident-pii-solicitante` em `maestro_memory` automaticamente

## Testes

- `tests/incident/test_detector.py`: PDF sintético com cada sentinela isolada → 100% detecção
- `tests/incident/test_retratacao.py`: template renderiza com dados do caso v2.3 sem auto-acusação
- `tests/incident/test_paulo_v23.py`: replay do PDF v2.3 → detecta exatamente as 3 classes que o Comandante apontou
- `tests/replay/cases/paulo_v23_known_issues.yaml`: regression suite

## Postmortem inicial (já incluso)

Conteúdo de `docs/postmortems/2026-05-27_paulo_octavio_v23.md`:

```markdown
# Postmortem · Dossiê Paulo Octávio v2.3 · 27/mai/2026

## Resumo
Auditoria externa do Comandante Baesso identificou 3 classes de vazamento no
PDF gerado: (1) bugs de pipeline com `None`/`?` literais em ~10 findings;
(2) nome do solicitante presente em F-78; (3) codinomes internos (AURORA 360,
agentes técnicos) expostos no texto.

**Impacto:** zero externo (não publicado). Risco reputacional alto se publicado.

## Timeline (UTC-3)
- 26/mai 23:35 — geração v2.3 (worker eviscerador standalone)
- 27/mai 00:00 — entrega no chat
- 27/mai 00:25 — Comandante audita e identifica falhas
- 27/mai 00:38 — contenção confirmada (sem publicação)

## 5 Whys
1. Por que `None` apareceu no PDF? → o builder não fez `if x is None: skip` antes do format string.
2. Por que o builder não testou? → não havia replay-as-test (M09 ainda não implementado).
3. Por que o nome do solicitante vazou? → o template puxou metadata sem
   sanitizar campo `requester` (não havia sanitizador — M12 não existia).
4. Por que codinomes vazaram? → lint de tom (M01) ainda não estava em CI.
5. Por que ninguém pegou? → 6 revisores só checavam tom blocklist da lei,
   não bugs estruturais nem PII do solicitante.

## Causa raiz
**Defesa em camadas incompleta.** Tínhamos blocklist de tom mas faltavam:
- Detector de sentinelas estruturais (None, ?)
- Sanitizador de PII do operador
- CI lint automático em PDFs
- Replay-as-test em casos âncora

## Ações corretivas
- [M11] Protocolo de incidente (esta task)
- [M12] Sanitizador de PII do solicitante
- [M01] CI lint de tom em PDFs
- [M09] Replay-as-test dos casos âncora
- Adicionar `paulo_v23_known_issues.yaml` ao replay-suite

## Owner
Maurilio Mesquita Baesso (Comandante) + Maestro v1.0

## Prazo de conclusão das ações
Sprint S1 do roadmap v10.0.0 (até 03/jun/2026).
```

## Comando para abrir no Cursor

```bash
git checkout -b feat/m11-protocolo-incidente
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M11.md
# implemente seguindo DoD; rode tests/incident antes de PR
```

## Conventional commit sugerido
```
feat(incident): protocolo de incidente + retratação + postmortem v2.3 (#M11)
```
```


### 📁 M12 — docs/roadmap_v10/M12.md

```markdown
# M12 · Sanitizador de PII do Solicitante (defesa em profundidade)

**Pontos:** 5 | **Skill:** `transparenciabr-lei`
**Origem:** Incidente Paulo Octávio v2.3 — finding F-78 vazou nome do contratante.

## Por que existir

A `transparenciabr-lei` proíbe expor identidade do solicitante no produto final.
Até agora a defesa era "o template não pega esse campo". Mas o template falhou.
**Defesa em profundidade**: mesmo que o template peça, o sanitizador remove.

Princípio: **o produto NUNCA deve conter dados sobre quem o gerou.**

## Contrato

Camada de sanitização **pós-tudo**: roda como último passo antes de qualquer
gravação (PDF, MD, JSON, notebook, Telegram). É independente de quem chama,
qual modelo gerou, qual pipeline.

### Inputs
- Texto bruto (str ou bytes)
- Manifesto de identidades do solicitante (Firestore `tenants/{tid}/operator_identity`):
  - Nome (variantes ortográficas)
  - CPF (mascarado e cru)
  - Email
  - Telegram chat_id
  - Empresas vinculadas (CNPJs)
  - Aliases / codinomes
  - User-agent customizado
  - SAs e PATs

### Output
- Texto sanitizado (substituições por `[DADO PROTEGIDO POR LGPD]` ou redação cirúrgica)
- Manifesto de redações aplicadas (audit trail) gravado em Firestore `sanitization_log`

### Algoritmo
1. Normalização Unicode (NFC + lowercase comparison)
2. Match exato por strings declaradas
3. Match fuzzy por Levenshtein (threshold 0.85) para variantes
4. Match regex para padrões (CPF, CNPJ, chat_id, email)
5. Match contextual: NER + cross-check com manifesto (Gemini Flash temp=0)
6. Substituição preservando layout (não quebra ReportLab)
7. Validação: re-scanner do output para confirmar zero match remanescente

## Arquivos a criar/editar

- `engines/sanitization/operator_pii_filter.py` (núcleo do sanitizador)
- `engines/sanitization/identity_manifest.py` (loader Firestore + cache)
- `engines/sanitization/redaction_strategies.py` (estratégias: mask/remove/replace)
- `engines/sanitization/ner_contextual.py` (Gemini Flash para casos não-óbvios)
- `engines/sanitization/__tests__/test_operator_pii_filter.py`
- `functions/src/sanitize_before_publish.ts` (Cloud Function trigger pre-write Storage)
- `firestore/rules/sanitization.rules` (apenas SA `maestro-worker` escreve)
- `docs/sanitizacao_solicitante.md` (manual operacional)

## Pontos de integração obrigatórios

- `engines/dossie/build_pdf.py` (antes do `doc.save()`)
- `engines/dossie/build_md.py` (antes do `Path.write_text()`)
- `worker/maestro_v1.py` `exec_telegram_send` (antes do `requests.post`)
- `worker/maestro_v1.py` `exec_github_edit_file` (antes do `repo.update_file`)
- `cloud_run_jobs/notebook_generator.py` (M06)
- `functions/src/api/v1/*` (M03 — output da API pública)

**Regra de ouro:** se um path escreve algo que vai sair do projeto, ele PRECISA chamar `sanitize_operator(text)` antes.

## Definition of Done

- Sanitizador detecta os 3 vazamentos do v2.3 com 100% recall em test fixture
- Falsos positivos < 1% (não pode mascarar nome de PEP que coincide com nome do operador)
- Performance: < 100ms para PDF de 100 páginas
- Audit trail completo em `sanitization_log/<dossie_id>`
- Toggle por tenant (Comandante pode pedir contexto específico onde a identidade aparece intencionalmente, ex: contrato)
- Integrado nos 6 pontos críticos listados acima
- Documentação clara sobre como adicionar nova identidade ao manifesto

## Testes

- `tests/sanitization/test_paulo_v23_replay.py`: input PDF v2.3 com F-78 → output sem nome
- `tests/sanitization/test_cpf_variants.py`: CPF mascarado E cru detectados
- `tests/sanitization/test_fuzzy_typos.py`: "Maurilio Mesquita Baesso" e "Mauricio M. Baesso" e "M. M. Baesso" detectados
- `tests/sanitization/test_no_false_positive.py`: PEP "Mauro Baesso da Silva" (fictício) NÃO é mascarado se não estiver no manifesto
- `tests/sanitization/test_perf.py`: PDF 100 páginas < 100ms
- `tests/replay/cases/paulo_v24_sanitized.yaml`: dossiê regenerado passa M11 detector com zero hits

## Manifesto inicial do Comandante (template, NÃO commitar com valores reais)

`docs/sanitizacao_solicitante.md`:

```yaml
# Template — preencher via Firestore Console ou CLI maestro
tenant_id: tbr-comandante-baesso
operator_identity:
  primary_name: "<NOME COMPLETO>"
  name_variants:
    - "<VARIANTE 1>"
    - "<INICIAIS>"
  cpf_hash: "sha256:<hash>"   # nunca cru no manifest
  emails:
    - "<email1>"
  telegram_chat_ids:
    - <chat_id>
  github_handle: "<handle>"
  associated_cnpjs:
    - "<cnpj_da_empresa>"
  aliases:
    - "Comandante Baesso"      # esse é o tratamento, NÃO mascarar internamente
```

**Importante:** "Comandante Baesso" é o tratamento usado por mim com o operador — internamente em logs/conversas é permitido. No PRODUTO FINAL (PDF/MD/API output) é proibido. O sanitizador distingue por contexto: redacted in `output:final`, allowed in `output:internal`.

## Comando para abrir no Cursor

```bash
git checkout -b feat/m12-sanitizador-pii-solicitante
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M12.md
# implemente seguindo DoD; rode tests/sanitization antes de PR
```

## Conventional commit sugerido
```
feat(sanitization): sanitizador de PII do solicitante (#M12)
```

## Notificação de conclusão
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M12 concluído — PR #<n>
Vazamento v2.3 não pode mais ocorrer.
Cobertura sanitizador: <X>%
Replay paulo_v24: passou ✓
```
```


### 📁 M01 — docs/roadmap_v10/M01.md

```markdown
# M01 · CI Lint de Skills + Tom em PDFs

**Pontos:** 5 | **Skill:** transparenciabr-lei

## Contrato
CI em PR: blocklist tom em PDFs, skill manifest sincronizado, CPFs não mascarados.

## Arquivos a criar/editar
- `.github/workflows/skill_lint.yml`
- `scripts/validate_pdf_tone.py`
- `skills/registry.json`

## Definition of Done
- Bloqueia merge se blocklist hit
- Erika/Paulo Octávio passam clean
- Manifesto skills hash-verificado

## Testes
- PR sintético com 'desviou' → CI vermelho
- PR sintético com CPF 11122233344 não mascarado → CI vermelho

## Comando para abrir no Cursor
```bash
git checkout -b feat/m01-$(echo "CI Lint de Skills + Tom em PDFs" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M01.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(ci): ci lint de skills + tom em pdfs (#M01)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M01 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S1 · 13 pts · Forense estrutural


### 📁 S03 — docs/roadmap_v10/S03.md

```markdown
# S03 · Cadeia de Custódia OpenLineage + SHA-256

**Pontos:** 3 | **Skill:** transparenciabr-lei + aurora-forensic-ops

## Contrato
Toda raspagem chama record_evidence(url, raw_bytes, parser_version). Firestore evidence_chain/<sha256>.

## Arquivos a criar/editar
- `engines/custody/chain_of_custody.py`
- `functions/src/saveEvidenceHash.ts`
- `frontend/src/components/dossie/EvidenceBadge.jsx`

## Definition of Done
- Hash visível no rodapé de cada finding card
- Backfill dos dossiês existentes
- Endpoint /api/evidence/<sha> resolve metadata
- Sem PII no hash

## Testes
- Hash determinístico mesma URL+bytes em runs distintos

## Comando para abrir no Cursor
```bash
git checkout -b feat/s03-$(echo "Cadeia de Custódia OpenLineage + SHA-256" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S03.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(custody): cadeia de custódia openlineage + sha-256 (#S03)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S03 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S05 — docs/roadmap_v10/S05.md

```markdown
# S05 · Sanções Internacionais (OFAC/Interpol/GAFI/UN)

**Pontos:** 5 | **Skill:** due-diligence-pro

## Contrato
Refresh diário de OFAC SDN xml, UN consolidada, UE FSF, GAFI jurisdictions, Interpol. Match fuzzy nome+CPF/CNPJ score 0-100, finding se ≥70.

## Arquivos a criar/editar
- `engines/sanctions/sanctions_checker.py`
- `engines/sanctions/refresh_lists_job.py`
- `data/sanctions_lists/`

## Definition of Done
- Refresh diário automatizado
- Cross-check fornecedores × filiados partidários (CEAP+TSE)
- Cache 24h
- FP < 5% em sample manual

## Testes
- 10 nomes positivos + 10 negativos conhecidos

## Comando para abrir no Cursor
```bash
git checkout -b feat/s05-$(echo "Sanções Internacionais (OFAC/Interpol/GAFI/UN)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S05.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(sanctions): sanções internacionais (ofac/interpol/gafi/un) (#S05)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S05 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M02 — docs/roadmap_v10/M02.md

```markdown
# M02 · LLM-as-Judge para qualidade dos dossiês

**Pontos:** 5 | **Skill:** dossie-forense-parlamentar + due-diligence-pro

## Contrato
Gemini 2.5 Pro temp=0 (juiz) + rubric 12 critérios. Score 0-100 + breakdown + sugestões.

## Arquivos a criar/editar
- `engines/quality/llm_judge.py`
- `tests/dossie_quality_rubric.yaml`
- `schemas/judge_output.json`

## Definition of Done
- Erika baseline ≥87
- Paulo Octávio baseline ≥91
- BigQuery dossie_quality_history armazena histórico
- Skill dossie-forense-parlamentar linkada

## Testes
- Inject tom acusatório → score cai ≥15 pontos

## Comando para abrir no Cursor
```bash
git checkout -b feat/m02-$(echo "LLM-as-Judge para qualidade dos dossiês" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M02.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(quality): llm-as-judge para qualidade dos dossiês (#M02)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M02 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S2 · 18 pts · Visualização forense


### 📁 S01 — docs/roadmap_v10/S01.md

```markdown
# S01 · Heatmap + Matriz de Risco Executiva

**Pontos:** 5 | **Skill:** dossie-forense-parlamentar + due-diligence-pro

## Contrato
Componente React grid 2x2 (Reputacional/Legal × Financeiro/Societário) com bubbles dimensionadas. Versão raster no PDF página 1.

## Arquivos a criar/editar
- `frontend/src/components/dossie/ExecutiveHeatmap.jsx`
- `engines/forensic/risk_matrix.py`
- `engines/forensic/__tests__/test_risk_matrix.py`

## Definition of Done
- Componente isolado com Storybook story
- PDF não quebra com 50+ findings
- Acessível (alt-text + ARIA)
- Não regride Erika/Kataguiri/Paulo

## Testes
- __tests__/ExecutiveHeatmap.test.jsx ≥80% coverage
- test_risk_matrix.py classifica corretamente 4 quadrantes

## Comando para abrir no Cursor
```bash
git checkout -b feat/s01-$(echo "Heatmap + Matriz de Risco Executiva" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S01.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(forensic): heatmap + matriz de risco executiva (#S01)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S01 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S02 — docs/roadmap_v10/S02.md

```markdown
# S02 · Grafo de Rede Societária Interativo

**Pontos:** 8 | **Skill:** due-diligence-pro

## Contrato
Cytoscape.js web + NetworkX/matplotlib PDF. Algoritmos: Louvain (comunidade), betweenness, clique detection.

## Arquivos a criar/editar
- `frontend/src/components/dossie/SocietaryGraph.jsx`
- `engines/forensic/graph_builder.py`

## Definition of Done
- Clusters em cores distintas
- Tooltip QSA+capital
- Export SVG/PNG pro PDF
- Cliques ≥4 nodes ganham badge ANÁLISE-INDEPENDENTE-005

## Testes
- Paulo Octávio 32 CNPJs → ≥3 clusters
- Snapshot test do grafo

## Comando para abrir no Cursor
```bash
git checkout -b feat/s02-$(echo "Grafo de Rede Societária Interativo" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S02.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(forensic): grafo de rede societária interativo (#S02)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S02 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M09 — docs/roadmap_v10/M09.md

```markdown
# M09 · Replay-as-test (regressão dos casos âncora)

**Pontos:** 5 | **Skill:** maestro-autonomo + dossie-forense-parlamentar

## Contrato
Cada caso = {input_bundle, expected_findings_count, severidades, eixos, tom_blocklist_must_pass}.

## Arquivos a criar/editar
- `tests/replay/cases/erika.yaml`
- `tests/replay/cases/kataguiri.yaml`
- `tests/replay/cases/paulo.yaml`
- `tests/replay/cases/siqueira.yaml`
- `tests/replay/run_replay.py`

## Definition of Done
- 4 casos âncora versionados
- Diff visual findings novos/sumidos
- Notifica Telegram se regressão
- CI noturno + manual

## Testes
- Promover v1.0 prompt → todos passam
- Inject typo → regression detecta

## Comando para abrir no Cursor
```bash
git checkout -b feat/m09-$(echo "Replay-as-test (regressão dos casos âncora)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M09.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(tests): replay-as-test (regressão dos casos âncora) (#M09)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M09 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S3 · 18 pts · Inteligência ativa


### 📁 S04 — docs/roadmap_v10/S04.md

```markdown
# S04 · Resumo Processual via NLP

**Pontos:** 5 | **Skill:** due-diligence-pro

## Contrato
Gemini 2.5 Flash temp=0.1. Recebe processo_numero, raspa DJEN/Jusbrasil, retorna {tipologia, valor, status, sumula_3l, partes, prox_audiencia}.

## Arquivos a criar/editar
- `engines/nlp/legal_summarizer.py`
- `cloud_run_jobs/process_summarizer.py`

## Definition of Done
- 3 linhas máx tom INFORMATIVO
- Cache Firestore TTL 30d
- Custo ≤ R$ 0,002/processo
- Lições novas vão pro maestro_memory

## Testes
- 50 processos Paulo Octávio + validação humana 10% amostra

## Comando para abrir no Cursor
```bash
git checkout -b feat/s04-$(echo "Resumo Processual via NLP" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S04.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(nlp): resumo processual via nlp (#S04)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S04 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S06 — docs/roadmap_v10/S06.md

```markdown
# S06 · Monitoramento Contínuo Event-Driven

**Pontos:** 8 | **Skill:** aurora-forensic-ops + maestro-autonomo

## Contrato
Cloud Run + Firestore triggers + Eventarc + Pub/Sub. Subscreve Portal Transparência, Receita QSA, DOU, TSE, DJEN.

## Arquivos a criar/editar
- `cloud_run_jobs/sentinel_watcher.py`
- `infra/eventarc_topics.tf`
- `functions/src/sentinel_dispatcher.ts`

## Definition of Done
- Latência mudança → alerta ≤ 15min
- Dedup por hash
- Telegram com summary
- Custo ≤ R$ 5/dia

## Testes
- Evento sintético → finding em <1min staging

## Comando para abrir no Cursor
```bash
git checkout -b feat/s06-$(echo "Monitoramento Contínuo Event-Driven" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S06.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(infra): monitoramento contínuo event-driven (#S06)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S06 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S07 — docs/roadmap_v10/S07.md

```markdown
# S07 · Red Teaming Automatizado (Advogado de Defesa)

**Pontos:** 5 | **Skill:** aurora-forensic-ops

## Contrato
Gemini 2.5 Pro temp=0.1 system 'advogado-defesa'. Cada finding ≥MEDIA passa: prescrição, atenuante normativa, narrativa alternativa, 3 perguntas que investigado faria.

## Arquivos a criar/editar
- `engines/adversarial/defense_agent.py`
- `engines/adversarial/prompts/defense_system.md`

## Definition of Done
- 100% findings ≥MEDIA tagged
- Argumentos defesa aparecem na seção contraditório
- Findings que cedem reclassificam para BAIXA ou FALSO_POSITIVO

## Testes
- Erika Hilton reprocessado: 4 novos finding types aprendidos sobrevivem

## Comando para abrir no Cursor
```bash
git checkout -b feat/s07-$(echo "Red Teaming Automatizado (Advogado de Defesa)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S07.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(adversarial): red teaming automatizado (advogado de defesa) (#S07)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S07 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S4 · 29 pts · Cobertura global


### 📁 S08 — docs/roadmap_v10/S08.md

```markdown
# S08 · Rastreamento Offshore (OpenCorporates + ICIJ)

**Pontos:** 8 | **Skill:** due-diligence-pro

## Contrato
ICIJ Offshore Leaks (Panama/Paradise/Pandora/Bahamas) + OpenCorporates API. Fuzzy match PEP/sócios brasileiros.

## Arquivos a criar/editar
- `engines/offshore/icij_matcher.py`
- `engines/offshore/opencorporates_client.py`
- `data/icij_leaks_snapshot.parquet`

## Definition of Done
- Validação manual antes publicar
- Tom 'registro consta em base ICIJ data X' sem acusação
- Cache 7d

## Testes
- 10 PEPs conhecidos publicamente nos leaks → match positivo

## Comando para abrir no Cursor
```bash
git checkout -b feat/s08-$(echo "Rastreamento Offshore (OpenCorporates + ICIJ)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S08.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(offshore): rastreamento offshore (opencorporates + icij) (#S08)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S08 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S09 — docs/roadmap_v10/S09.md

```markdown
# S09 · Quantificação de Impacto Financeiro

**Pontos:** 8 | **Skill:** due-diligence-pro

## Contrato
Esfera pública: Dano ao Erário = Σ(findings × prob × mult_TCU). Privada: Passivo Oculto Ajustado, Impacto EBITDA.

## Arquivos a criar/editar
- `engines/valuation/financial_impact.py`
- `frontend/src/components/dossie/ImpactGauge.jsx`
- `docs/metodologia_valuation.md`

## Definition of Done
- Metodologia auditável em apêndice
- Disclaimers low/expected/high
- Tom INFORMATIVO 'estima-se' não 'causou'

## Testes
- Paulo Octávio R$ 5,8M PGFN aparece em 'Passivo Confirmado' sem extrapolar

## Comando para abrir no Cursor
```bash
git checkout -b feat/s09-$(echo "Quantificação de Impacto Financeiro" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S09.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(valuation): quantificação de impacto financeiro (#S09)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S09 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 S11 — docs/roadmap_v10/S11.md

```markdown
# S11 · Validação Geoespacial (sede empresa real?)

**Pontos:** 5 | **Skill:** due-diligence-pro

## Contrato
Google Maps Geocoding + Earth Engine + Street View Static. Tipo_estrutura (comercial/residencial/baldio) + área construída × faturamento.

## Arquivos a criar/editar
- `engines/geospatial/sede_validator.py`

## Definition of Done
- Output {lat, lng, tipo, area_m2, foto_url}
- Cache permanente
- Flag 'endereço inconsistente com faturamento'

## Testes
- 10 fornecedores mix (5 reais + 5 noteiras) — classificador ≥8/10

## Comando para abrir no Cursor
```bash
git checkout -b feat/s11-$(echo "Validação Geoespacial (sede empresa real?)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S11.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(geo): validação geoespacial (sede empresa real?) (#S11)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S11 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M04 — docs/roadmap_v10/M04.md

```markdown
# M04 · Distillation Gemma 9B (tarefas específicas)

**Pontos:** 8 | **Skill:** maestro-autonomo

## Contrato
LoRA Gemma 9B-IT em projeto-codex-br. Dataset ≥5k pares curados de maestro_audit_log success=true.

## Arquivos a criar/editar
- `engines/distillation/dataset_builder.py`
- `engines/distillation/tuning_job.py`
- `engines/distillation/eval_ab.py`

## Definition of Done
- Latência ≤ 800ms p95
- Custo ≤ R$ 0,0008/inf (vs R$ 0,02 Pro)
- Score LLM-Judge ≥ 80% do Pro
- Limitado a classificação CEAP, sumarização, NER

## Testes
- A/B 500 casos sample vs Gemini Pro

## Comando para abrir no Cursor
```bash
git checkout -b feat/m04-$(echo "Distillation Gemma 9B (tarefas específicas)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M04.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(ml): distillation gemma 9b (tarefas específicas) (#M04)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M04 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S5 · 16 pts · Hardening


### 📁 S10 — docs/roadmap_v10/S10.md

```markdown
# S10 · Ancoragem em Ledger Distribuído (timestamping)

**Pontos:** 5 | **Skill:** transparenciabr-lei

## Contrato
OpenTimestamps (BTC, gratuito) ou OriginStamp (multi-chain pago). SHA-256 PDF+manifest → proof file .ots.

## Arquivos a criar/editar
- `engines/custody/ledger_anchor.py`
- `cloud_run_jobs/daily_anchor.py`

## Definition of Done
- Proof verificável independente com `ots verify`
- Não bloqueia geração (async)
- Custo ≤ R$ 0 (OTS) ou R$ 1/dossiê (OriginStamp)

## Testes
- Verify offline do bundle Paulo Octávio

## Comando para abrir no Cursor
```bash
git checkout -b feat/s10-$(echo "Ancoragem em Ledger Distribuído (timestamping)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/S10.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(custody): ancoragem em ledger distribuído (timestamping) (#S10)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ S10 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M03 — docs/roadmap_v10/M03.md

```markdown
# M03 · API pública read-only /api/v1 + Swagger

**Pontos:** 3 | **Skill:** transparenciabr-lei

## Contrato
Cloud Functions + Firebase Auth (API key). Endpoints: /v1/politico/{id}, /v1/dossie/{id}, /v1/emendas, /v1/anomalias/scores.

## Arquivos a criar/editar
- `functions/src/api/v1/`
- `frontend/src/pages/Developers.jsx`
- `docs/openapi_v1.yaml`

## Definition of Done
- Swagger UI em /developers
- Free 1k req/dia
- Logs em api_audit
- Sem PII Classe B/C

## Testes
- Postman collection 5 testes contratuais
- Rate-limit bate em 1001ª req

## Comando para abrir no Cursor
```bash
git checkout -b feat/m03-$(echo "API pública read-only /api/v1 + Swagger" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M03.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(ui): api pública read-only /api/v1 + swagger (#M03)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M03 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M05 — docs/roadmap_v10/M05.md

```markdown
# M05 · Observabilidade OpenTelemetry + Cloud Trace

**Pontos:** 5 | **Skill:** aurora-forensic-ops + maestro-autonomo

## Contrato
OTel instrumentação em todos workers. Trace distribuído Telegram→PubSub→Maestro→Vertex→GitHub. Métricas: maestro.cost.brl, tool.latency_ms.

## Arquivos a criar/editar
- `engines/telemetry/otel_init.py`
- `infra/cloud_monitoring_dashboard.json`

## Definition of Done
- Dashboard 6 panels
- Alertas custo >R$30/h, erros >5%/min
- Sampling 10%

## Testes
- Comando /maestro dossie X → Trace com ≥5 spans

## Comando para abrir no Cursor
```bash
git checkout -b feat/m05-$(echo "Observabilidade OpenTelemetry + Cloud Trace" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M05.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(telemetry): observabilidade opentelemetry + cloud trace (#M05)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M05 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M06 — docs/roadmap_v10/M06.md

```markdown
# M06 · Notebook reproduzível por dossiê

**Pontos:** 3 | **Skill:** due-diligence-pro

## Contrato
Cada dossiê gera notebook Colab-compatible com input, Direct Data calls, QSA exploration, findings.

## Arquivos a criar/editar
- `notebooks/dossie_template.ipynb`
- `cloud_run_jobs/notebook_generator.py`

## Definition of Done
- Abre Colab e roda ≤10min
- Sem credenciais hardcoded (Workload Identity)
- Disclaimer LGPD no topo

## Testes
- Paulo Octávio notebook reproduz 98 findings ±5%

## Comando para abrir no Cursor
```bash
git checkout -b feat/m06-$(echo "Notebook reproduzível por dossiê" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M06.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(infra): notebook reproduzível por dossiê (#M06)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M06 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


## 🎯 S6 · 24 pts · Plataforma


### 📁 M07 — docs/roadmap_v10/M07.md

```markdown
# M07 · Multi-tenant SaaS (workspace por escritório)

**Pontos:** 13 | **Skill:** transparenciabr-lei

## Contrato
Subcollections tenants/{tid}/dossies/*. IAM via custom claims. Stripe 3 planos (Free/Pro/Enterprise).

## Arquivos a criar/editar
- `firestore/rules/v10_multi_tenant.rules`
- `frontend/src/contexts/TenantContext.jsx`
- `functions/src/stripe_webhooks.ts`

## Definition of Done
- Stripe Checkout integrado
- Convite usuários workspace
- Auditoria cross-tenant zero leak
- Termo de Uso + DPA

## Testes
- Tenant A não lê doc Tenant B (rules test)
- Webhook Stripe → upgrade plano

## Comando para abrir no Cursor
```bash
git checkout -b feat/m07-$(echo "Multi-tenant SaaS (workspace por escritório)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M07.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(ui): multi-tenant saas (workspace por escritório) (#M07)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M07 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M08 — docs/roadmap_v10/M08.md

```markdown
# M08 · Painel HQ 'The Sims tier' (substitui Pitfall)

**Pontos:** 8 | **Skill:** aurora-forensic-ops

## Contrato
Phaser 3 + WebSocket. 10 crews × 10 sprites + Maestro central. Ping animado em tool exec. Click → últimas 5 ações.

## Arquivos a criar/editar
- `frontend/src/pages/HQ.jsx`
- `frontend/src/components/hq/AgentSprite.jsx`
- `frontend/src/components/hq/CrewRoom.jsx`

## Definition of Done
- 60 FPS mobile
- Keyboard nav accessible
- Tema dark + light
- /hq snapshot envia PNG Telegram

## Testes
- Funciona offline (state mockado) e online (Firestore real)

## Comando para abrir no Cursor
```bash
git checkout -b feat/m08-$(echo "Painel HQ 'The Sims tier' (substitui Pitfall)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M08.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(ui): painel hq 'the sims tier' (substitui pitfall) (#M08)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M08 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


### 📁 M10 — docs/roadmap_v10/M10.md

```markdown
# M10 · Skill cursor-bridge (Cursor ↔ Maestro)

**Pontos:** 3 | **Skill:** maestro-autonomo

## Contrato
No Cursor: @maestro <pergunta> → CLI publica Pub/Sub source=cursor → Maestro webhook → Cursor injeta resposta.

## Arquivos a criar/editar
- `.cursor/rules/maestro_bridge.md`
- `tools/cursor_bridge.py`

## Definition of Done
- Latência ≤ 8s p95
- Token-budget visível
- Histórico em cursor_bridge_log

## Testes
- @maestro explica eixo 5 → resposta consistente com skill dossie-forense-parlamentar

## Comando para abrir no Cursor
```bash
git checkout -b feat/m10-$(echo "Skill cursor-bridge (Cursor ↔ Maestro)" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')
cursor .
# No chat do Cursor:
# @docs roadmap_v10/M10.md
# implemente seguindo DoD; rode pytest tests/replay/ antes de PR
```

## Conventional commit sugerido
```
feat(tooling): skill cursor-bridge (cursor ↔ maestro) (#M10)
```

## Notificar ao concluir
Telegram bot `t.me/Asmodeuswebforgebot` chat `6483072695`:
```
✅ M10 concluído — PR #<n>
LLM-Judge: <score>/100
Replay: <pass/fail>
```
```


---


## ✅ Checklist final pré-execução

- [ ] Estrutura de pastas criada no workspace
- [ ] `EXECUTE_CURSOR.sh` salvo com permissão `+x` (se for usar via terminal local)
- [ ] `PROGRESS.md` salvo (será atualizado a cada PR mergeado)
- [ ] Postmortem v2.3 lido
- [ ] PROMPT-MÃE colado no chat do Cursor
- [ ] Iniciar pela spec M11 (sprint S0-EMERG bloqueia tudo)


**Comandante Baesso · TransparênciaBR · Roadmap v10.0.0 · pacote Cursor consolidado**
