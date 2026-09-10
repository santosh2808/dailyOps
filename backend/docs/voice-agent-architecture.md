# D.O.T. Voice Agent — Architecture Note (Phase 2A)

Status: **not implemented**. This document exists only to record the target
architecture so Phase 2B (or later) can build the voice agent against a
shared plan, and so DailyOps's own config (`VOICE_AGENT_WEBSOCKET_URL`,
`SARVAM_ENABLED`, `SARVAM_API_KEY`) has an agreed meaning even though
nothing in this repository calls it yet.

## Why it's separate from the NestJS backend

DailyOps (this repo) is a request/response REST API on Node.js/NestJS. A
real-time, bidirectional voice agent — audio in, STT, LLM, TTS, audio out,
all within the same live call — is a different runtime shape: a long-lived
WebSocket server doing streaming audio processing, not a stateless HTTP
API. Forcing that into the existing NestJS process would mean holding
per-call audio buffers and model connections inside the same process that
also serves every other DailyOps request — an availability risk for the
rest of the app, and a poor fit for NestJS's request-scoped conventions.

## Target shape

```
DailyOps NestJS Backend  (system of record — this repo)
        |
        |  POST /v1/Accounts/.../Calls/connect.json  (TelephonyService)
        v
   Exotel Voice API
        |
        v
  Exotel Virtual Number  --calls-->  Test Phone
        |
        |  Voicebot Applet (configured in the Exotel dashboard Flow
        |  referenced by EXOTEL_FLOW_URL) opens a WebSocket to:
        v
  D.O.T. Voice Agent   (isolated service — NOT in this repo yet)
        |
        v
     Sarvam AI  (STT / LLM / TTS, Indian languages)
```

DailyOps remains the system of record: it initiates the call, receives the
call's status callbacks (`POST /api/v1/telephony/callback/exotel-status`),
and stores the outcome (`TelephonyTestCall`). It never proxies the live
audio stream — that flows directly between Exotel and the voice agent.

## Where the voice agent should live

A standalone service, e.g. `/voice-agent` or `/services/voice-agent`
alongside (not inside) this repo's `backend/`/`frontend/` folders — most
likely a small Python service (Sarvam's SDKs and the [Pipecat](https://
docs.pipecat.ai) framework, which already has documented Exotel WebSocket
transport support, are both Python-first). Responsibilities:

- Expose a public `wss://` endpoint matching Exotel's Voicebot Applet
  contract (base64-encoded bidirectional audio frames over WebSocket — see
  [Exotel's AgentStream docs](https://developer.exotel.com/docs/agentstream/developer-guide)).
- Speech-to-text via Sarvam (`SARVAM_API_KEY`).
- A small LLM prompt loop — for the first test call, hard-coded to the
  exact script in the Phase 2A spec ("Hello, I'm D.O.T. ... Can you hear me
  clearly?"), not the full HVLS qualification conversation.
- Text-to-speech via Sarvam, streamed back over the same WebSocket.
- End the call politely after ~1–2 minutes.

## What's deliberately NOT decided yet

- The exact hosting target for the voice agent (EC2 alongside the backend,
  a separate container, a managed Python host — whichever fits the existing
  CloudFront/EC2 deployment without complicating it).
- The full HVLS lead-qualification conversation/prompt design.
- Multi-language support beyond the first English-only test call.
- Recording storage strategy beyond "store a reference URL, never the
  audio itself in PostgreSQL" (see `TelephonyTestCall.recordingRef`).

## Local development

Exotel's Voicebot Applet requires a publicly reachable WebSocket URL — it
cannot reach `localhost`. For local development, use a secure tunnel (e.g.
ngrok, Cloudflare Tunnel) pointed at wherever the voice agent runs, and set
`VOICE_AGENT_WEBSOCKET_URL`/`EXOTEL_FLOW_URL` from the resulting URL via
environment variables. Never commit a tunnel URL into source code or
`.env.example` — it's ephemeral and account-specific.
