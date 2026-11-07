"""Shared fixtures for the voice-agent tests.

Everything here is simulated: no Exotel, no Sarvam, no DailyOps. The
DailyOps client is exercised through httpx.MockTransport, and the agent
through fake STT/TTS/LLM components. Run the suite with networking disabled
(see README "Tests") so an accidental real request fails loudly instead of
reaching a provider.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make `import app...` work when pytest runs from voice-agent/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Tests never use the module-level `settings` (which config.py builds from
# the environment and any voice-agent/.env): every test builds its own
# Settings via make_settings() below with dummy values, and every Sarvam /
# DailyOps call is replaced by a fake. Run in a container without the .env
# file and with --network none for a hard guarantee (see README "Tests").
from app.config import Settings  # noqa: E402

TEST_SERVICE_KEY = "test-only-service-key-" + "x" * 32


def make_settings(**overrides) -> Settings:
    values = dict(
        sarvam_api_key="test-only-sarvam-key",
        sarvam_stt_model="saaras:v3",
        sarvam_llm_model="sarvam-105b-conversations",
        sarvam_tts_model="bulbul:v3",
        sarvam_language="en-IN",
        sarvam_voice="anushka",
        host="127.0.0.1",
        port=8000,
        websocket_url=None,
        max_call_seconds=120,
        dailyops_api_base_url="http://dailyops.test",
        dailyops_service_key=TEST_SERVICE_KEY,
    )
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def settings() -> Settings:
    return make_settings()
