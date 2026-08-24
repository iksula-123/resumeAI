-- ============================================================================
-- Phase 1A — Multi-tenant guardrails: additive tenant_id columns
--
-- Adds tenant_id to the tables identified by the Phase 1A audit as missing it
-- (resume_versions, ats_recommendations, ats_change_history, ai_usage,
-- api_keys, webhooks) plus the two lower-priority tables the audit flagged
-- (payments, subscriptions). Follows the EXACT same pattern 0003 already
-- established for profiles/resumes/cover_letters/ats_reports: nullable
-- column + DEFAULT to the pilot tenant + explicit backfill UPDATE (defensive/
-- redundant with the DEFAULT on PG11+, but matches existing convention and
-- gives an auditable statement) + index. NOT NULL is deliberately deferred to
-- a later, separate migration once a clean backfill is verified.
--
-- Explicitly NOT touched, per the Phase 1A design:
--   * tenants, role_profiles, platform_settings — stay exactly as-is.
--   * mentor_categories — already has tenant_id; NULL there means GLOBAL
--     (see 0006_mentorship.sql's own comment), so it is NOT backfilled here.
--   * webhook_deliveries — a pure child of webhooks (via webhook_id); it
--     inherits tenant scope through its parent, same pattern as
--     experiences/education/etc. inheriting through resumes.
--
-- Apply: Supabase Studio → SQL Editor → Run.
-- Idempotent: safe to re-run (IF NOT EXISTS / IF NULL guards throughout).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add columns (nullable, defaulted to the active pilot tenant)
-- ---------------------------------------------------------------------------
alter table public.resume_versions
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.ats_recommendations
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.ats_change_history
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.ai_usage
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.api_keys
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.webhooks
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
-- Lower priority (per the Phase 1A audit) but cheap and safe to add now;
-- enforcement wiring for these two is explicitly out of scope for 1A.
alter table public.payments
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.subscriptions
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';

-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows explicitly (defensive; matches 0003's own
--    pattern even though PG11+ ADD COLUMN...DEFAULT already applies the
--    default value to pre-existing rows without a table rewrite)
-- ---------------------------------------------------------------------------
update public.resume_versions     set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.ats_recommendations set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.ats_change_history  set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.ai_usage            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.api_keys            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.webhooks            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.payments            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.subscriptions       set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_resume_versions_tenant     on public.resume_versions (tenant_id);
create index if not exists idx_ats_recommendations_tenant on public.ats_recommendations (tenant_id);
create index if not exists idx_ats_change_history_tenant  on public.ats_change_history (tenant_id);
create index if not exists idx_ai_usage_tenant             on public.ai_usage (tenant_id);
create index if not exists idx_api_keys_tenant             on public.api_keys (tenant_id);
create index if not exists idx_webhooks_tenant             on public.webhooks (tenant_id);
create index if not exists idx_payments_tenant             on public.payments (tenant_id);
create index if not exists idx_subscriptions_tenant        on public.subscriptions (tenant_id);

-- ---------------------------------------------------------------------------
-- 4. Supplementary backfill for tables 0003 already added tenant_id to.
--    Verification (run live against the DB while building this migration)
--    found 43 `profiles` rows and 2 `ats_reports` rows still NULL despite
--    0003's own backfill UPDATE — root cause: Profile.tenant_id and
--    AtsReport.tenant_id are mapped in the SQLAlchemy ORM as plain
--    `Column(nullable=True)` with no client-side default, so every ORM
--    INSERT that doesn't explicitly set tenant_id sends it as an EXPLICIT
--    NULL, which overrides this table's DEFAULT clause (a DEFAULT only
--    applies when a column is omitted from the INSERT, not when NULL is
--    given explicitly). Resume/CoverLetter have no tenant_id in the ORM at
--    all, so they were never affected by this — their DB default fired
--    cleanly every time. All 45 affected rows belong to the single active
--    pilot tenant (confirmed: every one is a recent local-test account,
--    and every NULL ats_reports row's owning profile is already tenant e1),
--    so this backfill is safe and simply completes what 0003 intended.
--    The actual bug (ORM writing explicit NULL) is fixed in application
--    code (services/deps.py and the relevant routers), not by this
--    migration alone — see the Phase 1A implementation report.
-- ---------------------------------------------------------------------------
update public.profiles    set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.ats_reports set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;

-- ---------------------------------------------------------------------------
-- 5. Mentorship tables — these already had a tenant_id column (added in
--    0006/0008) but NO default and NO backfill was ever run for them, so
--    every existing row is currently NULL. Enforcement code (Phase 1A) adds
--    tenant_id filtering to the mentor marketplace (strict equality — a
--    mentor row's tenant_id has no "global" meaning) and to programs/events
--    (OR-with-NULL — see services/programs.py's comment; NULL there IS
--    intentionally global, same convention as mentor_categories). Backfilling
--    ALL of them to the pilot tenant is still correct and safe either way:
--    100% of current data belongs to the single active tenant, exactly the
--    same reasoning already applied to every other table in this migration.
--    mentor_categories is explicitly EXCLUDED — its NULL rows are a
--    deliberate, permanent "global category" feature, not backfill debt
--    (see 0006_mentorship.sql's own comment: "null = global").
-- ---------------------------------------------------------------------------
update public.mentors             set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.bookings            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.sessions            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.reviews             set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.notifications       set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.career_goals        set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.mentor_availability set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.meeting_links       set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.programs            set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.events              set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.tasks               set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.platform_feedback   set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
-- mentor_categories: intentionally NOT touched — see comment above.
-- No new indexes added — 0006/0008 already indexed tenant_id on several of
-- these tables (idx_mentors_tenant, idx_bookings_tenant, idx_programs_tenant,
-- idx_mentor_categories_tenant); the rest are low-row-count tables today
-- where an index isn't yet load-bearing — add one later if/when needed.

-- ============================================================================
-- End of migration. NOT NULL tightening is intentionally deferred — see
-- 0015_tenant_guardrails_notnull.sql (created only after a clean backfill
-- verification pass), not part of this migration.
-- ============================================================================
