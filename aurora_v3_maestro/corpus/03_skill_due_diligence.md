---
name: due-diligence-pro
description: Compila relatórios de due diligence empresarial/PEP para alvos NÃO-parlamentares (empresários, executivos, ex-governadores, sócios de licitantes). Use quando o Comandante OPERADOR pedir due diligence, KYC reforçado, análise de PEP, dossiê empresarial ou avaliação de risco de contraparte sobre alvo fora do escopo parlamentar ativo. NÃO usar para parlamentares ativos (essa é a `dossie-forense-parlamentar`).
license: MIT
---

# due-diligence-pro v1.1
**Plataforma:** TransparênciaBR · Comandante OPERADOR  
**Escopo:** Due diligence empresarial/PEP — alvos NÃO-parlamentares  
**Versão pioneer (v1.0):** Dossiê Paulo Octávio Alves Pereira (mai/2026) · 30p · 45 findings  
**Versão EVISCERADOR (v1.1):** Dossiê Paulo Octávio v2.0 EVISCERADOR (mai/2026) · 46p · 81 findings · pivot Direct Data via sandbox  
**Referência de mercado:** POC-SCAN (LOBO MAU) · 503p · Direct Data white-label · R$ 1.500–5.000  

---

## 1. QUANDO USAR ESTA SKILL

Carregar `due-diligence-pro` quando o Comandante solicitar qualquer um dos seguintes:

1. **Due diligence de parceiro/contraparte** — empresário, executivo, controlador de holding que assina contrato, investimento ou licitação pública
2. **KYC reforçado PEP** — pessoa exposta politicamente SEM mandato parlamentar ativo: ex-governador, ex-prefeito, ex-secretário, ex-ministro, candidato a cargo executivo
3. **Análise de sócio/beneficiário final** — identificar quem controla efetivamente uma empresa que concorre a licitação ou que é contraparte em negócio
4. **Dossiê empresarial de grupo** — holding familiar, grupo econômico, consórcio, SPE em licitação pública
5. **Avaliação de risco de contraparte** — crédito + reputação + contencioso judicial de empresa ou controlador
6. **Rastreamento patrimonial** — identificar ativos e passivos (imóveis, veículos, dívida ativa, protestos) de alvo empresarial
7. **Mapeamento de rede societária** — sucessão patrimonial, blindagem via holdings, beneficiário final multi-grau
8. **Investigação de candidatos a cargos públicos não-parlamentares** — candidatos a governador, prefeito, secretário, diretores de agências

### Diferenciação de `dossie-forense-parlamentar`

| Critério | `dossie-forense-parlamentar` | `due-diligence-pro` |
|---|---|---|
| Alvo | Parlamentar com MANDATO ATIVO | Empresário, ex-político, executivo, PEP sem mandato |
| Foco principal | CEAP, emendas, votações, presença | Rede societária, passivo fiscal, contencioso |
| Fontes core | API Câmara/Senado, Portal Transparência | Direct Data, PGFN, Cenprot, TJs, BACEN |
| Score | AURORA parlamentar | AURORA 360 PEP-empresarial |
| Caso de uso | Monitoramento de representante eleito | Due diligence pré-negócio, licitação, investimento |

**Regra de ouro:** se o alvo tem mandato parlamentar ativo, use `dossie-forense-parlamentar`. Para tudo mais, use `due-diligence-pro`.

---

## 2. PRINCÍPIOS INEGOCIÁVEIS (herdados da `transparenciabr-lei`)

1. **Tom INFORMATIVO** — sempre "Comandante OPERADOR", português formal. Nunca alarmista.
2. **"Não denunciamos. Mostramos."** — apresentar fatos, não acusações.
3. **Sem mock, sem fake** — toda informação obriga URL primária verificável. Zero dado inventado.
4. **CPF mascarado** — formato `***.XXX.XXX-**` em todo o documento publicável.
5. **Contraditório 3-partes** — obrigatório para findings de severidade MÉDIA, ALTA e CRÍTICA:
   - Parte 1: decisão judicial conhecida sobre o fato
   - Parte 2: manifestação pública do alvo ou defesa
   - Parte 3: direito de resposta institucional (canal de contestação)
