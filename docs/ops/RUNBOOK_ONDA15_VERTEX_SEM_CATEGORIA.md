# Runbook Onda 15 — Eliminar SEM_CATEGORIA (5.787 notas)

**Status:** pronto para disparo manual
**Owner:** Comandante (Cloud Shell autenticado)
**Estimativa:** 30–90 min de wallclock, R$ 3–6 em Vertex
**Saída esperada:** `top_categorias_risco` deixa de exibir `SEM_CATEGORIA: 5787` no painel

## Contexto

Após a Onda 12, o card "Pulso CEAP" mostra **5.787 notas em SEM_CATEGORIA** —
todas as notas classificáveis por Aurora ainda não passaram pelo Vertex.
A infraestrutura já existe (`engines/vertex/classify_ceap.js` + `scripts/run_vertex.sh`);
só faltou disparar para os anos correntes (2024/2025/2026).

## Pré-condições

- Cloud Shell aberto no projeto `transparenciabr`
- ADC válido: `gcloud auth application-default login`
- Vertex AI API habilitada
- Permissões: `aiplatform.user`, `storage.objectAdmin` em `datalake-tbr-clean`

## Disparo (3 linhas)

```bash
cd ~/transparenciabr
git pull origin main
bash scripts/run_onda15_ceap_classify.sh 2024 2025 2026
```

O script:
1. Lê notas CEAP de `gs://datalake-tbr-clean/ceap/year=YYYY/*.ndjson`
2. Envia em batches de 50 ao Gemini 2.5 Flash via Vertex REST API
3. Persiste resultados a cada 1.000 notas em
   `gs://datalake-tbr-clean/vertex/ceap_classified/year=YYYY/snapshot=YYYY-MM-DD/`
4. Gera `summary.json` com distribuição por categoria

## Smoke pós-execução

```bash
# Confirma os artefatos no lake
gsutil ls "gs://datalake-tbr-clean/vertex/ceap_classified/year=*/snapshot=$(date +%Y-%m-%d)/"

# Inspeciona a distribuição (esperado: TRANSPORTE_AEREO, COMBUSTIVEL etc dominando)
gsutil cat "gs://datalake-tbr-clean/vertex/ceap_classified/year=2025/snapshot=$(date +%Y-%m-%d)/summary.json"

# Força refresh do cache da CF (TTL 5min, ou hit direto invalida)
curl -s "https://southamerica-east1-transparenciabr.cloudfunctions.net/getDashboardKPIs?refresh=1" \
  | jq '.top_categorias_risco'

# Visual: abrir painel
echo "https://transparenciabr.web.app/painel"
```

## Critério de sucesso

- `top_categorias_risco[0].categoria != "SEM_CATEGORIA"`
- `top_categorias_risco` distribui em pelo menos 5 categorias da taxonomia
- `notas_por_faixa_risco.alto > 0`
- `valor_alto_risco_brl > 0`

## Plano B — falha de IAM/quota

Se o ADC não tiver acesso ao bucket `datalake-tbr-clean`, conceder via:
```bash
gcloud projects add-iam-policy-binding transparenciabr \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/storage.objectAdmin"
```

Se Vertex der 429 (quota), reduzir BATCH_SIZE para 20:
```bash
node classify_ceap.js --year 2025 --batch-size 20
```

## Notas

- O script é idempotente por snapshot date — re-rodando no mesmo dia
  sobrescreve `parte-final.ndjson`. Para forçar re-classificação, basta
  apagar `gs://datalake-tbr-clean/vertex/ceap_classified/year=*/snapshot=YYYY-MM-DD/`.
- A classificação respeita a Diretiva Vertex Calibrada: apenas texto
  público (descrição da nota + nome do fornecedor) vai para o modelo.
  Inferências de QSA × TSE × laranjagem permanecem nos motores
  determinísticos locais.
