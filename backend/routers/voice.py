"""
Language & voice endpoints (Milestone E).

  GET  /api/voice/status       → is Sarvam voice configured?
  POST /api/voice/to-english   → clean professional English from Hindi/Hinglish/English text
  POST /api/voice/transcribe   → Sarvam speech-to-text (Hindi/English); 503 if unconfigured
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from models import User
from services.deps import get_current_user
from services.voice import voice_enabled, to_professional_english, transcribe
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/voice", tags=["Voice & Language"])

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB


class ToEnglishRequest(BaseModel):
    text: str


@router.get("/status")
async def status(user: User = Depends(get_current_user)):
    return {"voice_enabled": voice_enabled()}


@router.post("/to-english")
async def convert_to_english(req: ToEnglishRequest, user: User = Depends(get_current_user)):
    result = await to_professional_english(req.text)
    await log_usage_event(str(user.id), "voice_to_english", ai_provider="gemini",
                          tenant_id=tenant_of(user), metadata={"source_hi": result["source_was_hindi"]})
    return result


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("hi-IN"),
    user: User = Depends(get_current_user),
):
    if not voice_enabled():
        raise HTTPException(status_code=503,
                            detail="Voice input isn't set up yet. You can type in Hindi or English instead.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="No audio received.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio too long (max 10 MB).")
    try:
        text = await transcribe(data, file.content_type or "audio/wav", language)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Voice input isn't set up yet.")
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't transcribe the audio. Please try again or type instead.")
    await log_usage_event(str(user.id), "voice_transcribe", ai_provider="sarvam",
                          tenant_id=tenant_of(user), metadata={"language": language})
    return {"text": text}