6. **LGPD Classe A/B/C** — Classe A (dado público de função): exibir; Classe B (dado profissional): exibir com contexto; Classe C (endereço residencial, telefone pessoal, renda): omitir ou agregar.
7. **PROIBIDOS no PDF:** BigQuery, vw_*, fato_emenda_pagamento, Asmodeus, fraudou/desviou/roubou/corrupto (termos imputativos). Use: "investigado", "apurado", "objeto de inquérito", "réu em ação de".
8. **Presunção de inocência** — ações em tramitação não configuram condenação. Incluir aviso em cada finding de ação ativa.
9. **Data de extração visível** — cada módulo de bureau deve exibir a data de consulta.
10. **Qualificação como indícios** — todos os dados de bureau são "indícios" até confirmação por certidão ou decisão judicial.

---

## 3. PIPELINE EM 9 FASES

### FASE 1 — Identificação do Alvo

**Inputs obrigatórios do Comandante:**
- Nome completo do alvo (PF e/ou PJ principal)
- CPF/CNPJ (pelo menos um)
- Contexto: motivo da due diligence (parceria, licitação, investimento, candidatura)
- Prazo e profundidade (standard 30-50 findings / premium 50+ findings)

**Outputs desta fase:**
- Classificação PEP (sim/não + grau: ex-eleito, cônjuge/parente PEP, servidor de alto escalão)
- Base legal LGPD aplicável (art. 7º, II — execução de contrato; ou art. 7º, IX — interesse legítimo)
- Entidades a investigar (PF principal + PJs controladas/participadas)
- Escopo geográfico (UFs prioritárias para imóveis e processos)

```python
# Exemplo de manifesto de alvo
alvo_manifest = {
    "nome_completo": "NOME COMPLETO DO ALVO",
    "cpf_mascarado": "***.XXX.XXX-**",
    "cnpj_principal": "XX.XXX.XXX/0001-XX",
    "classificacao_pep": "EX-GOVERNADOR / PEP NÍVEL 1",
    "contexto": "Avaliação de risco de contraparte para contrato de R$ XX",
    "base_legal_lgpd": "Art. 7º, IX — interesse legítimo do contratante",
    "entidades_escopo": ["PF principal", "PJ matriz", "Holdings identificadas"],
    "data_solicitacao": "DD/MM/AAAA"
}
```

### FASE 2 — Direct Data Suite (Bureau Core)

Consultar na seguinte ordem de prioridade:

| Produto Direct Data | Campo-chave | Prioridade |
|---|---|---|
| `ReceitaFederalPessoaJuridica` | QSA, CNAEs, filiais, capital social | OBRIGATÓRIO |
| `BeneficiarioFinal` | Beneficiário final multi-grau + pepMatriz | OBRIGATÓRIO |
| `CadastroPF Plus` | Endereços, telefones, e-mails, parentes | OBRIGATÓRIO |
| `ProcessosJudiciaisSimplificada` | Contagem + polo + evolução temporal | OBRIGATÓRIO |
| `ImóveisPrevia` | Matrículas por UF e cartório | ALTA |
| `PesquisaVeicular` | Veículos por CPF/CNPJ (limite 20) | ALTA |
| `ProtestosCenprot` | Valor + quantidade por UF/cidade | ALTA |
| `PGFNListaDevedores` | Dívida Ativa União + valor | ALTA |
| `MovimentaçãoFuncionáriosRAIS` | Histórico 20 anos (entradas/saídas) | MÉDIA |
| `PropriedadeIntelectualMarcas` | INPI — marcas registradas | MÉDIA |
| `DébitosTributáriosMobiliáriosPMSP` | Débitos municipais SP | BAIXA |
| `DoadoresEFornecedoresEleicoes` | TSE — doações eleitorais | BAIXA |

**Pontos críticos de qualidade:**
- Exibir data de extração por módulo
- Registrar resultados ZERADOS (prova de diligência)
- Usar palavra "Possíveis" para dados probabilísticos de bureau
- Limitar imóveis rurais: cobertura 1995–2020 (limitação declarada)
- Limitar ex-sócios: disponíveis a partir de 12/2015 (limitação Direct Data)

### FASE 3 — Rede Societária e Sucessão Patrimonial

**Modelo operacional (referência: caso AKP / Paulo Octávio):**

```
[Investigado PF] → [PJ Matriz] → [Filiais] → [SPEs/Consórcios]
       ↓
[Holding Familiar] → [Herdeiros/Cônjuge]
       ↓
[Empresas de terceiro grau via "Sociedades em Comum"]
```

**Passos:**
1. BeneficiárioFinal até 10 graus de separação — flag `pepMatriz=true` aciona due diligence reforçada
2. Mapear holdings familiares (cônjuge + filhos + genros/noras como sócios formais)
3. Identificar estruturas de sucessão (holding de transmissão patrimonial intergeracional)
4. Cruzamento estratégico de contatos: e-mails, telefones e endereços compartilhados entre entidades
5. "Sociedades em Comum — Outras Entidades": mapeamento de vínculos com terceiros via intermediárias
6. Identificar CNAEs históricos — atividades ocultas ou descontinuadas

