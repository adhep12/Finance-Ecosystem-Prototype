import React, { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { supabase, ORG_ID, setOrgId, SUPABASE_CONFIGURED } from '../lib/supabase'
import { getScenarios } from '../utils/dataProcessing'

// ─────────────────────────────────────────────────────────────────────────────
// Default org configuration — replace with actual org data on import
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_ORG = {
  name: 'Alex, Inc.',
  teamName: 'Product',
  deptCode: '101',
  logoInitial: 'A',
  // Fiscal year: Oct → Sep
  fiscalYearStartMonth: 10,
  fiscalYearStartYear: 2025,
  // Operating year: May → Apr
  operatingYearStartMonth: 5,
  operatingYearStartYear: 2025,
  // Colors (CSS values)
  primaryColor: '#D4896A',
  primaryLight: '#F2D5C8',
  accentColor: '#0EA5A0',
}

// ─────────────────────────────────────────────────────────────────────────────
// Date range helpers
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }
function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}` }

function getPresetRange(preset, org) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate())

  const fy = org.fiscalYearStartMonth
  const fyYear = org.fiscalYearStartYear
  // Full fiscal year
  if (preset === 'full-fiscal') {
    const endYear = fy === 1 ? fyYear : fyYear + 1
    const endMonth = fy === 1 ? 12 : fy - 1
    const lastDay = new Date(endYear, endMonth, 0).getDate()
    return { startDate: ymd(fyYear, fy, 1), endDate: ymd(endYear, endMonth, lastDay) }
  }
  // Fiscal YTD
  if (preset === 'fiscal-ytd') {
    return { startDate: ymd(fyYear, fy, 1), endDate: todayStr }
  }
  // Full operating year
  const oy = org.operatingYearStartMonth
  const oyYear = org.operatingYearStartYear
  if (preset === 'full-operating') {
    const endYear = oy === 1 ? oyYear : oyYear + 1
    const endMonth = oy === 1 ? 12 : oy - 1
    const lastDay = new Date(endYear, endMonth, 0).getDate()
    return { startDate: ymd(oyYear, oy, 1), endDate: ymd(endYear, endMonth, lastDay) }
  }
  // Operating YTD
  if (preset === 'operating-ytd') {
    return { startDate: ymd(oyYear, oy, 1), endDate: todayStr }
  }
  // Rolling
  if (preset === 'last-month') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
    return {
      startDate: ymd(d.getFullYear(), d.getMonth() + 1, 1),
      endDate: ymd(today.getFullYear(), today.getMonth(), lastDay),
    }
  }
  if (preset === 'last-3') {
    const d = new Date(today); d.setMonth(d.getMonth() - 3)
    return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr }
  }
  if (preset === 'last-6') {
    const d = new Date(today); d.setMonth(d.getMonth() - 6)
    return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr }
  }
  if (preset === 'last-12') {
    const d = new Date(today); d.setFullYear(d.getFullYear() - 1)
    return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr }
  }
  return { startDate: ymd(fyYear, fy, 1), endDate: todayStr }
}

// ─────────────────────────────────────────────────────────────────────────────
// Income keyword matchers — used to split income actuals into buckets
// ─────────────────────────────────────────────────────────────────────────────
const MERCH_WORDS = ['merch', 'merchandise', 'store', 'product', 'retail', 'wholesale']
const OTHER_WORDS = ['other', 'misc', 'miscellaneous', 'licensing', 'royalt', 'speaking']

// ─────────────────────────────────────────────────────────────────────────────
const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [orgConfig, setOrgConfig] = useState(DEFAULT_ORG)

  // ── Core data state (populated from Supabase on mount) ───────────────────
  const [actuals,    setActuals]    = useState([])
  const [budgetFlat, setBudgetFlat] = useState([])
  const [orgSummary, setOrgSummary] = useState([])   // v_org_summary: actual+budget by category+period+scenario
  const [teams,      setTeams]      = useState([])   // raw teams array for sidebar + import flows
  const [comments,   setComments]   = useState([])

  // Undo history
  const [previousActuals, setPreviousActuals] = useState(null)
  const [previousBudget,  setPreviousBudget]  = useState(null)

  // Loading / error flags
  const [isLoading,   setIsLoading]   = useState(true)
  const [dbError,     setDbError]     = useState(null)
  // orgNotFound = true when no org_settings row exists → show setup screen
  const [orgNotFound, setOrgNotFound] = useState(false)
  // The resolved org_id (read from org_settings, never hardcoded)
  const [orgId, setOrgIdState] = useState('')

  // (Legacy manual income import removed — income is always derived from actuals)

  // ── On mount: load actuals + budget + org settings from Supabase ─────────
  //
  // Two-phase boot:
  //   Phase 1 — fetch org_settings without an org_id filter (just get the
  //             first/only row). This gives us the real org_id.
  //   Phase 2 — with the real org_id set, fetch actuals + org_summary.
  //
  // We update the live `ORG_ID` export in supabase.js so every other file
  // that imports { ORG_ID } automatically uses the database value.
  async function loadFromDB() {
    setIsLoading(true)
    setDbError(null)
    setOrgNotFound(false)
    try {
      // ── Phase 1: resolve org_id from org_settings ─────────────────────────
      // Order by reserve_floor desc so the "real" configured org (non-zero floor)
      // wins over test/scratch rows if multiple rows exist.
      const { data: settingsRow, error: settErr } = await supabase
        .from('org_settings')
        .select('*')
        .order('reserve_floor', { ascending: false })
        .limit(1)
        .single()

      if (settErr && settErr.code !== 'PGRST116') {
        // PGRST116 = "no rows" — anything else is a real DB error
        throw settErr
      }

      if (!settingsRow) {
        // No org configured yet — show the setup screen
        setOrgNotFound(true)
        setIsLoading(false)
        return
      }

      // Publish the real org_id to the supabase live binding
      const resolvedOrgId = settingsRow.org_id
      setOrgId(resolvedOrgId)         // updates supabase.js live binding
      setOrgIdState(resolvedOrgId)    // stores in React state for context consumers

      // Apply org settings to orgConfig
      const today     = new Date()
      const thisYear  = today.getFullYear()
      const thisMonth = today.getMonth() + 1  // 1–12

      const fyM  = settingsRow.fiscal_year_start_month    || DEFAULT_ORG.fiscalYearStartMonth
      const oyM  = settingsRow.operating_year_start_month || DEFAULT_ORG.operatingYearStartMonth

      // Year is derived from today's date + start month:
      //   if today's month >= start month → FY/OY started this calendar year
      //   otherwise it started last calendar year
      const fyYear = thisMonth >= fyM ? thisYear : thisYear - 1
      const oyYear = thisMonth >= oyM ? thisYear : thisYear - 1

      setOrgConfig({
        ...DEFAULT_ORG,
        name:                    settingsRow.org_name     || DEFAULT_ORG.name,
        logoInitial:             settingsRow.logo_initial || DEFAULT_ORG.logoInitial,
        primaryColor:            settingsRow.primary_color  || DEFAULT_ORG.primaryColor,
        primaryLight:            settingsRow.primary_light  || DEFAULT_ORG.primaryLight,
        accentColor:             settingsRow.accent_color   || DEFAULT_ORG.accentColor,
        fiscalYearStartMonth:    fyM,
        fiscalYearStartYear:     fyYear,
        operatingYearStartMonth: oyM,
        operatingYearStartYear:  oyYear,
        reserveFloor:            settingsRow.reserve_floor ?? 0,
        materialityThreshold:    settingsRow.materiality_threshold ?? 0.10,
      })

      // ── Phase 2: fetch actuals + lookup tables in parallel ───────────────────
      // Lookup tables (departments, chart_of_accounts, teams) are small and fast.
      // We fetch them alongside the transaction count query so they're ready when
      // we start paginating transactions. This lets us enrich actuals with
      // _warnings flags (unresolved accounts / depts / teams) on the first pass,
      // without a second render cycle.
      const PAGE_SIZE = 1000

      const [
        { data: deptLookup,  error: deptLookupErr  },
        { data: acctLookup,  error: acctLookupErr  },
        { data: teamLookup,  error: teamLookupErr  },
        { count: txCount },
      ] = await Promise.all([
        // departments: no org_id filter — some rows may lack org_id (created
        // via setup before org_id was enforced). TeamContext uses the same
        // pattern successfully. Scoping by org is implicit via team_id.
        // Include team_id so budget rows can be labelled with team_name.
        supabase.from('departments')
          .select('id, dept_code, dept_name, team_id'),
        supabase.from('chart_of_accounts')
          .select('id, record_type, category')
          .eq('org_id', resolvedOrgId)
          .eq('deleted', false),
        // teams: needed to resolve team_name on budget rows
        // (TeamsTab groups budgetFlat by b.team_name — must match actuals)
        supabase.from('teams')
          .select('id, team_name'),
        // Transaction count — head-only query (no rows) for pagination math
        supabase.from('v_transactions_enriched')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', resolvedOrgId),
      ])

      if (deptLookupErr) console.warn('[AppContext] departments lookup error:', deptLookupErr.message)
      if (acctLookupErr) console.warn('[AppContext] chart_of_accounts lookup error:', acctLookupErr.message)
      if (teamLookupErr) console.warn('[AppContext] teams lookup error:', teamLookupErr.message)

      const deptMap = {}  // department uuid → { dept_code, dept_name, team_id }
      for (const d of (deptLookup || [])) deptMap[d.id] = d
      const acctMap = {}  // account uuid → { record_type, category }
      for (const a of (acctLookup || [])) acctMap[a.id] = a
      const teamMap = {}  // team uuid → team_name
      for (const t of (teamLookup || [])) teamMap[t.id] = t.team_name

      // Expose raw teams array so components (Sidebar, import flows) don't re-fetch
      setTeams(teamLookup || [])

      // Now paginate transactions — lookup maps already built, pass them to mapActuals
      // so _warnings flags are set on the first render (no second pass needed).
      const txTotalPages = Math.ceil((txCount || 0) / PAGE_SIZE)
      const TX_BATCH = 10   // fire 10 requests at a time

      let txRows = []
      for (let start = 0; start < txTotalPages; start += TX_BATCH) {
        const batchPages = Array.from(
          { length: Math.min(TX_BATCH, txTotalPages - start) },
          (_, i) => start + i
        )
        const results = await Promise.all(
          batchPages.map(p =>
            supabase.from('v_transactions_enriched')
              .select('*')
              .eq('org_id', resolvedOrgId)
              .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
          )
        )
        for (const { data: pData, error: pErr } of results) {
          if (pErr) console.warn('[AppContext] transaction page error:', pErr.message)
          else txRows = [...txRows, ...(pData || [])]
        }
      }

      // Set actuals FIRST — dashboards can render even if budget queries are slow.
      // Pass lookup maps so mapActuals can set _warnings on unresolved rows.
      setActuals(mapActuals(txRows, deptMap, acctMap))

      // ── Budget pagination — parallel fetch for speed ──────────────────────
      // Sequential while-loop took ~11 s for 108 pages. Instead:
      //   1. Count-only head query to know how many pages
      //   2. Fire all page requests in parallel (batched to avoid throttling)
      const { count: budgetCount } = await supabase
        .from('budgets')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', resolvedOrgId)
        .eq('deleted', false)

      const totalPages = Math.ceil((budgetCount || 0) / PAGE_SIZE)
      const BATCH = 10   // fire 10 requests at a time

      let budgetRows = []
      for (let start = 0; start < totalPages; start += BATCH) {
        const batchPages = Array.from(
          { length: Math.min(BATCH, totalPages - start) },
          (_, i) => start + i
        )
        const results = await Promise.all(
          batchPages.map(p =>
            supabase.from('budgets')
              .select('id, department_id, account_id, category, scenario, amount, period, period_type')
              .eq('org_id', resolvedOrgId)
              .eq('deleted', false)
              .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
          )
        )
        for (const { data: bData, error: bErr } of results) {
          if (bErr) console.warn('[AppContext] budget page error:', bErr.message)
          else budgetRows = [...budgetRows, ...(bData || [])]
        }
      }

      setBudgetFlat(mapBudgetFlatDirect(budgetRows, deptMap, acctMap, teamMap))

      // v_org_summary was removed — the view times out (complex JOIN, no index)
      // and no component reads orgSummary anyway.  All dashboard widgets derive
      // their data directly from actuals + budgetFlat which are already loaded.
      setOrgSummary([])

    } catch (err) {
      console.error('[AppContext] DB load error:', err)
      setDbError(err.message || 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadFromDB() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Inject org colors into CSS variables whenever orgConfig changes ───────
  // This keeps CSS-var-based classes (e.g. bg-[var(--color-accent)]) in sync
  // with whatever the org has configured.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-primary',       orgConfig.primaryColor)
    root.style.setProperty('--color-primary-light',  orgConfig.primaryLight)
    root.style.setProperty('--color-accent',         orgConfig.accentColor)
  }, [orgConfig.primaryColor, orgConfig.primaryLight, orgConfig.accentColor])

  // ── Recompute date range when org fiscal/operating year settings load ─────
  // Only recomputes if a non-custom preset is active (don't clobber user picks).
  useEffect(() => {
    if (dateRange.preset && dateRange.preset !== 'custom') {
      setDateRange({ preset: dateRange.preset, ...getPresetRange(dateRange.preset, orgConfig) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgConfig.fiscalYearStartMonth, orgConfig.fiscalYearStartYear,
      orgConfig.operatingYearStartMonth, orgConfig.operatingYearStartYear])

  // ── Field mapping — adds backward-compat aliases on each row ─────────────
  //
  // Utility functions (filterActualsByRange, groupByField, etc.) were written
  // before Supabase and use field names like `.department`, `.account`,
  // `.grant`.  The view returns `dept_code`, `account_name`, `grant_code`.
  // We add the aliased fields here so callers don't need to change.
  //
  // IMPORTANT: dept_code comes back from PostgreSQL as an integer.
  // JavaScript object keys are always strings (Object.keys coerces), and
  // DEPT_COLORS / deptNames lookups all use string keys.  Stringify here
  // so every downstream === comparison, Set.has(), and object lookup works.
  // Map v_transactions_enriched rows → actuals array.
  // Accepts optional lookup maps (built during loadFromDB Phase 2) so that
  // _warnings flags can be attached in the same pass — no second render needed.
  // deptMap / acctMap are keyed by UUID.  The enriched view typically includes
  // account_id and department_id as raw FK columns from the transactions table;
  // if they're absent the _warnings check safely skips (empty object lookup).
  function mapActuals(rows, deptMap = {}, acctMap = {}) {
    return rows.map(row => {
      const warnReasons = []
      // account_id present but not found in CoA → no Chart of Accounts entry
      if (row.account_id && !acctMap[row.account_id]) warnReasons.push('no_account')
      // department_id present but not found in departments → not in registry
      if (row.department_id && !deptMap[row.department_id]) {
        warnReasons.push('no_dept')
      } else if (row.department_id && deptMap[row.department_id] && !deptMap[row.department_id].team_id) {
        // Dept found but has no team assigned → unassigned
        warnReasons.push('no_team')
      }
      return {
        ...row,
        dept_code:  row.dept_code  != null ? String(row.dept_code)  : null,
        department: row.dept_code  != null ? String(row.dept_code)  : null,
        account:    row.account_name,  // groupByField
        grant:      row.grant_code,    // groupByField
        _warnings:  warnReasons,       // [] = clean, non-empty = actionable issue
      }
    })
  }

  // Map budgets table rows → budgetFlat, resolving dept_code / record_type
  // from pre-fetched lookup maps (departments + chart_of_accounts).
  // Replaces the slow mapBudgetFlat(view) path which timed out at ~5000/16000 rows.
  function mapBudgetFlatDirect(rows, deptMap, acctMap, teamMap = {}) {
    return rows.map(row => {
      const dept       = deptMap[row.department_id] || {}
      const acct       = acctMap[row.account_id]    || {}
      const deptCode   = dept.dept_code != null ? String(dept.dept_code) : null
      const teamName   = dept.team_id ? (teamMap[dept.team_id] || null) : null
      const hasAccount = !!acctMap[row.account_id]   // false → orphaned account_id (not in chart_of_accounts)

      // Build _warnings array — same three checks as mapActuals
      const warnReasons = []
      if (row.account_id && !acctMap[row.account_id]) warnReasons.push('no_account')
      if (row.department_id && !deptMap[row.department_id]) {
        warnReasons.push('no_dept')
      } else if (row.department_id && deptMap[row.department_id] && !deptMap[row.department_id].team_id) {
        warnReasons.push('no_team')
      }

      return {
        ...row,
        dept_code:    deptCode,
        department:   deptCode,           // calcBudgetByCategory / filterELTByRange filter on 'department'
        dept_name:    dept.dept_name || null,
        team_id:      dept.team_id   || null,
        team_name:    teamName,           // TeamsTab groups budgetFlat by b.team_name
        record_type:  acct.record_type || 'expense',  // income budget rows link to income accounts
        category:     row.category || acct.category || null,
        // 'amount' is the correct column name in the budgets table (no rename needed)
        period:       row.period ? String(row.period).substring(0, 7) : null,
        _hasAccount:  hasAccount,         // used to exclude orphaned rows from team detail modal
        _warnings:    warnReasons,        // actionable warning types for this row
      }
    })
  }

  // Map v_actuals_vs_budget rows — kept for reference, no longer called.
  function mapBudgetFlat(rows) {
    return rows.map(row => ({
      ...row,
      dept_code:  row.dept_code != null ? String(row.dept_code) : null,
      amount:     row.budget,
      department: row.dept_code != null ? String(row.dept_code) : null,
      period:     row.period ? String(row.period).substring(0, 7) : null,
    }))
  }

  // Map v_org_summary rows to the shape expected by calcBudgetByCategory
  // and filterELTByRange: { period, amount, category, record_type, scenario, department }
  // Only rows where scenario IS NOT NULL are budget rows; null = actual-only (no budget).
  // NOTE: kept for potential ELT dashboard use but no longer used for budgetFlat.
  function mapOrgSummaryToBudget(rows) {
    return rows
      .filter(row => row.scenario != null)   // skip actual-only rows (no budget)
      .map(row => ({
        ...row,
        amount:     row.budget,   // calcBudgetByCategory sums 'amount'
        department: null,         // v_org_summary is org-wide (no dept granularity)
      }))
  }

  // Map manually-imported budget rows (from legacy CSV import flow)
  function mapBudget(rows) {
    return rows.map(row => ({
      ...row,
      department: row.dept_code || row.department,  // calcBudgetByCategory
    }))
  }

  // ── Derived: dept name map from loaded actuals ────────────────────────────
  const deptNames = useMemo(() =>
    actuals.reduce((map, t) => {
      // dept_code is already stringified by mapActuals; use String() guard anyway
      if (t.dept_code && t.dept_name) map[String(t.dept_code)] = t.dept_name
      return map
    }, {})
  , [actuals])

  // ── Derived: income months from income-type actuals ───────────────────────
  //
  // Groups actuals where record_type = 'income' by calendar month,
  // then splits each month's total into contributions / merch / other
  // using keyword matching on category + account_name.
  //
  // Only used when no manual import has been performed (importedIncomeMonths).
  const derivedIncomeMonths = useMemo(() => {
    const byMonth = {}
    for (const t of actuals) {
      if (t.record_type !== 'income') continue
      const ym = t.period || (t.date ? t.date.substring(0, 7) : '')
      if (!ym) continue
      if (!byMonth[ym]) byMonth[ym] = { contributions: 0, merch: 0, other: 0 }
      const cat  = (t.category || '').toLowerCase()
      const acct = (t.account  || '').toLowerCase()
      const isMerch = MERCH_WORDS.some(w => cat.includes(w) || acct.includes(w))
      const isOther = OTHER_WORDS.some(w => cat.includes(w) || acct.includes(w))
      // Use Math.abs to ensure positive values — handles both sign conventions:
      // v_org_summary flips income positive; v_transactions_enriched may not.
      const amt = Math.abs(t.amount || 0)
      if (isMerch)      byMonth[ym].merch        += amt
      else if (isOther) byMonth[ym].other         += amt
      else              byMonth[ym].contributions += amt
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vals]) => {
        const [y, mo] = ym.split('-')
        const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
        return {
          period: ym,            // YYYY-MM — used for period-based filtering
          date:   `${ym}-01`,   // legacy compat
          label:  d.toLocaleString('en-US', { month: 'short' }),
          ...vals,
        }
      })
  }, [actuals])

  // Income always derived from actuals (manual import removed)
  const incomeMonths = derivedIncomeMonths

  // ── Scenario selector ─────────────────────────────────────────────────────
  const availableScenarios = useMemo(() => getScenarios(budgetFlat), [budgetFlat])
  // Start with no selection; auto-select the first real scenario once budget data loads.
  // 'Planned Spend' was a legacy default that never matched real data ('Budget'/'Budget 2').
  const [selectedScenario, setSelectedScenario] = useState('')

  // When availableScenarios populates (or changes), keep selectedScenario valid.
  // If current selection is empty or no longer in the list, pick the first option.
  useEffect(() => {
    if (availableScenarios.length > 0 && !availableScenarios.includes(selectedScenario)) {
      setSelectedScenario(availableScenarios[0])
    }
  }, [availableScenarios]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Date range — default to full fiscal year ──────────────────────────────
  const defaultRange = getPresetRange('full-fiscal', DEFAULT_ORG)
  const [dateRange, setDateRange] = useState({
    preset: 'full-fiscal',
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
  })

  // Briefing exclusions (category names to exclude from briefing only)
  const [briefingExclusions, setBriefingExclusions] = useState([])

  function applyPreset(preset) {
    setDateRange({ preset, ...getPresetRange(preset, orgConfig) })
  }
  function applyCustomRange(startDate, endDate) {
    setDateRange({ preset: 'custom', startDate, endDate })
  }

  // ── Actuals mutations ─────────────────────────────────────────────────────
  function appendActuals(rows) {
    setActuals(prev => [...prev, ...mapActuals(rows)])
  }
  function replaceActuals(rows) {
    setActuals(prev => { setPreviousActuals(prev); return mapActuals(rows) })
  }
  function replaceActualsByRange(rows, startDate, endDate) {
    const startP = startDate.substring(0, 7)
    const endP   = endDate.substring(0, 7)
    setActuals(prev => {
      setPreviousActuals(prev)
      const outside = prev.filter(t => {
        const p = t.period || (t.date ? t.date.substring(0, 7) : null)
        return !p || p < startP || p > endP  // outside the import range → keep
      })
      return [...outside, ...mapActuals(rows)]
    })
  }
  function importActuals(rows) { replaceActuals(rows) }
  function restorePreviousActuals() {
    if (!previousActuals) return
    setActuals(previousActuals)
    setPreviousActuals(null)
  }

  // ── Budget mutations ──────────────────────────────────────────────────────
  function appendBudget(rows) {
    setBudgetFlat(prev => [...prev, ...mapBudget(rows)])
  }
  function replaceBudget(rows) {
    setBudgetFlat(prev => { setPreviousBudget(prev); return mapBudget(rows) })
  }
  function replaceBudgetByRange(rows, startDate, endDate) {
    const startP = startDate.substring(0, 7)
    const endP   = endDate.substring(0, 7)
    setBudgetFlat(prev => {
      setPreviousBudget(prev)
      const outside = prev.filter(b => !b.period || b.period < startP || b.period > endP)
      return [...outside, ...mapBudget(rows)]
    })
  }
  function importBudget(rows) { replaceBudget(rows) }
  function restorePreviousBudget() {
    if (!previousBudget) return
    setBudgetFlat(previousBudget)
    setPreviousBudget(null)
  }

  // ── Comments — Supabase-backed with realtime ──────────────────────────────
  function dbRowToComment(row) {
    return {
      id:        row.id,
      status:    row.status,
      type:      row.type,
      text:      row.text,
      author:    row.author,
      avatar:    row.avatar,
      page:      row.page,
      category:  row.category,
      anchor:    row.anchor,
      teamId:    row.team_id,
      resolved:  row.resolved,
      timestamp: row.created_at,
    }
  }

  async function fetchComments(currentOrgId) {
    const id = currentOrgId || orgId
    if (!id) return
    const { data, error } = await supabase
      .from('comments_requests')
      .select('*')
      .eq('org_id', id)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
    if (!error && data) setComments(data.map(dbRowToComment))
  }

  async function addComment(comment) {
    if (!orgId) return
    const row = {
      org_id:   orgId,
      status:   'open',
      anchor:   null,
      team_id:  1,
      ...comment,
      // map camelCase fields to snake_case columns
      team_id:  comment.teamId ?? 1,
      type:     comment.type    || 'comment',
      text:     comment.text    || '',
      author:   comment.author  || '',
      avatar:   comment.avatar  || null,
      page:     comment.page    || null,
      category: comment.category || null,
      anchor:   comment.anchor  || null,
    }
    // Remove camelCase keys before inserting
    delete row.teamId
    delete row.timestamp
    delete row.id
    const { error } = await supabase.from('comments_requests').insert([row])
    if (error) console.error('addComment error', error)
    // Realtime subscription will call fetchComments and update state
  }

  async function updateCommentStatus(id, status) {
    if (!orgId) return
    await supabase
      .from('comments_requests')
      .update({ status, resolved: status === 'resolved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)
    // Optimistic update so UI feels instant
    setComments(prev => prev.map(c => c.id === id ? { ...c, status, resolved: status === 'resolved' } : c))
  }

  async function updateComment(id, changes) {
    if (!orgId) return
    const dbChanges = { ...changes, updated_at: new Date().toISOString() }
    if ('teamId' in dbChanges) { dbChanges.team_id = dbChanges.teamId; delete dbChanges.teamId }
    await supabase
      .from('comments_requests')
      .update(dbChanges)
      .eq('id', id)
      .eq('org_id', orgId)
    setComments(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c))
  }

  async function deleteComment(id) {
    if (!orgId) return
    await supabase
      .from('comments_requests')
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  // Realtime subscription — set up once per org_id
  useEffect(() => {
    if (!orgId) return
    fetchComments(orgId)
    const channel = supabase
      .channel('comments_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments_requests', filter: `org_id=eq.${orgId}` },
        () => { fetchComments(orgId) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    orgConfig, setOrgConfig,
    // Resolved org_id — read from org_settings on boot, never hardcoded
    orgId,
    // Dept maps — derived from real data; empty until actuals load
    deptNames,
    deptTeamGroups: {},
    // Core data
    actuals, importActuals,
    budgetFlat, importBudget,
    orgSummary,   // v_org_summary: pre-aggregated actual+budget by category+period+scenario
    teams,        // raw teams array — fetched once on boot, avoids duplicate fetches
    // Scenario + date range
    availableScenarios,
    selectedScenario, setSelectedScenario,
    dateRange, applyPreset, applyCustomRange,
    // Briefing
    briefingExclusions, setBriefingExclusions,
    // Comments
    comments, addComment, updateCommentStatus, updateComment, deleteComment,
    // Undo history
    previousActuals, restorePreviousActuals,
    previousBudget,  restorePreviousBudget,
    // Granular mutations
    appendActuals, replaceActuals, replaceActualsByRange,
    appendBudget, replaceBudget, replaceBudgetByRange,
    // Income months — derived from actuals (read-only; no manual import)
    incomeMonths,
    // DB state
    isLoading, dbError, orgNotFound,
    refreshFromDB: loadFromDB,
  }

  // If no org_settings row found, prompt the user to set up the org first
  if (orgNotFound) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', background: '#F5F2EC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E2DC', padding: 48, maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
          <h2 style={{ color: '#1A1A1A', marginBottom: 8, fontWeight: 600 }}>No organisation configured</h2>
          <p style={{ color: '#6B7280', marginBottom: 24, lineHeight: 1.6 }}>
            No <code>org_settings</code> row was found in Supabase. Please insert one with your <code>org_id</code>, <code>org_name</code>, and year-start months, then refresh.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#0EA5A0', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // If Supabase env vars are missing, show a clear config error banner
  if (!SUPABASE_CONFIGURED) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff1f0', minHeight: '100vh' }}>
        <h2 style={{ color: '#c0392b', marginBottom: 12 }}>⚠ Missing Supabase configuration</h2>
        <p style={{ color: '#333', marginBottom: 16, fontFamily: 'sans-serif' }}>
          The app needs <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to be set.
        </p>
        <p style={{ color: '#333', fontFamily: 'sans-serif', marginBottom: 8 }}><strong>For Netlify:</strong></p>
        <p style={{ color: '#555', fontFamily: 'sans-serif' }}>
          Go to <em>Site Settings → Environment Variables</em> and add both keys, then redeploy.
        </p>
        <p style={{ color: '#333', fontFamily: 'sans-serif', marginTop: 16 }}><strong>For local dev:</strong></p>
        <p style={{ color: '#555', fontFamily: 'sans-serif' }}>
          Create a <code>.env.local</code> file in the project root with the two variables.
        </p>
      </div>
    )
  }

  // ── Boot gate: don't mount children until org_id is resolved ──────────────
  // Without this, components that query Supabase on mount fire while ORG_ID
  // is still '' (empty string), getting 0 rows because no row matches
  // org_id = ''. We hold the app on a loading screen until Phase 1 of
  // loadFromDB() has called setOrgId() and the real UUID is in place.
  if (!orgId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#F5F2EC', flexDirection: 'column', gap: 16,
      }}>
        {dbError ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E2DC', padding: 40, maxWidth: 440, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: '#1A1A1A', marginBottom: 8 }}>Failed to connect</h3>
            <p style={{ color: '#6B7280', marginBottom: 20, fontSize: 14 }}>{dbError}</p>
            <button
              onClick={loadFromDB}
              style={{ background: '#0EA5A0', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '3px solid #E5E2DC', borderTopColor: '#0EA5A0',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <span style={{ color: '#6B7280', fontSize: 14 }}>Loading…</span>
          </>
        )}
      </div>
    )
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
