-- ============================================================================
-- 0007 — Mentor Profile detail tables (Module 4)
--
-- Mirrors the shape of the existing resume child tables (experiences,
-- education, certifications) so the same list-of-structured-records pattern
-- is used everywhere in this app, not a new one invented for mentors.
-- `achievements` is a jsonb string array directly on `mentors`, matching how
-- `resumes.achievements` already works (spec 0001_initial_schema.sql).
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.mentors
  add column if not exists achievements jsonb not null default '[]'::jsonb;

-- ============================================================================
-- mentor_experience
-- ============================================================================
create table if not exists public.mentor_experience (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.mentors(id) on delete cascade,
  position    text not null,
  company     text,
  location    text,
  start_date  text,
  end_date    text,
  is_current  boolean not null default false,
  bullets     jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_mentor_experience_mentor on public.mentor_experience (mentor_id);
drop trigger if exists trg_mentor_experience_updated_at on public.mentor_experience;
create trigger trg_mentor_experience_updated_at
  before update on public.mentor_experience
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- mentor_education
-- ============================================================================
create table if not exists public.mentor_education (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null references public.mentors(id) on delete cascade,
  institution  text not null,
  degree       text,
  field        text,
  start_date   text,
  end_date     text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_mentor_education_mentor on public.mentor_education (mentor_id);
drop trigger if exists trg_mentor_education_updated_at on public.mentor_education;
create trigger trg_mentor_education_updated_at
  before update on public.mentor_education
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- mentor_certifications
-- ============================================================================
create table if not exists public.mentor_certifications (
  id             uuid primary key default gen_random_uuid(),
  mentor_id      uuid not null references public.mentors(id) on delete cascade,
  name           text not null,
  issuer         text,
  issue_date     text,
  credential_url text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_mentor_certifications_mentor on public.mentor_certifications (mentor_id);
drop trigger if exists trg_mentor_certifications_updated_at on public.mentor_certifications;
create trigger trg_mentor_certifications_updated_at
  before update on public.mentor_certifications
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- RLS — same ownership pattern as the other mentor_* child tables
-- ============================================================================
alter table public.mentor_experience     enable row level security;
alter table public.mentor_education      enable row level security;
alter table public.mentor_certifications enable row level security;

drop policy if exists "mentor_experience_read_all" on public.mentor_experience;
create policy "mentor_experience_read_all" on public.mentor_experience for select using (true);
drop policy if exists "mentor_experience_owner" on public.mentor_experience;
create policy "mentor_experience_owner" on public.mentor_experience for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

drop policy if exists "mentor_education_read_all" on public.mentor_education;
create policy "mentor_education_read_all" on public.mentor_education for select using (true);
drop policy if exists "mentor_education_owner" on public.mentor_education;
create policy "mentor_education_owner" on public.mentor_education for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

drop policy if exists "mentor_certifications_read_all" on public.mentor_certifications;
create policy "mentor_certifications_read_all" on public.mentor_certifications for select using (true);
drop policy if exists "mentor_certifications_owner" on public.mentor_certifications;
create policy "mentor_certifications_owner" on public.mentor_certifications for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));
