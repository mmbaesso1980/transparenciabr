# Mapa Canônico de Secrets — TransparenciaBR

> Atualizado em 2026-04-25. Fonte da verdade para todos os workflows e engines.

## Secrets ativos no GitHub Actions

| Secret (GitHub) | Quem usa | Descrição |
|---|---|---|
| `GCP_SERVICE_ACCOUNT_JSON` | Workflow (step "Preparar credenciais") | JSON da Service Account do GCP. O workflow grava em arquivo temporário e seta `GOOGLE_APPLICATION_CREDENTIALS`. |
| `GCP_PROJECT_ID` | `lib/project_config.py` | ID do projeto GCP/Firebase (`transparenciabr`). |
| `GEMINI_API_KEY` | `lib/genai_client.py` | API Key do Gemini. |
| `CGU_API_TOKEN` | Engine 18 PNCP PCA | Token da API da CGU. |
| `RADAR_OWNER_UID` | Engine 17 Commercial Radar | UID do admin no Firestore. |
| `STRIPE_SECRET_KEY` | Cloud Functions (frontend) | Chave secreta Stripe — nunca exposta ao runner do pipeline. |
| `STRIPE_WEBHOOK_SECRET` | Cloud Functions (frontend) | Segredo de webhook Stripe. |
| `VITE_FIREBASE_API_KEY` | Build frontend (Vite) | Public API Key Firebase. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Build frontend (Vite) | Domínio Auth Firebase. |
| `VITE_FIREBASE_PROJECT_ID` | Build frontend (Vite) | Project ID Firebase (public). |
| `VITE_FIREBASE_STORAGE_BUCKET` | Build frontend (Vite) | Storage bucket Firebase. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Build frontend (Vite) | Sender ID Firebase. |
| `VITE_FIREBASE_APP_ID` | Build frontend (Vite) | App ID Firebase. |
| `VITE_MEASUREMENT_ID` | Build frontend (Vite) | Google Analytics measurement ID. |
| `VITE_BR_PM_TILES_URL` | Build frontend (Vite) | URL de tiles do mapa (PMTiles). |
| `VITE_RADAR_ADMIN_UID` | Build frontend (Vite) | UID admin para UI do Radar. |

## Secrets a remover

| Secret | Motivo |
|---|---|
| `FIREBASE_TOKEN` | Deprecado pelo Firebase CLI; substituído por Service Account. |
| `FIREBSE_TOKEN` | Typo de `FIREBASE_TOKEN` — remover. |
| `GCP_PROJECT` | Duplicado de `GCP_PROJECT_ID` — remover após confirmar que nenhuma engine usa diretamente. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Não deve ser secret; é um caminho de arquivo setado em runtime pelo workflow. |
| `MEASUREMENT_ID` | Duplicado de `VITE_MEASUREMENT_ID` — verificar uso antes de remover. |

## Variáveis de ambiente no runtime dos engines

O workflow injeta as seguintes `env:` para todos os steps:

```
GOOGLE_APPLICATION_CREDENTIALS  → /tmp/gcp_sa_XXXXX.json  (gerado pelo step "Preparar credenciais")
GCP_PROJECT_ID                  → valor de secrets.GCP_PROJECT_ID
GEMINI_API_KEY                  → valor de secrets.GEMINI_API_KEY
CGU_API_TOKEN                   → valor de secrets.CGU_API_TOKEN
RADAR_OWNER_UID                 → valor de secrets.RADAR_OWNER_UID
```

## Padrão de leitura nas engines Python

```python
# NUNCA hardcode IDs ou chaves. Sempre via lib:
from lib.project_config import gcp_project_id, bq_table_fqn
from lib.firebase_app import init_firestore
from lib.genai_client import require_gemini_api_key
```
