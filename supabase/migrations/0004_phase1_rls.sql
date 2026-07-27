-- ============================================================================
-- SahiCareer "My Resume" — Phase 1 RLS for the tables added in 0003.
-- Reuses public.is_admin() and public.handle_updated_at() from 0001.
--
-- Notes:
--   * The service role (used by the FastAPI backend + the TAF pipeline) bypasses
--     RLS, so pipeline writes to role_profiles and server-side usage logging work
--     regardless of these policies.
--   * Full tenant-claim scoping on existing tables is Milestone I; ownership-based
--     policies below already isolate each user's rows.
-- ============================================================================

alter table public.tenants          enable row level security;
alter table public.career_record    enable row level security;
alter table public.role_profiles    enable row level security;
alter table public.usage_events     enable row level security;
alter table public.uploaded_resumes enable row level security;

-- ── tenants ──────────────────────────────────────────────────────────────────
-- Readable by any authenticated user (needed to resolve theme/SSO); admins manage.
drop policy if exists "tenants_select_authenticated" on public.tenants;
create policy "tenants_select_authenticated" on public.tenants
  for select using (auth.uid() is not null);
drop policy if exists "tenants_admin_write" on public.tenants;
create policy "tenants_admin_write" on public.tenants
  for all using (public.is_admin()) with check (public.is_admin());

-- ── career_record ────────────────────────────────────────────────────────────
drop policy if exists "career_record_owner_or_admin_select" on public.career_record;
create policy "career_record_owner_or_admin_select" on public.career_record
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "career_record_modify_own" on public.career_record;
create policy "career_record_modify_own" on public.career_record
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── role_profiles ────────────────────────────────────────────────────────────
-- Shared reference library: any authenticated user may read; only service/admin write.
drop policy if exists "role_profiles_select_authenticated" on public.role_profiles;
create policy "role_profiles_select_authenticated" on public.role_profiles
  for select using (auth.uid() is not null);
drop policy if exists "role_profiles_admin_write" on public.role_profiles;
create policy "role_profiles_admin_write" on public.role_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── usage_events ─────────────────────────────────────────────────────────────
-- Users may insert their own events and read their own; admins read all.
drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own" on public.usage_events
  for insert with check (user_id = auth.uid() or user_id is null);
drop policy if exists "usage_events_select_own_or_admin" on public.usage_events;
create policy "usage_events_select_own_or_admin" on public.usage_events
  for select using (user_id = auth.uid() or public.is_admin());

-- ── uploaded_resumes ─────────────────────────────────────────────────────────
drop policy if exists "uploaded_resumes_owner" on public.uploaded_resumes;
create policy "uploaded_resumes_owner" on public.uploaded_resumes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- End of migration
-- ============================================================================
