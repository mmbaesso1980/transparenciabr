---
name: transparenciabr-lei
description: "Lei do projeto TransparênciaBR (mmbaesso1980/transparenciabr). Carregue SEMPRE antes de qualquer ação no projeto: dossiês forenses, pipelines AURORA, deploys Firebase/Functions, queries BigQuery, ingestão de dados, frontend, leads INSS, radar_legal, motores Vertex AI, comunicações Telegram, ou contato com o Comandante Baesso. Define identidade, tom obrigatório, identificadores GCP, schemas, LGPD, paleta visual, workflows operacionais e regras invioláveis com nível de severidade BLOQUEIO AUTOMÁTICO."
license: proprietary
metadata:
  author: Comandante Baesso
  version: '1.0'
  scope: projeto-mmbaesso1980-transparenciabr
  source_commit: main
  destilada_de: 20 documentos da repo TransparênciaBR
---

# Lei do Projeto TransparênciaBR

## Quando usar esta skill

Carregue **sempre** que a tarefa envolver, em qualquer grau, o projeto TransparênciaBR:

- Dossiês forenses sobre parlamentares brasileiros (estaduais, federais, senadores, vereadores)
- Pipeline AURORA / leads INSS (Carpes 2k, indeferimentos brasil, radar_legal, radar_juridico)
- Deploy em Firebase Hosting (`transparenciabr.web.app`), Cloud Functions, Cloud Run
- Queries BigQuery em `transparenciabr.transparenciabr` ou `tbr_leads_prev.*`
- Ingestão de dados governamentais (CEAP, emendas PIX, PNCP, DJEN, INSS, DOU, dados.gov.br, dados.pe.gov.br)
- Frontend React (`frontend/src/pages/*` — Radar*, Politico*, Dossie*, Anomalies*, etc.)
- Motores Vertex AI / Gemini / Asmodeus (codinome interno) — execução, configuração ou troubleshooting
- Comunicações no Telegram para o Comandante Baesso (chat `6483072695`)
- VMs do projeto: `aurora-cacador-br` (sa-east1-a) e `tbr-mainframe-us-east1-d`
- Qualquer ação no GitHub `mmbaesso1980/transparenciabr` (PRs, commits, branches, issues)

