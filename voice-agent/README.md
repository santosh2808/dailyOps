# Spyro Fans Voice Agent ("Meera") — Phase 2B

A small, independently deployable Python/FastAPI service that speaks to a
customer over the phone as "Meera from Spyro Fans", via Exotel's Voicebot
Applet WebSocket and Sarvam AI's streaming STT/LLM/TTS. It is not part of
the DailyOps NestJS backend or frontend, has no shared database, and does
not affect their build/deploy pipeline.

This is Phase 2B: a controlled, English-only, 1–2 minute test conversation,
manually triggered from DailyOps's existing Administration → D.O.T.
Telephony Test screen. It does not qualify leads, does not score
HOT/WARM/COLD, does not quote pricing, and is never triggered automatically
— see `app/prompts.py` for exactly what Meera is (and isn't) allowed to
say in this phase.

## Architecture

```
DailyOps (Administration -> D.O.T. Telephony Test -> Make Test Call)
  -> Exotel Connect API (places the call)
  -> Exotel Virtual Number -> Customer phone
  -> Exotel Voicebot Applet opens a WebSocket to this service (/ws/exotel)
  -> This service: Sarvam STT -> Sarvam LLM (sarvam-m) -> Sarvam TTS
  -> audio streamed back to Exotel -> played to the customer
```

Separately, Exotel POSTs call status updates directly to DailyOps's own
`/api/v1/telephony/callback/exotel-status` endpoint (Phase 2A) — this
service does not talk to DailyOps's database or API at all.

## 1. Install Python dependencies

```bash
cd voice-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configure Sarvam credentials

```bash
cp .env.example .env
# edit .env: set SARVAM_API_KEY from https://dashboard.sarvam.ai/
```

## 3. Start the voice agent

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Check it's alive:

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"spyro-fans-voice-agent"}
```

## 4. Expose the WebSocket securely (local development only)

Exotel cannot reach `localhost`. Use a secure tunnel, e.g.:

```bash
ngrok http 8000
```

Take the resulting `https://xxxx.ngrok-free.app` URL, and use
`wss://xxxx.ngrok-free.app/ws/exotel` as your WebSocket URL below. **Never
commit this URL anywhere** — it's ephemeral and account-specific.

## 5. Configure Exotel

1. In the Exotel dashboard, create/edit an App Bazaar Flow.
2. Add a Voicebot Applet, and set its WebSocket URL to the `wss://.../ws/exotel`
   URL from step 4 (or your production domain).
3. Note the Flow's URL and set it as `EXOTEL_FLOW_URL` in the DailyOps
   backend's environment (see `backend/.env.example`, Phase 2A).

## 6. Start the DailyOps backend

```bash
cd ../backend
npm run dev
```

Make sure `EXOTEL_ENABLED=true` and the `EXOTEL_*` credentials are set —
see the backend's Phase 2A report for details.

## 7–13. Make the first test call

1. Open DailyOps → **Administration → D.O.T. Telephony Test**.
2. Enter a **test phone number you control**.
3. Click **Make Test Call**.
4. Answer the phone.
5. Speak with Meera — she opens with the exact scripted greeting, then
   responds naturally for about 1–2 minutes before wrapping up.
6. Verify it's a genuine two-way conversation (she responds to what you
   actually say, not a canned loop).
7. Back in DailyOps, check the test call's status/history on the same
   screen (Phase 2A's `TelephonyTestCall` record, updated via Exotel's
   status callback — unrelated to this service).

## Known limitation

This service's STT integration sends each audio chunk to Sarvam wrapped in
a minimal WAV header (see `app/audio_utils.py` for why — the `sarvamai`
Python SDK's streaming `transcribe()` helper currently fixes its encoding
argument to `"audio/wav"`, so raw PCM can't be sent through it directly).
This has not been exercised against a live Sarvam account end-to-end in
this environment; verify it with your own Sarvam credentials before
relying on it, and watch the service logs for `Sarvam STT send failed`
warnings during your first real test call.

## Call results → DailyOps

After each answered call the agent submits the result to DailyOps at
`POST /api/v1/telephony/voice-agent/call-results`, identified by Exotel's
**CallSid** (DailyOps matches it to the call it placed; the agent never
searches leads by phone number and never sends one). Authentication is the
shared `VOICE_AGENT_SERVICE_KEY` (same value on the backend), sent in the
`X-Voice-Agent-Key` header — not an employee login.

- Any 2xx is success. Network errors, timeouts, 408/425/429 and 5xx are
  retried, up to 4 attempts in total; other 4xx are not retried.
- Redirects are **not** followed (that would send the key elsewhere): set
  `DAILYOPS_API_BASE_URL` to the final `https://` URL.
- The post-call qualification extraction is capped at 20 seconds; on
  timeout the result is still submitted, with no qualification.
- The reported `outcome` is `CONVERSATION_COMPLETED`, `NO_CONVERSATION`, or
  `AGENT_ERROR`.

**Known trade-off (strict failure rule, kept on purpose for Phase 0).** Any
STT/LLM/TTS or agent failure *during* the call — even a single transient
one, such as one LLM turn falling back to "Sorry, could you say that
again?" — makes the outcome `AGENT_ERROR`. Extraction is then skipped and no
AI data from that call is applied to the lead, so a technical failure can
never become a qualification, but a mostly-good call with one glitch yields
no qualification either. Revisit (e.g. distinguish fatal from transient
errors, or keep a partial extraction for review only) once real-call data
shows how often this happens.

## Tests

All tests are simulated — no Exotel, Sarvam or DailyOps calls. Run them in
the deployed Python version with networking disabled, mounting **only**
`app/` and `tests/` read-only, so a local `.env` with real keys is never
visible to the test process (`app/config.py` loads `.env` at import time):

```bash
cd voice-agent
# .dockerignore keeps .env out of the build context; only requirements are copied.
docker build -t dailyops-voice-agent-test -f - . <<'DOCKERFILE'
FROM python:3.11-slim
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-dev.txt
WORKDIR /src
DOCKERFILE
docker run --rm --network none \
  -v "$PWD/app":/src/app:ro -v "$PWD/tests":/src/tests:ro \
  -e PYTHONDONTWRITEBYTECODE=1 \
  dailyops-voice-agent-test python -m pytest -q -p no:cacheprovider tests
```
