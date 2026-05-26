-- ─── comments_requests ────────────────────────────────────────────────────────
-- Stores comments and requests from all dashboards.
-- Comments are currently managed in React state; this table provides persistence.
-- source_dashboard / source_page auto-populated from the submitting page.
-- orphaned / reattached / original_transaction_context support Replace All import flow.

create table if not exists comments_requests (
  id                           text primary key,          -- 'c' + timestamp from client
  org_id                       uuid not null,             -- from org_settings
  author                       text,
  avatar                       text,
  type                         text,                      -- question | variance-explanation | reclassification | financial-highlight | budget-request
  text                         text,
  page                         text,
  source_dashboard             text,                      -- 'Executive' | 'Admin' | 'Content Team'
  source_page                  text,                      -- 'Dashboard' | 'Summary' | 'Teams' | 'Overview' etc.
  category                     text,
  anchor                       jsonb,                     -- { type: 'tx', txRef: { date, vendor, amount, department, category } }
  status                       text default 'open',       -- open | approved | rejected | resolved
  pin_position                 jsonb,                     -- { xPct, yPct }
  team_id                      int,
  resolved                     boolean default false,
  orphaned                     boolean default false,
  reattached                   boolean default false,
  original_transaction_context jsonb,                     -- { name, amount, date, vendor }
  timestamp                    timestamptz not null default now(),
  created_at                   timestamptz not null default now()
);

-- Index for fast per-org queries
create index if not exists idx_comments_requests_org
  on comments_requests (org_id, created_at desc);

-- Permissive RLS (no auth yet — tighten when auth is added)
alter table comments_requests enable row level security;

create policy "comments_requests: allow all select"
  on comments_requests for select using (true);

create policy "comments_requests: allow all insert"
  on comments_requests for insert with check (true);

create policy "comments_requests: allow all update"
  on comments_requests for update using (true);

create policy "comments_requests: allow all delete"
  on comments_requests for delete using (true);
