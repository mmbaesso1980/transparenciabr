# Padrões Aprendidos — v1.0 Maestro (mai/2026)

Lições destiladas dos casos Erika Hilton v3.5.1, Paulo Octávio v2.3 (Alta Inteligência) e auditoria externa.

## 1. Arquitetura "Alta Inteligência" do finding card (Kroll/FTI tier)

Toda observação analítica ≥ MÉDIA usa 7 camadas visuais empilhadas. Esta é a assinatura visual TransparênciaBR a partir do v2.3.

### Layer-by-layer

| Layer | Conteúdo | Estilo |
|---|---|---|
| **1. Header bar** | `F-XX` · Título · Severity Badge | bg TEAL_DARK #0C4E54, badge colorida por severidade |
| **2. Metadata Strip** | Eixo · Classificação · idx/total | bg conforme severidade, altura 4mm |
| **3. Timeline Bar** | Fato Gerador · Janela Prescricional | bg TEAL_LIGHT #E6F1F1 + amarelo claro #FFF7E6 |
| **4. Key Point Bullet** | ▸ PONTO-CHAVE em prosa executiva | bg #FAFAF7, border colorida 3pt esquerda |
| **5. Analytical Body** | Detalhamento + Análise Técnica densa | corpo Inter 9pt justified |
| **6. Contraditório Box** | 3 partes (judicial + público + institucional) | bg #F5F4EF quote box |
| **7. Source Citation Box** | URLs primárias com marker `›` em TEAL_DARK | bg branco, font Inter 8pt |

**Implementação ReportLab**: cada card é um `KeepTogether([elements...])` para evitar quebra. Não usar atributo `align=` dentro de tag `<font>` — usar `alignment=TA_RIGHT` no ParagraphStyle.

**Trap conhecido**: o glyph `▸` (U+25B8) não está no subset da fonte Inter padrão e pdftotext extrai como `\u0000`. Usar `›` (U+203A) como marker de fonte primária.

## 2. Sumário Esquematizado obrigatório (a partir do v2.3)

Antes da Matriz de Findings, sempre incluir:

1. **Heatmap visual**: tabela 9 eixos × 5 colunas (CR/AL/MD/IN/Total), cores plenas CRITICAL_BG/HIGH_BG/MEDIUM_BG/LOW_BG, células zero como `—` em cinza claro #BDB9B0, linha de TOTAL CONSOLIDADO em bg TEAL_LIGHT com borda superior 1.2pt
2. **Legenda inline** de 4 chips (CRÍTICA / ALTA / MÉDIA / INFO) com fundos coloridos
3. **Tabela detalhada**: Eixo · # Findings · Janela temporal · Leitura analítica curta (1 linha)

Carregar dados de `heatmap.json` separado. Estrutura: lista de dicts com `eixo_id`, `eixo_nome`, `total`, `critica`, `alta`, `media`, `info`, `janela`.

## 3. Os 9 Eixos canônicos

Toda finding ≥ v2.3 carrega campo `eixo` com um destes IDs:

| ID | Nome |
|---|---|
| EIXO_1_PESSOAL_ELEITORAL | Pessoal & Eleitoral |
| EIXO_2_SOCIETARIO | Rede Societária & Sucessão |
| EIXO_3_JUDICIAL | Contencioso Judicial |
| EIXO_4_FISCAL_TRIBUTARIO | Passivo Fiscal & Tributário |
| EIXO_5_CEAP_EMENDAS | CEAP & Emendas Parlamentares |
| EIXO_6_PNCP_CONTRATOS | PNCP & Contratos Públicos |
| EIXO_7_BENFORD_ESTATISTICA | Anomalia Estatística (Benford/Z) |
| EIXO_8_REGULATORIO_PATRIMONIAL | Regulatório & Patrimonial |
| EIXO_9_OUTROS | Observações Diversas |

## 4. Cases-âncora de pricing (RESERVADO — uso interno do Maestro)

Estes são os 4 pontos de calibração de mercado que sustentam a faixa R$ 25-45k para dossiês TransparênciaBR de alto perfil:

### Case 1 — CPI Petrobras → Kroll (Brasil, 26/03/2015)
- **Ticket**: R$ 1.068.000 (£226 mil) sem licitação
- **Contratante**: Câmara dos Deputados (CPI Petrobras)
- **Escopo**: identificar dinheiro desviado no exterior, Lava Jato
- **Fonte**: https://g1.globo.com/politica/operacao-lava-jato/noticia/2015/03/cpi-contrata-empresa-por-r-1-milhao-para-identificar-dinheiro-desviado.html

### Case 2 — Kroll Project Montague (Moçambique, 24/06/2017)
- **Ticket**: USD 2 bi auditados, ~USD 700k de honorários estimados
- **Contratante**: Embaixada da Suécia em Maputo
- **Escopo**: dívidas ocultas USD 2 bi, identificou USD 683-714M de sobrepreço + USD 200M taxas
- **Fonte**: https://university.open.ac.uk/technology/mozambique/sites/www.open.ac.uk.technology.mozambique/files/files/Mozambique_373_24June2017_Kroll-report-summary&comment.pdf

