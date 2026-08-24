"""
Normalized ORM models mirroring the Supabase schema
(supabase/migrations/0001_initial_schema.sql).

Notes for dual SQLite / Supabase-Postgres operation:
  * On SQLite, Base.metadata.create_all builds these tables fresh.
  * On Supabase, the SQL migration already created them (with the auth.users FK,
    RLS, and triggers). create_all uses checkfirst=True, so it skips existing
    tables — the models are then used purely for ORM queries via the service
    role (which bypasses RLS).
  * profiles.id is NOT declared as a FK to auth.users here (auth schema isn't
    managed by SQLAlchemy); the real FK lives in the SQL migration.
"""
from sqlalchemy import Column, String, DateTime, Date, Time, Boolean, Text, Integer, Float, ForeignKey, JSON
from sqlalchemy import Uuid as UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from database import Base

# Roles
ROLE_USER = "user"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_USER, ROLE_ADMIN}


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # multi-tenant (spec Section 2); DB defaults to the pilot tenant
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    role = Column(String(20), default=ROLE_USER, nullable=False, index=True)
    headline = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    linkedin_url = Column(Text, nullable=True)
    github_url = Column(Text, nullable=True)
    website_url = Column(Text, nullable=True)
    subscription_tier = Column(String(50), default="free")  # convenience mirror
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    cover_letters = relationship("CoverLetter", back_populates="user", cascade="all, delete-orphan")

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    def __repr__(self):
        return f"<Profile {self.email} ({self.role})>"


# Backwards-compatible alias — existing code imports `User`
User = Profile


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    # Phase 1A (multi-tenant guardrails) — this column has existed in the DB
    # since migration 0003 but was never mapped in the ORM, which is
    # precisely why it never suffered the NULL-write bug described on
    # Subscription.tenant_id below (SQLAlchemy never touched a column it
    # didn't know about, so the DB DEFAULT always applied cleanly). Mapping
    # it now to allow real query-level filtering — every resume-creation
    # call site is updated alongside this to set it explicitly, so that
    # guarantee isn't lost now that the ORM is aware of the column.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String(255), nullable=False, default="Untitled Resume")
    template_id = Column(String(50), default="modern")
    slug = Column(String(255), unique=True, nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    personal_info = Column(JSON, nullable=False, default=dict)
    summary = Column(Text, nullable=True)
    achievements = Column(JSON, nullable=False, default=list)
    interests = Column(JSON, nullable=False, default=list)
    ats_score = Column(Integer, nullable=True)

    # ── Design preservation (uploaded resumes) ──────────────────────────────
    # template_type: "sahicareer" (built-in template, default for resumes built
    # from scratch) | "uploaded_original" (came from an uploaded file whose
    # visual design is preserved). preserve_original gates which download path
    # export/resumes routes take — see services/docx_editor.py and
    # routers/upgrade.py. Original uploads are NEVER deleted or overwritten;
    # original_file_path points at the untouched file in Supabase Storage.
    template_type = Column(String(50), nullable=False, default="sahicareer")
    preserve_original = Column(Boolean, nullable=False, default=False)
    original_file_path = Column(Text, nullable=True)     # storage path (services/storage.py), not a public URL
    original_file_type = Column(String(10), nullable=True)  # "pdf" | "docx"
    original_filename = Column(String(255), nullable=True)
    font_metadata = Column(JSON, nullable=True)
    color_metadata = Column(JSON, nullable=True)
    layout_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("Profile", back_populates="resumes")
    experiences = relationship("Experience", back_populates="resume", cascade="all, delete-orphan", order_by="Experience.sort_order")
    education = relationship("Education", back_populates="resume", cascade="all, delete-orphan", order_by="Education.sort_order")
    skills = relationship("Skill", back_populates="resume", cascade="all, delete-orphan", order_by="Skill.sort_order")
    projects = relationship("Project", back_populates="resume", cascade="all, delete-orphan", order_by="Project.sort_order")
    certifications = relationship("Certification", back_populates="resume", cascade="all, delete-orphan", order_by="Certification.sort_order")
    languages = relationship("Language", back_populates="resume", cascade="all, delete-orphan", order_by="Language.sort_order")
    custom_sections = relationship("CustomSection", back_populates="resume", cascade="all, delete-orphan", order_by="CustomSection.sort_order")

    def __repr__(self):
        return f"<Resume {self.title}>"


class Experience(Base):
    __tablename__ = "experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(String(255), nullable=False)
    company = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    start_date = Column(String(50), nullable=True)
    end_date = Column(String(50), nullable=True)
    is_current = Column(Boolean, default=False, nullable=False)
    bullets = Column(JSON, nullable=False, default=list)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="experiences")


