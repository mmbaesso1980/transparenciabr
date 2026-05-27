---
name: dossie-forense-parlamentar
description: >-
  Compila dossiês forenses profissionais sobre parlamentares brasileiros (deputados estaduais, federais, senadores, vereadores) no padrão TransparênciaBR 1.0. Use quando o Comandante OPERADOR pedir dossiê, dossiê matador, relatório forense, análise parlamentar, ou compilação sobre político brasileiro. Versão 1.0 (release stable) consolida aprendizados da auditoria externa do caso Erika Hilton — contraditório judicial 3-partes, fontes primárias (NUNCA expor BigQuery interno), reclassificação de falsos positivos pós-investigação, e 4 novos tipos de finding (locação veículo, TF nominal, BO ameaças, decisão liminar). Mantém Eixo 5 (empresas exclusivas + cruzamento sócios), Direct Data (QSA, BF, CadastroPF Plus, Processos), catálogo BQ interno, 16-20 agentes. Gera PDF tom INFORMATIVO, com 40-55 findings classificados por severidade. Visual teal #01696F + DM Sans/Inter, ReportLab.
---

# Dossiê Forense Parlamentar — Padrão TransparênciaBR 1.0

> **Versão 1.0 (release stable, mai/2026)** — consolidada após auditoria externa do dossiê Erika Hilton v3.5.1. Sucessora direta da v3.5. Novidades centrais: contraditório judicial 3-partes, fontes primárias em vez de views BigQuery, reclassificação documentada de falsos positivos, 4 novos tipos de finding.

## Quando Usar

Use quando o Comandante OPERADOR pedir:
- "Dossiê matador" / "dossiê forense" / "relatório forense" sobre um parlamentar brasileiro
- "Compile fatos sobre [político]"
- "Análise parlamentar de [nome]"
- "Cruzamento de emendas + IDH + saneamento" de um parlamentar específico
- Complemento profissional a relatório de parceiro de negócios
- Análise de empresas-exclusivas + vínculo pessoal de sócios + processos judiciais ativos
- Atualização / melhoria de dossiê existente após auditoria externa

## Princípios Inegociáveis (verbatim do Comandante)

1. **"Não fazemos denúncia — apresentamos fatos."** — Tom INFORMATIVO, nunca acusatório direto.
2. **"Toda nota é suspeita até prova contrária"** — mas sem imputar dolo. Apresentar dados, deixar leitor concluir.
3. **"Apenas dados verdadeiros, sem mock, sem fake, não podemos ser criminosos"** — todo finding tem URL primária verificável; estimativas e indícios marcados.
4. **"Acuse quem quer"** — texto descritivo. Verbos: "registra", "consta", "observa-se", "merece monitoramento". Nunca "Abimael cometeu", "Fulano fraudou".
5. **Compliance legal absoluto** — nada que possa gerar processo. Direito de resposta sempre garantido.
6. **Sem nomes de demônios** — Ars Goetia ABOLIDO. Agentes técnicos com nomes neutros (ver lista abaixo).
7. **"Empresas criadas só pra atender o parlamentar, cruzar sócios com vínculo pessoal"** — Eixo 5 obrigatório quando aplicável.
8. **"Quanto mais findings reais e auditáveis, melhor"** — sweet spot ampliado para 40-55 findings em dossiês de alto perfil.
9. **🆕 1.0 — Contraditório público obrigatório**: se a parlamentar já se manifestou (entrevista, post, decisão judicial), CITAR no campo `contraditorio` do finding correspondente. Buscar ativamente antes de fechar o dossiê.
10. **🆕 1.0 — Fontes primárias no produto final**: PROIBIDO citar "BigQuery", "vw_score_risco_completo", ou nomes internos de views no PDF. Citar SEMPRE a fonte de origem (Portal Câmara CEAP via API Dados Abertos, BrasilAPI, TRF1 PJe, STF, etc.). BigQuery é infraestrutura, não fonte.
11. **🆕 1.0 — Revisão de falsos positivos pré-publicação**: qualquer finding ≥ ALTA deve ter checagem ativa de explicação benigna (Google Scholar, LinkedIn, Lattes, Wayback). Reclassificar transparentemente quando encontrar evidência (modelo F-13 Erika).

## Pipeline em 10 Fases (1.0)

### Fase 1 · Identificação do Alvo
Coletar:
- Nome completo (TSE/cartório eleitoral), nome público, CPF, DOB, naturalidade
- Cargo, mandato, matrícula da casa legislativa, partido
- Gabinete, telefone, e-mail institucional
- Votação (TSE DivulgaCandContas), tipo de eleição (QP/QE)
- Slogans, marca pessoal, perfis sociais (Instagram, Threads, TikTok, YouTube, Linktree)

