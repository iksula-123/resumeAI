"""
Platform Feedback — feedback about the platform itself, separate from
per-session Feedback (which is `reviews`, tied to a booking and driving a
mentor's rating). Reachable from the floating feedback button and the My
Feedback / Platform Feedback pages.
"""
import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import PlatformFeedback, Profile
from services.mentorship import BookingValidationError


def _to_dict(f: PlatformFeedback, *, author_name: str | None = None) -> dict:
    return {
        "id": str(f.id), "rating": f.rating, "comment": f.comment,
        "author_name": author_name, "created_at": f.created_at.isoformat() if f.created_at else None,
    }


async def submit_feedback(db: AsyncSession, user_id: uuid.UUID, *, rating: int, comment: str = "") -> dict:
    if not (1 <= rating <= 5):
        raise BookingValidationError("Rating must be between 1 and 5")
    f = PlatformFeedback(user_id=user_id, rating=rating, comment=comment.strip() or None)
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return _to_dict(f)


async def list_my_feedback(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(PlatformFeedback).where(PlatformFeedback.user_id == user_id).order_by(PlatformFeedback.created_at.desc())
    )).scalars().all()
    return [_to_dict(f) for f in rows]


async def admin_list_feedback(db: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (await db.execute(
        select(PlatformFeedback, Profile.full_name).join(Profile, Profile.id == PlatformFeedback.user_id)
        .order_by(PlatformFeedback.created_at.desc()).limit(limit)
    )).all()
    return [_to_dict(f, author_name=name) for f, name in rows]


async def admin_get_avg_rating(db: AsyncSession) -> float:
    avg = (await db.execute(select(func.avg(PlatformFeedback.rating)))).scalar()
    return round(float(avg), 2) if avg is not None else 0.0