**Output esperado:**
- Diagrama textual da rede (mínimo)
- Lista de CNPJs com qualificação + data de entrada
- Flag de confusão patrimonial (e-mail/endereço compartilhado PF↔PJ)
- Flag pepMatriz para cada empresa do grupo

### FASE 4 — Passivo Fiscal e Cartorário

Fontes obrigatórias:
- **PGFN Dívida Ativa** → `https://www.regularize.pgfn.gov.br` ou Direct Data
- **Protestos Cenprot** → via Direct Data `ProtestosCenprot`
- **FGTS Regularidade** → Caixa Econômica Federal (via Direct Data)
- **Débitos PMSP** → se alvo tiver atividade em São Paulo

**Template de tabela de passivos:**

| Tipo | Entidade | Valor (R$) | Origem | Data |
|---|---|---|---|---|
| Dívida Ativa PGFN | [PJ] | [R$] | Tributário | [data] |
| Protestos Cenprot | [PF/PJ] | [R$] | [UF/Cidade] | [data] |
| Total consolidado | — | **[R$ TOTAL]** | — | — |

### FASE 5 — Contencioso Judicial

**Tribunais a consultar (ordem de prioridade):**

| Nível | Tribunais | Tipo de ação |
|---|---|---|
| Superior | STJ, STF | Recursos, ações originárias |
| Eleitoral | TSE, TRE-* | Candidaturas, cassações, financiamento |
| Federal | TRF-1, TRF-2, TRF-3, TRF-4, TRF-5 | Federal + tributário |
| Estadual | TJ-* (UFs com atuação) | Cível, criminal, falência |
| Trabalho | TRT-* (UFs com atuação) | Trabalhista |
| 1ª instância | JF-*, TJDF (varas especializadas) | Processos originários |

**Modelo de evolução temporal (referência POC-SCAN):**
- Tabela Ano × Mês (Jan–Dez) para polo ativo e passivo
- Destacar picos (correlacionar com eventos — ex: demissões em massa vs. pico TRT)
- Separar janelas: "Últimos 5 anos" / "6–15 anos" / "Acima de 15 anos"
- Para top-10 mais relevantes: incluir número CNJ individual + última movimentação

**Processos Compartilhados — top 20 contrapartes:**
- Ordenar por quantidade de processos em comum
- Exibir nome + tipo de entidade (PF/PJ) + polo + quantidade
- CPF de terceiros: exibir apenas para as 10 mais relevantes, com justificativa

### FASE 6 — OSINT

**Fontes obrigatórias:**

| Fonte | Objetivo | Ferramenta |
|---|---|---|
| Wikipedia | Biografia, cargos, polêmicas documentadas | `fetch_url` |
| Google Scholar / Lattes | Produção acadêmica, vínculos institucionais | `search_vertical(academic)` |
| LinkedIn | Histórico profissional autodeclarado | `fetch_url` |
| Wayback Machine | Versões anteriores de sites e declarações | `fetch_url(web.archive.org)` |
| Google Dorks | Documentos públicos específicos (site:*.gov.br filetype:pdf alvo) | `search_web` |
| Imprensa | Cobertura jornalística verificada (G1, Folha, UOL, Metrópoles, Poder360) | `search_web` |
| INPI | Marcas registradas | Direct Data ou `https://busca.inpi.gov.br` |
| TSE | Histórico eleitoral, prestações de contas | `https://divulgacandcontas.tse.jus.br` |

**Sherlock / username OSINT:** verificar presença em redes com username derivado do nome.

**Google Dorks recomendados:**
```
site:tjdft.jus.br OR site:stj.jus.br "[Nome do Alvo]"
site:pgfn.fazenda.gov.br "[CPF/CNPJ]"
filetype:pdf site:*.gov.br "[Razão Social]" licitação
"[Nome Alvo]" operação OR investigação OR denúncia
```

### FASE 7 — Contraditório 3-Partes + Revisão de Falsos Positivos

**Template de contraditório (obrigatório para MÉDIA, ALTA, CRÍTICA):**

```
PARTE 1 — Decisão judicial conhecida:
[Citar número do processo, tribunal, data, dispositivo]

PARTE 2 — Manifestação pública do alvo/defesa:
[Citar declaração pública com fonte e data; se inexistente: "Não localizada manifestação pública sobre este fato."]

PARTE 3 — Direito de resposta institucional:
O alvo pode contestar este finding em: transparenciabr.org/due-diligence/[slug]/contestacao
```

