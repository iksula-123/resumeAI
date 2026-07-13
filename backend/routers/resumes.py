"""
Resume CRUD with a content adapter.

The frontend works with a single nested `content` object. The database stores
each section in its own normalized table (experiences, education, skills, …).
This router translates between the two:

  * _to_content(resume)      → assemble content dict from the resume + children
  * _apply_content(db, r, c) → decompose content into normalized child rows
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import (
    Resume, Experience, Education, Skill, Project, Certification, Language, User,
    ResumeVersion,
)
from services.deps import get_current_user

router = APIRouter(prefix="/api/resumes", tags=["Resumes"])

MAX_VERSIONS = 25          # keep the newest N snapshots per resume
SNAPSHOT_THROTTLE_SEC = 45  # during active editing, snapshot at most this often

_RESUME_LOADERS = (
    selectinload(Resume.experiences),
    selectinload(Resume.education),
    selectinload(Resume.skills),
    selectinload(Resume.projects),
    selectinload(Resume.certifications),
    selectinload(Resume.languages),
)


class ResumeUpsert(BaseModel):
    source: Optional[str] = None  # e.g. "ai_upgrade" — recorded on the version snapshot
    title: Optional[str] = "Untitled Resume"
    template_id: Optional[str] = "modern"
    content: Optional[Any] = None
    ats_score: Optional[int] = None


# ── content assembly (DB → frontend) ─────────────────────────────────────────
def _to_content(r: Resume) -> dict:
    return {
        "personalInfo": r.personal_info or {},
        "summary": r.summary or "",
        "experience": [
            {
                "id": str(e.id),
                "position": e.position or "",
                "company": e.company or "",
                "location": e.location or "",
                "startDate": e.start_date or "",
                "endDate": e.end_date or "",
                "current": bool(e.is_current),
                "bullets": e.bullets or [],
            }
            for e in r.experiences
        ],
        "education": [
            {
                "id": str(e.id),
                "degree": e.degree or "",
                "field": e.field or "",
                "institution": e.institution or "",
                "location": e.location or "",
                "startDate": e.start_date or "",
                "endDate": e.end_date or "",
                "gpa": e.gpa or "",
            }
            for e in r.education
        ],
        "skills": [{"name": s.name, "level": s.level if s.level is not None else 70} for s in r.skills],
        "projects": [
            {
                "id": str(p.id),
                "name": p.name or "",
                "technologies": p.technologies or "",
                "description": p.description or "",
            }
            for p in r.projects
        ],
        "certifications": [
            {"id": str(c.id), "name": c.name or "", "issuer": c.issuer or "", "date": c.issue_date or ""}
            for c in r.certifications
        ],
        "languages": [{"name": l.name, "proficiency": l.proficiency or ""} for l in r.languages],
        "achievements": r.achievements or [],
        "interests": r.interests or [],
    }


def _to_dict(r: Resume) -> dict:
    return {
        "id": str(r.id),
        "user_id": str(r.user_id),
        "title": r.title,
        "template_id": r.template_id,
        "is_public": r.is_public,
        "ats_score": r.ats_score,
        "content": _to_content(r),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ── content decomposition (frontend → DB) ─────────────────────────────────────
def _skill_parts(s):
    if isinstance(s, str):
        return s, 70
    return s.get("name") or "", s.get("level", 70)


def _lang_parts(l):
    if isinstance(l, str):
        return l, ""
    return l.get("name") or "", l.get("proficiency") or ""


async def _apply_content(db: AsyncSession, resume: Resume, content: dict) -> None:
    """Decompose the frontend `content` blob into normalized child rows.

    Assigning each relationship collection lets SQLAlchemy's delete-orphan
    cascade remove the previous rows and insert the new ones in one unit of
    work — correct for both create (empty) and update (eager-loaded) paths.
    """
    content = content or {}
    resume.personal_info = content.get("personalInfo") or {}
    resume.summary = content.get("summary") or ""
    resume.achievements = content.get("achievements") or []
    resume.interests = content.get("interests") or []

    resume.experiences = [
        Experience(
            position=e.get("position") or "",
            company=e.get("company") or "",
            location=e.get("location") or "",
            start_date=e.get("startDate") or "",
            end_date=e.get("endDate") or "",
            is_current=bool(e.get("current")),
            bullets=e.get("bullets") or [],
            sort_order=i,
        )
        for i, e in enumerate(content.get("experience") or [])
    ]

    resume.education = [
        Education(
            institution=e.get("institution") or "",
            degree=e.get("degree") or "",
            field=e.get("field") or "",
            location=e.get("location") or "",
            start_date=e.get("startDate") or "",
            end_date=e.get("endDate") or "",
            gpa=e.get("gpa") or "",
            sort_order=i,
        )
        for i, e in enumerate(content.get("education") or [])
    ]

    resume.skills = [
        Skill(name=name, level=level, sort_order=i)
        for i, (name, level) in enumerate(_skill_parts(s) for s in (content.get("skills") or []))
        if name
    ]

    resume.projects = [
        Project(
            name=p.get("name") or "",
            technologies=p.get("technologies") or "",
            description=p.get("description") or "",
            sort_order=i,
        )
        for i, p in enumerate(content.get("projects") or [])
    ]

    resume.certifications = [
        Certification(
            name=c.get("name") or "",
            issuer=c.get("issuer") or "",
            issue_date=c.get("date") or c.get("issue_date") or "",
            sort_order=i,
        )
        for i, c in enumerate(content.get("certifications") or [])
    ]

    resume.languages = [
        Language(name=name, proficiency=prof, sort_order=i)
        for i, (name, prof) in enumerate(_lang_parts(l) for l in (content.get("languages") or []))
        if name
    ]


async def _load_full(db: AsyncSession, rid: uuid.UUID) -> Optional[Resume]:
    result = await db.execute(
        select(Resume).where(Resume.id == rid).options(*_RESUME_LOADERS)
    )
    return result.scalar_one_or_none()


async def _get_owned(db: AsyncSession, resume_id: str, user: User) -> Resume:
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    r = await _load_full(db, rid)
    if not r or (r.user_id != user.id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


# ── version history ───────────────────────────────────────────────────────────
def _version_dict(v: ResumeVersion) -> dict:
    return {
        "id": str(v.id),
        "title": v.title,
        "ats_score": v.ats_score,
        "source": v.source,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


async def _snapshot(db: AsyncSession, r: Resume, user_id, source: str, throttle: bool = False) -> None:
    """Save a point-in-time snapshot of the resume; throttle + prune old ones."""
    if throttle:
        res = await db.execute(
            select(ResumeVersion.created_at)
            .where(ResumeVersion.resume_id == r.id)
            .order_by(ResumeVersion.created_at.desc()).limit(1)
        )
        last = res.scalar_one_or_none()
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - last).total_seconds() < SNAPSHOT_THROTTLE_SEC:
                return

    db.add(ResumeVersion(
        resume_id=r.id, user_id=user_id, title=r.title, template_id=r.template_id,
        content=_to_content(r), ats_score=r.ats_score, source=source,
    ))
    await db.flush()

    # prune: keep only the newest MAX_VERSIONS
    old = await db.execute(
        select(ResumeVersion.id).where(ResumeVersion.resume_id == r.id)
        .order_by(ResumeVersion.created_at.desc()).offset(MAX_VERSIONS)
    )
    old_ids = [row[0] for row in old.all()]
    if old_ids:
        await db.execute(delete(ResumeVersion).where(ResumeVersion.id.in_(old_ids)))


# ── endpoints ─────────────────────────────────────────────────────────────────
@router.get("/")
async def list_resumes(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Resume).where(Resume.user_id == user.id)
        .options(*_RESUME_LOADERS).order_by(Resume.updated_at.desc())
    )
    return [_to_dict(r) for r in result.scalars().unique().all()]


@router.post("/")
async def create_resume(
    body: ResumeUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = Resume(
        user_id=user.id,
        title=body.title or "Untitled Resume",
        template_id=body.template_id or "modern",
        ats_score=body.ats_score,
        personal_info={},
        achievements=[],
        interests=[],
    )
    # Decompose while transient (no lazy-load), then cascade-insert via db.add
    await _apply_content(db, r, body.content or {})
    db.add(r)
    await db.commit()
    full = await _load_full(db, r.id)
    # initial snapshot (AI-upgrade saves pass source="ai_upgrade")
    await _snapshot(db, full, user.id, body.source or "initial")
    await db.commit()
    return _to_dict(full)


@router.get("/{resume_id}")
async def get_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _to_dict(await _get_owned(db, resume_id, user))


@router.put("/{resume_id}")
async def update_resume(
    resume_id: str,
    body: ResumeUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    if body.title is not None:
        r.title = body.title
    if body.template_id is not None:
        r.template_id = body.template_id
    if body.ats_score is not None:
        r.ats_score = body.ats_score
    if body.content is not None:
        await _apply_content(db, r, body.content)
    r.updated_at = datetime.now(timezone.utc)
    await db.commit()
    full = await _load_full(db, r.id)
    # throttled snapshot so active editing doesn't spam the history
    await _snapshot(db, full, user.id, body.source or "edit", throttle=True)
    await db.commit()
    return _to_dict(full)


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    await db.delete(r)
    await db.commit()


# ── version history endpoints ───────────────────────────────────────────────
@router.get("/{resume_id}/versions")
async def list_versions(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    res = await db.execute(
        select(ResumeVersion).where(ResumeVersion.resume_id == r.id)
        .order_by(ResumeVersion.created_at.desc())
    )
    return [_version_dict(v) for v in res.scalars().all()]


@router.get("/{resume_id}/versions/{version_id}")
async def get_version(
    resume_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    try:
        vid = uuid.UUID(version_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Version not found")
    res = await db.execute(select(ResumeVersion).where(ResumeVersion.id == vid))
    v = res.scalar_one_or_none()
    if not v or v.resume_id != r.id:
        raise HTTPException(status_code=404, detail="Version not found")
    return {**_version_dict(v), "content": v.content, "template_id": v.template_id}


@router.post("/{resume_id}/versions/{version_id}/restore")
async def restore_version(
    resume_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    try:
        vid = uuid.UUID(version_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Version not found")
    res = await db.execute(select(ResumeVersion).where(ResumeVersion.id == vid))
    v = res.scalar_one_or_none()
    if not v or v.resume_id != r.id:
        raise HTTPException(status_code=404, detail="Version not found")

    # Preserve the current state before overwriting, so rollback is reversible
    await _snapshot(db, r, user.id, "edit")

    if v.content is not None:
        await _apply_content(db, r, v.content)
    if v.title:
        r.title = v.title
    if v.template_id:
        r.template_id = v.template_id
    if v.ats_score is not None:
        r.ats_score = v.ats_score
    r.updated_at = datetime.now(timezone.utc)
    await db.commit()

    full = await _load_full(db, r.id)
    await _snapshot(db, full, user.id, "rollback")
    await db.commit()
    return _to_dict(full)
