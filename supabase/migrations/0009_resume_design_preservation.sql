-- ============================================================================
-- 0009 — Resume design preservation (uploaded resumes keep their original
-- visual design through AI Improve instead of being silently reformatted
-- into a SahiCareer template).
--
-- template_type: "sahicareer" (built-in template) | "uploaded_original"
-- (design preserved from an uploaded file). preserve_original gates which
-- download path the backend takes (services/docx_editor.py for DOCX,
-- untouched original bytes for PDF — see routers/upgrade.py). Original
-- uploads are never deleted or overwritten; original_file_path points at the
-- untouched file in Supabase Storage (private bucket, service-role only).
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.resumes
  add column if not exists template_type       text not null default 'sahicareer',
  add column if not exists preserve_original    boolean not null default false,
  add column if not exists original_file_path   text,
  add column if not exists original_file_type   text check (original_file_type in ('pdf', 'docx')),
  add column if not exists original_filename    text,
  add column if not exists font_metadata        jsonb,
  add column if not exists color_metadata       jsonb,
  add column if not exists layout_metadata      jsonb;

comment on column public.resumes.template_type is
  'sahicareer = built-in template; uploaded_original = design preserved from an uploaded file';
comment on column public.resumes.preserve_original is
  'When true, downloads must reuse the original file''s formatting instead of the SahiCareer generator';
comment on column public.resumes.original_file_path is
  'Storage path of the untouched original upload (resume-files bucket) — never deleted or overwritten';
