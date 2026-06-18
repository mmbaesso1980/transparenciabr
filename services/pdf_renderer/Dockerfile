FROM python:3.10-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y git

# Clone the entire repository into the container to have access to all scripts
RUN git clone https://github.com/mmbaesso1980/transparenciabr.git .

# Install Python dependencies
RUN pip install --no-cache-dir Flask reportlab google-cloud-storage

# Copy the service-specific code from the cloned repo into the app directory
# This assumes the service code is in the root of the repo structure.
# Let's adjust to copy from the sub-directory.
COPY services/pdf_renderer/main.py .

# Set the entrypoint
ENV PORT 8080
CMD exec python3 main.py
