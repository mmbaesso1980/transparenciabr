FROM python:3.10-slim

WORKDIR /app

# Copy the entire repository context into the container
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir Flask reportlab google-cloud-storage

# The command to run the service, pointing to the correct path
CMD exec python3 services/pdf_renderer/main.py
