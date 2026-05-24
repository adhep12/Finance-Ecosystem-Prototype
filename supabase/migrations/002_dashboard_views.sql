-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — Dashboard Views + Import Log Extension
-- Finance Ecosystem Platform
--
-- Run this AFTER 001_initial_schema.sql.
-- Safe to re-run: all statements use CREATE OR REPLACE VIEW /
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORT LOG — add rows_inserted column
-- Used by PatronImportFlow (and optionally others) to track how many rows were
-- actually written vs. how many were in the file.
-- ─────────────────────────────────────────────────────────────────────────────

alter table import_log
  add column if not exists rows_inserted integer not null default 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_transactions_enriched (updated)
-- Extends the original view with:
--   • calendar_month  — YYYY-MM derived from date (for calendar-based grouping)
--   • department_id, account_id, grant_id — raw FK IDs (for client-side filtering)
-- All joins remain LEFT so transactions with null dept/account are never dropped.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_transactions_enriched as
select
  t.id,
  t.org_id,
  t.transaction_id,
  t.import_batch_id,
  t.date,
  t.fiscal_period,
  to_char(t.date, 'YYYY-MM')  as calendar_month,   -- ← new; always populated from date
  t.amount,
  t.vendor,
  t.description,
  t.source,
  t.created_at,
  t.updated_at,

  -- Raw FK IDs (needed for client-side filtering / enrichment)
  t.department_id,
  t.account_id,
  t.grant_id,

  -- Department fields
  d.dept_code,
  d.dept_name,

  -- Team fields
  te.id        as team_id,
  te.team_name,
  te.team_code,

  -- Account fields (category and record_type live here only — retroactive on remap)
  a.account_code,
  a.account_name,
  a.category,
  a.record_type,

  -- Grant fields
  g.grant_code,
  g.grant_name

from transactions t
left join departments       d  on d.id  = t.department_id  and d.deleted = false
left join teams            te  on te.id = d.team_id        and te.deleted = false
left join chart_of_accounts a  on a.id  = t.account_id    and a.deleted = false
left join grants            g  on g.id  = t.grant_id       and g.deleted = false

where t.deleted = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_team_summary (updated)
-- Same aggregation as before but uses calendar_month (from date) as the
-- grouping period so it is consistent with v_transactions_enriched.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_team_summary as
select
  t.org_id,
  te.id                       as team_id,
  te.team_name,
  a.category,
  a.record_type,
  to_char(t.date, 'YYYY-MM')  as period,
  sum(t.amount)               as actual_amount,
  count(*)                    as transaction_count
from transactions t
join departments       d  on d.id  = t.department_id  and d.deleted = false
join teams            te  on te.id = d.team_id        and te.deleted = false
join chart_of_accounts a  on a.id  = t.account_id    and a.deleted = false
where t.deleted = false
group by t.org_id, te.id, te.team_name, a.category, a.record_type,
         to_char(t.date, 'YYYY-MM');


-- ─────────────────────────────────────────────────────────────────────────────
-- v_org_summary (updated)
-- Uses calendar_month for consistency. record_type exposed for income/expense split.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_org_summary as
select
  t.org_id,
  a.category,
  a.record_type,
  to_char(t.date, 'YYYY-MM')  as period,
  sum(t.amount)               as actual_amount,
  count(*)                    as transaction_count
from transactions t
join chart_of_accounts a on a.id = t.account_id and a.deleted = false
where t.deleted = false
group by t.org_id, a.category, a.record_type, to_char(t.date, 'YYYY-MM');


-- ─────────────────────────────────────────────────────────────────────────────
-- v_pl_by_period (updated)
-- Uses calendar_month for grouping. Ordered for P&L display:
--   income rows first (record_type='income'), then expenses.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_pl_by_period as
select
  t.org_id,
  a.record_type,
  a.category,
  a.account_name,
  to_char(t.date, 'YYYY-MM')  as period,
  sum(t.amount)               as amount
from transactions t
join chart_of_accounts a on a.id = t.account_id and a.deleted = false
where t.deleted = false
group by t.org_id, a.record_type, a.category, a.account_name,
         to_char(t.date, 'YYYY-MM')
