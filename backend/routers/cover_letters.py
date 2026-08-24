import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CoverLetter
from services.deps import get_current_user as _auth, tenant_id_of

router = APIRouter(prefix="/api/cover-letters", tags=["Cover Letters"])


class CoverLetterCreate(BaseModel):
    title: str
    content: str = ""


class CoverLetterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


def _to_dict(cl: CoverLetter) -> dict:
    return {
        "id": str(cl.id),
        "title": cl.title,
        "content": cl.content,
        "created_at": cl.created_at.isoformat(),
        "updated_at": cl.updated_at.isoformat(),
    }


async def _get_owned(db: AsyncSession, cl_id: str, user) -> CoverLetter:
    """Phase 1A: requires both user ownership AND tenant match — see
    routers/resumes.py::_get_owned for the full rationale (identical
    pattern). 404, never 403, on a cross-tenant/cross-user id."""
    try:
        cid = uuid.UUID(cl_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    result = await db.execute(
        select(CoverLetter).where(
            CoverLetter.id == cid,
            CoverLetter.user_id == uuid.UUID(str(user.id)),
            CoverLetter.tenant_id == tenant_id_of(user),
        )
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return cl


@router.get("/")
async def list_cover_letters(db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    result = await db.execute(
        select(CoverLetter)
        .where(CoverLetter.user_id == uuid.UUID(str(user.id)), CoverLetter.tenant_id == tenant_id_of(user))
        .order_by(CoverLetter.updated_at.desc())
    )
    return [_to_dict(cl) for cl in result.scalars().all()]


@router.post("/", status_code=201)
async def create_cover_letter(data: CoverLetterCreate, db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    cl = CoverLetter(user_id=uuid.UUID(str(user.id)), tenant_id=tenant_id_of(user),
                      title=data.title, content=data.content)
    db.add(cl)
    await db.commit()
    await db.refresh(cl)
    from services.webhooks import dispatch
    dispatch(user.id, "coverletter.generated", {"id": str(cl.id), "title": cl.title})
    return _to_dict(cl)


@router.get("/{cl_id}")
async def get_cover_letter(cl_id: str, db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    return _to_dict(await _get_owned(db, cl_id, user))


@router.put("/{cl_id}")
async def update_cover_letter(
    cl_id: str, data: CoverLetterUpdate, db: AsyncSession = Depends(get_db), user=Depends(_auth)
):
    cl = await _get_owned(db, cl_id, user)
    if data.title is not None:
        cl.title = data.title
    if data.content is not None:
        cl.content = data.content
    cl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cl)
    return _to_dict(cl)


@router.delete("/{cl_id}", status_code=204)
async def delete_cover_letter(cl_id: str, db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    cl = await _get_owned(db, cl_id, user)
    await db.delete(cl)
    await db.commit()
