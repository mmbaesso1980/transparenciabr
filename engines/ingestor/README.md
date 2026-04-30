# Universal Ingestor — TransparenciaBR

Núcleo do pipeline de ingestão do Data Lake. Lê configurações YAML de fontes,
dispara coleta paginada/streaming, **normaliza** dados (encoding, decimal BR,
datas BR, headers) e **anonimiza** (LGPD), gravando no GCS soberano em 3 layers:

- `gs://datalake-tbr-raw/`        — imutável, sem normalização, auditoria forense
- `gs://datalake-tbr-clean/`      — normalizado + anonimizado, NDJSON consultável
- `gs://datalake-tbr-quarantine/` — registros corrompidos com metadados de erro

## Estrutura

```
engines/
├── utils/logger.js                    # Logger JSONL
├── lgpd/anonymizer.js                 # Mascara CPF/RG/tel/email/CEP
├── normalizer/
│   ├── normalizer.js                  # Encoding + headers + tipos + quarantine
│   └── csv_parser.js                  # Parser CSV robusto (delimiter detect, aspas)
└── ingestor/
    ├── universal_ingestor.js          # Núcleo (3 estratégias)
    ├── package.json
    ├── sources/
    │   ├── ceap_camara.yaml           # CEAP Câmara (CSV ZIP, 2008-presente)
    │   ├── emendas_parlamentares.yaml # Emendas RP6-9 (CGU API key)
    │   └── emendas_pix.yaml           # Emendas PIX (Transferegov, PostgREST)
    └── README.md
```

## Setup

```bash
cd engines/ingestor
npm install
```

## Uso

### CEAP Câmara (sem auth)
```bash
node universal_ingestor.js --source ceap_camara --year 2024
```

### Emendas PIX (sem auth)
```bash
node universal_ingestor.js --source emendas_pix --year 2024
```

### Emendas Parlamentares (CGU — requer API key)
```bash
# 1. Cadastrar email em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
# 2. Exportar token recebido por email:
export PORTAL_TRANSPARENCIA_API_KEY="seu-token-aqui"

node universal_ingestor.js --source emendas_parlamentares --year 2024
```

### Sprint noturno (todas as fontes, todos os anos)
```bash
bash scripts/run_overnight.sh
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `GCS_RAW_BUCKET` | Bucket do raw layer (default: `datalake-tbr-raw`) |
| `GCS_CLEAN_BUCKET` | Bucket do clean layer (default: `datalake-tbr-clean`) |
| `GCS_QUARANTINE_BUCKET` | Bucket de registros corrompidos (default: `datalake-tbr-quarantine`) |
| `PORTAL_TRANSPARENCIA_API_KEY` | Token CGU (Emendas Parlamentares) |
| `LOG_LEVEL` | DEBUG \| INFO \| WARN \| ERROR (default: INFO) |

## Pipeline de tratamento (pós-ingestão)

Os CSVs/JSONs do gov.br trazem 5 problemas clássicos. O ingestor trata todos antes de gravar no `clean`:

| # | Problema | Solução |
|---|---|---|
| 1 | Encoding ISO-8859-1 / Latin-1 | `chardet` detecta + `iconv-lite` converte para UTF-8 |
| 2 | Headers com acentos / camelCase / `Nº`, `°` | `normalizeFieldName` → snake_case ASCII puro |
| 3 | Vírgula decimal `1.234,56` | regex BR → number `1234.56` (US também suportado) |
| 4 | Datas `DD/MM/YYYY` ou `DD/MM/YY` | converte para ISO `YYYY-MM-DD` |
| 5 | Nulls literais `—`, `-`, `N/A`, `nulo`, `sem informação` | viram `null` JSON |

Registros que falham validação (ex: `required` ausente após coerção) vão para `quarantine` com:
- `original` (registro raw)
- `normalized` (parcial)
- `issues[]` (lista de erros)
- `raw_hash` (SHA256 truncado p/ auditoria)

## Anonimização LGPD

Todo registro passa pelo `anonymizeObject()` antes do `clean`:
- Mascara: CPF, RG, telefone, email, CEP
- Preserva: nome de agentes públicos, partido, cargo, valores, CNPJ de fornecedor
- Base legal: STF ARE 652.777 + LAI Lei 12.527 + LGPD art. 7º §3º

O raw layer **NÃO** é anonimizado (versão imutável de auditoria, acesso restrito).

## Estratégias suportadas

| Tipo | Como funciona | Exemplo |
|---|---|---|
| `csv_yearly_file` | Baixa CSV/ZIP por ano (URL template `{year}`) | CEAP Câmara |
| `rest_paginated` | Pagina via `?pagina=N` até retorno vazio | Portal Transparência |
| `postgrest` | Pagina via header `Range`; filtros eq./in. | Transferegov |

## Adicionando novas fontes

1. Crie `sources/<nome>.yaml` no padrão das existentes
2. Defina `type` (uma das 3 estratégias)
3. Configure `fetch_config` com URL template, headers, paginação
4. Rodar: `node universal_ingestor.js --source <nome> --year <year>`
