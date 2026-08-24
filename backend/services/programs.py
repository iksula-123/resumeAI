"""
Programs — structured mentorship programs. Admin-created, browsable and
self-joinable by mentors and mentees; enrollment rolls up into the mentee's
Progress Snapshot (see services/mentorship.py::get_mentee_dashboard).
"""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models import Program, ProgramParticipant, Profile, Mentor
from services.mentorship import BookingValidationError, BookingNotFoundError


def _program_to_dict(p: Program, *, mentor_count: int = 0, mentee_count: int = 0, my_role: str | None = None) -> dict:
    return {
        "id": str(p.id), "title": p.title, "description": p.description, "duration": p.duration,
        "status": p.status, "created_at": p.created_at.isoformat() if p.created_at else None,
        "mentor_count": mentor_count, "mentee_count": mentee_count, "my_role": my_role,
    }


async def _counts(db: AsyncSession, program_id: uuid.UUID) -> tuple[int, int]:
    rows = (await db.execute(
        select(ProgramParticipant.role, func.count()).where(ProgramParticipant.program_id == program_id).group_by(ProgramParticipant.role)
    )).all()
    counts = dict(rows)
    return counts.get("mentor", 0), counts.get("mentee", 0)


async def list_programs(db: AsyncSession, viewer_id: uuid.UUID, tenant_id: uuid.UUID | None = None) -> list[dict]:
    # Phase 1A: programs are entirely admin-created platform content (no
    # user-initiated creation path exists), same "NULL = global" convention
    # as mentor_categories — a tenant-specific program is additive, never
    # required, so an admin-created program stays visible to everyone unless
    # it's explicitly given a tenant_id later.
    query = select(Program).where(Program.deleted_at.is_(None), Program.status == "active")
    if tenant_id is not None:
        query = query.where(or_(Program.tenant_id == tenant_id, Program.tenant_id.is_(None)))
    rows = (await db.execute(query.order_by(Program.created_at.desc()))).scalars().all()
    my_roles = dict((await db.execute(
        select(ProgramParticipant.program_id, ProgramParticipant.role).where(ProgramParticipant.profile_id == viewer_id)
    )).all())
    out = []
    for p in rows:
        mc, ec = await _counts(db, p.id)
        out.append(_program_to_dict(p, mentor_count=mc, mentee_count=ec, my_role=my_roles.get(p.id)))
    return out


async def get_program(db: AsyncSession, program_id: uuid.UUID, viewer_id: uuid.UUID,
                        tenant_id: uuid.UUID | None = None) -> dict:
    query = select(Program).where(Program.id == program_id, Program.deleted_at.is_(None))
    if tenant_id is not None:
        query = query.where(or_(Program.tenant_id == tenant_id, Program.tenant_id.is_(None)))
    p = (await db.execute(query)).scalar_one_or_none()
    if p is None:
        raise BookingNotFoundError("Program not found")
    mc, ec = await _counts(db, p.id)
    my_role = (await db.execute(
        select(ProgramParticipant.role).where(ProgramParticipant.program_id == program_id, ProgramParticipant.profile_id == viewer_id)
    )).scalar_one_or_none()
    participants = (await db.execute(
        select(ProgramParticipant, Profile.full_name).join(Profile, Profile.id == ProgramParticipant.profile_id)
        .where(ProgramParticipant.program_id == program_id)
    )).all()
    d = _program_to_dict(p, mentor_count=mc, mentee_count=ec, my_role=my_role)
    d["participants"] = [{"profile_id": str(pp.profile_id), "name": name, "role": pp.role} for pp, name in participants]
    return d


async def join_program(db: AsyncSession, program_id: uuid.UUID, profile_id: uuid.UUID, role: str) -> dict:
    if role not in ("mentor", "mentee"):
        raise BookingValidationError("role must be 'mentor' or 'mentee'")
    program = (await db.execute(select(Program).where(Program.id == program_id, Program.deleted_at.is_(None)))).scalar_one_or_none()
    if program is None:
        raise BookingNotFoundError("Program not found")
    if role == "mentor":
        is_mentor = (await db.execute(select(Mentor.id).where(Mentor.profile_id == profile_id, Mentor.status == "approved"))).scalar_one_or_none()
        if is_mentor is None:
            raise BookingValidationError("Only approved mentors can join a program as a mentor")

    existing = (await db.execute(
        select(ProgramParticipant.id).where(ProgramParticipant.program_id == program_id, ProgramParticipant.profile_id == profile_id)
    )).scalar_one_or_none()
    if existing is not None:
        raise BookingValidationError("You've already joined this program")

    db.add(ProgramParticipant(program_id=program_id, profile_id=profile_id, role=role))
    await db.commit()
    return await get_program(db, program_id, profile_id)


async def leave_program(db: AsyncSession, program_id: uuid.UUID, profile_id: uuid.UUID) -> None:
    result = await db.execute(
        ProgramParticipant.__table__.delete().where(ProgramParticipant.program_id == program_id, ProgramParticipant.profile_id == profile_id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise BookingNotFoundError("You haven't joined this program")


# ── Admin ─────────────────────────────────────────────────────────────────────

async def admin_list_programs(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(Program).where(Program.deleted_at.is_(None)).order_by(Program.created_at.desc()))).scalars().all()
    out = []
    for p in rows:
        mc, ec = await _counts(db, p.id)
        out.append(_program_to_dict(p, mentor_count=mc, mentee_count=ec))
    return out


async def admin_create_program(db: AsyncSession, *, created_by: uuid.UUID, title: str, description: str = "", duration: str = "") -> dict:
    if not title.strip():
        raise BookingValidationError("Title is required")
    p = Program(title=title.strip(), description=description.strip() or None, duration=duration.strip() or None, created_by=created_by)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _program_to_dict(p)


async def admin_update_program(db: AsyncSession, program_id: uuid.UUID, fields: dict) -> dict:
    p = (await db.execute(select(Program).where(Program.id == program_id, Program.deleted_at.is_(None)))).scalar_one_or_none()
    if p is None:
        raise BookingNotFoundError("Program not found")
    for key in ("title", "description", "duration", "status"):
        if key in fields and fields[key] is not None:
            setattr(p, key, fields[key])
    await db.commit()
    mc, ec = await _counts(db, p.id)
    return _program_to_dict(p, mentor_count=mc, mentee_count=ec)


async def admin_delete_program(db: AsyncSession, program_id: uuid.UUID) -> None:
    p = (await db.execute(select(Program).where(Program.id == program_id, Program.deleted_at.is_(None)))).scalar_one_or_none()
    if p is None:
        raise BookingNotFoundError("Program not found")
    p.deleted_at = datetime.now(ZoneInfo("UTC"))
    await db.commit()


async def admin_assign_participant(db: AsyncSession, program_id: uuid.UUID, profile_id: uuid.UUID, role: str) -> dict:
    return await join_program(db, program_id, profile_id, role)


async def admin_remove_participant(db: AsyncSession, program_id: uuid.UUID, profile_id: uuid.UUID) -> None:
    await leave_program(db, program_id, profile_id)
