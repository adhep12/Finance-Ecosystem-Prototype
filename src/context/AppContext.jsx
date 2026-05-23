import React, { createContext, useContext, useState, useMemo } from 'react'
import { mockActuals, mockBudgetFlat, mockComments, DEPT_NAMES, DEPT_TEAM_GROUPS } from '../data/mockData'
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
const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [orgConfig, setOrgConfig] = useState(DEFAULT_ORG)
  const [actuals, setActuals] = useState(mockActuals)
  const [budgetFlat, setBudgetFlat] = useState(mockBudgetFlat)
  const [comments, setComments] = useState(mockComments)

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

  // Add / update data from import
  function importActuals(rows) { setActuals(rows) }
  function importBudget(rows)  { setBudgetFlat(rows) }

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
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