class Education(Base):
    __tablename__ = "education"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    institution = Column(String(255), nullable=False)
    degree = Column(String(255), nullable=True)
    field = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    start_date = Column(String(50), nullable=True)
    end_date = Column(String(50), nullable=True)
    gpa = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="education")


class Skill(Base):
    __tablename__ = "skills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    level = Column(Integer, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="skills")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    technologies = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    start_date = Column(String(50), nullable=True)
    end_date = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="projects")


class Certification(Base):
    __tablename__ = "certifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    issuer = Column(String(255), nullable=True)
    issue_date = Column(String(50), nullable=True)
    expiry_date = Column(String(50), nullable=True)
    credential_id = Column(String(255), nullable=True)
    url = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="certifications")


class CustomSection(Base):
    """A user-named freeform section (e.g. "Professional Development",
    "Publications") — the Resume Builder's escape hatch for content that
    doesn't fit any of the fixed sections. Deliberately the same
    id/resume_id/sort_order/timestamps shape as Project/Certification
    above; `title` is user-entered (not one of the fixed SECTIONS labels)
    and `content` is freeform text, same pattern as `summary`."""
    __tablename__ = "custom_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="")
    content = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="custom_sections")


class Language(Base):
    __tablename__ = "languages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    proficiency = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume", back_populates="languages")


class CoverLetter(Base):
    __tablename__ = "cover_letters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)
    # Phase 1A (multi-tenant guardrails) — see Resume.tenant_id above (same
    # "existed in DB since 0003, newly mapped here" situation).
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String(255), nullable=False, default="Untitled Cover Letter")
    content = Column(Text, nullable=True)
    job_title = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("Profile", back_populates="cover_letters")

    def __repr__(self):
        return f"<CoverLetter {self.title}>"


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    # Phase 1A (multi-tenant guardrails) — added by migration 0014. Lower
    # priority per the audit (no dedicated enforcement wiring in 1A), but the
    # column exists and is backfilled. IMPORTANT: always set this explicitly
    # at row-creation time in application code — never rely on the DB
    # column's DEFAULT alone. A plain nullable Column with no client-side
    # default causes SQLAlchemy to send an explicit NULL on INSERT when the
    # attribute is unset, which overrides a DB-level DEFAULT (confirmed
    # actually happening in production data for profiles/ats_reports before
    # this fix — see migration 0014's comment and services/deps.py).
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    plan = Column(String(50), default="free")
    status = Column(String(50), default="active")
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Subscription {self.user_id} {self.plan}>"