order by
  case a.record_type when 'income' then 0 else 1 end,
  a.category,
  to_char(t.date, 'YYYY-MM');


-- ─────────────────────────────────────────────────────────────────────────────
-- v_budget_enriched (new)
-- Budgets joined with department, team, and account registry data.
-- Dashboards use this for budget display, BvA setup, and breakdown charts.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_budget_enriched as
select
  b.id,
  b.org_id,
  b.import_batch_id,
  b.period,               -- YYYY-MM (always monthly after import distribution)
  b.amount,
  b.scenario,
  b.category,             -- denormalized at import time
  b.period_type,
  b.created_at,
  b.updated_at,

  -- Department
  d.id         as department_id,
  d.dept_code,
  d.dept_name,

  -- Team
  te.id        as team_id,
  te.team_code,
  te.team_name,

  -- Account (record_type comes from here — retroactive on account remap)
  a.id         as account_id,
  a.account_code,
  a.account_name,
  a.record_type

from budgets b
left join departments       d  on d.id  = b.department_id  and d.deleted = false
left join teams            te  on te.id = d.team_id        and te.deleted = false
left join chart_of_accounts a  on a.id  = b.account_id    and a.deleted = false

where b.deleted = false;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_budget_vs_actual (new)
-- Org-level: actual vs budget per period + category + record_type + scenario.
--
-- Structure: budget rows are the base (LEFT side); actuals joined in.
-- A UNION ALL tail captures actual-only periods (no budget row yet).
--
-- Filter by scenario to get BvA for a specific plan.
-- Filter by period range to scope to fiscal/operating year.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_budget_vs_actual as

with actuals_by_period as (
  -- Actuals summed by calendar month + category + record_type
  select
    t.org_id,
    to_char(t.date, 'YYYY-MM')  as period,
    a.category,
    a.record_type,
    sum(t.amount)               as actual_amount
  from transactions t
  join chart_of_accounts a on a.id = t.account_id and a.deleted = false
  where t.deleted = false
  group by t.org_id, to_char(t.date, 'YYYY-MM'), a.category, a.record_type
),

budgets_by_period as (
  -- Budgets summed by period + category + scenario (always monthly after import)
  select
    b.org_id,
    b.period,
    b.category,
    a.record_type,
    b.scenario,
    sum(b.amount)               as budget_amount
  from budgets b
  left join chart_of_accounts a on a.id = b.account_id and a.deleted = false
  where b.deleted = false
  group by b.org_id, b.period, b.category, a.record_type, b.scenario
)

-- Budget rows with actuals joined in (scenario preserved)
select
  b.org_id,
  b.period,
  b.category,
  coalesce(b.record_type, act.record_type)  as record_type,
  b.scenario,
  coalesce(act.actual_amount, 0)            as actual_amount,
  b.budget_amount                           as budget_amount,
  coalesce(act.actual_amount, 0) - b.budget_amount  as variance,
  case
    when b.budget_amount <> 0
    then round((coalesce(act.actual_amount,0) / b.budget_amount * 100)::numeric, 1)
    else null
  end as pct_of_budget
from budgets_by_period b
left join actuals_by_period act
  on  act.org_id   = b.org_id
  and act.period   = b.period
  and act.category = b.category

union all

-- Actual-only rows (periods/categories with real spend but no budget line)
select
  act.org_id,
  act.period,
  act.category,
  act.record_type,
  null              as scenario,
  act.actual_amount as actual_amount,
  0                 as budget_amount,
  act.actual_amount as variance,
  null              as pct_of_budget
from actuals_by_period act
where not exists (
  select 1 from budgets_by_period b
  where b.org_id   = act.org_id
  and   b.period   = act.period
  and   b.category = act.category
);


-- ─────────────────────────────────────────────────────────────────────────────
-- v_team_budget_vs_actual (new)
-- Team-level BvA: same structure as v_budget_vs_actual but grouped by team.
-- Use WHERE team_id = ? to scope to a single team dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_team_budget_vs_actual as

