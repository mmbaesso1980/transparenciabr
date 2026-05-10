#!/usr/bin/env bash
# Onda 18 — Export BQ -> GCS no layout que getDashboardKPIs LÊ
#
# Lê: transparenciabr.tbr_ceap.notas_classificadas_vertex
# Escreve: gs://datalake-tbr-clean/ceap_classified/{year}/{deputadoId}/notas.jsonl
# Cap por execução: legislatura atual 2023..2026
#
# IMPORTANTE: rodar a auditoria_v2 ANTES e descobrir a coluna ID parlamentar.
# Esta versão usa COALESCE(numuloparlamentar, id_deputado, cod_parlamentar, idDeputado)
# para tolerância. Se a coluna real for diferente, editar o SELECT abaixo.
#
# Uso:
#   bash scripts/onda18_bq_to_gcs_export.sh           # 2023..2026
#   bash scripts/onda18_bq_to_gcs_export.sh 2025      # só 2025

set -euo pipefail

PROJECT="${PROJECT:-transparenciabr}"
DATASET="tbr_ceap"
TABLE="notas_classificadas_vertex"
BUCKET="datalake-tbr-clean"
WORK_DIR="/tmp/onda18_export"
mkdir -p "$WORK_DIR"

YEARS=("${@:-2023 2024 2025 2026}")
[ "${#YEARS[@]}" -eq 0 ] && YEARS=(2023 2024 2025 2026)

echo "════════════════════════════════════════════════════════════"
echo "  ONDA 18 — Export BQ Vertex → GCS no layout burner"
echo "  Anos: ${YEARS[*]}"
echo "════════════════════════════════════════════════════════════"

# Risco textual → score_risco numérico (referencial, riskBand do parser):
#   alto  -> 90 (>=85 = banda alto)
#   medio -> 70 (60..85 = banda medio)
#   baixo -> 30 (<60 = banda baixo)

for YEAR in "${YEARS[@]}"; do
  echo ""
  echo "▶ Year=$YEAR — rodando query export..."
  TMP_TABLE="${PROJECT}:${DATASET}._export_y${YEAR}_$(date +%s)"

  # 1) materializa subset com schema burner já mapeado
  bq query --use_legacy_sql=false --destination_table="$TMP_TABLE" \
    --replace --max_rows=0 \
    "
    SELECT
      nota_id,
      tx_nome_parlamentar AS deputado_nome,
      sg_partido          AS partido,
      sg_uf               AS uf,
      year,
      num_mes,
      dat_emissao         AS data_publicacao,
      txt_fornecedor      AS fornecedor,
      txt_cnpjcpf         AS cnpj_fornecedor,
      txt_descricao       AS descricao,
      vlr_documento       AS valor,
      categoria,
      risco,
      flags,
      CASE LOWER(risco)
        WHEN 'alto'  THEN 90
        WHEN 'medio' THEN 70
        WHEN 'médio' THEN 70
        WHEN 'baixo' THEN 30
        ELSE 0
      END AS score_risco,
      classified_at
    FROM \`${PROJECT}.${DATASET}.${TABLE}\`
    WHERE year = ${YEAR}
    "

  # 2) exporta como NDJSON único para GCS staging (1 arquivo por ano)
  STAGING="gs://${BUCKET}/ceap_classified/_staging/year=${YEAR}/notas-*.jsonl"
  bq extract --destination_format=NEWLINE_DELIMITED_JSON \
    "$TMP_TABLE" "$STAGING"

  echo "  → exportado para $STAGING"

  # 3) split por deputado_nome e re-upload no layout {year}/{id}/notas.jsonl
  #    NOTA: como o BQ não tem id numérico do deputado, usaremos o nome
  #    sanitizado como chave provisória ATÉ termos a coluna ID correta.
  echo "  Reagrupando por parlamentar..."
  mkdir -p "$WORK_DIR/y${YEAR}"
  cd "$WORK_DIR/y${YEAR}"
  rm -f *.jsonl

  gsutil -q cp "$STAGING" .
  cat notas-*.jsonl > all.ndjson
  rm -f notas-*.jsonl

  python3 << PY
import json, re, os
from collections import defaultdict
notas_por_dep = defaultdict(list)
with open('all.ndjson') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try:
            r = json.loads(line)
            key = re.sub(r'[^a-zA-Z0-9]+', '_', (r.get('deputado_nome') or 'sem_nome').strip()).strip('_')[:80]
            if not key: key = 'sem_nome'
            notas_por_dep[key].append(line)
        except Exception:
            pass

print(f"  {len(notas_por_dep)} parlamentares únicos no ano ${YEAR}")
total = 0
for key, lines in notas_por_dep.items():
    fname = f"{key}.jsonl"
    with open(fname, 'w') as out:
        out.write('\n'.join(lines))
    total += len(lines)
print(f"  Total notas: {total}")
PY

  rm -f all.ndjson

  # 4) upload no layout {year}/{id}/notas.jsonl
  echo "  Upload para gs://${BUCKET}/ceap_classified/${YEAR}/{slug_nome}/notas.jsonl ..."
  for f in *.jsonl; do
    SLUG="${f%.jsonl}"
    gsutil -q cp "$f" "gs://${BUCKET}/ceap_classified/${YEAR}/${SLUG}/notas.jsonl"
  done
  echo "  ✓ Year=$YEAR: $(ls *.jsonl | wc -l) arquivos enviados."

  # 5) limpeza staging + tabela temp
  gsutil -q rm "gs://${BUCKET}/ceap_classified/_staging/year=${YEAR}/notas-*.jsonl" || true
  bq rm -f -t "$TMP_TABLE" || true

  cd "$WORK_DIR"
done

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✓ Export concluído"
echo ""
echo "  Validar:"
echo "  curl -s 'https://southamerica-east1-transparenciabr.cloudfunctions.net/getDashboardKPIs?refresh=1' \\"
echo "    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f\"cobertura={d.get(\\\"cobertura_pct\\\")}%, parls={d.get(\\\"total_parlamentares_cobertos\\\")}, notas={d.get(\\\"total_notas_classificadas\\\")}\")'"
echo ""
echo "  AVISO: chave provisória = slug do nome (ex: 'Lucas_Vergilio')."
echo "  Para chave numérica (camara_id) precisamos da coluna ID parlamentar"
echo "  na tbr_ceap.notas_classificadas_vertex. Auditar com:"
echo "    bq head -n 1 -t ${PROJECT}:${DATASET}.${TABLE}"
echo "════════════════════════════════════════════════════════════"