Fontes obrigatórias:
- TSE · DivulgaCandContas (`https://divulgacandcontas.tse.jus.br/divulga/`)
- Perfil oficial da casa (ALEPE: `https://www.alepe.pe.gov.br/parlamentar/<slug>/`)
- Câmara Federal: `https://dadosabertos.camara.leg.br/api/v2/deputados/<id>`

### Fase 2 · Emendas Parlamentares (CSVs OFICIAIS)
Para deputados estaduais de PE:
```bash
pplx content fetch "https://dados.pe.gov.br/api/3/action/package_list" --no-cache
pplx content fetch "https://dados.pe.gov.br/api/3/action/package_show?id=emendasparlamentaresestaduais"
curl -sL "<resource_url>" -o emendas_<ano>.csv
```

Para deputados federais:
- Portal da Transparência: `https://portaldatransparencia.gov.br/emendas/consulta?autorEmenda=<id>`
- Dataset interno: pagamentos consolidados de emendas (Portal Transparência ingestão diária) — citar como **"Portal da Transparência · Emendas Parlamentares (autorEmenda=<id>)"** no PDF, NUNCA como `fato_emenda_pagamento`.

**ALERTA**: rubrica "Encargos Especiais" é genérica → marcar para análise.

### Fase 3 · Cruzamento Socioeconômico
Para cada município beneficiário:
- IDHM (PNUD/IBGE 2010, atualização 2022)
- Saneamento: `https://infosanbas.org.br/municipio/<uf>/<municipio>/`
- Esgoto/água: `https://www.aguaesaneamento.org.br/municipios-e-saneamento/<uf>/<municipio>`
- Saúde: DATASUS (CNES, mortalidade infantil, leitos/1000)
- Plano Municipal de Saneamento Básico (presença/ausência)

Cruzar com base eleitoral declarada (top municípios em votação TSE).

### Fase 4 · Atividade Legislativa
- UNALE (estaduais): `https://bancodeleis.unale.org.br/spl2/consulta-producao.aspx?autor=<id>`
- Câmara dos Deputados: `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=<id>`
- Frentes parlamentares: `https://dadosabertos.camara.leg.br/api/v2/deputados/<id>/frentes`
- Votações: `https://dadosabertos.camara.leg.br/api/v2/deputados/<id>/votacoes`
- Volume estatisticamente NORMAL para estaduais: 40-80 PLs/mandato
- Capturar: liderança de bancada, presidências de comissão, pronunciamentos relevantes (YouTube oficial)
- Episódios de tensão institucional (repúdios, moções de outras casas)

### Fase 4.5 · Empresas Exclusivas + Cruzamento Sócios

Para parlamentares com base CEAP (federais) ou base de emendas auditável:

**Step 1 — Isolar CNPJs exclusivos do alvo** (uso interno BigQuery, citar como Portal Câmara CEAP no PDF):
```sql
SELECT cnpj_cpf_fornecedor, COUNT(*) as notas, SUM(valor_liquido) as total
FROM `transparenciabr.transparenciabr.ceap_despesas_ext`
WHERE nu_deputado_id = '<id>'
  AND cnpj_cpf_fornecedor NOT IN (
    SELECT DISTINCT cnpj_cpf_fornecedor
    FROM `transparenciabr.transparenciabr.ceap_despesas_ext`
    WHERE nu_deputado_id != '<id>'
  )
GROUP BY 1
HAVING total > 3000
ORDER BY total DESC;
```

**Step 2 — Enriquecer CNPJs via BrasilAPI:**
```bash
for cnpj in $(cat cnpjs_exclusivos.txt); do
  curl -s "https://brasilapi.com.br/api/cnpj/v1/${cnpj}" > "cnpj_${cnpj}.json"
  sleep 1
done
```

**Step 3 — Cruzar sócios com vínculo pessoal do parlamentar:**

Padrões forenses a buscar:
- **Empresa-clone**: mesmo sócio, nome semelhante (ex: MAPI/MAPINGUARI, TOBIAS/SAIBOT)
- **Anagrama**: nome da empresa é anagrama do nome do sócio ou do parlamentar
- **Email corporativo**: domínio ou local-part do email da empresa contém variação do nome do sócio
- **Data de fundação pré-eleição**: empresas criadas 0-12 meses antes do mandato
- **Fundação sequencial**: várias empresas do mesmo sócio criadas em datas próximas
- **Encerramento coordenado**: múltiplas empresas encerradas na mesma data (especialmente pós-eleitoral)
- **Valor idêntico em múltiplas empresas exclusivas**: precificação coordenada

