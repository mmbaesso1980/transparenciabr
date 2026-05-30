"""
Cloud Run — radar-juridico-api

Entry point FastAPI para o backend do Radar Jurídico INSS.
Serve como intermediário entre o frontend React e o BigQuery/Firestore,
garantindo que nenhum dado PII bruto chegue ao cliente.

Variáveis de ambiente esperadas:
    GOOGLE_CLOUD_PROJECT    — projeto GCP (ex: transparenciabr)
    BQ_LOCATION             — região BigQuery (default: southamerica-east1)
    FIRESTORE_PROJECT       — projeto Firestore (geralmente igual ao GCP project)
    PJE_TOKEN               — token de advogado para PJe TRF3 (opcional)
    TELEGRAM_BOT_TOKEN      — token Telegram (Secret Manager ou env direto)
    AURORA_ADMIN_TOKEN      — token admin para caminhos A/B do AURORA
    PORT                    — porta HTTP (default: 8080)

Padrão de deploy: Cloud Run gerenciado, southamerica-east1, --no-allow-unauthenticated
(Firebase Hosting rewrite com Identity Platform faz a autenticação por Bearer token)
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Configuração de logging estruturado (Cloud Logging friendly)
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("radar-juridico-api")

# ---------------------------------------------------------------------------
# Constantes de configuração
# ---------------------------------------------------------------------------
GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "transparenciabr")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", GCP_PROJECT)
PORT = int(os.environ.get("PORT", "8080"))

# Padrão estabelecido no repo: região southamerica-east1 para TODOS os datasets
# do pipeline de leads (ver engines/26_inss_indeferimentos_bq_load.py).
# datasets US (transparenciabr, tbr_ceap) NÃO são usados aqui.
BQ_DATASET = "radar_juridico"


# ---------------------------------------------------------------------------
# Lifespan: inicialização e encerramento de clientes singleton
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Inicializa clientes Google Cloud no startup do processo.
    Evita overhead de conexão por request.
    """
    logger.info("Radar Jurídico API iniciando — projeto=%s região=%s", GCP_PROJECT, BQ_LOCATION)

    # TODO(maestro): inicializar clientes singleton aqui:
    #   app.state.bq_client = bigquery.Client(project=GCP_PROJECT, location=BQ_LOCATION)
    #   app.state.fs_client = firestore.Client(project=FIRESTORE_PROJECT)
    #   app.state.firebase_app = firebase_admin.initialize_app()
    #   logger.info("Clientes BigQuery e Firestore inicializados")

    yield

    logger.info("Radar Jurídico API encerrando")
    # TODO(maestro): fechar conexões se necessário


# ---------------------------------------------------------------------------
# Aplicação FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Radar Jurídico INSS — API",
    description=(
        "Backend do Radar Jurídico INSS. "
        "Intermediário entre frontend React e BigQuery/Firestore. "
        "Nenhum dado PII bruto é retornado ao cliente. "
        "Princípio: 'Não denunciamos, mostramos'."
    ),
    version="1.0.0-scaffold",
    docs_url="/docs" if os.environ.get("ENV") != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# CORS — apenas origens confiáveis (Firebase Hosting + localhost dev)
ALLOWED_ORIGINS = [
    "https://transparenciabr.com.br",
    "https://radar-juridico.transparenciabr.com.br",
    "http://localhost:5173",  # Vite dev
    "http://localhost:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Trace-Id"],
)


# ---------------------------------------------------------------------------
# Middleware de autenticação Firebase
# ---------------------------------------------------------------------------
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Verifica Bearer token Firebase em todas as rotas exceto /healthz e /metrics.
    Injeta uid e claims no request.state para uso nas rotas.

    TODO(maestro): implementar verificação real do ID token Firebase:
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(token)
        request.state.uid = decoded['uid']
        request.state.claims = decoded  # inclui 'tier', 'creditos_ilimitados'

    Exemplo esperado de payload do token:
        {
          "uid": "abc123",
          "email": "advogado@escritorio.com.br",
          "tier": "premium",  # free|premium|god_mode
          "creditos_ilimitados": false
        }
    """
    # Rotas públicas (sem autenticação)
    if request.url.path in ("/healthz", "/health", "/metrics", "/"):
        return await call_next(request)

    # TODO(maestro): extrair e verificar Bearer token
    # token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    # if not token:
    #     return JSONResponse({"error": "Autenticação necessária"}, status_code=401)
    # try:
    #     decoded = firebase_auth.verify_id_token(token)
    #     request.state.uid = decoded["uid"]
    #     request.state.claims = decoded
    # except Exception:
    #     return JSONResponse({"error": "Token inválido ou expirado"}, status_code=401)

    return await call_next(request)


# ---------------------------------------------------------------------------
# Rotas — importar dos módulos de rotas
# ---------------------------------------------------------------------------
# TODO(maestro): descomentar após implementar os módulos:
# from src.routes.leads import router as leads_router
# from src.routes.alertas import router as alertas_router
# from src.routes.pje import router as pje_router
# from src.routes.creditos import router as creditos_router
#
# app.include_router(leads_router,    prefix="/leads",    tags=["leads"])
# app.include_router(alertas_router,  prefix="/alertas",  tags=["alertas"])
# app.include_router(pje_router,      prefix="/pje",      tags=["pje"])
# app.include_router(creditos_router, prefix="/creditos", tags=["creditos"])


# ---------------------------------------------------------------------------
# Endpoints de healthcheck (sem autenticação)
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root():
    return {"service": "radar-juridico-api", "version": "1.0.0-scaffold", "status": "ok"}


@app.get("/healthz")
async def healthz(request: Request):
    """
    Readiness probe Cloud Run.
    Verifica dependências mínimas.

    TODO(maestro): implementar checks reais:
        - BigQuery: testar SELECT 1 no dataset radar_juridico
        - Firestore: testar get em radar_juridico_stats/status
    """
    checks = {
        "gcp_project": GCP_PROJECT,
        "bq_location": BQ_LOCATION,
        "bq_dataset": BQ_DATASET,
        # TODO(maestro): adicionar checks reais:
        # "bigquery_ok": await _check_bq(request.app.state.bq_client),
        # "firestore_ok": await _check_fs(request.app.state.fs_client),
    }
    # Scaffold: sempre retorna healthy para não bloquear deploy
    return JSONResponse({"ok": True, "checks": checks}, status_code=200)


@app.get("/health")
async def health(request: Request):
    """Alias de /healthz para compatibilidade com padrão do repo."""
    return await healthz(request)


@app.get("/metrics")
async def metrics():
    """
    Endpoint Prometheus (prometheus_client).

    TODO(maestro): implementar métricas:
        - radar_leads_requests_total (counter, por tier/status)
        - radar_alertas_total (counter, por status)
        - radar_pje_cache_hit_ratio (gauge)
        - radar_creditos_debitados_total (counter)
        - radar_request_duration_seconds (histogram)

    Exemplo:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
    """
    return JSONResponse(
        {"error": "Métricas não implementadas — TODO(maestro)"},
        status_code=503,
    )


# ---------------------------------------------------------------------------
# Handler global de erros não tratados
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Captura exceções não tratadas e retorna 500 sem vazar stack trace ao cliente.
    Log completo no Cloud Logging para debug.
    """
    import traceback
    logger.error(
        "Erro não tratado em %s %s: %s\n%s",
        request.method,
        request.url.path,
        exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        {"error": "Erro interno — verifique Cloud Logging para detalhes"},
        status_code=500,
    )


# ---------------------------------------------------------------------------
# Entry point local (uvicorn / gunicorn)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
