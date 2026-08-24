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


def set_usage_context(user_id: str | None, feature: str, tenant_id: str | None = None) -> None:
    """tenant_id is optional (existing call sites that don't pass it keep
    working — record_usage() below falls back to PILOT_TENANT_ID exactly
    like tenant_of() does elsewhere) but every call site was updated
    alongside this to pass the caller's server-resolved tenant explicitly
    (Phase 1A) rather than rely on that fallback in the normal case."""
    _ctx.set({"user_id": user_id, "feature": feature, "tenant_id": tenant_id})


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return round(input_tokens * PRICE_INPUT_PER_TOKEN + output_tokens * PRICE_OUTPUT_PER_TOKEN, 6)


def _as_uuid(v):
    try:
        return uuid.UUID(str(v)) if v else None
    except (ValueError, TypeError):
        return None


# Active learner-pilot tenant (spec Section 2). Matches the seed in migration 0003.
PILOT_TENANT_ID = "00000000-0000-0000-0000-0000000000e1"


def tenant_of(user) -> str:
    """Resolve a user's tenant for cost attribution (defaults to the pilot tenant)."""
    tid = getattr(user, "tenant_id", None)
    return str(tid) if tid else PILOT_TENANT_ID


async def log_usage_event(
    user_id: str | None,
    event_type: str,
    *,
    ai_provider: str | None = None,
    tokens: int | None = None,
    cost_estimate: float | None = None,
    tenant_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Record one billable/product event into public.usage_events (best-effort).

    Per-tenant cost attribution is a Phase-1 deliverable (spec Section 2/7): every
    AI call, resume created, and download is logged with tenant_id + a cost estimate.
    Never breaks the calling feature.
    """
    try:
        import json
        from sqlalchemy import text
        from database import AsyncSessionLocal
        async with AsyncSessionLocal() as s:
            await s.execute(
                text(
                    "insert into public.usage_events "
                    "(tenant_id, user_id, event_type, ai_provider, tokens, cost_estimate, metadata) "
                    "values (:tenant_id, :user_id, :event_type, :ai_provider, :tokens, :cost_estimate, "
                    "cast(:metadata as jsonb))"
                ),
                {
                    "tenant_id": tenant_id or PILOT_TENANT_ID,
                    "user_id": _as_uuid(user_id),
                    "event_type": event_type,
                    "ai_provider": ai_provider,
                    "tokens": int(tokens) if tokens else None,
                    "cost_estimate": cost_estimate,
                    "metadata": json.dumps(metadata or {}),
                },
            )
            await s.commit()
    except Exception as exc:
        logger.debug("usage_event skipped: %s", exc)


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
                # Phase 1A: explicit, never left to the DB default (see
                # models.py::Subscription.tenant_id for why) — falls back to
                # PILOT_TENANT_ID only if a call site genuinely didn't pass
                # one, same fallback tenant_of() already uses.
                tenant_id=_as_uuid(ctx.get("tenant_id")) or uuid.UUID(PILOT_TENANT_ID),
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
