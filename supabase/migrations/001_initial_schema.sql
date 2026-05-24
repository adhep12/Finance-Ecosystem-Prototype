-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Initial Schema
-- Finance Ecosystem Platform
--
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- Utility: auto-update updated_at on any row change
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ORG SETTINGS
-- Single-row per org. org_id present but not enforced yet (multi-tenancy path).
-- Fiscal year and operating year are defined by start month only.
-- Year is always computed dynamically in the app from today's date + start month.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists org_settings (
  id                          uuid primary key default uuid_generate_v4(),
  org_id                      uuid not null default uuid_generate_v4(),
  org_name                    text not null default 'My Organization',
  logo_initial                text not null default 'O',
  primary_color               text not null default '#D4896A',
  primary_light               text not null default '#F2D5C8',
  accent_color                text not null default '#0EA5A0',

  -- Fiscal year: month the FY starts (1–12). Year is computed at runtime.
  -- e.g. 10 = FY runs October → September
  fiscal_year_start_month     integer not null default 10
    check (fiscal_year_start_month between 1 and 12),

  -- Operating year: month the OY starts (1–12). Year is computed at runtime.
  -- e.g. 5 = OY runs May → April
  operating_year_start_month  integer not null default 5
    check (operating_year_start_month between 1 and 12),

  -- Cash reserve floor — org-level setting used by Cash Position KPI
  reserve_floor               numeric(14,2) not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger trg_org_settings_updated_at
  before update on org_settings
  for each row execute function set_updated_at();

-- Seed one default row so the app always has settings to read
insert into org_settings (org_name, logo_initial, fiscal_year_start_month, operating_year_start_month)
values ('My Organization', 'O', 10, 5)
on conflict do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRY 1: TEAMS
-- Top-level grouping. Defines which team dashboards exist.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists teams (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  team_name     text not null,
  team_code     text,
  manager_name  text,
  active        boolean not null default true,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, team_name)
);

create or replace trigger trg_teams_updated_at
  before update on teams
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRY 2: DEPARTMENTS
-- Maps dept codes (from accounting system) to teams.
-- Multiple dept codes can map to one team.
-- When an import finds a dept code not here → flag before commit.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists departments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001',
  dept_code   text not null,
  dept_name   text not null,
  team_id     uuid references teams(id) on delete set null,
  active      boolean not null default true,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (org_id, dept_code)
);

create or replace trigger trg_departments_updated_at
  before update on departments
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRY 3: CHART OF ACCOUNTS
-- Maps every GL account code to display name, category, and record_type.
-- CRITICAL: category and record_type live here ONLY — never on transaction rows.
-- Views join transactions to this table at query time, making registry
-- remaps retroactive without touching any transaction data.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists chart_of_accounts (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  account_code  text not null,
  account_name  text not null,
  category      text not null,   -- free text, finance-defined; autocomplete in UI
  record_type   text not null check (record_type in ('income', 'expense')),
  active        boolean not null default true,
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, account_code)
);

create or replace trigger trg_chart_of_accounts_updated_at
  before update on chart_of_accounts
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRY 4: GRANTS
-- Optional. Only needed if grant tracking is used.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists grants (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null default '00000000-0000-0000-0000-000000000001',
  grant_code   text not null,
  grant_name   text not null,
  description  text,
  active       boolean not null default true,
  deleted      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (org_id, grant_code)
);

