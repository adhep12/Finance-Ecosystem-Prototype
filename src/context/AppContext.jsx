import React, { createContext, useContext, useState, useMemo } from 'react'
import { mockActuals, mockBudgetFlat, mockComments, DEPT_NAMES, DEPT_TEAM_GROUPS } from '../data/mockData'
import { getScenarios } from '../utils/dataProcessing'

// ─────────────────────────────────────────────────────────────────────────────
// Default monthly income data (Oct 2025 → May 2026 — 8-month fiscal window)
// Importable via Financial Data CSV upload.
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_INCOME_MONTHS = [
  { date:'2025-10-01', label:'Oct', contributions:220_000, merch:16_100, other:3_600 },
  { date:'2025-11-01', label:'Nov', contributions:265_000, merch:19_500, other:4_200 },
  { date:'2025-12-01', label:'Dec', contributions:310_000, merch:23_000, other:4_800 },
  { date:'2026-01-01', label:'Jan', contributions:185_000, merch:13_500, other:2_800 },
  { date:'2026-02-01', label:'Feb', contributions:198_000, merch:14_200, other:3_100 },
  { date:'2026-03-01', label:'Mar', contributions:215_000, merch:16_000, other:3_500 },
  { date:'2026-04-01', label:'Apr', contributions:245_000, merch:18_500, other:4_100 },
  { date:'2026-05-01', label:'May', contributions:270_000, merch:20_000, other:4_600 },
]

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
const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [orgConfig, setOrgConfig] = useState(DEFAULT_ORG)
  const [actuals, setActuals] = useState(mockActuals)
  const [budgetFlat, setBudgetFlat] = useState(mockBudgetFlat)
  const [comments, setComments] = useState(mockComments)
  const [previousActuals, setPreviousActuals] = useState(null)
  const [previousBudget,  setPreviousBudget]  = useState(null)

  // Monthly income (contributions / merch / other) — importable via CSV
  const [incomeMonths, setIncomeMonths] = useState(DEFAULT_INCOME_MONTHS)
  const [previousIncome, setPreviousIncome] = useState(null)

  // Selected budget scenario
  const availableScenarios = useMemo(() => getScenarios(budgetFlat), [budgetFlat])
  const [selectedScenario, setSelectedScenario] = useState('Planned Spend')

  // Date range — default to full fiscal year
  const defaultRange = getPresetRange('full-fiscal', DEFAULT_ORG)
  const [dateRange, setDateRange] = useState({
    preset: 'full-fiscal',
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
  })

  // Briefing exclusions (category names to exclude from briefing only)
  const [briefingExclusions, setBriefingExclusions] = useState([])

  // Apply a preset to date range
  function applyPreset(preset) {
    const range = getPresetRange(preset, orgConfig)
    setDateRange({ preset, ...range })
  }

  function applyCustomRange(startDate, endDate) {
    setDateRange({ preset: 'custom', startDate, endDate })
  }

  // Append new rows to existing actuals
  function appendActuals(rows) {
    setActuals(prev => [...prev, ...rows])
  }

  // Replace all actuals (save previous first)
  function replaceActuals(rows) {
    setActuals(prev => { setPreviousActuals(prev); return rows })
  }

  // Replace actuals only within a date range
  function replaceActualsByRange(rows, startDate, endDate) {
    setActuals(prev => {
      setPreviousActuals(prev)
      const outside = prev.filter(t => t.date < startDate || t.date > endDate)
      return [...outside, ...rows]
    })
  }

  // Keep importActuals as alias for replaceActuals (backward compat)
  function importActuals(rows) { replaceActuals(rows) }

  // Append new budget rows
  function appendBudget(rows) {
    setBudgetFlat(prev => [...prev, ...rows])
  }

  // Replace all budget
  function replaceBudget(rows) {
    setBudgetFlat(prev => { setPreviousBudget(prev); return rows })
  }

  // Replace budget by date range (on date field if present)
  function replaceBudgetByRange(rows, startDate, endDate) {
    setBudgetFlat(prev => {
      setPreviousBudget(prev)
      const outside = prev.filter(b => !b.date || b.date < startDate || b.date > endDate)
      return [...outside, ...rows]
    })
  }

  // Keep importBudget as alias for replaceBudget (backward compat)
  function importBudget(rows) { replaceBudget(rows) }

  // Income months — append / replace (saves undo history)
  function appendIncome(rows) {
    setIncomeMonths(prev => [...prev, ...rows])
  }
  function replaceIncome(rows) {
    setIncomeMonths(prev => { setPreviousIncome(prev); return rows })
  }
  function restorePreviousIncome() {
    if (!previousIncome) return
    setIncomeMonths(previousIncome)
    setPreviousIncome(null)
  }

  // Restore previous actuals
  function restorePreviousActuals() {
    if (!previousActuals) return
    setActuals(previousActuals)
    setPreviousActuals(null)
  }
  function restorePreviousBudget() {
    if (!previousBudget) return
    setBudgetFlat(previousBudget)
    setPreviousBudget(null)
  }

  // Comments
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
    deptNames: DEPT_NAMES,
    deptTeamGroups: DEPT_TEAM_GROUPS,
    actuals, importActuals,
    budgetFlat, importBudget,
    availableScenarios,
    selectedScenario, setSelectedScenario,
    dateRange, applyPreset, applyCustomRange,
    briefingExclusions, setBriefingExclusions,
    comments, addComment, updateCommentStatus, updateComment, deleteComment,
    previousActuals, restorePreviousActuals,
    previousBudget, restorePreviousBudget,
    appendActuals, replaceActuals, replaceActualsByRange,
    appendBudget, replaceBudget, replaceBudgetByRange,
    // Income months (importable)
    incomeMonths, appendIncome, replaceIncome,
    previousIncome, restorePreviousIncome,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
