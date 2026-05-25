# Relatório piloto — 200 leads previdenciários (50 × 4 cidades)

**Destinatário:** Comandante Baesso  
**Motor:** AURORA (TransparênciaBR)  
**Repositório:** `mmbaesso1980/transparenciabr`  
**Escopo:** apenas ficheiros e comentários **existentes neste repo** — sem pesquisa web nem endpoints supostos.

---

## 1. Inventário — fontes de PII já implementadas (código)

| Caminho | O que coleta / produz | Endpoint ou destino | Status | Bloqueio / nota |
|--------|------------------------|------------------------|--------|-----------------|
| `functions/src/leads/adapters/bigDataAdapter.js` | Telefones, e-mails, endereço (logradouro, município, UF, CEP) a partir de **CPF** (11 dígitos) | `POST https://plataforma.bigdatacorp.com.br/people` com `Datasets: people_contacts,people_addresses`, `q: doc{CPF}` | **FUNCIONA** se `BIGDATA_TOKEN` (e opcional `BIGDATA_TOKEN_ID`) estiver definido; caso contrário devolve **mock** explícito (`isMock: true`, `mock@example.com`) | Mock **não** serve para piloto real; exige conta BigDataCorp e base legal de tratamento. |
| `functions/src/leads/openContactBigData.js` | Orquestra unlock de lead: lê lead no BQ, anti-desperdício **PJe**, cobrança de créditos, chama BigData | BigQuery `tbr_leads_prev.indeferimentos_brasil_raw` + PJe + BigDataCorp | **NÃO TESTADO** neste repo (integração Cloud Function) | Depende de lead já existente no BQ com CPF; fluxo comercial (créditos), não batch de captação. |
| `functions/src/leads/utils/bqLeadFetcher.js` | Lê `id_hash`, `cpf`, `nome`, `municipio`, `uf`, etc. | BigQuery `` `{proj}.tbr_leads_prev.indeferimentos_brasil_raw` `` | **NÃO TESTADO** | JSDoc assume schema “legado” com `nome`/`municipio`; o loader INSS (`engines/26_…`) usa schema **microdados** (ex.: `aps_nome`, sem `nome` comercial) — risco de desalinhamento DDL ↔ código. `location` nas queries está **`US`** no ficheiro atual — incoerente com dataset `southamerica-east1` (ajustar em PR separado). |
| `functions/src/leads/adapters/pjeAdapter.js` | Indica se há processo judicial **após** indeferimento (anti-desperdício) | `GET {PJE_BASE_URL}/processos` default `https://pje.trf3.jus.br/pje/api/v1` | **QUEBRADO / STUB** sem `PJE_TOKEN` — devolve `reason: token_not_configured` | Não devolve nome completo de cidadão; só decisão de negócio. |
| `functions/src/radar/diarioScanner.js` | Classificação de área legal + análise JSON (Gemini) sobre **texto** do ato | Saída estruturada em memória; persistência feita em `functions/index.js` (`radar_dossiers`) | **FUNCIONA** se `GEMINI_API_KEY` / `GOOGLE_API_KEY` | **Não** extrai CPF nem “polo ativo”; não há neste módulo regex anti-Salete/curador — o fix citado **não está** neste ficheiro. |
| `functions/index.js` (`onDiarioAtoCreated`) | Grava `radar_dossiers` com `trecho_ref`, `url_fonte`, análise Gemini | Firestore `diarios_atos` → `radar_dossiers` | **FUNCIONA** se `RADAR_OWNER_UID` + Gemini | PII só se o **texto** do diário trouxer nomes; não há pipeline batch “50 nomes/cidade”. |
| `engines/26_inss_indeferimentos_bq_load.py` | CPF, data nascimento, sexo, UF, espécie, motivo, datas indeferimento, **APS** (`aps_nome`), hashes | Download XLSX `dados.gov.br` → BigQuery `indeferimentos_brasil_raw` | **FUNCIONA** no desenho do script (HTTP + load) | Comentário no próprio motor: microdados **não trazem telefone**; “nome completo” **não** é campo garantido no schema BQ listado. Cidade = **proxy** por `aps_nome`, não município cadastral. |
| `engines/10_universal_crawler.py` | Texto/PDF de diários oficiais municipais (dispensa/inexigibilidade etc.) | `https://api.queridodiario.ok.org.br/gazettes` (configurável) | **FUNCIONA** como crawler | PII (nomes) pode existir no texto bruto; **não** há extrator estruturado de “nome + DOB” para DirectData no repo. |
| `engines/ingestors/runners/crawl_querido_diario.py` | Idem — gazettes por UF | Querido Diário API v1 | **FUNCIONA** (script) | Idem — sem camada de NER → lead estruturado. |
| `engines/ingestors/runners/crawl_dou_inlabs.py` | DOU (ZIP/JSON/PDF) INLABS ou fallback `in.gov.br` | `https://inlabs.in.gov.br`, `https://www.in.gov.br` | **FUNCIONA** se credenciais INLABS / chave | Idem — sem extração estruturada de leads previdenciários. |
| `engines/17_commercial_radar.py` | Radar B2B: liga diários a PCA PNCP | Firestore `radar_comercial` | **NÃO TESTADO** aqui | Foco institucional/comercial, não cidadão polo ativo. |
| `engines/02_ingest_emendas.py` | Metadados de emendas (autor, `cpfCnpjAutor` quando existir na API) | API CEAP / camada emendas | **FUNCIONA** no pipeline de emendas | PII de **parlamentares/fornecedores**, não de beneficiário INSS. |
| `engines/40_gemma_worker_continuo.py` | Extrai entidades de texto CEAP (JSON com `pessoas`, `cpfs`) | Ollama/Gemma local + BQ CEAP | **FUNCIONA** no desenho | Uso forense CEAP; não é funil INSS cidadão. |
| `tools/aurora/marco/gemma_2k_carpes.py` | Classificação Gemma sobre linhas lidas de XLSX INSS locais | Ficheiros `Beneficios_Indeferidos*.xlsx` em path fixo de VM | **NÃO TESTADO** no CI | Caminhos hardcoded (`/home/manusalt13/...`); não é Cloud Function. |
| `tools/aurora/marco/load_brasil_bq.py` | Carga BQ views `leads_carpes_regiao` etc. | BigQuery `tbr_leads_prev` | **NÃO TESTADO** | Tabelas base (`leads_brasil_base`, …) no DDL **não** têm coluna `nome` — perfil semelhante a microdados anonimizados para produto. |
| `frontend/src/data/leadsPrevidenciario.js` | Dados de UI / copy (inclui referência a PJe “a integrar”) | Front-end estático | **MOCK / PLACEHOLDER** em trechos | Não é fonte primária. |

