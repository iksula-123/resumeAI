"""
Privacy Requests — data access / deletion requests (Privacy & My Data page).

`access` requests are fulfilled immediately: this module assembles a JSON
export of the caller's own mentorship data and the request is logged as
completed right away — no admin step needed to read your own data back.
`delete` requests stay 'pending' until an admin calls
`admin_execute_account_deletion`, which performs the actual deletion (both
the Supabase auth identity and the local profile row) and marks the request
completed in one step — not a "mark done and remember to delete them
separately" honor system.
"""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PrivacyRequest, Profile, Booking, MentorSession, Mentor, Review, CareerGoal, Task, PlatformFeedback
from services.mentorship import BookingValidationError, BookingNotFoundError


def _to_dict(r: PrivacyRequest) -> dict:
    return {
        "id": str(r.id), "type": r.type, "status": r.status, "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "processed_at": r.processed_at.isoformat() if r.processed_at else None,
    }


async def export_user_data(db: AsyncSession, user_id: uuid.UUID) -> dict:
    profile = (await db.execute(select(Profile).where(Profile.id == user_id))).scalar_one_or_none()
    bookings = (await db.execute(
        select(Booking, MentorSession).join(MentorSession, MentorSession.booking_id == Booking.id).where(Booking.learner_id == user_id)
    )).all()
    reviews = (await db.execute(select(Review).where(Review.learner_id == user_id))).scalars().all()
    goals = (await db.execute(select(CareerGoal).where(CareerGoal.learner_id == user_id))).scalars().all()
    tasks = (await db.execute(select(Task).where(Task.mentee_id == user_id))).scalars().all()
    platform_feedback = (await db.execute(select(PlatformFeedback).where(PlatformFeedback.user_id == user_id))).scalars().all()
    mentor_row = (await db.execute(select(Mentor).where(Mentor.profile_id == user_id))).scalar_one_or_none()

    return {
        "exported_at": datetime.now(ZoneInfo("UTC")).isoformat(),
        "profile": {
            "id": str(profile.id), "email": profile.email, "full_name": profile.full_name,
            "role": profile.role, "created_at": profile.created_at.isoformat() if profile.created_at else None,
        } if profile else None,
        "mentor_profile": {"id": str(mentor_row.id), "status": mentor_row.status} if mentor_row else None,
        "sessions": [
            {
                "booking_id": str(b.id), "session_type": b.session_type, "status": s.status,
                "scheduled_start": s.scheduled_start.isoformat() if s.scheduled_start else None,
            }
            for b, s in bookings
        ],
        "reviews_given": [{"rating": r.rating, "review_text": r.review_text} for r in reviews],
        "career_goals": [{"title": g.title, "status": g.status} for g in goals],
        "tasks": [{"title": t.title, "status": t.status} for t in tasks],
        "platform_feedback": [{"rating": f.rating, "comment": f.comment} for f in platform_feedback],
    }


async def submit_request(db: AsyncSession, user_id: uuid.UUID, *, type: str, notes: str = "") -> dict:
    if type not in ("access", "delete"):
        raise BookingValidationError("type must be 'access' or 'delete'")

    req = PrivacyRequest(user_id=user_id, type=type, notes=notes.strip() or None)
    if type == "access":
        req.status = "completed"
        req.processed_at = datetime.now(ZoneInfo("UTC"))
    db.add(req)
    await db.commit()
    await db.refresh(req)

    result = _to_dict(req)
    if type == "access":
        result["export"] = await export_user_data(db, user_id)
    return result


async def list_my_requests(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(PrivacyRequest).where(PrivacyRequest.user_id == user_id).order_by(PrivacyRequest.created_at.desc())
    )).scalars().all()
    return [_to_dict(r) for r in rows]


async def admin_list_requests(db: AsyncSession, *, status: str | None = None) -> list[dict]:
    query = select(PrivacyRequest, Profile.full_name, Profile.email).join(Profile, Profile.id == PrivacyRequest.user_id)
    if status:
        query = query.where(PrivacyRequest.status == status)
    rows = (await db.execute(query.order_by(PrivacyRequest.created_at.desc()))).all()
    out = []
    for r, name, email in rows:
        d = _to_dict(r)
        d["user_name"] = name
        d["user_email"] = email
        out.append(d)
    return out


async def admin_update_request_status(db: AsyncSession, admin_id: uuid.UUID, request_id: uuid.UUID, status: str) -> dict:
    if status not in ("pending", "completed", "rejected"):
        raise BookingValidationError("Invalid status")
    if status == "completed":
        raise BookingValidationError("Use admin_execute_account_deletion to complete a delete request — it performs the actual deletion, not just a status flip")
    req = (await db.execute(select(PrivacyRequest).where(PrivacyRequest.id == request_id))).scalar_one_or_none()
    if req is None:
        raise BookingNotFoundError("Privacy request not found")
    req.status = status
    req.processed_by = admin_id
    req.processed_at = datetime.now(ZoneInfo("UTC"))
    await db.commit()
    return _to_dict(req)


async def admin_execute_account_deletion(db: AsyncSession, admin_id: uuid.UUID, request_id: uuid.UUID) -> dict:
    """The actual one-click fulfillment of a 'delete' privacy request: revokes
    the person's Supabase login, deletes their local profile (cascading to
    resumes/cover letters/etc. via the existing FKs), and marks the request
    completed — all in one action, not a status flip the admin has to
    separately remember to back up with a real deletion."""
    req = (await db.execute(select(PrivacyRequest).where(PrivacyRequest.id == request_id))).scalar_one_or_none()
    if req is None:
        raise BookingNotFoundError("Privacy request not found")
    if req.type != "delete":
        raise BookingValidationError("This request is not a deletion request")
    if req.status != "pending":
        raise BookingValidationError(f"This request is already {req.status}")
    if req.user_id == admin_id:
        raise BookingValidationError("You cannot delete your own account this way")

    profile = (await db.execute(select(Profile).where(Profile.id == req.user_id))).scalar_one_or_none()
    deleted_email = profile.email if profile else None

    from services.auth import delete_supabase_user
    await delete_supabase_user(req.user_id)

    if profile is not None:
        await db.delete(profile)

    req.status = "completed"
    req.processed_by = admin_id
    req.processed_at = datetime.now(ZoneInfo("UTC"))
    await db.commit()

    return {"request": _to_dict(req), "deleted_email": deleted_email}
