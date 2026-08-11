"""
Events — platform-wide events. Admin-created, browsable and self-joinable by
mentors and mentees; attendance rolls up into the mentee's Progress Snapshot.
"""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Event, EventAttendee, Profile
from services.mentorship import BookingValidationError, BookingNotFoundError


def _event_to_dict(e: Event, *, attendee_count: int = 0, is_registered: bool = False) -> dict:
    return {
        "id": str(e.id), "title": e.title, "description": e.description,
        "event_date": e.event_date.isoformat() if e.event_date else None,
        "attendee_count": attendee_count, "is_registered": is_registered,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


async def list_events(db: AsyncSession, viewer_id: uuid.UUID, *, upcoming_only: bool = True) -> list[dict]:
    query = select(Event).where(Event.deleted_at.is_(None))
    if upcoming_only:
        query = query.where(Event.event_date >= datetime.now(ZoneInfo("UTC")))
    rows = (await db.execute(query.order_by(Event.event_date.asc()))).scalars().all()

    my_registrations = set((await db.execute(
        select(EventAttendee.event_id).where(EventAttendee.profile_id == viewer_id)
    )).scalars().all())
    counts = dict((await db.execute(
        select(EventAttendee.event_id, func.count()).group_by(EventAttendee.event_id)
    )).all())

    return [_event_to_dict(e, attendee_count=counts.get(e.id, 0), is_registered=e.id in my_registrations) for e in rows]


async def get_event(db: AsyncSession, event_id: uuid.UUID, viewer_id: uuid.UUID) -> dict:
    e = (await db.execute(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))).scalar_one_or_none()
    if e is None:
        raise BookingNotFoundError("Event not found")
    count = (await db.execute(select(func.count()).select_from(EventAttendee).where(EventAttendee.event_id == event_id))).scalar() or 0
    is_registered = (await db.execute(
        select(EventAttendee.id).where(EventAttendee.event_id == event_id, EventAttendee.profile_id == viewer_id)
    )).scalar_one_or_none() is not None
    d = _event_to_dict(e, attendee_count=count, is_registered=is_registered)
    attendees = (await db.execute(
        select(EventAttendee, Profile.full_name).join(Profile, Profile.id == EventAttendee.profile_id).where(EventAttendee.event_id == event_id)
    )).all()
    d["attendees"] = [{"profile_id": str(a.profile_id), "name": name, "attended": a.attended} for a, name in attendees]
    return d


async def register_for_event(db: AsyncSession, event_id: uuid.UUID, profile_id: uuid.UUID) -> dict:
    e = (await db.execute(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))).scalar_one_or_none()
    if e is None:
        raise BookingNotFoundError("Event not found")
    existing = (await db.execute(
        select(EventAttendee.id).where(EventAttendee.event_id == event_id, EventAttendee.profile_id == profile_id)
    )).scalar_one_or_none()
    if existing is not None:
        raise BookingValidationError("You're already registered for this event")
    db.add(EventAttendee(event_id=event_id, profile_id=profile_id))
    await db.commit()
    return await get_event(db, event_id, profile_id)


async def unregister_from_event(db: AsyncSession, event_id: uuid.UUID, profile_id: uuid.UUID) -> None:
    result = await db.execute(
        EventAttendee.__table__.delete().where(EventAttendee.event_id == event_id, EventAttendee.profile_id == profile_id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise BookingNotFoundError("You're not registered for this event")


# ── Admin ─────────────────────────────────────────────────────────────────────

async def admin_list_events(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(Event).where(Event.deleted_at.is_(None)).order_by(Event.event_date.desc()))).scalars().all()
    counts = dict((await db.execute(select(EventAttendee.event_id, func.count()).group_by(EventAttendee.event_id))).all())
    return [_event_to_dict(e, attendee_count=counts.get(e.id, 0)) for e in rows]


async def admin_create_event(db: AsyncSession, *, created_by: uuid.UUID, title: str, description: str, event_date: datetime) -> dict:
    if not title.strip():
        raise BookingValidationError("Title is required")
    e = Event(title=title.strip(), description=description.strip() or None, event_date=event_date, created_by=created_by)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _event_to_dict(e)


async def admin_update_event(db: AsyncSession, event_id: uuid.UUID, fields: dict) -> dict:
    e = (await db.execute(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))).scalar_one_or_none()
    if e is None:
        raise BookingNotFoundError("Event not found")
    for key in ("title", "description", "event_date"):
        if key in fields and fields[key] is not None:
            setattr(e, key, fields[key])
    await db.commit()
    count = (await db.execute(select(func.count()).select_from(EventAttendee).where(EventAttendee.event_id == event_id))).scalar() or 0
    return _event_to_dict(e, attendee_count=count)


async def admin_delete_event(db: AsyncSession, event_id: uuid.UUID) -> None:
    e = (await db.execute(select(Event).where(Event.id == event_id, Event.deleted_at.is_(None)))).scalar_one_or_none()
    if e is None:
        raise BookingNotFoundError("Event not found")
    e.deleted_at = datetime.now(ZoneInfo("UTC"))
    await db.commit()


async def admin_mark_attended(db: AsyncSession, event_id: uuid.UUID, profile_id: uuid.UUID, attended: bool) -> None:
    a = (await db.execute(
        select(EventAttendee).where(EventAttendee.event_id == event_id, EventAttendee.profile_id == profile_id)
    )).scalar_one_or_none()
    if a is None:
        raise BookingNotFoundError("This person isn't registered for this event")
    a.attended = attended
    await db.commit()
