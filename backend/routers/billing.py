import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Payment
from services.auth import verify_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["Billing"])
security = HTTPBearer()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

PRICE_IDS = {
    "pro": os.getenv("STRIPE_PRICE_PRO", ""),
    "enterprise": os.getenv("STRIPE_PRICE_ENTERPRISE", ""),
}


async def _auth(c: HTTPAuthorizationCredentials = Depends(security)):
    return await verify_token(c.credentials)


class CheckoutRequest(BaseModel):
    plan: str  # "pro" or "enterprise"


@router.post("/create-checkout")
async def create_checkout(
    req: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(_auth),
):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured — set STRIPE_SECRET_KEY")

    price_id = PRICE_IDS.get(req.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Invalid plan or missing Stripe price ID for '{req.plan}'")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    result = await db.execute(select(User).where(User.id == uuid.UUID(str(user.id))))
    db_user = result.scalar_one_or_none()

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        customer_email=db_user.email if db_user else user.email,
        metadata={"user_id": str(user.id)},
        success_url=f"{FRONTEND_URL}/dashboard?upgraded=1",
        cancel_url=f"{FRONTEND_URL}/pricing",
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception as exc:
        logger.warning("Webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        if user_id:
            await _set_tier(db, user_id, "pro")
            await _record_payment(db, user_id, session)

    elif event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub = event["data"]["object"]
        status = sub.get("status")
        user_id = sub.get("metadata", {}).get("user_id")
        if user_id:
            tier = "free" if status in ("canceled", "unpaid", "incomplete_expired") else "pro"
            await _set_tier(db, user_id, tier)

    return {"received": True}


@router.get("/subscription")
async def get_subscription(db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    result = await db.execute(select(User).where(User.id == uuid.UUID(str(user.id))))
    db_user = result.scalar_one_or_none()
    tier = db_user.subscription_tier if db_user else "free"
    return {"tier": tier, "is_pro": tier in ("pro", "enterprise")}


async def _set_tier(db: AsyncSession, user_id: str, tier: str):
    try:
        result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if user:
            user.subscription_tier = tier
            await db.commit()
    except Exception as exc:
        logger.error("Failed to update subscription tier: %s", exc)


async def _record_payment(db: AsyncSession, user_id: str, session: dict):
    """Persist a Payment row from a completed Stripe checkout session."""
    try:
        payment = Payment(
            user_id=uuid.UUID(user_id),
            amount=session.get("amount_total") or 0,
            currency=session.get("currency") or "usd",
            status="succeeded" if session.get("payment_status") == "paid" else "pending",
            plan="pro",
            description="Checkout session completed",
            stripe_session_id=session.get("id"),
            stripe_payment_intent_id=session.get("payment_intent"),
            stripe_invoice_id=session.get("invoice"),
        )
        db.add(payment)
        await db.commit()
    except Exception as exc:
        logger.error("Failed to record payment: %s", exc)
        await db.rollback()


@router.get("/payments")
async def list_payments(db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    """The current user's payment history, newest first."""
    result = await db.execute(
        select(Payment).where(Payment.user_id == uuid.UUID(str(user.id)))
        .order_by(Payment.created_at.desc())
    )
    return [
        {
            "id": str(p.id),
            "amount": p.amount,
            "currency": p.currency,
            "status": p.status,
            "plan": p.plan,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in result.scalars().all()
    ]