class AtsReport(Base):
    __tablename__ = "ats_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    job_title = Column(String(255), nullable=True)
    job_description = Column(Text, nullable=True)
    score = Column(Integer, nullable=False)
    matched_keywords = Column(JSON, nullable=False, default=list)
    missing_keywords = Column(JSON, nullable=False, default=list)
    suggestions = Column(JSON, nullable=False, default=list)
    # Pre-existing DB column (migration 0003) never reflected in the ORM
    # model until now — has a DB-side default, so adding it here is additive,
    # not a schema change. Populated going forward via tenant_of(user), same
    # attribution pattern as services/usage.py's usage_events.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)

    # ── Phase 3 (ATS Intelligence) — additive, nullable; existing rows and
    # existing readers of the original columns above are unaffected. ──
    target_role = Column(String(255), nullable=True)         # role_slug/title when analyzed without a JD
    analysis_mode = Column(String(20), nullable=True)         # "job_description" | "role_based"
    score_confidence = Column(String(10), nullable=True)      # "high" | "medium" | "low"
    score_breakdown = Column(JSON, nullable=True)              # legacy 9-dimension {key: pct} snapshot
    category_scores = Column(JSON, nullable=True)              # {key: {match, completeness, confidence, ...}}
    category_completeness = Column(JSON, nullable=True)        # {key: completeness} convenience projection
    category_confidence = Column(JSON, nullable=True)          # {key: confidence} convenience projection
    overall_confidence = Column(String(10), nullable=True)     # same scale as score_confidence
    critical_keywords = Column(JSON, nullable=True)
    important_keywords = Column(JSON, nullable=True)
    partial_matches = Column(JSON, nullable=True)
    formatting_analysis = Column(JSON, nullable=True)
    profile_completeness = Column(JSON, nullable=True)
    recommendations = Column(JSON, nullable=True)               # {high: [...], medium: [...], low: [...]}
    candidate_questions = Column(JSON, nullable=True)
    analysis_version = Column(String(20), nullable=True, default="v2-phase3")
    # ── Phase B (ATS Intelligence 2.0) — additive, nullable. Distinct from
    # analysis_version above: that versions the REPORT SHAPE (Phase 3's
    # persistence schema); this versions the SCORING ENGINE/formula itself
    # (services/ats_engine/ats_config.py::SCORING_ENGINE_VERSION), per Part 44
    # of the product spec — "store the version with every ATS analysis... this
    # allows rollback." Recorded on every report going forward; existing rows
    # are simply null (pre-dates the v2 engine, nothing to backfill honestly).
    scoring_engine_version = Column(String(20), nullable=True)
    # ── Phase G (ATS Checker mode redesign) — additive, nullable. `score`
    # above has ALWAYS meant different things depending on which engine
    # wrote the row (legacy scoring.py vs. v2 blended vs., now, mode-aware
    # resume_health) with nothing recording which — score_type fixes that
    # going forward WITHOUT reinterpreting any existing row: old rows are
    # simply null (honest — we don't know retroactively what they meant).
    # jd_sufficient records job_parser.assess_sufficiency()'s verdict for
    # this report's JD, when one was supplied — lets History/trend views
    # filter out or flag insufficient-JD attempts instead of comparing them
    # against real Job Match scores. See docs/ATS_ANALYSIS_MODES.md.
    score_type = Column(String(20), nullable=True)          # "resume_health" | "role_readiness" | "job_match"
    jd_sufficient = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<AtsReport {self.resume_id} score={self.score}>"


ATS_ACTION_TYPES = {
    "quantify_bullet", "improve_bullet", "add_keyword", "improve_summary", "improve_skills",
    "fix_section", "fix_formatting", "improve_grammar", "improve_readability",
    "add_skill_evidence", "improve_experience_alignment", "remove_repetition",
    "undo",  # Part 14 — restoring a previous value is its own first-class, auditable change_history record
}
ATS_RECOMMENDATION_STATUSES = {"pending", "answered", "approved", "rejected", "applied", "stale"}
ATS_EVIDENCE_TIERS = {"verified", "inferred", "suggested", "unknown"}


