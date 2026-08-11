"""
Mentorship service — the Marketplace module (query/filter/sort/paginate
approved mentors). Portable across SQLite (dev fallback) and Postgres
(Supabase): built on the ORM with eager-loaded relationships rather than
Postgres-only aggregate SQL, so it works the same on both.
"""
import math
import re
import uuid
from datetime import date, datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Mentor, MentorSkill, MentorLanguage, MentorCategory, MentorCategoryLink, Profile,
    MentorAvailability, MentorSession, Review, Booking, CareerGoal, SessionNote, MeetingLink,
    MentorshipNotification, SESSION_TYPES, MENTOR_STATUSES, BOOKING_STATUSES,
    MentorOffering, Program, ProgramParticipant, Event, EventAttendee,
)
from services.audit import record as audit

SORT_OPTIONS = {
    "rating": (Mentor.rating_avg.desc(), Mentor.rating_count.desc()),
    "sessions": (Mentor.sessions_completed.desc(),),
    "newest": (Mentor.approved_at.desc().nullslast(), Mentor.created_at.desc()),
    "price_low": (Mentor.session_price_amount.asc(),),
    "price_high": (Mentor.session_price_amount.desc(),),
}
DEFAULT_SORT = "rating"
MAX_PAGE_SIZE = 50


def _mentor_to_dict(m: Mentor) -> dict:
    return {
        "id": str(m.id),
        "profile_id": str(m.profile_id),
        "full_name": m.profile.full_name if m.profile else None,
        "avatar_url": m.profile.avatar_url if m.profile else None,
        "headline": m.headline,
        "designation": m.designation,
        "company": m.company,
        "years_experience": m.years_experience,
        "country": m.country,
        "timezone": m.timezone,
        "session_price_amount": m.session_price_amount,
        "session_price_currency": m.session_price_currency,
        "is_featured": m.is_featured,
        "rating_avg": float(m.rating_avg or 0),
        "rating_count": m.rating_count,
        "sessions_completed": m.sessions_completed,
        "skills": sorted({s.skill for s in m.skills}),
        "languages": sorted({l.language for l in m.languages}),
        "categories": sorted({cl.category.name for cl in m.category_links if cl.category}),
        "has_availability": len(m.availability) > 0,
    }


