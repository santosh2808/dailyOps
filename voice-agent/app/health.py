"""GET /health — Step 14. Returns liveness only; never a credential or any
Sarvam/Exotel configuration detail."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

SERVICE_NAME = "spyro-fans-voice-agent"


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": SERVICE_NAME}