**Step 4 — Direct Data: QSA + Beneficiário Final + Processos:**
Ver Fase 5.6 abaixo.

### Fase 5 · Compliance Fiscal e Judicial
- PGFN: `https://www.listadevedores.pgfn.gov.br/`
- TCE-<UF> · julgamentos do exercício parlamentar
- Escavador/Jusbrasil · contagem de processos por CPF
- TSE · contas eleitorais aprovadas/desaprovadas
- TRF1 PJe: `https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam`
- STF: `https://portal.stf.jus.br/processos/listarProcessos.asp`

### Fase 5.5 · BigQuery Views Catalog (USO INTERNO — NÃO CITAR NO PDF)

> ⚠️ **REGRA 1.0**: Views BigQuery são INFRAESTRUTURA interna do TransparênciaBR. NUNCA citar `transparenciabr.transparenciabr.vw_*` no produto final. Citar SEMPRE a fonte de origem dos dados.

Mapeamento view → fonte primária para citação:

| View interna (uso BQ) | Fonte primária a citar no PDF |
|---|---|
| `vw_score_risco_completo` | "Score AURORA · TransparênciaBR (motor proprietário)" |
| `vw_fornecedor_multi_parlamentar` | "Portal da Câmara · CEAP consolidada via API Dados Abertos" |
| `vw_benford_ceap_audit` | "Análise estatística (Lei de Benford) sobre Portal Câmara CEAP" |
| `vw_ceap_zscore_roll` | "Portal da Câmara · CEAP (nuDeputadoId=X) + análise Z-score" |
| `vw_empresa_eventos_multi_parlamentar` | "Receita Federal (CNPJ) + BrasilAPI + Portal Câmara CEAP" |
| `vw_circuito_ceap_emenda` | "Portal Câmara CEAP + Portal da Transparência Emendas" |
| `vw_universo_pessoal_emendas` | "Portal da Transparência · Emendas Parlamentares (CPF beneficiário)" |
| `ceap_classificacoes_vertex` | "Classificação Vertex AI sobre Portal Câmara CEAP" |
| `narrativas_risco_vertex` | "Síntese analítica TransparênciaBR (Vertex AI)" |
| `tb_dossie_aurora_360` | "Snapshot consolidado TransparênciaBR" |
| `fato_emenda_pagamento` | "Portal da Transparência · Emendas Parlamentares" |

Query padrão de entrada (uso interno):
```sql
SELECT * FROM `transparenciabr.transparenciabr.vw_score_risco_completo`
WHERE nu_deputado_id = '<id>' OR id_camara = '<id_camara>';
```

### Fase 5.6 · Direct Data — QSA + BeneficiárioFinal + CadastroPF Plus + Processos

**Token Direct Data do Comandante:** `__SECRET_FROM_GCP_SECRET_MANAGER__`

**Endpoints base:** `https://apiv3.directd.com.br/api/`

| Endpoint | Use case | Parâmetros |
|---|---|---|
| `ReceitaFederalPessoaJuridica` | QSA completo + situação cadastral oficial | `CNPJ=...&TOKEN=...` |
| `BeneficiarioFinal` | Rede societária até 10 graus + pepMatriz flag | `CPF=...` ou `CNPJ=...` |
| `CadastroPessoaFisicaPlus` | Nome, mãe, DOB, CBO, classe social, renda estimada | `CPF=...` |
| `ProcessosJudiciaisSimplificada` | Processos ativos + arquivados + partes + valor | `CPF=...` ou `CNPJ=...` |
| `Similarity` | Match fuzzy de nomes (homonímia) | `nome=...` |
| `RegistrationDataBrazil` | Dados cadastrais consolidados | `CPF=...` ou `CNPJ=...` |

Template:
```bash
curl -s "https://apiv3.directd.com.br/api/ReceitaFederalPessoaJuridica?CNPJ=${cnpj}&TOKEN=__SECRET_FROM_GCP_SECRET_MANAGER__" > "qsa_${cnpj}.json"
```

**LGPD na Direct Data (CRÍTICO):**
- Classe B (PEP/agentes públicos): mascarar `***.XXX.XXX-**` no dossiê
- Classe C (civis privados): **bloquear no dossiê** — citar apenas existência com base legal
- Renda estimada, endereço residencial, telefone particular → **Classe C, sempre bloqueado**

