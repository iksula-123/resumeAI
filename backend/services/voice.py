"""
Language & voice service (Milestone E, spec Section 5.E).

Lets a candidate speak or type in Hindi or English and get clean, professional
ENGLISH resume text out. Two layers:

  * text path  — type Hindi/Hinglish/English → professional English (Gemini).
                 Works today; no extra keys needed.
  * voice path — Sarvam speech-to-text (Hindi + English). Enabled only when
                 SARVAM_API_KEY is set; degrades gracefully otherwise.

Devanagari is preserved end-to-end (UTF-8); the professional output is English.
"""
import logging
import os
import re

import httpx

from services.ai import _chat

logger = logging.getLogger(__name__)

# Sarvam speech-to-text model. Older saarika:v1/v2 are deprecated → use v2.5.
SARVAM_STT_MODEL = "saarika:v2.5"

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def voice_enabled() -> bool:
    return bool(os.getenv("SARVAM_API_KEY", "").strip())


def has_devanagari(text: str) -> bool:
    return bool(_DEVANAGARI.search(text or ""))


async def to_professional_english(text: str) -> dict:
    """Turn rough Hindi / Hinglish / English input into clean professional English.

    Never invents facts — only cleans, translates and professionalises what the
    candidate actually said. Returns {english, source_was_hindi}.
    """
    text = (text or "").strip()
    if not text:
        return {"english": "", "source_was_hindi": False}
    was_hi = has_devanagari(text)

    prompt = f"""The candidate described their experience in Hindi, Hinglish, or informal English:

\"\"\"{text[:1500]}\"\"\"

Rewrite it as clean, professional resume English.
Rules:
- Translate any Hindi/Devanagari to natural professional English.
- Do NOT add facts, employers, numbers, or achievements they did not mention.
- Keep it concise and resume-appropriate (bullet-style or 2-3 sentences).
- Return ONLY the English text, no quotes, no notes."""
    raw = await _chat(prompt, max_tokens=600)
    english = (raw or text).strip().strip('"')
    return {"english": english, "source_was_hindi": was_hi}


async def transcribe(audio: bytes, content_type: str, language: str = "hi-IN") -> str:
    """Sarvam speech-to-text. Requires SARVAM_API_KEY. Returns the transcript.

    language: 'hi-IN' (Hindi) or 'en-IN' (Indian English).
    """
    key = os.getenv("SARVAM_API_KEY", "").strip()
    if not key:
        raise RuntimeError("voice_not_configured")
    if language not in ("hi-IN", "en-IN"):
        language = "hi-IN"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": key},
            data={"model": SARVAM_STT_MODEL, "language_code": language},
            files={"file": ("audio.wav", audio, content_type or "audio/wav")},
        )
    if resp.status_code >= 400:
        # Surface the real reason in the server log so failures are diagnosable.
        logger.warning("Sarvam STT %s: %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
    body = resp.json()
    # Sarvam returns {"transcript": "..."}; be tolerant of shape changes.
    return (body.get("transcript") or body.get("text") or "").strip()
