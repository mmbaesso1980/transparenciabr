#!/usr/bin/env bash
# Exporta até 20 linhas mais recentes de indeferimentos por cidade (proxy: aps_nome + uf).
# Uso: ./scripts/leads_por_cidade.sh <slug> <UF> [ficheiro_saida.csv]
# Ex.: ./scripts/leads_por_cidade.sh valinhos SP leads_valinhos.csv
set -euo pipefail

SLUG_RAW="${1:?slug cidade (ex: valinhos, vitoria, campinas, belem)}"
UF="${2:?UF (ex: SP, ES, PA)}"
OUT="${3:-}"

PROJECT="${GCP_PROJECT:-transparenciabr}"
LOC="${BQ_LOCATION:-southamerica-east1}"

SLUG=$(echo "$SLUG_RAW" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')
if [[ ${#SLUG} -lt 3 ]]; then
  echo "slug inválido" >&2
  exit 1
fi
UFU=$(echo "$UF" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z')
if [[ ${#UFU} -ne 2 ]]; then
  echo "UF inválida" >&2
  exit 1
fi

TMP_QUERY="$(mktemp)"
trap 'rm -f "$TMP_QUERY"' EXIT

cat >"$TMP_QUERY" <<SQL
-- Motor AURORA — export técnico (dados abertos INSS, sem PII inventada)
DECLARE p_slug STRING DEFAULT '${SLUG}';
DECLARE p_uf STRING DEFAULT '${UFU}';

SELECT
  t.mes_referencia,
  t.cpf,
  t.dt_nascimento,
  t.sexo,
  t.uf,
  t.especie_codigo,
  t.especie_nome,
  t.motivo_indeferimento,
  t.dt_indeferimento,
  t.dt_der,
  t.aps_codigo,
  t.aps_nome,
  t.source_file,
  t._row_hash
FROM \`${PROJECT}.tbr_leads_prev.indeferimentos_brasil_raw\` AS t
WHERE UPPER(t.uf) = p_uf
  AND STRPOS(LOWER(CAST(t.aps_nome AS STRING)), p_slug) > 0
ORDER BY t.dt_indeferimento DESC
LIMIT 20;
SQL

HDR=$'# TransparênciaBR — motor AURORA — triagem INSS (dados abertos)\n# Base legal: LGPD art. 7º IX | art. 11 II g | descadastro: contato@transparenciabr.com.br\n'

if [[ -n "$OUT" ]]; then
  {
    printf '%b' "$HDR"
    bq query --use_legacy_sql=false --project_id="$PROJECT" --location="$LOC" --format=csv --max_rows=21 <"$TMP_QUERY"
  } >"$OUT"
  echo "Escrito: $OUT"
else
  printf '%b' "$HDR"
  bq query --use_legacy_sql=false --project_id="$PROJECT" --location="$LOC" --format=csv --max_rows=21 <"$TMP_QUERY"
fi
