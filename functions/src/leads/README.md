# Módulo Leads/Paywall — TransparênciaBR
**Sprint 1 · Cloud Functions HTTP Callable com Paywall de Créditos**

---

## Estrutura de Arquivos

```
cloud_functions_paywall/
├── index.js                        ← Exports para functions/src/index.js
├── openContactBigData.js           ← Function principal: abertura de contato
├── generateInitialPetition.js      ← Function principal: geração de petição
├── package.json                    ← Dependências novas
├── adapters/
│   ├── bigDataAdapter.js           ← BigDataCorp API (mock se sem token)
│   ├── pjeAdapter.js               ← PJe TRF3 API (stub se sem token)
│   ├── cnpjAdapter.js              ← BrasilAPI CNPJ (gratuito, sem token)
│   └── vertexProAdapter.js         ← Vertex AI Gemini 2.5 Pro + hard-stop
└── utils/
    ├── firestoreCredits.js         ← Transação atômica de cobrança + pricing
    └── bqLeadFetcher.js            ← Busca/atualização de leads no BigQuery
```

---

## Como Integrar ao `functions/src/index.js`

Copiar os arquivos para `functions/src/leads/` e adicionar ao `index.js` principal:

```javascript
// ── Módulo Leads / Paywall ────────────────────────────────────────────────
const leadsPaywall = require('./leads');
exports.openContactBigData      = leadsPaywall.openContactBigData;
exports.generateInitialPetition = leadsPaywall.generateInitialPetition;
```

### Instalar dependências novas

Executar dentro de `functions/`:

```bash
npm install docxtemplater pizzip axios \
  @google-cloud/bigquery @google-cloud/storage @google-cloud/aiplatform
```

---

## Variáveis de Ambiente (Firebase Functions Config)

| Variável              | Obrigatória | Descrição |
|-----------------------|-------------|-----------|
| `BIGDATA_TOKEN`       | Não*        | Token de acesso à API BigDataCorp. **Sem o token, retorna mock.** |
| `BIGDATA_TOKEN_ID`    | Não         | TokenId secundário BigDataCorp (depende do plano contratado) |
| `PJE_TOKEN`           | Não*        | Bearer token PJe TRF3. **Sem o token, retorna stub com `reason: token_not_configured`.** |
| `PJE_BASE_URL`        | Não         | URL base da API PJe TRF3. Default: `https://pje.trf3.jus.br/pje/api/v1` |
| `GCS_BUCKET`          | Não         | Bucket GCS para templates e petições. Default: `tbr-leads-staging` |
| `VERTEX_LOCATION`     | Não         | Região Vertex AI. Default: `us-central1` |
| `GCLOUD_PROJECT`      | Auto        | Injetado automaticamente pelo Firebase Functions runtime |

*Tokens ainda não entregues — adapters operam em modo seguro (mock/stub) até configuração.

### Como configurar (Firebase CLI)

```bash
firebase functions:config:set bigdata.token="SEU_TOKEN_AQUI"
firebase functions:config:set pje.token="TOKEN_PJE_TRF3"
```

Ou via Secret Manager (recomendado para produção):

```bash
gcloud secrets create BIGDATA_TOKEN --replication-policy="automatic"
echo -n "SEU_TOKEN" | gcloud secrets versions add BIGDATA_TOKEN --data-file=-
```

---

## Pricing Inicial — Documento Firestore `/pricing/leads_prev`

Criar manualmente no console Firestore ou via script de seed:

```javascript
// seed_pricing.js
const admin = require('firebase-admin');
admin.initializeApp();
admin.firestore().doc('pricing/leads_prev').set({
  contato_bigdata: 10,   // créditos para openContactBigData
  peticao_initial: 25,   // créditos para generateInitialPetition
  atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
  atualizado_por: 'setup_inicial',
});
```

> **Comandante**: valores sugeridos (10 e 25 créditos). Validar com Carpes antes do go-live.

---

## Schema Firestore — `/lead_unlocks/{oab}_{leadId}`

```javascript
{
  uid: string,              // UID Firebase do advogado que comprou
  leadId: string,           // Hash do lead
  lockKey: string,          // "{OAB}_{leadId}" — chave composta
  oab: string,              // Número OAB normalizado (uppercase)
  tipo: 'contato_bigdata',
  custo: number,            // Créditos debitados
  criadoEm: Timestamp,      // serverTimestamp()
  expireAt: Date,           // TTL: criadoEm + 90 dias (política TTL no Firestore)

  // Dados do contato BigData
  phones: string[],
  emails: string[],
  address: {
    logradouro: string,
    numero: string,
    municipio: string,
    uf: string,
    cep: string
  } | null,

  // Status PJe
  pjeStatus: {
    hasProcessAfterIndeferimento: boolean | null,
    reason: string | null,
    numeroProcesso: string | null,
    isMock: boolean
  },

  // Metadados
  isMock: boolean,
  leadEspecie: string,
  leadUf: string
}
```

### Configurar política TTL no Firestore

No Console GCP → Firestore → TTL → Adicionar política:

- **Collection group**: `lead_unlocks`
- **Timestamp field**: `expireAt`

