"""
AI token-usage tracking (Phase 14).

A request sets the usage context (who + which feature) via set_usage_context();
the AI layer then calls record_usage() after each Gemini call with the token
counts from response.usage_metadata. Everything is best-effort — tracking never
breaks an AI feature.
"""
import contextvars
import logging
import uuid

logger = logging.getLogger(__name__)

# Estimated Gemini 2.0 Flash-Lite pricing (USD per token). Adjust to your plan.
PRICE_INPUT_PER_TOKEN = 0.075 / 1_000_000
PRICE_OUTPUT_PER_TOKEN = 0.30 / 1_000_000

_ctx: contextvars.ContextVar[dict | None] = contextvars.ContextVar("ai_usage_ctx", default=None)


def set_usage_context(user_id: str | None, feature: str) -> None:
    _ctx.set({"user_id": user_id, "feature": feature})


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return round(input_tokens * PRICE_INPUT_PER_TOKEN + output_tokens * PRICE_OUTPUT_PER_TOKEN, 6)


def _as_uuid(v):
    try:
        return uuid.UUID(str(v)) if v else None
    except (ValueError, TypeError):
        return None


async def record_usage(model: str, input_tokens: int, output_tokens: int) -> None:
    """Persist one AI call's token usage (best-effort)."""
    try:
        ctx = _ctx.get() or {}
        input_tokens = int(input_tokens or 0)
        output_tokens = int(output_tokens or 0)
        total = input_tokens + output_tokens
        if total <= 0:
            return
        from database import AsyncSessionLocal
        from models import AIUsage
        async with AsyncSessionLocal() as s:
            s.add(AIUsage(
                user_id=_as_uuid(ctx.get("user_id")),
                feature=ctx.get("feature") or "unknown",
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total,
                est_cost=estimate_cost(input_tokens, output_tokens),
            ))
            await s.commit()
    except Exception as exc:
        logger.debug("usage record skipped: %s", exc)