**Citação no PDF**: "Receita Federal · CNPJ (via Direct Data)" — nunca "API Direct Data interna".

**Padrões forenses descobertos no caso Erika (replicáveis):**
1. Empresa criada pré-eleição + capital baixo + cliente único = bandeira vermelha
2. Múltiplas empresas mesmo CNAE + valores idênticos + mesmo cliente = circuito
3. Sócio com nome semelhante a parlamentar = vínculo investigável (Similarity API)
4. CBO sócio incompatível com atividade declarada = padrão laranja
5. Empresa-clone (mesmo nome variante, mesmo sócio) = controle multi-CNPJ
6. Encerramento societário em datas idênticas = reestruturação coordenada
7. `pepMatriz=true` em rede societária = sinal Direct Data
8. R$ idênticos múltiplas empresas exclusivas = precificação coordenada (Z>3 trivial)

### Fase 6 · OSINT (Open Source Intelligence)
- Sherlock CLI: `sherlock <username>` → 9-12 perfis típicos
- Wayback Machine: `https://web.archive.org/web/*/<url>`
- Linktree/Beacons: extrair canais ativos
- Google Dorks: `site:<dominio> "<nome>"`, `"<CPF>" filetype:pdf`
- Casa dos Dados / consultacnpj.com / consultasocio.com

### 🆕 Fase 6.5 · Contraditório Público + Revisão de Falsos Positivos (1.0)

**OBRIGATÓRIO antes de fechar o dossiê.** Esta fase nasceu da auditoria externa do caso Erika.

**Step 1 — Coletar contraditório público da parlamentar:**
Para cada finding ≥ MÉDIA, buscar:
- Manifestação em entrevista (CNN, Folha, UOL, G1, redes locais)
- Post da própria parlamentar (Instagram, X, Threads — citar URL do post)
- Decisão judicial que reconheça/negue lesão ao erário
- Manifestação de assessoria de imprensa
- Resposta em processo administrativo (TCU, MP)

Queries padrão:
```
site:cnnbrasil.com.br "<nome parlamentar>" "<tema do finding>"
site:folha.uol.com.br "<nome parlamentar>" defesa
"<nome parlamentar>" "se manifesta" OR "rebate" OR "esclarece"
```

**Step 2 — Buscar evidência benigna para findings ≥ ALTA (falsos positivos):**
Antes de classificar uma pessoa como "laranja" ou empresa como "fantasma":
- Google Scholar: nome + sobrenome → pesquisador acadêmico?
- LinkedIn: histórico profissional consistente com CNAE?
- Lattes CNPq: vínculo de pesquisa?
- Wayback Machine: empresa tem site com história?
- Casa dos Dados: histórico societário longo (>5 anos)?

**Modelo Erika F-13**: Talita Anzei Gonsales + Julise Ribeiro foram inicialmente classificadas como CRÍTICA (fraude estrutural). Google Scholar revelou que ambas são pesquisadoras UFABC com 49 citações, h-index 3, co-autoras de Raquel Rolnik (USP) em Cadernos Metrópole e Environment & Urbanization Sage. **Reclassificadas para INFORMATIVO** com seguinte texto:

> "Análise inicial classificou este finding como CRÍTICA por hipótese de fraude estrutural. Revisão pós-investigação documentou vínculo acadêmico legítimo via Google Scholar (verified email ufabc.edu.br). Mantida como INFORMATIVO em respeito ao princípio de contraditório e revisão honesta. Esta reclassificação exemplifica o compromisso editorial deste documento com a revisão de falsos positivos antes da publicação."

**Step 3 — Aplicar template de contraditório 3-partes em todo finding ≥ MÉDIA:**

```
PARTE 1 — Decisão judicial conhecida (se houver):
"Em <data>, <juízo>, no processo <número>, decidiu que <citação literal de trecho relevante>. Fonte: [URL TRF/STF/PJe]."

PARTE 2 — Manifestação pública da parlamentar:
"A parlamentar se manifestou publicamente em [<URL entrevista/post>] declarando que <citação>. Em <data> publicou em <rede> que <texto>."

PARTE 3 — Direito de resposta institucional:
"A parlamentar foi convidada formalmente a apresentar contraditório direto via canal institucional em transparenciabr.org/dossie/<slug>/contestacao. Eventual manifestação será incorporada em versões posteriores deste documento."
```

