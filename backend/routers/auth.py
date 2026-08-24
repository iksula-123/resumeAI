import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, ROLE_USER, ROLE_ADMIN
from services.auth import signup_user, login_user, refresh_session
from services.deps import get_current_user, _admin_emails, _full_name
from services.audit import record as audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


async def _serialize(db: AsyncSession, u: User) -> dict:
    from models import Mentor
    mentor_status = (await db.execute(select(Mentor.status).where(Mentor.profile_id == u.id, Mentor.deleted_at.is_(None)))).scalar_one_or_none()
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name or "",
        "role": u.role,
        "avatar_url": u.avatar_url,
        "subscription_tier": u.subscription_tier or "free",
        "mentor_status": mentor_status,
        # Included so My Profile (and anything else) can prefill a form with
        # real current values instead of blanking them on the next save.
        "headline": u.headline,
        "phone": u.phone,
        "location": u.location,
        "linkedin_url": u.linkedin_url,
        "github_url": u.github_url,
        "website_url": u.website_url,
    }


async def _upsert_user(db: AsyncSession, user_id: uuid.UUID, email: str, full_name: str) -> User:
    """Create or update the local DB user, assigning admin role from ADMIN_EMAILS."""
    admins = _admin_emails()
    email_lc = (email or "").lower()

    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()

    if db_user is None:
        db_user = User(
            id=user_id,
            email=email,
            full_name=full_name,
            role=ROLE_ADMIN if email_lc in admins else ROLE_USER,
            last_login=datetime.now(timezone.utc),
        )
        db.add(db_user)
    else:
        if email_lc in admins and db_user.role != ROLE_ADMIN:
            db_user.role = ROLE_ADMIN
        if full_name and not db_user.full_name:
            db_user.full_name = full_name
        db_user.last_login = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.post("/signup")
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)):
    result = await signup_user(request.email, request.password, request.full_name)
    auth_user = result["user"]
    user_id = uuid.UUID(str(auth_user.id))
    full_name = _full_name(auth_user, request.full_name)

    db_user = await _upsert_user(db, user_id, auth_user.email, full_name)
    audit(actor_id=str(db_user.id), actor_email=db_user.email, action="auth.signup")

    return {
        "message": "User registered successfully",
        "access_token": result["token"],
        # Phase 1B — optional/additive: an older frontend build that doesn't
        # read these two fields keeps working exactly as before.
        "refresh_token": result.get("refresh_token"),
        "expires_at": result.get("expires_at"),
        "user": await _serialize(db, db_user),
    }


@router.post("/login")
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await login_user(request.email, request.password)
    auth_user = result["user"]
    user_id = uuid.UUID(str(auth_user.id))
    full_name = _full_name(auth_user)

    db_user = await _upsert_user(db, user_id, auth_user.email, full_name)

    if not db_user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been disabled. Contact support.")

    audit(actor_id=str(db_user.id), actor_email=db_user.email, action="auth.login")

    return {
        "message": "Login successful",
        "access_token": result["token"],
        # Phase 1B — optional/additive, see the matching note on /signup.
        "refresh_token": result.get("refresh_token"),
        "expires_at": result.get("expires_at"),
        "user": await _serialize(db, db_user),
    }


@router.post("/refresh")
async def refresh(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Phase 1B — exchange a refresh token for a new access token, keeping a
    session alive without asking for the password again. Does not create or
    modify a profile row (unlike /login, /signup) — the user already exists;
    this only re-issues credentials for an identity already established.
    """
    result = await refresh_session(request.refresh_token)
    auth_user = result["user"]
    user_id = uuid.UUID(str(auth_user.id))
    result_db = await db.execute(select(User).where(User.id == user_id))
    db_user = result_db.scalar_one_or_none()
    if not db_user:
        # Identity is valid per Supabase but has no local profile yet — same
        # edge case get_current_user() already handles for any other
        # endpoint; mirror it here rather than 500ing.
        db_user = await _upsert_user(db, user_id, auth_user.email, _full_name(auth_user))
    if not db_user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been disabled. Contact support.")

    return {
        "access_token": result["token"],
        "refresh_token": result.get("refresh_token"),
        "expires_at": result.get("expires_at"),
        "user": await _serialize(db, db_user),
    }


@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Return the current authenticated user (with role)."""
    return await _serialize(db, user)


@router.get("/profile/{user_id}")
async def get_profile(user_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if str(user.id) != user_id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await _serialize(db, user)


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None
    headline: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None


@router.patch("/profile")
async def update_my_profile(req: UpdateProfileRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Self-service edit of the caller's own profile — full_name/avatar/headline
    etc. Used by the mentee's My Profile page (and reusable anywhere else that
    needs it)."""
    for key, value in req.model_dump().items():
        if value is not None:
            setattr(user, key, value)
    await db.commit()
    return await _serialize(db, user)
