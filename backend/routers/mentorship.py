"""
Mentorship API — marketplace, booking, learner/mentor dashboards, session
management, reviews, notifications, and admin.
"""
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services import mentorship as svc
from services import programs as programs_svc
from services import events as events_svc
from services import tasks as tasks_svc
from services import platform_feedback as pf_svc
from services import privacy_requests as pr_svc
from services.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/mentorship", tags=["Mentorship"])


def _uuid_or_404(value: str, label: str = "Resource") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"{label} not found")


@router.get("/mentors")
async def list_mentors(
    search: str = "",
    category: str | None = None,
    skills: str | None = Query(None, description="comma-separated"),
    languages: str | None = Query(None, description="comma-separated"),
    country: str | None = None,
    min_experience: int | None = None,
    max_price: int | None = None,
    session_type: str | None = None,
    sort: str = "rating",
    page: int = 1,
    page_size: int = 12,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await svc.list_mentors(
        db,
        search=search,
        category_slug=category,
        skills=[s.strip() for s in skills.split(",") if s.strip()] if skills else None,
        languages=[l.strip() for l in languages.split(",") if l.strip()] if languages else None,
        country=country,
        min_experience=min_experience,
        max_price=max_price,
        session_type=session_type,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/categories")
async def get_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"categories": await svc.list_categories(db)}


@router.get("/filters")
async def get_filter_options(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await svc.list_filter_options(db)


@router.get("/mentors/{mentor_id}")
async def get_mentor(
    mentor_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        mid = uuid.UUID(mentor_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Mentor not found")
    mentor = await svc.get_mentor(db, mid)
    if mentor is None:
        raise HTTPException(status_code=404, detail="Mentor not found")
    return mentor


class CreateBookingRequest(BaseModel):
    mentor_id: str
    date: date
    start_time: str          # "HH:MM"
    duration_minutes: int
    session_type: str
    agenda: str = ""

    @field_validator("start_time")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        datetime.strptime(v, "%H:%M")  # raises ValueError -> 422 if malformed
        return v


@router.post("/bookings", status_code=201)
async def create_booking(
    req: CreateBookingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        mentor_id = uuid.UUID(req.mentor_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Mentor not found")

    start_time = datetime.strptime(req.start_time, "%H:%M").time()
    try:
        result = await svc.create_booking(
            db,
            learner_id=user.id,
            mentor_id=mentor_id,
            booking_date=req.date,
            start_time=start_time,
            duration_minutes=req.duration_minutes,
            session_type=req.session_type,
            agenda=req.agenda,
        )
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except svc.BookingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.booking_created",
          entity_type="booking", entity_id=result["booking_id"])

    return result


@router.get("/bookings")
async def get_my_bookings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"bookings": await svc.list_my_bookings(db, user.id)}


class CancelBookingRequest(BaseModel):
    reason: str = ""


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    req: CancelBookingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        bid = uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Booking not found")
    try:
        await svc.cancel_booking(db, learner_id=user.id, booking_id=bid, reason=req.reason)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.booking_cancelled",
          entity_type="booking", entity_id=booking_id)
    return {"status": "cancelled"}


class RescheduleBookingRequest(BaseModel):
    date: date
    start_time: str
    duration_minutes: int | None = None

    @field_validator("start_time")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        datetime.strptime(v, "%H:%M")
        return v


@router.post("/bookings/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: str,
    req: RescheduleBookingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        bid = uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Booking not found")
    start_time = datetime.strptime(req.start_time, "%H:%M").time()
    try:
        result = await svc.reschedule_booking(
            db, actor_id=user.id, booking_id=bid, new_date=req.date,
            new_start_time=start_time, duration_minutes=req.duration_minutes,
        )
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except svc.BookingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.booking_rescheduled",
          entity_type="booking", entity_id=booking_id)
    return result


class SubmitReviewRequest(BaseModel):
    rating: int
    review_text: str = ""
    is_anonymous: bool = False


@router.post("/bookings/{booking_id}/review", status_code=201)
async def submit_review(
    booking_id: str,
    req: SubmitReviewRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        bid = uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Booking not found")
    try:
        result = await svc.submit_review(
            db, learner_id=user.id, booking_id=bid, rating=req.rating,
            review_text=req.review_text, is_anonymous=req.is_anonymous,
        )
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.review_submitted",
          entity_type="booking", entity_id=booking_id)
    return result


# ── Career Goals ──────────────────────────────────────────────────────────────

class CareerGoalRequest(BaseModel):
    title: str
    description: str = ""
    target_date: date | None = None


class CareerGoalStatusRequest(BaseModel):
    status: str


@router.get("/career-goals")
async def get_career_goals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"goals": await svc.list_career_goals(db, user.id)}


@router.post("/career-goals", status_code=201)
async def create_career_goal(
    req: CareerGoalRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await svc.create_career_goal(
            db, learner_id=user.id, title=req.title, description=req.description, target_date=req.target_date,
        )
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/career-goals/{goal_id}")
async def update_career_goal(
    goal_id: str,
    req: CareerGoalStatusRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        gid = uuid.UUID(goal_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Career goal not found")
    try:
        return await svc.update_career_goal(db, learner_id=user.id, goal_id=gid, status=req.status)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Session Notes ─────────────────────────────────────────────────────────────

class SessionNoteRequest(BaseModel):
    note_text: str
    visibility: str = "shared"


@router.get("/sessions/{session_id}/notes")
async def get_session_notes(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return {"notes": await svc.list_session_notes(db, user_id=user.id, session_id=sid)}
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/sessions/{session_id}/notes", status_code=201)
async def post_session_note(
    session_id: str,
    req: SessionNoteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return await svc.add_session_note(
            db, user_id=user.id, session_id=sid, note_text=req.note_text, visibility=req.visibility,
        )
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Mentor Dashboard (Module 7) ────────────────────────────────────────────────

@router.get("/mentor/dashboard")
async def get_mentor_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await svc.get_mentor_dashboard(db, user.id)
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class UpdateMentorProfileRequest(BaseModel):
    headline: str | None = None
    bio: str | None = None
    designation: str | None = None
    company: str | None = None
    years_experience: int | None = None
    country: str | None = None
    timezone: str | None = None
    session_price_amount: int | None = None


@router.patch("/mentor/profile")
async def update_mentor_profile(
    req: UpdateMentorProfileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await svc.update_mentor_profile(db, user.id, req.model_dump())
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class TagRequest(BaseModel):
    value: str


@router.post("/mentor/skills")
async def add_mentor_skill(req: TagRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return {"skills": await svc.add_mentor_skill(db, user.id, req.value)}
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/mentor/skills/{skill}")
async def remove_mentor_skill(skill: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return {"skills": await svc.remove_mentor_skill(db, user.id, skill)}
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/mentor/languages")
async def add_mentor_language(req: TagRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return {"languages": await svc.add_mentor_language(db, user.id, req.value)}
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/mentor/languages/{language}")
async def remove_mentor_language(language: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return {"languages": await svc.remove_mentor_language(db, user.id, language)}
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class AddAvailabilityRequest(BaseModel):
    day_of_week: int
    start_time: str  # "HH:MM"
    end_time: str


@router.post("/mentor/availability", status_code=201)
async def add_availability(
    req: AddAvailabilityRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        start_t = datetime.strptime(req.start_time, "%H:%M").time()
        end_t = datetime.strptime(req.end_time, "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=422, detail="Times must be HH:MM")
    try:
        return await svc.add_availability_rule(db, user.id, day_of_week=req.day_of_week, start_time=start_t, end_time=end_t)
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/mentor/availability/{rule_id}")
async def remove_availability(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        rid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Rule not found")
    try:
        await svc.remove_availability_rule(db, user.id, rid)
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "removed"}


class SessionStatusRequest(BaseModel):
    status: str


@router.patch("/mentor/sessions/{session_id}/status")
async def update_session_status(
    session_id: str,
    req: SessionStatusRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        await svc.update_session_status(db, user.id, sid, req.status)
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "updated"}


# ── Notifications (Module 10) ──────────────────────────────────────────────────

@router.get("/notifications")
async def get_notifications(
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notifications = await svc.list_notifications(db, user.id, unread_only=unread_only)
    unread_count = await svc.count_unread_notifications(db, user.id)
    return {"notifications": notifications, "unread_count": unread_count}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        nid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Notification not found")
    try:
        await svc.mark_notification_read(db, user.id, nid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "read"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await svc.mark_all_notifications_read(db, user.id)
    return {"status": "read"}


# ── Admin (Module 11) ────────────────────────────────────────────────────────

@router.get("/admin/stats")
async def admin_stats(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return await svc.admin_get_stats(db)


@router.get("/admin/mentors")
async def admin_list_mentors(
    status: str | None = None,
    search: str = "",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return {"mentors": await svc.admin_list_mentors(db, status=status, search=search)}


class MentorStatusRequest(BaseModel):
    status: str
    rejection_reason: str | None = None


@router.patch("/admin/mentors/{mentor_id}/status")
async def admin_update_mentor_status(
    mentor_id: str,
    req: MentorStatusRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        mid = uuid.UUID(mentor_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Mentor not found")
    try:
        return await svc.admin_update_mentor_status(
            db, admin_id=admin.id, mentor_id=mid, status=req.status, rejection_reason=req.rejection_reason
        )
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/admin/eligible-profiles")
async def admin_eligible_profiles(
    search: str = "",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return {"profiles": await svc.admin_search_eligible_profiles(db, search=search)}


class CreateMentorRequest(BaseModel):
    profile_id: str
    headline: str = ""
    bio: str = ""
    designation: str = ""
    company: str = ""
    years_experience: int = 0
    country: str | None = None
    timezone: str = "Asia/Kolkata"
    session_price_amount: int = 0
    session_price_currency: str = "INR"
    category_ids: list[str] = []
    skills: list[str] = []
    languages: list[str] = []


@router.post("/admin/mentors", status_code=201)
async def admin_create_mentor(
    req: CreateMentorRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        pid = uuid.UUID(req.profile_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile id")
    try:
        return await svc.admin_create_mentor(
            db, created_by=admin.id, profile_id=pid, headline=req.headline, bio=req.bio,
            designation=req.designation, company=req.company, years_experience=req.years_experience,
            country=req.country, timezone=req.timezone, session_price_amount=req.session_price_amount,
            session_price_currency=req.session_price_currency, category_ids=req.category_ids,
            skills=req.skills, languages=req.languages,
        )
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/admin/categories")
async def admin_list_categories(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"categories": await svc.admin_list_categories(db)}


class CreateCategoryRequest(BaseModel):
    name: str
    icon: str | None = None
    sort_order: int = 0


@router.post("/admin/categories", status_code=201)
async def admin_create_category(
    req: CreateCategoryRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        return await svc.admin_create_category(db, name=req.name, icon=req.icon, sort_order=req.sort_order)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class UpdateCategoryRequest(BaseModel):
    name: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


@router.patch("/admin/categories/{category_id}")
async def admin_update_category(
    category_id: str,
    req: UpdateCategoryRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        cid = uuid.UUID(category_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Category not found")
    try:
        return await svc.admin_update_category(db, cid, req.model_dump())
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ═════════════════════════════════════════════════════════════════════════
# Self-serve mentor application
# ═════════════════════════════════════════════════════════════════════════

class ApplyAsMentorRequest(BaseModel):
    headline: str = ""
    bio: str = ""
    designation: str = ""
    company: str = ""
    years_experience: int = 0
    country: str | None = None
    timezone: str = "Asia/Kolkata"
    category_ids: list[str] = []
    skills: list[str] = []
    languages: list[str] = []


@router.post("/apply", status_code=201)
async def apply_as_mentor(
    req: ApplyAsMentorRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        result = await svc.apply_as_mentor(
            db, profile_id=user.id, headline=req.headline, bio=req.bio, designation=req.designation,
            company=req.company, years_experience=req.years_experience, country=req.country,
            timezone=req.timezone, category_ids=req.category_ids, skills=req.skills, languages=req.languages,
        )
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.mentor_applied", entity_type="mentor", entity_id=result["id"])
    return result


# ═════════════════════════════════════════════════════════════════════════
# Mentee Dashboard
# ═════════════════════════════════════════════════════════════════════════

@router.get("/mentee/dashboard")
async def mentee_dashboard(
    month: str | None = Query(None, description="YYYY-MM, defaults to current month"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await svc.get_mentee_dashboard(db, user.id, month=month)


# ═════════════════════════════════════════════════════════════════════════
# Mentor Offerings
# ═════════════════════════════════════════════════════════════════════════

class OfferingRequest(BaseModel):
    title: str
    description: str = ""
    session_type: str = "one_on_one"
    duration_minutes: int = 30


class OfferingUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    session_type: str | None = None
    duration_minutes: int | None = None
    is_active: bool | None = None


@router.get("/mentor/offerings")
async def get_mentor_offerings(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return {"offerings": await svc.list_mentor_offerings(db, user.id)}
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/mentor/offerings", status_code=201)
async def create_mentor_offering(req: OfferingRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await svc.add_mentor_offering(
            db, user.id, title=req.title, description=req.description,
            session_type=req.session_type, duration_minutes=req.duration_minutes,
        )
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/mentor/offerings/{offering_id}")
async def update_mentor_offering(offering_id: str, req: OfferingUpdateRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    oid = _uuid_or_404(offering_id, "Offering")
    try:
        return await svc.update_mentor_offering(db, user.id, oid, req.model_dump())
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/mentor/offerings/{offering_id}")
async def delete_mentor_offering(offering_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    oid = _uuid_or_404(offering_id, "Offering")
    try:
        await svc.remove_mentor_offering(db, user.id, oid)
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "removed"}


# ═════════════════════════════════════════════════════════════════════════
# Programs
# ═════════════════════════════════════════════════════════════════════════

class ProgramJoinRequest(BaseModel):
    role: str


@router.get("/programs")
async def list_programs(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"programs": await programs_svc.list_programs(db, user.id)}


@router.get("/programs/{program_id}")
async def get_program(program_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pid = _uuid_or_404(program_id, "Program")
    try:
        return await programs_svc.get_program(db, pid, user.id)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/programs/{program_id}/join")
async def join_program(program_id: str, req: ProgramJoinRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pid = _uuid_or_404(program_id, "Program")
    try:
        return await programs_svc.join_program(db, pid, user.id, req.role)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/programs/{program_id}/leave")
async def leave_program(program_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    pid = _uuid_or_404(program_id, "Program")
    try:
        await programs_svc.leave_program(db, pid, user.id)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "left"}


# ═════════════════════════════════════════════════════════════════════════
# Events
# ═════════════════════════════════════════════════════════════════════════

@router.get("/events")
async def list_events(upcoming_only: bool = True, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"events": await events_svc.list_events(db, user.id, upcoming_only=upcoming_only)}


@router.get("/events/{event_id}")
async def get_event(event_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    eid = _uuid_or_404(event_id, "Event")
    try:
        return await events_svc.get_event(db, eid, user.id)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/events/{event_id}/register")
async def register_for_event(event_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    eid = _uuid_or_404(event_id, "Event")
    try:
        return await events_svc.register_for_event(db, eid, user.id)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/events/{event_id}/register")
async def unregister_from_event(event_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    eid = _uuid_or_404(event_id, "Event")
    try:
        await events_svc.unregister_from_event(db, eid, user.id)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "unregistered"}


# ═════════════════════════════════════════════════════════════════════════
# Tasks
# ═════════════════════════════════════════════════════════════════════════

class CreateTaskRequest(BaseModel):
    mentee_id: str
    title: str
    description: str = ""
    due_date: date | None = None
    session_id: str | None = None
    program_id: str | None = None


class TaskStatusRequest(BaseModel):
    status: str


@router.get("/tasks")
async def list_my_tasks(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"tasks": await tasks_svc.list_my_tasks(db, user.id)}


@router.patch("/tasks/{task_id}")
async def update_task_status(task_id: str, req: TaskStatusRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    tid = _uuid_or_404(task_id, "Task")
    try:
        return await tasks_svc.complete_task(db, user.id, tid, status=req.status)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/mentor/tasks")
async def list_tasks_i_assigned(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"tasks": await tasks_svc.list_tasks_assigned_by_mentor(db, user.id)}


@router.post("/mentor/tasks", status_code=201)
async def create_task(req: CreateTaskRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    mentee_id = _uuid_or_404(req.mentee_id, "Mentee")
    session_id = _uuid_or_404(req.session_id, "Session") if req.session_id else None
    program_id = _uuid_or_404(req.program_id, "Program") if req.program_id else None
    try:
        return await tasks_svc.create_task(
            db, mentor_profile_id=user.id, mentee_id=mentee_id, title=req.title, description=req.description,
            due_date=req.due_date, session_id=session_id, program_id=program_id,
        )
    except svc.NotAMentorError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ═════════════════════════════════════════════════════════════════════════
# Platform Feedback
# ═════════════════════════════════════════════════════════════════════════

class PlatformFeedbackRequest(BaseModel):
    rating: int
    comment: str = ""


@router.post("/platform-feedback", status_code=201)
async def submit_platform_feedback(req: PlatformFeedbackRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = await pf_svc.submit_feedback(db, user.id, rating=req.rating, comment=req.comment)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action="mentorship.platform_feedback_submitted", entity_type="platform_feedback", entity_id=result["id"])
    return result


@router.get("/platform-feedback/mine")
async def get_my_platform_feedback(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"feedback": await pf_svc.list_my_feedback(db, user.id)}


# ═════════════════════════════════════════════════════════════════════════
# Privacy & My Data
# ═════════════════════════════════════════════════════════════════════════

class PrivacyRequestRequest(BaseModel):
    type: str
    notes: str = ""


@router.get("/privacy-requests")
async def get_my_privacy_requests(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"requests": await pr_svc.list_my_requests(db, user.id)}


@router.post("/privacy-requests", status_code=201)
async def submit_privacy_request(req: PrivacyRequestRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = await pr_svc.submit_request(db, user.id, type=req.type, notes=req.notes)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=user.id, actor_email=user.email, action=f"mentorship.privacy_request_{req.type}", entity_type="privacy_request", entity_id=result["id"])
    return result


# ═════════════════════════════════════════════════════════════════════════
# Leaderboard (mentor + admin views share the same computation)
# ═════════════════════════════════════════════════════════════════════════

@router.get("/leaderboard")
async def leaderboard(days: int = 30, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return {"leaderboard": await svc.get_leaderboard(db, days=days)}


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Read-only branding for any logged-in user — sidebars/headers use this
    so the admin's Settings page actually changes what's displayed, instead
    of just persisting to a field nothing reads back."""
    return await svc.get_platform_settings(db)


# ═════════════════════════════════════════════════════════════════════════
# Admin: Dashboard widgets
# ═════════════════════════════════════════════════════════════════════════

@router.get("/admin/schedule")
async def admin_schedule(
    week_start: date = Query(..., description="YYYY-MM-DD, any date in the target week's Monday-start range"),
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    return await svc.admin_get_schedule(db, week_start)


@router.get("/admin/growth")
async def admin_growth(metric: str = "sessions", days: int = 30, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        return await svc.admin_get_growth(db, metric=metric, days=days)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/admin/platform-health")
async def admin_platform_health(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return await svc.admin_get_platform_health(db)


@router.get("/admin/action-queue")
async def admin_action_queue(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return await svc.admin_get_action_queue(db)


@router.get("/admin/leaderboard")
async def admin_leaderboard(days: int = 30, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"leaderboard": await svc.get_leaderboard(db, days=days)}


@router.get("/admin/listings")
async def admin_listings(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"listings": await svc.admin_get_mentorship_listings(db)}


@router.get("/admin/sessions")
async def admin_sessions(
    status: str | None = None, mentor_search: str = "", learner_search: str = "",
    page: int = 1, page_size: int = 25,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin),
):
    return await svc.admin_list_sessions(db, status=status, mentor_search=mentor_search, learner_search=learner_search, page=page, page_size=page_size)


@router.get("/admin/recent-feedback")
async def admin_recent_feedback(limit: int = 10, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"feedback": await svc.admin_get_recent_feedback(db, limit)}


@router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rid = _uuid_or_404(review_id, "Review")
    try:
        await svc.admin_delete_review(db, rid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.review_removed", entity_type="review", entity_id=review_id)
    return {"status": "removed"}


# ═════════════════════════════════════════════════════════════════════════
# Admin: Programs
# ═════════════════════════════════════════════════════════════════════════

class CreateProgramRequest(BaseModel):
    title: str
    description: str = ""
    duration: str = ""


class UpdateProgramRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    duration: str | None = None
    status: str | None = None


class AssignParticipantRequest(BaseModel):
    profile_id: str
    role: str


@router.get("/admin/programs")
async def admin_list_programs(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"programs": await programs_svc.admin_list_programs(db)}


@router.post("/admin/programs", status_code=201)
async def admin_create_program(req: CreateProgramRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        result = await programs_svc.admin_create_program(db, created_by=admin.id, title=req.title, description=req.description, duration=req.duration)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.program_created", entity_type="program", entity_id=result["id"])
    return result


@router.patch("/admin/programs/{program_id}")
async def admin_update_program(program_id: str, req: UpdateProgramRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    pid = _uuid_or_404(program_id, "Program")
    try:
        return await programs_svc.admin_update_program(db, pid, req.model_dump())
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/admin/programs/{program_id}")
async def admin_delete_program(program_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    pid = _uuid_or_404(program_id, "Program")
    try:
        await programs_svc.admin_delete_program(db, pid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.program_deleted", entity_type="program", entity_id=program_id)
    return {"status": "deleted"}


@router.post("/admin/programs/{program_id}/participants", status_code=201)
async def admin_assign_participant(program_id: str, req: AssignParticipantRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    pid = _uuid_or_404(program_id, "Program")
    profile_id = _uuid_or_404(req.profile_id, "Profile")
    try:
        return await programs_svc.admin_assign_participant(db, pid, profile_id, req.role)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/admin/programs/{program_id}/participants/{profile_id}")
async def admin_remove_participant(program_id: str, profile_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    pid = _uuid_or_404(program_id, "Program")
    prid = _uuid_or_404(profile_id, "Profile")
    try:
        await programs_svc.admin_remove_participant(db, pid, prid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "removed"}


# ═════════════════════════════════════════════════════════════════════════
# Admin: Events
# ═════════════════════════════════════════════════════════════════════════

class CreateEventRequest(BaseModel):
    title: str
    description: str = ""
    event_date: datetime


class UpdateEventRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    event_date: datetime | None = None


class MarkAttendedRequest(BaseModel):
    profile_id: str
    attended: bool = True


@router.get("/admin/events")
async def admin_list_events(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"events": await events_svc.admin_list_events(db)}


@router.post("/admin/events", status_code=201)
async def admin_create_event(req: CreateEventRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        result = await events_svc.admin_create_event(db, created_by=admin.id, title=req.title, description=req.description, event_date=req.event_date)
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.event_created", entity_type="event", entity_id=result["id"])
    return result


@router.patch("/admin/events/{event_id}")
async def admin_update_event(event_id: str, req: UpdateEventRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    eid = _uuid_or_404(event_id, "Event")
    try:
        return await events_svc.admin_update_event(db, eid, req.model_dump())
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/admin/events/{event_id}")
async def admin_delete_event(event_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    eid = _uuid_or_404(event_id, "Event")
    try:
        await events_svc.admin_delete_event(db, eid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.event_deleted", entity_type="event", entity_id=event_id)
    return {"status": "deleted"}


@router.post("/admin/events/{event_id}/attendance")
async def admin_mark_attended(event_id: str, req: MarkAttendedRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    eid = _uuid_or_404(event_id, "Event")
    profile_id = _uuid_or_404(req.profile_id, "Profile")
    try:
        await events_svc.admin_mark_attended(db, eid, profile_id, req.attended)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"status": "updated"}


# ═════════════════════════════════════════════════════════════════════════
# Admin: Platform Feedback / Privacy Requests / Settings
# ═════════════════════════════════════════════════════════════════════════

@router.get("/admin/platform-feedback")
async def admin_platform_feedback(limit: int = 100, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"feedback": await pf_svc.admin_list_feedback(db, limit)}


@router.get("/admin/privacy-requests")
async def admin_privacy_requests(status: str | None = None, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return {"requests": await pr_svc.admin_list_requests(db, status=status)}


class PrivacyRequestStatusRequest(BaseModel):
    status: str


@router.patch("/admin/privacy-requests/{request_id}")
async def admin_update_privacy_request(request_id: str, req: PrivacyRequestStatusRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    rid = _uuid_or_404(request_id, "Privacy request")
    try:
        result = await pr_svc.admin_update_request_status(db, admin.id, rid, req.status)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.privacy_request_processed", entity_type="privacy_request", entity_id=request_id, meta={"status": req.status})
    return result


@router.post("/admin/privacy-requests/{request_id}/execute-delete")
async def admin_execute_privacy_deletion(request_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """One click, one action: actually deletes the account (Supabase auth
    identity + local profile, cascading to their resumes/cover letters/etc.)
    and marks the request completed — not a status flip the admin has to
    separately remember to back up with a real deletion."""
    rid = _uuid_or_404(request_id, "Privacy request")
    try:
        result = await pr_svc.admin_execute_account_deletion(db, admin.id, rid)
    except svc.BookingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except svc.BookingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.privacy_request_account_deleted",
          entity_type="privacy_request", entity_id=request_id, meta={"deleted_email": result["deleted_email"]})
    return result["request"]


class PlatformSettingsRequest(BaseModel):
    brand_name: str | None = None
    support_email: str | None = None
    maintenance_mode: bool | None = None
    announcement: str | None = None


@router.get("/admin/settings")
async def admin_get_settings(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return await svc.get_platform_settings(db)


@router.patch("/admin/settings")
async def admin_update_settings(req: PlatformSettingsRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await svc.update_platform_settings(db, admin.id, req.model_dump())
    from services.audit import record as audit
    audit(actor_id=admin.id, actor_email=admin.email, action="mentorship.settings_updated", entity_type="platform_settings", entity_id=None)
    return result