Quando uma das 3 partes não existir, escrever explicitamente: "Não foi localizada manifestação pública específica sobre este finding até a data de publicação."

### Fase 7 · Compilação dos Findings
Estrutura JSON (`findings.json`):
```json
{
  "alvo": { ... dados identificação ... },
  "kpis": {
    "versao": "1.0",
    "findings_total": 54,
    "criticos": 12, "altos": 18, "medios": 14, "informativos": 10,
    "verificados_url_primaria": 54,
    "universo_financeiro_total": 18480392.75,
    "cnpjs_exclusivos": 12,
    "score_aurora_nivel": "MEDIO",
    "agentes_tecnicos_total": 16
  },
  "metodologia": {
    "fontes_primarias": [
      "Portal da Câmara dos Deputados · CEAP via API Dados Abertos",
      "Portal da Transparência · Emendas Parlamentares",
      "Receita Federal · CNPJ (BrasilAPI / Direct Data)",
      "TRF1 PJe · Consulta Pública",
      "TSE · DivulgaCandContas",
      "STF · Portal de Acompanhamento Processual",
      "Google Scholar / Lattes (verificação de vínculo acadêmico)"
    ],
    "agentes_tecnicos": [16 agentes],
    "disclaimer": "Este documento NÃO constitui denúncia ..."
  },
  "findings": [
    {
      "id": "F-01",
      "titulo": "...",
      "classificacao": "AÇÃO JUDICIAL ATIVA | CIRCUITO FINANCEIRO | INCONSISTÊNCIA CADASTRAL | INDÍCIO DOCUMENTAL | PADRÃO LARANJA | REGISTRO JUDICIAL | LACUNA DE TRANSPARÊNCIA | OBSERVAÇÃO RELEVANTE | ESTIMATIVA AGREGADA | OBSERVAÇÃO DE GOVERNANÇA | ANÁLISE TIPOLÓGICA CEAP | ANÁLISE FUNCIONAL DE EMENDAS | INDICADOR DE PRESENÇA INSTITUCIONAL | CLASSIFICAÇÃO FORENSE AUTOMATIZADA | ATIVIDADE LEGISLATIVA DE DESTAQUE | INDICADOR DE PRODUÇÃO LEGISLATIVA | DADO ELEITORAL OFICIAL | INDICADOR DE INSERÇÃO ELEITORAL | INDICADOR REPUTACIONAL EXTERNO | DECISÃO JUDICIAL FAVORÁVEL | TRANSFERÊNCIA NOMINAL | REGISTRO POLICIAL | RECLASSIFICAÇÃO PÓS-INVESTIGAÇÃO",
      "severidade": "CRÍTICA | ALTA | MÉDIA | INFORMATIVO",
      "fato": "Frase descritiva começando com 'O Portal Câmara CEAP registra...', 'Consta no Portal Transparência...', 'Observa-se na Receita Federal...'. NUNCA 'fulano fraudou', 'desviou', 'cometeu'.",
      "analise": "Contextualização técnica. Cruzamentos. Sem imputação.",
      "contraditorio": "Template 3-partes (decisão judicial + manifestação pública + direito de resposta).",
      "fontes": ["URL primária 1", "URL primária 2", "..."]
    }
  ]
}
```

**🆕 1.0 — Novos tipos de finding (canonizados após Erika v3.5.1):**

| Tipo | Descrição | Severidade típica |
|---|---|---|
| **Locação de veículo CEAP** | Notas de aluguel de veículo no Portal Câmara — Z-score, contexto frota oficial | MÉDIA |
| **Transferência nominal de emenda (TF)** | Emenda destinada a entidade específica nomeada, com CNAE/missão verificável | MÉDIA-ALTA |
| **Boletim de Ocorrência policial** | BO registrado pela parlamentar ou contra ela (Polícia Federal/Civil) | INFORMATIVO-MÉDIA |
| **Decisão liminar favorável/desfavorável** | Decisão judicial que aceita ou nega liminar em ação popular/civil pública | ALTA-INFORMATIVO |
| **Reclassificação pós-investigação** | Finding originalmente ≥ ALTA rebaixado após confirmação de explicação legítima (Google Scholar, Lattes, LinkedIn) | INFORMATIVO |

**Sweet spot 1.0:** 40-55 findings. Distribuição saudável:
- 10-15 CRÍTICA (processos judiciais ativos, empresas exclusivas com sócio laranja, circuitos confirmados)
- 15-20 ALTA (Benford severo, outliers Z>3, CBOs incompatíveis, empresas-clone)
- 12-16 MÉDIA (observações relevantes, anomalias estatísticas, TFs nominais, locações veículo)
- 8-12 INFORMATIVO (contexto, identidade, atividade legislativa, decisões favoráveis, reclassificações)

