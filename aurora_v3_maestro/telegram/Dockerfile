FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY aurora_v3_maestro/telegram/requirements.txt .
COPY aurora_v3_maestro/corpus/ /opt/maestro/skills/
RUN pip install --no-cache-dir -r requirements.txt

COPY aurora_v3_maestro/telegram/listener.py .

EXPOSE 8080

CMD ["uvicorn", "listener:app", "--host", "0.0.0.0", "--port", "8080"]
