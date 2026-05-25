FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIPELINE_DIR=/app/manus_office/dossie_v1 \
    PORT=8080

WORKDIR /app

# Dependências de sistema (fontes ReportLab + curl para healthcheck local).
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python primeiro (cache-friendly).
COPY cloudrun/dossieV1Pipeline/requirements.txt /app/requirements-job.txt
RUN pip install --no-cache-dir -r /app/requirements-job.txt

# Copia toda a árvore necessária (manus_office com pipeline + agentes + skill + fonts).
# Inclui: dossie_v1/agents/revisores/ (6 agentes v1.1) e dossie_v1/pipeline/review_phase.py
COPY manus_office /app/manus_office
COPY cloudrun/dossieV1Pipeline/main.py /app/main.py

# Garante que o gerar_dossie_v1.py encontra as fontes (script tem path hardcoded
# /tmp/erika_pdf/fonts — montamos symlink no entrypoint).
RUN mkdir -p /tmp/erika_pdf && ln -s /app/manus_office/dossie_v1/fonts /tmp/erika_pdf/fonts

EXPOSE 8080

# gunicorn com 1 worker (jobs longos, paralelismo interno via asyncio).
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 8 --timeout 3600 main:app
