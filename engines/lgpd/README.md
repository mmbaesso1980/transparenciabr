# LGPD Anonymizer — engines/lgpd/

Motor de anonimização de PII que roda na **VM Soberania** entre o bucket GCS bruto e qualquer chamada a LLM (local ou remoto). Implementa as regras do doc mestre §3.3 (`projeto_soberania_arquitetura.md`).

---

## Posição na cadeia de processamento

```
[ingestor universal] → gs://datalake-tbr-raw/ → [anonymizer.js] → gs://datalake-tbr-clean/ → [LLM]
```

Nenhum documento com PII civil chega a um modelo de linguagem sem passar por este motor.

---

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `LGPD_SALT` | **Sim** | — | Segredo para HMAC-SHA256 dos CPFs. Deve ser longo (≥ 32 chars) e guardado no Secret Manager. |
| `DATALAKE_BUCKET_RAW` | Não | `datalake-tbr-raw` | Bucket de origem (PII bruta). |
| `DATALAKE_BUCKET_CLEAN` | Não | `datalake-tbr-clean` | Bucket de destino (PII anonimizada). |
| `GOOGLE_APPLICATION_CREDENTIALS` | Não | ADC padrão GCP | Caminho para service account JSON. |
| `LOG_VERBOSE` | Não | não definida | Habilita logs de nível DEBUG. |

---

## Como rodar

### Instalação

```bash
cd engines
npm install   # @google-cloud/storage já incluído no package.json
```

### Execução normal

```bash
# Processa até 500 blobs do prefixo cgu/contratos/2026/05
LGPD_SALT="$(gcloud secrets versions access latest --secret=lgpd-salt)" \
node engines/lgpd/anonymizer.js \
  --input cgu/contratos/2026/05 \
  --limit 500

# Processa todo o prefixo de uma fonte específica
LGPD_SALT="$SALT" \
node engines/lgpd/anonymizer.js --input tcu/acordaos/2026
```

### Dry-run (lista o que faria, sem gravar)

```bash
LGPD_SALT="$SALT" \
node engines/lgpd/anonymizer.js \
  --input cgu/contratos/2026 \
  --limit 100 \
  --dry-run
```

### Testes unitários

```bash
cd engines
npx vitest run lgpd/anonymizer.test.js
# ou
npm test -- lgpd/anonymizer.test.js
```

---

## Política de PII — regras de anonimização

| Categoria | Regex / Gatilho | Ação |
|---|---|---|
| **CPF civil** (não-político) | `\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b` | Hash HMAC-SHA256 com `LGPD_SALT` → `cpf_h_<16 hex chars>` |
| **CNPJ privado** | `\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b` | Hash HMAC-SHA256 → `cnpj_h_<16 hex chars>` |
| **Telefone** | `\(?\d{2}\)?\s?9?\d{4}-?\d{4}` | Mascara últimos 4 dígitos → `****` |
| **E-mail pessoal** | `[a-z0-9._%+\-]+@(?!gov\|leg\|jus\|mp\.br)...` | Substitui local-part → `***@dominio.com` |
| **CID médico** | `[A-Z]\d{2}(\.\d)?` **quando** doc contém `consulta\|exame\|hospital\|clínica\|tratamento\|laudo\|prontuário` | `[CID-REDACTED]` |
| **Endereço residencial** | `Rua\|Av\.\|Avenida\|Travessa\|Praça` + número | `[ENDERECO-REDACTED]` (preserva UF/cidade) |

### Exceções — mantidos em claro (informação pública por lei)

| Categoria | Motivo legal | Fonte de lista |
|---|---|---|
| CPFs de **parlamentares e políticos** | Lei 12.527/2011 (LAI) — mandato é cargo público | `gs://datalake-tbr-raw/_meta/politicos_publicos.json` |
| CNPJs de **fornecedores em contratos públicos** | Art. 8º LAI — contratos públicos são públicos | `gs://datalake-tbr-raw/_meta/fornecedores_publicos.json` |
| E-mails `*.gov.br`, `*.leg.br`, `*.jus.br`, `*.mp.br` | Endereços institucionais de servidores públicos | Filtro de regex (não precisa de lista) |

