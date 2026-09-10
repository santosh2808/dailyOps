# Spyro Fans Voice Agent ("Ananya") — Phase 2B

A small, independently deployable Python/FastAPI service that speaks to a
customer over the phone as "Ananya from Spyro Fans", via Exotel's Voicebot
Applet WebSocket and Sarvam AI's streaming STT/LLM/TTS. It is not part of
the DailyOps NestJS backend or frontend, has no shared database, and does
not affect their build/deploy pipeline.

This is Phase 2B: a controlled, English-only, 1–2 minute test conversation,
manually triggered from DailyOps's existing Administration → D.O.T.
Telephony Test screen. It does not qualify leads, does not score
HOT/WARM/COLD, does not quote pricing, and is never triggered automatically
— see `app/prompts.py` for exactly what Ananya is (and isn't) allowed to
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
5. Speak with Ananya — she opens with the exact scripted greeting, then
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
