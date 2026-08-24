import logging
import os
import time
import uuid
from fastapi import HTTPException

from services.audit import record as _audit

logger = logging.getLogger(__name__)

_demo_users: dict[str, dict] = {}


def _session_fields(session) -> dict:
    """Phase 1B — the extra fields every auth-issuing call now returns
    alongside the access token, so the frontend can keep a session alive
    with a silent refresh instead of a hard logout on expiry. `expires_at`
    is normalized to a unix-seconds int here (some GoTrue responses only
    populate `expires_in`) so the frontend never has to guess which one is
    present. Never used for any authorization decision server-side —
    verify_token() below still independently re-validates every request
    against Supabase; this is purely session-lifetime bookkeeping."""
    if session is None:
        return {"refresh_token": None, "expires_at": None}
    expires_at = getattr(session, "expires_at", None)
    if not expires_at and getattr(session, "expires_in", None):
        expires_at = int(time.time()) + int(session.expires_in)
    return {"refresh_token": getattr(session, "refresh_token", None), "expires_at": expires_at}


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
        # No real refresh token exists in demo mode — Phase 1B's session
        # fields are simply absent, same as any other unconfigured-Supabase
        # path already was before this change; the frontend already treats
        # both fields as optional, so this degrades gracefully rather than
        # breaking demo mode.
        user_id = uuid.uuid4()
        token = f"demo-{user_id}"
        _demo_users[token] = {"id": user_id, "email": email, "full_name": full_name}
        return {"user": _User(user_id, email, full_name), "token": token, "refresh_token": None, "expires_at": None}

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
        session_fields = _session_fields(sign_in.session)
    except Exception:
        token = None
        user = resp.user
        session_fields = _session_fields(None)

    return {"user": user, "token": token, **session_fields}


async def login_user(email: str, password: str):
    client = _get_client()

    if client is None:
        # ── Demo mode ────────────────────────────────────────────────────
        for token, u in _demo_users.items():
            if u["email"] == email:
                return {"user": _User(u["id"], u["email"], u.get("full_name", "")), "token": token, "refresh_token": None, "expires_at": None}
        # Auto-create on first demo login
        user_id = uuid.uuid4()
        token = f"demo-{user_id}"
        _demo_users[token] = {"id": user_id, "email": email, "full_name": ""}
        return {"user": _User(user_id, email), "token": token, "refresh_token": None, "expires_at": None}

    try:
        resp = client.auth.sign_in_with_password({"email": email, "password": password})
        if not resp.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"user": resp.user, "token": resp.session.access_token, **_session_fields(resp.session)}
    except HTTPException:
        raise
    except Exception as exc:
        msg = str(exc)
        if "email not confirmed" in msg.lower():
            raise HTTPException(status_code=401, detail="Email not confirmed — please check your inbox or contact support")
        raise HTTPException(status_code=401, detail="Invalid credentials")


_REFRESH_FAILURE_MESSAGE = "Could not refresh session — please log in again"


def _refresh_failure_reason(exc: Exception | None) -> str:
    """Classify a failed refresh for the audit trail ONLY — never included
    in the client-facing error, which always stays the same generic message
    regardless of cause (see refresh_session below). GoTrue's own wording
    for refresh-token ROTATION REUSE (a rotated-out refresh token being
    replayed — i.e. a real signal of possible token theft) contains
    'already used' / 'already_used'; anything else (plain expiry, revoked
    session, garbage input) is bucketed as a generic failure."""
    msg = str(exc).lower() if exc is not None else ""
    if "already used" in msg or "already_used" in msg:
        return "refresh_token_reuse"
    return "refresh_failed"


def _audit_refresh_failure(reason: str) -> None:
    """Fire-and-forget audit row for a failed/rejected refresh attempt.
    Metadata is intentionally limited to a classification string — never
    the refresh token, the access token, or any other credential."""
    try:
        _audit(action="auth.refresh_failed", meta={"reason": reason})
    except Exception:
        # Auditing must never be able to break the (already-failing) request.
        logger.debug("audit record skipped for refresh failure", exc_info=True)


async def refresh_session(refresh_token: str) -> dict:
    """Phase 1B — exchange a refresh token for a new access token, without
    requiring the user's password again. Mirrors login_user's return shape
    (token/refresh_token/expires_at) so the router can reuse the exact same
    response handling. Supabase rotates refresh tokens on use by default —
    the NEW refresh_token in the response must replace the old one
    client-side, or the second refresh attempt will fail.

    Deliberately does NOT touch verify_token() or get_current_user() — this
    is purely about ISSUING a new token pair, not about how a token is
    validated on a subsequent request. Every request after a refresh still
    goes through the exact same verify_token() round-trip to Supabase as
    before Phase 1B.
    """
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token provided")

    client = _get_client()
    if client is None:
        # Demo mode has no real refresh concept — the demo token itself
        # never expires (see verify_token), so there's nothing to refresh.
        raise HTTPException(status_code=401, detail="Session refresh is not available in demo mode")

    try:
        resp = client.auth.refresh_session(refresh_token)
        if not resp.session:
            _audit_refresh_failure(_refresh_failure_reason(None))
            raise HTTPException(status_code=401, detail=_REFRESH_FAILURE_MESSAGE)
        return {"user": resp.user, "token": resp.session.access_token, **_session_fields(resp.session)}
    except HTTPException:
        raise
    except Exception as exc:
        # Expired/revoked/already-rotated refresh token — same honest,
        # generic message as an invalid login; never leak which case it was
        # to the caller. The classification (e.g. reuse detected) is
        # recorded server-side only, via the audit log.
        _audit_refresh_failure(_refresh_failure_reason(exc))
        raise HTTPException(status_code=401, detail=_REFRESH_FAILURE_MESSAGE)


async def check_auth_health() -> dict:
    """Live check for the admin's Platform Health widget — not just 'we
    reached this handler, so auth must work'. Reports whether Supabase is
    actually configured (vs. the in-memory demo-mode fallback) and, if so,
    makes a real round-trip to GoTrue's own health endpoint."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return {"status": "demo_mode", "detail": "No Supabase configured — using in-memory demo auth"}

    import httpx
    try:
        # Supabase's Kong gateway rejects requests with no API key before they
        # ever reach GoTrue, regardless of the target path — same header the
        # supabase-py client sends on every request.
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/auth/v1/health", headers={"apikey": key})
        if resp.status_code == 200:
            return {"status": "ok", "detail": "Supabase Auth (GoTrue) reachable"}
        return {"status": "degraded", "detail": f"Supabase Auth responded with {resp.status_code}"}
    except Exception as exc:
        return {"status": "down", "detail": f"Supabase Auth unreachable: {type(exc).__name__}: {exc}" if str(exc) else f"Supabase Auth unreachable: {type(exc).__name__}"}


async def delete_supabase_user(user_id) -> None:
    """Revoke the Supabase auth identity itself (login credentials, sessions)
    — the caller is separately responsible for deleting the local `profiles`
    row (and whatever cascades from it). Without this, "deleting" an account
    only removed its app data; the person could still log back in and the
    `handle_new_user` trigger would just recreate a blank profile. Best-effort
    and non-fatal in demo mode or if Supabase is unreachable — the local
    profile deletion is the part that must not silently fail."""
    client = _get_client()
    if client is None:
        _demo_users.pop(f"demo-{user_id}", None)
        return
    try:
        client.auth.admin.delete_user(str(user_id))
    except Exception as exc:
        logger.warning("Failed to delete Supabase auth user %s: %s", user_id, exc)


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