**Revisão de falsos positivos (agent_falso_positivo_check):**
- Homônimos: verificar CPF + DOB + naturalidade antes de vincular processo
- Ex-sócios: verificar se saída do QSA precede o fato investigado
- Protestos: verificar se foram quitados ou cancelados
- Ações arquivadas: reclassificar para INFORMATIVO com nota de encerramento

**Flag F-XX (falso positivo confirmado):** rebaixar finding para INFORMATIVO + documentar decisão editorial.

### FASE 8 — Compilação findings.json

**Schema obrigatório:** ver `references/findings-template.json`

**Sweet spot de qualidade:**
- 30–50 findings por relatório padrão
- 4 severidades: CRÍTICA · ALTA · MÉDIA · INFORMATIVO
- Distribuição recomendada: 15–25% CRÍTICA+ALTA / 30–40% MÉDIA / 25–35% INFORMATIVO
- 100% dos findings com URL primária (campo `fontes`)
- Findings de falso positivo documentados como INFORMATIVO com tag `falso_positivo: true`

**Classificações de finding:**
- `AÇÃO JUDICIAL ATIVA` — processo com denúncia recebida ou ação em tramitação
- `AÇÃO JUDICIAL ENCERRADA` — processo com decisão transitada em julgado
- `PASSIVO FISCAL` — dívida ativa, protesto, débito tributário
- `REDE SOCIETÁRIA PEP` — vínculo societário com PEP + flag pepMatriz
- `SUCESSÃO PATRIMONIAL` — estrutura de holding familiar + transmissão
- `CONFUSÃO PATRIMONIAL` — e-mail/endereço/telefone compartilhado PF↔PJ
- `OSINT` — informação de fonte aberta qualificada
- `GOVERNANÇA` — lacuna de transparência, incompatibilidade CBO, CNAE atípico
- `ELEITORAL` — doação, financiamento, candidatura, cassação
- `OBSERVAÇÃO` — informativo sem implicação de risco imediato

### FASE 9 — Geração PDF + Audit + Share

```bash
# Comando de geração
python3 scripts/gerar_due_diligence.py \
  --findings findings_<slug>.json \
  --output DueDiligence_<NomeAlvo>_v1-0.pdf \
  --alvo "<Nome Público do Alvo>"

# Audit obrigatório pós-geração
pdftotext DueDiligence_<NomeAlvo>_v1-0.pdf - | grep -iE \
  "BigQuery|vw_[a-z]|fato_emenda|asmodeus|fraudou|desviou|roubou|corrupto" \
  && echo "BLOQUEADO — termos proibidos encontrados" \
  || echo "OK — sem termos proibidos"

# Verificar CPF sem máscara (padrão NNN.NNN.NNN-NN com todos os dígitos visíveis)
pdftotext DueDiligence_<NomeAlvo>_v1-0.pdf - | grep -P "\d{3}\.\d{3}\.\d{3}-\d{2}" \
  && echo "AVISO — CPF sem máscara detectado"

# Share final
share_file(name="due_diligence_<slug>")
```

---

## 4. BUREAU SUITE COMPLETA

Ver tabela detalhada em `references/bureaus-pricing.md`.

**Resumo de hierarquia de bureaus:**

| Bureau | Força principal | Custo/consulta | Quando usar |
|---|---|---|---|
| **Direct Data** | QSA, BenefFinal, Processos, Imóveis | R$ 0,80–15,00 | Core obrigatório |
| **Serasa Experian** | Score PJ, protestos, CCF | R$ 15–80 | Risco de crédito PJ |
| **Quod** | Score PJ alternativo, open finance | R$ 10–60 | Quando Serasa não disponível |
| **Boa Vista SCPC** | Score PF, pendências varejo | R$ 8–40 | Risco de crédito PF |
| **ClearSale** | Prevenção fraude, identidade | R$ 3–20 | KYC digital |
| **IDwall** | Validação biométrica, documentos | R$ 5–25 | Onboarding regulatório |

---

## 5. PADRÃO VISUAL (herdado do v1.0)

