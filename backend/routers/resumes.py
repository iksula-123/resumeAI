"""
Resume CRUD with a content adapter.

The frontend works with a single nested `content` object. The database stores
each section in its own normalized table (experiences, education, skills, …).
This router translates between the two:

  * _to_content(resume)      → assemble content dict from the resume + children
  * _apply_content(db, r, c) → decompose content into normalized child rows
"""
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import (
    Resume, Experience, Education, Skill, Project, Certification, Language, User,
    ResumeVersion, CustomSection,
)
from services.deps import get_current_user, tenant_id_of
from services.webhooks import dispatch
from services.audit import record as audit
from services.usage import log_usage_event, tenant_of
from services.ats_engine import ResumeParser, mode_orchestrator

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
    selectinload(Resume.custom_sections),
)


class ResumeUpsert(BaseModel):
    source: Optional[str] = None  # e.g. "ai_upgrade" — recorded on the version snapshot
    title: Optional[str] = "Untitled Resume"
    template_id: Optional[str] = "modern"
    content: Optional[Any] = None
    ats_score: Optional[int] = None
    # font_metadata/layout_metadata: {"family": str, "size": str} /
    # {"spacing": str} — the Resume Builder's font/spacing picker. Both
    # columns already existed on Resume (provisioned, never wired to
    # anything); this just lets the editor actually write to them.
    # Cosmetic-only — never read by any ATS scoring function.
    font_metadata: Optional[dict] = None
    layout_metadata: Optional[dict] = None


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
        "customSections": [
            {"id": str(cs.id), "title": cs.title or "", "content": cs.content or ""}
            for cs in r.custom_sections
        ],
    }


