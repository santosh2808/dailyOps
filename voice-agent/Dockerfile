# D.O.T. AI Lead Assistant Phase 2B — Spyro Fans voice agent ("Ananya").
# Independently deployable: this image has no dependency on the DailyOps
# NestJS backend, frontend, or PostgreSQL. Does not affect any existing
# Docker/EC2/GitHub Actions setup — this Dockerfile only builds this one
# service.

FROM python:3.11-slim

WORKDIR /app

# Keep pip/Python quiet and predictable; disable bytecode caching writes.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Runs as a non-root user.
RUN useradd --create-home --shell /bin/bash voiceagent
USER voiceagent

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,os,sys; \
    port=os.environ.get('VOICE_AGENT_PORT','8000'); \
    sys.exit(0) if urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3).status==200 else sys.exit(1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
