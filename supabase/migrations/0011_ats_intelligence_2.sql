-- ============================================================================
-- 0011 — Phase B: ATS Intelligence 2.0 scoring foundation.
--
-- Two additive changes, both nullable, neither touches existing data:
--   1. ats_reports.scoring_engine_version — records which scoring engine
--      version produced each report (distinct from the pre-existing
--      analysis_version, which versions the report SHAPE, not the formula).
--   2. ats_change_history — a NEW table (Phase B decision 4) logging every
--      AI-assisted change applied to a resume with its real before/after
--      score delta. NOT YET WRITTEN TO as of this migration — the AI
--      apply/reparse loop is a later phase; this is schema groundwork.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.ats_reports
  add column if not exists scoring_engine_version text;

comment on column public.ats_reports.scoring_engine_version is
  'services/ats_engine/ats_config.py::SCORING_ENGINE_VERSION at analysis time — distinct from analysis_version (report schema), this versions the scoring FORMULA, so a future weight/algorithm change can be identified in historical data.';

create table if not exists public.ats_change_history (
  id                     uuid primary key default gen_random_uuid(),
  resume_id              uuid not null references public.resumes(id) on delete cascade,
  user_id                uuid not null references public.profiles(id) on delete cascade,
  ats_report_id          uuid references public.ats_reports(id) on delete set null,
  recommendation_id      text,
  change_type            text,
  before_score           integer,
  after_score            integer,
  delta                  integer,
  changed_fields         jsonb default '[]'::jsonb,
  changed_metrics        jsonb default '[]'::jsonb,
  scoring_engine_version text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_ats_change_history_resume_created
  on public.ats_change_history (resume_id, created_at desc);
create index if not exists idx_ats_change_history_user
  on public.ats_change_history (user_id);

comment on table public.ats_change_history is
  'One row per AI-assisted (or manual) change applied to a resume as a result of an ATS recommendation, with the real before/after score. Separate from ats_reports (a growing log, not a per-analysis snapshot). Not yet written to by any application code as of migration 0011 — see docs/ATS_CHANGELOG.md.';

-- RLS — same pattern as ats_reports (0002_enable_rls.sql): owner-or-admin
-- read, owner-only insert/delete. The service role (used by the backend)
-- bypasses RLS entirely by default, so no separate bypass policy is needed.
alter table public.ats_change_history enable row level security;

drop policy if exists "ats_change_history_owner_or_admin" on public.ats_change_history;
create policy "ats_change_history_owner_or_admin" on public.ats_change_history
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ats_change_history_insert_own" on public.ats_change_history;
create policy "ats_change_history_insert_own" on public.ats_change_history
  for insert with check (user_id = auth.uid());

drop policy if exists "ats_change_history_delete_own" on public.ats_change_history;
create policy "ats_change_history_delete_own" on public.ats_change_history
  for delete using (user_id = auth.uid());