class AtsRecommendation(Base):
    """Phase D — one persisted, addressable AI ATS recommendation.

    Didn't exist before Phase D: through Phase C, recommendations were
    ephemeral response objects with no durable identity, which is fine for
    "show the user what's wrong" but not enough for "let the user approve
    THIS specific one later" (POST /recommendations/{id}/apply) or for
    staleness detection (Part 33) — both need something with a real id and
    a snapshot of the resume state it was generated against.
    """
    __tablename__ = "ats_recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    ats_report_id = Column(UUID(as_uuid=True), ForeignKey("ats_reports.id", ondelete="SET NULL"), nullable=True, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see the identical
    # comment on Subscription.tenant_id above: always set explicitly at
    # creation time, never rely on the DB DEFAULT alone.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)

    action_type = Column(String(50), nullable=False)          # one of ATS_ACTION_TYPES — never arbitrary free text
    priority = Column(String(10), nullable=False, default="low")  # high | medium | low
    title = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    affected_section = Column(String(50), nullable=True)      # e.g. "experience"
    affected_item_id = Column(String(100), nullable=True)     # e.g. an experience entry's index/id
    # The exact, verbatim current text this recommendation targets (a bullet,
    # or the summary) — captured once at staging time. This is the actual
    # locator apply_fix.py uses to find-and-replace; NOT re-derived from
    # title/reason text at apply time, which was a real bug (those strings
    # don't reliably contain the right quoted substring for every action
    # type — caught by the Phase D E2E test before this was ever applied).
    target_text = Column(Text, nullable=True)
    score_impact_estimate = Column(String(10), nullable=True)  # high | medium | low

    requires_user_input = Column(Boolean, nullable=False, default=False)
    question = Column(Text, nullable=True)
    user_answer = Column(Text, nullable=True)                 # the evidence the user supplied, verbatim

    evidence_tier = Column(String(10), nullable=False, default="unknown")  # ATS_EVIDENCE_TIERS
    proposed_content = Column(Text, nullable=True)             # AI-proposed replacement text (only ever built from verified facts)
    final_content = Column(Text, nullable=True)                # what actually gets applied — the AI proposal, OR the user's edit of it

    status = Column(String(10), nullable=False, default="pending")  # ATS_RECOMMENDATION_STATUSES
    rejection_reason = Column(Text, nullable=True)

    # Staleness detection (Part 33): the resume's updated_at at the moment
    # this recommendation was generated. If the resume has since changed,
    # applying this recommendation is refused — see services/ats_engine/apply_fix.py.
    resume_updated_at_snapshot = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    resume = relationship("Resume")

    def __repr__(self):
        return f"<AtsRecommendation {self.action_type} status={self.status}>"


