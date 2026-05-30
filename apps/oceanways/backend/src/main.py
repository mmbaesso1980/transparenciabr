"""
Ocean Ways — FastAPI Entry Point
=================================
Serviço principal da API Ocean Ways.
Deploy: Cloud Run · southamerica-east1 · projeto-codex-br

Configuração de environment (via Secret Manager em produção):
  FIREBASE_PROJECT_ID       — ex: projeto-codex-br
  OCEANWAYS_BQ_DATASET      — ex: oceanways
  OCEANWAYS_FIRESTORE_DB    — ex: (default)
  STRIPE_WEBHOOK_SECRET     — ex: whsec_...
  MP_ACCESS_TOKEN           — MercadoPago access token
  ALLOWED_ORIGINS           — ex: https://oceanways.transparenciabr.web.app

TODO (Maestro):
  1. Implementar middleware de autenticação Firebase (ver auth.py)
  2. Implementar rate limiter por UID e por IP (slowapi ou custom)
  3. Adicionar integração Sentry ou Cloud Error Reporting
  4. Configurar Cloud Armor / WAF no Cloud Run service para proteção DDoS
  5. Adicionar health check endpoint com ping ao Firestore e BQ
"""

import os
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes.search import router as search_router
from routes.auth import router as auth_router
from routes.credits import router as credits_router
from routes.alerts import router as alerts_router
from routes.payments import router as payments_router

# ---------------------------------------------------------------------------
# Structured logging — saída JSON para Cloud Logging
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Ocean Ways API",
    description="Agregador de award flights para programas de fidelidade.",
    version="0.1.0-r1-scaffold",
    docs_url="/docs",         # Desabilitar em produção: docs_url=None
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_allowed_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,https://oceanways.transparenciabr.web.app"
)
allowed_origins = [o.strip() for o in _allowed_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
API_V1 = "/api/v1"

app.include_router(auth_router,     prefix=f"{API_V1}/auth",     tags=["auth"])
app.include_router(search_router,   prefix=f"{API_V1}/search",   tags=["search"])
app.include_router(credits_router,  prefix=f"{API_V1}/credits",  tags=["credits"])
app.include_router(alerts_router,   prefix=f"{API_V1}/alerts",   tags=["alerts"])
app.include_router(payments_router, prefix=f"{API_V1}/payments", tags=["payments"])

# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root():
    """Endpoint raiz — usado pelo Cloud Run health check."""
    return {"service": "oceanways-api", "status": "ok", "version": app.version}


@app.get("/healthz", include_in_schema=False)
async def healthz():
    """
    Health check detalhado.
    TODO (Maestro): pingar Firestore e BigQuery; retornar 503 se indisponível.
    """
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    log.error("unhandled_exception", error=str(exc), path=str(request.url))
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": "Erro interno. Tente novamente."},
    )


# ---------------------------------------------------------------------------
# Startup / shutdown lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    """
    TODO (Maestro):
      - Inicializar firebase_admin app com credentials do Secret Manager
      - Criar BigQuery client e verificar acesso ao dataset
      - Criar Firestore client
      - Logar versão e configuração (sem secrets)
    """
    log.info("oceanways_api_starting", version=app.version)


@app.on_event("shutdown")
async def shutdown_event():
    log.info("oceanways_api_shutdown")