async def list_mentors(
    db: AsyncSession,
    *,
    search: str = "",
    category_slug: str | None = None,
    skills: list[str] | None = None,
    languages: list[str] | None = None,
    country: str | None = None,
    min_experience: int | None = None,
    max_price: int | None = None,
    session_type: str | None = None,
    sort: str = DEFAULT_SORT,
    page: int = 1,
    page_size: int = 12,
) -> dict:
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    query = (
        select(Mentor)
        .join(Profile, Mentor.profile_id == Profile.id)
        .where(Mentor.status == "approved", Mentor.deleted_at.is_(None))
        .options(
            selectinload(Mentor.profile),
            selectinload(Mentor.skills),
            selectinload(Mentor.languages),
            selectinload(Mentor.category_links).selectinload(MentorCategoryLink.category),
            selectinload(Mentor.availability),
        )
    )

    if search.strip():
        like = f"%{search.strip()}%"
        query = query.where(or_(
            Profile.full_name.ilike(like),
            Mentor.headline.ilike(like),
            Mentor.designation.ilike(like),
            Mentor.company.ilike(like),
        ))

    if category_slug:
        query = query.where(Mentor.id.in_(
            select(MentorCategoryLink.mentor_id)
            .join(MentorCategory, MentorCategoryLink.category_id == MentorCategory.id)
            .where(MentorCategory.slug == category_slug)
        ))

    if skills:
        for skill in skills:
            query = query.where(Mentor.id.in_(
                select(MentorSkill.mentor_id).where(MentorSkill.skill.ilike(skill))
            ))

    if languages:
        for lang in languages:
            query = query.where(Mentor.id.in_(
                select(MentorLanguage.mentor_id).where(MentorLanguage.language.ilike(lang))
            ))

    if country:
        query = query.where(Mentor.country.ilike(country))

    if min_experience is not None:
        query = query.where(Mentor.years_experience >= min_experience)

    if max_price is not None:
        query = query.where(Mentor.session_price_amount <= max_price)

    # session_type lives on bookings, not mentors — mentors don't currently
    # restrict which types they offer, so this filter is a no-op until that
    # exists. (Left as an accepted, documented no-op rather than silently
    # dropped, so it's obvious in review — not a fabricated filter.)
    _ = session_type

    count_query = select(func.count()).select_from(query.with_only_columns(Mentor.id).subquery())
    total = (await db.execute(count_query)).scalar_one()

    order_by = SORT_OPTIONS.get(sort, SORT_OPTIONS[DEFAULT_SORT])
    query = query.order_by(Mentor.is_featured.desc(), *order_by).offset((page - 1) * page_size).limit(page_size)

    rows = (await db.execute(query)).unique().scalars().all()

    return {
        "mentors": [_mentor_to_dict(m) for m in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
    }


async def list_categories(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(
        select(MentorCategory)
        .where(MentorCategory.is_active.is_(True))
        .order_by(MentorCategory.sort_order, MentorCategory.name)
    )).scalars().all()
    return [{"id": str(c.id), "name": c.name, "slug": c.slug, "icon": c.icon} for c in rows]


async def list_filter_options(db: AsyncSession) -> dict:
    """Distinct skills/languages/countries actually present among approved
    mentors — populated from real data, never a static list."""
    approved_mentor_ids = select(Mentor.id).where(Mentor.status == "approved", Mentor.deleted_at.is_(None))

    skills = (await db.execute(
        select(MentorSkill.skill).where(MentorSkill.mentor_id.in_(approved_mentor_ids)).distinct()
    )).scalars().all()
    langs = (await db.execute(
        select(MentorLanguage.language).where(MentorLanguage.mentor_id.in_(approved_mentor_ids)).distinct()
    )).scalars().all()
    countries = (await db.execute(
        select(Mentor.country).where(Mentor.id.in_(approved_mentor_ids), Mentor.country.is_not(None)).distinct()
    )).scalars().all()

    return {
        "skills": sorted(skills),
        "languages": sorted(langs),
        "countries": sorted(countries),
    }


# ── Mentor Profile (Module 4) ────────────────────────────────────────────────

UPCOMING_WINDOW_DAYS = 14
MAX_UPCOMING_SLOTS = 10


def _overlaps(a_start: dtime, a_end: dtime, b_start: dtime, b_end: dtime) -> bool:
    return a_start < b_end and b_start < a_end


def _subtract_busy(
    day: date, windows: list[tuple[dtime, dtime]],
    busy: list[tuple[datetime, datetime]], tz: ZoneInfo,
) -> list[tuple[dtime, dtime]]:
    """Remove any portion of `windows` (local wall-clock times on `day`, in `tz`)
    that overlaps a busy (booked) interval. Booked times are absolute (UTC)
    timestamptz values, so they're converted into the mentor's local tz first —
    comparing them directly against local wall-clock times would be wrong."""
    day_busy = []
    for b_start, b_end in busy:
        local_start = b_start.astimezone(tz)
        local_end = b_end.astimezone(tz)
        if local_start.date() == day:
            day_busy.append((local_start.time(), local_end.time()))

    free = []
    for w_start, w_end in windows:
        if not any(_overlaps(w_start, w_end, b_start, b_end) for b_start, b_end in day_busy):
            free.append((w_start, w_end))
    return free


def _resolve_tz(mentor_timezone: str) -> ZoneInfo:
    try:
        return ZoneInfo(mentor_timezone)
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def _friendly_time(dt: datetime) -> str:
    """'6:30 PM' — %-I / %#I aren't portable across platforms, so format
    with a leading zero (%I) and strip it in Python instead."""
    return dt.strftime("%I:%M %p").lstrip("0")


def _friendly_datetime(dt: datetime) -> str:
    """'Wed, Aug 12 at 6:30 PM'"""
    day = dt.strftime("%d").lstrip("0")
    return f"{dt.strftime('%a, %b')} {day} at {_friendly_time(dt)}"


async def _load_availability_context(
    db: AsyncSession, mentor_id: uuid.UUID, range_start_day: date, range_end_day: date,
):
    """Shared fetch for both the upcoming-slots list and single-slot validation:
    active availability rules + already-booked sessions in the window."""
    rules = (await db.execute(
        select(MentorAvailability).where(
            MentorAvailability.mentor_id == mentor_id,
            MentorAvailability.is_active.is_(True),
        )
    )).scalars().all()

    recurring = [r for r in rules if r.rule_type == "recurring"]
    overrides = [r for r in rules if r.rule_type == "date_override" and range_start_day <= r.specific_date <= range_end_day]
    blackout_dates = {r.specific_date for r in rules if r.rule_type == "blackout" and range_start_day <= r.specific_date <= range_end_day}

    utc = ZoneInfo("UTC")
    range_start = datetime.combine(range_start_day - timedelta(days=1), dtime.min, tzinfo=utc)
    range_end = datetime.combine(range_end_day + timedelta(days=1), dtime.max, tzinfo=utc)

    booked = (await db.execute(
        select(MentorSession.scheduled_start, MentorSession.scheduled_end).where(
            MentorSession.mentor_id == mentor_id,
            MentorSession.status == "scheduled",
            MentorSession.deleted_at.is_(None),
            MentorSession.scheduled_start >= range_start,
            MentorSession.scheduled_start <= range_end,
        )
    )).all()

    return recurring, overrides, blackout_dates, booked


def _free_windows_for_date(
    day: date, recurring: list, overrides: list, blackout_dates: set,
    booked: list[tuple[datetime, datetime]], tz: ZoneInfo,
) -> list[tuple[dtime, dtime]]:
    if day in blackout_dates:
        return []
    sunday_indexed_dow = (day.weekday() + 1) % 7  # Python Mon=0..Sun=6 -> Sun=0..Sat=6
    day_windows = [(r.start_time, r.end_time) for r in recurring if r.day_of_week == sunday_indexed_dow]
    day_windows += [(r.start_time, r.end_time) for r in overrides if r.specific_date == day]
    if not day_windows:
        return []
    return _subtract_busy(day, day_windows, booked, tz)


async def _compute_upcoming_slots(db: AsyncSession, mentor_id: uuid.UUID, mentor_timezone: str) -> list[dict]:
    """Real, DB-derived open windows for the next UPCOMING_WINDOW_DAYS days —
    recurring weekly rules + date overrides, minus blackout dates and minus
    anything already booked. Read-only display; actual booking re-validates
    the exact requested slot independently (see book_session below)."""
    tz = _resolve_tz(mentor_timezone)
    today = date.today()
    horizon = today + timedelta(days=UPCOMING_WINDOW_DAYS)

    recurring, overrides, blackout_dates, booked = await _load_availability_context(db, mentor_id, today, horizon)
    if not recurring and not overrides:
        return []

    slots: list[dict] = []
    for offset in range(UPCOMING_WINDOW_DAYS + 1):
        day = today + timedelta(days=offset)
        if len(slots) >= MAX_UPCOMING_SLOTS:
            break
        for start_t, end_t in _free_windows_for_date(day, recurring, overrides, blackout_dates, booked, tz):
            slots.append({
                "date": day.isoformat(),
                "start_time": start_t.strftime("%H:%M"),
                "end_time": end_t.strftime("%H:%M"),
            })
            if len(slots) >= MAX_UPCOMING_SLOTS:
                break

    return slots


async def get_mentor(db: AsyncSession, mentor_id: uuid.UUID) -> dict | None:
    mentor = (await db.execute(
        select(Mentor)
        .where(Mentor.id == mentor_id, Mentor.deleted_at.is_(None))
        .options(
            selectinload(Mentor.profile),
            selectinload(Mentor.skills),
            selectinload(Mentor.languages),
            selectinload(Mentor.category_links).selectinload(MentorCategoryLink.category),
            selectinload(Mentor.experience),
            selectinload(Mentor.education),
            selectinload(Mentor.certifications),
        )
    )).unique().scalar_one_or_none()
    if mentor is None or mentor.status != "approved":
        return None

    review_rows = (await db.execute(
        select(Review, Profile.full_name)
        .join(Profile, Review.learner_id == Profile.id)
        .where(Review.mentor_id == mentor_id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
        .limit(50)
    )).all()
    reviews = [
        {
            "id": str(r.id),
            "rating": r.rating,
            "review_text": r.review_text,
            "reviewer_name": "Anonymous" if r.is_anonymous else full_name,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, full_name in review_rows
    ]
    rating_breakdown = {star: sum(1 for r in reviews if r["rating"] == star) for star in (5, 4, 3, 2, 1)}

    upcoming_slots = await _compute_upcoming_slots(db, mentor_id, mentor.timezone)

    return {
        "id": str(mentor.id),
        "profile_id": str(mentor.profile_id),
        "full_name": mentor.profile.full_name if mentor.profile else None,
        "avatar_url": mentor.profile.avatar_url if mentor.profile else None,
        "headline": mentor.headline,
        "bio": mentor.bio,
        "designation": mentor.designation,
        "company": mentor.company,
        "years_experience": mentor.years_experience,
        "country": mentor.country,
        "timezone": mentor.timezone,
        "session_price_amount": mentor.session_price_amount,
        "session_price_currency": mentor.session_price_currency,
        "is_featured": mentor.is_featured,
        "rating_avg": float(mentor.rating_avg or 0),
        "rating_count": mentor.rating_count,
        "sessions_completed": mentor.sessions_completed,
        "skills": sorted({s.skill for s in mentor.skills}),
        "languages": sorted({l.language for l in mentor.languages}),
        "categories": sorted({cl.category.name for cl in mentor.category_links if cl.category}),
        "achievements": list(mentor.achievements or []),
        "experience": [
            {
                "position": e.position, "company": e.company, "start_date": e.start_date,
                "end_date": e.end_date, "is_current": e.is_current, "bullets": list(e.bullets or []),
            }
            for e in mentor.experience
        ],
        "education": [
            {"institution": e.institution, "degree": e.degree, "field": e.field, "start_date": e.start_date, "end_date": e.end_date}
            for e in mentor.education
        ],
        "certifications": [
            {"name": c.name, "issuer": c.issuer, "issue_date": c.issue_date, "credential_url": c.credential_url}
            for c in mentor.certifications
        ],
        "reviews": reviews,
        "rating_breakdown": rating_breakdown,
        "upcoming_slots": upcoming_slots,
        "session_types": sorted(SESSION_TYPES),
        "offerings": [_offering_to_dict(o) for o in (await db.execute(
            select(MentorOffering).where(MentorOffering.mentor_id == mentor_id, MentorOffering.is_active.is_(True))
            .order_by(MentorOffering.sort_order)
        )).scalars().all()],
    }


# ── Booking System (Module 5) ────────────────────────────────────────────────

ALLOWED_DURATIONS = {15, 30, 45, 60}


class BookingValidationError(Exception):
    """The request itself is invalid (bad input, unknown mentor, etc.) — 400."""


class BookingConflictError(Exception):
    """The requested slot is no longer free — 409. Can happen even after
    server-side validation passes, if two learners race for the same slot;
    the DB exclusion constraint on `sessions` is the actual source of truth."""


async def _create_meeting_link(db: AsyncSession, *, tenant_id, created_by: uuid.UUID, session_ref: uuid.UUID) -> MeetingLink:
    """Real, working video room via Jitsi Meet's free public server —
    meet.jit.si creates a room on first visit, no API key or account needed.
    The room slug is namespaced and derived from the session id so it's
    unique and not easily guessable."""
    room = f"sahicareer-mentorship-{session_ref.hex[:16]}"
    link = MeetingLink(tenant_id=tenant_id, provider="jitsi", url=f"https://meet.jit.si/{room}", created_by=created_by)
    db.add(link)
    await db.flush()
    return link


async def create_booking(
    db: AsyncSession,
    *,
    learner_id: uuid.UUID,
    mentor_id: uuid.UUID,
    booking_date: date,
    start_time: dtime,
    duration_minutes: int,
    session_type: str,
    agenda: str = "",
) -> dict:
    if session_type not in SESSION_TYPES:
        raise BookingValidationError(f"Unknown session type: {session_type}")
    if duration_minutes not in ALLOWED_DURATIONS:
        raise BookingValidationError(f"Duration must be one of {sorted(ALLOWED_DURATIONS)} minutes")

    mentor = (await db.execute(
        select(Mentor).where(Mentor.id == mentor_id, Mentor.deleted_at.is_(None))
    )).scalar_one_or_none()
    if mentor is None or mentor.status != "approved":
        raise BookingValidationError("Mentor not found")
    if mentor.profile_id == learner_id:
        raise BookingValidationError("You can't book a session with yourself")

    today = date.today()
    if booking_date < today or booking_date > today + timedelta(days=UPCOMING_WINDOW_DAYS):
        raise BookingValidationError(f"Bookings are only open for the next {UPCOMING_WINDOW_DAYS} days")

    tz = _resolve_tz(mentor.timezone)
    end_dt_naive = datetime.combine(booking_date, start_time) + timedelta(minutes=duration_minutes)
    if end_dt_naive.date() != booking_date:
        raise BookingValidationError("Sessions can't span past midnight")
    end_time = end_dt_naive.time()

    # Re-validate against real availability at request time — never trust the
    # client's idea of what was free when the page loaded.
    recurring, overrides, blackout_dates, booked = await _load_availability_context(
        db, mentor_id, booking_date, booking_date
    )
    free_windows = _free_windows_for_date(booking_date, recurring, overrides, blackout_dates, booked, tz)
    if not any(start_time >= w_start and end_time <= w_end for w_start, w_end in free_windows):
        raise BookingConflictError("This time is no longer available — please pick another slot")

    scheduled_start = datetime.combine(booking_date, start_time, tzinfo=tz).astimezone(ZoneInfo("UTC"))
    scheduled_end = datetime.combine(booking_date, end_time, tzinfo=tz).astimezone(ZoneInfo("UTC"))

    booking = Booking(
        tenant_id=mentor.tenant_id,
        learner_id=learner_id,
        mentor_id=mentor_id,
        session_type=session_type,
        duration_minutes=duration_minutes,
        agenda=agenda.strip() or None,
        status="confirmed",
        price_amount=mentor.session_price_amount,
        price_currency=mentor.session_price_currency,
        created_by=learner_id,
    )
    db.add(booking)
    await db.flush()

    session = MentorSession(
        booking_id=booking.id,
        mentor_id=mentor_id,
        tenant_id=mentor.tenant_id,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        status="scheduled",
        created_by=learner_id,
    )
    db.add(session)

    try:
        await db.flush()
    except Exception as exc:
        await db.rollback()
        # The DB exclusion constraint is the final word on double-booking —
        # this only fires if another booking won the same slot in the gap
        # between our check above and this write.
        if "exclude" in str(exc).lower() or "conflict" in str(exc).lower():
            raise BookingConflictError("This time was just booked by someone else — please pick another slot") from exc
        raise

    link = await _create_meeting_link(db, tenant_id=mentor.tenant_id, created_by=learner_id, session_ref=session.id)
    session.meeting_link_id = link.id

    when_str = _friendly_datetime(scheduled_start.astimezone(tz))
    await _notify_booking_parties(
        db, booking=booking, mentor=mentor, type="booking_confirmed",
        title_for_learner=f"Session confirmed — {when_str}",
        title_for_mentor=f"New booking — {when_str}",
        body=f"{session_type.replace('_', ' ').title()} session, {duration_minutes} min.",
    )
    await db.commit()

    return {
        "booking_id": str(booking.id),
        "session_id": str(session.id),
        "mentor_id": str(mentor_id),
        "mentor_name": None,  # filled by the router from the already-loaded profile if needed
        "date": booking_date.isoformat(),
        "start_time": start_time.strftime("%H:%M"),
        "end_time": end_time.strftime("%H:%M"),
        "timezone": mentor.timezone,
        "duration_minutes": duration_minutes,
        "session_type": session_type,
        "agenda": booking.agenda,
        "status": booking.status,
        "price_amount": booking.price_amount,
        "price_currency": booking.price_currency,
        "meeting_link": link.url,
    }


async def list_my_bookings(db: AsyncSession, learner_id: uuid.UUID) -> list[dict]:
    """A learner's own bookings, newest session first — the minimal read-back
    needed to confirm a booking succeeded. Full Learner Dashboard is Module 6."""
    rows = (await db.execute(
        select(Booking, MentorSession, Profile.full_name, MeetingLink.url, Review)
        .join(MentorSession, MentorSession.booking_id == Booking.id)
        .join(Mentor, Mentor.id == Booking.mentor_id)
        .join(Profile, Profile.id == Mentor.profile_id)
        .outerjoin(MeetingLink, MeetingLink.id == MentorSession.meeting_link_id)
        .outerjoin(Review, and_(Review.booking_id == Booking.id, Review.deleted_at.is_(None)))
        .where(Booking.learner_id == learner_id, Booking.deleted_at.is_(None))
        .order_by(MentorSession.scheduled_start.desc())
    )).all()

    return [
        {
            "booking_id": str(b.id),
            "session_id": str(s.id),
            "mentor_id": str(b.mentor_id),
            "mentor_name": mentor_name,
            "session_type": b.session_type,
            "duration_minutes": b.duration_minutes,
            "agenda": b.agenda,
            "status": s.status,
            "scheduled_start": s.scheduled_start.isoformat() if s.scheduled_start else None,
            "scheduled_end": s.scheduled_end.isoformat() if s.scheduled_end else None,
            "price_amount": b.price_amount,
            "price_currency": b.price_currency,
            "meeting_link": meeting_url,
            "review": {"rating": review.rating, "review_text": review.review_text, "is_anonymous": review.is_anonymous} if review else None,
        }
        for b, s, mentor_name, meeting_url, review in rows
    ]


async def submit_review(
    db: AsyncSession, *, learner_id: uuid.UUID, booking_id: uuid.UUID,
    rating: int, review_text: str = "", is_anonymous: bool = False,
) -> dict:
    """One review per booking, only after the session actually happened.
    mentors.rating_avg / rating_count update automatically via the
    trg_reviews_rating_recalc DB trigger (0006_mentorship.sql) — not
    recomputed here, so it can never drift out of sync with the source rows."""
    if not (1 <= rating <= 5):
        raise BookingValidationError("Rating must be between 1 and 5")

    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.deleted_at.is_(None))
    )).scalar_one_or_none()
    if booking is None or booking.learner_id != learner_id:
        raise BookingNotFoundError("Booking not found")

    session_completed = (await db.execute(
        select(MentorSession.id).where(MentorSession.booking_id == booking_id, MentorSession.status == "completed")
    )).scalar_one_or_none()
    if session_completed is None:
        raise BookingValidationError("You can only review a session after it's completed")

    existing = (await db.execute(
        select(Review.id).where(Review.booking_id == booking_id, Review.deleted_at.is_(None))
    )).scalar_one_or_none()
    if existing is not None:
        raise BookingValidationError("You've already reviewed this session")

    review = Review(
        tenant_id=booking.tenant_id, booking_id=booking_id, learner_id=learner_id, mentor_id=booking.mentor_id,
        rating=rating, review_text=review_text.strip() or None, is_anonymous=is_anonymous, created_by=learner_id,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return {
        "id": str(review.id), "rating": review.rating, "review_text": review.review_text,
        "is_anonymous": review.is_anonymous, "created_at": review.created_at.isoformat() if review.created_at else None,
    }


class BookingNotFoundError(Exception):
    pass


async def cancel_booking(db: AsyncSession, *, learner_id: uuid.UUID, booking_id: uuid.UUID, reason: str = "") -> None:
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.deleted_at.is_(None))
    )).scalar_one_or_none()
    if booking is None or booking.learner_id != learner_id:
        raise BookingNotFoundError("Booking not found")
    if booking.status in ("cancelled", "completed"):
        raise BookingValidationError(f"This booking is already {booking.status}")

    booking.status = "cancelled"
    booking.cancellation_reason = reason.strip() or None
    booking.cancelled_by = learner_id

    sessions = (await db.execute(
        select(MentorSession).where(MentorSession.booking_id == booking_id, MentorSession.status == "scheduled")
    )).scalars().all()
    for s in sessions:
        s.status = "cancelled"  # frees the slot — the exclusion constraint only blocks non-cancelled sessions

    mentor = (await db.execute(select(Mentor).where(Mentor.id == booking.mentor_id))).scalar_one()
    await _notify_booking_parties(
        db, booking=booking, mentor=mentor, type="booking_cancelled",
        title_for_learner="You cancelled your session",
        title_for_mentor="A session was cancelled",
        body=reason.strip() or "No reason given.",
    )
    await db.commit()


