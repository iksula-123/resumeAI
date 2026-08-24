"""
Outgoing webhooks (Phase 10).

dispatch(user_id, event, data) fans an event out to the user's active
subscriptions in the background (non-blocking). Each delivery is HMAC-signed,
retried up to 3×, and logged to webhook_deliveries.

Connection-pool note (Phase 1B follow-up): delivery is split into three
phases so a checked-out DB connection is never held across the outbound HTTP
call(s) — see _run()'s own comment below for why that mattered.
"""
import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from dataclasses import dataclass
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


@dataclass(frozen=True)
class _DeliveryOutcome:
    """Plain result of one delivery attempt — no DB/ORM object involved, so
    it can be freely passed around after the session that looked up the
    webhook (or even the HTTP client) has already closed."""
    webhook_id: uuid.UUID
    success: bool
    status_code: int | None
    attempts: int
    error: str | None


async def _attempt_delivery(url: str, secret: str, event: str, body: bytes) -> tuple[bool, int | None, int, str | None]:
    """Phase B — pure outbound HTTP delivery with retries. Deliberately takes
    only plain values (url/secret), never a DB session or an ORM object, and
    never touches the database — this is the part that can legitimately take
    up to MAX_ATTEMPTS * TIMEOUT (+ backoff) seconds against a slow or dead
    endpoint, so it must never run while a pooled DB connection is checked
    out (see _run()'s docstring for the incident this fixes).

    Behavior is byte-for-byte the same as before the split: same signature
    header, same timeout, same attempt count, same backoff, same success
    test, same truncated error string.
    """
    sig = sign(secret, body)
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
                resp = await client.post(url, content=body, headers=headers)
                status = resp.status_code
                if 200 <= status < 300:
                    ok = True
                    break
                error = f"HTTP {status}"
            except Exception as exc:
                # Never let a webhook URL/response leak into logs beyond a
                # short, truncated exception string — no secrets/headers here.
                error = str(exc)[:300]
            if attempt < MAX_ATTEMPTS:
                await asyncio.sleep(0.5 * attempt)
    return ok, status, attempts, error


async def _record_outcomes(outcomes: list[_DeliveryOutcome], event: str) -> None:
    """Phase C — one short-lived session that only ever does a batch INSERT +
    commit, never anything that can block on external I/O. Same
    WebhookDelivery fields, same values, as the pre-split code wrote."""
    if not outcomes:
        return
    from database import AsyncSessionLocal
    from models import WebhookDelivery
    async with AsyncSessionLocal() as s:
        for o in outcomes:
            s.add(WebhookDelivery(
                webhook_id=o.webhook_id, event=event, success=o.success,
                status_code=o.status_code, attempts=o.attempts,
                error=None if o.success else o.error,
            ))
        await s.commit()


async def _run(user_id: str, event: str, data: dict) -> None:
    """Phase 1B follow-up: previously this held one AsyncSession open for the
    ENTIRE delivery loop below, including every outbound HTTP attempt+retry+
    backoff (up to MAX_ATTEMPTS * TIMEOUT + backoff seconds — roughly 31s —
    PER webhook target, sequentially). Under Supabase's session-mode pooler
    (hard-capped at 15 total clients for the whole project), a handful of
    concurrent dispatches to slow/unresponsive endpoints could tie up pool
    slots for tens of seconds each, starving unrelated requests (login,
    signup, etc.) of a connection. Restructured into three phases so a DB
    connection is only ever held for the brief read (Phase A) and the brief
    batch write (Phase C) — never during Phase B's HTTP calls. Every other
    behavior (targets selected, payload shape, signing, retries, backoff,
    persisted fields, silent best-effort failure handling) is unchanged.
    """
    try:
        uid = _as_uuid(user_id)
        if uid is None:
            return

        # ── Phase A: short DB session — load targets, extract plain data,
        # close BEFORE any HTTP call. user_id alone (not tenant_id) is the
        # correct — and already tenant-safe — scope here: a profile's id is
        # a globally unique UUID that never collides across tenants (same
        # reasoning routers/resumes.py's list_resumes() already documents),
        # so this can never fan out to another tenant's webhook. Unchanged
        # from the pre-split query — no tenant-isolation logic touched.
        from database import AsyncSessionLocal
        from models import Webhook
        from sqlalchemy import select
        async with AsyncSessionLocal() as s:
            hooks = (await s.execute(
                select(Webhook).where(Webhook.user_id == uid, Webhook.active == True)  # noqa: E712
            )).scalars().all()
            targets = [(h.id, h.url, h.secret) for h in hooks if event in (h.events or [])]
        if not targets:
            return

        payload = {"event": event, "created_at": datetime.now(timezone.utc).isoformat(), "data": data}
        body = json.dumps(payload, default=str).encode("utf-8")

        # ── Phase B: external delivery — NO db session held for any of this,
        # regardless of how many targets there are or how slow they are.
        # Same sequential per-target order as before.
        outcomes = [
            _DeliveryOutcome(webhook_id, *await _attempt_delivery(url, secret, event, body))
            for webhook_id, url, secret in targets
        ]

        # ── Phase C: short DB session — persist every result, then close.
        await _record_outcomes(outcomes, event)
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
    """Deliver a test event immediately and return the outcome.

    `webhook` is loaded by the caller (routers/webhooks.py's test_webhook)
    on its own request-scoped session — only its plain attribute values are
    used here, extracted up front, so nothing below depends on that session
    (or any session) staying open. Same 3-phase split as _run(): no DB
    session is held during the HTTP attempt(s).
    """
    webhook_id, url, secret = webhook.id, webhook.url, webhook.secret
    payload = {"event": "webhook.test", "created_at": datetime.now(timezone.utc).isoformat(),
               "data": {"message": "This is a test event from ResumeAI Pro."}}
    body = json.dumps(payload).encode("utf-8")

    ok, status, attempts, error = await _attempt_delivery(url, secret, "webhook.test", body)

    outcome = _DeliveryOutcome(webhook_id, ok, status, attempts, error)
    await _record_outcomes([outcome], "webhook.test")

    # Built directly from the outcome just recorded above — equivalent to
    # the previous read-back-from-DB (same fields/values), without needing
    # a second, separate session purely to confirm what this call already
    # knows it just wrote.
    return {"success": ok, "status_code": status, "attempts": attempts, "error": None if ok else error}
