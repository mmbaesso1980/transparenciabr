# Auditoria Externa Gemini — AURORA 360 (2026-05-25)

> **Contexto:** Análise externa feita pelo Gemini sobre o painel AURORA 360
> (não confundir com AURORA Forensic v1.0 / Legião 100). Submetida pelo
> Comandante Baesso em 2026-05-25 às 10:08 BRT como avaliação contraditória
> de um dossiê gerado pelo sistema.
>
> **Veredito Gemini:** ✅ Fatos basilares reais — não há fakes/mocks.
> ⚠️ Roupagem editorializada e dramatizada — viés "alerta crítico" em rotina burocrática.

## 1. Verificação dos Fatos Centrais (Gemini confirmou que são reais)

### F-01 e F-02 — Processo MAPI Consultoria
- **Status:** ✅ REAL
- **Detalhes:** Vereador Guilherme Kilter (Novo-PR) moveu Ação Popular nº
  `1070736-69.2025.4.01.3400` na Justiça Federal do DF questionando uso de
  verbas da Câmara para pagar a empresa MAPI, alegando falta de registro
  na Polícia Federal.

### F-54 — Decisão Judicial
- **Status:** ✅ REAL
- **Detalhes:** Juíza federal Adverci Rates Mendes **indeferiu** o pedido
  de liminar em julho de 2025, afirmando que naquela fase preliminar não
  havia provas suficientes de lesão ao patrimônio público.

### F-36 — Polêmica dos Maquiadores (Secretários Parlamentares)
- **Status:** ✅ REAL
- **Detalhes:** Em junho de 2025, parlamentares da oposição (Luciano Zucco
  entre eles) acionaram o Conselho de Ética e o MPF (com desdobramentos
  no TCU) questionando nomeação de **Ronaldo Hass** e **Índy Montiel**
  (que também atuam como maquiadores) como secretários parlamentares.
  A deputada se defendeu publicamente afirmando que eles exercem funções
  políticas regulares no gabinete.

### Dados de CNPJ e Emendas
- **Status:** ✅ REAL
- **Detalhes:** Os cruzamentos societários (nomes de empresas, datas de
  abertura, valores recebidos) refletem raspagem de dados reais (OSINT)
  das APIs da Câmara, Receita Federal e Portal da Transparência.

## 2. Crítica Metodológica (Aplicar na v1.1)

### 🔴 Viés "Anomalia" vs Rotina Burocrática

> "O sistema (AURORA 360) aplica um tom de 'investigação criminal' a dados
> que, na esmagadora maioria das vezes, refletem a rotina burocrática de
> Brasília."

**Exemplo citado pelo Gemini:**
- Apontar como "Circuito Financeiro de Severidade Alta" o fato de vários
  deputados do PSOL usarem a mesma agência de viagens ou a mesma gráfica
  → **estatisticamente comum**: partidos e bancadas costumam compartilhar
  fornecedores de confiança por conveniência logística, não sendo
  necessariamente um indício de fraude.

**Ação v1.1:**
- Adicionar regra de reclassificação em `criterios_reclassificacao` da skill v1.0:
  ```
  REGRA-FP-BANCADA: Se fornecedor é compartilhado por ≥3 deputados da
  mesma bancada (mesmo partido OU mesma frente parlamentar), severidade
  baixa para INFO. Marcar como "fornecedor-bancada" no campo `subtipo`.
  ```

### 🔴 Lei de Benford / Z-score em Contratos Recorrentes

> "Se um gabinete tem um contrato fixo de R$ 8.700 mensais, o algoritmo
> vai gritar 'anomalia matemática' simplesmente porque o mesmo número
> se repete, quando na verdade é apenas um contrato de prestação de
> serviço recorrente."

**Ação v1.1:**
- Antes de aplicar Benford/Z-score, classificar despesas por tipo:
  - `CONTRATO_RECORRENTE` (mesmo CNPJ + mesmo valor ≥3 meses consecutivos
    com variação ≤2%) → **NÃO aplicar testes estatísticos**, apenas
    auditoria de razoabilidade
  - `DESPESA_AVULSA` → aplicar Benford/Z-score
- Adicionar campo `tipo_despesa` no schema CEAP findings.

### 🟡 Contraditório Existe, Mas Visual Continua "Alerta Crítico"

> "O documento tem o mérito de incluir a seção 'Contraditório' logo abaixo
> de cada apontamento, onde ele mesmo admite que muitas dessas práticas
> são prerrogativas legais e constitucionais do mandato."

**Ação v1.1:**
- Quando contraditório indica prerrogativa constitucional/legal, severidade
  máxima permitida = MÉDIA (nunca ALTA/CRÍTICA).
- Cor visual desses findings: amarelo institucional (#964219 sobre
  #FCEBD9) em vez de vermelho (#7A1B4A sobre #F8D4E2).

## 3. Resumo do Gemini

> "O relatório é uma varredura de dados impressionante e real, mas usa
> uma roupagem de 'Alerta Crítico' para eventos que muitas vezes são
> apenas a política operando dentro de suas regras normais. Ele serve
> como um excelente mapa de auditoria, mas não deve ser lido como uma
> sentença de culpa."

## 4. Implicações para AURORA Forensic v1.0 (Já Mergeado em #233)

- ✅ **Não bloqueia o deploy v1.0** — fatos verificados, tom já é INFORMATIVO
- ✅ **Princípio 3 v1.0 já obriga contraditório 3-partes** em todos os agentes
- ⚠️ **v1.1 deve incorporar:**
  1. Regra FP-BANCADA (fornecedor compartilhado por bancada)
  2. Classificação `CONTRATO_RECORRENTE` antes de Benford/Z-score
  3. Cap de severidade em MÉDIA quando contraditório aponta prerrogativa legal

## 5. Próximos Passos

- [ ] Abrir issue no repositório: `feat(skill-v1.1): incorporar auditoria
      externa Gemini — anti-falso-positivo bancada + contratos recorrentes`
- [ ] PR separada após validação do deploy v1.0 em produção
- [ ] Re-rodar dossiês Erika/Kim com v1.1 para comparar findings antes/depois

## Fonte

- Análise direta do Gemini (sessão Comandante Baesso, 2026-05-25 10:08 BRT)
- Vídeo CNN citado pelo Gemini sobre polêmica dos secretários parlamentares
  (referência adicional para F-36)
