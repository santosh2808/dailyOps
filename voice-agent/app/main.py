"""D.O.T. AI Lead Assistant — Phase 2B. Spyro Fans voice agent ("Meera").

Entry point: a small FastAPI app exposing
  - GET  /health           liveness probe (Step 14)
  - WS   /ws/exotel         the Exotel Voicebot Applet's bidirectional
                             media stream (Step 8/9) — this is the URL
                             configured as VOICE_AGENT_WEBSOCKET_URL /
                             wired into the Exotel Flow's Voicebot Applet.

This service is intentionally independent of the DailyOps NestJS backend —
no shared process, no shared database connection, no import of DailyOps
code. The two talk to each other only via Exotel: DailyOps's
TelephonyService places the call (see backend/src/telephony/), Exotel opens
a WebSocket here, and Exotel separately POSTs call status back to
DailyOps's own callback endpoint. See
backend/docs/voice-agent-architecture.md for the full picture.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, WebSocket

from .agent import CallAgent
from .config import settings
from .health import router as health_router
from .session import ExotelSession

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("voice-agent.main")

app = FastAPI(title="Spyro Fans Voice Agent", version="0.1.0")
app.include_router(health_router)


@app.on_event("startup")
async def on_startup() -> None:
    if not settings.sarvam_configured:
        logger.warning(
            "SARVAM_API_KEY is not set — /health will report ok, but every "
            "WebSocket call session will be refused until it is configured."
        )
    logger.info(
        "Spyro Fans voice agent starting on %s:%s (configured websocket_url=%s)",
        settings.host,
        settings.port,
        settings.websocket_url or "<unset>",
    )
    # BUG FIX (sarvam-m deprecation): safe startup diagnostic — model name
    # only, never the API key — so a stale/deprecated LLM model is visible
    # in the logs at process start without needing a live call first.
    logger.info("LLM model configured: %s", settings.sarvam_llm_model)


@app.websocket("/ws/exotel")
async def exotel_media_stream(websocket: WebSocket) -> None:
    session = ExotelSession(websocket)
    await session.accept()
    agent = CallAgent(session, settings)
    try:
        await agent.run()
    except Exception:  # noqa: BLE001 — Step 9: never let one call crash the process
        logger.exception("Call session ended with an unhandled error")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
