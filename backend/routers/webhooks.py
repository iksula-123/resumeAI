"""Manage outgoing webhooks (JWT-authenticated dashboard endpoints)."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Webhook, WebhookDelivery, User
from services.deps import get_current_user
from services.webhooks import EVENTS, generate_secret, send_test
from services.audit import record as audit

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


class WebhookCreate(BaseModel):
    url: str
    events: list[str] = []


class WebhookUpdate(BaseModel):
    active: bool | None = None
    events: list[str] | None = None


def _dict(w: Webhook, secret: bool = False) -> dict:
    d = {
        "id": str(w.id),
        "url": w.url,
        "events": w.events or [],
        "active": w.active,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }
    if secret:
        d["secret"] = w.secret
    else:
        d["secret_hint"] = (w.secret[:12] + "…") if w.secret else ""
    return d


async def _owned(db: AsyncSession, wid: str, user: User) -> Webhook:
    try:
        _id = uuid.UUID(wid)
    except ValueError:
        raise HTTPException(status_code=404, detail="Webhook not found")
    w = (await db.execute(select(Webhook).where(Webhook.id == _id))).scalar_one_or_none()
    if not w or w.user_id != user.id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return w


@router.get("/events")
async def available_events(user: User = Depends(get_current_user)):
    return {"events": EVENTS}


@router.get("/")
async def list_webhooks(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await db.execute(select(Webhook).where(Webhook.user_id == user.id).order_by(Webhook.created_at.desc()))
    return [_dict(w) for w in res.scalars().all()]


@router.post("/", status_code=201)
async def create_webhook(body: WebhookCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    events = [e for e in body.events if e in EVENTS] or EVENTS
    w = Webhook(user_id=user.id, url=body.url, secret=generate_secret(), events=events, active=True)
    db.add(w)
    await db.commit()
    await db.refresh(w)
    audit(actor_id=str(user.id), actor_email=user.email, action="webhook.create",
          entity_type="webhook", entity_id=str(w.id), meta={"url": w.url})
    return _dict(w, secret=True)  # secret shown once


@router.patch("/{wid}")
async def update_webhook(wid: str, body: WebhookUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    w = await _owned(db, wid, user)
    if body.active is not None:
        w.active = body.active
    if body.events is not None:
        w.events = [e for e in body.events if e in EVENTS]
    await db.commit()
    await db.refresh(w)
    return _dict(w)


@router.delete("/{wid}", status_code=204)
async def delete_webhook(wid: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    w = await _owned(db, wid, user)
    url = w.url
    await db.delete(w)
    await db.commit()
    audit(actor_id=str(user.id), actor_email=user.email, action="webhook.delete",
          entity_type="webhook", entity_id=wid, meta={"url": url})


@router.get("/{wid}/deliveries")
async def deliveries(wid: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    w = await _owned(db, wid, user)
    res = await db.execute(
        select(WebhookDelivery).where(WebhookDelivery.webhook_id == w.id)
        .order_by(WebhookDelivery.created_at.desc()).limit(20)
    )
    return [{
        "id": str(d.id), "event": d.event, "success": d.success, "status_code": d.status_code,
        "attempts": d.attempts, "error": d.error,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    } for d in res.scalars().all()]


@router.post("/{wid}/test")
async def test_webhook(wid: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    w = await _owned(db, wid, user)
    return await send_test(w)
