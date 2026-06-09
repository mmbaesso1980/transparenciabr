# 13 — MEMÓRIA DESTILADA (toda nossa história compactada)

> Destilação de 60+ memórias acumuladas entre março e maio de 2026.
> Tudo que precisa lembrar para operar como Computer operava.

---

## 1. QUEM É O COMANDANTE

- **Nome completo:** Maurílio Mesquita Baesso
- **Localização:** Belém, Pará — Brasil
- **Profissão:** Engenheiro de dados / Desenvolvedor cloud — foco em transparência pública e análise política
- **Stack pessoal:** GCP, Vertex AI, BigQuery, Python, React, GitHub
- **Bot pessoal:** `t.me/Asmodeuswebforgebot` (chat ID `6483072695`)
- **E-mails:** mmbaesso@hotmail.com (primário), manusalt13@gmail.com (sucessor)
- **Família:** Pai José Aparecido Baesso (in memoriam) — inventário 10ª Vara Cível Belém-PA processado em mar/2026.
- **Outros negócios:** Co-fundador da OceanWays (turismo) — não confundir com TransparênciaBR.

## 2. AMBIÇÃO MÁXIMA DO PROJETO

- **Meta declarada:** Ganhar o Prêmio Pulitzer com jornalismo investigativo movido a IA.
- **Como:** OCR + LLM analisando CEAP, notas fiscais, emendas, gastos de parlamentares federais e estaduais.
- **Diferencial:** Padrões invisíveis a olho humano (Benford, Z-score, cruzamento de sócios, geolocalização).
- **Lema público:** "Não denunciamos. Mostramos."

## 3. ARQUITETURA GCP (dois projetos)

| Projeto | Número | Função | Billing |
|---|---|---|---|
| `transparenciabr` | 89728155070 | Hosting, Functions, Firestore, BigQuery | Pago normal |
| `projeto-codex-br` | 282847675243 | Vertex AI, Cloud Run, Pub/Sub, Artifact Registry | **R$ 5.677,28 crédito vivo até 03/05/2027** |

**Regra de ouro:** TODA chamada Vertex/Gemini/IA vai em `projeto-codex-br`. F6 bloqueio automático.

## 4. VMs E COMPUTE

| VM | Zona | Status |
|---|---|---|
| `aurora-cacador-br` | sa-east1-a | **LIGADA** — IP 34.39.224.224, pipeline AURORA radar_legal, ingestão BR, listener Maestro |
| `tbr-mainframe-us-east1-d` | us-east1-d | **DESLIGADA** desde 25-mai (economia R$ 800-1500/mês). Religar manualmente só para OCR ou ingestão noturna. |

## 5. PROTOCOLO ASMODEUS (codinome interno legado)

Hierarquia de submódulos forenses (Plano Mestre v2.0):

| Submódulo | Função |
|---|---|
| **AURORA** | Engine ativa em produção (substitui ASMODEUS no público) |
| **BENFORD** | Lei de Benford via SQL para detecção de fraude em notas |
| **DRACULA** | Auditoria de saúde — hospitais fantasma, superfaturamento SUS |
| **ESPECTRO** | Posicionamento ideológico via TF-IDF + KMeans em votações |
| **FLAVIO** | Funcionários fantasma e rachadinhas em gabinetes |
| **SANGUE E PODER** | Nepotismo via QSA + árvores genealógicas + fuzzy match |
| **IRONMAN** | Auditoria de neutralidade do próprio motor |
| **NERO** | Protocolo de cross-project billing (auditoria de gastos GCP internos) |
| **SENTINEL** | Monitoramento contínuo pós-publicação |
| **GEMMA** | Classificador leve CEAP (12 prismas) |
| **KATAGUIRI** | Piloto inicial (caso Erika Hilton + Kim Kataguiri) |

Estes nomes **JAMAIS aparecem em UI pública, dossiês ou código de produção.** São uso interno tático/estratégico.

## 6. DOSSIÊS HISTÓRICOS

