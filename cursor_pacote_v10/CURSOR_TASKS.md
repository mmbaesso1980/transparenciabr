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
