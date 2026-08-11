"""
Tasks — action items/homework a mentor assigns to a mentee, optionally tied
to a specific session or program. Mentee sees & completes them in My Tasks.
"""
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Task, Booking, MentorSession, Mentor, ProgramParticipant, Profile
from services.mentorship import BookingValidationError, BookingNotFoundError, NotAMentorError


def _task_to_dict(t: Task, *, assigned_by_name: str | None = None) -> dict:
    return {
        "id": str(t.id), "mentee_id": str(t.mentee_id), "title": t.title, "description": t.description,
        "due_date": t.due_date.isoformat() if t.due_date else None, "status": t.status,
        "session_id": str(t.session_id) if t.session_id else None,
        "program_id": str(t.program_id) if t.program_id else None,
        "assigned_by_name": assigned_by_name,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


async def _resolve_mentor_id(db: AsyncSession, profile_id: uuid.UUID) -> uuid.UUID:
    mentor_id = (await db.execute(select(Mentor.id).where(Mentor.profile_id == profile_id, Mentor.deleted_at.is_(None)))).scalar_one_or_none()
    if mentor_id is None:
        raise NotAMentorError("You don't have a mentor profile yet")
    return mentor_id


async def list_my_tasks(db: AsyncSession, mentee_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(Task, Profile.full_name).join(Profile, Profile.id == Task.assigned_by)
        .where(Task.mentee_id == mentee_id).order_by(Task.status, Task.due_date.asc().nullslast(), Task.created_at.desc())
    )).all()
    return [_task_to_dict(t, assigned_by_name=name) for t, name in rows]


async def list_tasks_assigned_by_mentor(db: AsyncSession, mentor_profile_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(select(Task).where(Task.assigned_by == mentor_profile_id).order_by(Task.created_at.desc()))).scalars().all()
    return [_task_to_dict(t) for t in rows]


async def create_task(
    db: AsyncSession, *, mentor_profile_id: uuid.UUID, mentee_id: uuid.UUID, title: str,
    description: str = "", due_date: date | None = None,
    session_id: uuid.UUID | None = None, program_id: uuid.UUID | None = None,
) -> dict:
    if not title.strip():
        raise BookingValidationError("Title is required")
    mentor_id = await _resolve_mentor_id(db, mentor_profile_id)

    # Ownership check: the mentor must actually have a relationship with this
    # mentee — via a booking together, or shared program membership.
    has_booking = (await db.execute(
        select(Booking.id).where(Booking.mentor_id == mentor_id, Booking.learner_id == mentee_id).limit(1)
    )).scalar_one_or_none()
    shares_program = None
    if program_id is not None:
        shares_program = (await db.execute(
            select(ProgramParticipant.id).where(ProgramParticipant.program_id == program_id, ProgramParticipant.profile_id == mentee_id).limit(1)
        )).scalar_one_or_none()
    if has_booking is None and shares_program is None:
        raise BookingValidationError("You can only assign tasks to a mentee you've worked with")

    if session_id is not None:
        owns_session = (await db.execute(
            select(MentorSession.id).where(MentorSession.id == session_id, MentorSession.mentor_id == mentor_id)
        )).scalar_one_or_none()
        if owns_session is None:
            raise BookingValidationError("Session not found")

    task = Task(
        mentee_id=mentee_id, assigned_by=mentor_profile_id, session_id=session_id, program_id=program_id,
        title=title.strip(), description=description.strip() or None, due_date=due_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_to_dict(task)


async def complete_task(db: AsyncSession, mentee_id: uuid.UUID, task_id: uuid.UUID, *, status: str = "completed") -> dict:
    if status not in ("pending", "completed"):
        raise BookingValidationError("Invalid status")
    task = (await db.execute(select(Task).where(Task.id == task_id, Task.mentee_id == mentee_id))).scalar_one_or_none()
    if task is None:
        raise BookingNotFoundError("Task not found")
    task.status = status
    task.completed_at = datetime.now(ZoneInfo("UTC")) if status == "completed" else None
    await db.commit()
    await db.refresh(task)
    return _task_to_dict(task)
