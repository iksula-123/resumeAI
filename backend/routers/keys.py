"""Manage API keys (JWT-authenticated dashboard endpoints)."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import ApiKey, User
from services.deps import get_current_user
from services.apikeys import generate_key, hash_key, prefix_of
from services.audit import record as audit

router = APIRouter(prefix="/api/keys", tags=["API Keys"])


class KeyCreate(BaseModel):
    name: str = "API Key"


def _dict(k: ApiKey) -> dict:
    return {
        "id": str(k.id),
        "name": k.name,
        "key_prefix": k.key_prefix,
        "revoked": k.revoked,
        "last_used": k.last_used.isoformat() if k.last_used else None,
        "created_at": k.created_at.isoformat() if k.created_at else None,
    }


@router.get("/")
async def list_keys(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
    )
    return [_dict(k) for k in res.scalars().all()]


@router.post("/", status_code=201)
async def create_key(body: KeyCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    raw = generate_key()
    rec = ApiKey(user_id=user.id, name=body.name or "API Key", key_prefix=prefix_of(raw), key_hash=hash_key(raw))
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    audit(actor_id=str(user.id), actor_email=user.email, action="apikey.create",
          entity_type="api_key", entity_id=str(rec.id), meta={"name": rec.name})
    # full key returned ONCE — never stored or shown again
    return {**_dict(rec), "key": raw}


@router.delete("/{key_id}", status_code=204)
async def revoke_key(key_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        kid = uuid.UUID(key_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Key not found")
    rec = (await db.execute(select(ApiKey).where(ApiKey.id == kid))).scalar_one_or_none()
    if not rec or rec.user_id != user.id:
        raise HTTPException(status_code=404, detail="Key not found")
    rec.revoked = True
    await db.commit()
    audit(actor_id=str(user.id), actor_email=user.email, action="apikey.revoke",
          entity_type="api_key", entity_id=str(rec.id), meta={"name": rec.name})
