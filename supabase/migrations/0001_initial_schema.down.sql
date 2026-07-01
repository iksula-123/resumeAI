-- ============================================================================
-- Rollback for 0001_initial_schema.sql
-- Drops everything in reverse dependency order. DESTRUCTIVE — deletes all data.
-- ============================================================================
drop table if exists public.ats_reports     cascade;
drop table if exists public.cover_letters   cascade;
drop table if exists public.languages       cascade;
drop table if exists public.certifications  cascade;
drop table if exists public.projects        cascade;
drop table if exists public.skills          cascade;
drop table if exists public.education       cascade;
drop table if exists public.experiences     cascade;
drop table if exists public.resumes         cascade;
drop table if exists public.subscriptions   cascade;
drop table if exists public.profiles        cascade;

drop function if exists public.handle_new_user()  cascade;
drop function if exists public.handle_updated_at() cascade;
drop function if exists public.is_admin()          cascade;

-- Note: the trigger on auth.users is removed with handle_new_user() cascade.
