# getDossiePoliticoV3

Cloud Run function (Gen 2) que combina Vertex AI Search (10 datastores tbr-fs2-*)
com Gemini 1.5 Pro (Vertex AI Generative) para gerar dossie factual em PT-BR
sobre politico/empresa, com citacoes ancoradas nas evidencias.

## Deploy via Cloud Run console

1. Console GCP -> Cloud Run -> Deploy container -> Continuously deploy from source
2. Repo: mmbaesso1980/transparenciabr | branch: main
3. Build context: cloudrun/getDossiePoliticoV3/
4. Runtime: Nodejs 20 | Function (entry-point): getDossiePoliticoV3
5. Region: us-central1
6. Memory: 1 GiB | Timeout: 300s
7. Service account: queima-vertex@projeto-codex-br.iam.gserviceaccount.com
8. Env var: VERTEX_PROJECT_ID=projeto-codex-br
9. Allow unauthenticated

## Teste

```
curl "https://getdossiepoliticov3-XXXXX-uc.a.run.app?q=Erika+Hilton"
```
