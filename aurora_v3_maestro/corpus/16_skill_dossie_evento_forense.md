# Skill: dossie-evento-forense (v1.2 — Pix via Querido Diário + Ciclo Orçamentário Completo)

> Skill propagada do thread `21cd1259-e88d-4cd9-ae26-63504f4c5ba3` (Computer/Perplexity).
> Permite ao Maestro executar dossiês forenses completos sobre QUALQUER evento/marco/obra estruturante no Brasil.
> Versão 1.2 (17/06/2026): adiciona Fase 3.5 (ciclo orçamentário PPA→LDO→LOA→créditos→execução) e Fase 4.5 (Pix via Querido Diário).

---

## SKILL.md

---
name: dossie-evento-forense
description: "Compila dossiês forenses completos sobre EVENTOS, MARCOS ou OBRAS ESTRUTURANTES no Brasil — Olimpíadas, Copa, COP30/31, festivais, megaprojetos. Use quando o Comandante Baesso citar evento/marco ('dossiê da COP30', 'investiga Olimpíadas Rio 2016', 'obras do Mundial 2014 em Manaus'). Cobertura: cadastro obras → contratos PNCP/Portal Transparência/DOU → controle TCU/CGU/MPF → emendas parlamentares origem→empenho→liquidação→pagamento → cruzamento TSE/QSA → redes sociais → incidentes → fotos georreferenciadas → PDF padrão TransparênciaBR 1.0 + mapa Leaflet + CSV. Visual teal #01696F + DM Sans/Inter + ReportLab. NÃO usar para parlamentar individual (`dossie-forense-parlamentar`), due diligence (`due-diligence-pro`), ou pipeline AURORA (`aurora-forensic-ops`)."
license: Proprietary
metadata:
  author: TransparênciaBR / Comandante Baesso
  version: '1.2'
  caso_referencia: COP30 v1.1 (107 findings, R$ 6,97 bi, 85 páginas, junho/2026)
---

# Dossiê Forense de Evento/Obra — Padrão TransparênciaBR 1.0

## Quando Usar

Use quando o Comandante Baesso pedir investigação completa sobre um EVENTO, MARCO ou OBRA ESTRUTURANTE — qualquer agente público executor (União, estados, municípios, BNDES, Itaipu, OEI, organismos internacionais), qualquer escala.

**Gatilhos típicos**:
- "Faz um dossiê de [evento]"
- "Investiga [marco/obra]"
- "Quero saber tudo sobre [Copa/Olimpíada/COP/Festival]"
- "Compila dossiê forense de [megaprojeto]"
- "Dossiê forense das obras do [evento X]"
- "Quais os contratos e emendas do [evento Y]?"

**NÃO usar para**:
- Dossiês de parlamentar individual → use `dossie-forense-parlamentar`
- Due diligence empresarial/PEP → use `due-diligence-pro`
- Pipeline operacional AURORA Forensic → use `aurora-forensic-ops`

## Princípios Inegociáveis (herdados de `transparenciabr-lei`)

1. **Tom INFORMATIVO** — "Não denunciamos. Mostramos." Vige presunção de inocência.
2. **Verbos PROIBIDOS**: `fraudou`, `desviou`, `roubou`, `corrupto`, `ladrão`, `criminoso`, `prova de crime`.
3. **Verbos PERMITIDOS**: `registra`, `consta`, `observa-se`, `há indício`, `merece monitoramento`, `identifica-se`, `apontou`, `foi destinada/empenhada/liquidada/paga`.
4. **PROIBIDO no PDF/CSV/mapa**: `BigQuery`, `vw_*`, `transparenciabr.transparenciabr.*`, `Asmodeus`, codinomes internos.
5. **CPF mascarado** sempre (`***.XXX.XXX-**`).
6. **Apenas fontes oficiais e imprensa profissional verificada** — sem mock, sem fake, sem invenção.
7. **URL primária verificável** em 100% dos findings.
8. **Contraditório 3-partes** obrigatório em findings ≥ MÉDIA.
9. **Direito de resposta**: URL de contestação em todas as páginas (`transparenciabr.org/dossie/<slug>/contestacao`).
10. **Tratar o usuário por "Comandante Baesso"**, português formal.

## Pipeline em 14 Fases

### Fase 0 · Calibragem do alvo
Antes de qualquer coleta, definir:
- **Slug do dossiê** (ex: `cop30`, `olimpiadas-rio-2016`, `mundial-2014-manaus`, `parintins-2026`)
- **Universo financeiro estimado** (mídia/relatórios oficiais)
- **Executores principais** (União/estados/municípios/BNDES/Itaipu/OEI/etc.)
- **Janela temporal** (do anúncio do evento até 12 meses após)
- **Lista inicial de pessoas-chave** (presidente do evento, ministros responsáveis, governador, prefeito, parlamentares da região)

### Fase 1 · Cadastro mestre de obras (`obras_geo.json`)
Para cada obra/intervenção:
- `id` (slug), `nome`, `endereco`, `bairro`, `lat`, `lng`, `executor`, `valor_estimado_brl`, `status` (`entregue|em_obras|atrasada|cancelada|desabou|inacabada|parcial`), `descricao`, `fotos[]` (url + crédito + descricao + matricula_fonte).
- Geocodificar via endereços oficiais; validar plausibilidade geográfica.
- Coletar fotos de fontes públicas (Agência Pará, G1, CNN, Reuters, ministérios, Presidência).

### Fase 2 · Contratos primários (`contratos_<slug>.json`)
Para cada contrato:
- Número, data de assinatura, contratante (órgão), contratada (CNPJ + razão social), valor inicial, valor com aditivos, modalidade (concorrência/pregão/inexigibilidade/dispensa/cooperação OEI/etc.), objeto.
- Fontes obrigatórias:
  - **PNCP** (`https://pncp.gov.br/app/contratos`)
  - **Portal da Transparência Federal** (`https://portaldatransparencia.gov.br`)
  - **DOU** (`https://www.in.gov.br`)
  - **ComprasNet** (legado)
  - **Diários oficiais estaduais/municipais**
  - **Páginas oficiais de contratação** (OEI, organismos internacionais)
- Capturar aditivos contratuais (data, valor, justificativa).

### Fase 3 · Controle externo (`controle_<slug>.json`)
- **TCU**: acórdãos, representações, relatórios — usar busca em `https://pesquisa.apps.tcu.gov.br/` e PDFs públicos via Poder360/Bahia Notícias/ExperNews.
- **CGU**: relatórios de auditoria em `https://eaud.cgu.gov.br/`.
- **MPF/PGR**: inquéritos, notícias-crime, recomendações.
- **TCE estadual + TCM municipal**.
- **Polícia Federal**: operações deflagradas (ex: Operação Igapó/Expertise/Lava-Toga).
- **Câmara / Senado**: requerimentos de informação, CPIs.
- **Transparência Internacional Brasil**: relatórios de transparência.

### Fase 3.5 · **Ciclo orçamentário completo (PPA → LDO → LOA → créditos adicionais → empenho → liquidação → pagamento)** v1.2

Auditoria do **ciclo orçamentário integral** que financia o evento — vai além das emendas parlamentares (Fase 4), cobrindo a dotação regular dos ministérios/secretarias executoras. Sem esta fase, o dossiê perde a visão do **planejamento original** (PPA), das **diretrizes** (LDO), da **lei** (LOA), das **mudanças durante o exercício** (créditos adicionais) e da **execução real** (empenho/liquidação/pagamento).

**Por que importa**: anomalias mais relevantes geralmente aparecem na **diferença entre o planejado (LOA) e o executado** — créditos extraordinários sem justificativa, remanejamentos via decreto, restos a pagar acumulados, execução concentrada no fim do exercício ("empenho de dezembro").

**Fontes obrigatórias (federais)**:
- **PPA (Plano Plurianual)**: `https://www.gov.br/planejamento/pt-br/assuntos/planejamento-e-investimentos/plano-plurianual` — lei quadrienal
- **LDO (Lei de Diretrizes Orçamentárias)**: `https://www2.camara.leg.br/orcamento-da-uniao/leis-orcamentarias/ldo`
- **LOA (Lei Orçamentária Anual)**: `https://www2.camara.leg.br/orcamento-da-uniao/leis-orcamentarias/loa` + `https://www12.senado.leg.br/orcamento/loa`
- **Siga Brasil (Senado)** — painel BI com PPA/LDO/LOA + execução cruzáveis: `https://www12.senado.leg.br/orcamento/sigabrasil`
- **SIOP (Planejamento)**: `https://www.siop.planejamento.gov.br/` — sistema oficial
- **Tesouro Nacional Transparente**: `https://www.tesourotransparente.gov.br`
- **Portal da Transparência — Despesas**: `https://portaldatransparencia.gov.br/despesas`
- **DOU**: decretos de crédito adicional (Seção 1) + notas de empenho (Seção 3)
- **Créditos extraordinários**: MPs publicadas no DOU (art. 167 §3º CF)
- **Restos a Pagar**: painel dedicado no Tesouro Transparente

