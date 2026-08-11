-- ============================================================================
-- 0006 — Mentorship module (plug-and-play into the existing SahiCareer schema)
--
-- Reuses what already exists instead of duplicating it:
--   * public.tenants        — "organization" in the mentorship spec IS a tenant
--   * public.profiles       — mentors/learners are profiles; no parallel user table
--   * public.audit_logs     — the spec's "activity_logs" already exists as this
--   * public.handle_updated_at() — same updated_at trigger every other table uses
--
-- New tables (all tenant-scoped, soft-delete where mutable, uuid pk):
--   mentor_categories, mentors, mentor_category_links, mentor_skills,
--   mentor_languages, mentor_availability, meeting_links, bookings, sessions,
--   reviews, notifications, career_goals, session_notes, mentor_documents
--
-- Idempotent — safe to re-run.
-- ============================================================================

create extension if not exists "btree_gist";  -- powers the double-booking exclusion constraint

-- ============================================================================
-- 1. mentor_categories — master list (e.g. "Software Engineering", "Product")
-- ============================================================================
create table if not exists public.mentor_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id),   -- null = global, visible to every tenant
  name        text not null,
  slug        text unique not null,
  icon        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_mentor_categories_tenant on public.mentor_categories (tenant_id);
drop trigger if exists trg_mentor_categories_updated_at on public.mentor_categories;
create trigger trg_mentor_categories_updated_at
  before update on public.mentor_categories
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 2. mentors — the mentor-specific extension of a profile (1:1)
-- ============================================================================
create table if not exists public.mentors (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null unique references public.profiles(id) on delete cascade,
  tenant_id              uuid references public.tenants(id),
  status                 text not null default 'pending'
                           check (status in ('pending','approved','rejected','suspended')),
  headline               text,
  bio                    text,
  designation            text,
  company                text,
  years_experience       integer not null default 0,
  country                text,
  timezone               text not null default 'Asia/Kolkata',
  session_price_amount   integer not null default 0,       -- 0 = free session
  session_price_currency text not null default 'INR',
  is_featured            boolean not null default false,
  rating_avg             numeric(3,2) not null default 0,
  rating_count           integer not null default 0,
  sessions_completed     integer not null default 0,
  approved_at            timestamptz,
  approved_by            uuid references public.profiles(id),
  rejection_reason       text,
  created_by             uuid references public.profiles(id),
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_mentors_tenant on public.mentors (tenant_id);
create index if not exists idx_mentors_status on public.mentors (status) where deleted_at is null;
create index if not exists idx_mentors_featured on public.mentors (is_featured) where deleted_at is null;
create index if not exists idx_mentors_rating on public.mentors (rating_avg desc);
drop trigger if exists trg_mentors_updated_at on public.mentors;
create trigger trg_mentors_updated_at
  before update on public.mentors
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. mentor_category_links — many-to-many mentors <-> categories
-- ============================================================================
create table if not exists public.mentor_category_links (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.mentors(id) on delete cascade,
  category_id uuid not null references public.mentor_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (mentor_id, category_id)
);
create index if not exists idx_mentor_category_links_category on public.mentor_category_links (category_id);

-- ============================================================================
-- 4. mentor_skills — filterable skill tags per mentor
-- ============================================================================
create table if not exists public.mentor_skills (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null references public.mentors(id) on delete cascade,
  skill      text not null,
  created_at timestamptz not null default now(),
  unique (mentor_id, skill)
);
create index if not exists idx_mentor_skills_skill on public.mentor_skills (lower(skill));

-- ============================================================================
-- 5. mentor_languages — filterable spoken languages per mentor
-- ============================================================================
create table if not exists public.mentor_languages (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null references public.mentors(id) on delete cascade,
  language   text not null,
  created_at timestamptz not null default now(),
  unique (mentor_id, language)
);
create index if not exists idx_mentor_languages_language on public.mentor_languages (lower(language));

-- ============================================================================
-- 6. mentor_availability — recurring weekly rules + date overrides/blackouts
-- ============================================================================
create table if not exists public.mentor_availability (
  id             uuid primary key default gen_random_uuid(),
  mentor_id      uuid not null references public.mentors(id) on delete cascade,
  tenant_id      uuid references public.tenants(id),
  rule_type      text not null default 'recurring'
                   check (rule_type in ('recurring','date_override','blackout')),
  day_of_week    smallint check (day_of_week between 0 and 6),  -- 0=Sunday; null for date_override/blackout
  specific_date  date,                                          -- null for recurring
  start_time     time not null,
  end_time       time not null,
  timezone       text not null default 'Asia/Kolkata',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time),
  check (
    (rule_type = 'recurring' and day_of_week is not null and specific_date is null)
    or (rule_type in ('date_override','blackout') and specific_date is not null)
  )
);
create index if not exists idx_mentor_availability_mentor on public.mentor_availability (mentor_id) where is_active;
drop trigger if exists trg_mentor_availability_updated_at on public.mentor_availability;
create trigger trg_mentor_availability_updated_at
  before update on public.mentor_availability
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. meeting_links — generated/assigned meeting URLs, referenced by sessions
-- ============================================================================
create table if not exists public.meeting_links (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants(id),
  provider   text not null default 'jitsi' check (provider in ('jitsi','google_meet','zoom','manual')),
  url        text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_meeting_links_updated_at on public.meeting_links;
create trigger trg_meeting_links_updated_at
  before update on public.meeting_links
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 8. bookings — the reservation/agreement between a learner and a mentor
-- ============================================================================
create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id),
  learner_id          uuid not null references public.profiles(id) on delete cascade,
  mentor_id           uuid not null references public.mentors(id) on delete cascade,
  session_type        text not null default 'one_on_one'
                        check (session_type in ('one_on_one','resume_review','mock_interview','career_guidance','group_session')),
  duration_minutes    integer not null default 30 check (duration_minutes > 0),
  agenda              text,
  status              text not null default 'pending'
                        check (status in ('pending','confirmed','cancelled','completed','rescheduled')),
  price_amount        integer not null default 0,
  price_currency      text not null default 'INR',
  cancellation_reason text,
  cancelled_by        uuid references public.profiles(id),
  created_by          uuid references public.profiles(id),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_bookings_learner on public.bookings (learner_id);