class AtsChangeHistory(Base):
    """Phase B schema, Phase D is the first thing that writes to it — one row
    per AI-assisted (or manual) change applied to a resume, with the real
    before/after score delta and enough content to restore the previous
    state (Part 14 — Undo).

    A SEPARATE table from AtsReport (Phase B decision 4) — this is a
    growing, independently queryable log ("show me every applied fix for
    this resume"), not a snapshot of one analysis.

    Column names below were finalized in Phase D to match the product
    spec's Part 12 exactly (`action_type`/`score_delta` rather than Phase
    B's placeholder `change_type`/`delta`, plus `before_content`/
    `after_content`/`user_approved`) — safe to rename because nothing had
    ever written to this table yet (confirmed in the Phase C report).
    """
    __tablename__ = "ats_change_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    # The report AFTER the change was applied and rescored, if persisted.
    # Nullable + SET NULL: a change-history row must outlive the report it
    # references (the report itself could later be pruned/rotated).
    ats_report_id = Column(UUID(as_uuid=True), ForeignKey("ats_reports.id", ondelete="SET NULL"), nullable=True, index=True)
    recommendation_id = Column(UUID(as_uuid=True), ForeignKey("ats_recommendations.id", ondelete="SET NULL"), nullable=True, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    action_type = Column(String(50), nullable=True)
    before_content = Column(Text, nullable=True)   # the exact field's value before the change — enough to restore it
    after_content = Column(Text, nullable=True)
    user_approved = Column(Boolean, nullable=False, default=True)  # false only for a system-initiated record, e.g. an Undo's own history row
    before_score = Column(Integer, nullable=True)
    after_score = Column(Integer, nullable=True)
    score_delta = Column(Integer, nullable=True)
    changed_fields = Column(JSON, nullable=True, default=list)    # e.g. ["experience[0].bullets[2]"]
    changed_metrics = Column(JSON, nullable=True, default=list)   # e.g. [{"category": "keyword", "before": 74, "after": 82}]
    scoring_engine_version = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    resume = relationship("Resume")

    def __repr__(self):
        return f"<AtsChangeHistory {self.resume_id} {self.before_score}->{self.after_score}>"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    amount = Column(Integer, nullable=False, default=0)        # smallest currency unit (cents)
    currency = Column(String(10), nullable=False, default="usd")
    status = Column(String(30), nullable=False, default="pending")  # succeeded | pending | failed | refunded
    plan = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    stripe_session_id = Column(String(255), nullable=True)
    stripe_payment_intent_id = Column(String(255), nullable=True)
    stripe_invoice_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Payment {self.user_id} {self.amount}{self.currency} {self.status}>"


class Webhook(Base):
    """A user's subscription to platform events."""
    __tablename__ = "webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    url = Column(Text, nullable=False)
    secret = Column(String(80), nullable=False)              # signing secret (whsec_…)
    events = Column(JSON, nullable=False, default=list)        # list[str] of subscribed events
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Webhook {self.url}>"


class WebhookDelivery(Base):
    """A single delivery attempt record for a webhook."""
    __tablename__ = "webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False, index=True)
    event = Column(String(50), nullable=False)
    success = Column(Boolean, default=False, nullable=False)
    status_code = Column(Integer, nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<WebhookDelivery {self.event} {'ok' if self.success else 'fail'}>"


class ApiKey(Base):
    """A hashed API key for programmatic access to /api/v1."""
    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    name = Column(String(100), nullable=False, default="API Key")
    key_prefix = Column(String(24), nullable=False)          # shown in UI, e.g. rsk_live_ab12cd
    key_hash = Column(String(64), nullable=False, unique=True, index=True)  # sha256 of full key
    last_used = Column(DateTime(timezone=True), nullable=True)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ApiKey {self.key_prefix}… {'revoked' if self.revoked else 'active'}>"


class AuditLog(Base):
    """Immutable record of a security-relevant action (who did what, when)."""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(80), nullable=False, index=True)   # e.g. auth.login, resume.create
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(64), nullable=True)
    meta = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<AuditLog {self.action} by {self.actor_email}>"


class AIUsage(Base):
    """One row per AI (Gemini) call — for token accounting & cost analytics."""
    __tablename__ = "ai_usage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    feature = Column(String(50), nullable=False, default="unknown", index=True)
    model = Column(String(60), nullable=True)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    est_cost = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<AIUsage {self.feature} {self.total_tokens}tok>"


class JobApplication(Base):
    """A job the user is tracking through their pipeline."""
    __tablename__ = "job_applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    company = Column(String(255), nullable=False)
    position = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="applied", index=True)  # applied|interview|offer|rejected|joined
    location = Column(String(255), nullable=True)
    job_url = Column(Text, nullable=True)
    salary = Column(String(100), nullable=True)
    source = Column(String(100), nullable=True)          # LinkedIn, referral, etc.
    notes = Column(Text, nullable=True)
    applied_date = Column(String(20), nullable=True)      # ISO date string
    next_action = Column(String(20), nullable=True)       # ISO date string (reminder)
    next_action_note = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<JobApplication {self.company} · {self.status}>"


class ResumeVersion(Base):
    """Point-in-time snapshot of a resume, for history + one-click rollback."""
    __tablename__ = "resume_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resume_id = Column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    # Phase 1A (multi-tenant guardrails, migration 0014) — see Subscription.tenant_id above.
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String(255), nullable=True)
    template_id = Column(String(50), nullable=True)
    content = Column(JSON, nullable=True)
    ats_score = Column(Integer, nullable=True)
    source = Column(String(50), nullable=False, default="edit")  # edit | ai_upgrade | rollback | initial
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ResumeVersion {self.resume_id} {self.source}>"


# ═══════════════════════════════════════════════════════════════════════════
# Mentorship module (supabase/migrations/0006_mentorship.sql)
#
# Reuses Profile for both learners and mentors (a mentor is a profile with a
# matching `mentors` row) and Tenant for "organization" — no parallel user or
# org table. Constraints (checks, the double-booking exclusion on `sessions`)
# live in the SQL migration; these models mirror the column shapes for ORM use.
# ═══════════════════════════════════════════════════════════════════════════