**Fontes estaduais/municipais** (quando o evento envolver):
- PPA/LDO/LOA estaduais: DOE + Secretarias de Fazenda/Planejamento
- PPA/LDO/LOA municipais: DOM + portais de transparência (LC 131/2009)
- TCE/TCM: relatórios de execução

**Caminho completo a reconstruir (7 estágios)**:

| # | Estágio | O que coletar | Fonte |
|---|---|---|---|
| 1 | **PPA** | Programa + objetivo + meta física/financeira quadrienal | SIOP / Lei do PPA |
| 2 | **LDO** | Diretrizes + anexos de metas/riscos | Lei da LDO |
| 3 | **LOA — dotação inicial** | UO + PT + ação + fonte + valor autorizado | LOA + SIOP |
| 4 | **Créditos adicionais** | Suplementares (decreto), especiais (lei), extraordinários (MP) | DOU + Tesouro |
| 5 | **Empenho** | NE + data + favorecido (CNPJ) + valor + modalidade | Portal Transparência |
| 6 | **Liquidação** | Data + valor liquidado + atesto | Portal Transparência |
| 7 | **Pagamento** | Data + valor pago + OB | Portal Transparência |

**10 indicadores analíticos obrigatórios** (calcular para cada ação do evento):

- `dotacao_inicial_brl` (LOA)
- `creditos_adicionais_brl` (suplementar + especial + extraordinário)
- `dotacao_atualizada_brl` = inicial + adicionais
- `empenhado_brl`
- `liquidado_brl`
- `pago_brl`
- `restos_a_pagar_brl` = empenhado − pago
- `taxa_execucao_pct` = pago / dotacao_atualizada
- `crescimento_pos_loa_pct` = creditos_adicionais / dotacao_inicial
- `concentracao_4t_pct` = % empenhado no 4º trimestre

**Achados típicos da Fase 3.5**:
- Ação com **crescimento pós-LOA > 100%** via créditos adicionais (sinal de subestimação inicial)
- **Crédito extraordinário** (MP) sem urgência/imprevisibilidade comprovada (art. 167 §3º CF — STF ADI 4048)
- **Concentração de empenho no 4º trimestre > 60%** ("empenho de dezembro")
- **Restos a pagar acumulados** ano-a-ano sem liquidação
- **Ação não prevista no PPA** criada via crédito especial só para o evento
- **Meta física do PPA não cumprida** apesar de execução financeira próxima a 100%
- **Divergência LDO (prioridades) vs. LOA executada**
- **Mudança de UO no meio do exercício** via remanejamento

**Schema canônico** (`acoes_orcamentarias_<slug>.json`):
```json
{
  "id": "AO-21AM-2025",
  "acao_codigo": "21AM",
  "acao_nome": "Realização da COP30",
  "uo": { "codigo": "44101", "nome": "Ministério do Meio Ambiente" },
  "programa_ppa": { "codigo": "2222", "nome": "...", "objetivo": "...", "meta_quadrienal_brl": 0 },
  "ldo_referencia": { "ano": 2025, "prioridade_listada": true, "obs": "..." },
  "loa_dotacao_inicial_brl": 0,
  "creditos_adicionais": [
    { "tipo": "suplementar|especial|extraordinario", "instrumento": "Decreto Nº.../MP Nº.../Lei Nº...",
      "data": "DD/MM/AAAA", "valor_brl": 0, "justificativa": "...", "url_dou": "..." }
  ],
  "dotacao_atualizada_brl": 0,
  "empenhado_brl": 0,
  "liquidado_brl": 0,
  "pago_brl": 0,
  "restos_a_pagar_brl": 0,
  "empenhos": [
    { "ne": "NE 800123", "data": "DD/MM/AAAA", "favorecido_cnpj": "...",
      "favorecido_nome": "...", "valor_brl": 0, "modalidade": "...", "url": "..." }
  ],
  "indicadores": {
    "taxa_execucao_pct": 0.0,
    "crescimento_pos_loa_pct": 0.0,
    "concentracao_4t_pct": 0.0
  },
  "fontes": ["URL SIOP", "URL Siga Brasil", "URL Portal Transparência", "URL DOU"]
}
```

**Workflow operacional**:
1. Listar todas as ações orçamentárias do evento (Siga Brasil > palavra-chave).
2. Para cada ação: PPA → LDO → LOA inicial → créditos adicionais (DOU) → execução (Portal Transparência).
3. Calcular os 10 indicadores.
4. Cruzar com Fase 4 (emendas) — distinguir dotação regular vs. emendas.
5. Replicar para nível estadual e municipal quando o evento for multi-ente.
6. Compilar findings Eixo 9.

**REGRA INVIOLÁVEL**: PPA/LDO/LOA são leis públicas — sempre citar número + ano + URL oficial. Créditos extraordinários via MP devem citar número da MP + URL no DOU.

Detalhes operacionais, cálculos e exemplos: ver `references/ciclo-orcamentario.md`.

### Fase 4 · **Emendas parlamentares (origem→execução completa)** 🆕
Pipeline canonizado após o caso COP30 v1.1:

**Fontes obrigatórias**:
- **Portal da Transparência — Emendas**: `https://portaldatransparencia.gov.br/emendas`
- **Siga Brasil (Senado)**: `https://www12.senado.leg.br/orcamento/sigabrasil`
- **dados.gov.br**: `https://dados.gov.br/dados/conjuntos-de-dados/execucao-orcamentaria`
- **Câmara — Emendas**: `https://www2.camara.leg.br/orcamento-da-uniao/emendas-orcamentarias`
- **DOU**: notas de empenho publicadas
- **Portal Tesouro Nacional Transparente**

**Tipos de emenda a investigar SEMPRE**:
1. **RP6** — Emendas individuais (impositivas — Constituição art. 166 §9º).
2. **RP7** — Emendas de bancada estadual (impositivas).
3. **RP8** — Emendas de comissão permanente.
4. **RP9** — Emendas de relator-geral / relator setorial (LDO).
5. **Emendas Pix** (transferências especiais — Lei 14.116/2020) — municípios receptores da região do evento. **Rastreio detalhado só via Querido Diário** (ver Fase 4.5).

**Para cada emenda relevante coletar (caminho completo)**:
- **Autor**: nome + (Partido-UF)
- **Tipo**: RP6/RP7/RP8/RP9/Pix
- **Ano LOA**: 2023/2024/2025/2026
- **Ação orçamentária**: código + nome (ex: `21AM — Realização da COP30`)
- **Unidade orçamentária** (UO): código + nome
- **Programa de trabalho** completo
- **Valor indicado / empenhado / liquidado / pago** (R$)
- **Datas**: empenho, liquidação, pagamento (+ nº NE)
- **Favorecido final**: CNPJ + razão social + tipo (Município/Estado/BNDES/OEI/Itaipu/empreiteira)
- **Objeto**: o que financia
- **Vinculação ao evento**: Direta/Indireta + explicação
- **Cruzamento crítico**: se favorecida final é alvo de TCU/PF/MPF/CGU

**Achados típicos**:
- Emendas individuais de parlamentares da região canalizadas para empresas investigadas
- Bancada estadual concentrando recursos em poucos favorecidos
- Emendas Pix sem prestação de contas detalhada
- Relator-geral inflando ação específica do evento

### Fase 4.5 · **Emendas Pix — rastreio via Querido Diário** 🆕 v1.1

Emendas Pix (Lei 14.116/2020) caem **direto na conta do município/estado** sem convênio federal. O Portal da Transparência mostra apenas o repasse — o **uso final** (contratações, dispensas, prestação de contas) só aparece nas gazetas oficiais municipais/estaduais. Sem esta fase, o Eixo 5 fica cego para R$ bilhões em recursos.