Também carregue quando o Comandante Baesso disser algo como "no nosso projeto", "no transparenciabr", "no site", "no radar", "no painel", "na VM", "no AURORA", ou referenciar identificadores conhecidos (#229, #230, leads_REAL, CEAP, emendas PIX, etc).

## Núcleo inegociável (sempre em contexto)

### Identidade

| Campo | Valor |
|---|---|
| **Nome público** | TransparênciaBR — Auditoria Cidadã Inteligente |
| **Nome em código/UI** | "Motor Forense TransparênciaBR" (NUNCA expor "Prisma 12" em produção) |
| **Codinome interno** | AURORA (engine em produção); ASMODEUS = nome legado |
| **GCP projeto principal** | `transparenciabr` (número `89728155070`) |
| **GCP projeto Vertex** | `projeto-codex-br` (R$ 5.952 créditos, expira 07/04/2027) |
| **Repo Git** | `mmbaesso1980/transparenciabr` (default branch `main`, público) |
| **Hosting target** | `fiscallizapa` (com dois L — é apenas alvo de deploy, não nome do produto) |
| **Comandante** | Maurílio Mesquita Baesso, `mmbaesso@hotmail.com`, Belém-PA |
| **Chat Telegram** | `6483072695` (8 dígitos — `643072695` é ERRADO) |
| **Bot Telegram** | `t.me/Asmodeuswebforgebot` |

### Tom obrigatório

- Linguagem: **português formal**, sempre tratando o usuário por **"Comandante Baesso"**.
- INFORMATIVO, nunca acusatório. **"Não denunciamos. Mostramos."**
- **PROIBIDO** em qualquer publicação: "fraude", "roubou", "corrupto", "ladrão", "prova de crime".
- **USAR**: "padrão estatisticamente anômalo compatível com <tipologia>", "indício", "anomalia", "risco elevado", "há indícios de irregularidade", "evidência administrativa/estatística".
- Em código/UI público: **nunca** expor codinomes internos (Asmodeus, Goetia, demônios).

### 10 regras invioláveis (BLOQUEIO AUTOMÁTICO se violadas)

1. **Apenas dados reais, verificáveis, sem mock, sem fake.**
2. **URL primária verificável em cada finding** (dossiês exigem fonte clicável).
3. **18-25 findings por dossiê**, classificados por severidade (CRÍTICA/ALTA/MÉDIA/BAIXA).
4. **Contraditório garantido** — link para contestação no dossiê.
5. **Direito de resposta antes da publicação**: 3 perguntas + 48h de prazo.
6. **Cadeia de custódia OpenLineage** — SHA-256 de cada documento.
7. **Temperatura 0.1** para engines forenses (determinístico, zero alucinação).
8. **JSON estruturado** como output dos agentes — nunca prosa livre.
9. **Se não souber, retorne `null`.** Nunca invente.
10. **CPF nunca em texto claro nos logs.** Sempre `SHA256(cpf + "asmodeus_v1")` ou mascarado `***.XXX.XXX-**`.

Bloqueios automáticos adicionais (EXEC-011):
- Hardcoded credentials → BLOQUEIO
- `DROP TABLE` sem confirmação do Comandante → BLOQUEIO
- Publicação sem carimbo COMPLIANCE-004 → BLOQUEIO
- Modificação de arquitetura core sem aval BACKEND-002 → BLOQUEIO

### Header LGPD obrigatório em todo CSV de leads

```
# TransparenciaBR/AURORA
# Base legal: LGPD art. 7º IX (legítimo interesse) + art. 11 II g (saúde, quando aplicável)
# Fonte: [especificar — DataJud CNJ, PJe consulta pública, Direct Data, DJEN, etc.]
# Diagnóstico final cabe exclusivamente ao advogado responsável.
# Descadastro: contato@transparenciabr.com.br
```

### Classificação LGPD (COMPLIANCE-004)

| Classe | O que é | Tratamento |
|---|---|---|
| **A** | CNPJ, razão social, nome de PEP, cargo, salário, contratos, atas, votações | Publicável |
| **B** | CPF de PEP (parlamentar/servidor público) | Pseudonimizar: `***.XXX.XXX-**` |
| **C** | CPF de civis, endereço residencial, telefone particular, saúde | **BLOQUEADO** |

Máscara genérica para conteúdo bloqueado: `[DADO PROTEGIDO POR LGPD]`.

### Padrão visual (mínimo)

- Cor primária: **teal `#01696F`**
- Tipografia dossiês: **DM Sans** (títulos) + **Inter** (corpo)
- PDFs forenses: **ReportLab**
- Mapas: **ColorBrewer YlOrRd**

### Padrão de query BigQuery

```python
# Dataset tbr_leads_prev → location southamerica-east1
# Datasets transparenciabr, tbr_ceap → location US
call_external_tool(
  tool_name="google_cloud-run-query",
  source_id="google_cloud__pipedream",
  arguments={"query": "...", "location": "southamerica-east1"}
)
```

- Sempre `--use_legacy_sql=false`.
- Acentos em colunas exigem backticks: `` `forma_filiação` ``.
- **NUNCA expor outputs brutos do conector Pipedream** — vazam chave da SA `tbr-reader` (já comprometida).
- Crawlers governamentais: **User-Agent `TransparenciaBR-engines/1.0`** (dados.gov.br retorna 403 a UA genérico).

### VMs

| Nome | Zona | Propósito |
|---|---|---|
| `aurora-cacador-br` | `southamerica-east1-a` (IP `34.39.224.224`) | Pipeline AURORA radar_legal, ingestão BR |
| `tbr-mainframe-us-east1-d` | `us-east1-d` | Mainframe legado |

Acesso obrigatório via **IAP** (Identity-Aware Proxy):
```bash
gcloud compute ssh aurora-cacador-br --zone=southamerica-east1-a --tunnel-through-iap
```

**Armadilha conhecida**: NUNCA usar `pkill -f <nome_do_script>` dentro de `--command='...'` — o pattern bate no próprio command-line do `gcloud` na VM e mata o SSH. Use PID file ou `pkill -f -U $USER` com filtros mais específicos.

## Como ler as referências

Sempre que a tarefa exigir profundidade além do núcleo inegociável acima, leia **só a seção pertinente** de `references/lei_completa.md`:

| Quando a tarefa for sobre... | Ler seção(ões) |
|---|---|
| Identidade, tom, missão | §1 (linhas ~10-90) |
| Stakeholders, deputados-piloto | §2 |
| Arquitetura: stack, projetos, VMs, buckets, datasets, functions, Firestore, rotas frontend | §3 |
| Tokens, URLs de API, rate limits, chat IDs | §4 |
| Schema de tabelas, hash CPF, header LGPD, retenção, taxonomia LGPD | §5 |
| Paleta, tipografia, PDFs, mapas, regras de viz | §6 |
| firestore.rules, BACKEND-002, SAs, FINOPS-006, Protocolo Anti-Difamação | §7 |
| Como autenticar, deploys, engines, pipeline go-live, padrões BQ/SRE/DATAOPS | §8 |
| Regras invioláveis, score ASMODEUS, contratos JSON dos agentes detetives | §9 |
| Conventional Commits, branches, PRs históricos, Definition of Done | §10 |
| Estado atual, sprints, débitos técnicos | §11 |
| Glossário (AURORA, ASMODEUS, KATAGUIRI, SENTINEL, GEMMA, etc) | §12 |

Use `read(file_path="/home/user/workspace/transparenciabr-lei/references/lei_completa.md", offset=N, limit=M)` para puxar trechos específicos. Não carregue o arquivo inteiro de uma vez a menos que a tarefa exija auditoria total.

## Como aplicar

1. **Identificou que a tarefa é do projeto?** Carregue esta skill (`load_skill("transparenciabr-lei", scope="user")`).
2. **Internalize o núcleo inegociável** acima — ele é regra hard, não orientação.
3. **Identifique qual seção do `lei_completa.md`** cobre a tarefa específica. Leia só ela.
4. **Antes de qualquer output ao Comandante**, valide contra:
   - Tom (informativo, formal, "Comandante Baesso", sem palavras proibidas)
   - Regras invioláveis 1-10
   - Bloqueios EXEC-011
   - Classificação LGPD do dado que está sendo manipulado
5. **Para qualquer ação irreversível** (deploy, drop, publicação, envio de mensagem em massa), confirme com o Comandante antes via `confirm_action` ou Telegram.
6. **Cite fontes** quando reportar regras: ex. `(PLANO_MESTRE_V3.md §5.3)`.

## Skills relacionadas que invocar em paralelo

- `dossie-forense-parlamentar` — quando o pedido for um dossiê. Esta skill define padrão visual, tom, fontes obrigatórias.
- `enrichment-pii-aurora` — quando o pedido envolver enriquecimento PII dos leads previdenciários (Carpes 2k, 150 ES, radar_legal).

Em caso de conflito entre skills: **transparenciabr-lei é a autoridade superior** — define as regras do projeto inteiro; as outras são procedimentos especializados que precisam respeitar a lei.

## Glossário rápido (núcleo)

- **AURORA**: engine de IA forense em produção (Vertex AI + Gemini). Substitui ASMODEUS na nomenclatura pública.
- **ASMODEUS**: codinome interno legado. Não usar em UI/código público.
- **KATAGUIRI**: piloto inicial (Erika Hilton).
- **SENTINEL**: motor de monitoramento contínuo.
- **GEMMA**: classificador leve para CEAP (12 prismas).
- **DJEN**: Diário de Justiça Eletrônico Nacional (`comunicaapi.pje.jus.br`).
- **CEAP**: Cota para Exercício da Atividade Parlamentar (Câmara Federal).
- **CARPES**: lote de 2.000 leads INSS qualificados pelo Gemini.
- **Radar Legal**: módulo de captação de indeferidos INSS via DataJud + PJe.
- **Radar Jurídico**: dashboard frontend (`frontend/src/pages/RadarJuridico.jsx`).
- **Indeferidos brasil_raw**: tabela BigQuery `tbr_leads_prev.indeferimentos_brasil_raw` (carga 6M via engine 26).

A íntegra do glossário e siglas estão em §12 de `references/lei_completa.md`.
