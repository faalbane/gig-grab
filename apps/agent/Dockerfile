# Per-deploy image. Heavy deps live in the base image (apps/agent/Dockerfile.base);
# only the app source layers on top here. Per-push agent build/deploy ~1.5–2 min.
#
# Bump the base tag (or rebuild :v1 via the "Build agent base image" workflow)
# when apps/agent/pyproject.toml deps change.

FROM ghcr.io/faalbane/gigrab-agent-base:v1

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src

# --no-deps because the base image already has every runtime dep installed.
# This step just registers gig-grab-agent as an editable package.
RUN pip install -e . --no-deps

# Render injects $PORT (often 10000); main.py honors it.
ENV PORT=8080
EXPOSE 8080

CMD ["python", "-m", "src.gigrab.main"]
