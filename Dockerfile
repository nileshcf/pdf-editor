# Root-level Dockerfile for Render (Docker web service).
# Used when the Render service was configured via the dashboard (not render.yaml blueprint).
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

EXPOSE 8000

# Default CORS allowlist — override at runtime via AEROPDF_ALLOWED_ORIGINS env var.
ENV AEROPDF_ALLOWED_ORIGINS=https://proeditorfree.vercel.app

# Render injects $PORT; fall back to 8000 for local docker run
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
