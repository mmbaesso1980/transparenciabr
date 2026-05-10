#!/usr/bin/env bash
# Auditoria definitiva do estado real do painel — diagnostica por que
# getDashboardKPIs retorna cobertura_pct=1.3% e SEM_CATEGORIA=5787.
#
# Diretiva: CEAP só legislatura atual (2023-2026).
#
# Cole no Cloud Shell autenticado em transparenciabr.

set -e
echo "═══════════════════════════════════════════════════════════════"
echo "  AUDITORIA — Estado real CEAP/Vertex 2023→2026"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "▶ 1) Lake bruto: notas CEAP por ano em gs://datalake-tbr-clean/ceap/"
gsutil ls -l "gs://datalake-tbr-clean/ceap/year=2023/" 2>/dev/null | tail -5 || echo "  (year=2023 vazio ou inexistente)"
gsutil ls -l "gs://datalake-tbr-clean/ceap/year=2024/" 2>/dev/null | tail -5 || echo "  (year=2024 vazio ou inexistente)"
gsutil ls -l "gs://datalake-tbr-clean/ceap/year=2025/" 2>/dev/null | tail -5 || echo "  (year=2025 vazio ou inexistente)"
gsutil ls -l "gs://datalake-tbr-clean/ceap/year=2026/" 2>/dev/null | tail -5 || echo "  (year=2026 vazio ou inexistente)"

echo ""
echo "▶ 2) Output do classify_ceap.js (schema novo, layout vertex/...)"
gsutil ls "gs://datalake-tbr-clean/vertex/ceap_classified/" 2>/dev/null || echo "  (vazio — Onda 15 ainda não rodou)"

echo ""
echo "▶ 3) Output do burner (layout que getDashboardKPIs LÊ)"
echo "   Path esperado: ceap_classified/{ano}/{deputadoId}/notas.jsonl"
gsutil ls "gs://datalake-tbr-clean/ceap_classified/" 2>/dev/null | head -10 || echo "  (raiz vazia)"
echo ""
echo "   Quantos parlamentares por ano (esperado ~600/ano para legislatura atual):"
for YEAR in 2023 2024 2025 2026; do
  COUNT=$(gsutil ls "gs://datalake-tbr-clean/ceap_classified/${YEAR}/" 2>/dev/null | wc -l)
  echo "    ${YEAR}: ${COUNT} parlamentares"
done

echo ""
echo "▶ 4) BigQuery: tbr_ceap.notas_classificadas_vertex (qtd + ano)"
bq query --use_legacy_sql=false --format=pretty --max_rows=20 '
SELECT
  EXTRACT(YEAR FROM DATE(SAFE_CAST(SUBSTR(CAST(data_emissao AS STRING), 1, 10) AS DATE))) AS ano,
  COUNT(*) AS notas,
  COUNT(DISTINCT id_deputado) AS parlamentares,
  ROUND(SUM(valor), 2) AS valor_total_brl,
  COUNTIF(score_risco >= 85) AS notas_alto_risco
FROM `transparenciabr.tbr_ceap.notas_classificadas_vertex`
WHERE EXTRACT(YEAR FROM DATE(SAFE_CAST(SUBSTR(CAST(data_emissao AS STRING),1,10) AS DATE))) BETWEEN 2023 AND 2026
GROUP BY ano
ORDER BY ano
' 2>/dev/null || echo "  (tabela não acessível ou schema diferente — tentar abaixo)"

echo ""
echo "▶ 5) BigQuery: schema da tbr_ceap.notas_classificadas_vertex"
bq show --format=prettyjson transparenciabr:tbr_ceap.notas_classificadas_vertex 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Colunas:'); [print(f\"  {f['name']:30s} {f['type']}\") for f in d.get('schema',{}).get('fields',[])]" \
  || echo "  (bq show falhou)"

echo ""
echo "▶ 6) BigQuery: total ceap_despesas (raw) na legislatura"
bq query --use_legacy_sql=false --format=pretty '
SELECT
  EXTRACT(YEAR FROM DATE(SAFE_CAST(SUBSTR(CAST(data_emissao AS STRING),1,10) AS DATE))) AS ano,
  COUNT(*) AS notas,
  COUNT(DISTINCT id_deputado) AS parlamentares
FROM `transparenciabr.transparenciabr.ceap_despesas`
WHERE EXTRACT(YEAR FROM DATE(SAFE_CAST(SUBSTR(CAST(data_emissao AS STRING),1,10) AS DATE))) BETWEEN 2023 AND 2026
GROUP BY ano ORDER BY ano
' 2>/dev/null || echo "  (falhou)"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Decisão depende dos resultados:"
echo ""
echo "  • Se §3 mostra <50 parls/ano em ceap_classified/{ano}/  →"
echo "    a CF lê de path quase vazio. Fix: reidratar burner OU"
echo "    fazer a CF ler também de tbr_ceap.notas_classificadas_vertex."
echo ""
echo "  • Se §4 mostra 600 parls × 4 anos com score_risco populado →"
echo "    os dados existem em BQ mas a CF lê só GCS. Solução:"
echo "    EXPORT da BQ table para gs://datalake-tbr-clean/ceap_classified/"
echo "    no layout esperado, particionado por ano e id_deputado."
echo ""
echo "  • Se §4 vazia mas §6 cheia → rodar Vertex de fato (Onda 15)."
echo "═══════════════════════════════════════════════════════════════"
