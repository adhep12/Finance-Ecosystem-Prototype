-- ─── org_chart_preferences ─────────────────────────────────────────────────────
-- Persists per-org chart type selections.
-- chart_key matches the canonical keys used in ChartPreferencesContext.
-- No FK to organizations (using org_settings pattern throughout this app).

create table if not exists org_chart_preferences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  chart_key   text not null,
  chart_type  text not null,
  updated_at  timestamptz default now(),
  unique(org_id, chart_key)
);

alter table org_chart_preferences enable row level security;

create policy "org_chart_preferences: allow all select"
  on org_chart_preferences for select using (true);

create policy "org_chart_preferences: allow all insert"
  on org_chart_preferences for insert with check (true);

create policy "org_chart_preferences: allow all update"
  on org_chart_preferences for update using (true);

create policy "org_chart_preferences: allow all delete"
  on org_chart_preferences for delete using (true);

create index if not exists idx_org_chart_preferences_org
  on org_chart_preferences (org_id);
