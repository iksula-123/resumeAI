"""
Authentication & authorization dependencies.

Flow:
  1. Bearer token verified against the identity provider (Supabase) via verify_token
  2. The user is mirrored into our local DB (created on first sight) with a role
  3. Role is derived from ADMIN_EMAILS env on first creation / promotion
  4. Endpoints depend on get_current_user (any logged-in user) or require_admin
"""
import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, ROLE_USER, ROLE_ADMIN
from services.auth import verify_token

security = HTTPBearer()


def _admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _meta(auth_user) -> dict:
    meta = getattr(auth_user, "user_metadata", None) or {}
    return meta if isinstance(meta, dict) else {}


def _full_name(auth_user, fallback: str = "") -> str:
    """Pull a display name from provider metadata.

    Email signup → 'full_name'. Google → 'full_name'/'name'.
    GitHub → 'name'/'user_name'/'preferred_username'.
    """
    meta = _meta(auth_user)
    for key in ("full_name", "name", "user_name", "preferred_username"):
        if meta.get(key):
            return meta[key]
    return fallback


def _avatar_url(auth_user) -> str | None:
    """Google uses 'picture'; GitHub uses 'avatar_url'."""
    meta = _meta(auth_user)
    for key in ("avatar_url", "picture"):
        if meta.get(key):
            return meta[key]
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve, mirror, and return the authenticated DB user (with role)."""
    auth_user = await verify_token(credentials.credentials)
    user_id = uuid.UUID(str(auth_user.id))
    email = (auth_user.email or "").lower()
    admins = _admin_emails()

    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        # First time we see this identity → auto-create the profile row
        role = ROLE_ADMIN if email in admins else ROLE_USER
        db_user = User(
            id=user_id,
            email=auth_user.email,
            full_name=_full_name(auth_user),
            avatar_url=_avatar_url(auth_user),
            role=role,
            last_login=datetime.now(timezone.utc),
        )
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
    else:
        # Promote to admin if their email was added to ADMIN_EMAILS later;
        # backfill name/avatar from the provider if we don't have them yet.
        if email in admins and db_user.role != ROLE_ADMIN:
            db_user.role = ROLE_ADMIN
        if not db_user.full_name:
            db_user.full_name = _full_name(auth_user)
        if not db_user.avatar_url:
            db_user.avatar_url = _avatar_url(auth_user)
        db_user.last_login = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(db_user)

    if not db_user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return db_user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Allow only admin users."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
