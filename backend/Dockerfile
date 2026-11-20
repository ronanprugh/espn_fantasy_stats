FROM python:3.11-slim

WORKDIR /app

# psycopg's binary wheel already bundles libpq, so no apt deps needed.
# curl is for the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps in their own layer for build caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend.
COPY . .

# Run as an unprivileged user: the app writes no files, so the code can stay
# root-owned and read-only to it.
RUN useradd --create-home --uid 10001 app
USER app

ENV PORT=8080
EXPOSE 8080

# For local Docker and any host that reads it (Render uses healthCheckPath in
# render.yaml instead). /api/health never touches the database.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/api/health" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