| Alvo | Tipo | Status | PDF compartilhado |
|---|---|---|---|
| Erika Hilton | Parlamentar (dep federal) | v1.1 piloto — auditoria externa concluída, falsos positivos reclassificados | `dossie_erika_hilton.pdf` |
| Kim Kataguiri | Parlamentar (dep federal) | v1.0 entregue | `dossie_kim_kataguiri.pdf` |
| Andreia Siqueira | Parlamentar local | v1.0 entregue | `dossie_andreia_siqueira.pdf` |
| Paulo Octávio | Ex-governador (DF) | Due diligence empresarial — comparação 2-vias | `dossie_paulo_octavio.pdf` + `comparacao_2vias_paulo_octavio.pdf` |
| Abimael Santos | Parlamentar estadual | v4.1 ciano-style | (arquivo histórico) |

## 7. ENGINES E PIPELINES ATIVOS

| Pipeline | Função | Status |
|---|---|---|
| **Engine 26** | Carga CEAP/indeferidos brasil_raw (6M linhas) | Operacional |
| **AURORA Forensic v1.0** | Legião 100 → dossiê PDF profissional | Cross-project billing ativo (PR #251) |
| **Carpes 2k INSS** | Enriquecimento PII previdenciário (4 caminhos legais) | Pausado por infra — migrando para `aurora-cacador-br` |
| **Radar Legal** | Captação indeferidos INSS via DataJud + PJe | Frontend `RadarJuridico.jsx` |
| **CEAP Onda 15** | Classificação Vertex Gemini de notas | Pendente — VERTEX_PROJECT=projeto-codex-br |
| **Maestro v2.0** | Agente autônomo GOD | Deployed 29-mai (revisão 00004-qxt) |

## 8. PROTOCOLO ANTI-LOOP (28-mai-2026)

> Se o agente mostrar variações repetitivas sem convergir em 3 tentativas, Comandante manda **`STOP — RESET`**.
> Agente para, recapitula, muda estratégia.
> Soluções que levam >3 prompts para convergir devem ser **gravadas em memória** para sessões futuras.

Diagnostic ID engenharia Perplexity: `3792dfcb-1bc6-4278-bb77-a2990b109a1e`.

## 9. PREFERÊNCIAS DE CRÉDITO E LLM

- **Eficiência máxima de créditos** — sempre. Avisar antes de queimar >R$ 30/h.
- **Vertex Gemini 2.5 Pro em `projeto-codex-br`** é o motor padrão para tarefas pesadas.
- Reasoning Engine SDK preferido para paralelização (12 agents Vertex ativos).
- **Cloud Functions/Cloud Run > loops longos.**
- Subagents só com aprovação se >R$ 5/run.

## 10. SEGURANÇA — INCIDENTES E REGRAS

| Incidente | Quando | Lição |
|---|---|---|
| **PAT GitHub vazado** | 29-mai | `ghp_x1ikuXS0kO...` (real). Sempre redact antes de commit. `grep -rn "ghp_\\|sk-\\|AIza"` no diff. |
| **Token Telegram exposto** | maio/2026 | `8671845549:AAHJpk...` rotacionar via @BotFather /revoke. |
| **Shodan key exposta** | maio/2026 | Resetar em account.shodan.io. |
| **SA `tbr-reader` comprometida** | maio/2026 | NUNCA expor output bruto do conector Pipedream — vaza chave. |
| **PII commit blocking** | maio/2026 | Pre-commit hook bloqueia push de CPF em texto claro. |

## 11. LGPD CLASSE A/B/C

| Classe | Dado | Tratamento |
|---|---|---|
| A | CNPJ, razão social, PEP, cargo, salário, contratos, atas, votações | Publicável |
| B | CPF de PEP (parlamentar/servidor) | Pseudonimizar: `***.XXX.XXX-**` |
| C | CPF de civis, endereço residencial, telefone, saúde | **BLOQUEADO** — substituir por `[DADO PROTEGIDO POR LGPD]` |

Header obrigatório em todo CSV de leads:
```
# TransparenciaBR/AURORA
# Base legal: LGPD art. 7º IX + art. 11 II g (saúde, quando aplicável)
# Fonte: [especificar]
# Diagnóstico final cabe exclusivamente ao advogado responsável.
# Descadastro: contato@transparenciabr.com.br
```

## 12. MONETIZAÇÃO E PRICING

- **B2B data mining** — venda de leads qualificados (Carpes 2k → Hélio).
- **Reseller model** em estruturação — preços de referência market mapeados.
- **Carpes-to-Hélio** = primeira sales operation real do projeto.
- Pulitzer ≠ produto comercial — são linhas paralelas.

## 13. DESIGN SYSTEM

- **Cor primária:** teal `#01696F`
- **Tipografia dossiês:** DM Sans (títulos) + Inter (corpo)
- **Tipografia UI:** Inter
- **PDFs:** ReportLab
- **Mapas:** ColorBrewer YlOrRd
- **Site público (homepage):** Layout estilo `data.gov.uk` com logo minimalista
- **Página /universo:** 3D orbs representando parlamentares, senadores, governadores, fornecedores e suas conexões
- **Avatares UI:** Componente `PoliticianOrb` (cyan neutro com iniciais) — NUNCA círculo sólido de iniciais
- **HQ Phaser Black Mirror mode:** entregue mai/2026 — personagens andando, conversando, indo ao copo de café

## 14. FRONTEND ROTAS PRINCIPAIS

| Rota | Página |
|---|---|
| `/` | Homepage estilo data.gov.uk |
| `/universo` | 3D orbs interconectados |
| `/perfil` | Read-only user info |
| `/radar-juridico` | Indeferidos INSS dashboard |
| `/anomalies` | Anomalias CEAP |
| `/politico/:id` | Detalhe parlamentar |
| `/dossie/:slug` | Visualizador dossiê |
| `/escritorio` | Escritório HQ Maestro |
| `/escritorio-hq` | HQ Phaser "The Sims tier" |
| `/painel` | Status sprints e métricas |

## 15. PENDÊNCIAS CONHECIDAS (29-mai-2026)

- ✅ Bloque 1, 2, 4, 5 fechados
- ⏳ Bloque 3 aguarda gcloud autenticado no Cloud Shell
- ⏳ ASMODEUS remediation (PR #251 já mergeado parcialmente)
- ⏳ EXEC-011 v2 linting adiado
- ⏳ HQ v1.1 wire-up (issue #252) — **vamos fazer agora**
- ⏳ CEAP Onda 15 com VERTEX_PROJECT correto
- ⏳ Rotacionar PAT para escopo mínimo
- ⏳ 15 stale branches (cursor/* + feat/* + deploy/*) para limpar

## 16. PROTOCOLO DE INVESTIGAÇÃO (analysis_protocol)

1. **Identificação** → TSE + Câmara API + perfis sociais
2. **CEAP Anomalias** → Portal Câmara CEAP + Benford + Z-score
3. **Emendas** → Portal Transparência (autoria + pagamento)
4. **Judicial** → TRF/STF/PJe consulta processos
5. **Empresas (Eixo 5)** → CNPJs exclusivos + cruzamento sócios via Direct Data
6. **OSINT** → Sherlock + Wayback + dorks Google
7. **Contraditório** → Coletar manifestações públicas (CNN/Folha/UOL/IG)
8. **Falso Positivo** → Google Scholar + Lattes + LinkedIn (anti-imputação)
9. **Fonte Primária** → Normalizar para URL citável
10. **Decisão Judicial** → Watcher contínuo TRF/STF/PJe

## 17. RELACIONAMENTO COM FORNECEDORES

- **Direct Data:** API parceira para QSA, BF, CadastroPF Plus, Processos. Endpoints: 6.
- **DATAPREV:** Caminho A do enrichment (convênio INSS).
- **Serasa/Quod:** Caminho B (bureau de crédito).
- **CNJ DataJud:** Crawler User-Agent `TransparenciaBR-engines/1.0` (genérico = 403).

## 18. MAESTRO — HISTÓRICO DE EVOLUÇÃO

- **v1.0** (mai/2026) — Worker + Listener + Memory + Deploy + Teste cego harness
- **v2.0 GOD** (29-mai-2026) — 19 tools, 6 freios, regra silêncio, anti-OPERADOR
- **v2.1** (jun/2026) — Personalidade Computer transferida + HQ wire-up + Equipe formalizada
- **v2.2 GOD** (04-jun-2026) — **deploy produtivo.** Worker Cloud Run `maestro-worker` em `projeto-codex-br/us-east1` com URL pública (`https://maestro-worker-evkxdmnelq-ue.a.run.app`). **Cross-project secrets** via project NUMBER `89728155070` (8 secrets reais no Secret Manager de `transparenciabr`; usar NUMBER, nunca o name). **Webhook FastAPI ATIVO** em `https://transparenciabr-glwbe3qhjq-uc.a.run.app/webhook` (PR #263 venceu o polling — AUDITORIA C 2026-06-09); o listener systemd da VM `aurora-cacador-br` ficou **DEPRECATED/zumbi** e a VM pode ficar `stopped` exceto para batch. **Cloud Scheduler `maestro-heartbeat`** cron `*/30 * * * *` (30 min) bate no worker. F2 (senha do dia) **removido** pelo PR #268 → auth passa a F1 + header `X-Telegram-Bot-Api-Secret-Token` (fail-closed). Debian 12 PEP 668 → venv `~/maestro-venv` (legacy). Detalhe completo em `15_licoes_deploy_v22.md`.
- **v2.3** ⏳ Fine-tuning Vertex trimestral + auto-edição do system prompt
- **v2.4** ⏳ Multi-Maestro com voto Condorcet

## 19. LIÇÕES JÁ GRAVADAS EM `maestro_memory`

| Topic | Conteúdo |
|---|---|
| `pkill-armadilha` | NUNCA `pkill -f X` dentro de `gcloud --command` |
| `glyph-render-pdf` | `▸` (U+25B8) não renderiza em Inter — usar `›` (U+203A) |
| `vm-worker-silent-fail` | try/except: pass grava 0 bytes — sempre logar err |
| `tbr-reader-sa-comprometida` | NUNCA expor output bruto de Pipedream `run-query` |
| `silent-fail-no-telegram` | NUNCA `task_complete` sem antes `telegram_send` |
| `hardcoded-paths` | Sempre env vars ou `Path(__file__).parent` |
| `secret-scanning-leak` | Grep PAT/sk-/AIza antes de commit |
| `reflection-20260529-0` | Reflexão diária 29-mai (auto-gerada) |
| `cross-project-secret-number` | Secret cross-project usa project NUMBER `89728155070`, nunca o name `transparenciabr` |
| `listener-filehandler-silent-fail` | Listener com `FileHandler` em path sem permissão falha em silêncio — usar `StreamHandler`/journald |
| `pep668-venv-debian12` | Debian 12 bloqueia pip global (PEP 668) — usar venv `~/maestro-venv` (caminho VM legacy) |
| `webhook-venceu-polling` | PR #263: webhook FastAPI Cloud Run é autoritativo; polling systemd da VM é zumbi — `disable` e VM pode ficar stopped |
| `webhook-secret-fail-closed` | Sem `maestro-telegram-webhook-secret` o webhook retorna 401 e descarta tudo — checar `/healthz` |

## 20. PRINCÍPIOS-PILAR (INEGOCIÁVEIS)

1. **Apenas dados reais, verificáveis, sem mock, sem fake.**
2. **"Não denunciamos. Mostramos."**
3. **"Discutimos mitologia, jamais ferimos a lei."**
4. **Crédito Vertex em `projeto-codex-br` SEMPRE.**
5. **Comandante Baesso ou Maurílio — NUNCA OPERADOR.**
6. **Português formal, tom INFORMATIVO, nunca acusatório.**
7. **Pronome "nós", evitar "a gente".**
8. **Anti-loop ativo: 3 falhas → STOP RESET.**
9. **Snapshot Firestore antes de ação irreversível.**
10. **Audit log imutável de TUDO.**
