-- ============================================================================
-- 0010 — Phase 3: ATS Intelligence. Extends the EXISTING public.ats_reports
-- table (does not create a second ATS report table) with the detailed
-- Match/Completeness/Confidence analysis. All new columns are nullable —
-- existing rows and existing readers of the original columns are unaffected.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.ats_reports
  add column if not exists target_role            text,
  add column if not exists analysis_mode           text check (analysis_mode in ('job_description', 'role_based')),
  add column if not exists score_confidence        text check (score_confidence in ('high', 'medium', 'low')),
  add column if not exists score_breakdown         jsonb,
  add column if not exists category_scores         jsonb,
  add column if not exists category_completeness   jsonb,
  add column if not exists category_confidence     jsonb,
  add column if not exists overall_confidence      text check (overall_confidence in ('high', 'medium', 'low')),
  add column if not exists critical_keywords       jsonb,
  add column if not exists important_keywords      jsonb,
  add column if not exists partial_matches         jsonb,
  add column if not exists formatting_analysis     jsonb,
  add column if not exists profile_completeness    jsonb,
  add column if not exists recommendations         jsonb,
  add column if not exists candidate_questions     jsonb,
  add column if not exists analysis_version        text default 'v2-phase3';

create index if not exists idx_ats_reports_resume_created
  on public.ats_reports (resume_id, created_at desc);

comment on column public.ats_reports.analysis_mode is
  'job_description = analyzed against pasted/parsed JD text; role_based = analyzed against the role_profiles library only (no specific employer JD)';
comment on column public.ats_reports.analysis_version is
  'Which scoring model produced this report — lets old reports stay readable if the model changes later';