### Fase 8 · Geração do PDF
Use `scripts/gerar_dossie_v35.py` como template (será renomeado para `gerar_dossie.py` em release 1.0; mantemos por retrocompatibilidade).

```bash
python3 scripts/gerar_dossie_v35.py \
  --findings ./findings.json \
  --output ./Dossie_<NomeAlvo>_v1-0.pdf \
  --alvo "<Nome Alvo>"
```

**Header/footer 1.0:** "DOSSIÊ FORENSE · v1.0" no canto inferior direito.

Validar visualmente: ler PDF, conferir cada página, garantir que não há texto cortado/sobreposto, contraste correto, sem widows/orphans nos finding cards (KeepTogether resolve).

### Fase 9 · Audit Final + share_file

**Checklist obrigatório (12 itens — 1.0):**
- [ ] Toda informação tem URL primária verificável
- [ ] Estimativas estão sinalizadas como "ESTIMATIVA"
- [ ] Indícios estão sinalizados como "INDÍCIO"
- [ ] Nenhum verbo acusatório direto — apenas descritivos
- [ ] **🆕 Contraditório 3-partes presente em todos os findings com severidade ≥ MÉDIA**
- [ ] **🆕 Zero ocorrências de "BigQuery", "vw_", "transparenciabr.transparenciabr.*" no texto do PDF**
- [ ] **🆕 Pelo menos 1 finding de "Reclassificação pós-investigação" se houve ≥ 1 falso positivo identificado**
- [ ] Disclaimer normativo em destaque no início
- [ ] Footer "NÃO constitui denúncia" em todas as páginas
- [ ] URL de contestação no rodapé
- [ ] Glossário técnico no anexo
- [ ] LGPD: CPFs mascarados, Classe C bloqueado

Comando de validação textual:
```bash
pdftotext Dossie_<alvo>_v1-0.pdf - | grep -iE "(bigquery|vw_|transparenciabr\.transparenciabr|fraudou|desviou|roubou|corrupto)" && echo "❌ BLOQUEIO" || echo "✅ AUDIT OK"
```

Compartilhar: `share_file(file_path="...", name="dossie_<nome_alvo>")` para versionamento.

### Fase 10 · Pós-Publicação · Monitoramento

- Registrar entrega no projeto Notion / GitHub Issues
- Atualizar `referencias/casos.md` com lessons learned
- Se a parlamentar/assessoria responder por canal de contestação, abrir branch `v1.0.1` para incorporação
- Schedule cron (1.0+): monitorar 30 dias para novas decisões TRF/STF dos processos citados

## Padrão Visual (Erika v3.5.1 base — NÃO ALTERAR sem nova auditoria)
- **Cores**: TEAL `#01696F` (acento), TEAL_DARK `#0C4E54` (header cards), BG `#F7F6F2`, INK `#1A1A1A`
- **Severidade**: CRÍTICA = `#7A1B4A` sobre `#F8D4E2`; ALTA = `#A12C7B` sobre `#FCDFEE`; MÉDIA = `#964219` sobre `#FCEBD9`; INFORMATIVO = `#5A5A5A` sobre `#FAF6E0`
- **Fontes**: DM Sans (heading) + Inter (body). URLs em `references/font-urls.md`
- **Layout**: A4, margens 1,5cm L/R, 2,0cm T, 1,6cm B
- **Capa**: banda teal topo + título + painel KPIs branco + lista de agentes técnicos + banda teal rodapé
- **Header/footer recorrente**: "TRANSPARÊNCIABR · Plataforma Forense de Inteligência Cívica" / "DOSSIÊ FORENSE · v1.0"
- **Footer permanente**: "Este documento NÃO constitui denúncia. Apresenta fatos públicos auditáveis." + página + URL contestação

## 16 Agentes Técnicos (1.0 — sem demônios)
**Núcleo (12 originais):**
1. `agent_dossier_compiler` — orquestrador
2. `agent_normative_compliance` — normas, leis, regimentos
3. `agent_vendor_intelligence` — CNPJs beneficiários
4. `agent_benford_anomaly` — análise estatística de notas
5. `agent_geo_movement` — geolocalização e deslocamentos
6. `agent_fuel_transport` — combustíveis e transporte
7. `agent_food_lodging` — alimentação e hospedagem
8. `agent_media_propaganda` — gastos com mídia
9. `agent_consulting_office` — consultorias e gabinete
10. `agent_telecom_aviation` — telecom e aviação
11. `agent_payroll_kickback` — folha e indícios rachadinha
12. `agent_behavioral_correlate` — correlações comportamentais