**DirectData** (`CadastroPessoaFisica`, `RegistrationDataBrazil`): **NÃO IMPLEMENTADA** neste repositório — não há URL, cliente HTTP nem contrato JSON versionado. Qualquer uso na VM deve ser adicionado explicitamente (URLs contratuais + PR) ou chamado por **variáveis de ambiente** com URL completa (ver script).

---

## 2. Fontes públicas mapeadas e ainda não usadas como “motor de lead cidadão”

- **Querido Diário** — vários JSONs em `engines/arsenal_apis.json`, `engines/config/arsenal_apis.json`, `tools/aurora/arsenal_mestre.json`; crawlers `engines/10_universal_crawler.py`, `engines/ingestors/runners/crawl_querido_diario.py`. Uso atual: texto bruto / atos, sem pipeline “nome + DOB → CRM”.  
- **DOU INLABS / in.gov.br** — `engines/ingestors/runners/crawl_dou_inlabs.py`.  
- **Ro-DOU** — referência em `PLANO_MESTRE_V3.md` (GitHub planojr/ro-dou) — **não** há código de ingestão Ro-DOU no repo.  
- **PJe TRF3** — adapter existe; consulta real **pendente** de `PJE_TOKEN` e validação de schema.  
- **DataJud / eSAJ scraping** — **não** localizado como motor implementado neste snapshot do repo (apenas menções de produto em documentação/UI).  
- **DJEN / PDPJ OAuth2** — **não** implementado; alinhado ao contexto operacional fornecido (bloqueio credencial).

---

## 3. Caminho mais curto (1–3 motores) para **50 nomes completos** por cidade

**Conclusão com base só no repo:** não existe hoje um único motor que entregue **nome completo + data de nascimento + vínculo verificável com fonte primária** por cidadão polo ativo nas quatro cidades. Os motores INSS/BQ entregam sobretudo **perfil anonimizado / proxy geográfico (APS)**; BigData entra **depois** do CPF; `openContactBigData` é fluxo **on-demand** com créditos, não mineração em massa.

