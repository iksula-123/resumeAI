"""
Outgoing webhooks (Phase 10).

dispatch(user_id, event, data) fans an event out to the user's active
subscriptions in the background (non-blocking). Each delivery is HMAC-signed,
retried up to 3×, and logged to webhook_deliveries.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# All events a webhook can subscribe to
EVENTS = [
    "resume.created", "resume.updated", "resume.deleted", "resume.exported", "resume.upgraded",
    "ats.completed", "coverletter.generated",
    "subscription.created", "subscription.updated", "subscription.cancelled",
    "payment.success", "payment.failed",
]

MAX_ATTEMPTS = 3
TIMEOUT = 10.0


def generate_secret() -> str:
    return "whsec_" + secrets.token_hex(24)


def _as_uuid(v):
    try:
        return uuid.UUID(str(v))
    except (ValueError, TypeError):
        return None


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


async def _deliver(session, webhook, event: str, body: bytes) -> None:
    sig = sign(webhook.secret, body)
    headers = {
        "Content-Type": "application/json",
        "X-ResumeAI-Event": event,
        "X-ResumeAI-Signature": f"sha256={sig}",
    }
    status = None
    error = None
    ok = False
    attempts = 0
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            attempts = attempt
            try:
                resp = await client.post(webhook.url, content=body, headers=headers)
                status = resp.status_code
                if 200 <= status < 300:
                    ok = True
                    break
                error = f"HTTP {status}"
            except Exception as exc:
                error = str(exc)[:300]
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(0.5 * attempt)

    from models import WebhookDelivery
    session.add(WebhookDelivery(
        webhook_id=webhook.id, event=event, success=ok,
        status_code=status, attempts=attempts, error=None if ok else error,
    ))
    await session.commit()


async def _run(user_id: str, event: str, data: dict) -> None:
    try:
        from database import AsyncSessionLocal
        from models import Webhook
        from sqlalchemy import select
        uid = _as_uuid(user_id)
        if uid is None:
            return
        async with AsyncSessionLocal() as s:
            hooks = (await s.execute(
                select(Webhook).where(Webhook.user_id == uid, Webhook.active == True)  # noqa: E712
            )).scalars().all()
            targets = [h for h in hooks if event in (h.events or [])]
            if not targets:
                return
            payload = {"event": event, "created_at": datetime.now(timezone.utc).isoformat(), "data": data}
            body = json.dumps(payload, default=str).encode("utf-8")
            for h in targets:
                await _deliver(s, h, event, body)
    except Exception as exc:
        logger.debug("webhook dispatch error: %s", exc)


def dispatch(user_id, event: str, data: dict) -> None:
    """Fire-and-forget: schedule delivery without blocking the request."""
    try:
        asyncio.get_running_loop().create_task(_run(str(user_id), event, data))
    except RuntimeError:
        # no running loop (e.g. sync context) — skip
        pass


async def send_test(webhook) -> dict:
    """Deliver a test event immediately and return the outcome."""
    from database import AsyncSessionLocal
    payload = {"event": "webhook.test", "created_at": datetime.now(timezone.utc).isoformat(),
               "data": {"message": "This is a test event from ResumeAI Pro."}}
    body = json.dumps(payload).encode("utf-8")
    async with AsyncSessionLocal() as s:
        await _deliver(s, webhook, "webhook.test", body)
    # read back the latest delivery for this webhook
    from models import WebhookDelivery
    from sqlalchemy import select
    async with AsyncSessionLocal() as s:
        d = (await s.execute(
            select(WebhookDelivery).where(WebhookDelivery.webhook_id == webhook.id)
            .order_by(WebhookDelivery.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        return {"success": bool(d and d.success), "status_code": d.status_code if d else None,
                "attempts": d.attempts if d else 0, "error": d.error if d else "no record"}