create index if not exists idx_bookings_mentor on public.bookings (mentor_id);
create index if not exists idx_bookings_tenant on public.bookings (tenant_id);
create index if not exists idx_bookings_status on public.bookings (status) where deleted_at is null;
drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 9. sessions — the scheduled meeting occurrence for a booking
--    (split from bookings so a reschedule creates a new session row while the
--    booking/agreement stays intact — and so double-booking can be enforced
--    with a DB-level exclusion constraint, not just application logic)
-- ============================================================================
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  mentor_id        uuid not null references public.mentors(id) on delete cascade,
  tenant_id        uuid references public.tenants(id),
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz not null,
  status           text not null default 'scheduled'
                     check (status in ('scheduled','completed','cancelled','no_show','rescheduled')),
  meeting_link_id  uuid references public.meeting_links(id),
  actual_start     timestamptz,
  actual_end       timestamptz,
  created_by       uuid references public.profiles(id),
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  -- Prevent double-booking: no two non-cancelled/non-rescheduled sessions for
  -- the same mentor may overlap in time.
  exclude using gist (
    mentor_id with =,
    tstzrange(scheduled_start, scheduled_end) with &&
  ) where (status not in ('cancelled','rescheduled') and deleted_at is null)
);
create index if not exists idx_sessions_booking on public.sessions (booking_id);
create index if not exists idx_sessions_mentor on public.sessions (mentor_id);
create index if not exists idx_sessions_scheduled_start on public.sessions (scheduled_start);
drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
  before update on public.sessions
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 10. reviews — one per booking, drives mentors.rating_avg / rating_count
-- ============================================================================
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id),
  booking_id    uuid not null unique references public.bookings(id) on delete cascade,
  learner_id    uuid not null references public.profiles(id) on delete cascade,
  mentor_id     uuid not null references public.mentors(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  review_text   text,
  is_anonymous  boolean not null default false,
  created_by    uuid references public.profiles(id),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_reviews_mentor on public.reviews (mentor_id) where deleted_at is null;
drop trigger if exists trg_reviews_updated_at on public.reviews;
create trigger trg_reviews_updated_at
  before update on public.reviews
  for each row execute function public.handle_updated_at();

-- keep mentors.rating_avg / rating_count in sync automatically
create or replace function public.mentor_rating_recalc() returns trigger
language plpgsql as $$
declare
  target_mentor uuid := coalesce(new.mentor_id, old.mentor_id);
begin
  update public.mentors m set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r
                              where r.mentor_id = target_mentor and r.deleted_at is null), 0),
    rating_count = (select count(*) from public.reviews r
                     where r.mentor_id = target_mentor and r.deleted_at is null)
  where m.id = target_mentor;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_reviews_rating_recalc on public.reviews;
