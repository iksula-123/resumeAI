-- ============================================================================
-- 0005 — recommended_certifications on role_profiles (Phase 1 extension)
--
-- Curated per-role certification suggestions (category-matched from a real
-- certification catalog), surfaced in the build-from-role flow as a
-- confirm-to-add checklist — same "suggested, not fact" pattern as
-- blue.skills_checklist. Idempotent — safe to re-run.
-- ============================================================================
alter table public.role_profiles
  add column if not exists recommended_certifications jsonb not null default '[]'::jsonb;
