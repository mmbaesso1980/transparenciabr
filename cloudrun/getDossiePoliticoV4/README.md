# getDossiePoliticoV4

Cloud Run HTTP service em Python para gerar Dossiê Aurora (tom investigativo + compliance) com Gemini 2.5 Pro e dados públicos do BigQuery.

## Endpoint

- `GET /?q=<nome_parlamentar>`
- `GET /healthz`

## Variáveis de ambiente

- `VERTEX_PROJECT_ID` (default: `projeto-codex-br`)
- `BQ_PROJECT_ID` (default: `transparenciabr`)
- `BQ_DATASET` (default: `transparenciabr`)
- `GEMINI_MODEL` (default: `gemini-2.5-pro`)

## Execução local

```bash
pip install -r requirements.txt
python main.py
```

## Observações

- O texto do dossiê segue tom investigativo forte, sem acusação direta.
- O prompt força disclaimer de presunção de inocência e direito de resposta.
- Se dados de custo por voto TSE/pesquisas 2026 não estiverem no payload, o modelo deve declarar indisponibilidade explicitamente.