create trigger trg_reviews_rating_recalc
  after insert or update or delete on public.reviews
  for each row execute function public.mentor_rating_recalc();

-- ============================================================================
-- 11. notifications — in-app notifications (email dispatch hooks in later on)
-- ============================================================================
create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  type                text not null,   -- booking_confirmed, booking_cancelled, session_reminder, review_reminder, ...
  title               text not null,
  body                text,
  related_entity_type text,
  related_entity_id   uuid,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications (user_id, is_read, created_at desc);

-- ============================================================================
-- 12. career_goals — learner dashboard
-- ============================================================================
create table if not exists public.career_goals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id),
  learner_id   uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text,
  target_date  date,
  status       text not null default 'active' check (status in ('active','completed','archived')),
  created_by   uuid references public.profiles(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_career_goals_learner on public.career_goals (learner_id) where deleted_at is null;
drop trigger if exists trg_career_goals_updated_at on public.career_goals;
create trigger trg_career_goals_updated_at
  before update on public.career_goals
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 13. session_notes — notes attached to a session (mentor and/or learner)
-- ============================================================================
create table if not exists public.session_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  note_text   text not null,
  visibility  text not null default 'shared' check (visibility in ('private','shared')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_session_notes_session on public.session_notes (session_id);
drop trigger if exists trg_session_notes_updated_at on public.session_notes;
create trigger trg_session_notes_updated_at
  before update on public.session_notes
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 14. mentor_documents — verification docs, reviewed by admins (Supabase Storage)
-- ============================================================================
create table if not exists public.mentor_documents (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null references public.mentors(id) on delete cascade,
  doc_type     text not null check (doc_type in ('resume','certificate','id_proof','other')),
  file_path    text not null,   -- path inside the private "mentor-documents" storage bucket
  status       text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_mentor_documents_mentor on public.mentor_documents (mentor_id);
drop trigger if exists trg_mentor_documents_updated_at on public.mentor_documents;
create trigger trg_mentor_documents_updated_at
  before update on public.mentor_documents
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- Row-Level Security (defense-in-depth — the FastAPI backend connects as the
-- table owner and bypasses RLS; this governs direct client/PostgREST access)
-- ============================================================================
alter table public.mentor_categories    enable row level security;
alter table public.mentors              enable row level security;
alter table public.mentor_category_links enable row level security;
alter table public.mentor_skills        enable row level security;
alter table public.mentor_languages     enable row level security;
alter table public.mentor_availability  enable row level security;
alter table public.meeting_links        enable row level security;
alter table public.bookings             enable row level security;
alter table public.sessions             enable row level security;
alter table public.reviews              enable row level security;
alter table public.notifications        enable row level security;
alter table public.career_goals         enable row level security;
alter table public.session_notes        enable row level security;
alter table public.mentor_documents     enable row level security;

-- categories: public read, admin write
drop policy if exists "mentor_categories_read_all" on public.mentor_categories;
create policy "mentor_categories_read_all" on public.mentor_categories for select using (true);
drop policy if exists "mentor_categories_admin_write" on public.mentor_categories;
create policy "mentor_categories_admin_write" on public.mentor_categories for all using (public.is_admin()) with check (public.is_admin());

-- mentors: approved mentors are publicly browsable; a mentor can manage their own row; admins manage all
drop policy if exists "mentors_read_approved_or_own_or_admin" on public.mentors;
create policy "mentors_read_approved_or_own_or_admin" on public.mentors
  for select using (status = 'approved' or profile_id = auth.uid() or public.is_admin());
drop policy if exists "mentors_update_own_or_admin" on public.mentors;
create policy "mentors_update_own_or_admin" on public.mentors
  for update using (profile_id = auth.uid() or public.is_admin());
drop policy if exists "mentors_insert_self" on public.mentors;
create policy "mentors_insert_self" on public.mentors for insert with check (profile_id = auth.uid());

-- mentor sub-tables: readable with the mentor, writable by the owning mentor or admin
drop policy if exists "mentor_category_links_read_all" on public.mentor_category_links;
create policy "mentor_category_links_read_all" on public.mentor_category_links for select using (true);
drop policy if exists "mentor_category_links_owner" on public.mentor_category_links;
create policy "mentor_category_links_owner" on public.mentor_category_links for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

drop policy if exists "mentor_skills_read_all" on public.mentor_skills;
create policy "mentor_skills_read_all" on public.mentor_skills for select using (true);
drop policy if exists "mentor_skills_owner" on public.mentor_skills;
create policy "mentor_skills_owner" on public.mentor_skills for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

drop policy if exists "mentor_languages_read_all" on public.mentor_languages;
create policy "mentor_languages_read_all" on public.mentor_languages for select using (true);
drop policy if exists "mentor_languages_owner" on public.mentor_languages;
create policy "mentor_languages_owner" on public.mentor_languages for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

drop policy if exists "mentor_availability_read_all" on public.mentor_availability;
create policy "mentor_availability_read_all" on public.mentor_availability for select using (true);
drop policy if exists "mentor_availability_owner" on public.mentor_availability;
create policy "mentor_availability_owner" on public.mentor_availability for all
  using (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.mentors m where m.id = mentor_id and (m.profile_id = auth.uid() or public.is_admin())));

-- bookings: learner or mentor party to the booking, or admin
drop policy if exists "bookings_party_or_admin" on public.bookings;
create policy "bookings_party_or_admin" on public.bookings
  for select using (
    learner_id = auth.uid()
    or exists (select 1 from public.mentors m where m.id = mentor_id and m.profile_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings for insert with check (learner_id = auth.uid());
drop policy if exists "bookings_update_party_or_admin" on public.bookings;
create policy "bookings_update_party_or_admin" on public.bookings
  for update using (
    learner_id = auth.uid()
    or exists (select 1 from public.mentors m where m.id = mentor_id and m.profile_id = auth.uid())
    or public.is_admin()
  );

-- sessions: party to the parent booking, or admin
drop policy if exists "sessions_party_or_admin" on public.sessions;
create policy "sessions_party_or_admin" on public.sessions
  for all using (
    exists (select 1 from public.bookings b where b.id = booking_id and b.learner_id = auth.uid())
    or exists (select 1 from public.mentors m where m.id = mentor_id and m.profile_id = auth.uid())
    or public.is_admin()
  );

-- reviews: public read (social proof), only the learner who booked can write
drop policy if exists "reviews_read_all" on public.reviews;
create policy "reviews_read_all" on public.reviews for select using (deleted_at is null);
drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews for insert with check (learner_id = auth.uid());
drop policy if exists "reviews_update_own_or_admin" on public.reviews;
create policy "reviews_update_own_or_admin" on public.reviews for update using (learner_id = auth.uid() or public.is_admin());

-- notifications: strictly own
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- career_goals: strictly own
drop policy if exists "career_goals_own" on public.career_goals;
create policy "career_goals_own" on public.career_goals for all using (learner_id = auth.uid()) with check (learner_id = auth.uid());

-- session_notes: party to the underlying session (shared notes) or the author (private notes)
drop policy if exists "session_notes_visible" on public.session_notes;
create policy "session_notes_visible" on public.session_notes
  for select using (
    author_id = auth.uid()
    or (visibility = 'shared' and exists (
      select 1 from public.sessions s
      join public.bookings b on b.id = s.booking_id
      join public.mentors m on m.id = s.mentor_id
      where s.id = session_id and (b.learner_id = auth.uid() or m.profile_id = auth.uid())
    ))
    or public.is_admin()
  );
drop policy if exists "session_notes_insert_own" on public.session_notes;
create policy "session_notes_insert_own" on public.session_notes for insert with check (author_id = auth.uid());

-- mentor_documents: owning mentor + admins only (sensitive verification docs)
drop policy if exists "mentor_documents_owner_or_admin" on public.mentor_documents;
create policy "mentor_documents_owner_or_admin" on public.mentor_documents
  for all using (
    exists (select 1 from public.mentors m where m.id = mentor_id and m.profile_id = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.mentors m where m.id = mentor_id and m.profile_id = auth.uid())
    or public.is_admin()
  );

-- meeting_links: only visible/writable through the owning session's RLS (no direct policy = no direct access
-- beyond admins); admins can still manage them directly.
drop policy if exists "meeting_links_admin" on public.meeting_links;
create policy "meeting_links_admin" on public.meeting_links for all using (public.is_admin()) with check (public.is_admin());