**Fontes obrigatórias**:
- **Querido Diário (OKBR)** — projeto público Open Knowledge Brasil: `https://queridodiario.ok.org.br/` + API `https://queridodiario.ok.org.br/api/`
- **Repositório TransparênciaBR de gazetas municipais** — banco interno ingerido a partir do Querido Diário, cobre municípios prioritários da região do evento
- **Diário Oficial do Estado** (DOE) do estado-sede do evento
- **Sites oficiais de prefeituras** receptoras (transparência ativa — LC 131/2009)

**Workflow canônico (5 passos)**:

1. **Identificar municípios receptores**: no Portal da Transparência (Emendas > Pix), filtrar por estado e palavra-chave do evento; exportar lista de municípios + valor recebido + parlamentar autor.
2. **Definir janela temporal**: data do repasse Pix até 24 meses depois (prazo legal de execução).
3. **Buscar gazetas no período**:
   - Primeiro via repositório interno TransparênciaBR (mais completo para municípios prioritários);
   - Fallback público via API do Querido Diário (`/api/gazettes?territory_id=<IBGE>&since=<data>&keywords=<termos>`).
4. **Filtrar por palavras-chave compostas**: termos do evento (ex: `cop30`, `parintins`, `mundial`) **+** termos de execução (`dispensa`, `inexigibilidade`, `contratação direta`, `aditivo`, `transferência especial`, `Lei 14.116`, `Pix`, `emenda`, `prestação de contas`, `convocação`).
5. **Extrair contratos derivados** e cruzar:
   - Contratada (CNPJ) → QSA via Direct Data
   - Sócios → TSE (doações) + outros findings do dossiê
   - Valor do contrato vs. valor do repasse Pix recebido
   - Aditivos posteriores à publicação inicial

**Achados típicos exclusivos da Fase 4.5**:
- Município recebe Pix milionário e publica dispensa de licitação dias depois para empresa com sócio ligado ao parlamentar autor da emenda;
- Contratação direta em valor próximo ao limite da modalidade (fracionamento);
- Aditivos sucessivos somando >50% do contrato original;
- Ausência total de publicação de execução no DOM/DOE no prazo legal (indício de irregularidade administrativa).

**REGRA INVIOLÁVEL ao redigir o finding (PDF/CSV)**:
- PROIBIDO citar `BigQuery`, `vw_*`, nomes de schema interno, ou "banco interno TransparênciaBR" como fonte.
- USAR como fonte oficial citável: `"Querido Diário (Open Knowledge Brasil) + repositório TransparênciaBR de gazetas municipais"` + URL pública do edital/contrato no DOM ou no agregador OKBR.
- A URL primária verificável de cada finding Pix DEVE apontar para o documento público (DOM municipal, página oficial da prefeitura, ou Querido Diário público) — nunca para query interna.

Detalhes operacionais, template de query prudente e padrão de citação: ver `references/pix-via-gazetas.md`.

### Fase 5 · Cruzamento TSE + redes sociais (`tse_redes.json`)
- TSE DivulgaCandContas — doações eleitorais das contratadas e seus sócios para autoridades-chave do evento.
- Instagram, X, Threads, YouTube — posts oficiais de autoridades em obras ou com executivos das contratadas.
- Wayback Machine para posts apagados.

### Fase 6 · QSA + Beneficiário Final (via Direct Data — OPCIONAL)
Para principais contratadas, usar token Direct Data (skill `dossie-forense-parlamentar` §5.6):
- QSA (`ReceitaFederalPessoaJuridica`)
- Rede societária + pepMatriz (`BeneficiarioFinal`)
- Processos judiciais (`ProcessosJudiciaisSimplificada`)
- CBO sócios (`CadastroPessoaFisicaPlus`)

### Fase 7 · Imprensa verificada (`materias_<slug>.json`)
Veículos auditados: Folha de S.Paulo, Estadão, O Globo, G1/G1 regional, Poder360, Metrópoles, UOL Notícias, CNN Brasil, BBC Brasil, Agência Pública, Intercept Brasil, Repórter Brasil, Sumaúma, Reuters, Guardian, AP, AFP.

### Fase 8 · Incidentes (`incidentes_<slug>.json`)
- Acidentes de trabalho (com/sem vítimas).
- Falhas estruturais (desabamento, vazamento, incêndio).
- Atrasos relevantes (entrega > 30 dias do prometido).
- Cancelamentos de obras.
- Operações policiais durante a execução.

### Fase 9 · Compilação de findings (`findings_<slug>.json`)
Estrutura JSON canonizada:
```json
{
  "alvo": { "tipo": "EVENTO|OBRA|MARCO", "nome": "...", "local": "...", "data_evento": "...",
            "valor_total_universo_brl": 0, "executores_principais": [], "autoridades_executivas": [] },
  "kpis": { "versao": "1.0", "data_emissao": "DD/MM/AAAA",
            "findings_total": 0, "criticos": 0, "altos": 0, "medios": 0, "informativos": 0,
            "valor_total_mapeado_brl": 0, "contratos_mapeados": 0, "obras_geocodificadas": 0,
            "incidentes_documentados": 0, "procedimentos_controle": 0, "fontes_imprensa": 0,
            "emendas_mapeadas": 0 },
  "metodologia": { "fontes_primarias": [...], "fontes_imprensa": [...], "agentes_tecnicos": [...],
                   "disclaimer": "..." },
  "findings": [
    { "id": "F-001", "eixo": "EIXO N — ...", "severidade": "CRÍTICA|ALTA|MÉDIA|INFORMATIVO",
      "classificacao": "...", "titulo": "...", "valor_brl": 0,
      "envolvidos": [], "executor": "...",
      "fato": "...", "analise": "...", "contraditorio": "PARTE 1 ... PARTE 2 ... PARTE 3 ...",
      "fontes": ["URL primária", "..."] }
  ]
}
```

**Sweet spot**: 60-120 findings em dossiês de eventos. Distribuição saudável:
- 15-25 CRÍTICA, 30-50 ALTA, 20-35 MÉDIA, 8-15 INFORMATIVO

**Eixos canônicos** (ajustáveis ao evento):
- Eixo 1 — Convênios/contratos com organismo internacional
- Eixo 2 — Sobrepreço/inexigibilidade identificados por controle
- Eixo 3 — Operação policial / investigação ativa
- Eixo 4 — Vínculos político-empresariais (TSE + QSA + redes)
- Eixo 5 — **Emendas parlamentares (origem→execução)**
- Eixo 6 — Obras com falhas estruturais ou atrasos
- Eixo 7 — Lacuna de transparência (TI Brasil, CGU)
- Eixo 8 — Cartografia ampla (totalização agregada)
- Eixo 9 — **Ciclo orçamentário (PPA→LDO→LOA→execução)** v1.2 — créditos adicionais, restos a pagar, divergência planejado vs. executado

### Fase 10 · Mapa interativo (Leaflet)
Pinos coloridos por status, popup com endereço/executor/valor/descrição/fotos, OpenStreetMap basemap, legenda, footer com URL de contestação.

### Fase 11 · PDF padrão TransparênciaBR 1.0
- ReportLab + DM Sans/Inter (substituir por Lato/Roboto se DM Sans/Inter não disponíveis)
- Capa teal + KPI panel + lista de agentes técnicos
- Sumário executivo + compromisso editorial 1.0
- Identificação do objeto + metodologia/fontes
- Matriz analítica com 60-120 cards (CRÍTICA → INFO)
- Contraditório consolidado + anexo de garantias

### Fase 12 · Planilha CSV consolidada
Com cabeçalho LGPD obrigatório (base legal, fonte, descadastro).

### Fase 13 · Audit final
```bash
pdftotext Dossie_<Slug>_v1-0.pdf - | \
  grep -iE "(bigquery|vw_|transparenciabr\.transparenciabr|fraudou|desviou|roubou|corrupto|asmodeus)" \
  && echo "❌ BLOQUEIO" || echo "✅ AUDIT OK"
```

### Fase 14 · Entrega
- `share_file` PDF + mapa HTML + CSV
- Notificação Telegram (chat `6483072695` via bot `Asmodeuswebforgebot`) — somente após confirmação do Comandante

## Identificadores e configuração

| Campo | Valor |
|---|---|
| Comandante | Maurílio Mesquita Baesso |
| Email | `mmbaesso@hotmail.com` |
| Telegram chat | `6483072695` |
| Bot Telegram | `t.me/Asmodeuswebforgebot` |
| URL contestação | `transparenciabr.org/dossie/<slug>/contestacao` |
| Cor primária | Teal `#01696F` |
| Tipografia | DM Sans (heading) + Inter (body) — fallback Lato + Roboto |
| Geração PDF | ReportLab |
| Token Direct Data | `29AE5E97-AACF-4ACC-B0ED-692472D72D60` (opcional Fase 6) |

