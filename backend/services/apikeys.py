"""
API key auth for the public /api/v1 surface.

Keys look like  rsk_live_<48 hex chars>  and are shown to the user exactly once.
Only the SHA-256 hash is stored. Requests authenticate via the `X-API-Key`
header. A lightweight in-memory sliding-window rate limiter caps each key.
"""
import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import ApiKey, User

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

RATE_LIMIT = 60          # requests
RATE_WINDOW = 60         # seconds
_hits: dict[str, deque] = defaultdict(deque)


def generate_key() -> str:
    return "rsk_live_" + secrets.token_hex(24)


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def prefix_of(raw: str) -> str:
    return raw[:16]  # e.g. rsk_live_ab12cd


def _within_rate(key_hash: str) -> bool:
    now = time.time()
    dq = _hits[key_hash]
    while dq and dq[0] < now - RATE_WINDOW:
        dq.popleft()
    if len(dq) >= RATE_LIMIT:
        return False
    dq.append(now)
    return True


async def require_api_key(
    api_key: str | None = Security(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    kh = hash_key(api_key)
    rec = (await db.execute(
        select(ApiKey).where(ApiKey.key_hash == kh, ApiKey.revoked == False)  # noqa: E712
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    if not _within_rate(kh):
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded ({RATE_LIMIT}/min)")

    user = (await db.execute(select(User).where(User.id == rec.user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    rec.last_used = datetime.now(timezone.utc)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return user
