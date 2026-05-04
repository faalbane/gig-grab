"""FastAPI entrypoint for the Gig-grab voice agent.

Cloud Run sets PORT (default 8080). Twilio Media Streams connects to
wss://<service-url>/ws?sessionId=<uuid>&language=<code>.
"""

from __future__ import annotations

import logging
import os
import sys
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

from .agent import AgentConfig, run_agent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gig-grab Voice Agent")


@app.get("/healthz")
async def healthz():
    return {
        "service": "gig-grab-agent",
        "status": "ok",
        "version": os.getenv("AGENT_VERSION", "0.0.1"),
    }


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    qs = parse_qs(urlparse(str(websocket.url)).query)
    session_id = (qs.get("sessionId") or [""])[0]
    language = (qs.get("language") or ["en"])[0]
    audience = (qs.get("audience") or ["worker"])[0]
    if not session_id:
        logger.warning("ws connect missing sessionId — closing")
        await websocket.close(code=4400)
        return
    cfg = AgentConfig(session_id=session_id, language=language, audience=audience)
    logger.info(f"ws session start: {session_id} lang={language}")
    try:
        await run_agent(websocket, cfg)
    except WebSocketDisconnect:
        logger.info(f"ws session disconnected: {session_id}")
    except Exception:
        logger.exception(f"ws session crashed: {session_id}")


def main():
    port = int(os.getenv("PORT", "8080"))
    required = ["DEEPGRAM_API_KEY", "GROQ_API_KEY", "CARTESIA_API_KEY", "DATABASE_URL"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        logger.error(f"Missing required env vars: {missing}")
        sys.exit(1)
    uvicorn.run(app, host="0.0.0.0", port=port, ws_ping_interval=20, ws_ping_timeout=20)


if __name__ == "__main__":
    main()