```python
# Design tokens obrigatórios
TEAL       = '#01696F'   # Cabeçalho, links, destaques
TEAL_DARK  = '#0C4E54'   # Header finding, hover
TEAL_LIGHT = '#E6F1F1'   # Background cards KPI
BG         = '#F7F6F2'   # Background página
INK        = '#1A1A1A'   # Texto principal
INK_MUTED  = '#5A5A5A'   # Texto secundário
BORDER     = '#D4D1CA'   # Bordas de tabela

# Severidades
CRITICAL_DARK = '#6B1A4D'   # CRÍTICA — texto
CRITICAL_BG   = '#FFD9E6'   # CRÍTICA — background
ERROR         = '#A12C7B'   # ALTA — texto
ERR_LIGHT     = '#FCEBD9'   # ALTA — background (laranja suave)
WARNING       = '#964219'   # MÉDIA — texto
WARN_LIGHT    = '#FAF6E0'   # MÉDIA — background
SUCCESS       = '#437A22'   # INFO/BAIXA — texto
LOW_BG        = '#E6F2DD'   # INFO/BAIXA — background

# Tipografia
FONT_HEADING = 'DMSans-Bold'    # Títulos, headings
FONT_BODY    = 'Inter'          # Corpo de texto
FONT_SEMI    = 'Inter-SemiBold' # Labels, metadados
```

**Layout A4:**
- Margens: L=1.5cm, R=1.5cm, T=2.0cm, B=1.6cm
- Header: banda TEAL com "TRANSPARÊNCIABR" + subtítulo
- Footer: disclaimer + número de página + URL contestação
- Findings: `KeepTogether` para evitar quebra de card
- ReportLab `BaseDocTemplate` + `PageTemplate` Cover/Body

---

## 6. AGENTES TÉCNICOS (18)

| # | Agente | Responsabilidade |
|---|---|---|
| 1 | `agent_dossier_compiler` | Orchestrador — monta o JSON final e aciona os demais |
| 2 | `agent_normative_compliance` | Verifica LGPD, termos proibidos, mascaramento CPF |
| 3 | `agent_vendor_intelligence` | Coleta de bureau (Direct Data, Serasa, etc.) |
| 4 | `agent_socios_directdata` | QSA Receita Federal + participações + filiais |
| 5 | `agent_rede_societaria_bf` | BeneficiárioFinal multi-grau + flag pepMatriz |
| 6 | `agent_processos_judiciais` | Contencioso por tribunal + polo + evolução temporal |
| 7 | `agent_cbo_perfil_laranja` | Incompatibilidade ocupacional (CBO vs. atividade real) |
| 8 | `agent_judicial_monitor` | Monitoramento de novas decisões (Maré Alta, etc.) |
| 9 | `agent_osint_deepweb` | Wikipedia, Lattes, LinkedIn, Wayback, Google Dorks |
| 10 | `agent_lgpd_compliance` | Classificação Classe A/B/C + audit pré-publicação |
| 11 | `agent_behavioral_correlate` | Correlação eventos-processos (pico TRT vs. demissões RAIS) |
| 12 | `agent_falso_positivo_check` | Revisão de homônimos, datas, situações encerradas |
| 13 | `agent_contraditorio_publico` | Template 3-partes + busca de manifestações públicas |
| 14 | `agent_fonte_primaria_normalizer` | Normalização de URLs + verificação de acesso |
| 15 | `agent_decisao_judicial_monitor` | Extração de número CNJ + status de tramitação |
| 16 | `agent_sucessao_patrimonial` | Holding familiar + transmissão intergeracional (modelo AKP) |
| 17 | `agent_passivo_fiscal` | PGFN + Cenprot + FGTS + PMSP — totalização |
| 18 | `agent_pep_matriz_detector` | Flag PEP na rede societária + escalonamento de risco |

---

## 7. OUTPUT PADRÃO

| Parâmetro | Especificação |
|---|---|
| Páginas | 25–40 páginas |
| Findings | 30–50 findings |
| Tamanho do arquivo | ~140–180 KB |
| Nome do arquivo | `DueDiligence_<NomeAlvo>_v1-0.pdf` |
| Share file | `share_file(name="due_diligence_<slug>")` |
| Formato | PDF A4, ReportLab, fontes DM Sans + Inter embutidas |

---

## 8. ESTRUTURA DO PDF (10 seções)