MENTOR_STATUSES = {"pending", "approved", "rejected", "suspended"}
BOOKING_STATUSES = {"pending", "confirmed", "cancelled", "completed", "rescheduled"}
SESSION_STATUSES = {"scheduled", "completed", "cancelled", "no_show", "rescheduled"}
SESSION_TYPES = {"one_on_one", "resume_review", "mock_interview", "career_guidance", "group_session"}


class MentorCategory(Base):
    __tablename__ = "mentor_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    icon = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Mentor(Base):
    __tablename__ = "mentors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    status = Column(String(20), nullable=False, default="pending", index=True)
    headline = Column(Text, nullable=True)
    bio = Column(Text, nullable=True)
    designation = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    years_experience = Column(Integer, nullable=False, default=0)
    country = Column(String(100), nullable=True)
    timezone = Column(String(64), nullable=False, default="Asia/Kolkata")
    session_price_amount = Column(Integer, nullable=False, default=0)
    session_price_currency = Column(String(10), nullable=False, default="INR")
    is_featured = Column(Boolean, nullable=False, default=False)
    rating_avg = Column(Float, nullable=False, default=0)
    rating_count = Column(Integer, nullable=False, default=0)
    sessions_completed = Column(Integer, nullable=False, default=0)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)  # set on approve AND reject
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    achievements = Column(JSON, nullable=False, default=list)  # jsonb string array — matches Resume.achievements
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    profile = relationship("Profile", foreign_keys=[profile_id])
    skills = relationship("MentorSkill", cascade="all, delete-orphan")
    languages = relationship("MentorLanguage", cascade="all, delete-orphan")
    category_links = relationship("MentorCategoryLink", cascade="all, delete-orphan")
    availability = relationship("MentorAvailability", cascade="all, delete-orphan")
    experience = relationship("MentorExperience", cascade="all, delete-orphan", order_by="MentorExperience.sort_order")
    education = relationship("MentorEducation", cascade="all, delete-orphan", order_by="MentorEducation.sort_order")
    certifications = relationship("MentorCertification", cascade="all, delete-orphan", order_by="MentorCertification.sort_order")
    offerings = relationship("MentorOffering", cascade="all, delete-orphan", order_by="MentorOffering.sort_order")

    def __repr__(self):
        return f"<Mentor {self.profile_id} ({self.status})>"