**v3.5 (4):**
13. `agent_socios_directdata` — QSA + BeneficiárioFinal + CadastroPF Plus via Direct Data
14. `agent_rede_societaria_bf` — rede societária multi-grau + pepMatriz
15. `agent_processos_judiciais` — ProcessosJudiciaisSimplificada para CPFs e CNPJs do circuito
16. `agent_cbo_perfil_laranja` — detecção de CBO incompatível

**🆕 1.0 (especializados — opt-in):**
17. `agent_contraditorio_publico` — varredura de manifestações públicas da parlamentar (CNN/Folha/UOL/Instagram/X)
18. `agent_falso_positivo_check` — Google Scholar + Lattes + LinkedIn + Wayback para descartar imputação indevida
19. `agent_fonte_primaria_normalizer` — substituição automática de "BigQuery/vw_*" por fonte primária citável
20. `agent_decisao_judicial_monitor` — TRF/STF/PJe watcher para novas decisões em processos citados

## Estrutura Final do PDF (1.0)
1. **Capa** (página 1) — banda teal + título "DOSSIÊ FORENSE v1.0" + painel KPIs + lista de 16-20 agentes + rodapé
2. **Sumário Executivo** — natureza do documento, KPI cards (6+), introdução, **bloco "Compromisso 1.0: Contraditório, Fontes Primárias, Falsos Positivos"**
3. **Identificação do Alvo** — tabela ampliada (15-18 linhas)
4. **Metodologia e Fontes** — fontes primárias (catálogo amplo) + 5 eixos + disclaimer normativo
5. **Matriz Analítica · Findings** — 40-55 cards (CRÍTICA primeiro, INFO por último, **incluindo reclassificações pós-investigação como exemplo de honestidade editorial**)
6. **Síntese Analítica** — 3-5 eixos + Recomendações de Monitoramento
7. **🆕 Bloco de Contraditório Consolidado** — reúne todas as manifestações públicas + decisões judiciais favoráveis em página dedicada
8. **Agradecimentos e Canal de Contestação**
9. **Anexo · Garantias e Direito de Resposta** — 5+ garantias + Glossário Técnico ampliado

## Output Padrão (1.0)
- 38-50 páginas (mandato federal completo com Eixo 5 + contraditório consolidado)
- Tamanho típico: 180-220 KB (com fontes embedded)
- Nome: `Dossie_<NomeAlvo>_v1-0.pdf`
- Compartilhar com `share_file(name="dossie_<nome_alvo>")` para versionamento

## Casos de Referência
- **🥇 Dossiê Erika Hilton v3.5.1 (mai/2026)** — caso gold v1.0-pioneer: 54 findings (12 CRÍTICA · 18 ALTA · 14 MÉDIA · 10 INFORMATIVO), 42 páginas, 16 agentes, Eixo 5 ativado, Direct Data integrada, contraditório judicial 3-partes implementado, fontes primárias 100%, F-13 reclassificado de CRÍTICA → INFORMATIVO (modelo de honestidade editorial). PDF em `/home/user/workspace/Dossie_Erika_Hilton_v3-5.pdf`. **Esta é a referência viva da v1.0.**
- **Dossiê Erika Hilton v3.5** (mai/2026) — primeira versão com Eixo 5, 50 findings, 38 páginas
- **Dossiê Erika Hilton v3.4** (gold-standard inicial)
- **Dossiê Abimael Santos (PL-PE) v3.4** — 13 páginas, 22 findings, replicação completa mai/2026

## Arquivos Bundled
- `scripts/gerar_dossie_v35.py` — gerador PDF parametrizado base 1.0 (KeepTogether, agentes, ampliação capa)
- `scripts/gerar_dossie.py` — gerador v3.4 (legado)
- `references/findings-template.json` — template JSON base
- `references/findings-v35-erika-real.json` — findings reais Erika v3.5 (referência real-world)
- `references/font-urls.md` — URLs Google Fonts CDN (DM Sans + Inter)
- `references/fontes-primarias.md` — catálogo de URLs primárias por tipo de dado (atualizar com novas fontes 1.0)

