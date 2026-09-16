"""D.O.T. AI Lead Assistant — Phase 2B. Environment configuration for the
Spyro Fans voice agent ("Meera"). Every value is read from an environment
variable — nothing is hardcoded, nothing is committed with a real value
(see .env.example). This module is imported once at process startup; if a
required Sarvam credential is missing, the process still starts (so /health
keeps working for ops tooling) but the WebSocket handler refuses new
sessions with a clear log message rather than crashing on first connect.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# BUG FIX: nothing in this codebase was ever calling load_dotenv(), despite
# python-dotenv being listed in requirements.txt — so a local `.env` file
# (e.g. voice-agent/.env with SARVAM_VOICE=priya) was never actually read
# into os.environ, and every os.environ.get(...) below silently fell back
# to its hardcoded default instead (SARVAM_VOICE -> "anushka"). Loading the
# .env file that sits next to this package (voice-agent/.env) before
# load_settings() runs fixes that.
#
# override=True: found via live testing that a stray, already-exported shell
# variable (e.g. `export SARVAM_VOICE=` with an empty value, left over from
# an earlier terminal session) silently wins over .env under dotenv's default
# override=False, since "already set" includes an empty string — os.environ
# still has the key, so dotenv leaves it alone, and config.py's fallback
# chain (os.environ.get(...) or "anushka") then falls through to "anushka"
# again despite .env being correct. For this single-purpose local service,
# voice-agent/.env is meant to be authoritative, so override=True makes it
# win over any pre-existing shell environment for these specific keys. This
# does not affect the Docker deployment path: no .env file is copied into
# the image (see Dockerfile — only app/ and requirements.txt are COPYed), so
# load_dotenv() finds nothing there and Docker's own env_file:-supplied
# variables are unaffected.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)


def _bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() == "true"


@dataclass(frozen=True)
class Settings:
    # Sarvam credentials/model selection — see backend/.env.example for the
    # matching DailyOps-side SARVAM_ENABLED/SARVAM_API_KEY convention. This
    # service reads its OWN copy of these (it is a separate deployable
    # process, per Phase 2A's voice-agent-architecture.md), never DailyOps's.
    sarvam_api_key: str | None
    sarvam_stt_model: str
    sarvam_llm_model: str
    sarvam_tts_model: str
    sarvam_language: str
    sarvam_voice: str

    # Host/port this FastAPI process binds to.
    host: str
    port: int

    # Recorded for logging only — this is the same value DailyOps's
    # EXOTEL_FLOW_URL-configured Voicebot Applet must point at. The voice
    # agent does not read this to decide how to behave; it exists so the
    # running process can log what URL it believes it's reachable at.
    websocket_url: str | None

    # Phase 2B is a fixed, short test conversation — see prompts.py. This
    # caps how long the agent keeps the line open before delivering the
    # closing line and ending the call, regardless of how the conversation
    # is going, so a stuck/looping test can never run indefinitely.
    max_call_seconds: int

    @property
    def sarvam_configured(self) -> bool:
        return bool(self.sarvam_api_key)


def load_settings() -> Settings:
    return Settings(
        sarvam_api_key=os.environ.get("SARVAM_API_KEY", "").strip() or None,
        sarvam_stt_model=os.environ.get("SARVAM_STT_MODEL", "saaras:v3").strip(),
        # BUG FIX: "sarvam-m" is deprecated by Sarvam (HTTP 400 on chat
        # completions) — replaced with "sarvam-105b-conversations", one of
        # the models Sarvam's own error response listed as its replacement.
        sarvam_llm_model=os.environ.get("SARVAM_LLM_MODEL", "sarvam-105b-conversations").strip()
        or "sarvam-105b-conversations",
        sarvam_tts_model=os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3").strip(),
        # Phase 2B is English-only (Step 7) — en-IN is the only supported
        # value in this phase; multilingual selection is explicitly future
        # work (Phase 2C).
        sarvam_language=os.environ.get("SARVAM_LANGUAGE", "en-IN").strip() or "en-IN",
        sarvam_voice=os.environ.get("SARVAM_VOICE", "anushka").strip() or "anushka",
        host=os.environ.get("VOICE_AGENT_HOST", "0.0.0.0").strip() or "0.0.0.0",
        port=int(os.environ.get("VOICE_AGENT_PORT", "8000")),
        websocket_url=os.environ.get("VOICE_AGENT_WEBSOCKET_URL", "").strip() or None,
        max_call_seconds=int(os.environ.get("VOICE_AGENT_MAX_CALL_SECONDS", "120")),
    )


settings = load_settings()
