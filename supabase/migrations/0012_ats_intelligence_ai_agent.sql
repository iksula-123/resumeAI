-- ============================================================================
-- 0012 — Phase D: AI ATS optimization loop.
--
-- Two changes:
--   1. New table ats_recommendations — persisted, addressable AI
--      recommendations (didn't exist before Phase D; Phase C's
--      recommendations were ephemeral response objects only).
--   2. ats_change_history renamed/extended to match the Phase D spec's
--      exact column names (change_type -> action_type, delta -> score_delta)
--      plus before_content/after_content/user_approved/recommendation_id
--      (now a real FK). Safe: this table has never been written to before
--      Phase D (confirmed in the Phase C report), so nothing depends on the
--      old names.
--
-- Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.ats_recommendations (
  id                          uuid primary key default gen_random_uuid(),
  resume_id                   uuid not null references public.resumes(id) on delete cascade,
  user_id                     uuid not null references public.profiles(id) on delete cascade,
  ats_report_id               uuid references public.ats_reports(id) on delete set null,

  action_type                 text not null check (action_type in (
    'quantify_bullet', 'improve_bullet', 'add_keyword', 'improve_summary', 'improve_skills',
    'fix_section', 'fix_formatting', 'improve_grammar', 'improve_readability',
    'add_skill_evidence', 'improve_experience_alignment', 'remove_repetition'
  )),
  priority                    text not null default 'low' check (priority in ('high', 'medium', 'low')),
  title                       text not null,
  reason                      text,
  affected_section            text,
  affected_item_id            text,
  target_text                 text,
  score_impact_estimate       text check (score_impact_estimate in ('high', 'medium', 'low')),

  requires_user_input         boolean not null default false,
  question                    text,
  user_answer                 text,

  evidence_tier                text not null default 'unknown' check (evidence_tier in ('verified', 'inferred', 'suggested', 'unknown')),
  proposed_content            text,
  final_content                text,

  status                      text not null default 'pending' check (status in ('pending', 'answered', 'approved', 'rejected', 'applied', 'stale')),
  rejection_reason            text,

  resume_updated_at_snapshot  timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Additive catch-up for a table that may already exist from an earlier run
-- of this same migration (create table if not exists is a no-op then).
alter table public.ats_recommendations add column if not exists target_text text;

create index if not exists idx_ats_recommendations_resume on public.ats_recommendations (resume_id, created_at desc);
create index if not exists idx_ats_recommendations_user on public.ats_recommendations (user_id);
create index if not exists idx_ats_recommendations_status on public.ats_recommendations (status);

comment on table public.ats_recommendations is
  'Phase D — persisted, addressable AI ATS recommendations. Each has a real id so POST /api/ats/v2/recommendations/{id}/apply can reference it later, and a resume_updated_at_snapshot for staleness detection.';

alter table public.ats_recommendations enable row level security;

drop policy if exists "ats_recommendations_owner_or_admin" on public.ats_recommendations;
create policy "ats_recommendations_owner_or_admin" on public.ats_recommendations
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ats_recommendations_insert_own" on public.ats_recommendations;
create policy "ats_recommendations_insert_own" on public.ats_recommendations
  for insert with check (user_id = auth.uid());

drop policy if exists "ats_recommendations_update_own" on public.ats_recommendations;
create policy "ats_recommendations_update_own" on public.ats_recommendations
  for update using (user_id = auth.uid());

-- ── ats_change_history: rename to the Phase D spec's exact column names ────
-- Plain RENAME COLUMN has no "if exists" form, so this whole block is
-- idempotency-guarded (unlike a straight rename, safe to re-run).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ats_change_history' and column_name = 'change_type') then
    alter table public.ats_change_history rename column change_type to action_type;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ats_change_history' and column_name = 'delta') then
    alter table public.ats_change_history rename column delta to score_delta;
  end if;
end $$;

alter table public.ats_change_history
  add column if not exists before_content text,
  add column if not exists after_content text,
  add column if not exists user_approved boolean not null default true;

-- recommendation_id was a free-text placeholder column before Phase D (no
-- ats_recommendations table existed to reference); convert it to a real FK.
-- Existing rows are all null (the table has never been written to), so this
-- is a type-safe, data-safe change. Guarded so a second run doesn't error
-- on an already-uuid column or an already-present constraint.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'ats_change_history'
             and column_name = 'recommendation_id' and data_type <> 'uuid') then
    alter table public.ats_change_history
      alter column recommendation_id type uuid using recommendation_id::uuid;
  end if;
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema = 'public' and table_name = 'ats_change_history'
                 and constraint_name = 'ats_change_history_recommendation_id_fkey') then
    alter table public.ats_change_history
      add constraint ats_change_history_recommendation_id_fkey
      foreign key (recommendation_id) references public.ats_recommendations(id) on delete set null;
  end if;
end $$;

comment on column public.ats_change_history.action_type is
  'One of the controlled action types (see ats_recommendations.action_type check constraint) — never arbitrary free text.';
