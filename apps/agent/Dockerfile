# syntax=docker/dockerfile:1.7
#
# Two-stage build tuned for fast Render deploys.
#
# Why two stages: build tooling (gcc, build-essential) is only needed to
# compile a couple of wheels. Keeping it out of the runtime image roughly
# halves the image we push to Render.
#
# Why CPU-only torch: pipecat-ai pulls torch+torchaudio. The default PyPI
# wheels include NVIDIA CUDA libs (~3 GB). We run on Render CPU instances —
# we'd never use the GPU bits. Installing from PyTorch's CPU index trims
# ~3 GB off the image and 3–4 minutes off every build.

# ---------- Stage 1: builder ----------
FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only torch FIRST so subsequent `pip install -e .` resolution
# treats torch+torchaudio as already satisfied and doesn't re-resolve to
# the CUDA wheels.
RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu \
        "torch>=2.4,<2.12" "torchaudio>=2.4,<2.12"

COPY pyproject.toml ./
COPY src ./src

RUN pip install -e .

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1

# Runtime libs only — no compilers.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring the installed packages + our source over from the builder.
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app/src /app/src
COPY --from=builder /app/pyproject.toml /app/pyproject.toml

# Render injects $PORT (often 10000); main.py honors it.
ENV PORT=8080
EXPOSE 8080

CMD ["python", "-m", "src.gigrab.main"]
