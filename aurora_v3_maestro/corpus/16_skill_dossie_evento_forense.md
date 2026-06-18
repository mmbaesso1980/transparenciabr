---
name: dossie-evento-forense
description: "Compila dossiês forenses completos sobre EVENTOS, MARCOS ou OBRAS ESTRUTURANTES no Brasil — Olimpíadas, Copa, COP30/31, festivais, megaprojetos. Use quando o Comandante Baesso citar evento/marco ('dossiê da COP30', 'investiga Olimpíadas Rio 2016', 'obras do Mundial 2014 em Manaus'). Cobertura: cadastro obras → contratos PNCP/Portal Transparência/DOU → controle TCU/CGU/MPF → emendas parlamentares origem→empenho→liquidação→pagamento → cruzamento TSE/QSA → redes sociais → incidentes → fotos georreferenciadas → PDF padrão TransparênciaBR 1.0 + mapa Leaflet + CSV. Visual teal #01696F + DM Sans/Inter + ReportLab. NÃO usar para parlamentar individual (`dossie-forense-parlamentar`), due diligence (`due-diligence-pro`), ou pipeline AURORA (`aurora-forensic-ops`)."
license: Proprietary
metadata:
  author: TransparênciaBR / Comandante Baesso
  version: '1.3'
  caso_referencia: COP30 v1.2 (107 findings, R$ 6,97 bi, 91 páginas, bloco visual 3 fotos por finding, junho/2026)
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
- `id` (slug), `nome`, `endereco`, `bairro`, `lat`, `lng`, `executor`, `valor_estimado_brl`, `status` (`entregue|em_obras|atrasada|cancelada|desabou|inacabada|parcial`), `descricao`, `fotos[]`.
- Cada **foto** carrega: `url` (imagem direta), `credito` (jornalista/agência), `descricao` (legenda), `tipo` (terrestre/drone/render/cerimônia/incidente), `matricula_fonte` (URL da matéria/página oficial onde a foto foi publicada), e — a partir da v1.3 — **`slot` semântico** (`deveria` / `esta` / `problema`) usado pelo bloco visual da Fase 11.5.
- Geocodificar via endereços oficiais; validar plausibilidade geográfica.
- Coletar fotos de fontes públicas (Agência Pará, G1, CNN, Reuters, ministérios, Presidência, BNDES, agências estaduais, imprensa local auditada).
- **Meta de cobertura**: para obras geocodificadas com finding associado, perseguir 1 foto por slot (`deveria` + `esta` + `problema`) sempre que documentado nas fontes; aceitar 1–2 quando o restante não existir em fonte pública.

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

### Fase 11.5 · **Cards de findings com narrativa visual em 3 fotos** 🆕 v1.3

Cada card de finding cuja `obra_slug` referencia uma obra com fotos no catálogo recebe um bloco visual “Registro fotográfico” com **até 3 imagens reais** em **slots semânticos**:

| Slot | Header | Cor de fundo | Conteúdo esperado |
|---|---|---|---|
| `deveria` | **COMO DEVERIA SER** | teal escuro `#0C4E54` | Render oficial, cerimônia de inauguração, foto de entrega, projeto executível — a promessa institucional |
| `esta` | **COMO ESTÁ** | âmbar `#964219` | Foto do estado atual / obra em andamento / imagem aérea da realidade |
| `problema` | **PROBLEMA OCORRIDO** | crítico `#6B1A4D` | Incidente, atraso documentado, manifestação, falha estrutural, paralisação, operação policial |

**Regras de classificação automática** (heurística em ordem de prioridade):

1. Sinais de problema sempre vencem: `atraso`, `incidente`, `abandonada`, `paralisada`, `desabou`, `inacabada`, `manifestação`, `protesto`, `rachadura`, `vazamento`, `desabamento`, `interditad`, `cancelada`, `denúncia`, `fiscalização` → `problema`.
2. Sinais de promessa/entrega: `inauguração`, `inaugurad[ao]`, `entrega`, `cerimônia`, `render`, `projeto`, `protocolo`, `concluíd`, `finalizad`, `aberto` → `deveria`.
3. Sinais de execução em curso: `em andamento`, `em obra`, `obras`, `montagem`, `construção`, `drone`, `aérea`, `vista`, `fase` → `esta`.
4. Fallback pelo `status` da obra: `entregue` → `deveria`; demais → `esta`.

