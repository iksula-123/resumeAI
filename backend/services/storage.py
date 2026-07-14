"""
Supabase Storage integration.

A single PRIVATE bucket holds all user files, namespaced by user id:

    resume-files/{user_id}/{category}/{uuid}_{filename}

Access is backend-only (service role) and handed to the browser as short-lived
signed URLs — so the bucket stays private and users only ever see their own
files (the API scopes every path to the caller's user id).

All functions are best-effort: if Supabase Storage is unavailable/misconfigured,
they log and return None instead of breaking the calling feature.
"""
import logging
import os
import uuid
import re

logger = logging.getLogger(__name__)

BUCKET = "resume-files"
_bucket_ready = False


def _client():
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as exc:
        logger.warning("Storage client unavailable: %s", exc)
        return None


def ensure_bucket() -> bool:
    """Create the private bucket if it doesn't exist. Safe to call repeatedly."""
    global _bucket_ready
    if _bucket_ready:
        return True
    sb = _client()
    if sb is None:
        return False
    try:
        existing = {b.name if hasattr(b, "name") else b.get("name") for b in sb.storage.list_buckets()}
        if BUCKET not in existing:
            sb.storage.create_bucket(BUCKET, options={"public": False})
            logger.info("Created private storage bucket: %s", BUCKET)
        _bucket_ready = True
        return True
    except Exception as exc:
        # bucket may already exist (race) — treat "already exists" as ready
        if "already exists" in str(exc).lower():
            _bucket_ready = True
            return True
        logger.warning("ensure_bucket failed: %s", exc)
        return False


def _safe_name(filename: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "_", filename or "file")
    return f"{uuid.uuid4().hex[:8]}_{base}"[:120]


def upload_bytes(user_id: str, category: str, filename: str, data: bytes, content_type: str = "application/octet-stream") -> str | None:
    """Upload bytes and return the storage path (or None on failure)."""
    if not ensure_bucket():
        return None
    sb = _client()
    if sb is None:
        return None
    path = f"{user_id}/{category}/{_safe_name(filename)}"
    try:
        sb.storage.from_(BUCKET).upload(
            path, data,
            {"content-type": content_type, "upsert": "true"},
        )
        return path
    except Exception as exc:
        logger.warning("upload_bytes failed (%s): %s", path, exc)
        return None


def signed_url(path: str, expires_in: int = 3600) -> str | None:
    sb = _client()
    if sb is None:
        return None
    try:
        res = sb.storage.from_(BUCKET).create_signed_url(path, expires_in)
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    except Exception as exc:
        logger.warning("signed_url failed (%s): %s", path, exc)
        return None


def list_user_files(user_id: str) -> list[dict]:
    """List a user's files across categories with signed download URLs."""
    sb = _client()
    if sb is None:
        return []
    out: list[dict] = []
    try:
        for category in ("original", "generated", "photos"):
            prefix = f"{user_id}/{category}"
            try:
                items = sb.storage.from_(BUCKET).list(prefix)
            except Exception:
                items = []
            for it in items or []:
                name = it.get("name") if isinstance(it, dict) else getattr(it, "name", None)
                if not name:
                    continue
                path = f"{prefix}/{name}"
                meta = it.get("metadata") if isinstance(it, dict) else None
                out.append({
                    "path": path,
                    "name": name,
                    "category": category,
                    "size": (meta or {}).get("size"),
                    "url": signed_url(path),
                })
    except Exception as exc:
        logger.warning("list_user_files failed: %s", exc)
    return out


def delete_file(user_id: str, path: str) -> bool:
    """Delete a file — only if it belongs to the given user (path scoping)."""
    if not path.startswith(f"{user_id}/"):
        return False
    sb = _client()
    if sb is None:
        return False
    try:
        sb.storage.from_(BUCKET).remove([path])
        return True
    except Exception as exc:
        logger.warning("delete_file failed (%s): %s", path, exc)
        return False
