FROM python:3.12-slim

# Padrão do repo: ver cloudrun/dossieV1Pipeline/Dockerfile
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080

WORKDIR /app

# Dependências de sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python (cache-friendly: deps primeiro, código depois)
COPY apps/radar-juridico/backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copia código do backend
COPY apps/radar-juridico/backend/src/ /app/src/

EXPOSE 8080

# gunicorn: 1 worker (FastAPI async via uvicorn worker), threads para /healthz paralelo
# Timeout de 120s (queries BQ podem demorar em cold start)
CMD exec gunicorn \
    --bind 0.0.0.0:${PORT} \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --threads 4 \
    --timeout 120 \
    --graceful-timeout 30 \
    src.main:app
