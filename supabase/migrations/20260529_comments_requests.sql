-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: comments_requests table
-- Stores all comments and requests, scoped by org_id.
-- Enable Supabase Realtime on this table:
--   Database → Replication → Supabase Realtime → add comments_requests
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists comments_requests (
  id           uuid primary key default uuid_generate_v4(),
  org_id       text not null,
  status       text not null default 'open'
                 check (status in ('open','approved','rejected','resolved')),
  type         text not null default 'comment'
                 check (type in ('question','variance-explanation','reclassification',
                                 'financial-highlight','budget-request','comment','request')),
  text         text not null default '',
  author       text not null default '',
  avatar       text,
  page         text,
  category     text,
  anchor       text,
  team_id      integer,
  resolved     boolean not null default false,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists comments_requests_org_id_idx
  on comments_requests (org_id)
  where deleted = false;

create trigger comments_requests_updated_at
  before update on comments_requests
  for each row execute function set_updated_at();

-- Row-level security (off by default; enable when auth is wired up)
-- alter table comments_requests enable row level security;

-- Enable realtime — run this after creating the table:
-- Dashboard → Database → Replication → Supabase Realtime → toggle comments_requests
