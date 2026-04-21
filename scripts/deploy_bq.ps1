# Deploy ordenado DDL/views BigQuery — projeto transparenciabr (dataset transparenciabr).
# Pré-requisitos: gcloud/bq autenticados (`gcloud auth application-default login`),
# variável GCP_PROJECT ou GOOGLE_CLOUD_PROJECT, billing ativo na conta de faturação.
#
# Consultas ao projeto público basedosdados exigem billing no projeto que executa a query.
#
# Uso:
#   $env:GCP_PROJECT = "seu-projeto-gcp"
#   .\scripts\deploy_bq.ps1
#
$ErrorActionPreference = "Stop"
$ProjectId = $env:GCP_PROJECT
if (-not $ProjectId) { $ProjectId = $env:GOOGLE_CLOUD_PROJECT }
if (-not $ProjectId) { $ProjectId = $env:GCLOUD_PROJECT }
if (-not $ProjectId) {
  Write-Error "Defina GCP_PROJECT ou GOOGLE_CLOUD_PROJECT com o ID do projeto Google Cloud."
  exit 1
}

$Root = Split-Path -Parent $PSScriptRoot
$SqlDir = Join-Path $Root "sql"

function Invoke-BqSqlFile {
  param([string]$RelativePath)
  $full = Join-Path $SqlDir $RelativePath
  if (-not (Test-Path $full)) {
    Write-Error "Ficheiro em falta: $full"
    exit 1
  }
  Write-Host ">>> $RelativePath" -ForegroundColor Cyan
  $sql = Get-Content $full -Raw -Encoding UTF8
  $sql | bq query --project_id=$ProjectId --use_legacy_sql=false
  if ($LASTEXITCODE -ne 0) {
    Write-Error "bq falhou em $RelativePath (exit $LASTEXITCODE). Verifique credenciais ADC e permissões BigQuery."
    exit $LASTEXITCODE
  }
}

Write-Host "Projeto: $ProjectId" -ForegroundColor Green
Write-Host "Criando dataset transparenciabr (ignorar erro se já existir)..." -ForegroundColor Yellow
bq mk --project_id=$ProjectId --dataset --location=US transparenciabr 2>$null

$order = @(
  "ddl_transparenciabr_core.sql",
  "ddl_ceap_geo_extension.sql",
  "vw_ceap_zscore_roll.sql",
  "benford_audit.sql",
  "vw_alertas_bodes_export.sql",
  "vw_correlacao_gastos_idh.sql",
  "ml_ceap_anomalies_detect.sql"
)

foreach ($f in $order) {
  Invoke-BqSqlFile $f
}

Write-Host "Deploy SQL concluído." -ForegroundColor Green