## Compliance Pré-Publicação (1.0 — Expandido)
- [ ] **Tom**: zero verbos acusatórios diretos ("fraudou", "desviou", "cometeu", "roubou", "corrupto") — sempre descritivos
- [ ] **URL primária**: 100% dos findings com fonte clicável verificável
- [ ] **Severidade**: distribuição saudável 10-15 CRÍTICA / 15-20 ALTA / 12-16 MÉDIA / 8-12 INFO
- [ ] **🆕 Contraditório 3-partes**: presente em TODOS os findings com severidade ≥ MÉDIA
- [ ] **🆕 Manifestação pública da parlamentar**: buscada ativamente e citada quando existir
- [ ] **🆕 Fontes primárias citáveis**: zero menções a "BigQuery", "vw_*", "transparenciabr.transparenciabr.*" no PDF
- [ ] **🆕 Revisão de falsos positivos**: pelo menos 1 finding ≥ ALTA passou por checagem Google Scholar/Lattes/LinkedIn
- [ ] **🆕 Reclassificação documentada**: se houve falso positivo, finding "Reclassificação pós-investigação" criado e classificado como INFORMATIVO
- [ ] **LGPD**: CPFs mascarados (Classe A/B); Classe C **bloqueado** com `[DADO PROTEGIDO POR LGPD]`
- [ ] **Direito de resposta**: URL contestação em todas as páginas + bloco dedicado no anexo
- [ ] **Disclaimer normativo**: em destaque no sumário executivo
- [ ] **Equilíbrio analítico**: incluir 8-12 findings INFORMATIVO sobre atividade legítima
- [ ] **Direct Data**: dados sensíveis (renda, mãe, endereço) **NUNCA** no PDF — apenas no JSON interno
- [ ] **Validação visual**: ler PDF página a página, conferir ausência de texto cortado, widow/orphan, contraste

## Lições da Auditoria Externa Erika v3.5 → v3.5.1 → 1.0

Princípios aprendidos com a auditoria externa que devem ser perpetuados:

1. **Auditor externo é amigo, não inimigo** — toda crítica vira melhoria estrutural
2. **Contraditório judicial > suposição forense** — se há decisão judicial pronunciada, cita-se literalmente, mesmo que contrarie a tese inicial do dossiê
3. **Fonte primária > infraestrutura interna** — o leitor não quer saber que temos BigQuery; quer saber que o dado vem da Câmara dos Deputados
4. **Revisão honesta de falso positivo eleva credibilidade** — F-13 reclassificado virou prova de seriedade editorial, não fraqueza
5. **Boletim de ocorrência da parlamentar tem peso** — registro policial de ameaças contra ela é INFORMATIVO importante para equilíbrio
6. **Decisão liminar negada não invalida finding** — apenas reforça contraditório; finding mantém seu lugar com nota "Justiça negou liminar em <data> citando cognição sumária"

## Skills Relacionadas
- `transparenciabr-lei` — autoridade superior. SEMPRE carregar antes.
- `dossie-forense-v35-completo` — skill VITRINE consolidada (legado v3.5, manter como referência histórica).

Em conflito: **`transparenciabr-lei` > `dossie-forense-parlamentar` 1.0**.

## Changelog

### 1.0 (24/mai/2026) — Release Stable
- 🆕 Princípios 9, 10, 11 (contraditório público, fontes primárias, revisão de falsos positivos)
- 🆕 Fase 6.5 dedicada a contraditório + revisão de falsos positivos
- 🆕 4 novos tipos de finding canonizados (locação veículo, TF nominal, BO ameaças, decisão liminar)
- 🆕 4 agentes técnicos especializados (contradito_publico, falso_positivo_check, fonte_primaria_normalizer, decisao_judicial_monitor)
- 🆕 Template de contraditório 3-partes obrigatório
- 🆕 Mapeamento view BQ → fonte primária citável
- 🆕 Audit final reforçado (12 itens, comando pdftotext de validação)
- 🆕 Bloco de Contraditório Consolidado no PDF (nova seção)
- 🆕 Sweet spot ajustado para 40-55 findings com mais INFO (8-12)
- 🆕 Caso Erika v3.5.1 estabelecido como referência viva

### v3.5 (mai/2026)
- Eixo 5 (Empresas Exclusivas + Cruzamento Sócios)
- Direct Data integração (QSA, BeneficiárioFinal, CadastroPF Plus, ProcessosJudiciais)
- 16 agentes técnicos (4 novos)
- Catálogo BigQuery views consagradas

### v3.4
- Gold standard inicial (Erika v3.4, Abimael)
- 22-40 findings, 13-30 páginas
- Tom INFORMATIVO consolidado
