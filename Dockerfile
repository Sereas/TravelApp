FROM python:3.12-slim AS base

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt \
    && playwright install --with-deps chromium

COPY backend/ backend/

RUN chown -R app:app /app
USER app

EXPOSE 8000

# Render and similar hosts set PORT; default 8000 for local Docker.
ENV PORT=8000
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}"]
