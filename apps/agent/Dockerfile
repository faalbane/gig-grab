FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# System libs Pipecat / numpy / soundfile may want.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src

# Install package deps. We omit [dev] in the deployed image.
RUN pip install --upgrade pip \
    && pip install -e .

# Cloud Run injects $PORT (default 8080). FastAPI/uvicorn binds there.
ENV PORT=8080
EXPOSE 8080

CMD ["python", "-m", "src.gigrab.main"]
