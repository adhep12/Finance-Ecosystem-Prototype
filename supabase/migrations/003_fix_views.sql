-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Fix Views (Fan-out Bug)
-- Finance Ecosystem Platform
--
-- ROOT CAUSE: 002 views joined raw transactions to raw budgets directly,
-- causing row multiplication and completely wrong budget totals.
--
-- FIX: aggregate each source table in a CTE first, then join the aggregates.
--
-- CHANGES:
--   • v_actuals_vs_budget  — new base view; replaces v_budget_vs_actual pattern
--   • v_team_summary       — rebuilt on top of v_actuals_vs_budget; now includes budget
--   • v_org_summary        — rebuilt on top of v_actuals_vs_budget; now includes budget
--   • v_transactions_enriched — income sign flip added; inner joins where appropriate
--
-- Safe to re-run: all statements use CREATE OR REPLACE VIEW.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- v_actuals_vs_budget  (new base view)
--
-- Aggregates transactions and budgets SEPARATELY in CTEs, then joins the
-- aggregates.  This prevents the fan-out that caused budget row multiplication.
--
-- Sign convention: income amounts are flipped to positive here so every
-- downstream view and the frontend can display them as-is.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_actuals_vs_budget as
with actuals as (
  select
    org_id,
    department_id,
    account_id,
    to_char(date, 'YYYY-MM') as period,
    sum(amount)              as actual
  from transactions
  where deleted = false
  group by org_id, department_id, account_id, to_char(date, 'YYYY-MM')
),
budget_agg as (
  select
    org_id,
    department_id,
    account_id,
    period,
    scenario,
    sum(amount) as budget
  from budgets
  where deleted = false
  group by org_id, department_id, account_id, period, scenario
)
select
  a.org_id,
  tm.team_name,
  tm.id                                                               as team_id,
  d.dept_name,
  d.dept_code,
  d.id                                                                as department_id,
  c.account_name,
  c.account_code,
  c.category,
  c.record_type,
  a.period,
  -- flip sign on income so it displays as positive everywhere
  case when c.record_type = 'income' then a.actual * -1 else a.actual end as actual,
  b.budget,
  b.scenario
from actuals a
join departments        d   on a.department_id = d.id
join teams             tm   on d.team_id       = tm.id
join chart_of_accounts  c   on a.account_id    = c.id
left join budget_agg    b
  on  a.org_id        = b.org_id
  and a.department_id = b.department_id
  and a.account_id    = b.account_id
  and a.period        = b.period
order by tm.team_name, a.period, c.record_type, c.category;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_team_summary  (rebuilt — now includes budget columns)
--
-- Budget vs actual per team, per department, per category, per period.
-- Filter by scenario to scope to a specific plan (e.g. 'Budget', 'Budget 2').
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
  sum(actual)                                      as actual,
  sum(budget)                                      as budget,
  sum(actual) - sum(budget)                        as variance,
  case
    when sum(budget) > 0
    then round(((sum(actual) - sum(budget)) / sum(budget) * 100)::numeric, 1)
    else null
  end                                              as variance_pct
from v_actuals_vs_budget
group by
  org_id, team_id, team_name, dept_name, dept_code,
  department_id, category, record_type, period, scenario;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_org_summary  (rebuilt — now includes budget columns)
--
-- Org-wide aggregates: all teams combined, per category, per period.
-- Filter by scenario to scope to a specific plan.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_org_summary as
select
  org_id,
  category,
  record_type,
  period,
  scenario,
  sum(actual)                                      as actual,
  sum(budget)                                      as budget,
  sum(actual) - sum(budget)                        as variance,
  case
    when sum(budget) > 0
    then round(((sum(actual) - sum(budget)) / sum(budget) * 100)::numeric, 1)
    else null
  end                                              as variance_pct
from v_actuals_vs_budget
group by org_id, category, record_type, period, scenario;


-- ─────────────────────────────────────────────────────────────────────────────
-- v_transactions_enriched  (updated — income sign flip added)
--
-- Every non-deleted transaction with resolved names from all registries.
-- Income amounts are flipped to positive (matching v_actuals_vs_budget).
--
-- IMPORTANT: the frontend must NOT flip the sign again — views own sign display.
--
-- Uses INNER JOINs for department/team/account so orphaned transactions
-- (no valid registry entry) are excluded rather than returned with nulls.
-- Grant is still LEFT JOIN because grant_id is optional.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view v_transactions_enriched as
select
  t.id,
  t.org_id,
  t.transaction_id,
  t.import_batch_id,
  t.date,
  t.fiscal_period,
  to_char(t.date, 'YYYY-MM')                                         as period,
  to_char(t.date, 'YYYY-MM')                                         as calendar_month,
  -- flip sign on income so it displays as positive everywhere
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
  tm.id                                                               as team_id,
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

from transactions t
join departments        d   on t.department_id = d.id   and d.deleted  = false
join teams             tm   on d.team_id       = tm.id  and tm.deleted = false
join chart_of_accounts  c   on t.account_id    = c.id   and c.deleted  = false
left join grants        g   on t.grant_id      = g.id   and g.deleted  = false

where t.deleted = false;
