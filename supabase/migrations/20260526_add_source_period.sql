-- ─── Add source_period to comments_requests ───────────────────────────────────
-- Stores the currently-viewed summary month when a comment is submitted
-- from the Executive Summary tab, e.g. '2026-03' for March 2026.
-- Only populated for comments from source_page = 'Summary'.

alter table comments_requests
  add column if not exists source_period text;
