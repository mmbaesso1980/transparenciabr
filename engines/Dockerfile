# Imagem para Cloud Run Jobs — motor A.S.M.O.D.E.U.S. (Python 3.11)
# Build (na raiz do repo): docker build -f engines/Dockerfile -t asmodeus-engines:latest .

FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    GCP_PROJECT=transparenciabr

WORKDIR /app

COPY engines/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY engines /app/engines

WORKDIR /app/engines

# Por defeito apenas valida imports; Scheduler pode sobrepor comando (ex.: python 05_sync_bodes.py).
CMD ["python", "-c", "print('ASMODEUS engines — defina comando no Cloud Run Job'); import lib.project_config as p; print('GCP:', p.gcp_project_id())"]
