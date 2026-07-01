import logging
import os
import uuid
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_demo_users: dict[str, dict] = {}


def _get_client():
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    from supabase import create_client
    return create_client(url, key)


class _User:
    """Minimal user object compatible with both demo and Supabase responses."""
    def __init__(self, user_id, email: str, full_name: str = ""):
        self.id = user_id
        self.email = email
        self.user_metadata = {"full_name": full_name}


async def signup_user(email: str, password: str, full_name: str):
    client = _get_client()

    if client is None:
        # ── Demo mode (no Supabase configured) ──────────────────────────
        user_id = uuid.uuid4()
        token = f"demo-{user_id}"
        _demo_users[token] = {"id": user_id, "email": email, "full_name": full_name}
        return {"user": _User(user_id, email, full_name), "token": token}

    # ── Supabase admin create (auto-confirms email, no verification needed) ──
    try:
        resp = client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        })
        if not resp.user:
            raise HTTPException(status_code=400, detail="Signup failed")
    except Exception as exc:
        msg = str(exc)
        if "already registered" in msg.lower() or "already been registered" in msg.lower():
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail=msg)

    # Sign in immediately to get a session token
    try:
        sign_in = client.auth.sign_in_with_password({"email": email, "password": password})
        token = sign_in.session.access_token if sign_in.session else None
        user = sign_in.user or resp.user
    except Exception:
        token = None
        user = resp.user

    return {"user": user, "token": token}


async def login_user(email: str, password: str):
    client = _get_client()

    if client is None:
        # ── Demo mode ────────────────────────────────────────────────────
        for token, u in _demo_users.items():
            if u["email"] == email:
                return {"user": _User(u["id"], u["email"], u.get("full_name", "")), "token": token}
        # Auto-create on first demo login
        user_id = uuid.uuid4()
        token = f"demo-{user_id}"
        _demo_users[token] = {"id": user_id, "email": email, "full_name": ""}
        return {"user": _User(user_id, email), "token": token}

    try:
        resp = client.auth.sign_in_with_password({"email": email, "password": password})
        if not resp.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"user": resp.user, "token": resp.session.access_token}
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc)
        if "email not confirmed" in msg.lower():
            raise HTTPException(status_code=401, detail="Email not confirmed — please check your inbox or contact support")
        raise HTTPException(status_code=401, detail="Invalid credentials")


async def verify_token(token: str) -> _User:
    client = _get_client()

    if client is None:
        if token in _demo_users:
            u = _demo_users[token]
            return _User(u["id"], u["email"], u.get("full_name", ""))
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        resp = client.auth.get_user(token)
        if not resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return resp.user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
