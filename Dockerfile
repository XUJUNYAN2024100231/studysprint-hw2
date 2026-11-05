FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --disable-pip-version-check -r requirements.txt \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home app
COPY --chown=app:app main.py ./
COPY --chown=app:app static ./static

ARG BUILD_REVISION=local
ENV BUILD_REVISION=${BUILD_REVISION}
LABEL org.opencontainers.image.title="StudySprint" \
      org.opencontainers.image.source="https://github.com/XUJUNYAN2024100231/studysprint-hw2" \
      org.opencontainers.image.revision=${BUILD_REVISION}
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD python -c "import json,urllib.request; r=json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=2)); assert r['status']=='ok'"
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
