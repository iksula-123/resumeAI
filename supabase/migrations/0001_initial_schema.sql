-- ============================================================================
-- ResumeAI Pro — Initial database schema (Supabase / PostgreSQL)
--
-- Conventions used (PostgreSQL / Supabase best practices):
--   * UUID primary keys via gen_random_uuid() (pgcrypto, built into Supabase)
--   * profiles.id is a 1:1 FK to auth.users(id) — Supabase auth owns identity
--   * ON DELETE CASCADE so deleting a user/resume cleans up all children
--   * timestamptz everywhere (never naive timestamps)
--   * Row-Level Security (RLS) enabled on every table; users see only their data
--   * updated_at maintained by a trigger, not the app
--   * a trigger auto-creates a profile row when a new auth user signs up
--   * indexes on every foreign key and on common lookup/sort columns
--   * sort_order columns so resume sections keep their display order
--
-- Apply: paste into Supabase Studio → SQL Editor → Run,
--        or `supabase db push` with the Supabase CLI.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- fuzzy text search on titles/skills

-- ============================================================================
-- Shared helper: keep updated_at current on every UPDATE
-- ============================================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. profiles  (1:1 with auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text unique not null,
  full_name          text,
  avatar_url         text,
  role               text not null default 'user' check (role in ('user', 'admin')),
  headline           text,
  phone              text,
  location           text,
  linkedin_url       text,
  github_url         text,
  website_url        text,
  is_active          boolean not null default true,
  last_login         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_email on public.profiles (email);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create a profile when a new auth user is created -----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. subscriptions  (1:1 with profile)
-- ============================================================================
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references public.profiles(id) on delete cascade,
  plan                     text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  status                   text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id       text,
  stripe_subscription_id   text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions (stripe_customer_id);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. resumes  (parent of all section tables)
-- ============================================================================
create table if not exists public.resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null default 'Untitled Resume',
  template_id   text not null default 'modern',
  slug          text unique,                        -- for public sharing URLs
  is_public     boolean not null default false,
  -- denormalized header block (name/title/contact) kept as jsonb for flexibility
  personal_info jsonb not null default '{}'::jsonb,
  summary       text,
  -- short free-text arrays with no dedicated table
  achievements  jsonb not null default '[]'::jsonb,
  interests     jsonb not null default '[]'::jsonb,
  ats_score     integer check (ats_score between 0 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_resumes_user_id on public.resumes (user_id);
create index if not exists idx_resumes_updated_at on public.resumes (updated_at desc);
create index if not exists idx_resumes_title_trgm on public.resumes using gin (title gin_trgm_ops);

create trigger trg_resumes_updated_at
  before update on public.resumes
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. experiences
-- ============================================================================
create table if not exists public.experiences (
  id           uuid primary key default gen_random_uuid(),
  resume_id    uuid not null references public.resumes(id) on delete cascade,
  position     text not null,
  company      text,
  location     text,
  start_date   text,        -- free text ("Jan 2021") to allow partial / "Present"
  end_date     text,
  is_current   boolean not null default false,
  bullets      jsonb not null default '[]'::jsonb,   -- array of bullet strings
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_experiences_resume_id on public.experiences (resume_id);
create index if not exists idx_experiences_sort on public.experiences (resume_id, sort_order);

create trigger trg_experiences_updated_at
  before update on public.experiences
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. education
-- ============================================================================
create table if not exists public.education (
  id           uuid primary key default gen_random_uuid(),
  resume_id    uuid not null references public.resumes(id) on delete cascade,
  institution  text not null,
  degree       text,
  field        text,
  location     text,
  start_date   text,
  end_date     text,
  gpa          text,
  description  text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_education_resume_id on public.education (resume_id);
create index if not exists idx_education_sort on public.education (resume_id, sort_order);

create trigger trg_education_updated_at
  before update on public.education
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 6. skills
-- ============================================================================
create table if not exists public.skills (
  id           uuid primary key default gen_random_uuid(),
  resume_id    uuid not null references public.resumes(id) on delete cascade,
  name         text not null,
  category     text,                                  -- e.g. "Frontend", "Tools"
  level        integer check (level between 0 and 100),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_skills_resume_id on public.skills (resume_id);
create index if not exists idx_skills_name_trgm on public.skills using gin (name gin_trgm_ops);

create trigger trg_skills_updated_at
  before update on public.skills
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. projects
-- ============================================================================
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  resume_id     uuid not null references public.resumes(id) on delete cascade,
  name          text not null,
  description   text,
  technologies  text,
  url           text,
  start_date    text,
  end_date      text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_projects_resume_id on public.projects (resume_id);
create index if not exists idx_projects_sort on public.projects (resume_id, sort_order);

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 8. certifications
-- ============================================================================
create table if not exists public.certifications (
  id              uuid primary key default gen_random_uuid(),
  resume_id       uuid not null references public.resumes(id) on delete cascade,
  name            text not null,
  issuer          text,
  issue_date      text,
  expiry_date     text,
  credential_id   text,
  url             text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_certifications_resume_id on public.certifications (resume_id);
create index if not exists idx_certifications_sort on public.certifications (resume_id, sort_order);

create trigger trg_certifications_updated_at
  before update on public.certifications
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 9. languages
-- ============================================================================
create table if not exists public.languages (
  id           uuid primary key default gen_random_uuid(),
  resume_id    uuid not null references public.resumes(id) on delete cascade,
  name         text not null,
  proficiency  text check (proficiency in ('Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_languages_resume_id on public.languages (resume_id);
create index if not exists idx_languages_sort on public.languages (resume_id, sort_order);

create trigger trg_languages_updated_at
  before update on public.languages
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 9b. cover_letters  (standalone documents, owned by a profile)
-- ============================================================================
create table if not exists public.cover_letters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  resume_id    uuid references public.resumes(id) on delete set null,
  title        text not null default 'Untitled Cover Letter',
  content      text,
  job_title    text,
  company      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_cover_letters_user_id on public.cover_letters (user_id);
create index if not exists idx_cover_letters_resume_id on public.cover_letters (resume_id);

create trigger trg_cover_letters_updated_at
  before update on public.cover_letters
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 10. ats_reports  (history of ATS scans against job descriptions)
-- ============================================================================
create table if not exists public.ats_reports (
  id                uuid primary key default gen_random_uuid(),
  resume_id         uuid not null references public.resumes(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  job_title         text,
  job_description   text,
  score             integer not null check (score between 0 and 100),
  matched_keywords  jsonb not null default '[]'::jsonb,
  missing_keywords  jsonb not null default '[]'::jsonb,
  suggestions       jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ats_reports_resume_id on public.ats_reports (resume_id);
create index if not exists idx_ats_reports_user_id on public.ats_reports (user_id);
create index if not exists idx_ats_reports_created_at on public.ats_reports (created_at desc);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.resumes        enable row level security;
alter table public.experiences    enable row level security;
alter table public.education      enable row level security;
alter table public.skills         enable row level security;
alter table public.projects       enable row level security;
alter table public.certifications enable row level security;
alter table public.languages      enable row level security;
alter table public.cover_letters  enable row level security;
alter table public.ats_reports    enable row level security;

-- Helper: is the current user an admin? (security definer to avoid RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- ── subscriptions ────────────────────────────────────────────────────────────
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "subscriptions_modify_own" on public.subscriptions;
create policy "subscriptions_modify_own" on public.subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── resumes ───────────────────────────────────────────────────────────────────
drop policy if exists "resumes_select_own_public_or_admin" on public.resumes;
create policy "resumes_select_own_public_or_admin" on public.resumes
  for select using (user_id = auth.uid() or is_public = true or public.is_admin());
drop policy if exists "resumes_modify_own" on public.resumes;
create policy "resumes_modify_own" on public.resumes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── section tables: ownership flows through resumes.user_id ──────────────────
-- A reusable pattern applied to each child table.
drop policy if exists "experiences_owner" on public.experiences;
create policy "experiences_owner" on public.experiences
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

drop policy if exists "education_owner" on public.education;
create policy "education_owner" on public.education
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

drop policy if exists "skills_owner" on public.skills;
create policy "skills_owner" on public.skills
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

drop policy if exists "projects_owner" on public.projects;
create policy "projects_owner" on public.projects
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

drop policy if exists "certifications_owner" on public.certifications;
create policy "certifications_owner" on public.certifications
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

drop policy if exists "languages_owner" on public.languages;
create policy "languages_owner" on public.languages
  for all using (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid()));

-- ── cover_letters ─────────────────────────────────────────────────────────────
drop policy if exists "cover_letters_select_own_or_admin" on public.cover_letters;
create policy "cover_letters_select_own_or_admin" on public.cover_letters
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "cover_letters_modify_own" on public.cover_letters;
create policy "cover_letters_modify_own" on public.cover_letters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── ats_reports ───────────────────────────────────────────────────────────────
drop policy if exists "ats_reports_owner_or_admin" on public.ats_reports;
create policy "ats_reports_owner_or_admin" on public.ats_reports
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "ats_reports_insert_own" on public.ats_reports;
create policy "ats_reports_insert_own" on public.ats_reports
  for insert with check (user_id = auth.uid());
drop policy if exists "ats_reports_delete_own" on public.ats_reports;
create policy "ats_reports_delete_own" on public.ats_reports
  for delete using (user_id = auth.uid());

-- ============================================================================
-- End of migration
-- ============================================================================