---

## Como adicionar um novo CPF público à lista

1. **Baixe a lista atual:**
   ```bash
   gsutil cat gs://datalake-tbr-raw/_meta/politicos_publicos.json > /tmp/politicos.json
   ```

2. **Edite o arquivo** adicionando o CPF (apenas dígitos, sem formatação):
   ```json
   ["12345678901", "98765432100", "11122233344"]
   ```
   > Use somente dígitos. O motor normaliza automaticamente (`replace(/\D/g, '')`).

3. **Faça upload de volta:**
   ```bash
   gsutil cp /tmp/politicos.json gs://datalake-tbr-raw/_meta/politicos_publicos.json
   ```

4. **Reinicie o anonymizer** (o cache de entidades públicas é carregado apenas uma vez por execução):
   ```bash
   LGPD_SALT="$SALT" node engines/lgpd/anonymizer.js --input <prefix> --limit 1 --dry-run
   # deve logar: lista_publica_carregada com total_set atualizado
   ```

O mesmo processo se aplica a CNPJs em `_meta/fornecedores_publicos.json`.

---

## Idempotência

O motor compara o hash SHA-256 do conteúdo bruto com o hash armazenado nos metadados do blob clean. Se coincidirem, o blob é ignorado (`status: skip_idempotente`). Isso permite re-executar o batch sem reprocessar documentos não modificados.

---

## Auditoria — manifest GCS

Cada blob processado gera um registro em:

```
gs://datalake-tbr-clean/_lgpd_manifests/<ano>/<mes>/<timestamp>_<hash_pfx>.json
```

Exemplo de conteúdo:

```json
{
  "timestamp": "2026-05-01T10:30:00.000Z",
  "raw_path": "cgu/contratos/2026/05/run_20260501T103000_p1.json",
  "hash_raw_prefix": "3a7f2b1c9e4d8a06",
  "redacoes": {
    "cpf_hash": 3,
    "cnpj_hash": 1,
    "telefone_mask": 2,
    "email_mask": 0,
    "cid_redacted": 0,
    "endereco_redacted": 1
  },
  "motor": "lgpd/anonymizer.js@1.0.0"
}
```

O manifest **nunca** contém o dado original — apenas metadados de contagem.

---

## Arquitetura interna

```
anonymizer.js
├── BLOCO 1   Constantes e validação de ambiente (LGPD_SALT obrigatório)
├── BLOCO 2   Clientes GCS (bucketRaw, bucketClean)
├── BLOCO 3   Cache de entidades públicas (loadPublicEntities)
├── BLOCO 4   Regex de PII (cpf, cnpj, telefone, email, cid, endereco)
├── BLOCO 5   Funções atômicas (hashCpf, maskTelefone, maskEmail)
├── BLOCO 6   anonymizeText() — anonimiza uma string
├── BLOCO 7   anonymizeValue() / anonymizeObject() — recursivo em JSON
├── BLOCO 8   Idempotência por hash de conteúdo
├── BLOCO 9   processBlob() — processa um arquivo do GCS
├── BLOCO 10  gravarManifest() — auditoria no GCS
├── BLOCO 11  processBatch() — lista + processa N blobs com semáforo
├── BLOCO 12  Semaphore — worker pool interno (10 paralelas, sem p-limit)
├── BLOCO 13  log() — JSON estruturado compatível Cloud Logging
├── BLOCO 14  imprimirTabelaFinal() — sumário legível do batch
└── BLOCO 15  main() — CLI via parseArgs
```

---

## Referências

- Doc mestre: `projeto_soberania_arquitetura.md` §3.3
- Versão Firestore: `engines/09_lgpd_shield.py`
- Versão pipeline: `engines/22_lgpd_shield.py`
- Lei Geral de Proteção de Dados: Lei 13.709/2018
- Lei de Acesso à Informação: Lei 12.527/2011
