---
name: dossie-evento-forense
description: "Compila dossiês forenses completos sobre EVENTOS, MARCOS ou OBRAS ESTRUTURANTES no Brasil — Olimpíadas, Copa, COP30/31, festivais, megaprojetos. Use quando o Comandante Baesso citar evento/marco ('dossiê da COP30', 'investiga Olimpíadas Rio 2016', 'obras do Mundial 2014 em Manaus'). Cobertura: cadastro obras → contratos PNCP/Portal Transparência/DOU → controle TCU/CGU/MPF → emendas parlamentares origem→empenho→liquidação→pagamento → cruzamento TSE/QSA → redes sociais → incidentes → fotos georreferenciadas → PDF padrão TransparênciaBR 1.0 + mapa Leaflet + CSV. Visual teal #01696F + DM Sans/Inter + ReportLab. NÃO usar para parlamentar individual (`dossie-forense-parlamentar`), due diligence (`due-diligence-pro`), ou pipeline AURORA (`aurora-forensic-ops`)."
license: Proprietary
metadata:
  author: TransparênciaBR / Comandante Baesso
  version: '1.0'
  caso_referencia: COP30 v1.0 (95 findings, R$ 6,82 bi, 70 páginas, junho/2026)
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
5. **Emendas Pix** (transferências especiais — Lei 14.116/2020) — Belém/RM e municípios da região.

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

### 1.0 (17/06/2026) — Release inicial
- Skill nascida do dossiê COP30 v1.0
- Pipeline em 14 fases canonizado
- Fase 4 dedicada a emendas parlamentares (origem→empenho→liquidação→pagamento)
- Sweet spot 60-120 findings
- Audit pdftotext obrigatório
- Mapa Leaflet com pinos + fotos públicas creditadas
- Fallback de fontes (Lato/Roboto) quando DM Sans/Inter indisponíveis