with team_actuals as (
  select
    t.org_id,
    te.id                       as team_id,
    te.team_name,
    to_char(t.date, 'YYYY-MM')  as period,
    a.category,
    a.record_type,
    sum(t.amount)               as actual_amount
  from transactions t
  join departments       d  on d.id  = t.department_id  and d.deleted = false
  join teams            te  on te.id = d.team_id        and te.deleted = false
  join chart_of_accounts a  on a.id  = t.account_id    and a.deleted = false
  where t.deleted = false
  group by t.org_id, te.id, te.team_name, to_char(t.date, 'YYYY-MM'),
           a.category, a.record_type
),

team_budgets as (
  select
    b.org_id,
    te.id                       as team_id,
    te.team_name,
    b.period,
    b.category,
    a.record_type,
    b.scenario,
    sum(b.amount)               as budget_amount
  from budgets b
  join departments       d  on d.id  = b.department_id  and d.deleted = false
  join teams            te  on te.id = d.team_id        and te.deleted = false
  left join chart_of_accounts a on a.id = b.account_id and a.deleted = false
  where b.deleted = false
  group by b.org_id, te.id, te.team_name, b.period, b.category,
           a.record_type, b.scenario
)

select
  coalesce(b.org_id,    act.org_id)    as org_id,
  coalesce(b.team_id,   act.team_id)   as team_id,
  coalesce(b.team_name, act.team_name) as team_name,
  coalesce(b.period,    act.period)    as period,
  coalesce(b.category,  act.category)  as category,
  coalesce(b.record_type, act.record_type) as record_type,
  b.scenario,
  coalesce(act.actual_amount, 0)       as actual_amount,
  coalesce(b.budget_amount, 0)         as budget_amount,
  coalesce(act.actual_amount, 0) - coalesce(b.budget_amount, 0) as variance,
  case
    when coalesce(b.budget_amount,0) <> 0
    then round((coalesce(act.actual_amount,0) / b.budget_amount * 100)::numeric, 1)
    else null
  end as pct_of_budget
from team_budgets b
full outer join team_actuals act
  on  act.org_id   = b.org_id
  and act.team_id  = b.team_id
  and act.period   = b.period
  and act.category = b.category;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_cash_flow_enriched (new)
-- Cash flow snapshots with computed month-over-month and year-over-year deltas.
-- Also pulls effective reserve floor: period override → org setting → 0.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_cash_flow_enriched as
select
  cf.id,
  cf.org_id,
  cf.period,
  cf.cash_balance,
  cf.prior_month_balance,
  cf.prior_year_balance,
  cf.reserve_floor                             as period_reserve_floor,
  os.reserve_floor                             as org_reserve_floor,
  coalesce(cf.reserve_floor, os.reserve_floor, 0) as effective_reserve_floor,

  -- Month-over-month
  cf.cash_balance - coalesce(cf.prior_month_balance, 0)  as mom_change,
  case
    when cf.prior_month_balance is not null and cf.prior_month_balance <> 0
    then round(
      ((cf.cash_balance - cf.prior_month_balance) / cf.prior_month_balance * 100)::numeric, 2
    )
    else null
  end as mom_pct_change,

  -- Year-over-year
  cf.cash_balance - coalesce(cf.prior_year_balance, 0)   as yoy_change,
  case
    when cf.prior_year_balance is not null and cf.prior_year_balance <> 0
    then round(
      ((cf.cash_balance - cf.prior_year_balance) / cf.prior_year_balance * 100)::numeric, 2
    )
    else null
  end as yoy_pct_change,

  -- Reserve floor status
  cf.cash_balance - coalesce(cf.reserve_floor, os.reserve_floor, 0) as above_reserve_floor,
  (cf.cash_balance >= coalesce(cf.reserve_floor, os.reserve_floor, 0)) as at_or_above_floor,

  cf.created_at,
  cf.updated_at

from cash_flow cf
left join org_settings os
  on os.org_id = cf.org_id

where cf.deleted = false

order by cf.org_id, cf.period;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_patron_trends (no change needed — already correct)
-- Left in place as-is from migration 001.
-- ─────────────────────────────────────────────────────────────────────────────