class MentorExperience(Base):
    __tablename__ = "mentor_experience"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(String(255), nullable=False)
    company = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    start_date = Column(String(50), nullable=True)
    end_date = Column(String(50), nullable=True)
    is_current = Column(Boolean, nullable=False, default=False)
    bullets = Column(JSON, nullable=False, default=list)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MentorEducation(Base):
    __tablename__ = "mentor_education"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    institution = Column(String(255), nullable=False)
    degree = Column(String(255), nullable=True)
    field = Column(String(255), nullable=True)
    start_date = Column(String(50), nullable=True)
    end_date = Column(String(50), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MentorCertification(Base):
    __tablename__ = "mentor_certifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    issuer = Column(String(255), nullable=True)
    issue_date = Column(String(50), nullable=True)
    credential_url = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MentorCategoryLink(Base):
    __tablename__ = "mentor_category_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("mentor_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("MentorCategory")


class MentorSkill(Base):
    __tablename__ = "mentor_skills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    skill = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MentorLanguage(Base):
    __tablename__ = "mentor_languages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    language = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MentorAvailability(Base):
    __tablename__ = "mentor_availability"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    rule_type = Column(String(20), nullable=False, default="recurring")
    day_of_week = Column(Integer, nullable=True)
    specific_date = Column(Date, nullable=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    timezone = Column(String(64), nullable=False, default="Asia/Kolkata")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MeetingLink(Base):
    __tablename__ = "meeting_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    provider = Column(String(30), nullable=False, default="jitsi")
    url = Column(Text, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    learner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    session_type = Column(String(30), nullable=False, default="one_on_one")
    duration_minutes = Column(Integer, nullable=False, default=30)
    agenda = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    price_amount = Column(Integer, nullable=False, default=0)
    price_currency = Column(String(10), nullable=False, default="INR")
    cancellation_reason = Column(Text, nullable=True)
    cancelled_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    mentor = relationship("Mentor")
    sessions = relationship("MentorSession", back_populates="booking", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Booking {self.learner_id}->{self.mentor_id} ({self.status})>"


class MentorSession(Base):
    """Named MentorSession (not Session) to avoid clashing with SQLAlchemy's own Session class."""
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    scheduled_end = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), nullable=False, default="scheduled", index=True)
    meeting_link_id = Column(UUID(as_uuid=True), ForeignKey("meeting_links.id"), nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    booking = relationship("Booking", back_populates="sessions")
    meeting_link = relationship("MeetingLink")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)
    learner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    review_text = Column(Text, nullable=True)
    is_anonymous = Column(Boolean, nullable=False, default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MentorshipNotification(Base):
    """Named MentorshipNotification to leave room for a general-purpose Notification model later."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    related_entity_type = Column(String(50), nullable=True)
    related_entity_id = Column(UUID(as_uuid=True), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CareerGoal(Base):
    __tablename__ = "career_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)  # tenants FK enforced in SQL migration, not ORM (matches Profile.tenant_id)
    learner_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(DateTime(timezone=False), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SessionNote(Base):
    __tablename__ = "session_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False)
    note_text = Column(Text, nullable=False)
    visibility = Column(String(20), nullable=False, default="shared")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MentorDocument(Base):
    __tablename__ = "mentor_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False)
    file_path = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ═══════════════════════════════════════════════════════════════════════════
# Mentorship Phase 2 (supabase/migrations/0008_mentorship_phase2.sql)
#
# Offerings, Programs, Events, Tasks, Platform Feedback, Privacy Requests,
# Platform Settings — the pieces the marketplace/booking core (above) didn't
# need. Same conventions: mirrors the SQL migration's columns/constraints,
# no ORM-level FK to tenants (matches every other tenant_id column here).
# ═══════════════════════════════════════════════════════════════════════════

PROGRAM_STATUSES = {"active", "archived"}
PARTICIPANT_ROLES = {"mentor", "mentee"}
TASK_STATUSES = {"pending", "completed"}
PRIVACY_REQUEST_TYPES = {"access", "delete"}
PRIVACY_REQUEST_STATUSES = {"pending", "completed", "rejected"}


class MentorOffering(Base):
    __tablename__ = "mentor_offerings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mentor_id = Column(UUID(as_uuid=True), ForeignKey("mentors.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    session_type = Column(String(30), nullable=False, default="one_on_one")
    duration_minutes = Column(Integer, nullable=False, default=30)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Program(Base):
    __tablename__ = "programs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    participants = relationship("ProgramParticipant", cascade="all, delete-orphan")


class ProgramParticipant(Base):
    __tablename__ = "program_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    program_id = Column(UUID(as_uuid=True), ForeignKey("programs.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(10), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    profile = relationship("Profile", foreign_keys=[profile_id])


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    event_date = Column(DateTime(timezone=True), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    attendees = relationship("EventAttendee", cascade="all, delete-orphan")


class EventAttendee(Base):
    __tablename__ = "event_attendees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    attended = Column(Boolean, nullable=False, default=False)

    profile = relationship("Profile", foreign_keys=[profile_id])


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    mentee_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    program_id = Column(UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlatformFeedback(Base):
    __tablename__ = "platform_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PrivacyRequest(Base):
    __tablename__ = "privacy_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(10), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    notes = Column(Text, nullable=True)
    processed_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    brand_name = Column(String(255), nullable=False, default="Mentorle")
    support_email = Column(String(255), nullable=True)
    maintenance_mode = Column(Boolean, nullable=False, default=False)
    announcement = Column(Text, nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
