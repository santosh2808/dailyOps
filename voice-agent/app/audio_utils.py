"""Small, dependency-free audio container helpers.

Exotel's Voicebot Applet sends/expects raw headerless PCM (16-bit signed,
little-endian, mono — "raw/slin") over the WebSocket, base64-encoded inside
each `media` event. Sarvam's streaming STT Python SDK (`sarvamai`), as
documented at https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api,
currently fixes its `transcribe()` helper's `encoding` argument to the
literal `"audio/wav"` — raw PCM can only be sent today via a hand-rolled
WebSocket client, not that per-message helper (per Sarvam's own docs). To
keep using the officially documented SDK method rather than reverse-
engineering an undocumented raw-PCM wire format, each outbound audio chunk
is wrapped in a minimal, valid WAV header before being handed to
`ws.transcribe(..., encoding="audio/wav")`. This is a standard, widely used
technique for framing raw PCM into WAV-shaped chunks; it has not been
verified against a live Sarvam account in this environment (see the Phase
2B report's "Known limitations").
"""

from __future__ import annotations

import struct


def wrap_pcm_as_wav(pcm: bytes, sample_rate: int = 8000, channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap headerless PCM bytes in a minimal, correctly-sized WAV container."""
    byte_rate = sample_rate * channels * sample_width
    block_align = channels * sample_width
    data_size = len(pcm)

    header = b"RIFF"
    header += struct.pack("<I", 36 + data_size)
    header += b"WAVE"
    header += b"fmt "
    header += struct.pack("<I", 16)  # PCM fmt chunk size
    header += struct.pack("<H", 1)  # PCM format tag
    header += struct.pack("<H", channels)
    header += struct.pack("<I", sample_rate)
    header += struct.pack("<I", byte_rate)
    header += struct.pack("<H", block_align)
    header += struct.pack("<H", sample_width * 8)
    header += b"data"
    header += struct.pack("<I", data_size)

    return header + pcm