**Caminho mínimo realista (combinação):**

1. **Motor A — Diário oficial (Querido Diário ou DOU)** na VM com IP BR: indexar gazettes dos municípios/UF alvo (`engines/10_universal_crawler.py` ou runner equivalente) e construir **extrator** (NLP/regras) de menções a pessoas físicas em atos cíveis/administrativos previdenciários, com URL do PDF/HTML como `fonte_primaria_url`. *Isto é a lacuna principal:* o repo **não** contém o extrator pronto para “nome completo + DOB”.  
2. **Motor B — DirectData** (fora do repo até integração): `RegistrationDataBrazil` (nome + sobrenome + DOB → CPF + contatos) e, com CPF, `CadastroPessoaFisica` — **apenas após** URL e contrato estarem definidos em PR ou env.  
3. **Motor C — BigDataCorp** (`bigDataAdapter.js`): enriquecimento **CPF → telefone/e-mail/endereço** com URL já fixada no código.

**Filtro “polo ativo = cidadão”:** não há implementação consolidada tipo “Salete Alves” no `diarioScanner.js`. O script `piloto_200_worker.py` aplica **heurísticas conservadoras** em campos `motivo_indeferimento` / `aps_nome` (exclusão de termos institucionais) — **não** substitui revisão humana nem garante ausência de falso positivo.

---

## 4. Estimativa de esforço (horas-VM) e chamadas DirectData

- **Horas-VM (ordem de grandeza):**  
  - Só extração BQ + BigData (sem minerar diários): **&lt; 1 h** de CPU se a tabela INSS estiver populada e sem throttling.  
  - Se for necessário **minerar Querido Diário** por mês/município até obter 50 perfis verificáveis/cidade: **dezenas a centenas de horas-VM** (PDF, volume, deduplicação, revisão), **fora** do que está automatizado no repo.  

- **DirectData (chamadas):** ordem **O(n)** em candidatos válidos. Limite superior ingénuo **200 × 2 = 400** chamadas (Registration + Cadastro) se cada lead passar pelos dois métodos; na prática depende de taxa de sucesso do primeiro método. **Não** há contador no repo — contrato comercial DirectData é fonte da verdade.

---

## 5. Recomendação final (Cursor → operação)

1. **Primeiro motor a correr na VM:** `engines/26_inss_indeferimentos_bq_load.py` (se ainda faltarem linhas em `indeferimentos_brasil_raw`) **ou** consulta direta a `tbr_leads_prev.leads_brasil_base` / `indeferimentos_brasil_raw` conforme DDL real em produção.  
2. **Segundo:** `scripts/piloto_200_executar.sh` (exporta candidatos por APS + UF, aplica filtros heurísticos, enriquece com **BigData** se `BIGDATA_TOKEN` existir).  
3. **Terceiro (fora do código atual):** integrar DirectData com URLs oficiais e testes de carga **antes** de escalar para 200.

**Comando na VM (IAP) — após merge; na VM, exporte antes `DD_TOKEN`, `TG_TOKEN`, `TG_CHAT` (e opcional `BIGDATA_TOKEN`):**

```bash
gcloud compute ssh aurora-cacador-br --zone=southamerica-east1-a --tunnel-through-iap \
  --command='cd ~/transparenciabr && git fetch origin && git checkout cursor/piloto-200-relatorio && git pull && chmod +x scripts/piloto_200_executar.sh && nohup ./scripts/piloto_200_executar.sh >> /tmp/piloto_200.log 2>&1 &'
```

(Ajuste `~/transparenciabr` para o caminho real do clone. Tokens **não** vão no repositório; se expostos em chat, **revogar e rotacionar**.)

**CSV esperado:** `/tmp/piloto_200_FINAL.csv` com cabeçalho LGPD e colunas pedidas; linhas só onde exista **fonte primária rastreável** (URL do diário ou URL dados.gov / identificador de ato). Células sem dado real ficam vazias com `observacao` explicativa — **sem mock**.

---

### Nota de compliance

- **Não** versionar tokens (Telegram, DirectData, BigData) nem CPF integral em logs.  
- **Base legal** e finalidade constam no cabeçalho CSV gerado pelo script.  
- Diagnóstico jurídico: **exclusivamente** o advogado responsável.