### Case 3 — FTI Indiana IEDC Forensic Review (EUA, out/2025)
- **Ticket**: ~USD 3-8M estimado (forense estadual padrão)
- **Contratante**: Indiana Economic Development Corporation
- **Escopo**: 45 findings forenses em revisão de programa econômico
- **Fonte**: https://www.iedc.in.gov/docs/default-source/iedc-assets/fti-consulting-iedc-forensic-review-report_10.02.2025.pdf

### Case 4 — Kroll Brasil DD pricing público (Business Screen, 2025)
- **Faixa**: básica R$ 800-1.6k, enhanced R$ 3.3-6.5k, comprehensive R$ 8-16k
- **Fonte**: https://www.businessscreen.com/resources/how-much-does-a-due-diligence-background-check-cost

### Conclusão de pricing TBR
- **Avulso**: R$ 25-45k (defensável por entregar 2x findings de FTI Indiana)
- **Piso**: R$ 15-18k
- **Revshare**: 40-55% sobre ticket cliente
- **Recorrente**: R$ 10k/mês + R$ 8k/dossiê
- **Argumento de venda**: CPI pagou R$ 1M+ à Kroll por 1 investigação política — TBR cobra 2-5% disso por dossiê com profundidade equivalente.

## 5. Reescrita "Alta Inteligência" — guia de tom

Cada finding ≥ MÉDIA deve ter:

1. **Ponto-Chave (lead executivo)**: 3-5 linhas que respondem "o que aconteceu, quando, onde, quem cita". Linguagem descritiva, zero verbos imputativos.
2. **Análise Técnica densa**: contextualização processual/societária/normativa. Sempre incluir "presunção de inocência aplica-se integralmente" para ações em tramitação.
3. **Contraditório 3-partes**: PARTE 1 (decisão judicial) → PARTE 2 (manifestação pública/defesa) → PARTE 3 (direito de resposta institucional com URL transparenciabr.org/dossie/<slug>/contestacao).
4. **Fontes Primárias Rastreáveis**: cada URL precedida por `›` em TEAL_DARK. Formato: "VeículoOuÓrgão · DD/MM/YYYY · URL completa".

## 6. Anti-patterns aprendidos (NUNCA fazer)

| Anti-pattern | Por quê | Correção |
|---|---|---|
| Citar "BigQuery" / "vw_*" / "fato_emenda_pagamento" no PDF | Infra interna, não fonte primária | Citar "Portal da Câmara · CEAP via API Dados Abertos" |
| Verbos "fraudou/desviou/roubou/corrupto" | Imputação direta — risco jurídico | "Registra-se", "Observa-se", "Consta", "Réu em" |
| CPF visível em texto claro | Violação LGPD Classe B/C | `***.XXX.XXX-**` ou `[DADO PROTEGIDO POR LGPD]` |
| Findings sem URL primária | Não-rastreável, fere regra 1.0 | Toda finding precisa de pelo menos 1 URL clicável verificável |
| try/except: pass em worker VM | Engole exceções, gera arquivos vazios | Sempre logar em `errors/<key>.err` com `type(e).__name__` + status HTTP |
| Glyph `▸` (U+25B8) em ReportLab | Subset Inter não tem | Usar `›` (U+203A) ou `▶` (U+25B6 — verificado) |
| `<font align="right">` | Tag inválida no paraparser | `ParagraphStyle(alignment=TA_RIGHT)` |
| Mock ou fake data em qualquer nível | Bloqueio automático | Se não souber, retornar `null` |

## 7. Lessons learned operacionais (Direct Data + VM)

- **Endpoint Direct Data v3 OK**: `ReceitaFederalPessoaJuridica`, `BeneficiarioFinal`, `ProcessosJudiciaisSimplificada`, `CadastroPessoaFisicaPlus`
- **Endpoint Direct Data v3 OBSOLETO (404)**: `QuadroSocietarioReceitaFederal`, `PGFNListaDevedores`, `ProtestosCenprot` — validar antes de orquestrar lote
- **VM bug conhecido**: try/except sem log no worker `aurora-cacador-br` gravava 0 bytes silenciosamente. Sempre validar `find -size 0 -name "*.json"` pós-execução.
- **Sandbox > VM para até 30 alvos**: curl direto do sandbox/Cloud Run é mais rápido que VM (sem cold-start de container). VM se justifica em jobs longos (>1h) ou processamento em série de >100 alvos.
- **pkill armadilha**: `pkill -f <script>` dentro de `gcloud --command` mata a própria SSH. Usar PID file ou filtro `-U $USER`.

## 8. Estilo de comunicação com o Comandante OPERADOR

- Tratar sempre como "Comandante OPERADOR", português formal
- Tom INFORMATIVO, nunca alarmista — "Não denunciamos. Mostramos."
- Quando o Comandante valida algo, gravar a lição em `memory_update` para internalização permanente
- Quando o Comandante critica ("isso ficou solto", "achei pitfall"), reabrir o item em modo de aprimoramento profundo — não defender o trabalho anterior
- Quando uma ação é irreversível, sempre `confirm_action` ou snapshot Firestore antes
- Resumos finais em listas + tabelas markdown, com headers ##/### concisos (<6 palavras)
- NUNCA citar nomes de tools internas (Goetia, Asmodeus) em mensagens públicas
- Cite skill quando aplicar regra: "(transparenciabr-lei §regras invioláveis)"
