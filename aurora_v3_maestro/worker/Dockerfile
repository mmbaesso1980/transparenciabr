FROM python:3.11-slim

WORKDIR /app

# Dependências sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY aurora_v3_maestro/corpus/ /opt/maestro/skills/
RUN pip install --no-cache-dir -r requirements.txt

# Copia código + system prompt
COPY maestro_v1.py .
COPY SYSTEM_PROMPT_v1.0.md ./prompts/SYSTEM_PROMPT_v1.0.md

ENV MAESTRO_PROMPT_PATH=/app/prompts/SYSTEM_PROMPT_v1.0.md
ENV PYTHONUNBUFFERED=1

CMD ["python", "/app/maestro_v1.py"]
