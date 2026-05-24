-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Fix Views (Fan-out + Account Granularity Bugs)
-- Finance Ecosystem Platform
--
-- ROOT CAUSE 1: old views joined raw transactions to raw budgets directly,
-- causing row multiplication and wrong budget totals.
--
-- ROOT CAUSE 2: CTEs joined on (dept_id, account_id, period) but budget
-- and transaction rows use different account_ids within the same category
-- (budget was built at a different GL granularity). Only 191 of 829 budget
-- (dept, account) combinations matched any transaction, so ~77% of budget
-- was silently dropped.
--
-- FIX:
--   • Aggregate each table by CATEGORY (not account_id) — category is the
--     display grain for all dashboards.
--   • Use budget-first LEFT JOIN so all budgeted categories appear even if
--     there are no matching actuals yet (future months, zero spend).
--   • UNION ALL actual-only rows so unbudgeted spending still appears.
--   • Income sign flip applied in both CTEs; frontend must not flip again.
--
-- Safe to re-run: DROP IF EXISTS before each CREATE.
-- ─────────────────────────────────────────────────────────────────────────────


-- Drop in dependency order (views that depend on v_actuals_vs_budget first)
drop view if exists v_team_summary;
drop view if exists v_org_summary;
drop view if exists v_actuals_vs_budget;
drop view if exists v_transactions_enriched;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_actuals_vs_budget  (new base view)
--
-- Aggregates actuals and budgets separately at the CATEGORY level, then joins.
-- Budget is the LEFT side so all budgeted line items appear regardless of
-- whether any actual transactions exist for that period.
-- A UNION ALL tail captures actual-only rows (unbudgeted spending).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_actuals_vs_budget as
with actuals as (
  -- Sum transactions by (org, dept, category, period).
  -- Resolves category + record_type from chart_of_accounts via account_id FK.
  -- Income flipped to positive here; frontend must display as-is.
  select
    t.org_id,
    t.department_id,
    c.category,
    c.record_type,
    to_char(t.date, 'YYYY-MM')                                         as period,
    sum(
      case when c.record_type = 'income' then t.amount * -1 else t.amount end
    )                                                                   as actual
  from transactions        t
  join chart_of_accounts   c  on t.account_id = c.id and c.deleted = false
  where t.deleted = false
  group by
    t.org_id, t.department_id, c.category, c.record_type,
    to_char(t.date, 'YYYY-MM')
),
budget_agg as (
  -- Sum budgets by (org, dept, category, period, scenario).
  -- Resolves category + record_type from chart_of_accounts via account_id FK.
  select
    b.org_id,
    b.department_id,
    c.category,
    c.record_type,
    b.period,
    b.scenario,
    sum(b.amount)                                                       as budget
  from budgets             b
  join chart_of_accounts   c  on b.account_id = c.id and c.deleted = false
  where b.deleted = false
  group by
    b.org_id, b.department_id, c.category, c.record_type,
    b.period, b.scenario
)

-- ── Part 1: all budget lines (every scenario) with actuals joined in ──────
select
  b.org_id,
  tm.team_name,
  tm.id                                                                 as team_id,
  d.dept_name,
  d.dept_code,
  d.id                                                                  as department_id,
  b.category,
  b.record_type,
  b.period,
  coalesce(a.actual, 0)                                                 as actual,
  b.budget,
  b.scenario
from budget_agg b
left join actuals a
  on  a.org_id        = b.org_id
  and a.department_id = b.department_id
  and a.category      = b.category
  and a.period        = b.period
join departments  d   on d.id     = b.department_id and d.deleted = false
join teams        tm  on tm.id    = d.team_id       and tm.deleted = false

union all

-- ── Part 2: actual-only rows — spending in categories not in any budget ───
select
  a.org_id,
  tm.team_name,
  tm.id                                                                 as team_id,
  d.dept_name,
  d.dept_code,
  d.id                                                                  as department_id,
  a.category,
  a.record_type,
  a.period,
  a.actual,
  0                                                                     as budget,
  null                                                                  as scenario
from actuals a
join departments  d   on d.id     = a.department_id and d.deleted = false
join teams        tm  on tm.id    = d.team_id       and tm.deleted = false
where not exists (
  select 1 from budget_agg b
  where b.org_id        = a.org_id
    and b.department_id = a.department_id
    and b.category      = a.category
    and b.period        = a.period
)

order by team_name, period, record_type, category;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_team_summary  (rebuilt — budget vs actual per team per category)
--
-- Filter by scenario to scope to a specific plan ('Budget', 'Budget 2').
-- Rows with scenario IS NULL are actual-only (unbudgeted spend).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_team_summary as
select
  org_id,
  team_id,
  team_name,
  dept_name,
  dept_code,
  department_id,
  category,
  record_type,
  period,
  scenario,
  sum(actual)                                                           as actual,
  sum(budget)                                                           as budget,
  sum(actual) - sum(budget)                                             as variance,
  case
    when sum(budget) > 0
    then round(((sum(actual) - sum(budget)) / sum(budget) * 100)::numeric, 1)
    else null
  end                                                                   as variance_pct
from v_actuals_vs_budget
group by
  org_id, team_id, team_name, dept_name, dept_code,
  department_id, category, record_type, period, scenario;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_org_summary  (rebuilt — org-wide budget vs actual)
--
-- Filter by scenario to scope to a specific plan.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_org_summary as
select
  org_id,
  category,
  record_type,
  period,
  scenario,
  sum(actual)                                                           as actual,
  sum(budget)                                                           as budget,
  sum(actual) - sum(budget)                                             as variance,
  case
    when sum(budget) > 0
    then round(((sum(actual) - sum(budget)) / sum(budget) * 100)::numeric, 1)
    else null
  end                                                                   as variance_pct
from v_actuals_vs_budget
group by org_id, category, record_type, period, scenario;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_transactions_enriched  (updated — income sign flip added)
--
-- Every non-deleted transaction with resolved names from all registries.
-- Income amounts are flipped to positive here; frontend must display as-is.
--
-- INNER JOINs for dept/team/account — orphaned rows excluded.
-- Grant remains LEFT JOIN because grant_id is optional.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_transactions_enriched as
select
  t.id,
  t.org_id,
  t.transaction_id,
  t.import_batch_id,
  t.date,
  t.fiscal_period,
  to_char(t.date, 'YYYY-MM')                                           as period,
  to_char(t.date, 'YYYY-MM')                                           as calendar_month,
  case when c.record_type = 'income' then t.amount * -1 else t.amount end as amount,
  t.vendor,
  t.description,
  t.source,
  t.grant_id,
  t.department_id,
  t.account_id,
  t.created_at,
  t.updated_at,

  -- Department
  d.dept_code,
  d.dept_name,

  -- Team
  tm.id                                                                 as team_id,
  tm.team_name,
  tm.team_code,

  -- Account
  c.account_code,
  c.account_name,
  c.category,
  c.record_type,

  -- Grant (optional)
  g.grant_code,
  g.grant_name

from transactions        t
join departments         d   on t.department_id = d.id   and d.deleted  = false
join teams              tm   on d.team_id       = tm.id  and tm.deleted = false
join chart_of_accounts   c   on t.account_id    = c.id   and c.deleted  = false
left join grants         g   on t.grant_id      = g.id   and g.deleted  = false

where t.deleted = false;