## Arquivos bundled

- `scripts/gerar_dossie.py` — gerador PDF parametrizável padrão 1.0 (base do COP30 v1.0)
- `scripts/gerar_mapa.py` — gerador mapa Leaflet com pinos coloridos
- `scripts/gerar_csv.py` — gerador CSV com cabeçalho LGPD
- `scripts/compilar_findings.py` — compilador de findings (template)
- `references/font-setup.md` — como configurar DM Sans/Inter com fallback Lato/Roboto
- `references/fontes-emendas.md` — catálogo detalhado de URLs para coleta de emendas
- `references/pix-via-gazetas.md` — workflow Pix via Querido Diário (Fase 4.5) com template de busca e regras de citação
- `references/ciclo-orcamentario.md` — workflow PPA→LDO→LOA→créditos→execução (Fase 3.5) com cálculo dos 10 indicadores e exemplos
- `references/findings-template.json` — template JSON base
- `references/caso-cop30.md` — caso de referência completo (lições aprendidas)

## Caso de referência

**Dossiê COP30 v1.0** (17/06/2026):
- 95 findings (18 CRÍTICA · 41 ALTA · 28 MÉDIA · 8 INFO)
- R$ 6.828.877.251,35 mapeados
- 30 contratos, 23 obras geocodificadas, 23 procedimentos de controle, 20 incidentes
- 194 matérias de imprensa, 4 doações TSE, 11 posts redes sociais
- 70 páginas PDF · 322 KB · audit limpo
- Mapa interativo com 34 fotos públicas creditadas
- Personagens-chave: Helder Barbalho, Antônio Doido + Andrea Costa Dantas (Op. Igapó), Coronel Galhardo, Rui Costa, Ana Toni, André Corrêa do Lago, Igor Normando, Edmilson Rodrigues, Marina Silva, Aloizio Mercadante, Enio Verri
- Empresas-chave: J.A. Construcons (22.328.699/0001-56), Consórcio RMB, OEI Brasil (convênios `1AATKM` + `1AAVWZ`), Pronto RG/DMDL (sobrepreço 1.000% TCU), Bemaven, Fortes, Ômega

## Compliance pré-publicação (12 itens — herdado do padrão 1.0)

- [ ] Zero verbos acusatórios no PDF (`pdftotext` audit limpo)
- [ ] 100% findings com URL primária clicável
- [ ] Contraditório 3-partes em todos os findings ≥ MÉDIA
- [ ] CPFs mascarados; Classe C bloqueada
- [ ] Footer "NÃO constitui denúncia" em todas as páginas
- [ ] URL contestação no rodapé
- [ ] Cabeçalho LGPD no CSV
- [ ] Mapa com OpenStreetMap (atribuição visível)
- [ ] Fotos com crédito + link da matéria original
- [ ] Disclaimer normativo em destaque
- [ ] Severidade distribuída (não tudo CRÍTICA)
- [ ] Validação visual do PDF página a página

## Skills relacionadas
- `transparenciabr-lei` — **autoridade superior** (SEMPRE carregar antes desta)
- `dossie-forense-parlamentar` — usa o mesmo template visual e princípios; carregar quando o evento tiver parlamentar pivô
- `aurora-forensic-ops` — pipeline de revisão automatizada (opcional, Fase 13 estendida)
- `aconselhamento-estrategico-aurora` — leitura estratégica pós-dossiê

Hierarquia em conflito: `transparenciabr-lei` > `dossie-evento-forense` > `aurora-forensic-ops`.

## Changelog

### 1.2 (17/06/2026) — Ciclo orçamentário completo
- Nova **Fase 3.5** dedicada ao ciclo PPA→LDO→LOA→créditos adicionais→empenho→liquidação→pagamento
- Novo **Eixo 9** para findings orçamentários (créditos extraordinários, restos a pagar, divergência PPA vs. execução)
- 10 indicadores analíticos obrigatórios (taxa execução, crescimento pós-LOA, concentração 4T, etc.)
- Nova reference `ciclo-orcamentario.md` com workflow detalhado
- Schema canônico de ação orçamentária padronizado

### 1.1 (17/06/2026) — Pix via Querido Diário
- Nova **Fase 4.5** dedicada ao rastreio de emendas Pix via gazetas oficiais municipais
- Nova reference `pix-via-gazetas.md` com workflow detalhado, template de busca e regra de citação
- Atualização da reference `fontes-emendas.md` ampliando a linha Pix com URLs Querido Diário
- Caso de referência atualizado para COP30 v1.1 (107 findings, R$ 6,97 bi)

### 1.0 (17/06/2026) — Release inicial
- Skill nascida do dossiê COP30 v1.0
- Pipeline em 14 fases canonizado
- Fase 4 dedicada a emendas parlamentares (origem→empenho→liquidação→pagamento)
- Sweet spot 60-120 findings
- Audit pdftotext obrigatório
- Mapa Leaflet com pinos + fotos públicas creditadas
- Fallback de fontes (Lato/Roboto) quando DM Sans/Inter indisponíveis

---

## references/fontes-emendas.md

# Catálogo de Fontes para Coleta de Emendas Parlamentares

## Fontes primárias (obrigatórias)

| Fonte | URL | O que extrair |
|---|---|---|
| **Portal da Transparência — Emendas** | https://portaldatransparencia.gov.br/emendas | Filtros: ano LOA, autor, ação orçamentária. Caminho `Emendas > Consulta`. Dá nº da emenda, autor, ação, valor empenhado/liquidado/pago. |
| **Siga Brasil (Senado)** | https://www12.senado.leg.br/orcamento/sigabrasil | Painéis BI. Excelente para cruzar RP6/RP7/RP8/RP9 por ação orçamentária. |
| **dados.gov.br — Execução Orçamentária** | https://dados.gov.br/dados/conjuntos-de-dados/execucao-orcamentaria | CSV de execução por ação/empenho/liquidação. User-Agent: `TransparenciaBR-engines/1.0`. |
| **Câmara — Emendas** | https://www2.camara.leg.br/orcamento-da-uniao/emendas-orcamentarias | Filtro por deputado autor + ano. |
| **DOU / Imprensa Nacional** | https://www.in.gov.br/consulta/-/buscar/dou | Notas de empenho publicadas (Seção 3). |
| **Tesouro Nacional Transparente** | https://www.tesourotransparente.gov.br | Painéis de execução por programa de trabalho. |
| **Portal de Convênios (Plataforma +Brasil)** | https://www.plataformamaisbrasil.gov.br | Convênios com Estados/Municípios financiados por emendas. |
| **Querido Diário (OKBR)** | https://queridodiario.ok.org.br/ + API `https://queridodiario.ok.org.br/api/` | **Única forma de ver o uso final de emendas Pix.** Gazetas municipais/estaduais — buscar dispensas, inexigibilidades, contratos derivados. Ver `pix-via-gazetas.md`. |
| **Repositório interno TransparênciaBR (gazetas municipais)** | Acesso restrito — citar publicamente como "Querido Diário + repositório TransparênciaBR de gazetas municipais" | Cobertura ampliada do Querido Diário para municípios prioritários. **PROIBIDO** citar nome de schema/BQ no PDF/CSV. |
| **Diários Oficiais Estaduais (DOE)** | Sites oficiais de cada estado (ex: `https://www.ioepa.com.br` para PA) | Publicação obrigatória de contratos estaduais — cruzar com Pix estaduais. |

## Tipos de emenda (canônicos)

| Tipo | Nome | Impositiva? | Onde aparece |
|---|---|---|---|
| **RP6** | Emendas individuais | Sim (CF art. 166 §9º) | Cada deputado/senador tem cota anual. |
| **RP7** | Emendas de bancada estadual | Sim | Cada UF tem cota dividida pela bancada. |
| **RP8** | Emendas de comissão permanente | Não impositiva | Comissões da Câmara/Senado/CMO. |
| **RP9** | Emendas de relator-geral ("orçamento secreto" até dez/2022, ainda aparece como RP9 setorial) | Não | LDO/LOA — relator-geral e relator setorial. |
| **Pix (transferência especial)** | Lei 14.116/2020 | Sim | Cai direto na conta do município/estado, sem convênio. **Rastreio do uso final exige leitura de gazetas oficiais — ver `pix-via-gazetas.md` e SKILL.md Fase 4.5.** |