```
1. CAPA
   ├── Banda TEAL com "TRANSPARÊNCIABR"
   ├── Título: "Due Diligence Empresarial/PEP"
   ├── Nome do alvo + qualificação
   ├── Grid KPIs (8 métricas: findings, severidades, passivo, entidades, score)
   ├── Lista dos 18 agentes técnicos
   └── Rodapé TEAL: data de emissão + transparenciabr.org

2. SUMÁRIO EXECUTIVO (2–3 páginas)
   ├── Parágrafo introdutório (quem é, o que foi investigado, resultado principal)
   ├── Grid KPI mini (4 cards: findings, CRÍTICA, ALTA, score)
   ├── Natureza do documento (disclaimer de não-denúncia)
   └── Hierarquia de riscos resumida

3. IDENTIFICAÇÃO DO ALVO
   └── Tabela: nome, CPF mascarado, DOB, profissão, cargo atual/anterior,
       empresa principal, endereço comercial, contatos profissionais,
       classificação PEP, base legal LGPD

4. METODOLOGIA E FONTES
   ├── Descrição dos 18 agentes
   ├── Lista de fontes primárias consultadas (com URLs)
   ├── Tabela "Bases Pesquisadas" (fonte + resultados, inclusive zeros)
   └── Disclaimer normativo LGPD

5. MATRIZ ANALÍTICA · FINDINGS
   └── Cards de finding: ID · Título · Severidade · Classificação ·
       FATO · ANÁLISE · CONTRADITÓRIO · FONTES PRIMÁRIAS

6. SÍNTESE ANALÍTICA (3–4 eixos)
   ├── Eixo 1: Ações judiciais ativas e contencioso
   ├── Eixo 2: Rede societária PEP e sucessão patrimonial
   ├── Eixo 3: Passivo fiscal e governança
   └── Eixo 4 (opcional): OSINT e reputação pública

7. RECOMENDAÇÕES DE MONITORAMENTO
   └── 5–8 ações específicas com periodicidade recomendada

8. BLOCO DE CONTRADITÓRIO CONSOLIDADO
   ├── Manifestações públicas recebidas (se houver)
   ├── Canal de contestação formal
   └── Prazo de incorporação de resposta

9. AGRADECIMENTOS E CANAL DE CONTESTAÇÃO
   ├── Missão TransparênciaBR
   ├── URL contestação: transparenciabr.org/due-diligence/[slug]/contestacao
   └── Nota LGPD consolidada

10. ANEXO · GARANTIAS + GLOSSÁRIO TÉCNICO
    ├── 6 garantias: natureza informativa, direito de resposta, presunção de
    │   inocência, equilíbrio analítico, conformidade LGPD, atualização contínua
    └── Glossário: AURORA 360, Direct Data, pepMatriz, PEP, Cenprot, PGFN,
        Beneficiário Final, CNAE, QSA, OSINT, Score AURORA, etc.
```

---

## 9. COMPLIANCE PRÉ-PUBLICAÇÃO (12 itens)

```bash
# CHECKLIST OBRIGATÓRIO antes de share_file()

# 1. Sem termos proibidos
pdftotext $PDF - | grep -iE "BigQuery|vw_[a-z]|fato_emenda|asmodeus|fraudou|desviou|roubou|corrupto"

# 2. CPF mascarado
pdftotext $PDF - | grep -P "^\d{3}\.\d{3}\.\d{3}-\d{2}$"

# 3. Páginas dentro do limite (25-40)
pdfinfo $PDF | grep "Pages:"

# 4. Tamanho do arquivo (< 200 KB padrão)
ls -lh $PDF

# 5. Fontes embutidas
pdfinfo $PDF | grep -i "font"

# 6. Nenhum finding sem URL primária
python3 -c "import json; d=json.load(open('findings.json')); \
  sem_url=[f['id'] for f in d['findings'] if not f.get('fontes')]; \
  print('Sem URL:', sem_url or 'Nenhum')"

# 7. Contraditório 3-partes presente em MÉDIA/ALTA/CRÍTICA
python3 -c "import json; d=json.load(open('findings.json')); \
  sem_contra=[f['id'] for f in d['findings'] \
    if f['severidade'] in ['MÉDIA','ALTA','CRÍTICA'] \
    and (not f.get('contraditorio') or f['contraditorio'].strip()=='—')]; \
  print('Sem contraditório:', sem_contra or 'Nenhum')"

# 8. Score AURORA presente e válido
python3 -c "import json; d=json.load(open('findings.json')); \
  print('Score:', d['kpis'].get('score_aurora_nivel','AUSENTE'))"

# 9. Data de emissão no PDF
pdftotext $PDF - | grep -E "Emitido em|Emissão:"

# 10. URL de contestação presente
pdftotext $PDF - | grep "contestacao"

# 11. Aviso LGPD presente
pdftotext $PDF - | grep -i "lgpd\|lei 13.709"

# 12. Disclaimer de não-denúncia presente
pdftotext $PDF - | grep -i "não constitui denúncia"

echo "=== AUDIT CONCLUÍDO ==="
```

---

