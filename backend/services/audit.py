"""
Audit logging (Phase 16).

record(...) writes a security-relevant action to audit_logs in the background,
so it never blocks or fails the calling request.
"""
import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)


def _as_uuid(v):
    try:
        return uuid.UUID(str(v)) if v else None
    except (ValueError, TypeError):
        return None


async def _run(actor_id, actor_email, action, entity_type, entity_id, meta):
    try:
        from database import AsyncSessionLocal
        from models import AuditLog
        async with AsyncSessionLocal() as s:
            s.add(AuditLog(
                user_id=_as_uuid(actor_id),
                actor_email=actor_email,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                meta=meta or {},
            ))
            await s.commit()
    except Exception as exc:
        logger.debug("audit record skipped: %s", exc)


def record(actor_id=None, actor_email=None, action="", entity_type=None, entity_id=None, meta=None) -> None:
    """Fire-and-forget audit write."""
    try:
        asyncio.get_running_loop().create_task(
            _run(actor_id, actor_email, action, entity_type, entity_id, meta)
        )
    except RuntimeError:
        pass  # no running loop
