# Ocean Ways — Backend Dockerfile
# Base: Python 3.11 slim (consistente com TBR Cloud Run)
# Target: Cloud Run · southamerica-east1 · projeto-codex-br
#
# Build: docker build -f apps/oceanways/backend/Dockerfile -t oceanways-api .
# Run:   docker run -p 8080:8080 --env-file .env oceanways-api
#
# TODO (Maestro):
#   - Adicionar build arg para distinguir dev/prod (DISABLE_DOCS em prod)
#   - Considerar multi-stage build se dependências de compilação forem necessárias
#   - Adicionar HEALTHCHECK para Cloud Run

FROM python:3.11-slim

# Metadados
LABEL maintainer="maestro-orchestrator@transparenciabr.app"
LABEL app="oceanways-api"
LABEL version="0.1.0-r1-scaffold"

# Não rodar como root
RUN addgroup --system oceanways && adduser --system --ingroup oceanways oceanways

WORKDIR /app

# Dependências do sistema (mínimas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependências Python
COPY apps/oceanways/backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Código da aplicação
COPY apps/oceanways/backend/src/ ./src/
# TODO: copiar também o search-engine como pacote Python:
# COPY apps/oceanways/search-engine/src/ ./search_engine/

# Permissões
RUN chown -R oceanways:oceanways /app
USER oceanways

# Cloud Run usa PORT env var (default 8080)
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8080

# TODO (Maestro): ajustar workers conforme CPU alocada ao Cloud Run
# 1 CPU → 1 worker; 2 CPU → 2-4 workers
CMD ["uvicorn", "src.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "1", \
     "--log-level", "info"]
