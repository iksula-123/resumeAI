-- ============================================================================
-- SahiCareer "My Resume" — Phase 1 additive schema
-- (Milestone B + I foundations, per PHASE1_BUILD_SPEC.md Sections 2, 3, 4)
--
-- Additive only: builds on 0001_initial_schema.sql / 0002_enable_rls.sql.
-- Does NOT drop or rewrite existing tables.
--
-- Adds:
--   * tenants                 (multi-tenant, Section 2)
--   * tenant_id on existing owner tables (backfilled to the active pilot tenant)
--   * career_record           (EduBridge record + nullable assessment fields, Section 4)
--   * role_profiles           (TAF pipeline output — the Phase-1 pre-fill library, Section 3)
--   * usage_events            (per-tenant cost attribution, Section 2 / 7)
--   * uploaded_resumes        (auto-delete, never permanently retained, Section 4 / F)
--
-- Apply: Supabase Studio → SQL Editor → Run, or `supabase db push`.
-- RLS for these tables lives in 0004_phase1_rls.sql.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";   -- gin_trgm_ops index on role_profiles

-- ----------------------------------------------------------------------------
-- Helper functions this migration depends on. Defined idempotently here so the
-- migration is self-sufficient even if 0001_initial_schema.sql was never run
-- (this project's cloud DB was bootstrapped via the ORM, not the SQL migration).
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================================
-- 1. tenants  (Section 2 — build the field + API boundary now; only pilot active)
-- ============================================================================
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,          -- stable key used by SSO/session handoff + tenant header
  name        text not null,
  theme       jsonb not null default '{}'::jsonb,   -- per-tenant white-label theme
  sso_config  jsonb not null default '{}'::jsonb,   -- per-tenant SSO / session-handoff config
  is_active   boolean not null default false,       -- only the learner-pilot tenant is active for Aug 1
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tenants_slug on public.tenants (slug);

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.handle_updated_at();

-- Seed the six tenants from the spec. Only the learner pilot (EduBridgeIndia) is active.
-- Fixed UUIDs so tenant_id column defaults + backfills are deterministic and re-runnable.
insert into public.tenants (id, slug, name, is_active) values
  ('00000000-0000-0000-0000-0000000000e1', 'edubridgeindia', 'EduBridgeIndia', true),
  ('00000000-0000-0000-0000-0000000000e2', 'campus-elevated', 'Campus Elevated', false),
  ('00000000-0000-0000-0000-0000000000e3', 'talentdeploy',   'TalentDeploy',    false),
  ('00000000-0000-0000-0000-0000000000e4', 'bridge-beyond',  'Bridge Beyond',   false),
  ('00000000-0000-0000-0000-0000000000e5', 'jree',           'JREE',            false),
  ('00000000-0000-0000-0000-0000000000e6', 'collegeos',      'CollegeOS',       false)
on conflict (id) do nothing;

-- ============================================================================
-- 2. tenant_id on existing owner tables (Section 2 — every user/resume/event row)
--    Nullable + default to the active pilot tenant so existing rows backfill cleanly.
--    RLS tightening by tenant claim is Milestone I; ownership RLS already isolates users.
-- ============================================================================
alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.resumes
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.cover_letters
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';
alter table public.ats_reports
  add column if not exists tenant_id uuid references public.tenants(id)
    default '00000000-0000-0000-0000-0000000000e1';

update public.profiles      set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.resumes       set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.cover_letters set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;
update public.ats_reports   set tenant_id = '00000000-0000-0000-0000-0000000000e1' where tenant_id is null;

create index if not exists idx_profiles_tenant       on public.profiles (tenant_id);
create index if not exists idx_resumes_tenant        on public.resumes (tenant_id);
create index if not exists idx_cover_letters_tenant  on public.cover_letters (tenant_id);
create index if not exists idx_ats_reports_tenant    on public.ats_reports (tenant_id);

-- ============================================================================
-- 3. career_record  (Section 4)
--    One EduBridge record per user. Assessment fields are NULLABLE now (JREE /
--    personality / behavioural) even though assessments are not built — cheap now,
--    painful rebuild later.
-- ============================================================================
create table if not exists public.career_record (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id)
                        default '00000000-0000-0000-0000-0000000000e1',
  -- EduBridge verified record (rendered GREEN in the UI)
  education           jsonb not null default '[]'::jsonb,   -- [{qualification, board/univ, year, marks}]
  edubridge_training  jsonb not null default '[]'::jsonb,   -- text[]-like array of training programmes
  certificates        jsonb not null default '[]'::jsonb,   -- [{name, issuer, date}]
  college             text,
  course              text,
  -- Assessment fields — nullable placeholders for Phase 2/3 (assessments not built)
  jree_score          numeric,
  personality         jsonb,
  behavioural         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_career_record_user   on public.career_record (user_id);
create index if not exists idx_career_record_tenant on public.career_record (tenant_id);

drop trigger if exists trg_career_record_updated_at on public.career_record;
create trigger trg_career_record_updated_at
  before update on public.career_record
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. role_profiles  (Section 3 — TAF pipeline output; the Phase-1 pre-fill library)
--    Shared reference data (NOT tenant-scoped): the top ~100 canonical roles.
-- ============================================================================
create table if not exists public.role_profiles (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- canonical_title slugified
  canonical_title   text not null,
  skills            text[] not null default '{}',  -- top frequency-ranked skills
  skills_detail     jsonb not null default '[]'::jsonb,  -- [{skill, count}] for weighting
  education         text,                          -- typical Educational Background
  selection_process text,                          -- typical Selection Process
  salary_min        integer,                       -- annual INR (trimmed)
  salary_max        integer,
  industry          text,
  sub_sector        text,
  category          text,
  demand_count      integer not null default 0,    -- requisition volume (ranking signal)
  raw_title_count   integer not null default 0,    -- how many raw titles collapsed into this role
  source            text not null default 'taf',   -- provenance
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_role_profiles_demand on public.role_profiles (demand_count desc);
create index if not exists idx_role_profiles_title_trgm on public.role_profiles using gin (canonical_title gin_trgm_ops);
create index if not exists idx_role_profiles_industry on public.role_profiles (industry);

drop trigger if exists trg_role_profiles_updated_at on public.role_profiles;
create trigger trg_role_profiles_updated_at
  before update on public.role_profiles
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. usage_events  (Section 2 / 7 — per-tenant usage + cost attribution)
-- ============================================================================
create table if not exists public.usage_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id)
                   default '00000000-0000-0000-0000-0000000000e1',
  user_id        uuid references public.profiles(id) on delete set null,
  event_type     text not null,        -- e.g. resume_created, ai_summary, download_pdf, voice_min
  ai_provider    text,                 -- openai | sarvam | local | null
  tokens         integer,
  cost_estimate  numeric,              -- estimated INR/USD cost for attribution
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_usage_events_tenant  on public.usage_events (tenant_id, created_at desc);
create index if not exists idx_usage_events_user    on public.usage_events (user_id);
create index if not exists idx_usage_events_type    on public.usage_events (event_type);

-- ============================================================================
-- 6. uploaded_resumes  (Section 4 / Milestone F — auto-delete, never retained)
-- ============================================================================
create table if not exists public.uploaded_resumes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id)
                 default '00000000-0000-0000-0000-0000000000e1',
  file_ref     text,                                -- storage path; cleared on delete
  parsed_json  jsonb not null default '{}'::jsonb,  -- extracted structure, transient
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  created_at   timestamptz not null default now()
);

create index if not exists idx_uploaded_resumes_user    on public.uploaded_resumes (user_id);
create index if not exists idx_uploaded_resumes_expires on public.uploaded_resumes (expires_at);

-- ============================================================================
-- End of migration
-- ============================================================================
