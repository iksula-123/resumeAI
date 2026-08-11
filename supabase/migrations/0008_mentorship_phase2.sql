-- ============================================================================
-- 0008 — Mentorship Phase 2: Offerings, Programs, Events, Tasks, Platform
-- Feedback, Privacy Requests, Platform Settings.
--
-- Same conventions as 0006/0007: uuid pk, tenant_id (nullable, FK enforced
-- app-side same as every other mentor_* table), soft-delete via deleted_at
-- where the row is user-mutable, handle_updated_at trigger, RLS on every
-- table. Reuses public.profiles / public.mentors / public.sessions /
-- public.bookings / public.reviews — no parallel user/session/feedback
-- tables.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ============================================================================
-- R. Repair block — a running `uvicorn --reload` dev server picked up the new
-- ORM models (backend/models.py) mid-development and its startup
-- `Base.metadata.create_all()` bare-created these 9 tables against this same
-- database before this migration got to run. Bare SQLAlchemy DDL has no
-- server-side `id` default, no UNIQUE constraints, no CHECK constraints.
-- This block adds exactly those, and is a harmless no-op on a fresh database
-- where the `create table` statements below already define them correctly
-- (ALTER COLUMN SET DEFAULT is always safe to re-run; the constraint guards
-- below skip if already present).
-- ============================================================================
do $$
begin
  if to_regclass('public.mentor_offerings') is not null then
    alter table public.mentor_offerings alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.programs') is not null then
    alter table public.programs alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.program_participants') is not null then
    alter table public.program_participants alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.events') is not null then
    alter table public.events alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.event_attendees') is not null then
    alter table public.event_attendees alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.tasks') is not null then
    alter table public.tasks alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.platform_feedback') is not null then
    alter table public.platform_feedback alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.privacy_requests') is not null then
    alter table public.privacy_requests alter column id set default gen_random_uuid();
  end if;
  if to_regclass('public.platform_settings') is not null then
    alter table public.platform_settings alter column id set default gen_random_uuid();
  end if;

  -- Same story for column defaults declared in the `create table` statements
  -- below (SQLAlchemy's Column(default=...) is Python-side only — it never
  -- reached Postgres on the bare-created tables). Restating them here is a
  -- no-op on a fresh install where `create table` already set them.
  if to_regclass('public.mentor_offerings') is not null then
    alter table public.mentor_offerings alter column session_type set default 'one_on_one';
    alter table public.mentor_offerings alter column duration_minutes set default 30;
    alter table public.mentor_offerings alter column is_active set default true;
    alter table public.mentor_offerings alter column sort_order set default 0;
  end if;
  if to_regclass('public.programs') is not null then
    alter table public.programs alter column status set default 'active';
  end if;
  if to_regclass('public.event_attendees') is not null then
    alter table public.event_attendees alter column attended set default false;
  end if;
  if to_regclass('public.tasks') is not null then
    alter table public.tasks alter column status set default 'pending';
  end if;
  if to_regclass('public.platform_settings') is not null then
    alter table public.platform_settings alter column brand_name set default 'Mentorle';
    alter table public.platform_settings alter column maintenance_mode set default false;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'program_participants_program_id_profile_id_key') then
    alter table public.program_participants add constraint program_participants_program_id_profile_id_key unique (program_id, profile_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_attendees_event_id_profile_id_key') then
    alter table public.event_attendees add constraint event_attendees_event_id_profile_id_key unique (event_id, profile_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_mentor_offerings_session_type') then
    alter table public.mentor_offerings add constraint chk_mentor_offerings_session_type
      check (session_type in ('one_on_one','resume_review','mock_interview','career_guidance','group_session'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_mentor_offerings_duration') then
    alter table public.mentor_offerings add constraint chk_mentor_offerings_duration check (duration_minutes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_programs_status') then
    alter table public.programs add constraint chk_programs_status check (status in ('active','archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_program_participants_role') then
    alter table public.program_participants add constraint chk_program_participants_role check (role in ('mentor','mentee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_tasks_status') then
    alter table public.tasks add constraint chk_tasks_status check (status in ('pending','completed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_platform_feedback_rating') then
    alter table public.platform_feedback add constraint chk_platform_feedback_rating check (rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_privacy_requests_type') then
    alter table public.privacy_requests add constraint chk_privacy_requests_type check (type in ('access','delete'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_privacy_requests_status') then
    alter table public.privacy_requests add constraint chk_privacy_requests_status check (status in ('pending','completed','rejected'));
  end if;
end $$;

-- ============================================================================
-- 0. mentors gains reviewed_by/reviewed_at so approve AND reject both record
--    who/when (today only approved_at/approved_by exist, reject leaves no trace).
-- ============================================================================
alter table public.mentors
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

-- ============================================================================
-- 1. mentor_offerings — mentor-defined topics/types of mentorship offered
-- ============================================================================
create table if not exists public.mentor_offerings (
  id                uuid primary key default gen_random_uuid(),
  mentor_id         uuid not null references public.mentors(id) on delete cascade,
  title             text not null,
  description       text,
  session_type      text not null default 'one_on_one'
                      check (session_type in ('one_on_one','resume_review','mock_interview','career_guidance','group_session')),
  duration_minutes  integer not null default 30 check (duration_minutes > 0),
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_mentor_offerings_mentor on public.mentor_offerings (mentor_id) where is_active;
drop trigger if exists trg_mentor_offerings_updated_at on public.mentor_offerings;
create trigger trg_mentor_offerings_updated_at
  before update on public.mentor_offerings
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. programs — structured mentorship programs (admin-created, joinable)
-- ============================================================================
create table if not exists public.programs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id),
  title        text not null,
  description  text,
  duration     text,                                   -- free text, e.g. "8 weeks"
  status       text not null default 'active' check (status in ('active','archived')),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_programs_tenant on public.programs (tenant_id) where deleted_at is null;
drop trigger if exists trg_programs_updated_at on public.programs;
create trigger trg_programs_updated_at
  before update on public.programs
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. program_participants — mentors/mentees enrolled in a program (self-join)
-- ============================================================================
create table if not exists public.program_participants (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('mentor','mentee')),
  joined_at   timestamptz not null default now(),
  unique (program_id, profile_id)
);
create index if not exists idx_program_participants_profile on public.program_participants (profile_id);
create index if not exists idx_program_participants_program on public.program_participants (program_id);

-- ============================================================================
-- 4. events — platform-wide events (admin-created, joinable)
-- ============================================================================
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id),
  title        text not null,
  description  text,
  event_date   timestamptz not null,
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_events_date on public.events (event_date) where deleted_at is null;
drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. event_attendees — registrations + attendance
-- ============================================================================
create table if not exists public.event_attendees (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  registered_at timestamptz not null default now(),
  attended      boolean not null default false,
  unique (event_id, profile_id)
);
create index if not exists idx_event_attendees_profile on public.event_attendees (profile_id);
create index if not exists idx_event_attendees_event on public.event_attendees (event_id);

-- ============================================================================
-- 6. tasks — action items/homework assigned to a mentee, tied to a session
--    and/or program (both optional — a mentor can assign ad hoc too)
-- ============================================================================
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id),
  mentee_id    uuid not null references public.profiles(id) on delete cascade,
  assigned_by  uuid not null references public.profiles(id),
  session_id   uuid references public.sessions(id) on delete set null,
  program_id   uuid references public.programs(id) on delete set null,
  title        text not null,
  description  text,
  due_date     date,
  status       text not null default 'pending' check (status in ('pending','completed')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_tasks_mentee on public.tasks (mentee_id, status);
drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. platform_feedback — feedback about the platform itself (not a session)
-- ============================================================================
create table if not exists public.platform_feedback (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants(id),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_feedback_created on public.platform_feedback (created_at desc);

-- ============================================================================
-- 8. privacy_requests — data access / deletion requests
-- ============================================================================
create table if not exists public.privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null check (type in ('access','delete')),
  status        text not null default 'pending' check (status in ('pending','completed','rejected')),
  notes         text,
  processed_by  uuid references public.profiles(id),
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_privacy_requests_user on public.privacy_requests (user_id);
create index if not exists idx_privacy_requests_status on public.privacy_requests (status);

-- ============================================================================
-- 9. platform_settings — single-row branding/platform configuration
-- ============================================================================
create table if not exists public.platform_settings (
  id                  uuid primary key default gen_random_uuid(),
  brand_name          text not null default 'Mentorle',
  support_email       text,
  maintenance_mode    boolean not null default false,
  announcement        text,
  updated_by          uuid references public.profiles(id),
  updated_at          timestamptz not null default now()
);
drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.handle_updated_at();
-- seed the single settings row if none exists yet — values spelled out
-- explicitly (not relying on column defaults) so this insert works whether
-- the table was just created above or bare-created earlier without them.
insert into public.platform_settings (brand_name, support_email, maintenance_mode, announcement)
select 'Mentorle', null, false, null
where not exists (select 1 from public.platform_settings);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.mentor_offerings    enable row level security;
alter table public.programs            enable row level security;
alter table public.program_participants enable row level security;
alter table public.events              enable row level security;
alter table public.event_attendees     enable row level security;
alter table public.tasks               enable row level security;
alter table public.platform_feedback   enable row level security;
alter table public.privacy_requests    enable row level security;
alter table public.platform_settings   enable row level security;

-- mentor_offerings: public read, owning mentor or admin write
drop policy if exists "mentor_offerings_read_all" on public.mentor_offerings;
create policy "mentor_offerings_read_all" on public.mentor_offerings for select using (true);
drop policy if exists "mentor_offerings_owner" on public.mentor_offerings;
create policy "mentor_offerings_owner" on public.mentor_offerings for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

-- programs: public read (browsable), admin write
drop policy if exists "programs_read_all" on public.programs;
create policy "programs_read_all" on public.programs for select using (deleted_at is null or public.is_admin());
drop policy if exists "programs_admin_write" on public.programs;
create policy "programs_admin_write" on public.programs for all using (public.is_admin()) with check (public.is_admin());

-- program_participants: visible to the participant, the program's mentors, or admin; self-join/leave
drop policy if exists "program_participants_read" on public.program_participants;
create policy "program_participants_read" on public.program_participants for select
  using (profile_id = auth.uid() or public.is_admin() or exists (
    select 1 from public.program_participants pp2
    where pp2.program_id = program_participants.program_id and pp2.profile_id = auth.uid() and pp2.role = 'mentor'
  ));
drop policy if exists "program_participants_self_join" on public.program_participants;
create policy "program_participants_self_join" on public.program_participants for insert
  with check (profile_id = auth.uid() or public.is_admin());
drop policy if exists "program_participants_self_leave" on public.program_participants;
create policy "program_participants_self_leave" on public.program_participants for delete
  using (profile_id = auth.uid() or public.is_admin());

-- events: public read (browsable), admin write
drop policy if exists "events_read_all" on public.events;
create policy "events_read_all" on public.events for select using (deleted_at is null or public.is_admin());
drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write" on public.events for all using (public.is_admin()) with check (public.is_admin());

-- event_attendees: visible to the attendee or admin; self-register/unregister
drop policy if exists "event_attendees_read" on public.event_attendees;
create policy "event_attendees_read" on public.event_attendees for select using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "event_attendees_self_register" on public.event_attendees;
create policy "event_attendees_self_register" on public.event_attendees for insert with check (profile_id = auth.uid() or public.is_admin());
drop policy if exists "event_attendees_self_unregister" on public.event_attendees;
create policy "event_attendees_self_unregister" on public.event_attendees for delete using (profile_id = auth.uid() or public.is_admin());

-- tasks: visible to the mentee or the assigning mentor/admin
drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select using (mentee_id = auth.uid() or assigned_by = auth.uid() or public.is_admin());
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert with check (assigned_by = auth.uid() or public.is_admin());
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update using (mentee_id = auth.uid() or assigned_by = auth.uid() or public.is_admin());

-- platform_feedback: strictly own to write, admin can read all
drop policy if exists "platform_feedback_own_or_admin_read" on public.platform_feedback;
create policy "platform_feedback_own_or_admin_read" on public.platform_feedback for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "platform_feedback_insert_own" on public.platform_feedback;
create policy "platform_feedback_insert_own" on public.platform_feedback for insert with check (user_id = auth.uid());

-- privacy_requests: strictly own to submit/read, admin processes
drop policy if exists "privacy_requests_own_or_admin_read" on public.privacy_requests;
create policy "privacy_requests_own_or_admin_read" on public.privacy_requests for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "privacy_requests_insert_own" on public.privacy_requests;
create policy "privacy_requests_insert_own" on public.privacy_requests for insert with check (user_id = auth.uid());
drop policy if exists "privacy_requests_admin_update" on public.privacy_requests;
create policy "privacy_requests_admin_update" on public.privacy_requests for update using (public.is_admin());

-- platform_settings: public read (branding needs to render for everyone), admin write
drop policy if exists "platform_settings_read_all" on public.platform_settings;
create policy "platform_settings_read_all" on public.platform_settings for select using (true);
drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write" on public.platform_settings for update using (public.is_admin());