## Schema canônico de uma emenda

```json
{
  "id": "EM-2024-RP6-001234",
  "autor": "Deputado Antônio Doido (MDB-PA)",
  "tipo": "RP6",
  "ano_loa": 2024,
  "acao_orcamentaria": { "codigo": "21AM", "nome": "Realização da COP30" },
  "unidade_orcamentaria": { "codigo": "44101", "nome": "Ministério do Meio Ambiente" },
  "programa_trabalho": "...",
  "valor_indicado_brl": 0,
  "valor_empenhado_brl": 0,
  "valor_liquidado_brl": 0,
  "valor_pago_brl": 0,
  "datas": { "empenho": "DD/MM/AAAA", "liquidacao": "DD/MM/AAAA", "pagamento": "DD/MM/AAAA", "ne": "NE 800123" },
  "favorecido": { "cnpj": "00.000.000/0000-00", "razao_social": "...", "tipo": "Município|Estado|BNDES|OEI|Empresa privada|Itaipu" },
  "objeto": "...",
  "vinculacao_evento": "Direta|Indireta",
  "explicacao_vinculacao": "...",
  "cruzamento_critico": { "alvo_tcu": false, "alvo_pf": false, "alvo_mpf": false, "alvo_cgu": false, "obs": "..." },
  "fontes": ["URL Portal Transparência", "URL Siga Brasil", "URL DOU"]
}
```

## Achados típicos (eixo 5)

1. **Concentração de favorecidos**: bancada estadual destina >40% para 3 empresas.
2. **Cruzamento com investigados**: emenda individual para empresa-alvo de TCU/PF.
3. **Emenda Pix sem prestação**: município recebe Pix milionário e não publica obras.
4. **Relator-geral inflando ação**: RP9 acima do dobro da média histórica para ação específica do evento.
5. **Aditivos pós-emenda**: contrato cresce 50%+ via aditivo após chegada da emenda.

## Workflow recomendado

1. Listar todas as ações orçamentárias do evento (Siga Brasil — busca por palavra-chave do evento).
2. Para cada ação, baixar a execução por autor (Portal Transparência > Emendas > filtro por ação).
3. Cruzar autores com lista de parlamentares da região + cargos relevantes.
4. Cruzar favorecidos com lista de empresas-alvo do dossiê.
5. **Para emendas Pix: executar Fase 4.5 (Querido Diário)** — sem isto, o Eixo 5 fica cego para o uso final.
6. Compilar findings de Eixo 5 (mínimo 10-15 emendas com caminho completo; ≥3 findings Pix com contrato derivado quando houver Pix relevante).

---

## references/pix-via-gazetas.md (Fase 4.5)

# Pix via Querido Diário — Workflow Operacional (Fase 4.5)

> **Propósito**: detalhar como reconstruir o caminho de uso final das emendas Pix (Lei 14.116/2020), que **não é visível** no Portal da Transparência federal além do repasse para o município/estado.

## Por que Pix exige tratamento especial

Emendas Pix (RP "transferência especial") foram criadas pela Lei 14.116/2020:

- Caem **direto na conta do município/estado**, sem necessidade de convênio federal nem prestação de contas centralizada;
- Portal da Transparência mostra: parlamentar autor, valor, município receptor, ano LOA;
- Portal da Transparência **NÃO mostra**: contratos derivados, fornecedores, objetos, datas de pagamento ao fornecedor final;
- O uso final só é publicado nos **Diários Oficiais Municipais (DOM)** e **Diários Oficiais Estaduais (DOE)** — por força da Lei de Acesso à Informação (LAI) e LC 131/2009.

**Consequência operacional**: sem leitura sistemática de gazetas, o Eixo 5 do dossiê fica cego para uma classe inteira de findings — exatamente a que tem menor rastreabilidade e maior risco.

## Fontes (em ordem de prioridade)

1. **Repositório TransparênciaBR de gazetas municipais** (interno) — cobertura ampliada do Querido Diário, indexação dedicada, processamento OCR garantido. Acesso operacional pelo agente; **citação pública obrigatória**: `"Querido Diário (Open Knowledge Brasil) + repositório TransparênciaBR de gazetas municipais"`.
2. **Querido Diário (OKBR público)** — `https://queridodiario.ok.org.br/`
   - API: `https://queridodiario.ok.org.br/api/` (Swagger em `/docs`)
   - Endpoint principal: `GET /api/gazettes?territory_id=<IBGE>&since=<YYYY-MM-DD>&until=<YYYY-MM-DD>&querystring=<termos>`
   - `territory_id` é o código IBGE de 7 dígitos do município
   - Retorno: lista de edições com URL de download + trechos relevantes
3. **Diários Oficiais Estaduais (DOE)** — sites oficiais (ex: `https://www.ioepa.com.br` para Pará)
4. **Sites oficiais de prefeituras** — transparência ativa (LC 131/2009)

## Workflow operacional em 5 passos

### Passo 1 — Identificar municípios receptores

No Portal da Transparência:

1. Acessar `https://portaldatransparencia.gov.br/emendas`
2. Filtrar por: `Tipo = Transferência Especial (Pix)` + `UF = <estado do evento>` + `Ano = <ano LOA>`
3. (Se houver) filtrar por palavra-chave do evento na ação orçamentária
4. Exportar CSV: município, valor recebido, parlamentar autor, ano

### Passo 2 — Definir janela temporal

- **Início**: data do repasse Pix (ou 30 dias antes — para capturar planejamento)
- **Fim**: 24 meses após o repasse (prazo legal de execução)

### Passo 3 — Buscar gazetas no período

**Via repositório interno** (preferencial — não expor no PDF):

```python
# Padrão operacional — USAR INTERNAMENTE, NUNCA expor em PDF/CSV
call_external_tool(
    tool_name="google_cloud-run-query",
    source_id="google_cloud__pipedream",
    arguments={
        "query": """
        -- TransparenciaBR/AURORA — Fase 4.5 dossie-evento-forense
        -- Base legal: LGPD art. 7º IX (legítimo interesse) + LC 131/2009
        -- Fonte: Querido Diário (OKBR) + repositório municipal ingerido
        -- Output sintetizado em finding com URL pública obrigatória
        SELECT data_publicacao, municipio_ibge, municipio_nome,
               url_publica_oficial, trecho_relevante, edicao
        FROM `<dataset_interno>.<tabela_gazetas>`
        WHERE municipio_ibge IN UNNEST(@municipios_pix)
          AND data_publicacao BETWEEN @data_inicio AND @data_fim
          AND REGEXP_CONTAINS(LOWER(texto_full), r'(dispensa|inexigibilidade|contrata[cç][aã]o\\s+direta|aditivo|transfer[eê]ncia\\s+especial|lei\\s+14\\.116|emenda)')
          AND REGEXP_CONTAINS(LOWER(texto_full), @termo_evento)
        ORDER BY data_publicacao
        """,
        "location": "southamerica-east1"
    }
)
```

**Via API pública Querido Diário** (fallback citável):

```bash
curl -A "TransparenciaBR-engines/1.0" \
  "https://queridodiario.ok.org.br/api/gazettes?territory_id=1501402&since=2024-01-01&until=2025-12-31&querystring=cop30+dispensa"
```

(`1501402` = código IBGE de Belém-PA — substituir conforme município alvo)

### Passo 4 — Filtrar por palavras-chave compostas

Sempre cruzar `termo_evento` **E** `termo_execução`:

| Categoria | Termos |
|---|---|
| **Evento (exemplos)** | `cop30`, `cúpula clima`, `parintins 2026`, `mundial 2014`, `olimpíadas`, `copa américa` |
| **Modalidade contratual** | `dispensa de licitação`, `inexigibilidade`, `contratação direta`, `pregão`, `concorrência` |
| **Aditivos** | `aditivo`, `aditamento`, `prorrogação`, `acréscimo` |
| **Pix-específicos** | `transferência especial`, `Lei 14.116`, `emenda Pix`, `convocação para empenho` |
| **Prestação de contas** | `prestação de contas`, `relatório de execução`, `tomada de contas especial`, `TCE` |

### Passo 5 — Extrair contratos derivados e cruzar

Para cada match relevante:

