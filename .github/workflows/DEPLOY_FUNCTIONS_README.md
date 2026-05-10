# Deploy de Cloud Functions — bloqueio de IAM

## Status atual (08/05/2026)

O workflow `deploy_functions.yml` está mantido como `.disabled` porque a
service account usada pelo GitHub Actions (vinculada ao secret
`GCP_SERVICE_ACCOUNT_JSON`) não tem permissão `secretmanager.versions.get`
nos seguintes secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Erro observado em runs recentes (24565198655, 25565025980, 25565017941):

```
Error: Failed to validate secret versions:
- FirebaseError Request to https://secretmanager.googleapis.com/v1/projects/transparenciabr/secrets/STRIPE_SECRET_KEY/versions/latest had HTTP Error: 403
- FirebaseError Request to https://secretmanager.googleapis.com/v1/projects/transparenciabr/secrets/STRIPE_WEBHOOK_SECRET/versions/latest had HTTP Error: 403
```

## Como destravar

No GCP Console (projeto `transparenciabr`):

1. Identificar a service account em `IAM & Admin → Service Accounts` que
   corresponde ao JSON em `GCP_SERVICE_ACCOUNT_JSON`.
2. Em `Secret Manager`, abrir cada secret (`STRIPE_SECRET_KEY` e
   `STRIPE_WEBHOOK_SECRET`) e adicionar a SA como **Secret Manager Secret
   Accessor** (`roles/secretmanager.secretAccessor`).
3. Renomear este arquivo de volta:
   `mv .github/workflows/deploy_functions.yml.disabled .github/workflows/deploy_functions.yml`
4. Push em main. O workflow vai disparar para qualquer commit recente
   que toque `functions/**`.

## Deploy manual provisório (cloud shell autenticado como Comandante)

Enquanto o IAM não é concedido:

```bash
cd functions && npm ci --omit=dev
firebase deploy --only functions:processDossieJob --project transparenciabr
```

## Cloud Functions pendentes de deploy (presentes em main, não em prod)

- `processDossieJob` (Onda 4 — trigger Firestore em `dossie_jobs/{jobId}`)
  arquivo: `functions/src/dossie/processDossieJob.js`
- `getDashboardKPIs` (Onda 16 — cap `top_alvos_preview` e `top_fornecedores_painel`
  elevado de 5 → 50, alimenta Mata UF e Top Fornecedores no painel)
  arquivo: `functions/src/datalake/ceapClassifiedAggregates.js`

  Deploy rápido (Cloud Shell):
  ```bash
  cd functions && npm ci --omit=dev
  firebase deploy --only functions:getDashboardKPIs --project transparenciabr
  ```