async def reschedule_booking(
    db: AsyncSession, *, actor_id: uuid.UUID, booking_id: uuid.UUID,
    new_date: date, new_start_time: dtime, duration_minutes: int | None = None,
) -> dict:
    """Either party (learner or mentor) can propose a new time. The booking
    stays 'confirmed' — only the session occurrence changes — so cancellation
    history and pricing on the booking itself are untouched."""
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.deleted_at.is_(None))
    )).scalar_one_or_none()
    if booking is None:
        raise BookingNotFoundError("Booking not found")

    mentor = (await db.execute(select(Mentor).where(Mentor.id == booking.mentor_id))).scalar_one()
    if booking.learner_id != actor_id and mentor.profile_id != actor_id:
        raise BookingNotFoundError("Booking not found")
    if booking.status not in ("pending", "confirmed"):
        raise BookingValidationError(f"Can't reschedule a booking that is {booking.status}")

    duration = duration_minutes or booking.duration_minutes
    if duration not in ALLOWED_DURATIONS:
        raise BookingValidationError(f"Duration must be one of {sorted(ALLOWED_DURATIONS)} minutes")

    today = date.today()
    if new_date < today or new_date > today + timedelta(days=UPCOMING_WINDOW_DAYS):
        raise BookingValidationError(f"Bookings are only open for the next {UPCOMING_WINDOW_DAYS} days")

    tz = _resolve_tz(mentor.timezone)
    end_dt_naive = datetime.combine(new_date, new_start_time) + timedelta(minutes=duration)
    if end_dt_naive.date() != new_date:
        raise BookingValidationError("Sessions can't span past midnight")
    new_end_time = end_dt_naive.time()

    old_session = (await db.execute(
        select(MentorSession).where(MentorSession.booking_id == booking_id, MentorSession.status == "scheduled")
    )).scalar_one_or_none()
    if old_session is None:
        raise BookingValidationError("No active session to reschedule")

    # Supersede the old occurrence FIRST so the availability re-check below
    # doesn't see it as a conflicting booking against itself.
    old_session.status = "rescheduled"
    await db.flush()

    recurring, overrides, blackout_dates, booked = await _load_availability_context(db, booking.mentor_id, new_date, new_date)
    free_windows = _free_windows_for_date(new_date, recurring, overrides, blackout_dates, booked, tz)
    if not any(new_start_time >= w_start and new_end_time <= w_end for w_start, w_end in free_windows):
        await db.rollback()
        raise BookingConflictError("That new time isn't available — please pick another slot")

    new_scheduled_start = datetime.combine(new_date, new_start_time, tzinfo=tz).astimezone(ZoneInfo("UTC"))
    new_scheduled_end = datetime.combine(new_date, new_end_time, tzinfo=tz).astimezone(ZoneInfo("UTC"))

    new_session = MentorSession(
        booking_id=booking.id, mentor_id=booking.mentor_id, tenant_id=mentor.tenant_id,
        scheduled_start=new_scheduled_start, scheduled_end=new_scheduled_end,
        status="scheduled", created_by=actor_id,
    )
    db.add(new_session)

    try:
        await db.flush()
    except Exception as exc:
        await db.rollback()
        if "exclude" in str(exc).lower() or "conflict" in str(exc).lower():
            raise BookingConflictError("That new time was just booked — please pick another slot") from exc
        raise

    if duration_minutes is not None:
        booking.duration_minutes = duration_minutes
    link = await _create_meeting_link(db, tenant_id=mentor.tenant_id, created_by=actor_id, session_ref=new_session.id)
    new_session.meeting_link_id = link.id

    when_str = _friendly_datetime(new_scheduled_start.astimezone(tz))
    await _notify_booking_parties(
        db, booking=booking, mentor=mentor, type="booking_rescheduled",
        title_for_learner=f"Session rescheduled — {when_str}",
        title_for_mentor=f"Session rescheduled — {when_str}",
    )
    await db.commit()

    return {
        "booking_id": str(booking.id),
        "session_id": str(new_session.id),
        "scheduled_start": new_scheduled_start.isoformat(),
        "scheduled_end": new_scheduled_end.isoformat(),
        "meeting_link": link.url,
    }


# ── Career Goals (Learner Dashboard) ─────────────────────────────────────────

async def list_career_goals(db: AsyncSession, learner_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(CareerGoal)
        .where(CareerGoal.learner_id == learner_id, CareerGoal.deleted_at.is_(None))
        .order_by(CareerGoal.status, CareerGoal.target_date.asc().nullslast(), CareerGoal.created_at.desc())
    )).scalars().all()
    return [_career_goal_to_dict(g) for g in rows]