create or replace trigger trg_grants_updated_at
  before update on grants
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- FIELD MAPPINGS
-- Saved column mappings per data source. Reused on every future upload.
-- mapping_json format: { "source_column_name": "canonical_field", ... }
-- date_format: 'calendar' (standard date) | 'fiscal_period' (M-YYYY notation)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists field_mappings (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  mapping_name  text not null,          -- e.g. "QuickBooks General Ledger"
  source_label  text,                   -- e.g. "QuickBooks", "Acumatica AP"
  import_type   text not null
    check (import_type in ('transactions', 'budget', 'patron', 'cashflow')),
  mapping_json  jsonb not null,         -- { source_col: canonical_field }
  date_format   text not null default 'calendar'
    check (date_format in ('calendar', 'fiscal_period')),
  created_by    text not null default 'system',
  deleted       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace trigger trg_field_mappings_updated_at
  before update on field_mappings
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSACTIONS
-- Raw imported + manually entered financial transactions.
--
-- category and record_type are NOT stored here.
-- They come from chart_of_accounts via v_transactions_enriched at query time.
-- This is what makes chart of accounts remaps retroactive.
--
-- fiscal_period: YYYY-MM derived from the calendar date at import time.
-- e.g. date 2025-10-15 → fiscal_period '2025-10'
-- This is the calendar month, used for grouping by period.
--
-- amount sign convention: positive = expense, negative = income.
-- Views handle sign display per record_type from chart_of_accounts.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists transactions (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null default '00000000-0000-0000-0000-000000000001',
  transaction_id   text,                  -- source system ID; used for deduplication
  import_batch_id  uuid,                  -- links to import_log.id
  date             date not null,         -- calendar date; always stored as calendar date
  fiscal_period    text not null,         -- YYYY-MM (calendar); derived from date at import
  amount           numeric(14,2) not null,
  department_id    uuid references departments(id) on delete set null,
  account_id       uuid references chart_of_accounts(id) on delete set null,
  vendor           text,
  grant_id         uuid references grants(id) on delete set null,
  description      text,
  source           text not null default 'import'
    check (source in ('import', 'manual')),
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- Indexes for common dashboard query patterns
create index if not exists idx_txn_date            on transactions(date);
create index if not exists idx_txn_fiscal_period   on transactions(fiscal_period);
create index if not exists idx_txn_department_id   on transactions(department_id);
create index if not exists idx_txn_account_id      on transactions(account_id);
create index if not exists idx_txn_import_batch    on transactions(import_batch_id);
create index if not exists idx_txn_deleted         on transactions(deleted) where deleted = false;
create index if not exists idx_txn_org_id          on transactions(org_id);
create index if not exists idx_txn_transaction_id  on transactions(transaction_id) where transaction_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- BUDGETS
-- Income and expense budgets. Always stored at monthly grain after import.
-- Annual/quarterly inputs are distributed to monthly during the import flow.
-- Inline edits in master P&L Breakdown write directly here.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists budgets (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null default '00000000-0000-0000-0000-000000000001',
  import_batch_id  uuid,
  department_id    uuid references departments(id) on delete set null,
  account_id       uuid references chart_of_accounts(id) on delete set null,
  category         text not null,     -- denormalized from chart_of_accounts at import
  scenario         text not null,     -- e.g. 'Planned Spend', 'Annual Plan'
  amount           numeric(14,2) not null,
  period           text not null,     -- YYYY-MM (always monthly after distribution)
  period_type      text not null default 'monthly'
    check (period_type in ('monthly', 'quarterly', 'annual')),
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace trigger trg_budgets_updated_at
  before update on budgets
  for each row execute function set_updated_at();

create index if not exists idx_budgets_period        on budgets(period);
create index if not exists idx_budgets_department_id on budgets(department_id);
create index if not exists idx_budgets_scenario      on budgets(scenario);
create index if not exists idx_budgets_deleted       on budgets(deleted) where deleted = false;
create index if not exists idx_budgets_org_id        on budgets(org_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- PATRON DATA
-- Monthly patron/supporter metrics imported from CRM.
-- One row per period. Unique constraint prevents duplicate periods.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists patron_data (
  id                        uuid primary key default uuid_generate_v4(),
  org_id                    uuid not null default '00000000-0000-0000-0000-000000000001',
  period                    text not null,    -- YYYY-MM
  total_active_patrons      integer,
  new_patrons_total         integer,
  new_patrons_recurring     integer,
  new_patrons_spontaneous   integer,
  recurring_patron_count    integer,
  recurring_giving_total    numeric(14,2),
  spontaneous_giving_total  numeric(14,2),
  avg_gift_size             numeric(10,2),
  retention_rate            numeric(5,4),     -- decimal e.g. 0.8200 = 82%
  deleted                   boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (org_id, period)
);

create or replace trigger trg_patron_data_updated_at
  before update on patron_data
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- CASH FLOW
-- Monthly cash balance snapshots.
-- Used when the GL export doesn't include cash/bank account rows.
-- prior_month_balance and prior_year_balance are auto-computed by
-- the app if those periods exist — stored here to avoid recalculation.
-- reserve_floor here overrides the org-level setting for that specific period.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists cash_flow (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null default '00000000-0000-0000-0000-000000000001',
  period               text not null,    -- YYYY-MM
  cash_balance         numeric(14,2) not null,
  prior_month_balance  numeric(14,2),
  prior_year_balance   numeric(14,2),
  reserve_floor        numeric(14,2),    -- period-specific override; null = use org setting
  deleted              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (org_id, period)
);

create or replace trigger trg_cash_flow_updated_at
  before update on cash_flow
  for each row execute function set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORT LOG
-- Every import run is recorded. Revert action restores from snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists import_log (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null default '00000000-0000-0000-0000-000000000001',
  imported_by      text not null default 'system',   -- stubbed; wire to auth later
  imported_at      timestamptz not null default now(),
  import_type      text not null
    check (import_type in ('transactions', 'budget', 'patron', 'cashflow')),
  mode             text not null
    check (mode in ('append', 'replace_full', 'replace_period')),
  filename         text,
  row_count        integer not null default 0,
  rows_skipped     integer not null default 0,
  period_start     text,               -- YYYY-MM  earliest period in this import
  period_end       text,               -- YYYY-MM  latest period in this import
  teams_affected   text[],             -- array of team names
  status           text not null
    check (status in ('success', 'partial', 'failed')),
  error_report     jsonb               -- [{row, reason}, ...] for skipped rows
);

create index if not exists idx_import_log_imported_at  on import_log(imported_at desc);
create index if not exists idx_import_log_import_type  on import_log(import_type);
create index if not exists idx_import_log_org_id       on import_log(org_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- EDIT LOG
-- Field-level audit trail for every change to every table.
-- Original imported values are always preserved here.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists edit_log (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001',
  table_name  text not null,
  record_id   uuid not null,
  field       text not null,
  old_value   text,
  new_value   text,
  edited_by   text not null default 'system',   -- stubbed; wire to auth later
  edited_at   timestamptz not null default now()
);

create index if not exists idx_edit_log_record    on edit_log(table_name, record_id);
create index if not exists idx_edit_log_edited_at on edit_log(edited_at desc);
create index if not exists idx_edit_log_org_id    on edit_log(org_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS — read-only enriched views for dashboard consumption
-- Dashboards NEVER query raw tables directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- v_transactions_enriched
-- Joins transactions to registries. Filters soft-deleted rows.
-- category and record_type come from chart_of_accounts — retroactive on remap.
create or replace view v_transactions_enriched as
select
  t.id,
  t.org_id,
  t.transaction_id,
  t.import_batch_id,
  t.date,
  t.fiscal_period,
  t.amount,
  t.vendor,
  t.description,
  t.source,
  t.created_at,

  -- Department fields
  d.dept_code,
  d.dept_name,
  te.id       as team_id,
  te.team_name,
  te.team_code,

  -- Account fields (category and record_type live here only)
  a.account_code,
  a.account_name,
  a.category,
  a.record_type,

  -- Grant fields
  g.grant_code,
  g.grant_name

from transactions t
left join departments     d  on d.id = t.department_id  and d.deleted = false
left join teams           te on te.id = d.team_id       and te.deleted = false
left join chart_of_accounts a on a.id = t.account_id   and a.deleted = false
left join grants          g  on g.id = t.grant_id       and g.deleted = false

where t.deleted = false;


-- v_team_summary
-- Budget vs actual per team per period per category.
create or replace view v_team_summary as
select
  t.org_id,
  te.id         as team_id,
  te.team_name,
  a.category,
  a.record_type,
  t.fiscal_period,
  sum(t.amount) as actual_amount,
  count(*)      as transaction_count
from transactions t
join departments      d  on d.id  = t.department_id  and d.deleted = false
join teams            te on te.id = d.team_id        and te.deleted = false
join chart_of_accounts a on a.id  = t.account_id    and a.deleted = false
where t.deleted = false
group by t.org_id, te.id, te.team_name, a.category, a.record_type, t.fiscal_period;


-- v_org_summary
-- Same as team_summary but aggregated across all teams.
create or replace view v_org_summary as
select
  t.org_id,
  a.category,
  a.record_type,
  t.fiscal_period,
  sum(t.amount) as actual_amount,
  count(*)      as transaction_count
from transactions t
join chart_of_accounts a on a.id = t.account_id and a.deleted = false
where t.deleted = false
group by t.org_id, a.category, a.record_type, t.fiscal_period;


-- v_pl_by_period
-- Income and expense rows structured for P&L display.
-- Positive amounts = expense, negative = income (per sign convention on transactions).
create or replace view v_pl_by_period as
select
  t.org_id,
  a.record_type,
  a.category,
  a.account_name,
  t.fiscal_period,
  sum(t.amount) as amount
from transactions t
join chart_of_accounts a on a.id = t.account_id and a.deleted = false
where t.deleted = false
group by t.org_id, a.record_type, a.category, a.account_name, t.fiscal_period
order by a.record_type desc, a.category, t.fiscal_period;


-- v_patron_trends
-- Patron data with period labels for trend charts.
create or replace view v_patron_trends as
select
  id,
  org_id,
  period,
  total_active_patrons,
  new_patrons_total,
  new_patrons_recurring,
  new_patrons_spontaneous,
  recurring_patron_count,
  recurring_giving_total,
  spontaneous_giving_total,
  avg_gift_size,
  retention_rate,

  -- Period-over-period helpers (computed; app can also compute these)
  lag(total_active_patrons) over (partition by org_id order by period) as prior_month_patrons,
  lag(new_patrons_total)    over (partition by org_id order by period) as prior_month_new_patrons

from patron_data
where deleted = false
order by period;
