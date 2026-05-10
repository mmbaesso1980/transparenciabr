#!/usr/bin/env bash
# Auditoria v2 — descobrir colunas exatas e contagens reais.
# Cole no Cloud Shell, depois cole o output.

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  AUDITORIA v2 — Schema completo + contagens reais"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "▶ A) tbr_ceap.notas_classificadas_vertex — totais por ano + risco"
bq query --use_legacy_sql=false --format=pretty '
SELECT
  year AS ano,
  COUNT(*) AS notas,
  COUNTIF(LOWER(risco) = "alto") AS alto,
  COUNTIF(LOWER(risco) = "medio" OR LOWER(risco) = "médio") AS medio,
  COUNTIF(LOWER(risco) = "baixo") AS baixo,
  COUNTIF(categoria IS NULL OR categoria = "" OR UPPER(categoria) = "SEM_CATEGORIA") AS sem_categoria,
  ROUND(SUM(vlr_documento), 2) AS valor_total_brl,
  ROUND(SUM(IF(LOWER(risco) = "alto", vlr_documento, 0)), 2) AS valor_alto_brl,
  COUNT(DISTINCT tx_nome_parlamentar) AS parlamentares
FROM `transparenciabr.tbr_ceap.notas_classificadas_vertex`
WHERE year BETWEEN 2023 AND 2026
GROUP BY year ORDER BY year
'

echo ""
echo "▶ B) Colunas de notas_classificadas_vertex que ligam ao roster Câmara"
echo "   (procurar id_deputado / numuloparlamentar / camara_id)"
bq query --use_legacy_sql=false --format=pretty '
SELECT * FROM `transparenciabr.tbr_ceap.notas_classificadas_vertex`
WHERE year = 2025 LIMIT 1
'

echo ""
echo "▶ C) ceap_despesas — schema completo"
bq show --format=prettyjson transparenciabr:transparenciabr.ceap_despesas \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Colunas:'); [print(f\"  {f['name']:35s} {f['type']}\") for f in d.get('schema',{}).get('fields',[])]"

echo ""
echo "▶ D) ceap_despesas — sample 1 row para ver formato real"
bq query --use_legacy_sql=false --format=pretty 'SELECT * FROM `transparenciabr.transparenciabr.ceap_despesas` LIMIT 1'

echo ""
echo "▶ E) Top categorias e top fornecedores REAIS na BQ Vertex 2025"
bq query --use_legacy_sql=false --format=pretty '
SELECT categoria, COUNT(*) qtd, ROUND(SUM(vlr_documento),2) valor
FROM `transparenciabr.tbr_ceap.notas_classificadas_vertex`
WHERE year = 2025
GROUP BY categoria ORDER BY valor DESC LIMIT 15
'

echo ""
echo "▶ F) Quantos parlamentares distintos em ceap_classified/{deputadoId}.jsonl?"
gsutil ls "gs://datalake-tbr-clean/ceap_classified/" 2>/dev/null | grep -E "\.jsonl$" | wc -l

echo ""
echo "▶ G) Sample de uma linha do .jsonl legado (para conferir schema burner)"
SAMPLE=$(gsutil ls "gs://datalake-tbr-clean/ceap_classified/" 2>/dev/null | grep -E "\.jsonl$" | head -1)
echo "   arquivo: $SAMPLE"
gsutil cat "$SAMPLE" 2>/dev/null | head -1 | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(' Keys:', list(d.keys()))" || echo "  (falhou ler)"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Decisão pós-v2:"
echo "  • Se §A mostra >100k notas com risco populado em 2024+2025 →"
echo "    rota: bq extract para JSONL no layout {year}/{id}/notas.jsonl"
echo "  • Se §B mostra coluna id_deputado/cod_parlamentar →"
echo "    o JOIN é direto. Se não, precisa via tx_nome_parlamentar."
echo "═══════════════════════════════════════════════════════════════"
