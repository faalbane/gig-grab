#!/usr/bin/env bash
# infra/dev-agent.sh — local agent dev loop with ngrok + auto-repointed api.
#
# Iteration cycle: edit apps/agent/src/**, uvicorn auto-reloads, next test call
# hits new code in seconds. No Render deploy needed.
#
# Prereqs:
#   - ngrok 3+ installed and authed (`ngrok config add-authtoken <token>`)
#   - apps/agent venv created with deps:
#       cd apps/agent && python3.12 -m venv .venv && \
#         source .venv/bin/activate && pip install -e .
#   - .env at repo root with DATABASE_URL + AI keys (Render env)
#   - gcloud CLI authed for project gig-grab
#
# Usage:
#   ./infra/dev-agent.sh
# Stop with Ctrl-C — it restores AGENT_WS_URL on the api service to prod.

set -euo pipefail

PORT="${PORT:-8080}"
PROJECT="gig-grab"
REGION="europe-west2"
PROD_AGENT_WS="wss://gig-grab.onrender.com/ws"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
  echo ".env missing at repo root — copy from another machine or rebuild from Secret Manager." >&2
  exit 1
fi

if [[ ! -d apps/agent/.venv ]]; then
  echo "apps/agent/.venv missing — run:" >&2
  echo "  cd apps/agent && python3.12 -m venv .venv && source .venv/bin/activate && pip install -e ." >&2
  exit 1
fi

# Source .env for DATABASE_URL + AI keys
set -a; source .env; set +a

# DATABASE_URL in .env points at the Cloud SQL Auth Proxy (127.0.0.1:5433).
# Make sure the proxy is running, otherwise the agent's first DB write fails.
if ! lsof -i:5433 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Cloud SQL Auth Proxy not running on :5433. Start it first:" >&2
  echo "  /tmp/cloud-sql-proxy gig-grab:europe-west2:gig-grab-db --port 5433 &" >&2
  exit 1
fi

PIDS=()
cleanup() {
  echo "[dev-agent] restoring AGENT_WS_URL to prod ($PROD_AGENT_WS)…"
  gcloud run services update api \
    --region="$REGION" --project="$PROJECT" \
    --update-env-vars="AGENT_WS_URL=$PROD_AGENT_WS" \
    --quiet >/dev/null 2>&1 || true
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo "[dev-agent] done."
}
trap cleanup SIGINT SIGTERM EXIT

# Start uvicorn (background, auto-reload on src changes)
echo "[dev-agent] starting uvicorn on :$PORT (auto-reload)…"
( cd apps/agent && .venv/bin/uvicorn src.gigrab.main:app --reload --port "$PORT" --host 0.0.0.0 ) &
PIDS+=($!)

# Start ngrok (background)
echo "[dev-agent] starting ngrok…"
ngrok http "$PORT" --log stdout >/tmp/ngrok-dev-agent.log 2>&1 &
PIDS+=($!)

# Wait for ngrok API to come up, then grab the public URL
for _ in {1..15}; do
  sleep 1
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import json,sys; t=json.load(sys.stdin)['tunnels']; print(next((x['public_url'] for x in t if x['public_url'].startswith('https://')), ''))" 2>/dev/null || true)
  [[ -n "${NGROK_URL:-}" ]] && break
done

if [[ -z "${NGROK_URL:-}" ]]; then
  echo "[dev-agent] ngrok didn't report a public URL — check /tmp/ngrok-dev-agent.log" >&2
  exit 1
fi

WSS_URL="${NGROK_URL/https/wss}/ws"
echo "[dev-agent] ngrok URL: $NGROK_URL"
echo "[dev-agent] agent WS:  $WSS_URL"

# Repoint api at local agent
echo "[dev-agent] repointing api AGENT_WS_URL → $WSS_URL"
gcloud run services update api \
  --region="$REGION" --project="$PROJECT" \
  --update-env-vars="AGENT_WS_URL=$WSS_URL" \
  --quiet >/dev/null

echo ""
echo "===================================================================="
echo "  Local agent live. Place test calls at https://gig-grab.web.app/start"
echo "  Edit apps/agent/src/** — uvicorn reloads automatically."
echo "  Ctrl-C to stop and restore production AGENT_WS_URL."
echo "===================================================================="
echo ""

# Keep the script alive (ngrok + uvicorn run in background)
wait
