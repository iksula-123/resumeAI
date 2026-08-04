"""
Shared LLM plumbing for the ATS engine — JSON-mode chat completions and
embeddings. Provider priority follows the rest of the app (services/ai.py):
OpenAI first here (embeddings require it; JSON-mode is more reliable for
structured extraction), Gemini as a fallback for chat-only calls.

Every function degrades to `None` on any failure (missing key, rate limit,
network) — callers use `services/ats_engine/fallback.py` heuristics so the
engine still works without an AI key, just with less nuance.
"""
import json
import os

from services.ai import _gemini_chat, _extract_json_object  # reuse existing plumbing


def _openai_client():
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        return None
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=key)
    except Exception:
        return None


async def chat_json(prompt: str, max_tokens: int = 1500) -> dict | None:
    """Ask the LLM for a single JSON object. Tries OpenAI JSON-mode, then Gemini."""
    cl = _openai_client()
    if cl is not None:
        try:
            response = await cl.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You respond ONLY with a single valid JSON object. No markdown fences, no prose."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            usage = getattr(response, "usage", None)
            if usage is not None:
                try:
                    from services.usage import record_usage
                    await record_usage("gpt-4o-mini", usage.prompt_tokens, usage.completion_tokens)
                except Exception:
                    pass
            content = response.choices[0].message.content or ""
            return json.loads(content)
        except Exception:
            pass  # fall through to Gemini

    gemini_raw = await _gemini_chat(prompt + "\n\nRespond with ONLY a single valid JSON object.", max_tokens)
    if gemini_raw:
        parsed = _extract_json_object(gemini_raw)
        if parsed is not None:
            return parsed
    return None


async def embed_text(text: str) -> list[float] | None:
    """OpenAI text-embedding-3-small — returns None if no key / call fails."""
    cl = _openai_client()
    if cl is None:
        return None
    try:
        text = (text or "").strip()[:8000]  # embedding input cap, plenty for a resume/JD
        if not text:
            return None
        response = await cl.embeddings.create(model="text-embedding-3-small", input=text)
        try:
            from services.usage import record_usage
            await record_usage("text-embedding-3-small", response.usage.prompt_tokens, 0)
        except Exception:
            pass
        return response.data[0].embedding
    except Exception:
        return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm_a * norm_b)))