## 10. CASOS DE REFERÊNCIA

### 🥇 Dossiê Paulo Octávio Alves Pereira v1.0 (mai/2026) — Caso Pioneer

- **Arquivo:** `/home/user/workspace/paulo_octavio/Dossie_Paulo_Octavio_v1-0.pdf`
- **Páginas:** 30 · **Findings:** 45 (10 CRÍTICA, 14 ALTA, 13 MÉDIA, 8 INFO)
- **Score AURORA:** ELEVADO
- **Passivo mapeado:** R$ 11,00 mi (PGFN + protestos)
- **Entidades-grupo:** 26 CNPJs mapeados
- **Destaque metodológico:** Estrutura AKP (holding familiar JK), flag pepMatriz=true, 1.704 processos
- **Gerador:** `/home/user/workspace/paulo_octavio/gerar_dossie_paulo_octavio.py`
- **Findings JSON:** `/home/user/workspace/paulo_octavio/findings_paulo_octavio.json`

### 📎 POC-SCAN (LOBO MAU) — Referência de Mercado

- **Formato:** Direct Data white-label + NotebookLM (narrativa)
- **Páginas:** 503 · **Entidades:** 3 (PF + PJ + filho)
- **Custo estimado bureau:** R$ 262,50 · **Valor de mercado:** R$ 1.500–5.000
- **Cobertura:** 45 bases, 1.704 processos, 1.511 matrículas imóveis
- **Análise completa:** `references/poc-scan-bench.md`

---

## 11. SKILLS RELACIONADAS (hierarquia obrigatória)

```
transparenciabr-lei          ← SEMPRE carregar antes (autoridade superior)
├── due-diligence-pro        ← ESTA SKILL (PEP-empresarial)
├── dossie-forense-parlamentar ← Irmã (parlamentares ativos)
└── aurora-forensic-ops      ← Operação do pipeline
```

**Sequência de carregamento obrigatória:**
```
load_skill("transparenciabr-lei")
load_skill("due-diligence-pro")
# Opcional: load_skill("aurora-forensic-ops") para pipelines automatizados
```

---

## 12. CHANGELOG

### v1.1 (27/mai/2026) — EVISCERADOR Patch

**Caso pioneer:** Dossiê Paulo Octávio v2.0 EVISCERADOR — 46 páginas · 81 findings (10 CRÍTICA · 23 ALTA · 28 MÉDIA · 20 INFO).

#### 1.1.1 — Direct Data API v3: produtos válidos vs 404

Após teste em produção (R$ 109 de saldo Direct Data), mapeamento canônico de endpoints `https://apiv3.directd.com.br/api/`:

| Endpoint | Status v3 | Observação |
|---|---|---|
| `ReceitaFederalPessoaJuridica` | ✅ OK | Retorna JSON com `metaDados.consultaUid` |
| `ProcessosJudiciaisSimplificada` | ✅ OK | Top fonte para contencioso por CNPJ/CPF |
| `BeneficiarioFinal` | ✅ OK · OURO | Traz sociedades multi-grau, `pepMatriz=true`, histórico de cargos com `data_inicio`/`data_fim` |
| `QuadroSocietarioReceitaFederal` | ❌ 404 v3 | Nome legado — INVESTIGAR endpoint correto antes de usar |
| `PGFNListaDevedores` | ❌ 404 v3 | Nome legado — buscar substituto na documentação v3 |
| `ProtestosCenprot` / `Cenprot` | ❌ 404 v3 | Nome legado — buscar substituto |

**Regra:** sempre validar endpoint com requisição-piloto antes de orquestrar em lote. Se 404, registrar gap e seguir com fontes alternativas — nunca inventar dados.

#### 1.1.2 — Pivot Direct Data via sandbox (anti-worker-bug)

No EVISCERADOR, o worker da VM `aurora-cacador-br` apresentou bug crítico: try/except sem log engolindo exceção do `r.json()` quando produto retornava 404, gravando arquivos de 0 bytes. Em 100 consultas do EIXO1_REDO, 100 arquivos vazios — summary indicava `erro=100` mas Direct Data estava operacional.

**Pivot validado:** rodar Direct Data direto do sandbox via `curl`. Para 8–30 CNPJs/CPFs, é mais rápido que VM (~1s/query, sem cold-start de container). Caso EVISCERADOR: 24 consultas (8 RF + 8 Processos + 8 BF) em 8 segundos.

