-- ============================================================================
-- 0013 — Phase G: ATS Checker mode redesign (Resume ATS Health / Role
-- Readiness / Job Match as three independent, never-merged scores).
--
-- Two additive, nullable changes to ats_reports, neither touching existing
-- data or renaming/dropping anything:
--   1. score_type — records what `score` on THIS row actually means
--      ("resume_health" | "role_readiness" | "job_match"). Existing rows
--      predate this distinction and are left null — we don't retroactively
--      guess what they meant, we just stop being ambiguous going forward.
--   2. jd_sufficient — job_parser.assess_sufficiency()'s verdict for the
--      row's JD, when one was supplied (null when no JD was involved).
--   3. analysis_mode's check constraint is extended (not narrowed) to also
--      allow 'resume_only', for the new JD-free / role-free primary flow.
--      Existing values ('job_description', 'role_based') keep working.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.ats_reports
  add column if not exists score_type text
    check (score_type in ('resume_health', 'role_readiness', 'job_match'));

alter table public.ats_reports
  add column if not exists jd_sufficient boolean;

alter table public.ats_reports
  drop constraint if exists ats_reports_analysis_mode_check;

alter table public.ats_reports
  add constraint ats_reports_analysis_mode_check
    check (analysis_mode in ('job_description', 'role_based', 'resume_only'));

comment on column public.ats_reports.score_type is
  'What the `score` column on this row means — resume_health (JD-independent), role_readiness (role-library based), or job_match (real JD). Null on rows persisted before Phase G. Never assume a pre-Phase-G row is any particular type.';

comment on column public.ats_reports.jd_sufficient is
  'services/ats_engine/job_parser.py::assess_sufficiency() verdict for this report''s job_description, when one was supplied. Null when no JD was involved (resume_only / role_based modes) or for pre-Phase-G rows.';