**Seleção das 3 fotos finais por finding**: privilegia **diversidade** — pega 1 de cada slot quando disponível; preenche sobras na ordem `esta` > `deveria` > `problema`; aceita 1 ou 2 fotos quando faltar conteúdo em fonte pública (não inventa slot vazio).

**Layout do bloco**:
- Tabela 3 linhas × N colunas (N ∈ {1,2,3}):
  - Linha 1: header colorido por slot (CAPS, Inter-Bold 7.5pt, branco)
  - Linha 2: imagem proporcional, altura máxima 3.6cm, largura = larguraCol − 0.2cm
  - Linha 3: legenda (Inter 6.5pt) + crédito (Inter itálico 6pt) + link `host` (Inter 5.8pt, teal escuro, clicável)
- Box + grid finos `BORDER`, padding consistente
- Intro: `<b>REGISTRO FOTOGRÁFICO</b> — {nome da obra}` em teal escuro acima da tabela

**Pipeline de download** (executar antes da geração do PDF):
1. Para cada `obra.fotos[].url`: baixar com `User-Agent: TransparenciaBR-engines/1.0`, timeout 20s.
2. Validar `Content-Type` começa com `image/` — descartar HTML.
3. Normalizar via PIL: `convert('RGB')` + redimensionar para largura máxima 900px + JPG qualidade 82.
4. Salvar em cache determinístico (`hash sha1(url)[:12].jpg`).
5. Anotar `local_path` e `slot` em cópia enriquecida do catálogo (`obras_geo_enriched.json`).

**REGRAS INVIOLÁVEIS do bloco visual** (auditoria):
- Toda foto **deve** mostrar crédito + link da matéria/página origem (não apenas a URL da imagem).
- Nunca inventar slot vazio para preencher — melhor mostrar 1 foto verdadeira do que 3 inventadas.
- Auditoria final (Fase 13) pdftotext deve seguir limpa: o bloco visual não introduz palavras proibidas.
- Findings com `obra_slug=null` (não mapeados ou sem obra) **não renderizam bloco visual** — a função `_render_photos` retorna `[]` silenciosamente.

**Detalhes operacionais**: ver `references/cards-visuais-findings.md`.

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
- `references/cards-visuais-findings.md` — workflow Fase 11.5 com seleção, classificação semântica e layout do bloco visual de 3 fotos por finding (v1.3)
- `references/findings-template.json` — template JSON base
- `references/caso-cop30.md` — caso de referência completo (lições aprendidas)

## Caso de referência

**Dossiê COP30 v1.2** (17/06/2026):
- 107 findings (multi-eixo, severidade distribuída)
- R$ 6,97 bi mapeados
- 30 contratos, 23 obras geocodificadas, 23 procedimentos de controle, 20 incidentes
- 194 matérias de imprensa, 4 doações TSE, 11 posts redes sociais
- **91 páginas PDF · 9,4 MB · audit limpo**
- **28 cards de finding com bloco visual de fotos reais (63 fotos creditadas em 3 slots semânticos)**
- Mapa estático embutido no PDF + inventário das 23 obras + página de assinatura do responsável pela pesquisa
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
- [ ] **Cards de finding com obra associada exibem bloco visual de 1–3 fotos em slots semânticos (v1.3)**
- [ ] **Seleção de slot privilegia diversidade (deveria/esta/problema); não há slot inventado**
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

### 1.3 (17/06/2026) — Cards de findings com narrativa visual
- Nova **Fase 11.5** dedicada ao bloco visual de **até 3 fotos reais** por finding
- Slots semânticos canonizados: `deveria` (teal escuro) / `esta` (âmbar) / `problema` (crítico)
- Heurística de classificação automática por descrição + tipo + status da obra
- Pipeline de download/normalização de fotos (User-Agent `TransparenciaBR-engines/1.0`, PIL JPG q=82, cache por hash sha1)
- Mapeamento `obra_slug` em findings com regra de prioridade (específico antes de genérico)
- Nova reference `cards-visuais-findings.md`
- Caso de referência atualizado para COP30 v1.2 (91 páginas, 28 cards com bloco visual, 63 fotos creditadas no corpo dos findings)

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