def _career_goal_to_dict(g: CareerGoal) -> dict:
    return {
        "id": str(g.id),
        "title": g.title,
        "description": g.description,
        "target_date": g.target_date.isoformat() if g.target_date else None,
        "status": g.status,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


async def create_career_goal(
    db: AsyncSession, *, learner_id: uuid.UUID, title: str, description: str = "", target_date: date | None = None,
) -> dict:
    if not title.strip():
        raise BookingValidationError("Title is required")
    goal = CareerGoal(learner_id=learner_id, title=title.strip(), description=description.strip() or None,
                       target_date=target_date, created_by=learner_id)
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _career_goal_to_dict(goal)


async def update_career_goal(
    db: AsyncSession, *, learner_id: uuid.UUID, goal_id: uuid.UUID, status: str | None = None,
) -> dict:
    goal = (await db.execute(
        select(CareerGoal).where(CareerGoal.id == goal_id, CareerGoal.learner_id == learner_id, CareerGoal.deleted_at.is_(None))
    )).scalar_one_or_none()
    if goal is None:
        raise BookingNotFoundError("Career goal not found")
    if status is not None:
        if status not in ("active", "completed", "archived"):
            raise BookingValidationError("Invalid status")
        goal.status = status
    await db.commit()
    await db.refresh(goal)
    return _career_goal_to_dict(goal)


# ── Session Notes (Learner Dashboard) ────────────────────────────────────────

async def list_session_notes(db: AsyncSession, *, user_id: uuid.UUID, session_id: uuid.UUID) -> list[dict]:
    # Ownership/visibility check: caller must be the learner or mentor on this session.
    owns = (await db.execute(
        select(MentorSession.id)
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .where(
            MentorSession.id == session_id,
            or_(Booking.learner_id == user_id, Mentor.profile_id == user_id),
        )
    )).scalar_one_or_none()
    if owns is None:
        raise BookingNotFoundError("Session not found")

    rows = (await db.execute(
        select(SessionNote, Profile.full_name)
        .join(Profile, Profile.id == SessionNote.author_id)
        .where(
            SessionNote.session_id == session_id,
            or_(SessionNote.author_id == user_id, SessionNote.visibility == "shared"),
        )
        .order_by(SessionNote.created_at.asc())
    )).all()
    return [
        {
            "id": str(n.id), "note_text": n.note_text, "visibility": n.visibility,
            "author_name": author_name, "is_mine": n.author_id == user_id,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n, author_name in rows
    ]


async def add_session_note(
    db: AsyncSession, *, user_id: uuid.UUID, session_id: uuid.UUID, note_text: str, visibility: str = "shared",
) -> dict:
    if not note_text.strip():
        raise BookingValidationError("Note text is required")
    if visibility not in ("private", "shared"):
        raise BookingValidationError("Invalid visibility")

    owns = (await db.execute(
        select(MentorSession.id)
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .where(
            MentorSession.id == session_id,
            or_(Booking.learner_id == user_id, Mentor.profile_id == user_id),
        )
    )).scalar_one_or_none()
    if owns is None:
        raise BookingNotFoundError("Session not found")

    note = SessionNote(session_id=session_id, author_id=user_id, note_text=note_text.strip(), visibility=visibility)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return {
        "id": str(note.id), "note_text": note.note_text, "visibility": note.visibility,
        "author_name": None, "is_mine": True,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


# ── Mentor Dashboard (Module 7) ──────────────────────────────────────────────

class NotAMentorError(Exception):
    """The current user has no mentor row — they're not (yet) a mentor."""


async def _resolve_mentor(db: AsyncSession, profile_id: uuid.UUID) -> Mentor:
    mentor = (await db.execute(
        select(Mentor).where(Mentor.profile_id == profile_id, Mentor.deleted_at.is_(None))
    )).scalar_one_or_none()
    if mentor is None:
        raise NotAMentorError("You don't have a mentor profile yet")
    return mentor


def _booking_row_to_dict(b: Booking, s: MentorSession, learner_name: str | None, meeting_url: str | None = None) -> dict:
    return {
        "booking_id": str(b.id),
        "session_id": str(s.id),
        "learner_name": learner_name,
        "session_type": b.session_type,
        "duration_minutes": b.duration_minutes,
        "agenda": b.agenda,
        "status": s.status,
        "scheduled_start": s.scheduled_start.isoformat() if s.scheduled_start else None,
        "scheduled_end": s.scheduled_end.isoformat() if s.scheduled_end else None,
        "meeting_link": meeting_url,
    }


async def get_mentor_dashboard(db: AsyncSession, profile_id: uuid.UUID) -> dict:
    mentor = await _resolve_mentor(db, profile_id)
    mentor_id = mentor.id
    tz = _resolve_tz(mentor.timezone)
    now_local = datetime.now(tz)
    today_local = now_local.date()

    base_query = (
        select(Booking, MentorSession, Profile.full_name, MeetingLink.url)
        .join(MentorSession, MentorSession.booking_id == Booking.id)
        .join(Profile, Profile.id == Booking.learner_id)
        .outerjoin(MeetingLink, MeetingLink.id == MentorSession.meeting_link_id)
        .where(Booking.mentor_id == mentor_id, Booking.deleted_at.is_(None))
    )
    all_rows = (await db.execute(base_query.order_by(MentorSession.scheduled_start.asc()))).all()

    today_sessions, upcoming_sessions, requests = [], [], []
    for b, s, learner_name, meeting_url in all_rows:
        row = _booking_row_to_dict(b, s, learner_name, meeting_url)
        local_start = s.scheduled_start.astimezone(tz) if s.scheduled_start else None
        if s.status == "scheduled" and local_start and local_start.date() == today_local:
            today_sessions.append(row)
        if s.status == "scheduled" and local_start and local_start >= now_local:
            upcoming_sessions.append(row)
        if b.status == "pending":
            requests.append(row)

    learners_map: dict[str, str | None] = {}
    for b, _s, learner_name, _url in all_rows:
        learners_map.setdefault(str(b.learner_id), learner_name)
    learners = [{"learner_id": k, "name": v} for k, v in learners_map.items()]

    reviews = await _list_reviews_for_mentor(db, mentor_id)

    month_start = today_local.replace(day=1)
    sessions_this_month = sum(
        1 for _b, s, _n, _u in all_rows
        if s.status == "completed" and s.scheduled_start and s.scheduled_start.astimezone(tz).date() >= month_start
    )

    by_status: dict[str, int] = {}
    by_type: dict[str, int] = {}
    monthly: dict[str, int] = {}
    for b, s, _n, _u in all_rows:
        by_status[s.status] = by_status.get(s.status, 0) + 1
        by_type[b.session_type] = by_type.get(b.session_type, 0) + 1
        if s.scheduled_start:
            key = s.scheduled_start.astimezone(tz).strftime("%Y-%m")
            monthly[key] = monthly.get(key, 0) + 1

    availability_rules = (await db.execute(
        select(MentorAvailability).where(MentorAvailability.mentor_id == mentor_id).order_by(MentorAvailability.day_of_week)
    )).scalars().all()

    completed_minutes = sum(b.duration_minutes for b, s, _n, _u in all_rows if s.status == "completed")
    hours_mentored = round(completed_minutes / 60, 1)

    # Next 7 days, keyed by ISO date, for the "Next 7 Days" weekly strip.
    horizon = today_local + timedelta(days=6)
    next_7_days: dict[str, list[dict]] = {(today_local + timedelta(days=i)).isoformat(): [] for i in range(7)}
    for b, s, learner_name, meeting_url in all_rows:
        if s.status != "scheduled" or not s.scheduled_start:
            continue
        local_day = s.scheduled_start.astimezone(tz).date()
        if today_local <= local_day <= horizon:
            next_7_days[local_day.isoformat()].append(_booking_row_to_dict(b, s, learner_name, meeting_url))

    offerings = (await db.execute(
        select(MentorOffering).where(MentorOffering.mentor_id == mentor_id).order_by(MentorOffering.sort_order)
    )).scalars().all()

    _completeness_fields = [
        bool(mentor.headline), bool(mentor.bio), bool(mentor.designation), bool(mentor.company),
        mentor.years_experience > 0, bool(mentor.country),
        len({s.skill for s in (await db.execute(select(MentorSkill).where(MentorSkill.mentor_id == mentor_id))).scalars().all()}) > 0,
        len(availability_rules) > 0,
    ]
    profile_completeness = round(100 * sum(_completeness_fields) / len(_completeness_fields))

    return {
        "mentor": {
            "id": str(mentor.id),
            "status": mentor.status,
            "headline": mentor.headline,
            "bio": mentor.bio,
            "designation": mentor.designation,
            "company": mentor.company,
            "years_experience": mentor.years_experience,
            "country": mentor.country,
            "timezone": mentor.timezone,
            "session_price_amount": mentor.session_price_amount,
            "session_price_currency": mentor.session_price_currency,
            "skills": sorted({s.skill for s in (await db.execute(select(MentorSkill).where(MentorSkill.mentor_id == mentor_id))).scalars().all()}),
            "languages": sorted({l.language for l in (await db.execute(select(MentorLanguage).where(MentorLanguage.mentor_id == mentor_id))).scalars().all()}),
            "offerings": [_offering_to_dict(o) for o in offerings],
        },
        "overview": {
            "total_learners": len(learners),
            "sessions_this_month": sessions_this_month,
            "avg_rating": float(mentor.rating_avg or 0),
            "rating_count": mentor.rating_count,
            "upcoming_count": len(upcoming_sessions),
            "today_count": len(today_sessions),
            "pending_requests_count": len(requests),
            "hours_mentored": hours_mentored,
            "sessions_completed": mentor.sessions_completed,
        },
        "today_sessions": today_sessions,
        "upcoming_sessions": upcoming_sessions,
        "next_7_days": next_7_days,
        "requests": requests,
        "learners": learners,
        "reviews": reviews,
        "analytics": {"by_status": by_status, "by_type": by_type, "monthly": sorted(monthly.items())},
        "availability_rules": [
            {
                "id": str(r.id), "rule_type": r.rule_type, "day_of_week": r.day_of_week,
                "specific_date": r.specific_date.isoformat() if r.specific_date else None,
                "start_time": r.start_time.strftime("%H:%M"), "end_time": r.end_time.strftime("%H:%M"),
                "is_active": r.is_active,
            }
            for r in availability_rules
        ],
        "action_items": {
            "profile_completeness": profile_completeness,
            "needs_availability": len(availability_rules) == 0,
        },
    }


async def _list_reviews_for_mentor(db: AsyncSession, mentor_id: uuid.UUID) -> list[dict]:
    rows = (await db.execute(
        select(Review, Profile.full_name)
        .join(Profile, Review.learner_id == Profile.id)
        .where(Review.mentor_id == mentor_id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
        .limit(50)
    )).all()
    return [
        {
            "id": str(r.id), "rating": r.rating, "review_text": r.review_text,
            "reviewer_name": "Anonymous" if r.is_anonymous else full_name,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, full_name in rows
    ]


# ── Mentor Profile Management (Module 7) ─────────────────────────────────────

_EDITABLE_PROFILE_FIELDS = {
    "headline", "bio", "designation", "company", "years_experience",
    "country", "timezone", "session_price_amount",
}


async def update_mentor_profile(db: AsyncSession, profile_id: uuid.UUID, fields: dict) -> dict:
    mentor = await _resolve_mentor(db, profile_id)
    for key, value in fields.items():
        if key in _EDITABLE_PROFILE_FIELDS and value is not None:
            setattr(mentor, key, value)
    await db.commit()
    dash = await get_mentor_dashboard(db, profile_id)
    return dash["mentor"]


async def add_mentor_skill(db: AsyncSession, profile_id: uuid.UUID, skill: str) -> list[str]:
    mentor = await _resolve_mentor(db, profile_id)
    skill = skill.strip()
    if not skill:
        raise BookingValidationError("Skill can't be empty")
    exists = (await db.execute(
        select(MentorSkill).where(MentorSkill.mentor_id == mentor.id, MentorSkill.skill.ilike(skill))
    )).scalar_one_or_none()
    if exists is None:
        db.add(MentorSkill(mentor_id=mentor.id, skill=skill))
        await db.commit()
    rows = (await db.execute(select(MentorSkill).where(MentorSkill.mentor_id == mentor.id))).scalars().all()
    return sorted({r.skill for r in rows})


async def remove_mentor_skill(db: AsyncSession, profile_id: uuid.UUID, skill: str) -> list[str]:
    mentor = await _resolve_mentor(db, profile_id)
    await db.execute(
        MentorSkill.__table__.delete().where(MentorSkill.mentor_id == mentor.id, MentorSkill.skill.ilike(skill.strip()))
    )
    await db.commit()
    rows = (await db.execute(select(MentorSkill).where(MentorSkill.mentor_id == mentor.id))).scalars().all()
    return sorted({r.skill for r in rows})


async def add_mentor_language(db: AsyncSession, profile_id: uuid.UUID, language: str) -> list[str]:
    mentor = await _resolve_mentor(db, profile_id)
    language = language.strip()
    if not language:
        raise BookingValidationError("Language can't be empty")
    exists = (await db.execute(
        select(MentorLanguage).where(MentorLanguage.mentor_id == mentor.id, MentorLanguage.language.ilike(language))
    )).scalar_one_or_none()
    if exists is None:
        db.add(MentorLanguage(mentor_id=mentor.id, language=language))
        await db.commit()
    rows = (await db.execute(select(MentorLanguage).where(MentorLanguage.mentor_id == mentor.id))).scalars().all()
    return sorted({r.language for r in rows})


async def remove_mentor_language(db: AsyncSession, profile_id: uuid.UUID, language: str) -> list[str]:
    mentor = await _resolve_mentor(db, profile_id)
    await db.execute(
        MentorLanguage.__table__.delete().where(MentorLanguage.mentor_id == mentor.id, MentorLanguage.language.ilike(language.strip()))
    )
    await db.commit()
    rows = (await db.execute(select(MentorLanguage).where(MentorLanguage.mentor_id == mentor.id))).scalars().all()
    return sorted({r.language for r in rows})


# ── Mentor Availability Management (Module 7) ────────────────────────────────

async def add_availability_rule(
    db: AsyncSession, profile_id: uuid.UUID, *, day_of_week: int, start_time: dtime, end_time: dtime,
) -> dict:
    mentor = await _resolve_mentor(db, profile_id)
    if not (0 <= day_of_week <= 6):
        raise BookingValidationError("day_of_week must be 0 (Sunday) through 6 (Saturday)")
    if end_time <= start_time:
        raise BookingValidationError("End time must be after start time")

    rule = MentorAvailability(
        mentor_id=mentor.id, rule_type="recurring", day_of_week=day_of_week,
        start_time=start_time, end_time=end_time, timezone=mentor.timezone,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": str(rule.id), "rule_type": rule.rule_type, "day_of_week": rule.day_of_week,
        "start_time": rule.start_time.strftime("%H:%M"), "end_time": rule.end_time.strftime("%H:%M"),
        "is_active": rule.is_active,
    }


async def remove_availability_rule(db: AsyncSession, profile_id: uuid.UUID, rule_id: uuid.UUID) -> None:
    mentor = await _resolve_mentor(db, profile_id)
    result = await db.execute(
        MentorAvailability.__table__.delete().where(MentorAvailability.id == rule_id, MentorAvailability.mentor_id == mentor.id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise BookingNotFoundError("Availability rule not found")


# ── Session status updates (mentor side) ─────────────────────────────────────

async def update_session_status(
    db: AsyncSession, profile_id: uuid.UUID, session_id: uuid.UUID, status: str,
) -> None:
    if status not in ("completed", "no_show"):
        raise BookingValidationError("Mentors can mark a session completed or no-show")
    mentor = await _resolve_mentor(db, profile_id)
    session = (await db.execute(
        select(MentorSession).where(MentorSession.id == session_id, MentorSession.mentor_id == mentor.id)
    )).scalar_one_or_none()
    if session is None:
        raise BookingNotFoundError("Session not found")
    if session.status != "scheduled":
        raise BookingValidationError(f"Session is already {session.status}")

    session.status = status
    if status == "completed":
        mentor.sessions_completed = (mentor.sessions_completed or 0) + 1
    await db.commit()


# ── Notifications (Module 10) ────────────────────────────────────────────────
#
# In-app notifications are always created (this is the source of truth the
# UI reads). Email is a best-effort side channel on top of the same event —
# "Email Ready" means the send path exists and fires automatically the
# moment SMTP_HOST/SMTP_USER/SMTP_PASS are set; with no credentials configured
# it logs and no-ops, same graceful-degradation pattern the AI providers use
# elsewhere in this app (services/ai.py).

def _send_email_if_configured(to_email: str | None, subject: str, body: str) -> None:
    import logging
    import os
    logger = logging.getLogger(__name__)

    host = os.getenv("SMTP_HOST", "")
    if not host or not to_email:
        logger.debug("Email skipped (no SMTP_HOST configured or no recipient): %s", subject)
        return
    try:
        import smtplib
        from email.mime.text import MIMEText

        user = os.getenv("SMTP_USER", "")
        password = os.getenv("SMTP_PASS", "")
        port = int(os.getenv("SMTP_PORT", "587"))
        from_addr = os.getenv("SMTP_FROM", user or "no-reply@sahicareer.app")

        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_email

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())
    except Exception as exc:
        logger = logging.getLogger(__name__)
        logger.warning("Email send failed (%s): %s", subject, exc)


async def create_notification(
    db: AsyncSession, *, user_id: uuid.UUID, tenant_id, type: str, title: str, body: str = "",
    related_entity_type: str | None = None, related_entity_id: uuid.UUID | None = None,
    email_to: str | None = None,
) -> None:
    notif = MentorshipNotification(
        tenant_id=tenant_id, user_id=user_id, type=type, title=title, body=body or None,
        related_entity_type=related_entity_type, related_entity_id=related_entity_id,
    )
    db.add(notif)
    await db.flush()
    _send_email_if_configured(email_to, title, body or title)


async def _notify_booking_parties(
    db: AsyncSession, *, booking: Booking, mentor: Mentor, title_for_learner: str, title_for_mentor: str,
    type: str, body: str = "",
) -> None:
    """Fires the same event to both sides of a booking — used for confirm/cancel/reschedule."""
    learner = (await db.execute(select(Profile).where(Profile.id == booking.learner_id))).scalar_one_or_none()
    mentor_profile = (await db.execute(select(Profile).where(Profile.id == mentor.profile_id))).scalar_one_or_none()

    await create_notification(
        db, user_id=booking.learner_id, tenant_id=booking.tenant_id, type=type, title=title_for_learner, body=body,
        related_entity_type="booking", related_entity_id=booking.id,
        email_to=learner.email if learner else None,
    )
    await create_notification(
        db, user_id=mentor.profile_id, tenant_id=booking.tenant_id, type=type, title=title_for_mentor, body=body,
        related_entity_type="booking", related_entity_id=booking.id,
        email_to=mentor_profile.email if mentor_profile else None,
    )


async def list_notifications(db: AsyncSession, user_id: uuid.UUID, *, unread_only: bool = False, limit: int = 50) -> list[dict]:
    query = select(MentorshipNotification).where(MentorshipNotification.user_id == user_id)
    if unread_only:
        query = query.where(MentorshipNotification.is_read.is_(False))
    rows = (await db.execute(query.order_by(MentorshipNotification.created_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": str(n.id), "type": n.type, "title": n.title, "body": n.body,
            "related_entity_type": n.related_entity_type,
            "related_entity_id": str(n.related_entity_id) if n.related_entity_id else None,
            "is_read": n.is_read, "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


async def count_unread_notifications(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (await db.execute(
        select(func.count()).select_from(MentorshipNotification)
        .where(MentorshipNotification.user_id == user_id, MentorshipNotification.is_read.is_(False))
    )).scalar_one()


async def mark_notification_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    notif = (await db.execute(
        select(MentorshipNotification).where(MentorshipNotification.id == notification_id, MentorshipNotification.user_id == user_id)
    )).scalar_one_or_none()
    if notif is None:
        raise BookingNotFoundError("Notification not found")
    notif.is_read = True
    await db.commit()


async def mark_all_notifications_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        MentorshipNotification.__table__.update()
        .where(MentorshipNotification.user_id == user_id, MentorshipNotification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()


# ── Reminder sweep (Module 10) ───────────────────────────────────────────────
#
# Runs periodically from a background task (see main.py lifespan). Idempotent
# by design: before creating a reminder it checks whether one already exists
# for that exact (user, type, related session/booking) — so re-running the
# sweep never double-notifies, no separate "reminder_sent" flag needed.

SESSION_REMINDER_WINDOW_MINUTES = 60
REVIEW_REMINDER_DELAY_HOURS = 2


async def _already_notified(db: AsyncSession, *, user_id: uuid.UUID, type: str, related_entity_id: uuid.UUID) -> bool:
    existing = (await db.execute(
        select(MentorshipNotification.id).where(
            MentorshipNotification.user_id == user_id,
            MentorshipNotification.type == type,
            MentorshipNotification.related_entity_id == related_entity_id,
        )
    )).scalar_one_or_none()
    return existing is not None


async def run_reminder_sweep(db: AsyncSession) -> dict:
    now = datetime.now(ZoneInfo("UTC"))
    created = {"session_reminders": 0, "review_reminders": 0}

    # Session reminders: scheduled sessions starting within the next hour.
    soon = now + timedelta(minutes=SESSION_REMINDER_WINDOW_MINUTES)
    upcoming = (await db.execute(
        select(MentorSession, Booking, Mentor)
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .where(
            MentorSession.status == "scheduled",
            MentorSession.scheduled_start >= now,
            MentorSession.scheduled_start <= soon,
        )
    )).all()
    for session, booking, mentor in upcoming:
        when = _friendly_time(session.scheduled_start.astimezone(_resolve_tz(mentor.timezone)))
        for user_id in (booking.learner_id, mentor.profile_id):
            if await _already_notified(db, user_id=user_id, type="session_reminder", related_entity_id=session.id):
                continue
            profile = (await db.execute(select(Profile).where(Profile.id == user_id))).scalar_one_or_none()
            await create_notification(
                db, user_id=user_id, tenant_id=booking.tenant_id, type="session_reminder",
                title=f"Session starting soon — {when}",
                body=f"Your {booking.session_type.replace('_', ' ')} session starts at {when}.",
                related_entity_type="session", related_entity_id=session.id,
                email_to=profile.email if profile else None,
            )
            created["session_reminders"] += 1

    # Review reminders: completed sessions, no review yet, past the delay window.
    threshold = now - timedelta(hours=REVIEW_REMINDER_DELAY_HOURS)
    completed = (await db.execute(
        select(MentorSession, Booking, Mentor)
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .where(MentorSession.status == "completed", MentorSession.scheduled_end <= threshold)
    )).all()
    for session, booking, mentor in completed:
        has_review = (await db.execute(select(Review.id).where(Review.booking_id == booking.id))).scalar_one_or_none()
        if has_review is not None:
            continue
        if await _already_notified(db, user_id=booking.learner_id, type="review_reminder", related_entity_id=booking.id):
            continue
        learner = (await db.execute(select(Profile).where(Profile.id == booking.learner_id))).scalar_one_or_none()
        await create_notification(
            db, user_id=booking.learner_id, tenant_id=booking.tenant_id, type="review_reminder",
            title="How was your session?", body="Leave a quick review to help other learners.",
            related_entity_type="booking", related_entity_id=booking.id,
            email_to=learner.email if learner else None,
        )
        created["review_reminders"] += 1

    await db.commit()
    return created


# ── Admin (Module 11) ────────────────────────────────────────────────────────
#
# Mentor approval, mentor creation (replaces the direct-DB-script workflow
# used to seed the first mentor), and category management. All entry points
# here are gated by require_admin at the router layer — this module assumes
# the caller has already been authorized.

def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "category"


def _admin_mentor_summary(m: Mentor) -> dict:
    return {
        "id": str(m.id),
        "profile_id": str(m.profile_id),
        "full_name": m.profile.full_name if m.profile else None,
        "email": m.profile.email if m.profile else None,
        "avatar_url": m.profile.avatar_url if m.profile else None,
        "status": m.status,
        "headline": m.headline,
        "bio": m.bio,
        "designation": m.designation,
        "company": m.company,
        "years_experience": m.years_experience,
        "country": m.country,
        "timezone": m.timezone,
        "session_price_amount": m.session_price_amount,
        "session_price_currency": m.session_price_currency,
        "rating_avg": float(m.rating_avg or 0),
        "rating_count": m.rating_count,
        "sessions_completed": m.sessions_completed,
        "skills": sorted({s.skill for s in m.skills}),
        "languages": sorted({l.language for l in m.languages}),
        "categories": sorted({cl.category.name for cl in m.category_links if cl.category}),
        "rejection_reason": m.rejection_reason,
        "approved_at": m.approved_at.isoformat() if m.approved_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


async def admin_get_stats(db: AsyncSession) -> dict:
    mentor_rows = (await db.execute(
        select(Mentor.status, func.count()).where(Mentor.deleted_at.is_(None)).group_by(Mentor.status)
    )).all()
    mentors_by_status = {status: 0 for status in MENTOR_STATUSES}
    mentors_by_status.update({status: count for status, count in mentor_rows})

    booking_rows = (await db.execute(
        select(Booking.status, func.count()).where(Booking.deleted_at.is_(None)).group_by(Booking.status)
    )).all()
    bookings_by_status = {status: 0 for status in BOOKING_STATUSES}
    bookings_by_status.update({status: count for status, count in booking_rows})

    sessions_completed_total = (await db.execute(
        select(func.count()).select_from(MentorSession).where(MentorSession.status == "completed")
    )).scalar() or 0
    reviews_total = (await db.execute(select(func.count()).select_from(Review).where(Review.deleted_at.is_(None)))).scalar() or 0
    avg_rating = (await db.execute(
        select(func.avg(Mentor.rating_avg)).where(Mentor.status == "approved", Mentor.rating_count > 0)
    )).scalar()
    categories_total = (await db.execute(select(func.count()).select_from(MentorCategory))).scalar() or 0
    categories_active = (await db.execute(
        select(func.count()).select_from(MentorCategory).where(MentorCategory.is_active.is_(True))
    )).scalar() or 0

    total_users = (await db.execute(select(func.count()).select_from(Profile))).scalar() or 0
    total_mentees = (await db.execute(select(func.count(func.distinct(Booking.learner_id))).where(Booking.deleted_at.is_(None)))).scalar() or 0
    total_sessions = (await db.execute(select(func.count()).select_from(MentorSession).where(MentorSession.deleted_at.is_(None)))).scalar() or 0
    completed_minutes = (await db.execute(
        select(func.sum(Booking.duration_minutes)).select_from(MentorSession)
        .join(Booking, Booking.id == MentorSession.booking_id).where(MentorSession.status == "completed")
    )).scalar() or 0

    return {
        "mentors_by_status": mentors_by_status,
        "bookings_by_status": bookings_by_status,
        "sessions_completed_total": sessions_completed_total,
        "reviews_total": reviews_total,
        "avg_rating_platform": round(float(avg_rating), 2) if avg_rating is not None else 0,
        "categories_total": categories_total,
        "categories_active": categories_active,
        "total_users": total_users,
        "total_mentors": mentors_by_status.get("approved", 0),
        "total_mentees": total_mentees,
        "total_sessions": total_sessions,
        "hours_total": round(completed_minutes / 60, 1),
    }


async def admin_list_mentors(db: AsyncSession, *, status: str | None = None, search: str = "") -> list[dict]:
    query = (
        select(Mentor)
        .where(Mentor.deleted_at.is_(None))
        .options(
            selectinload(Mentor.profile), selectinload(Mentor.skills), selectinload(Mentor.languages),
            selectinload(Mentor.category_links).selectinload(MentorCategoryLink.category),
        )
    )
    if status:
        query = query.where(Mentor.status == status)
    if search:
        query = query.join(Profile, Mentor.profile_id == Profile.id).where(
            or_(Profile.full_name.ilike(f"%{search}%"), Profile.email.ilike(f"%{search}%"))
        )
    rows = (await db.execute(query.order_by(Mentor.created_at.desc()))).scalars().unique().all()
    return [_admin_mentor_summary(m) for m in rows]


async def admin_update_mentor_status(
    db: AsyncSession, *, admin_id: uuid.UUID, mentor_id: uuid.UUID, status: str, rejection_reason: str | None = None,
) -> dict:
    if status not in MENTOR_STATUSES:
        raise BookingValidationError(f"Status must be one of {sorted(MENTOR_STATUSES)}")
    mentor = (await db.execute(
        select(Mentor).where(Mentor.id == mentor_id, Mentor.deleted_at.is_(None))
        .options(selectinload(Mentor.profile), selectinload(Mentor.skills), selectinload(Mentor.languages),
                 selectinload(Mentor.category_links).selectinload(MentorCategoryLink.category))
    )).scalar_one_or_none()
    if mentor is None:
        raise BookingNotFoundError("Mentor not found")

    mentor.status = status
    now = datetime.now(ZoneInfo("UTC"))
    mentor.reviewed_by = admin_id
    mentor.reviewed_at = now
    if status == "approved":
        mentor.approved_at = now
        mentor.approved_by = admin_id
        mentor.rejection_reason = None
    elif status == "rejected":
        mentor.rejection_reason = rejection_reason or "Not specified"
    await db.commit()

    title_by_status = {
        "approved": "Your mentor application was approved!",
        "rejected": "Your mentor application was not approved",
        "suspended": "Your mentor profile has been suspended",
        "pending": "Your mentor application is under review",
    }
    body_by_status = {
        "approved": "You're now listed on the SahiCareer mentor marketplace. Set your availability to start receiving bookings.",
        "rejected": f"Reason: {mentor.rejection_reason}" if mentor.rejection_reason else "",
        "suspended": "Your profile is temporarily hidden from the marketplace. Contact support for details.",
        "pending": "",
    }
    await create_notification(
        db, user_id=mentor.profile_id, tenant_id=mentor.tenant_id, type=f"mentor_{status}",
        title=title_by_status[status], body=body_by_status[status],
        related_entity_type="mentor", related_entity_id=mentor.id,
        email_to=mentor.profile.email if mentor.profile else None,
    )
    await db.commit()

    audit(actor_id=str(admin_id), actor_email=None, action=f"mentorship.mentor_{status}",
          entity_type="mentor", entity_id=str(mentor.id), meta={"profile_email": mentor.profile.email if mentor.profile else None})

    return _admin_mentor_summary(mentor)


async def admin_search_eligible_profiles(db: AsyncSession, *, search: str = "", limit: int = 20) -> list[dict]:
    """Profiles that don't already have a mentor row — candidates an admin can promote."""
    existing_mentor_profile_ids = select(Mentor.profile_id).where(Mentor.deleted_at.is_(None))
    query = select(Profile).where(Profile.id.notin_(existing_mentor_profile_ids))
    if search:
        query = query.where(or_(Profile.full_name.ilike(f"%{search}%"), Profile.email.ilike(f"%{search}%")))
    rows = (await db.execute(query.order_by(Profile.full_name).limit(limit))).scalars().all()
    return [{"id": str(p.id), "full_name": p.full_name, "email": p.email, "avatar_url": p.avatar_url} for p in rows]


async def admin_create_mentor(
    db: AsyncSession, *, created_by: uuid.UUID, profile_id: uuid.UUID,
    headline: str = "", bio: str = "", designation: str = "", company: str = "",
    years_experience: int = 0, country: str | None = None, timezone: str = "Asia/Kolkata",
    session_price_amount: int = 0, session_price_currency: str = "INR",
    category_ids: list[str] | None = None, skills: list[str] | None = None, languages: list[str] | None = None,
) -> dict:
    profile = (await db.execute(select(Profile).where(Profile.id == profile_id))).scalar_one_or_none()
    if profile is None:
        raise BookingValidationError("Profile not found")
    existing = (await db.execute(
        select(Mentor.id).where(Mentor.profile_id == profile_id, Mentor.deleted_at.is_(None))
    )).scalar_one_or_none()
    if existing is not None:
        raise BookingValidationError("This person already has a mentor profile")

    mentor = Mentor(
        profile_id=profile_id, tenant_id=profile.tenant_id, status="pending",
        headline=headline or None, bio=bio or None, designation=designation or None, company=company or None,
        years_experience=years_experience, country=country, timezone=timezone,
        session_price_amount=session_price_amount, session_price_currency=session_price_currency,
        created_by=created_by,
    )
    db.add(mentor)
    await db.flush()

    for cat_id in category_ids or []:
        try:
            cid = uuid.UUID(cat_id)
        except ValueError:
            continue
        db.add(MentorCategoryLink(mentor_id=mentor.id, category_id=cid))
    for skill in {s.strip() for s in (skills or []) if s.strip()}:
        db.add(MentorSkill(mentor_id=mentor.id, skill=skill))
    for language in {l.strip() for l in (languages or []) if l.strip()}:
        db.add(MentorLanguage(mentor_id=mentor.id, language=language))

    await db.commit()

    audit(actor_id=str(created_by), actor_email=None, action="mentorship.mentor_created",
          entity_type="mentor", entity_id=str(mentor.id), meta={"profile_email": profile.email})

    mentors = await admin_list_mentors(db, status=None, search="")
    match = next((m for m in mentors if m["id"] == str(mentor.id)), None)
    return match or _admin_mentor_summary(mentor)


async def admin_list_categories(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(MentorCategory).order_by(MentorCategory.sort_order, MentorCategory.name))).scalars().all()
    counts = dict((await db.execute(
        select(MentorCategoryLink.category_id, func.count())
        .join(Mentor, Mentor.id == MentorCategoryLink.mentor_id)
        .where(Mentor.deleted_at.is_(None))
        .group_by(MentorCategoryLink.category_id)
    )).all())
    return [
        {
            "id": str(c.id), "name": c.name, "slug": c.slug, "icon": c.icon,
            "sort_order": c.sort_order, "is_active": c.is_active,
            "mentor_count": counts.get(c.id, 0),
        }
        for c in rows
    ]


async def admin_create_category(db: AsyncSession, *, name: str, icon: str | None = None, sort_order: int = 0) -> dict:
    name = name.strip()
    if not name:
        raise BookingValidationError("Category name can't be empty")
    base_slug = _slugify(name)
    slug = base_slug
    suffix = 2
    while (await db.execute(select(MentorCategory.id).where(MentorCategory.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    category = MentorCategory(name=name, slug=slug, icon=icon, sort_order=sort_order)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return {"id": str(category.id), "name": category.name, "slug": category.slug, "icon": category.icon,
            "sort_order": category.sort_order, "is_active": category.is_active, "mentor_count": 0}


async def admin_update_category(db: AsyncSession, category_id: uuid.UUID, fields: dict) -> dict:
    category = (await db.execute(select(MentorCategory).where(MentorCategory.id == category_id))).scalar_one_or_none()
    if category is None:
        raise BookingNotFoundError("Category not found")
    if "name" in fields and fields["name"] is not None:
        category.name = fields["name"].strip() or category.name
    if "icon" in fields and fields["icon"] is not None:
        category.icon = fields["icon"]
    if "sort_order" in fields and fields["sort_order"] is not None:
        category.sort_order = fields["sort_order"]
    if "is_active" in fields and fields["is_active"] is not None:
        category.is_active = fields["is_active"]
    await db.commit()
    categories = await admin_list_categories(db)
    return next(c for c in categories if c["id"] == str(category.id))


# ── Self-serve mentor application (Module 4b) ────────────────────────────────

async def apply_as_mentor(
    db: AsyncSession, *, profile_id: uuid.UUID, headline: str = "", bio: str = "",
    designation: str = "", company: str = "", years_experience: int = 0,
    country: str | None = None, timezone: str = "Asia/Kolkata",
    category_ids: list[str] | None = None, skills: list[str] | None = None, languages: list[str] | None = None,
) -> dict:
    """Same row shape as admin_create_mentor — just self-initiated
    (created_by == profile_id) instead of admin-initiated. Lands in the same
    'pending' queue admins already review."""
    return await admin_create_mentor(
        db, created_by=profile_id, profile_id=profile_id, headline=headline, bio=bio,
        designation=designation, company=company, years_experience=years_experience,
        country=country, timezone=timezone, category_ids=category_ids, skills=skills, languages=languages,
    )


# ── Mentor Offerings (Module 7) ──────────────────────────────────────────────

def _offering_to_dict(o: MentorOffering) -> dict:
    return {
        "id": str(o.id), "title": o.title, "description": o.description,
        "session_type": o.session_type, "duration_minutes": o.duration_minutes,
        "is_active": o.is_active, "sort_order": o.sort_order,
    }


async def list_mentor_offerings(db: AsyncSession, profile_id: uuid.UUID) -> list[dict]:
    mentor = await _resolve_mentor(db, profile_id)
    rows = (await db.execute(
        select(MentorOffering).where(MentorOffering.mentor_id == mentor.id).order_by(MentorOffering.sort_order)
    )).scalars().all()
    return [_offering_to_dict(o) for o in rows]


async def add_mentor_offering(
    db: AsyncSession, profile_id: uuid.UUID, *, title: str, description: str = "",
    session_type: str = "one_on_one", duration_minutes: int = 30,
) -> dict:
    mentor = await _resolve_mentor(db, profile_id)
    if not title.strip():
        raise BookingValidationError("Title is required")
    if session_type not in SESSION_TYPES:
        raise BookingValidationError(f"Unknown session type: {session_type}")
    count = (await db.execute(select(func.count()).select_from(MentorOffering).where(MentorOffering.mentor_id == mentor.id))).scalar_one()
    offering = MentorOffering(
        mentor_id=mentor.id, title=title.strip(), description=description.strip() or None,
        session_type=session_type, duration_minutes=duration_minutes, sort_order=count,
    )
    db.add(offering)
    await db.commit()
    await db.refresh(offering)
    return _offering_to_dict(offering)


async def update_mentor_offering(db: AsyncSession, profile_id: uuid.UUID, offering_id: uuid.UUID, fields: dict) -> dict:
    mentor = await _resolve_mentor(db, profile_id)
    offering = (await db.execute(
        select(MentorOffering).where(MentorOffering.id == offering_id, MentorOffering.mentor_id == mentor.id)
    )).scalar_one_or_none()
    if offering is None:
        raise BookingNotFoundError("Offering not found")
    for key in ("title", "description", "session_type", "duration_minutes", "is_active"):
        if key in fields and fields[key] is not None:
            setattr(offering, key, fields[key])
    await db.commit()
    await db.refresh(offering)
    return _offering_to_dict(offering)


async def remove_mentor_offering(db: AsyncSession, profile_id: uuid.UUID, offering_id: uuid.UUID) -> None:
    mentor = await _resolve_mentor(db, profile_id)
    result = await db.execute(
        MentorOffering.__table__.delete().where(MentorOffering.id == offering_id, MentorOffering.mentor_id == mentor.id)
    )
    await db.commit()
    if result.rowcount == 0:
        raise BookingNotFoundError("Offering not found")


# ── Mentee Dashboard ──────────────────────────────────────────────────────────

async def get_mentee_dashboard(db: AsyncSession, learner_id: uuid.UUID, *, month: str | None = None) -> dict:
    """Everything the mentee dashboard needs in one call: upcoming session,
    progress snapshot, highlights, recommended mentors, and a month's worth
    of sessions keyed by date for the calendar widget."""
    now_utc = datetime.now(ZoneInfo("UTC"))

    rows = (await db.execute(
        select(Booking, MentorSession, Profile.full_name.label("mentor_name"), Mentor.id.label("mentor_id"))
        .join(MentorSession, MentorSession.booking_id == Booking.id)
        .join(Mentor, Mentor.id == Booking.mentor_id)
        .join(Profile, Profile.id == Mentor.profile_id)
        .where(Booking.learner_id == learner_id, Booking.deleted_at.is_(None))
        .order_by(MentorSession.scheduled_start.asc())
    )).all()

    upcoming_rows = [r for r in rows if r.MentorSession.status == "scheduled" and r.MentorSession.scheduled_start and r.MentorSession.scheduled_start >= now_utc]
    upcoming_session = None
    if upcoming_rows:
        b, s, mentor_name, mentor_id = upcoming_rows[0]
        upcoming_session = {
            "booking_id": str(b.id), "session_id": str(s.id), "mentor_id": str(mentor_id),
            "mentor_name": mentor_name, "session_type": b.session_type,
            "scheduled_start": s.scheduled_start.isoformat(), "scheduled_end": s.scheduled_end.isoformat() if s.scheduled_end else None,
        }

    sessions_completed = sum(1 for r in rows if r.MentorSession.status == "completed")
    sessions_total = len({r.Booking.id for r in rows})

    events_total = (await db.execute(select(func.count()).select_from(EventAttendee).where(EventAttendee.profile_id == learner_id))).scalar() or 0
    events_attended = (await db.execute(
        select(func.count()).select_from(EventAttendee).where(EventAttendee.profile_id == learner_id, EventAttendee.attended.is_(True))
    )).scalar() or 0

    programs_enrolled = (await db.execute(
        select(func.count()).select_from(ProgramParticipant).where(ProgramParticipant.profile_id == learner_id, ProgramParticipant.role == "mentee")
    )).scalar() or 0

    # Highlights: top mentor by completed-session count among this learner's bookings.
    counts: dict[str, dict] = {}
    for b, s, mentor_name, mentor_id in rows:
        if s.status != "completed":
            continue
        key = str(mentor_id)
        counts.setdefault(key, {"mentor_id": key, "name": mentor_name, "session_count": 0})
        counts[key]["session_count"] += 1
    top_mentor = max(counts.values(), key=lambda x: x["session_count"], default=None)

    horizon = now_utc + timedelta(days=14)
    nothing_booked_soon = not any(
        r.MentorSession.status == "scheduled" and r.MentorSession.scheduled_start and now_utc <= r.MentorSession.scheduled_start <= horizon
        for r in rows
    )

    # Recommended mentors: same categories as mentors this learner already booked, excluding those; falls back to top-rated.
    booked_mentor_ids = {r.mentor_id for r in rows}
    category_ids = set((await db.execute(
        select(MentorCategoryLink.category_id).where(MentorCategoryLink.mentor_id.in_(booked_mentor_ids))
    )).scalars().all()) if booked_mentor_ids else set()

    rec_query = (
        select(Mentor)
        .join(Profile, Mentor.profile_id == Profile.id)
        .where(Mentor.status == "approved", Mentor.deleted_at.is_(None))
        .options(
            selectinload(Mentor.profile), selectinload(Mentor.skills), selectinload(Mentor.languages),
            selectinload(Mentor.category_links).selectinload(MentorCategoryLink.category), selectinload(Mentor.availability),
        )
    )
    if booked_mentor_ids:
        rec_query = rec_query.where(Mentor.id.notin_(booked_mentor_ids))
    if category_ids:
        rec_query = rec_query.where(Mentor.id.in_(
            select(MentorCategoryLink.mentor_id).where(MentorCategoryLink.category_id.in_(category_ids))
        ))
    rec_query = rec_query.order_by(Mentor.rating_avg.desc(), Mentor.sessions_completed.desc()).limit(5)
    recommended = (await db.execute(rec_query)).unique().scalars().all()

    # Calendar: sessions for the requested (or current) month, keyed by ISO date.
    if month:
        year, mo = (int(x) for x in month.split("-"))
    else:
        today = date.today()
        year, mo = today.year, today.month
    month_start = date(year, mo, 1)
    next_month = date(year + 1, 1, 1) if mo == 12 else date(year, mo + 1, 1)
    calendar_map: dict[str, list[dict]] = {}
    for b, s, mentor_name, mentor_id in rows:
        if not s.scheduled_start:
            continue
        local_date = s.scheduled_start.date()
        if month_start <= local_date < next_month:
            calendar_map.setdefault(local_date.isoformat(), []).append({
                "booking_id": str(b.id), "session_id": str(s.id), "mentor_name": mentor_name,
                "session_type": b.session_type, "status": s.status,
                "scheduled_start": s.scheduled_start.isoformat(),
            })

    return {
        "upcoming_session": upcoming_session,
        "progress": {
            "sessions_completed": sessions_completed,
            "sessions_total": sessions_total,
            "events_attended": events_attended,
            "events_total": events_total,
            "programs_enrolled": programs_enrolled,
        },
        "highlights": {
            "top_mentor": top_mentor,
            "programs_enrolled": programs_enrolled,
            "nudge_no_upcoming_session": nothing_booked_soon,
        },
        "recommended_mentors": [_mentor_to_dict(m) for m in recommended],
        "calendar": {"month": f"{year:04d}-{mo:02d}", "sessions_by_date": calendar_map},
    }


# ── Admin: Schedule / Growth / Platform Health / Action Queue / Leaderboard ──

async def admin_get_schedule(db: AsyncSession, week_start: date) -> dict:
    """All non-cancelled sessions across the platform for the 7-day window
    starting `week_start`, grouped by ISO date — the admin's global Schedule."""
    week_end = week_start + timedelta(days=7)
    utc = ZoneInfo("UTC")
    range_start = datetime.combine(week_start, dtime.min, tzinfo=utc)
    range_end = datetime.combine(week_end, dtime.min, tzinfo=utc)

    rows = (await db.execute(
        select(MentorSession, Booking, Profile.full_name.label("mentor_name"))
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .join(Profile, Profile.id == Mentor.profile_id)
        .where(
            MentorSession.scheduled_start >= range_start, MentorSession.scheduled_start < range_end,
            MentorSession.status.notin_(("cancelled", "rescheduled")), MentorSession.deleted_at.is_(None),
        )
        .order_by(MentorSession.scheduled_start.asc())
    )).all()

    learner_ids = {b.learner_id for _s, b, _n in rows}
    learner_names = dict((await db.execute(
        select(Profile.id, Profile.full_name).where(Profile.id.in_(learner_ids))
    )).all()) if learner_ids else {}

    days: dict[str, list[dict]] = {(week_start + timedelta(days=i)).isoformat(): [] for i in range(7)}
    for s, b, mentor_name in rows:
        day_key = s.scheduled_start.date().isoformat()
        days.setdefault(day_key, []).append({
            "session_id": str(s.id), "booking_id": str(b.id),
            "mentor_name": mentor_name, "learner_name": learner_names.get(b.learner_id),
            "session_type": b.session_type, "status": s.status,
            "scheduled_start": s.scheduled_start.isoformat(), "scheduled_end": s.scheduled_end.isoformat() if s.scheduled_end else None,
        })

    return {"week_start": week_start.isoformat(), "week_end": (week_end - timedelta(days=1)).isoformat(), "days": days}


async def admin_get_growth(db: AsyncSession, *, metric: str = "sessions", days: int = 30) -> dict:
    """Daily counts for the last `days` days — Sessions (booked) or Signups
    (new profiles), for the admin dashboard's toggleable Growth chart."""
    if metric not in ("sessions", "signups"):
        raise BookingValidationError("metric must be 'sessions' or 'signups'")
    since = datetime.now(ZoneInfo("UTC")) - timedelta(days=days)

    if metric == "sessions":
        rows = (await db.execute(
            select(Booking.created_at).where(Booking.created_at >= since, Booking.deleted_at.is_(None))
        )).scalars().all()
    else:
        rows = (await db.execute(select(Profile.created_at).where(Profile.created_at >= since))).scalars().all()

    counts: dict[str, int] = {}
    for ts in rows:
        if ts is None:
            continue
        key = ts.date().isoformat()
        counts[key] = counts.get(key, 0) + 1

    series = []
    for i in range(days, -1, -1):
        day = (datetime.now(ZoneInfo("UTC")) - timedelta(days=i)).date().isoformat()
        series.append({"date": day, "count": counts.get(day, 0)})

    return {"metric": metric, "days": days, "series": series}


async def admin_get_platform_health(db: AsyncSession) -> dict:
    since = datetime.now(ZoneInfo("UTC")) - timedelta(days=30)

    avg_rating = (await db.execute(
        select(func.avg(Review.rating)).where(Review.created_at >= since, Review.deleted_at.is_(None))
    )).scalar()

    total_30d = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.created_at >= since, Booking.deleted_at.is_(None))
    )).scalar() or 0
    cancelled_30d = (await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.created_at >= since, Booking.status == "cancelled", Booking.deleted_at.is_(None),
        )
    )).scalar() or 0

    from services.auth import check_auth_health
    auth_health = await check_auth_health()

    return {
        "auth_status": auth_health["status"],
        "auth_detail": auth_health["detail"],
        "avg_rating_30d": round(float(avg_rating), 2) if avg_rating is not None else 0,
        "cancellation_rate_30d": round(100 * cancelled_30d / total_30d, 1) if total_30d else 0,
    }


async def admin_get_action_queue(db: AsyncSession) -> dict:
    pending_applications = (await db.execute(
        select(func.count()).select_from(Mentor).where(Mentor.status == "pending", Mentor.deleted_at.is_(None))
    )).scalar() or 0
    disabled_accounts = (await db.execute(select(func.count()).select_from(Profile).where(Profile.is_active.is_(False)))).scalar() or 0

    all_programs = (await db.execute(select(Program.id).where(Program.deleted_at.is_(None), Program.status == "active"))).scalars().all()
    missing = 0
    for pid in all_programs:
        has_mentor = (await db.execute(
            select(ProgramParticipant.id).where(ProgramParticipant.program_id == pid, ProgramParticipant.role == "mentor").limit(1)
        )).scalar_one_or_none()
        has_mentee = (await db.execute(
            select(ProgramParticipant.id).where(ProgramParticipant.program_id == pid, ProgramParticipant.role == "mentee").limit(1)
        )).scalar_one_or_none()
        if has_mentor is None or has_mentee is None:
            missing += 1

    settings = await get_platform_settings(db)
    branding_configured = settings["brand_name"] != "Mentorle" or bool(settings["support_email"])

    return {
        "pending_applications": pending_applications,
        "disabled_accounts": disabled_accounts,
        "programs_missing_participants": missing,
        "branding_configured": branding_configured,
    }


async def get_leaderboard(db: AsyncSession, *, days: int = 30, limit: int = 50) -> list[dict]:
    """Mentors ranked by completed sessions within the rolling window, tie-broken
    by rating — used by both the mentor-facing and admin Leaderboard pages."""
    since = datetime.now(ZoneInfo("UTC")) - timedelta(days=days)

    window_counts = dict((await db.execute(
        select(MentorSession.mentor_id, func.count())
        .where(MentorSession.status == "completed", MentorSession.scheduled_start >= since)
        .group_by(MentorSession.mentor_id)
    )).all())

    mentors = (await db.execute(
        select(Mentor).where(Mentor.status == "approved", Mentor.deleted_at.is_(None))
        .options(selectinload(Mentor.profile))
    )).unique().scalars().all()

    board = [
        {
            "mentor_id": str(m.id), "full_name": m.profile.full_name if m.profile else None,
            "avatar_url": m.profile.avatar_url if m.profile else None,
            "sessions_in_window": window_counts.get(m.id, 0),
            "sessions_completed_total": m.sessions_completed,
            "rating_avg": float(m.rating_avg or 0), "rating_count": m.rating_count,
        }
        for m in mentors
    ]
    board.sort(key=lambda r: (r["sessions_in_window"], r["rating_avg"]), reverse=True)
    for i, row in enumerate(board[:limit], start=1):
        row["rank"] = i
    return board[:limit]


async def admin_get_mentorship_listings(db: AsyncSession) -> list[dict]:
    """Active mentor–mentee pairings, derived from bookings — one row per
    (mentor, learner) pair with their relationship stats."""
    rows = (await db.execute(
        select(Booking, MentorSession, Profile.full_name.label("mentor_name"))
        .join(MentorSession, MentorSession.booking_id == Booking.id)
        .join(Mentor, Mentor.id == Booking.mentor_id)
        .join(Profile, Profile.id == Mentor.profile_id)
        .where(Booking.deleted_at.is_(None))
    )).all()

    learner_ids = {b.learner_id for b, _s, _n in rows}
    learner_names = dict((await db.execute(select(Profile.id, Profile.full_name).where(Profile.id.in_(learner_ids)))).all()) if learner_ids else {}

    pairs: dict[tuple, dict] = {}
    for b, s, mentor_name in rows:
        key = (str(b.mentor_id), str(b.learner_id))
        p = pairs.setdefault(key, {
            "mentor_id": key[0], "mentor_name": mentor_name,
            "learner_id": key[1], "learner_name": learner_names.get(b.learner_id),
            "sessions_total": 0, "sessions_completed": 0, "has_upcoming": False, "last_session_at": None,
        })
        p["sessions_total"] += 1
        if s.status == "completed":
            p["sessions_completed"] += 1
        if s.status == "scheduled":
            p["has_upcoming"] = True
        if s.scheduled_start and (p["last_session_at"] is None or s.scheduled_start.isoformat() > p["last_session_at"]):
            p["last_session_at"] = s.scheduled_start.isoformat()

    return sorted(pairs.values(), key=lambda p: p["last_session_at"] or "", reverse=True)


async def admin_list_sessions(
    db: AsyncSession, *, status: str | None = None, mentor_search: str = "", learner_search: str = "",
    page: int = 1, page_size: int = 25,
) -> dict:
    """Global session log for the admin, with filters."""
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    MentorProfile = Profile
    query = (
        select(MentorSession, Booking, MentorProfile.full_name.label("mentor_name"))
        .join(Booking, Booking.id == MentorSession.booking_id)
        .join(Mentor, Mentor.id == MentorSession.mentor_id)
        .join(MentorProfile, MentorProfile.id == Mentor.profile_id)
        .where(MentorSession.deleted_at.is_(None))
    )
    if status:
        query = query.where(MentorSession.status == status)
    if mentor_search:
        query = query.where(MentorProfile.full_name.ilike(f"%{mentor_search}%"))
    if learner_search:
        query = query.where(Booking.learner_id.in_(select(Profile.id).where(Profile.full_name.ilike(f"%{learner_search}%"))))

    count_query = select(func.count()).select_from(query.with_only_columns(MentorSession.id).subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(MentorSession.scheduled_start.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).all()

    learner_ids = {b.learner_id for _s, b, _n in rows}
    learner_names = dict((await db.execute(select(Profile.id, Profile.full_name).where(Profile.id.in_(learner_ids)))).all()) if learner_ids else {}

    sessions = [
        {
            "session_id": str(s.id), "booking_id": str(b.id), "mentor_name": mentor_name,
            "learner_name": learner_names.get(b.learner_id), "session_type": b.session_type,
            "status": s.status, "scheduled_start": s.scheduled_start.isoformat() if s.scheduled_start else None,
            "duration_minutes": b.duration_minutes,
        }
        for s, b, mentor_name in rows
    ]
    return {"sessions": sessions, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, math.ceil(total / page_size))}


async def admin_get_recent_feedback(db: AsyncSession, limit: int = 10) -> list[dict]:
    rows = (await db.execute(
        select(Review, Profile.full_name.label("learner_name"), Mentor.id.label("mentor_id"))
        .join(Profile, Review.learner_id == Profile.id)
        .join(Mentor, Review.mentor_id == Mentor.id)
        .where(Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
        .limit(limit)
    )).all()
    mentor_ids = {mid for _r, _n, mid in rows}
    mentor_names = dict((await db.execute(
        select(Mentor.id, Profile.full_name).join(Profile, Mentor.profile_id == Profile.id).where(Mentor.id.in_(mentor_ids))
    )).all()) if mentor_ids else {}
    return [
        {
            "id": str(r.id), "rating": r.rating, "review_text": r.review_text,
            "learner_name": "Anonymous" if r.is_anonymous else learner_name,
            "mentor_name": mentor_names.get(mentor_id), "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, learner_name, mentor_id in rows
    ]


async def admin_delete_review(db: AsyncSession, review_id: uuid.UUID) -> None:
    """Moderation: soft-delete a review. On Postgres this also fires
    trg_reviews_rating_recalc (0006_mentorship.sql), which recomputes the
    mentor's rating_avg/rating_count off the remaining non-deleted reviews."""
    review = (await db.execute(select(Review).where(Review.id == review_id, Review.deleted_at.is_(None)))).scalar_one_or_none()
    if review is None:
        raise BookingNotFoundError("Review not found")
    review.deleted_at = datetime.now(ZoneInfo("UTC"))
    await db.commit()


# ── Platform Settings (Module 11) ────────────────────────────────────────────

async def get_platform_settings(db: AsyncSession) -> dict:
    from models import PlatformSettings
    row = (await db.execute(select(PlatformSettings).limit(1))).scalar_one_or_none()
    if row is None:
        row = PlatformSettings(brand_name="Mentorle")
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return {
        "brand_name": row.brand_name, "support_email": row.support_email,
        "maintenance_mode": row.maintenance_mode, "announcement": row.announcement,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def update_platform_settings(db: AsyncSession, admin_id: uuid.UUID, fields: dict) -> dict:
    from models import PlatformSettings
    row = (await db.execute(select(PlatformSettings).limit(1))).scalar_one_or_none()
    if row is None:
        row = PlatformSettings(brand_name="Mentorle")
        db.add(row)
    for key in ("brand_name", "support_email", "maintenance_mode", "announcement"):
        if key in fields and fields[key] is not None:
            setattr(row, key, fields[key])
    row.updated_by = admin_id
    await db.commit()
    await db.refresh(row)
    return await get_platform_settings(db)