---

## Schema Firestore — `/transactions/{uid}/log/{txId}`

```javascript
{
  uid: string,
  tipo: 'contato_bigdata' | 'peticao_initial',
  leadId: string,
  lockKey: string,
  custo: number,           // Créditos debitados
  saldoAntes: number,
  saldoDepois: number,
  ts: Timestamp,
  status: 'sucesso'
}
```

---

## Schema Firestore — `/vertex_daily_cap/{YYYY-MM-DD}`

Controle de hard-stop US$50/dia para o Vertex AI:

```javascript
{
  total_usd_spent: number,    // Acumulado do dia (USD)
  ultima_atualizacao: string, // ISO 8601
  modelo: string,             // 'gemini-2.5-pro-preview-05-06'
  projeto: string             // 'transparenciabr'
}
```

> Quando `total_usd_spent >= 50.00`, todas as chamadas ao `generateInitialPetition`
> retornam erro `resource-exhausted` até o próximo dia UTC.

---

## Como Criar o `template_universal.docx`

O template deve ser um arquivo `.docx` padrão do Microsoft Word com os seguintes
**placeholders** exatos (incluindo chaves duplas). O docxtemplater substitui cada
placeholder pelo valor correspondente em tempo de execução.

### Placeholders disponíveis

| Placeholder             | Conteúdo |
|-------------------------|----------|
| `{{ADVOGADO_NOME}}`     | Razão social do CNPJ do advogado |
| `{{ADVOGADO_OAB}}`      | Número da OAB |
| `{{ADVOGADO_CNPJ}}`     | CNPJ formatado (XX.XXX.XXX/XXXX-XX) |
| `{{ADVOGADO_ENDERECO}}` | Endereço público do CNPJ (Receita Federal) |
| `{{LEAD_NOME}}`         | Nome do requerente (BigData) |
| `{{LEAD_CPF}}`          | CPF formatado (XXX.XXX.XXX-XX) |
| `{{LEAD_ENDERECO}}`     | Endereço do requerente (BigData) |
| `{{ESPECIE_NOME}}`      | Código/nome da espécie de benefício |
| `{{MOTIVO_INDEFERIMENTO}}` | Motivo do indeferimento INSS |
| `{{DT_INDEFERIMENTO}}`  | Data do indeferimento (DD/MM/AAAA) |
| `{{TESE_JURIDICA}}`     | Tese principal gerada pelo Vertex AI |
| `{{FUNDAMENTOS}}`       | Lista numerada de fundamentos legais |
| `{{JURISPRUDENCIAS}}`   | Lista numerada de precedentes |
| `{{PEDIDOS}}`           | Lista numerada dos pedidos |
| `{{DATA_HOJE}}`         | Data de geração (DD/MM/AAAA) |
| `{{COMARCA}}`           | Comarca capital da UF do requerente |

### Passos para criação

1. Abrir Word (ou LibreOffice Writer)
2. Estruturar o documento com seções: cabeçalho, qualificação das partes, dos fatos, do direito, dos pedidos, data/assinatura
3. Inserir os placeholders `{{NOME_DO_CAMPO}}` nos locais apropriados
4. Salvar como `.docx` (formato Word 2007+)
5. Fazer upload para GCS:

```bash
gsutil cp template_universal.docx \
  gs://tbr-leads-staging/templates/peticoes/template_universal.docx
```

### Atenção ao usar docxtemplater

- Placeholders devem estar no **mesmo run de texto** (não quebrar entre formatações diferentes)
- Usar **Find & Replace** do Word para inserir os placeholders evita quebras de run
- Testar localmente com `docxtemplater` antes do upload para GCS

---

## Fluxo Anti-Desperdício PJe

```
openContactBigData chamada
         │
         ▼
  PJe_TOKEN configurado?
    │              │
   NÃO            SIM
    │              │
    ▼              ▼
 { null }    Consulta TRF3
  Segue       ────────────
              hasProcess?
                │      │
               SIM     NÃO
                │       │
                ▼       ▼
          Desqualifica  Segue
          no BQ + 409   (cobra)
          (sem cobrar)
```

---

## Pontos de Atenção — Para o Comandante

1. **PJE_TOKEN (CRÍTICO)**: Enquanto o token não for entregue pelo TRF3, o adapter retorna
   `hasProcessAfterIndeferimento: null`, ou seja, **o check anti-desperdício está inativo**.
   Leads com processo ativo no PJe serão cobrados normalmente. Priorizar obtenção do token.

2. **Schema real da API PJe TRF3**: O adapter PJe usa um schema estimado baseado em APIs REST
   padrão de tribunais. Após obtenção do token, **validar os campos reais**
   (`params.classe_judicial`, `params.cpf_parte`, estrutura de `content[].numero`) com a
   documentação oficial do TRF3 antes de ativar em produção.

3. **BigData TokenId**: A API BigDataCorp pode exigir dois campos de autenticação (`AccessToken`
   e `TokenId`). Confirmar com o fornecedor se `BIGDATA_TOKEN_ID` é necessário para o plano
   contratado. O adapter já suporta ambos — basta configurar a env var.