def _to_dict(r: Resume) -> dict:
    return {
        "id": str(r.id),
        "user_id": str(r.user_id),
        "title": r.title,
        "template_id": r.template_id,
        "is_public": r.is_public,
        "ats_score": r.ats_score,
        "template_type": r.template_type,
        "preserve_original": r.preserve_original,
        "original_file_type": r.original_file_type,
        "original_filename": r.original_filename,
        "font_metadata": r.font_metadata,
        "layout_metadata": r.layout_metadata,
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

    resume.custom_sections = [
        CustomSection(
            title=cs.get("title") or "",
            content=cs.get("content") or "",
            sort_order=i,
        )
        for i, cs in enumerate(content.get("customSections") or [])
    ]


async def _load_full(db: AsyncSession, rid: uuid.UUID) -> Optional[Resume]:
    result = await db.execute(
        select(Resume).where(Resume.id == rid).options(*_RESUME_LOADERS)
    )
    return result.scalar_one_or_none()


async def _get_owned(db: AsyncSession, resume_id: str, user: User) -> Resume:
    """The single ownership gate every resume-scoped endpoint below goes
    through (get/put/delete/duplicate/versions/download/share/change-template).

    Phase 1A: requires BOTH user ownership AND tenant match — not tenant
    instead of user, both (a guessed/leaked resume_id from another tenant's
    user is rejected even though UUIDs never collide across tenants, closing
    the gap for any future query that might filter by resume_id alone).
    Admin keeps its existing, unchanged platform-wide bypass — this mirrors
    exactly the bypass that already existed for user_id, so admin's
    cross-tenant access is neither newly granted nor newly restricted.
    Same 404-not-403 behavior as before: never reveal whether a resource
    exists in another tenant.
    """
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    r = await _load_full(db, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not user.is_admin:
        if r.user_id != user.id or r.tenant_id != tenant_id_of(user):
            raise HTTPException(status_code=404, detail="Resume not found")
    return r


def _canonical_ats_score(content: dict) -> Optional[int]:
    """ATS consolidation Phase 4: Resume.ats_score = canonical Resume ATS
    Health only (mode_orchestrator.resume_health_mode()) — never a
    client-supplied number, Role Readiness, or Job Match. Any ats_score the
    client sends on create/update/restore is ignored; this is the only
    function allowed to produce a value for that column here."""
    resume = ResumeParser.from_content(content or {})
    health = mode_orchestrator.resume_health_mode(resume)
    return health["score"]


# ── version history ───────────────────────────────────────────────────────────
def _version_dict(v: ResumeVersion) -> dict:
    return {
        "id": str(v.id),
        "title": v.title,
        "ats_score": v.ats_score,
        "source": v.source,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


async def _snapshot(db: AsyncSession, r: Resume, user_id, source: str, throttle: bool = False,
                     tenant_id=None) -> None:
    """Save a point-in-time snapshot of the resume; throttle + prune old ones.

    tenant_id defaults to the resume's own tenant_id when not passed
    explicitly — the resume was already loaded through _get_owned (or just
    created in the caller's own tenant), so r.tenant_id is always correct
    and available without every call site needing to thread the user object
    through. Never left unset: an explicit value is always used, matching
    the "never rely on the DB default" rule applied everywhere else in 1A.
    """
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
        resume_id=r.id, user_id=user_id, tenant_id=tenant_id if tenant_id is not None else r.tenant_id,
        title=r.title, template_id=r.template_id,
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
    # Phase 1A: user_id already fully determines "my resumes" (a UUID never
    # collides across tenants) — tenant_id is added as a second, independent
    # filter anyway, per the approved architecture ("we need BOTH"), so a
    # bug in the user_id clause alone can never leak another tenant's rows.
    result = await db.execute(
        select(Resume).where(Resume.user_id == user.id, Resume.tenant_id == tenant_id_of(user))
        .options(*_RESUME_LOADERS).order_by(Resume.updated_at.desc())
    )
    return [_to_dict(r) for r in result.scalars().unique().all()]


@router.post("/")
async def create_resume(
    body: ResumeUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # ATS consolidation Phase 4: body.ats_score is ignored — Resume.ats_score
    # is always the canonical Resume ATS Health, computed server-side from
    # the content actually being saved, never trusted from the client (see
    # _canonical_ats_score).
    r = Resume(
        user_id=user.id,
        tenant_id=tenant_id_of(user),
        title=body.title or "Untitled Resume",
        template_id=body.template_id or "modern",
        ats_score=_canonical_ats_score(body.content or {}),
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
    dispatch(user.id, "resume.upgraded" if body.source == "ai_upgrade" else "resume.created",
             {"id": str(full.id), "title": full.title, "ats_score": full.ats_score})
    audit(actor_id=str(user.id), actor_email=user.email, action="resume.create",
          entity_type="resume", entity_id=str(full.id), meta={"title": full.title})
    await log_usage_event(str(user.id), "resume_created", tenant_id=tenant_of(user),
                          metadata={"source": body.source or "manual"})
    return _to_dict(full)


def _slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (text or "resume").lower()).strip("-")[:40] or "resume"
    return f"{base}-{uuid.uuid4().hex[:8]}"


# ── public sharing (spec Milestone H) ───────────────────────────────────────
@router.get("/public/{slug}")
async def public_resume(slug: str, db: AsyncSession = Depends(get_db)):
    """Public read-only view of a shared resume — NO auth (spec: shareable web link)."""
    res = await db.execute(
        select(Resume).where(Resume.slug == slug, Resume.is_public == True).options(*_RESUME_LOADERS)  # noqa: E712
    )
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="This resume link is private or doesn't exist.")
    return {"title": r.title, "template_id": r.template_id, "content": _to_content(r)}


@router.post("/{resume_id}/share")
async def share_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Make a resume publicly viewable and return its shareable slug."""
    r = await _get_owned(db, resume_id, user)
    r.is_public = True
    if not r.slug:
        r.slug = _slugify(r.title)
    await db.commit()
    return {"slug": r.slug, "is_public": True}


@router.post("/{resume_id}/unshare")
async def unshare_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Revoke public access (the slug is kept so re-sharing gives the same link)."""
    r = await _get_owned(db, resume_id, user)
    r.is_public = False
    await db.commit()
    return {"slug": r.slug, "is_public": False}


@router.post("/{resume_id}/duplicate")
async def duplicate_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Duplicate a resume so the user can tailor a copy per job (spec Milestone F)."""
    src = await _get_owned(db, resume_id, user)
    content = _to_content(src)
    copy = Resume(
        user_id=user.id,
        tenant_id=tenant_id_of(user),
        title=f"{src.title} (Copy)",
        template_id=src.template_id,
        ats_score=src.ats_score,
        personal_info={}, achievements=[], interests=[],
    )
    await _apply_content(db, copy, content)
    db.add(copy)
    await db.commit()
    full = await _load_full(db, copy.id)
    await _snapshot(db, full, user.id, "duplicate")
    await db.commit()
    audit(actor_id=str(user.id), actor_email=user.email, action="resume.duplicate",
          entity_type="resume", entity_id=str(full.id), meta={"from": resume_id})
    await log_usage_event(str(user.id), "resume_duplicated", tenant_id=tenant_of(user),
                          metadata={"from": resume_id})
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
    # ATS consolidation Phase 4: body.ats_score is ignored on update — the
    # editor's own debounced /analyze-editor call is what keeps ats_score
    # fresh (canonical Resume ATS Health), on every content change; PUT
    # firing on every autosave is not the place to recompute it too.
    if body.font_metadata is not None:
        r.font_metadata = body.font_metadata
    if body.layout_metadata is not None:
        r.layout_metadata = body.layout_metadata
    if body.content is not None:
        await _apply_content(db, r, body.content)
    r.updated_at = datetime.now(timezone.utc)
    await db.commit()
    full = await _load_full(db, r.id)
    # throttled snapshot so active editing doesn't spam the history
    await _snapshot(db, full, user.id, body.source or "edit", throttle=True)
    await db.commit()
    dispatch(user.id, "resume.updated", {"id": str(full.id), "title": full.title, "ats_score": full.ats_score})
    return _to_dict(full)


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await _get_owned(db, resume_id, user)
    title = r.title
    await db.delete(r)
    await db.commit()
    dispatch(user.id, "resume.deleted", {"id": resume_id, "title": title})
    audit(actor_id=str(user.id), actor_email=user.email, action="resume.delete",
          entity_type="resume", entity_id=resume_id, meta={"title": title})


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
    # ATS consolidation Phase 4: the snapshotted v.ats_score is not trusted —
    # it may predate this consolidation, or simply be stale relative to a
    # score recomputed since that snapshot was taken. Recompute fresh,
    # canonically, from the content actually being restored.
    r.ats_score = _canonical_ats_score(v.content) if v.content is not None else r.ats_score
    r.updated_at = datetime.now(timezone.utc)
    await db.commit()

    full = await _load_full(db, r.id)
    await _snapshot(db, full, user.id, "rollback")
    await db.commit()
    audit(actor_id=str(user.id), actor_email=user.email, action="resume.rollback",
          entity_type="resume", entity_id=str(r.id), meta={"version_id": version_id})
    return _to_dict(full)


# ── design-preserving downloads (Mode 1 vs Mode 2 — see services/docx_editor.py) ──
@router.get("/{resume_id}/download/{fmt}")
async def download_resume(
    resume_id: str,
    fmt: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download this resume as PDF/DOCX.

    If it was uploaded and design preservation is on (preserve_original),
    reuses the ORIGINAL file's design instead of the SahiCareer generator —
    a PDF is returned byte-for-byte unchanged (see services/docx_editor.py's
    docstring for why PDFs are never rewritten); a DOCX gets the AI-improved
    text merged into the original's runs, keeping every font/color/table/
    header/footer untouched. Resumes built from scratch — or any resume after
    the user explicitly chooses 'Change Template' — use the normal generator.
    """
    if fmt not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'.")
    from routers.export import _content_disposition, _safe_filename_base
    r = await _get_owned(db, resume_id, user)
    safe_title = _safe_filename_base(r.title)
    media = ("application/pdf" if fmt == "pdf"
              else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    if r.preserve_original and r.original_file_path and r.original_file_type == fmt:
        from services.storage import download_bytes
        original_bytes = download_bytes(r.original_file_path)
        if original_bytes is None:
            raise HTTPException(status_code=502, detail="Could not retrieve your original file — try 'Change Template' instead.")

        if fmt == "pdf":
            out_bytes = original_bytes  # never rewritten — the original IS the download
        else:
            from services.docx_editor import apply_content_edits
            v1 = (await db.execute(
                select(ResumeVersion)
                .where(ResumeVersion.resume_id == r.id, ResumeVersion.source == "original_upload")
                .order_by(ResumeVersion.created_at.asc()).limit(1)
            )).scalar_one_or_none()
            baseline = v1.content if v1 and v1.content else _to_content(r)
            out_bytes, _report = apply_content_edits(original_bytes, baseline, _to_content(r))

        await log_usage_event(str(user.id), f"download_{fmt}_preserved", tenant_id=tenant_of(user),
                              metadata={"resume_id": resume_id})
        return StreamingResponse(
            io.BytesIO(out_bytes), media_type=media,
            headers={"Content-Disposition": _content_disposition(f"{safe_title}.{fmt}")},
        )

    # Not preserving an original design — use the template-aware SahiCareer
    # generator. r.template_id/r.font_metadata/r.layout_metadata (DB) are the
    # only source consulted here — this endpoint has no request body, so
    # there's no client-supplied value to even consider mixing in (see
    # export.py's module docstring on template_id resolution).
    from routers.export import TEMPLATE_BUILDERS, TEMPLATE_SPECS, DEFAULT_TEMPLATE_ID, _style_from_metadata
    template_id = r.template_id if r.template_id in TEMPLATE_SPECS else DEFAULT_TEMPLATE_ID
    style = _style_from_metadata(r.font_metadata, r.layout_metadata, template_id)
    builder = TEMPLATE_BUILDERS.get(template_id, TEMPLATE_BUILDERS[DEFAULT_TEMPLATE_ID])
    sections = TEMPLATE_SPECS[template_id]["sections"]
    content = _to_content(r)
    out_bytes = builder.pdf(content, r.title, sections, style) if fmt == "pdf" else builder.docx(content, r.title, sections, style)
    await log_usage_event(str(user.id), f"download_{fmt}", tenant_id=tenant_of(user),
                          metadata={"resume_id": resume_id, "template_id": template_id})
    return StreamingResponse(
        io.BytesIO(out_bytes), media_type=media,
        headers={"Content-Disposition": _content_disposition(f"{safe_title}.{fmt}")},
    )


@router.post("/{resume_id}/change-template")
async def change_template(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mode 2 — the ONLY way a resume's design switches away from a preserved
    original to the SahiCareer template. Always explicit, never automatic."""
    r = await _get_owned(db, resume_id, user)
    r.preserve_original = False
    r.template_type = "sahicareer"
    r.updated_at = datetime.now(timezone.utc)
    await db.commit()
    full = await _load_full(db, r.id)
    await _snapshot(db, full, user.id, "change_template")
    await db.commit()
    audit(actor_id=str(user.id), actor_email=user.email, action="resume.change_template",
          entity_type="resume", entity_id=str(r.id), meta={})
    return _to_dict(full)