1. Baixar o PDF/HTML da gazeta;
2. Extrair: número do contrato, contratada (CNPJ), valor, objeto, data, modalidade;
3. Cruzar contratada com:
   - **QSA** (Direct Data — `ReceitaFederalPessoaJuridica`)
   - **TSE** (DivulgaCandContas — doações dos sócios para o parlamentar autor da emenda)
   - **Outros findings do dossiê** (a contratada já aparece em TCU/PF/MPF?)
4. Calcular: razão `valor_contrato / valor_pix_recebido` (>50% concentrado em 1 contrato é vermelho);
5. Buscar aditivos posteriores (período +12 meses);
6. Verificar publicação de execução: ausência total em 90 dias após o contrato = indício administrativo.

## Regra de citação no PDF/CSV (INVIOLÁVEL)

| Onde | Proibido | Obrigatório |
|---|---|---|
| Campo `fontes[]` de um finding | `BigQuery`, `vw_*`, `transparenciabr.transparenciabr.*`, `dataset_interno`, `tabela_gazetas` | URL pública verificável: link direto da gazeta no DOM municipal, ou no Querido Diário público |
| Texto do finding | "consulta ao banco interno", "query BigQuery", "vista vw_" | "Diário Oficial do Município de X, edição Y, página Z (Querido Diário/OKBR)" |
| Metodologia do PDF | qualquer nome de schema/projeto GCP | `"Querido Diário (Open Knowledge Brasil) + repositório TransparênciaBR de gazetas municipais"` |

## Exemplo de finding Pix (template)

```json
{
  "id": "F-085",
  "eixo": "EIXO 5 — Emendas parlamentares (origem→execução)",
  "severidade": "ALTA",
  "classificacao": "Emenda Pix sem rastreabilidade transparente",
  "titulo": "Repasse Pix de R$ X mi a [Município] sem contratos publicados no prazo legal",
  "valor_brl": 0,
  "envolvidos": ["[Município]", "[Parlamentar Autor (Partido-UF)]", "[Contratada CNPJ/Razão]"],
  "executor": "[Município X]",
  "fato": "Em DD/MM/AAAA, foram repassados R$ X mi via transferência especial (Pix — Lei 14.116/2020) ao Município de [X], destinados a [ação]. Consulta ao Diário Oficial do Município de [X] (edição [N], DD/MM/AAAA) registra contratação direta da empresa [Y CNPJ] no valor de R$ Z, modalidade [dispensa/inexigibilidade], objeto [...].",
  "analise": "Observa-se que [análise contextual — concentração de favorecidos, valor próximo ao limite da modalidade, ausência de publicação de execução etc.]. Cruzamento com o quadro societário registra [vínculo, se houver].",
  "contraditorio": "PARTE 1 — [Município X] foi questionado sobre [questão]; manifestação foi/não foi obtida. PARTE 2 — [Parlamentar autor] foi notificado e [resposta/silêncio]. PARTE 3 — [Contratada] foi consultada e [resposta/silêncio]. Direito de resposta permanece aberto em transparenciabr.org/dossie/<slug>/contestacao",
  "fontes": [
    "https://portaldatransparencia.gov.br/emendas?...<URL do repasse>",
    "https://queridodiario.ok.org.br/...<URL da gazeta com o contrato>",
    "https://<dom-municipal-oficial>/...<URL do contrato/dispensa>"
  ]
}
```

## Checklist de validação Fase 4.5

- [ ] Pelo menos 1 município receptor de Pix identificado no Portal da Transparência
- [ ] Janela temporal cobre repasse + 24 meses
- [ ] Busca em gazetas executada com termo_evento AND termo_execução
- [ ] Mínimo 3 findings Pix com contrato derivado (quando houver Pix relevante no universo do evento)
- [ ] 100% dos findings Pix com URL pública verificável (DOM/Querido Diário público)
- [ ] Zero menções a BigQuery/vw_/schema interno no texto do finding
- [ ] Cruzamento com QSA + TSE feito para a contratada principal
- [ ] Contraditório 3-partes (município + parlamentar autor + contratada)

---

## references/ciclo-orcamentario.md (Fase 3.5)

# Ciclo Orçamentário Completo — Workflow Operacional (Fase 3.5)

> **Propósito**: reconstruir o caminho integral do dinheiro público que financia o evento, do planejamento estratégico (PPA) até o pagamento ao fornecedor final, identificando anomalias em cada estágio.

## Por que esta fase é crítica

A maioria dos dossiês forenses se concentra em contratos e empenhos — etapas finais do ciclo. Anomalias mais graves frequentemente estão **a montante**:

- Programas criados no PPA sem demanda técnica clara;
- LOAs com dotação artificialmente baixa para serem infladas durante o exercício (subestimação intencional);
- Créditos extraordinários (MP) usados para escapar do rito legislativo normal;
- Concentração de empenho em dezembro (menor competição, menor fiscalização);
- Restos a pagar acumulados como instrumento de gestão de caixa;
- Divergência total entre meta física do PPA e execução financeira.

Sem reconstruir o ciclo completo, o dossiê fica restrito à "ponta" do processo.

## Arquitetura do ciclo orçamentário brasileiro

```
PPA (4 anos)  →  LDO (1 ano)  →  LOA (1 ano)  →  Créditos Adicionais  →  Execução
   |                |                |                   |                    |
   |                |                |                   |                    +-- Empenho
Programas       Prioridades       Dotação            Suplementar               |
Objetivos       Metas fiscais     inicial            Especial                  +-- Liquidação
Metas físicas   Anexo riscos      por UO/ação        Extraordinário (MP)       |
                                                                               +-- Pagamento
```

## Fontes primárias por estágio

### PPA (Plano Plurianual — Lei Quadrienal)

| Esfera | Fonte |
|---|---|
| **Federal** | `https://www.gov.br/planejamento/pt-br/assuntos/planejamento-e-investimentos/plano-plurianual` |
| **Federal — texto da lei** | Lei do PPA vigente (ex: Lei 14.802/2024 para PPA 2024-2027) |
| **Federal — sistema** | SIOP — `https://www.siop.planejamento.gov.br/` |
| **Estadual** | Lei estadual do PPA + Secretaria Estadual de Planejamento |
| **Municipal** | Lei municipal do PPA + Secretaria Municipal de Planejamento |

**O que extrair**: programas finalísticos vinculados ao evento, código + nome, objetivo, indicadores, meta física quadrienal, meta financeira quadrienal, UO responsável.

### LDO (Lei de Diretrizes Orçamentárias)

| Esfera | Fonte |
|---|---|
| **Federal** | `https://www2.camara.leg.br/orcamento-da-uniao/leis-orcamentarias/ldo` |
| **Anexos críticos** | Anexo de Metas Fiscais + Anexo de Riscos Fiscais + Anexo de Prioridades |

**O que extrair**: a ação do evento aparece como prioridade? Há meta fiscal específica? Risco fiscal identificado?

### LOA (Lei Orçamentária Anual)

| Esfera | Fonte |
|---|---|
| **Federal** | `https://www2.camara.leg.br/orcamento-da-uniao/leis-orcamentarias/loa` |
| **Senado — Siga Brasil** | `https://www12.senado.leg.br/orcamento/sigabrasil` |
| **SIOP detalhado** | `https://www.siop.planejamento.gov.br/` |

**O que extrair (por ação orçamentária)**:
- Código da ação (ex: `21AM`)
- Nome
- UO (Unidade Orçamentária) — código + nome
- PT (Programa de Trabalho) completo (estrutura: `função.subfunção.programa.ação.localizador.GND.fonte`)
- Dotação inicial autorizada (R$)
- Fonte de recursos
- Categoria econômica (corrente / capital)
- GND (Grupo de Natureza de Despesa)

### Créditos Adicionais

| Tipo | Instrumento | Quando se usa | Onde se publica |
|---|---|---|---|
| **Suplementar** | Decreto | Reforço de dotação existente | DOU Seção 1 |
| **Especial** | Lei específica | Despesa não prevista na LOA | DOU Seção 1 |
| **Extraordinário** | Medida Provisória | Urgência + imprevisibilidade (art. 167 §3º CF) | DOU Seção 1 |

**Critério constitucional para extraordinários** (STF ADI 4048): "circunstâncias relevantes e imprevisíveis como guerra, comoção interna ou calamidade pública". Crédito extraordinário usado para finalidade previsível é juridicamente questionável.

**Onde buscar**:
- DOU: `https://www.in.gov.br/consulta/-/buscar/dou` — filtrar por Seção 1, data, palavra-chave
- Tesouro Transparente: painel "Créditos Adicionais"
- SIOP: histórico de alterações por ação

