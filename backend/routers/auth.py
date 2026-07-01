import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, ROLE_USER, ROLE_ADMIN
from services.auth import signup_user, login_user
from services.deps import get_current_user, _admin_emails, _full_name

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _serialize(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name or "",
        "role": u.role,
        "avatar_url": u.avatar_url,
        "subscription_tier": u.subscription_tier or "free",
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

    return {
        "message": "User registered successfully",
        "access_token": result["token"],
        "user": _serialize(db_user),
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

    return {
        "message": "Login successful",
        "access_token": result["token"],
        "user": _serialize(db_user),
    }


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user (with role)."""
    return _serialize(user)


@router.get("/profile/{user_id}")
async def get_profile(user_id: str, user: User = Depends(get_current_user)):
    if str(user.id) != user_id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _serialize(user)
