import React, { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { supabase, ORG_ID, SUPABASE_CONFIGURED } from '../lib/supabase'
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
  const [comments,   setComments]   = useState([])

  // Undo history
  const [previousActuals, setPreviousActuals] = useState(null)
  const [previousBudget,  setPreviousBudget]  = useState(null)

  // Loading / error flags
  const [isLoading, setIsLoading] = useState(true)
  const [dbError,   setDbError]   = useState(null)

  // ── Manually-imported income months (legacy CSV upload flow) ─────────────
  // Falls back to derived when empty (see derivedIncomeMonths below).
  const [importedIncomeMonths, setImportedIncomeMonths] = useState([])
  const [previousIncome, setPreviousIncome] = useState(null)

  // ── On mount: load actuals + budget + org settings from Supabase ─────────
  async function loadFromDB() {
    setIsLoading(true)
    setDbError(null)
    try {
      // Run all three fetches in parallel
      const [
        { data: txRows,      error: txErr   },
        { data: budgetRows,  error: bErr    },
        { data: settingsRow, error: settErr },
      ] = await Promise.all([
        supabase.from('v_transactions_enriched').select('*').eq('org_id', ORG_ID),
        supabase.from('v_budget_enriched').select('*').eq('org_id', ORG_ID),
        supabase.from('org_settings').select('*').eq('org_id', ORG_ID).single(),
      ])

      if (txErr)    throw txErr
      if (bErr)     throw bErr
      // org_settings errors are non-fatal — fall back to DEFAULT_ORG
      if (settErr)  console.warn('[AppContext] org_settings fetch failed:', settErr.message)

      setActuals(mapActuals(txRows || []))
      setBudgetFlat(mapBudget(budgetRows || []))

      // Apply org settings from the database, falling back to DEFAULT_ORG values
      if (settingsRow) {
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
          ...DEFAULT_ORG,                                            // keep legacy fallbacks
          name:                    settingsRow.org_name    || DEFAULT_ORG.name,
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

  function mapBudget(rows) {
    return rows.map(row => ({
      ...row,
      department: row.dept_code,    // calcBudgetByCategory
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
      const ym = (t.date || '').substring(0, 7)
      if (!ym) continue
      if (!byMonth[ym]) byMonth[ym] = { contributions: 0, merch: 0, other: 0 }
      const cat  = (t.category || '').toLowerCase()
      const acct = (t.account  || '').toLowerCase()
      const isMerch = MERCH_WORDS.some(w => cat.includes(w) || acct.includes(w))
      const isOther = OTHER_WORDS.some(w => cat.includes(w) || acct.includes(w))
      if (isMerch)      byMonth[ym].merch        += t.amount
      else if (isOther) byMonth[ym].other         += t.amount
      else              byMonth[ym].contributions += t.amount
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vals]) => {
        const [y, mo] = ym.split('-')
        const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
        return {
          date:  `${ym}-01`,
          label: d.toLocaleString('en-US', { month: 'short' }),
          ...vals,
        }
      })
  }, [actuals])

  // Prefer manual import; fall back to derived from actuals
  const incomeMonths = importedIncomeMonths.length > 0
    ? importedIncomeMonths
    : derivedIncomeMonths

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
    setActuals(prev => {
      setPreviousActuals(prev)
      const outside = prev.filter(t => t.date < startDate || t.date > endDate)
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
    setBudgetFlat(prev => {
      setPreviousBudget(prev)
      const outside = prev.filter(b => !b.date || b.date < startDate || b.date > endDate)
      return [...outside, ...mapBudget(rows)]
    })
  }
  function importBudget(rows) { replaceBudget(rows) }
  function restorePreviousBudget() {
    if (!previousBudget) return
    setBudgetFlat(previousBudget)
    setPreviousBudget(null)
  }

  // ── Income months mutations (manual import flow) ──────────────────────────
  function appendIncome(rows) {
    setImportedIncomeMonths(prev => [...prev, ...rows])
  }
  function replaceIncome(rows) {
    setImportedIncomeMonths(prev => { setPreviousIncome(prev); return rows })
  }
  function restorePreviousIncome() {
    if (!previousIncome) return
    setImportedIncomeMonths(previousIncome)
    setPreviousIncome(null)
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
    // Dept maps — derived from real data; empty until actuals load
    deptNames,
    deptTeamGroups: {},
    // Core data
    actuals, importActuals,
    budgetFlat, importBudget,
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
    // Income months (manual import or derived from actuals)
    incomeMonths, appendIncome, replaceIncome,
    previousIncome, restorePreviousIncome,
    // DB state
    isLoading, dbError,
    refreshFromDB: loadFromDB,
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

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
