# engines/analysis — Score Engine

Motor de cálculo de risco e roteamento LLM para o pipeline forense TransparênciaBR.

---

## Visão geral do pipeline

```
nota fiscal / contrato / emenda PIX
        │
        ▼
  computeScore(nota)          ← 5 componentes em paralelo (Promise.all)
        │
        ├─ score < 60   → callOllama(nota, 'classificacao_simples')   [1 passada]
        ├─ 60 ≤ s < 85  → callOllama × 2 (auditoria_p1 + auditoria_p2) [2 passadas]
        └─ score ≥ 85   → getVertexMonthlySpent()
                              ├─ gasto < cap  → callVertex(nota)  [Gemini 2.5 Pro / Líder Supremo]
                              └─ gasto ≥ cap  → callOllama fallback (degradação)
                                    │
                                    ▼
                         persistResult(notaId, scoreResult, analysis)
                              ├─ BigQuery: tbr.analysis.score_results
                              └─ GCS: gs://datalake-tbr-clean/analysis/<ano>/<mes>/<id>.json
```

---

## Componentes do score e pesos

| # | Componente | Peso | Fórmula / Fonte |
|---|---|:---:|---|
| 1 | **Anomalia estatística** | 25 | z-score absoluto vs. pares (cargo/UF/mês): `min(100, \|z\| × 30)` — BigQuery `tbr.ceap.notas_fato` |
| 2 | **Padrão repetido** | 20 | `COUNT(DISTINCT cpf_parlamentar) GROUP BY cnpj_fornecedor, mes` — se N ≥ 3: `70 + 10 × min(N-3, 3)` |
| 3 | **Vínculo societário** | 25 | Sócio do fornecedor é servidor/parlamentar/parente — **stub v1 retorna 0** (TODO v2: RAIS × QSA) |
| 4 | **Doc divergente** | 15 | `ocr_confidence`: < 0.5 → 90; < 0.7 → 60; < 0.85 → 30; ≥ 0.85 → 0 |
| 5 | **Denúncia externa** | 15 | CPF/CNPJ em `tbr.dou.atos` (tipo: sancao/condenacao/tac, últimos 24 meses) |

**Score final:** `round((s1×25 + s2×20 + s3×25 + s4×15 + s5×15) / 100)`  
**Intervalo:** 0–100. **Nível:** 1 (baixo, <60) · 3 (médio, 60–84) · 5 (alto, ≥85)

---

## Regras de roteamento LLM

| Score | LLM | Modo | `_llm_used` |
|---|---|---|---|
| < 60 | Ollama local | 1 passada — `classificacao_simples` | `ollama_1p` |
| 60–84 | Ollama local | 2 passadas — `auditoria_p1` + `auditoria_p2` | `ollama_2p` |
| ≥ 85 (cap OK) | Vertex Gemini 2.5 Pro | `gemini-2.5-pro` | `vertex` |
| ≥ 85 (cap atingido) | Ollama local | `auditoria_p2_fallback` | `ollama_fallback` |

**Hard cap Vertex:** monitorado em `tbr.audit.vertex_calls`. Padrão: US$ 95/mês (`VERTEX_MONTHLY_CAP_USD`).

---

## Persistência

### BigQuery — `tbr.analysis.score_results`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | STRING | Identificador da nota fiscal |
| `score` | INT64 | Score final 0-100 |
| `components` | JSON | Subscores por componente |
| `llm_used` | STRING | LLM utilizado |
| `nivel` | INT64 | 1, 3 ou 5 |
| `analise` | JSON | Resultado bruto do LLM |
| `created_at` | TIMESTAMP | UTC |

### GCS

Caminho: `gs://datalake-tbr-clean/analysis/<ano>/<mes>/<id>.json`

---

## Como adicionar um novo componente de score

1. **Implemente a função** em `score_engine.js`:
   ```js
   export async function scoreNovoComponente(nota) {
     // Retorna subscore 0-100
     // Em caso de erro, retorna 0 (nunca propaga exceptions)
   }
   ```

2. **Inclua no `Promise.all`** dentro de `computeScore`:
   ```js
   const [s1, s2, s3, s4, s5, s6] = await Promise.all([
     scoreAnomaliaEstatistica(nota),
     // ...
     scoreNovoComponente(nota),   // ← adicionar aqui
   ]);
   ```

3. **Ajuste os pesos** de modo que a soma dos `pesox` totalize 100:
   ```js
   const finalScore = Math.round(
     (s1 * 20 + s2 * 15 + s3 * 20 + s4 * 15 + s5 * 15 + s6 * 15) / 100
   );
   ```

4. **Adicione o campo em `components`** no objeto de retorno:
   ```js
   components: { ..., novo_componente: s6 }
   ```

5. **Escreva testes** em `score_engine.test.js`:
   - Casos edge: ausência de campos → 0
   - Degradação segura: erro de BQ → 0
   - Valores mínimo/máximo esperados

---

## CLI

```bash
# Nota única
node engines/analysis/score_engine.js --nota <id>

# Lote com query padrão
node engines/analysis/score_engine.js --batch --limit 500

# Lote com query customizada + dry-run
node engines/analysis/score_engine.js \
  --batch "SELECT id FROM tbr.ceap.notas_fato WHERE mes = '2024-01'" \
  --dry-run

# Override de modelo Ollama
node engines/analysis/score_engine.js --nota <id> --model phi3:14b
```

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `GCP_PROJECT` | `transparenciabr` | Projeto GCP |
| `GCS_BUCKET` | `datalake-tbr-clean` | Bucket GCS de saída |
| `OLLAMA_URL` | `http://localhost:11434` | URL do servidor Ollama |
| `OLLAMA_MODEL` | `gemma2:27b-instruct-q4_K_M` | Modelo Ollama padrão |
| `VERTEX_MODEL` | `gemini-2.5-pro` | Modelo Vertex AI (Gemini 2.5 Pro) |
| `VERTEX_SUPREME_AGENT_ID` | `agent_1777236402725` | Agent Builder Líder Supremo (prompt em `callVertex`) |
| `VERTEX_LOCATION` | `us-central1` | Região Vertex AI |
| `VERTEX_MONTHLY_CAP_USD` | `95` | Hard cap mensal Vertex em USD |
| `BATCH_CONCURRENCY` | `10` | Paralelismo máximo no modo batch |
| `LOG_LEVEL` | `INFO` | Nível de log (DEBUG/INFO/WARN/ERROR) |
| `DRY_RUN` | `0` | Se `1`, não persiste resultados |

---

## Testes

```bash
# A partir do diretório engines/
npx vitest run analysis/score_engine.test.js
```

12 describes, 33 casos de teste cobrindo:
- `scoreDocDivergente` boundary values (0.0 até 1.0)
- `scoreVinculoSocietario` stub v1
- `scoreAnomaliaEstatistica` degradação segura
- `computeScore` composição, intervalo, estrutura
- Fórmula de pesos (score 0, 50, 85, 100)
- `callOllama` sucesso, erro HTTP, JSON inválido, prompt inexistente
- `getVertexMonthlySpent` tabela ausente
- `routeAndAnalyze` roteamento score < 60, 60–84, hard cap Vertex

---

## Extensão planejada (v2)

- **`scoreVinculoSocietario`**: cruzamento QSA Receita × RAIS (Base dos Dados `br_me_rais`) × `tse.bens_declarados`. Score proporcional: parente = 80, servidor = 60, parlamentar = 90.
- **Cache Redis**: evitar re-query BQ para mesmos `cnpj_fornecedor` no mesmo mês.
- **Fila Pub/Sub**: ingestão de novas notas dispara processamento automático via trigger.
