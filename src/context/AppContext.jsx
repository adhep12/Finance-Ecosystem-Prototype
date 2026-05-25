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
      })

      // ── Phase 2: fetch actuals + org summary with the real org_id ─────────
      // v_transactions_enriched can have 10k+ rows. Supabase PostgREST's
      // default max_rows setting (~1000) silently truncates the result set,
      // returning only the oldest rows — all outside the fiscal YTD window.
      // Paginate with .range() until we have every row.
      const PAGE_SIZE = 1000
      let txRows = []
      let page = 0
      while (true) {
        const { data: pageData, error: pageErr } = await supabase
          .from('v_transactions_enriched')
          .select('*')
          .eq('org_id', resolvedOrgId)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (pageErr) throw pageErr
        txRows = [...txRows, ...(pageData || [])]
        if (!pageData || pageData.length < PAGE_SIZE) break
        page++
      }

      // Set actuals FIRST — dashboards can render even if budget queries are slow
      setActuals(mapActuals(txRows))

      // ── Budget data: query v_actuals_vs_budget (keeps dept_code) ─────────────
      // v_org_summary aggregates dept_code away, so filtering budgets by department
      // in BreakdownPage / BriefingPage would always return zero.
      // v_actuals_vs_budget preserves dept_code; filter to budget rows only
      // (scenario IS NOT NULL) so we don't re-fetch all the actuals rows.
      const { data: budgetViewRows, error: budgetErr } = await supabase
        .from('v_actuals_vs_budget')
        .select('org_id, dept_code, category, record_type, period, budget, scenario')
        .eq('org_id', resolvedOrgId)
        .not('scenario', 'is', null)

      if (budgetErr) {
        console.warn('[AppContext] budget query failed (budget will be empty):', budgetErr.message)
        setBudgetFlat([])
      } else {
        setBudgetFlat(mapBudgetFlat(budgetViewRows || []))
      }

      // ── Org summary: v_org_summary — used by ELT dashboard ───────────────────
      // Non-fatal: if it times out, ELT summary widgets show empty but app stays up.
      const { data: summaryRows, error: sumErr } = await supabase
        .from('v_org_summary').select('*').eq('org_id', resolvedOrgId)

      if (sumErr) {
        console.warn('[AppContext] v_org_summary failed (ELT summary will be empty):', sumErr.message)
        setOrgSummary([])
      } else {
        setOrgSummary(summaryRows || [])
      }

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
  function mapActuals(rows) {
    return rows.map(row => ({
      ...row,
      department: row.dept_code,    // filterActualsByRange, groupByField
      account:    row.account_name,  // groupByField
      grant:      row.grant_code,    // groupByField
    }))
  }

  // Map v_actuals_vs_budget rows (budget scenario rows only) to budgetFlat format.
  // Preserves dept_code as 'department' so per-department filtering works in
  // BreakdownPage, BriefingPage, and team dashboards.
  function mapBudgetFlat(rows) {
    return rows.map(row => ({
      ...row,
      amount:     row.budget,       // calcBudgetByCategory sums 'amount'
      department: row.dept_code,    // per-dept budget filtering
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
      if (t.dept_code && t.dept_name) map[t.dept_code] = t.dept_name
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

  // ── Comments ──────────────────────────────────────────────────────────────
  function addComment(comment) {
    setComments(prev => [...prev, {
      status: 'open',
      anchor: null,
      teamId: 1,
      ...comment,
      id: 'c' + Date.now(),
      timestamp: new Date().toISOString(),
    }])
  }
  function updateCommentStatus(id, status) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status, resolved: status === 'resolved' } : c))
  }
  function updateComment(id, changes) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c))
  }
  function deleteComment(id) {
    setComments(prev => prev.filter(c => c.id !== id))
  }

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
