"""FastAPI entrypoint for the Gig-grab voice agent.

Cloud Run / Render sets PORT (default 8080). Twilio Media Streams connects to
wss://<service-url>/ws — Twilio strips query strings from the connect URL and
delivers query params + <Parameter> children as `customParameters` in the
first JSON `start` frame, so we read them there.
"""

from __future__ import annotations

import json
import logging
import os
import sys

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

from .agent import AgentConfig, run_agent, run_web_agent
from . import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gig-grab Voice Agent")

# We're reachable at TWO paths because Firebase Hosting proxies
# https://gig-grab.web.app/agent/* to this service WITHOUT stripping the
# /agent prefix. Direct Cloud Run access (if it ever works) hits the
# bare paths. Both work.
HEALTH_PATHS = ["/healthz", "/agent/healthz"]
WS_PATHS = ["/ws", "/agent/ws"]


def _healthz():
    return {
        "service": "gig-grab-agent",
        "status": "ok",
        "version": os.getenv("AGENT_VERSION", "0.0.1"),
    }


for _p in HEALTH_PATHS:
    app.add_api_route(_p, _healthz, methods=["GET"])


@app.websocket("/ws")
async def ws_endpoint_root(websocket: WebSocket):
    await _ws_handler(websocket)


@app.websocket("/agent/ws")
async def ws_endpoint_prefixed(websocket: WebSocket):
    await _ws_handler(websocket)


# Browser-direct mic flow. Auth = the api created the session row (so the
# sessionId existing AT ALL is proof the api authenticated the user) and
# we look up its candidate so the agent can bind to the right context.
# The `language` query param tells the kickoff what language to start in.
@app.websocket("/web-ws")
async def web_ws_endpoint(websocket: WebSocket):
    await _web_ws_handler(websocket)


@app.websocket("/agent/web-ws")
async def web_ws_endpoint_prefixed(websocket: WebSocket):
    await _web_ws_handler(websocket)


async def _web_ws_handler(websocket: WebSocket):
    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(str(websocket.url)).query)
    session_id = (qs.get("sessionId") or [""])[0]
    language = (qs.get("language") or ["en"])[0]
    audience = (qs.get("audience") or ["worker"])[0]

    await websocket.accept()

    if not session_id:
        logger.warning("web-ws connect missing sessionId — closing")
        await websocket.close(code=4400)
        return

    # Verify the session row exists; otherwise reject. This stops random
    # WS clients from spinning up Pipecat pipelines.
    session = await db.fetch_session(session_id)
    if not session:
        logger.warning(f"web-ws unknown session {session_id} — closing")
        await websocket.close(code=4404)
        return

    existing_profile = None
    try:
        existing_profile = await db.fetch_profile_for_session(session_id)
    except Exception:
        logger.exception("web-ws failed to look up existing profile (non-fatal)")

    preferred_name = None
    try:
        preferred_name = await db.fetch_preferred_name_for_session(session_id)
    except Exception:
        logger.exception("web-ws failed to look up preferred_name (non-fatal)")

    cfg = AgentConfig(
        session_id=session_id,
        language=language,
        audience=audience,
        surface="web",
        existing_profile=existing_profile,
        preferred_name=preferred_name,
    )
    logger.info(
        f"web-ws session start: session={session_id} lang={language} "
        f"returning={bool(existing_profile)}"
    )
    try:
        await run_web_agent(websocket, cfg)
    except WebSocketDisconnect:
        logger.info(f"web-ws session disconnected: {session_id}")
    except Exception:
        logger.exception(f"web-ws session crashed: {session_id}")


async def _ws_handler(websocket: WebSocket):
    await websocket.accept()

    # Twilio Media Streams sequence on every connect:
    #   1. {"event":"connected","protocol":"Call","version":"1.0.0"}
    #   2. {"event":"start","start":{"streamSid":"MZ…","callSid":"CA…",
    #         "customParameters":{"sessionId":"…","language":"…","audience":"…"}}, …}
    #   3. {"event":"media", …} — audio frames
    # We consume frames 1 and 2 here so the pipeline starts with the audio stream.
    stream_sid = ""
    session_id = ""
    language = "en"
    audience = "worker"
    inbound = False
    try:
        for _ in range(3):
            msg = json.loads(await websocket.receive_text())
            event = msg.get("event")
            if event == "connected":
                continue
            if event == "start":
                start = msg.get("start", {}) or {}
                stream_sid = start.get("streamSid", "") or ""
                params = start.get("customParameters", {}) or {}
                session_id = params.get("sessionId", "") or ""
                language = params.get("language", "en") or "en"
                audience = params.get("audience", "worker") or "worker"
                inbound = (params.get("inbound", "") or "") == "1"
                break
            logger.warning(f"ws unexpected event before start: {event!r}")
            await websocket.close(code=4400)
            return
        else:
            logger.warning("ws never received start frame")
            await websocket.close(code=4400)
            return
    except WebSocketDisconnect:
        logger.info("ws disconnected before start frame")
        return
    except Exception:
        logger.exception("ws crashed reading start frame")
        await websocket.close(code=1011)
        return

    if not session_id or not stream_sid:
        logger.warning(
            f"ws start missing required fields: session_id={session_id!r} stream_sid={stream_sid!r}"
        )
        await websocket.close(code=4400)
        return

    existing_profile = None
    try:
        existing_profile = await db.fetch_profile_for_session(session_id)
    except Exception:
        logger.exception("ws failed to look up existing profile (non-fatal)")

    preferred_name = None
    try:
        preferred_name = await db.fetch_preferred_name_for_session(session_id)
    except Exception:
        logger.exception("ws failed to look up preferred_name (non-fatal)")

    cfg = AgentConfig(
        session_id=session_id,
        language=language,
        audience=audience,
        inbound=inbound,
        existing_profile=existing_profile,
        preferred_name=preferred_name,
    )
    logger.info(
        f"ws session start: session={session_id} stream={stream_sid} lang={language} "
        f"inbound={inbound} returning={bool(existing_profile)}"
    )
    try:
        await run_agent(websocket, cfg, stream_sid=stream_sid)
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
