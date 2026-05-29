-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile comments_requests table across both schema versions.
-- Safe to run regardless of which prior migration was applied first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Columns added by 20260529 that may be missing if 20260526 was applied first
alter table comments_requests add column if not exists deleted      boolean not null default false;
alter table comments_requests add column if not exists updated_at   timestamptz not null default now();

-- Columns from 20260526 that may be missing if 20260529 was applied first
alter table comments_requests add column if not exists source_dashboard             text;
alter table comments_requests add column if not exists source_page                  text;
alter table comments_requests add column if not exists source_period                text;
alter table comments_requests add column if not exists pin_position                 jsonb;
alter table comments_requests add column if not exists orphaned                     boolean not null default false;
alter table comments_requests add column if not exists reattached                   boolean not null default false;
alter table comments_requests add column if not exists original_transaction_context jsonb;

-- parent_id: links reply rows to their parent comment (Feature 2 — reply threads)
alter table comments_requests add column if not exists parent_id text;

-- Ensure timestamp column exists (20260526 name) — comments code reads row.created_at so this is fine either way
alter table comments_requests add column if not exists timestamp timestamptz not null default now();

-- Index for fast per-org queries (safe if already exists)
create index if not exists idx_comments_requests_org_created
  on comments_requests (org_id, created_at desc)
  where deleted = false;

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- After running this migration, enable realtime in the Supabase dashboard:
--   Database → Replication → Supabase Realtime → toggle ON for comments_requests
-- ─────────────────────────────────────────────────────────────────────────────
