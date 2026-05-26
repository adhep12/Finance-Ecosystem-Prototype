-- ─── org_dashboard_layout ────────────────────────────────────────────────────
-- Stores optional preset cards added by an org to their dashboard.
-- Default cards (Tier 1/2/3 KPIs, core supporter health) are hardcoded
-- in the UI and never appear here. Only ADDED cards are persisted.
--
-- dashboard values:  'admin_overview' | 'executive'
-- section values:    'financial_health' | 'supporter_health' | 'charts'
-- card_key values:   see src/constants/presetCards.ts

create table if not exists org_dashboard_layout (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organizations(id) on delete cascade,
  dashboard      text not null,
  section        text not null,
  card_key       text not null,
  display_order  int  not null default 0,
  created_at     timestamptz not null default now(),

  -- One org can only add the same card once per dashboard
  unique(org_id, dashboard, section, card_key)
);

-- Index for fast per-org/dashboard queries on page load
create index if not exists idx_org_dashboard_layout_lookup
  on org_dashboard_layout (org_id, dashboard);

-- Row Level Security — orgs can only see/modify their own layout
alter table org_dashboard_layout enable row level security;

create policy "org_dashboard_layout: org members read"
  on org_dashboard_layout for select
  using (org_id = (select org_id from user_orgs where user_id = auth.uid() limit 1));

create policy "org_dashboard_layout: org members insert"
  on org_dashboard_layout for insert
  with check (org_id = (select org_id from user_orgs where user_id = auth.uid() limit 1));

create policy "org_dashboard_layout: org members delete"
  on org_dashboard_layout for delete
  using (org_id = (select org_id from user_orgs where user_id = auth.uid() limit 1));