```bash
TOKEN="<token-direct-data>"
for cnpj in $(cat cnpjs.txt); do
  for produto in ReceitaFederalPessoaJuridica ProcessosJudiciaisSimplificada BeneficiarioFinal; do
    curl -sS "https://apiv3.directd.com.br/api/${produto}?CNPJ=${cnpj}&TOKEN=${TOKEN}" \
      -o "dd_local/${produto}_${cnpj}.json"
    # Validação anti-bug: arquivo vazio = falha
    [ -s "dd_local/${produto}_${cnpj}.json" ] || echo "FALHA: ${produto}_${cnpj}"
  done
done
```

**Regra inegociável:** após qualquer coleta em lote, verificar tamanho dos arquivos (`find -size 0`) e re-tentar os vazios antes de seguir para parsing.

#### 1.1.3 — Beneficiário Final é OURO

O endpoint `BeneficiarioFinal` da Direct Data v3 entrega o material mais denso por consulta:

- Sociedades multi-grau com `data_inicio` e `data_fim` por participação
- Flag `pepMatriz=true/false` por nó da rede
- Capital social e situação cadastral consolidados
- Histórico de cargos do sócio em todas as PJs da rede

**Use-case canônico:** para mapear sucessão patrimonial (herdeiros entrando como sócios em datas próximas) e blindagem (holdings com pepMatriz=true).

#### 1.1.4 — Sweet spot ampliado para dossiês EVISCERADOR

Quando o Comandante pede "o mais completo possível" sobre alvo de alto perfil (ex-governador + holding de R$500M+ capital + 8 CNPJs no grupo + sucessão multi-geracional):

| Parâmetro | v1.0 standard | v1.1 EVISCERADOR |
|---|---|---|
| Findings | 30–50 | 70–100 |
| Páginas | 25–40 | 40–60 |
| Tamanho | 140–180 KB | 180–220 KB |
| Processos judiciais ativos individualizados | top-10 | top-15 + tabela de evolução temporal |
| Empresas do grupo com QSA+BF | 5–10 | 8+ (todas com BF, todas com Processos) |

#### 1.1.5 — Tipos de finding canonizados no EVISCERADOR

- `AÇÃO JUDICIAL ATIVA INDIVIDUALIZADA` — finding por processo (não agregado), com número CNJ, valor, polo, última movimentação
- `CONCENTRAÇÃO DE CONTENCIOSO` — vínculo recorrente (ex: 5 processos Rádio Principal vs IGESDF) com hipótese contextualizada
- `CONFUSÃO PATRIMONIAL ENTRE EMPRESAS DO GRUPO` — processo onde uma PJ do grupo é contraparte de outra (ex: TRF1 0028232-17.2015)
- `SUCESSÃO PATRIMONIAL INTERGERACIONAL` — entrada de herdeiros em holdings em datas próximas, com `data_inicio` documentada via BF
- `PEP-MATRIZ AGREGADO` — finding-síntese cobrindo todas as PJs com `pepMatriz=true`
- `CAPITAL SOCIAL AGREGADO E CONCENTRAÇÃO` — soma de capitais social do grupo + % concentrado em holding-mãe

#### 1.1.6 — Pattern: try/except VM com log obrigatório

Em scripts de worker (VM ou Cloud Run), proibido `try/except: pass`. Padrão obrigatório:

```python
try:
    data = r.json()
except Exception as e:
    with open(f"errors/{produto}_{key}.err", "w") as f:
        f.write(f"{type(e).__name__}: {e}\nHTTP {r.status_code}\n{r.text[:500]}")
    continue  # não gravar arquivo de output vazio
```

#### 1.1.7 — Lessons learned operacionais

- VM L4 em stockout? Não esperar — sandbox basta para até ~30 alvos com Direct Data
- Atualizar `runbook_l4_paulo_octavio.sh` e `executar_na_vm_paulo_octavio.sh` com check de arquivos vazios pós-execução
- Token Direct Data exposto em ambiente compartilhado: revogar via painel + rotacionar após cada caso de alto perfil

---

### v1.0 (mai/2026)
- Lançamento inicial da skill `due-diligence-pro`
- Consolidação do pipeline POC-SCAN + padrões TransparênciaBR v1.0
- Caso pioneer: Dossiê Paulo Octávio Alves Pereira (30p · 45 findings)
- 9 fases de pipeline documentadas
- Bureau Suite com 6 bureaus e tabela de custo/cobertura
- 18 agentes técnicos especializados
- 12 itens de compliance pré-publicação
- Referências: `poc-scan-bench.md`, `bureaus-pricing.md`, `fontes-primarias.md`, `findings-template.json`
- Script generalizável: `scripts/gerar_due_diligence.py`