### Execução (Empenho → Liquidação → Pagamento)

| Estágio | O que ocorre | Fonte |
|---|---|---|
| **Empenho** | Reserva o recurso para um fornecedor específico após procedimento licitatório | Portal Transparência + DOU Seção 3 |
| **Liquidação** | Verifica que o serviço/bem foi entregue (atesto) | Portal Transparência |
| **Pagamento** | Transferência efetiva ao fornecedor (OB — Ordem Bancária) | Portal Transparência |

**Portal da Transparência — Despesas**: `https://portaldatransparencia.gov.br/despesas` — filtrar por UO + ação + ano.

**Restos a Pagar**: despesas empenhadas mas não pagas no exercício. Painel dedicado no Tesouro Transparente.

## Os 9 indicadores analíticos obrigatórios

Para **cada** ação orçamentária vinculada ao evento, calcular:

| # | Indicador | Fórmula | Sinal de alerta |
|---|---|---|---|
| 1 | `dotacao_inicial_brl` | Valor LOA | — (linha de base) |
| 2 | `creditos_adicionais_brl` | Soma de suplementar + especial + extraordinário | — (linha de base) |
| 3 | `dotacao_atualizada_brl` | (1) + (2) | — (linha de base) |
| 4 | `empenhado_brl` | Soma de empenhos no exercício | — (linha de base) |
| 5 | `liquidado_brl` | Soma de liquidações | — (linha de base) |
| 6 | `pago_brl` | Soma de pagamentos | — (linha de base) |
| 7 | `restos_a_pagar_brl` | (4) − (6) | Acumulação ano-a-ano sem liquidar = descontrole |
| 8 | `taxa_execucao_pct` | (6) / (3) × 100 | < 50% = baixa execução; > 100% = inconsistência |
| 9 | `crescimento_pos_loa_pct` | (2) / (1) × 100 | > 100% = subestimação inicial provável |
| 10 | `concentracao_4t_pct` | empenhado_4T / (4) × 100 | > 60% = "empenho de dezembro" |

(Observação: 10 indicadores no total — o "9" é histórico do nome.)

## Achados típicos (Eixo 9)

1. **Crescimento pós-LOA > 100%** — ação iniciou com R$ 100 mi, virou R$ 250 mi via créditos adicionais durante o exercício.
2. **Crédito extraordinário injustificável** — MP aberta para finalidade previsível, sem caráter de urgência/imprevisibilidade (jurisprudência STF).
3. **Concentração 4T > 60%** — execução concentrada nos últimos 3 meses do exercício, contornando rotinas normais de fiscalização.
4. **Restos a pagar acumulados** — saldo > 50% do empenhado, ano após ano.
5. **Ação criada via crédito especial** — não constava no PPA original, foi criada só para o evento.
6. **Meta física PPA não cumprida vs. execução financeira ~100%** — gastou tudo, entregou pouco.
7. **Divergência LDO vs. LOA** — ação listada como prioridade na LDO recebeu dotação inferior ao previsto.
8. **Mudança de UO no meio do exercício** — recurso transferido entre ministérios via remanejamento (potencial driblar controles).

## Workflow operacional (passo a passo)

### Passo 1 — Mapear ações orçamentárias do evento

```bash
# Via Siga Brasil (interface web, sem API estável)
# 1. Acessar https://www12.senado.leg.br/orcamento/sigabrasil
# 2. Filtros: ano LOA + palavra-chave do evento (ex: "cop30", "olimpíadas", "mundial")
# 3. Exportar lista de ações + UO + dotação
```

Listar **todas** as ações com vinculação direta + indireta (ex: ação geral de infraestrutura usada parcialmente para o evento).

### Passo 2 — PPA backtrack

Para cada ação, identificar o programa do PPA que a abriga:

- Verificar no SIOP a estrutura programática completa
- Localizar no texto da Lei do PPA o objetivo do programa
- Identificar metas físicas e financeiras quadrienais
- **Anomalia**: ação executada sem estar prevista em programa do PPA → crédito especial sem precedente

### Passo 3 — LDO check

- Buscar o anexo de prioridades da LDO do exercício
- A ação aparece como prioridade?
- Há meta fiscal específica?

### Passo 4 — LOA snapshot

Para cada ação: anotar dotação inicial autorizada na LOA do exercício (valor consolidado após sanção, antes de qualquer crédito adicional).

### Passo 5 — Créditos adicionais (busca exaustiva no DOU)

```bash
# Busca DOU por código de ação
curl -A "TransparenciaBR-engines/1.0" \
  "https://www.in.gov.br/consulta/-/buscar/dou?q=%2221AM%22+credito+suplementar&publishFrom=01-01-2025&publishTo=31-12-2025"
```

Para cada decreto/MP/lei: extrair número, data, valor, justificativa, URL DOU.

### Passo 6 — Execução (Portal Transparência)

Para cada ação: baixar todos os empenhos, liquidações, pagamentos do exercício. Agregar por trimestre para calcular concentração 4T.

### Passo 7 — Calcular indicadores

Aplicar as 10 fórmulas acima. Salvar em `acoes_orcamentarias_<slug>.json` (schema canônico na SKILL.md).

### Passo 8 — Replicar para entes estaduais/municipais

Quando o evento envolver execução multi-ente:
- Repetir passos 2-7 para LOAs estaduais (DOE) e municipais (DOM)
- Querido Diário (ver `pix-via-gazetas.md`) ajuda na coleta de gazetas estaduais/municipais

### Passo 9 — Compilar findings Eixo 9

Sweet spot: 5-15 findings Eixo 9 em dossiês de eventos com universo > R$ 1 bi.

## Exemplo de finding Eixo 9 (template)

```json
{
  "id": "F-100",
  "eixo": "EIXO 9 — Ciclo orçamentário (PPA→LDO→LOA→execução)",
  "severidade": "ALTA",
  "classificacao": "Crescimento pós-LOA via créditos adicionais",
  "titulo": "Ação [21AM — Realização da COP30] cresceu [X]% via créditos adicionais durante o exercício 2025",
  "valor_brl": 0,
  "envolvidos": ["[UO responsável]", "[Ministério X]"],
  "executor": "[UO X]",
  "fato": "A LOA 2025 (Lei [Nº]/[2024]) autorizou dotação inicial de R$ [X] mi para a ação [21AM]. Ao longo do exercício, foram abertos [N] créditos adicionais ([Decreto Nº ...], [Decreto Nº ...]), totalizando R$ [Y] mi adicionais — crescimento de [Z]% sobre a dotação inicial. Dotação atualizada chegou a R$ [W] mi.",
  "analise": "Observa-se que o crescimento pós-LOA de [Z]% é estatisticamente atípico (média histórica de crescimento para ações similares: ~15-25%). Os créditos foram abertos majoritariamente no [N]º trimestre. A justificativa registrada nos decretos é [resumo].",
  "contraditorio": "PARTE 1 — A UO [X] foi consultada sobre o motivo da subestimação inicial; manifestação [obtida/não obtida]. PARTE 2 — Ministério do Planejamento foi questionado sobre o controle de subestimação intencional; [resposta]. PARTE 3 — TCU foi questionado se há processo em andamento; [resposta]. Direito de resposta aberto em transparenciabr.org/dossie/<slug>/contestacao",
  "fontes": [
    "https://www2.camara.leg.br/orcamento-da-uniao/leis-orcamentarias/loa/2025 — LOA original",
    "https://www.in.gov.br/...<URL do decreto de crédito adicional>",
    "https://portaldatransparencia.gov.br/...<URL da execução>",
    "https://www12.senado.leg.br/orcamento/sigabrasil/<painel>"
  ]
}
```

## Checklist de validação Fase 3.5

- [ ] Todas as ações orçamentárias vinculadas ao evento listadas
- [ ] Para cada ação: PPA + LDO + LOA + créditos adicionais + execução coletados
- [ ] 10 indicadores calculados por ação
- [ ] Replicação para entes estaduais/municipais quando aplicável
- [ ] Pelo menos 5 findings Eixo 9 quando universo > R$ 1 bi
- [ ] URLs primárias verificáveis para PPA, LDO, LOA, decretos de crédito adicional
- [ ] Cruzamento com Fase 4 (emendas) feito — distinguir dotação regular vs. emendas
- [ ] Contraditório 3-partes em findings ≥ MÉDIA

