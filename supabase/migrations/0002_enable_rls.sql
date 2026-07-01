-- ============================================================================
-- 0002 — Enable Row-Level Security on the app tables
--
-- The backend connects as the `postgres` role, which OWNS these tables and
-- therefore BYPASSES RLS — so the FastAPI app keeps working unchanged. RLS here
-- is defense-in-depth: it governs the `anon` / `authenticated` roles used by
-- any direct client access (supabase-js / PostgREST) via the anon key.
--
-- Ownership model: profiles.id == the Supabase auth user id (auth.uid()).
-- Child rows are owned through resumes.user_id.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- Admin check (security definer to avoid recursive RLS on profiles)
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

-- Enable RLS ------------------------------------------------------------------
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
alter table public.payments       enable row level security;

-- profiles --------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- subscriptions ---------------------------------------------------------------
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "subscriptions_modify_own" on public.subscriptions;
create policy "subscriptions_modify_own" on public.subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- resumes ---------------------------------------------------------------------
drop policy if exists "resumes_select_own_public_or_admin" on public.resumes;
create policy "resumes_select_own_public_or_admin" on public.resumes
  for select using (user_id = auth.uid() or is_public = true or public.is_admin());
drop policy if exists "resumes_modify_own" on public.resumes;
create policy "resumes_modify_own" on public.resumes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- section tables: ownership flows through resumes.user_id --------------------
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

-- cover_letters ---------------------------------------------------------------
drop policy if exists "cover_letters_select_own_or_admin" on public.cover_letters;
create policy "cover_letters_select_own_or_admin" on public.cover_letters
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "cover_letters_modify_own" on public.cover_letters;
create policy "cover_letters_modify_own" on public.cover_letters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ats_reports -----------------------------------------------------------------
drop policy if exists "ats_reports_owner_or_admin" on public.ats_reports;
create policy "ats_reports_owner_or_admin" on public.ats_reports
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "ats_reports_insert_own" on public.ats_reports;
create policy "ats_reports_insert_own" on public.ats_reports
  for insert with check (user_id = auth.uid());
drop policy if exists "ats_reports_delete_own" on public.ats_reports;
create policy "ats_reports_delete_own" on public.ats_reports
  for delete using (user_id = auth.uid());

-- payments (read-only for users; writes happen via backend/postgres) ----------
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

-- ============================================================================
-- End of migration
-- ============================================================================