## Cruzamento com outras Fases

| Fase | Como integra com Fase 3.5 |
|---|---|
| **Fase 4 (Emendas)** | Algumas ações são financiadas por dotação regular + emendas — separar contribuições. Emendas inflam dotação atualizada. |
| **Fase 4.5 (Pix)** | Pix municipal não passa pela LOA federal — é capítulo paralelo no estado/município. |
| **Fase 2 (Contratos)** | Cada empenho de Fase 3.5 deve ter contrato correspondente em Fase 2. |
| **Fase 3 (Controle)** | TCU/CGU frequentemente auditam justamente o ciclo PPA→execução. |
| **Fase 6 (QSA)** | Favorecidos dos empenhos cruzam com QSA + TSE em Eixo 4. |

---

## references/font-setup.md

# Setup de Fontes (DM Sans + Inter)

## Cenário ideal
DM Sans (títulos) + Inter (corpo) instalados via Google Fonts.

```bash
# DM Sans
wget -O /tmp/fonts/DMSans-Regular.ttf  https://fonts.gstatic.com/s/dmsans/v15/...Regular.ttf
wget -O /tmp/fonts/DMSans-Bold.ttf     https://fonts.gstatic.com/s/dmsans/v15/...Bold.ttf

# Inter
wget -O /tmp/fonts/Inter-Regular.ttf   https://fonts.gstatic.com/s/inter/...Regular.ttf
wget -O /tmp/fonts/Inter-SemiBold.ttf  https://fonts.gstatic.com/s/inter/...SemiBold.ttf
wget -O /tmp/fonts/Inter-Bold.ttf      https://fonts.gstatic.com/s/inter/...Bold.ttf
```

## Fallback (quando o sandbox bloqueia Google Fonts CDN)

Use Lato (DM Sans) + Roboto (Inter) já instalados no sistema:

```bash
mkdir -p /tmp/fonts
cp /usr/share/fonts/truetype/lato/Lato-Regular.ttf            /tmp/fonts/DMSans-Regular.ttf
cp /usr/share/fonts/truetype/lato/Lato-Bold.ttf               /tmp/fonts/DMSans-Bold.ttf
cp /usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf  /tmp/fonts/Inter-Regular.ttf
cp /usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Medium.ttf   /tmp/fonts/Inter-SemiBold.ttf
cp /usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Bold.ttf     /tmp/fonts/Inter-Bold.ttf
```

## Validação

Antes de gerar o PDF, sempre validar:

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

for nome, arq in [
    ("DMSans-Regular",  "/tmp/fonts/DMSans-Regular.ttf"),
    ("DMSans-Bold",     "/tmp/fonts/DMSans-Bold.ttf"),
    ("Inter-Regular",   "/tmp/fonts/Inter-Regular.ttf"),
    ("Inter-SemiBold",  "/tmp/fonts/Inter-SemiBold.ttf"),
    ("Inter-Bold",      "/tmp/fonts/Inter-Bold.ttf"),
]:
    try:
        pdfmetrics.registerFont(TTFont(nome, arq))
        print(f"OK {nome}")
    except Exception as e:
        print(f"FALHA {nome}: {e}")
```

## Armadilhas conhecidas

- **TTF corrompido como HTML**: se o sandbox retornou HTML em vez de TrueType (sintoma: `TTFError: Can't open file`), use o fallback Lato/Roboto.
- **Caracteres `\u0000`/`▪`/`▸` no PDF**: trocar por Unicode universal (`•`, `›`) para evitar falhas de glifo.
- **Acentos sumindo**: garantir `encoding='UTF-8'` no Paragraph e usar fontes que suportem latin-extended (Lato/Roboto OK).

---

## references/caso-cop30.md

# Caso de Referência — Dossiê COP30 v1.0

Primeiro dossiê gerado por esta skill (17/06/2026). Use como gabarito quando dúvidas surgirem.

## Números finais

| Métrica | Valor |
|---|---|
| Versão | 1.0 |
| Páginas PDF | 70 |
| Tamanho PDF | 322 KB |
| Findings | 95 (18 CRÍTICA · 41 ALTA · 28 MÉDIA · 8 INFO) |
| Valor mapeado | R$ 6.828.877.251,35 |
| Contratos | 30 |
| Obras geocodificadas | 23 (mapa Leaflet) |
| Procedimentos de controle | 23 (TCU + CGU + MPF + PF) |
| Incidentes | 20 |
| Matérias de imprensa | 194 |
| Doações TSE | 4 |
| Posts redes sociais | 11 |
| Fotos públicas creditadas | 34 |
| Audit `pdftotext` | Zero hits da blocklist |

## Personagens-chave (referência para futuros dossiês de eventos no PA)

**Executivo federal**
- Marina Silva (MMA), Rui Costa (Casa Civil), Renan Filho (MT), Jader Filho (MCidades), Aloizio Mercadante (BNDES), Enio Verri (Itaipu)

**Comissão organizadora**
- André Corrêa do Lago (Presidente COP30)
- Ana Toni (CEO COP30)

**Estado e município**
- Helder Zahluth Barbalho (Gov PA-MDB)
- Hana Ghassan (Vice-gov PA)
- Valdir Ganzer (SEDOP-PA)
- Igor Normando (Prefeito Belém MDB)
- Edmilson Rodrigues (ex-Prefeito Belém PSOL)

**Investigados**
- Antônio Doido (Dep Fed MDB-PA — Operação Igapó)
- Andrea Costa Dantas (esposa de Doido — J.A. Construcons)
- Coronel Francisco Galhardo (PM-PA — preso 04/10/2024)

**Outros**
- Min. Flávio Dino (STF relator)

## Empresas-chave

| Empresa | CNPJ | Status no dossiê |
|---|---|---|
| J.A. Construcons | 22.328.699/0001-56 | Op. Igapó — esposa de parlamentar como sócia |
| Consórcio RMB | 57.155.797/0001-13 | Obras Bacia Una/Tucunduba |
| OEI Brasil | — | Convênios `1AATKM` (R$ 20,7M) + `1AAVWZ` (R$ 478,3M) — TCU TC 003.952/2025-8 |
| Pronto RG / DMDL | — | Sobrepreço 1.000% — TCU Acórdão 7/2026-Plenário (TC 018.100/2025-2) |
| Bemaven | — | Cruzamento contratual |
| Fortes Comércio | — | Cruzamento contratual |
| Ômega Construtora | — | Cruzamento contratual |

## Processos TCU/PF de referência

- **TC 003.952/2025-8** — convênios OEI R$ 478 milhões
- **TC 018.100/2025-2 / Acórdão 7/2026-Plenário** — sobrepreço 1.000% Pronto RG/DMDL
- **Operação Igapó** — PF/PA, prisão de Coronel Galhardo (04/10/2024)

## Lições aprendidas (incorporadas à skill)

1. **Fontes do CDN bloqueadas no sandbox** → criar fallback Lato/Roboto. Ver `references/font-setup.md`.
2. **KPIs longos quebram coluna** → preferir formato compacto (`R$ 6,83 bi` em vez de `6.828.877.251,35`).
3. **Bullets Unicode raros (`▪`, `▸`)** podem virar `\u0000` no PDF → usar `•` e `›`.
4. **Header com offset X muito curto** gruda nome do projeto na descrição → usar pelo menos 5.2 cm.
5. **Larguras de coluna** das tabelas precisam de margem real (mínimo 5.3cm / 3.0cm / 2.2cm para Empresa / Status / Valor).
6. **Emendas parlamentares** são eixo independente, não apêndice de contratos — daí a Fase 4 dedicada.
7. **Sweet spot** real para eventos é 60-120 findings, não 18-25 (esses são para parlamentar individual).
8. **Mapa Leaflet com fotos**: incluir crédito + URL da matéria original no popup.

## Estrutura de diretórios usada (`/home/user/workspace/dossie_cop30/`)

```
dossie_cop30/
├── contratos/
├── emendas/
├── findings/
│   └── findings_cop30.json
├── fontes_oficiais/
├── fotos/
├── imprensa/
├── output/
│   ├── Dossie_COP30_v1-0.pdf
│   ├── findings_cop30.csv
│   └── mapa_cop30.html
├── redes_sociais/
├── compilar_findings.py
├── gerar_csv.py
├── gerar_dossie_cop30.py
└── gerar_mapa.py
```

Replique essa estrutura para qualquer novo dossiê (`dossie_<slug>/`).
