import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts'
import {
  ChevronDown, Pencil, Plus, X, Check, ChevronRight,
  ChevronUp, TrendingUp, TrendingDown, Minus, Info, Upload,
  FileText, Users, BarChart2, LayoutDashboard,
  AlertCircle, CheckCircle,
  ArrowUpDown, ExternalLink, SlidersHorizontal, BookOpen,
  Download, Calendar, Trash2, Save
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { supabase, ORG_ID } from '../lib/supabase'
import CommentsPage from './CommentsPage'
import CommentPinFAB from '../components/CommentPinFAB'
import { formatCurrency, formatPercent, daysBetween } from '../utils/formatters'
import { WARN_CONFIG, UnresolvedSection } from '../components/UnresolvedWarning'
import { ORG_COLORS, DATA_COLORS, STATUS_COLORS } from '../constants/colors'

// ─────────────────────────────────────────────────────────────────────────────
// Rolling Quotes
// ─────────────────────────────────────────────────────────────────────────────

const ROLLING_QUOTES = [
  { text: "Revenue is vanity, profit is sanity, cash is king.", author: "Traditional" },
  { text: "Not everything that counts can be counted, and not everything that can be counted counts.", author: "William Bruce Cameron" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "In God we trust. All others must bring data.", author: "W. Edwards Deming" },
  { text: "Plans are nothing. Planning is everything.", author: "Dwight D. Eisenhower" },
  { text: "Without data, you're just another person with an opinion.", author: "W. Edwards Deming" },
  { text: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", author: "Abraham Lincoln" },
  { text: "Budgets are not merely affairs of arithmetic, but in a thousand ways go to the root of prosperity.", author: "William Gladstone" },
  { text: "The goal is not to be perfect at the end. The goal is to be better today.", author: "Simon Sinek" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Summaries — start empty; added via the Summary tab UI
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_SUMMARIES = {}

// ─────────────────────────────────────────────────────────────────────────────
// Generate available months (last 18 months before current)
// ─────────────────────────────────────────────────────────────────────────────

function getAvailableMonths() {
  const today = new Date()
  const months = []
  for (let i = 1; i <= 18; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    months.push(label)
  }
  return months
}

const ALL_MONTHS = getAvailableMonths()

// Fallback ELT data object — used when filterELTByRange returns null/undefined
// (e.g. during initial load before actuals/budgetFlat have been fetched)
const EMPTY_ELT = {
  giving:      { contributions:0, merchandiseRevenue:0, otherIncome:0 },
  budget:      { contributions:0, merchandiseRevenue:0, otherIncome:0, staff:0, contract:0, technology:0, travel:0, otherGenAdmin:0 },
  priorYear:   { contributions:0, merchandiseRevenue:0, otherIncome:0, expenses:0 },
  expenseLines:{ staff:0, contract:0, technology:0, travel:0, otherGenAdmin:0 },
  forecast:    { contributions:0, merchandiseRevenue:0, otherIncome:0 },
  cash:        { current:0, priorMonth:0, priorYear:0 },
}

// ELT_MOCK removed — all data now sourced from Supabase / AppContext

// ─────────────────────────────────────────────────────────────────────────────
// Fiscal month calendar for date-range filtering
// ─────────────────────────────────────────────────────────────────────────────

const FISCAL_MONTHS = [
  {date:'2025-06-01',label:'Jun'},{date:'2025-07-01',label:'Jul'},
  {date:'2025-08-01',label:'Aug'},{date:'2025-09-01',label:'Sep'},
  {date:'2025-10-01',label:'Oct'},{date:'2025-11-01',label:'Nov'},
  {date:'2025-12-01',label:'Dec'},{date:'2026-01-01',label:'Jan'},
  {date:'2026-02-01',label:'Feb'},{date:'2026-03-01',label:'Mar'},
  {date:'2026-04-01',label:'Apr'},{date:'2026-05-01',label:'May'},
]

// Year-to-color palette (index 0 = current FY, 1 = 1yr back, etc.)
const CURRENT_FY     = 2026
const YEAR_PALETTE   = ['var(--color-primary)','#C05A2F','#E8A838','#9BA8B5','#C8D0D8']
function yearColor(year) {
  const dist = CURRENT_FY - parseInt(year)
  return YEAR_PALETTE[Math.max(0, Math.min(dist, YEAR_PALETTE.length - 1))]
}

// Per-row colors for P&L % bars
const PL_ROW_COLORS = {
  'contributions':'var(--color-primary)',
  'merch':'var(--color-primary)',
  'other-inc':'var(--color-primary)',
  'staff':'#C05A2F',
  'contract':'#E8A838',
  'technology':'#2A7B8C',
  'travel':'#D98F1C',
  'other-exp':'#9BA8B5',
}

// ELT_MO_ACT / ELT_MO_BUD / ELT_MO_PRI removed — data sourced from Supabase / AppContext

/**
 * Derive ELT dashboard data from real AppContext data + Supabase fetches.
 *
 * @param {object}   dateRange
 * @param {Array}    incomeMonths  — from AppContext (derived or manually imported)
 * @param {Array}    actuals       — from AppContext (mapped from v_transactions_enriched)
 * @param {Array}    budgetFlat    — from AppContext (mapped from v_budget_enriched)
 * @param {string}   scenario      — selected budget scenario
 * @param {Array}    cashData      — rows from v_cash_flow_enriched (or [])
 * @param {Array}    patronData    — rows from v_patron_trends (or [])
 */
function filterELTByRange(dateRange, incomeMonths, actuals, budgetFlat, scenario, cashData, patronData) {
  const s = dateRange?.startDate || '2025-06-01'
  const e = dateRange?.endDate   || '2026-05-31'

  // Period range (YYYY-MM) — used for all period-based filtering
  const startP = s.substring(0, 7)   // YYYY-MM
  const endP   = e.substring(0, 7)   // YYYY-MM

  // Build sorted YYYY-MM list for the range
  const months = []
  const cur = new Date(s.substring(0,4), parseInt(s.substring(5,7))-1, 1)
  const end = new Date(e.substring(0,4), parseInt(e.substring(5,7))-1, 1)
  while (cur <= end) {
    const y = cur.getFullYear(), m = String(cur.getMonth()+1).padStart(2,'0')
    months.push(`${y}-${m}`)
    cur.setMonth(cur.getMonth()+1)
  }
  const monthSet = new Set(months)

  // ── Income — from AppContext.incomeMonths (period-based filter) ───────────
  const incInRange = (incomeMonths||[]).filter(m => {
    const p = m.period || (m.date ? m.date.substring(0,7) : null)
    return p && p >= startP && p <= endP
  })
  const contributions      = incInRange.reduce((t,m) => t + (m.contributions||0), 0)
  const merchandiseRevenue = incInRange.reduce((t,m) => t + (m.merch||0), 0)
  const otherIncome        = incInRange.reduce((t,m) => t + (m.other||0), 0)

  // ── Expenses — from AppContext.actuals (period-based filter) ──────────────
  const actInRange = (actuals||[]).filter(t => {
    const p = t.period || (t.date ? t.date.substring(0,7) : null)
    return p && p >= startP && p <= endP && t.record_type !== 'income'
  })
  const sumCat = (...cats) => actInRange.filter(t => cats.some(c => (t.category||'').toLowerCase().includes(c.toLowerCase()))).reduce((t,r) => t + (r.amount||0), 0)
  const staff         = sumCat('Staff','Payroll','Salaries','Compensation')
  const contract      = sumCat('Contract','Professional Services','Consulting','Legal')
  const technology    = sumCat('Software','Computers','Technology','Infrastructure','Hosting')
  const travel        = sumCat('Travel','Lodging','Meals','Transportation')
  const otherGenAdmin = actInRange
    .filter(t => !['Staff','Payroll','Salaries','Compensation','Contract','Professional Services','Consulting','Legal',
                    'Software','Computers','Technology','Infrastructure','Hosting','Travel','Lodging','Meals','Transportation']
               .some(c => (t.category||'').toLowerCase().includes(c.toLowerCase())))
    .reduce((t,r) => t + (r.amount||0), 0)

  // ── Prior Year — same period shifted back 12 months ───────────────────────
  // Computed from the same actuals/incomeMonths arrays so it stays in sync.
  const pyStartP = `${parseInt(startP.substring(0,4))-1}-${startP.substring(5,7)}`
  const pyEndP   = `${parseInt(endP.substring(0,4))-1}-${endP.substring(5,7)}`

  const pyIncInRange = (incomeMonths||[]).filter(m => {
    const p = m.period || (m.date ? m.date.substring(0,7) : null)
    return p && p >= pyStartP && p <= pyEndP
  })
  const pyContributions      = pyIncInRange.reduce((t,m) => t + (m.contributions||0), 0)
  const pyMerchandiseRevenue = pyIncInRange.reduce((t,m) => t + (m.merch||0), 0)
  const pyOtherIncome        = pyIncInRange.reduce((t,m) => t + (m.other||0), 0)

  const pyActInRange = (actuals||[]).filter(t => {
    const p = t.period || (t.date ? t.date.substring(0,7) : null)
    return p && p >= pyStartP && p <= pyEndP && t.record_type !== 'income'
  })
  const pyExpenses = pyActInRange.reduce((t,r) => t + (r.amount||0), 0)

  // ── Budget — from AppContext.budgetFlat ───────────────────────────────────
  const budInRange = (budgetFlat||[]).filter(b => b.scenario === scenario && b.period && monthSet.has(b.period))
  const budSumCat = (rt, ...cats) => budInRange
    .filter(b => (!rt || b.record_type === rt) && cats.some(c => (b.category||'').toLowerCase().includes(c.toLowerCase())))
    .reduce((s,b) => s + (b.amount||0), 0)
  const budTotalIncome = budInRange.filter(b => b.record_type === 'income').reduce((s,b) => s+(b.amount||0), 0)
  const budMerch       = budSumCat('income','merch','merchandise','store')
  const budOther       = budSumCat('income','other','misc','licensing','royalt','speaking')
  const budContrib     = Math.max(0, budTotalIncome - budMerch - budOther)
  const budStaff       = budSumCat('expense','staff','payroll','salaries','compensation')
  const budContract    = budSumCat('expense','contract','professional','consulting','legal')
  const budTech        = budSumCat('expense','software','computers','technology','infrastructure','hosting')
  const budTravel      = budSumCat('expense','travel','lodging','meals','transportation')
  const budOtherExp    = budInRange.filter(b => b.record_type === 'expense').reduce((s,b) => s+(b.amount||0), 0)
    - budStaff - budContract - budTech - budTravel

  // ── Cash — from v_cash_flow_enriched ─────────────────────────────────────
  const cashRows   = (cashData||[]).filter(r => r.period >= s.substring(0,7) && r.period <= e.substring(0,7))
  const latestCash = cashRows.length > 0
    ? cashRows.reduce((l,r) => !l || r.period > l.period ? r : l, null)
    : null
  const cash = latestCash
    ? { current: latestCash.cash_balance||0, priorMonth: latestCash.prior_month_balance||0, priorYear: latestCash.prior_year_balance||0 }
    : { current: 0, priorMonth: 0, priorYear: 0 }

  // ── Patron data — from v_patron_trends ───────────────────────────────────
  const patronRows  = (patronData||[]).filter(p => p.period >= startP && p.period <= endP)
  const latestPat   = patronRows.length > 0
    ? patronRows.reduce((l,p) => !l || p.period > l.period ? p : l, null)
    : null

  // Derive prior-month, prior-year, and prior-period new counts from the full
  // patronData array (which covers all loaded periods, not just the range).
  let patronPriorMonth = 0
  let patronPriorYear  = 0
  let newPriorPeriod   = 0
  if (latestPat) {
    const [ly, lm] = latestPat.period.split('-')
    const lyNum = parseInt(ly), lmNum = parseInt(lm)

    // Prior month: 1 month before the latest period in range
    const pmDate = new Date(lyNum, lmNum - 2, 1)
    const priorMonthP = `${pmDate.getFullYear()}-${String(pmDate.getMonth()+1).padStart(2,'0')}`
    const priorMonthRow = (patronData||[]).find(p => p.period === priorMonthP)
    patronPriorMonth = priorMonthRow ? (priorMonthRow.total_active_patrons || 0) : 0

    // Prior year: same month, 1 year back
    const priorYearP = `${lyNum - 1}-${String(lmNum).padStart(2,'0')}`
    const priorYearRow = (patronData||[]).find(p => p.period === priorYearP)
    patronPriorYear = priorYearRow ? (priorYearRow.total_active_patrons || 0) : 0

    // Prior period new patrons: same duration immediately before current range
    const numMonths = months.length || 1
    const rangeStartDate = new Date(parseInt(s.substring(0,4)), parseInt(s.substring(5,7)) - 1, 1)
    const priorPEnd = new Date(rangeStartDate)
    priorPEnd.setMonth(priorPEnd.getMonth() - 1)
    const priorPStart = new Date(priorPEnd)
    priorPStart.setMonth(priorPStart.getMonth() - (numMonths - 1))
    const priorPStartP = `${priorPStart.getFullYear()}-${String(priorPStart.getMonth()+1).padStart(2,'0')}`
    const priorPEndP   = `${priorPEnd.getFullYear()}-${String(priorPEnd.getMonth()+1).padStart(2,'0')}`
    newPriorPeriod = (patronData||[])
      .filter(p => p.period >= priorPStartP && p.period <= priorPEndP)
      .reduce((sum, p) => sum + (p.new_patrons_total||0), 0)
  }

  const patrons = latestPat
    ? {
        total:            latestPat.total_active_patrons    || 0,
        priorMonth:       patronPriorMonth,
        priorYear:        patronPriorYear,
        newThisPeriod:    patronRows.reduce((sum,p) => sum + (p.new_patrons_total||0), 0),
        newPriorPeriod,
        avgGift:          latestPat.avg_gift_size           || 0,
        avgGiftPriorYear: 0,
        monthly: patronRows.map(p => {
          const [y,m] = p.period.split('-')
          return { month: new Date(parseInt(y),parseInt(m)-1,1).toLocaleString('en-US',{month:'short'}), newCY: p.new_patrons_total||0, newPY: 0 }
        }),
        base: patronRows.map(p => {
          const [y,m] = p.period.split('-')
          return { month: new Date(parseInt(y),parseInt(m)-1,1).toLocaleString('en-US',{month:'short'}), total: p.total_active_patrons||0 }
        }),
      }
    : { total:0, priorMonth:0, priorYear:0, newThisPeriod:0, newPriorPeriod:0, avgGift:0, avgGiftPriorYear:0, monthly:[], base:[] }

  // ── Range label ───────────────────────────────────────────────────────────
  const labels = months.map(ym => {
    const [y,m] = ym.split('-')
    return new Date(parseInt(y),parseInt(m)-1,1).toLocaleString('en-US',{month:'short'})
  })
  const rangeLabel = labels.length === 0 ? 'No data'
    : labels.length === 1 ? labels[0]
    : `${labels[0]} – ${labels[labels.length-1]}`

  return {
    giving:      { contributions, merchandiseRevenue, otherIncome },
    budget:      { contributions: budContrib, merchandiseRevenue: budMerch, otherIncome: budOther, staff: budStaff, contract: budContract, technology: budTech, travel: budTravel, otherGenAdmin: Math.max(0,budOtherExp) },
    priorYear:   { contributions: pyContributions, merchandiseRevenue: pyMerchandiseRevenue, otherIncome: pyOtherIncome, expenses: pyExpenses },
    expenseLines:{ staff, contract, technology, travel, otherGenAdmin },
    cash,
    forecast:    { contributions: budContrib, merchandiseRevenue: budMerch, otherIncome: budOther },
    patrons,
    monthsInRange: months.length,
    rangeLabel,
  }
}

// BUDGET_SCENARIOS removed — populated from AppContext.availableScenarios

// ─────────────────────────────────────────────────────────────────────────────
// P&L Account-level drill-down — populated dynamically from actuals/budget
// ─────────────────────────────────────────────────────────────────────────────

// Empty fallback — used when real data not yet computed
const PL_ACCOUNTS = {
  'contributions': [],
  'merch':         [],
  'other-inc':     [],
  'staff':         [],
  'contract':      [],
  'technology':    [],
  'travel':        [],
  'other-exp':     [],
}

// Category keyword lists — mirror filterELTByRange + AppContext derivedIncomeMonths
const _MERCH_W    = ['merch', 'merchandise', 'store', 'product', 'retail', 'wholesale']
const _OTHER_W    = ['other', 'misc', 'miscellaneous', 'licensing', 'royalt', 'speaking']
const _STAFF_W    = ['staff','payroll','salaries','compensation']
const _CONTRACT_W = ['contract','professional services','consulting','legal']
const _TECH_W     = ['software','computers','technology','infrastructure','hosting']
const _TRAVEL_W   = ['travel','lodging','meals','transportation']
const _ALL_EXP_W  = [..._STAFF_W, ..._CONTRACT_W, ..._TECH_W, ..._TRAVEL_W]

function _catMatch(cat, words) {
  const c = (cat || '').toLowerCase()
  return words.some(w => c.includes(w))
}

/**
 * Compute account-level rows for each P&L category.
 * Groups transactions by account name, proportionally allocates category budget.
 *
 * @param {Array}  actuals       from AppContext (v_transactions_enriched)
 * @param {Object} catBudgets    { 'contributions': N, 'merch': N, … } — category budgets from d.budget
 * @param {Object} dateRange     { startDate, endDate }
 * @returns {Object}  { categoryId: [{label, actual, budget}] }
 */
function computePLAccounts(actuals, catBudgets, dateRange) {
  const startP = (dateRange.startDate || '').substring(0, 7)
  const endP   = (dateRange.endDate   || '').substring(0, 7)

  // Split actuals into income and expense rows in range
  const incActuals = actuals.filter(t => {
    const p = t.period || (t.date ? t.date.substring(0, 7) : null)
    return p && p >= startP && p <= endP && t.record_type === 'income'
  })
  const expActuals = actuals.filter(t => {
    const p = t.period || (t.date ? t.date.substring(0, 7) : null)
    return p && p >= startP && p <= endP && t.record_type !== 'income'
  })

  // Build account rows from a set of transactions + a category budget total
  function makeAcctRows(txs, catBudget, isIncome) {
    const map = {}
    for (const t of txs) {
      const acct = t.account || t.account_name || 'Unassigned'
      map[acct] = (map[acct] || 0) + (isIncome ? Math.abs(t.amount || 0) : (t.amount || 0))
    }
    const totalActual = Object.values(map).reduce((s, v) => s + v, 0)
    return Object.entries(map)
      .filter(([, actual]) => actual > 0)
      .map(([label, actual]) => ({
        label,
        actual,
        // Proportional budget allocation: account's share of category actual × category budget
        budget: totalActual > 0 ? (catBudget || 0) * (actual / totalActual) : 0,
      }))
      .sort((a, b) => b.actual - a.actual)
  }

  // Income: split into Contributions / Merch / Other by keyword
  const contribTx  = incActuals.filter(t => !_catMatch(t.category, _MERCH_W) && !_catMatch(t.category, _OTHER_W))
  const merchTx    = incActuals.filter(t =>  _catMatch(t.category, _MERCH_W))
  const otherIncTx = incActuals.filter(t => !_catMatch(t.category, _MERCH_W) &&  _catMatch(t.category, _OTHER_W))

  // Expenses: split by category buckets (same as filterELTByRange)
  const staffTx    = expActuals.filter(t => _catMatch(t.category, _STAFF_W))
  const contractTx = expActuals.filter(t => _catMatch(t.category, _CONTRACT_W) && !_catMatch(t.category, _STAFF_W))
  const techTx     = expActuals.filter(t => _catMatch(t.category, _TECH_W) && !_catMatch(t.category, _STAFF_W) && !_catMatch(t.category, _CONTRACT_W))
  const travelTx   = expActuals.filter(t => _catMatch(t.category, _TRAVEL_W))
  const otherExpTx = expActuals.filter(t => !_catMatch(t.category, _ALL_EXP_W))

  return {
    'contributions': makeAcctRows(contribTx,  catBudgets.contributions || 0, true),
    'merch':         makeAcctRows(merchTx,     catBudgets.merch         || 0, true),
    'other-inc':     makeAcctRows(otherIncTx,  catBudgets['other-inc']  || 0, true),
    'staff':         makeAcctRows(staffTx,     catBudgets.staff         || 0, false),
    'contract':      makeAcctRows(contractTx,  catBudgets.contract      || 0, false),
    'technology':    makeAcctRows(techTx,      catBudgets.technology    || 0, false),
    'travel':        makeAcctRows(travelTx,    catBudgets.travel        || 0, false),
    'other-exp':     makeAcctRows(otherExpTx,  catBudgets['other-exp']  || 0, false),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Mock Data + Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_CATEGORIES = [
  { key: 'staff',        label: 'Staff & Benefits',     color: '#00B3E5' },
  { key: 'contract',     label: 'Contract Services',    color: '#E8A838' },
  { key: 'technology',   label: 'Technology',            color: '#C05A2F' },
  { key: 'travel',       label: 'Travel & Expense',      color: '#D98F1C' },
  { key: 'marketing',    label: 'Marketing',             color: '#2A7B8C' },
  { key: 'facilities',   label: 'Facilities',            color: '#4E6B3A' },
  { key: 'supplies',     label: 'Supplies & Materials',  color: '#7A8A3E' },
  { key: 'training',     label: 'Training & Dev',        color: '#4A2E5A' },
  { key: 'other',        label: 'Uncategorized',         color: '#9BA8B5' },
]
const TEAM_CAT_MAP = Object.fromEntries(TEAM_CATEGORIES.map(c => [c.key, c]))

const SPREADS = {
  flat:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  front: [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9],
  back:  [0.6, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6],
}
const TEAM_MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May']

function teamMonthly(cats, spreadKey = 'flat') {
  // cats: { catKey: { budget: N, actual: N, priorYear: N }, ... }
  const sp = SPREADS[spreadKey] || SPREADS.flat
  const norm = sp.reduce((s, x) => s + x, 0)
  return TEAM_MONTHS.map((month, i) => {
    const obj = { month }
    let total = 0
    Object.entries(cats).forEach(([key, cat]) => {
      const val = Math.round(cat.actual * sp[i] / norm)
      obj[key] = val
      total += val
    })
    obj.total = total
    return obj
  })
}

// Account-level breakdown per category key — shares must sum to 1
const TEAM_CAT_ACCOUNTS = {
  staff: [
    { key: 'salaries',   label: 'Salaries & Wages',        share: 0.65 },
    { key: 'benefits',   label: 'Benefits & Payroll Tax',  share: 0.18 },
    { key: 'contractor', label: 'Contract Staff (Aug)',     share: 0.17 },
  ],
  contract: [
    { key: 'creative',   label: 'Creative & Production',   share: 0.48 },
    { key: 'legal',      label: 'Legal & Professional',    share: 0.32 },
    { key: 'consulting', label: 'Consulting',               share: 0.20 },
  ],
  technology: [
    { key: 'software',   label: 'Software Subscriptions',  share: 0.44 },
    { key: 'infra',      label: 'Infrastructure & Hosting',share: 0.34 },
    { key: 'hardware',   label: 'Hardware & Equipment',     share: 0.22 },
  ],
  travel: [
    { key: 'domestic',   label: 'Domestic Travel',         share: 0.55 },
    { key: 'intl',       label: 'International Travel',    share: 0.28 },
    { key: 'lodging',    label: 'Lodging & Meals',         share: 0.17 },
  ],
  marketing: [
    { key: 'digital',    label: 'Digital Advertising',     share: 0.52 },
    { key: 'print',      label: 'Print & Collateral',      share: 0.28 },
    { key: 'events-mkt', label: 'Events & Sponsorships',   share: 0.20 },
  ],
  facilities: [
    { key: 'rent',       label: 'Rent & Lease',            share: 0.60 },
    { key: 'utilities',  label: 'Utilities',                share: 0.25 },
    { key: 'maintenance',label: 'Maintenance & Repairs',   share: 0.15 },
  ],
  supplies: [
    { key: 'office',     label: 'Office Supplies',         share: 0.45 },
    { key: 'production', label: 'Production Materials',    share: 0.35 },
    { key: 'shipping',   label: 'Shipping & Postage',      share: 0.20 },
  ],
  training: [
    { key: 'courses',    label: 'Courses & Certifications',share: 0.55 },
    { key: 'conferences',label: 'Conferences & Seminars',  share: 0.30 },
    { key: 'books',      label: 'Books & Resources',       share: 0.15 },
  ],
}

// Generate monthly data for a single account within a category
function accountMonthly(catKey, annualActual, accountShare, spreadKey = 'flat') {
  const sp   = SPREADS[spreadKey] || SPREADS.flat
  const norm = sp.reduce((s, x) => s + x, 0)
  const accountTotal = annualActual * accountShare
  return TEAM_MONTHS.map((month, i) => ({
    month,
    value: Math.round(accountTotal * sp[i] / norm),
  }))
}

// 19 fictional teams — all numbers are illustrative demo data
const TEAMS_MOCK = [
  { id:'EXE', name:'Executive Leadership',       manager:'Sarah Chen',
    actual:945_000, budget:980_000,
    cats:{ staff:{budget:750_000,actual:720_000,priorYear:680_000}, contract:{budget:80_000,actual:95_000,priorYear:70_000}, technology:{budget:45_000,actual:42_000,priorYear:40_000}, travel:{budget:65_000,actual:58_000,priorYear:62_000}, training:{budget:40_000,actual:30_000,priorYear:28_000} }, spreadKey:'flat' },
  { id:'FIN', name:'Finance & Accounting',       manager:'Mike Torres',
    actual:508_000, budget:520_000,
    cats:{ staff:{budget:420_000,actual:410_000,priorYear:385_000}, contract:{budget:50_000,actual:52_000,priorYear:45_000}, technology:{budget:30_000,actual:28_000,priorYear:26_000}, training:{budget:20_000,actual:18_000,priorYear:16_000} }, spreadKey:'flat' },
  { id:'HR',  name:'Human Resources',            manager:'Lisa Park',
    actual:401_000, budget:380_000,
    cats:{ staff:{budget:280_000,actual:298_000,priorYear:260_000}, contract:{budget:60_000,actual:68_000,priorYear:55_000}, technology:{budget:20_000,actual:18_000,priorYear:17_000}, training:{budget:20_000,actual:17_000,priorYear:14_000} }, spreadKey:'flat' },
  { id:'IT',  name:'Information Technology',     manager:'David Nguyen',
    actual:698_000, budget:720_000,
    cats:{ staff:{budget:480_000,actual:460_000,priorYear:430_000}, contract:{budget:120_000,actual:128_000,priorYear:110_000}, technology:{budget:80_000,actual:72_000,priorYear:68_000}, training:{budget:40_000,actual:38_000,priorYear:34_000} }, spreadKey:'front' },
  { id:'MKT', name:'Marketing & Communications', manager:'Emma Johnson',
    actual:685_000, budget:640_000,
    cats:{ staff:{budget:420_000,actual:440_000,priorYear:390_000}, marketing:{budget:140_000,actual:168_000,priorYear:125_000}, contract:{budget:50_000,actual:52_000,priorYear:46_000}, technology:{budget:30_000,actual:25_000,priorYear:22_000} }, spreadKey:'back' },
  { id:'CPD', name:'Content Production',         manager:'James Wright',
    actual:1_198_000, budget:1_240_000,
    cats:{ staff:{budget:820_000,actual:792_000,priorYear:740_000}, contract:{budget:240_000,actual:258_000,priorYear:218_000}, technology:{budget:100_000,actual:94_000,priorYear:88_000}, travel:{budget:40_000,actual:32_000,priorYear:36_000}, supplies:{budget:40_000,actual:22_000,priorYear:18_000} }, spreadKey:'flat' },
  { id:'CRD', name:'Creative Design',            manager:'Aria Santos',
    actual:462_000, budget:480_000,
    cats:{ staff:{budget:360_000,actual:348_000,priorYear:320_000}, contract:{budget:60_000,actual:68_000,priorYear:55_000}, technology:{budget:40_000,actual:36_000,priorYear:32_000}, supplies:{budget:20_000,actual:10_000,priorYear:9_000} }, spreadKey:'flat' },
  { id:'VPD', name:'Video Production',           manager:'Chris Huang',
    actual:932_000, budget:890_000,
    cats:{ staff:{budget:580_000,actual:608_000,priorYear:540_000}, contract:{budget:160_000,actual:178_000,priorYear:148_000}, technology:{budget:90_000,actual:94_000,priorYear:82_000}, supplies:{budget:60_000,actual:52_000,priorYear:48_000} }, spreadKey:'back' },
  { id:'POD', name:'Podcast & Audio',            manager:'Kate Reyes',
    actual:295_000, budget:320_000,
    cats:{ staff:{budget:220_000,actual:208_000,priorYear:195_000}, contract:{budget:50_000,actual:48_000,priorYear:44_000}, technology:{budget:30_000,actual:28_000,priorYear:25_000}, supplies:{budget:20_000,actual:11_000,priorYear:10_000} }, spreadKey:'flat' },
  { id:'DPT', name:'Digital Platform',           manager:'Nathan Kim',
    actual:812_000, budget:780_000,
    cats:{ staff:{budget:520_000,actual:548_000,priorYear:480_000}, contract:{budget:140_000,actual:158_000,priorYear:128_000}, technology:{budget:100_000,actual:92_000,priorYear:85_000}, training:{budget:20_000,actual:14_000,priorYear:12_000} }, spreadKey:'front' },
  { id:'TRS', name:'Translation & Localization', manager:'Sofia Andrade',
    actual:541_000, budget:560_000,
    cats:{ staff:{budget:360_000,actual:348_000,priorYear:320_000}, contract:{budget:160_000,actual:158_000,priorYear:145_000}, technology:{budget:20_000,actual:18_000,priorYear:16_000}, travel:{budget:20_000,actual:17_000,priorYear:15_000} }, spreadKey:'flat' },
  { id:'CME', name:'Community Engagement',       manager:'Jordan Lee',
    actual:362_000, budget:340_000,
    cats:{ staff:{budget:240_000,actual:258_000,priorYear:220_000}, marketing:{budget:60_000,actual:72_000,priorYear:55_000}, contract:{budget:20_000,actual:18_000,priorYear:16_000}, travel:{budget:20_000,actual:14_000,priorYear:12_000} }, spreadKey:'back' },
  { id:'PRT', name:'Partnerships & Outreach',    manager:'Mia Okonkwo',
    actual:278_000, budget:290_000,
    cats:{ staff:{budget:200_000,actual:192_000,priorYear:178_000}, marketing:{budget:50_000,actual:52_000,priorYear:45_000}, travel:{budget:25_000,actual:22_000,priorYear:20_000}, training:{budget:15_000,actual:12_000,priorYear:10_000} }, spreadKey:'flat' },
  { id:'EVT', name:'Events & Conferences',       manager:'Tyler Brooks',
    actual:448_000, budget:420_000,
    cats:{ staff:{budget:200_000,actual:210_000,priorYear:185_000}, contract:{budget:100_000,actual:118_000,priorYear:90_000}, facilities:{budget:80_000,actual:92_000,priorYear:72_000}, travel:{budget:40_000,actual:28_000,priorYear:25_000} }, spreadKey:'back' },
  { id:'CSP', name:'Customer Support',           manager:'Rachel Gomez',
    actual:298_000, budget:310_000,
    cats:{ staff:{budget:250_000,actual:242_000,priorYear:225_000}, technology:{budget:35_000,actual:34_000,priorYear:30_000}, training:{budget:25_000,actual:22_000,priorYear:19_000} }, spreadKey:'flat' },
  { id:'DAA', name:'Data & Analytics',           manager:'Ben Patel',
    actual:371_000, budget:380_000,
    cats:{ staff:{budget:280_000,actual:272_000,priorYear:252_000}, contract:{budget:60_000,actual:64_000,priorYear:55_000}, technology:{budget:40_000,actual:35_000,priorYear:32_000} }, spreadKey:'front' },
  { id:'LGL', name:'Legal & Compliance',         manager:'Diana Foster',
    actual:253_000, budget:260_000,
    cats:{ staff:{budget:180_000,actual:174_000,priorYear:162_000}, contract:{budget:60_000,actual:62_000,priorYear:55_000}, training:{budget:20_000,actual:17_000,priorYear:15_000} }, spreadKey:'flat' },
  { id:'FAC', name:'Facilities & Operations',    manager:'Marcus Webb',
    actual:435_000, budget:440_000,
    cats:{ staff:{budget:280_000,actual:272_000,priorYear:255_000}, facilities:{budget:100_000,actual:108_000,priorYear:92_000}, supplies:{budget:40_000,actual:38_000,priorYear:34_000}, contract:{budget:20_000,actual:17_000,priorYear:15_000} }, spreadKey:'flat' },
  { id:'STR', name:'Strategic Initiatives',      manager:'Priya Sharma',
    actual:558_000, budget:520_000,
    cats:{ staff:{budget:300_000,actual:322_000,priorYear:278_000}, contract:{budget:120_000,actual:138_000,priorYear:108_000}, marketing:{budget:60_000,actual:68_000,priorYear:52_000}, travel:{budget:40_000,actual:30_000,priorYear:28_000} }, spreadKey:'back' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }
function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}` }
function monthName(m) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1] }

function getELTPresetRange(preset, org) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const fy = org.fiscalYearStartMonth, fyYear = org.fiscalYearStartYear
  const oy = org.operatingYearStartMonth, oyYear = org.operatingYearStartYear

  if (preset === 'full-fiscal') {
    const endYear = fy === 1 ? fyYear : fyYear + 1, endMonth = fy === 1 ? 12 : fy - 1
    return { startDate: ymd(fyYear, fy, 1), endDate: ymd(endYear, endMonth, new Date(endYear, endMonth, 0).getDate()) }
  }
  if (preset === 'fiscal-ytd')      return { startDate: ymd(fyYear, fy, 1), endDate: todayStr }
  if (preset === 'full-operating') {
    const endYear = oy === 1 ? oyYear : oyYear + 1, endMonth = oy === 1 ? 12 : oy - 1
    return { startDate: ymd(oyYear, oy, 1), endDate: ymd(endYear, endMonth, new Date(endYear, endMonth, 0).getDate()) }
  }
  if (preset === 'operating-ytd')   return { startDate: ymd(oyYear, oy, 1), endDate: todayStr }
  if (preset === 'last-month') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, 1), endDate: ymd(today.getFullYear(), today.getMonth(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()) }
  }
  if (preset === 'last-3') { const d = new Date(today); d.setMonth(d.getMonth() - 3); return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr } }
  if (preset === 'last-6') { const d = new Date(today); d.setMonth(d.getMonth() - 6); return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr } }
  if (preset === 'last-12') { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); return { startDate: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), endDate: todayStr } }
  return { startDate: ymd(fyYear, fy, 1), endDate: todayStr }
}

function presetLabel(preset) {
  return { 'full-fiscal':'Full fiscal year','fiscal-ytd':'Fiscal YTD','full-operating':'Full operating year','operating-ytd':'Operating YTD','last-month':'Last month','last-3':'Last 3 months','last-6':'Last 6 months','last-12':'Last 12 months','custom':'Custom range' }[preset] || 'Reporting period'
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker
// ─────────────────────────────────────────────────────────────────────────────

function ELTDateRangePicker({ dateRange, org, onApplyPreset, onApplyCustom, onClose }) {
  const [localStart, setLocalStart] = useState(dateRange.startDate)
  const [localEnd,   setLocalEnd]   = useState(dateRange.endDate)
  const days = localStart && localEnd ? daysBetween(localStart, localEnd) : 0

  const fy = org.fiscalYearStartMonth, fyY = org.fiscalYearStartYear
  const oy = org.operatingYearStartMonth, oyY = org.operatingYearStartYear
  const fyeY = fy===1?fyY:fyY+1, fyeM = fy===1?12:fy-1
  const oyeY = oy===1?oyY:oyY+1, oyeM = oy===1?12:oy-1

  const btn = (id, label, sub) => (
    <button key={id} onClick={() => { onApplyPreset(id); onClose() }}
      className={`text-left px-3 py-2 rounded-lg border transition-all ${dateRange.preset===id?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-800 border-gray-200 hover:border-gray-400'}`}>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-[10px] uppercase tracking-wide mt-0.5 opacity-60">{sub}</div>}
    </button>
  )

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Reporting Period</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Fiscal Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('full-fiscal','Full fiscal year',`${monthName(fy)} ${fyY} → ${monthName(fyeM)} ${fyeY}`)}
        {btn('fiscal-ytd','Fiscal YTD',`${monthName(fy)} ${fyY} → Today`)}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Operating Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('full-operating','Full operating year',`${monthName(oy)} ${oyY} → ${monthName(oyeM)} ${oyeY}`)}
        {btn('operating-ytd','Operating YTD',`${monthName(oy)} ${oyY} → Today`)}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Rolling</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('last-month','Last month','')} {btn('last-3','Last 3 months','')}
        {btn('last-6','Last 6 months','')} {btn('last-12','Last 12 months','')}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">From</div>
          <input type="date" value={localStart} onChange={e=>setLocalStart(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-500"/></div>
        <div><div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">To</div>
          <input type="date" value={localEnd} onChange={e=>setLocalEnd(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-500"/></div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{days>0?`${days} days selected`:''}</span>
        <button onClick={() => { if(localStart&&localEnd&&localStart<=localEnd){onApplyCustom(localStart,localEnd);onClose()} }}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{backgroundColor:'var(--color-primary)'}}>Apply</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Nav
// ─────────────────────────────────────────────────────────────────────────────

const ELT_TABS = [
  {id:'dashboard',label:'Dashboard'},{id:'summary',label:'Summary'},
  {id:'teams',label:'Teams'},{id:'documents',label:'Documents'},{id:'comments',label:'Comments & Requests'},
]

function ELTNav({ orgConfig, activeTab, setActiveTab, dateRange, onApplyPreset, onApplyCustom, activeBudget, onSetBudget }) {
  const { availableScenarios } = useApp()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showBudgetPicker, setShowBudgetPicker] = useState(false)
  const pickerRef = useRef(null)
  const budgetPickerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) { if(pickerRef.current&&!pickerRef.current.contains(e.target)) setShowDatePicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => {
    function handle(e) { if(budgetPickerRef.current&&!budgetPickerRef.current.contains(e.target)) setShowBudgetPicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-6 gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor: orgConfig?.primaryColor || 'var(--color-primary)'}}>
            {orgConfig.logoInitial}
          </div>
          <span className="text-sm font-semibold text-gray-800">{orgConfig.name}</span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm font-medium text-gray-500">Executive Overview</span>
        </div>
        <nav className="flex-1 flex justify-center">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
            {ELT_TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeTab===tab.id?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:text-gray-900'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="relative flex-shrink-0" ref={pickerRef}>
          <button onClick={() => setShowDatePicker(v=>!v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">REPORTING PERIOD</span>
            <span>{presetLabel(dateRange.preset)}</span>
            <ChevronDown size={12} className="text-gray-400"/>
          </button>
          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 z-50">
              <ELTDateRangePicker dateRange={dateRange} org={orgConfig} onApplyPreset={onApplyPreset} onApplyCustom={onApplyCustom} onClose={() => setShowDatePicker(false)}/>
            </div>
          )}
        </div>
        {/* Budget Scenario Selector */}
        <div className="relative flex-shrink-0 ml-2" ref={budgetPickerRef}>
          <button onClick={() => setShowBudgetPicker(v=>!v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">BUDGET SCENARIO</span>
            <span className="max-w-[120px] truncate">{activeBudget || 'Budget'}</span>
            <ChevronDown size={12} className="text-gray-400"/>
          </button>
          {showBudgetPicker && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Budget Scenario</div>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">Select which budget to compare actuals against. Import additional budgets in the Finance dashboard.</p>
              <div className="space-y-1">
                {availableScenarios.length === 0
                  ? <p className="text-xs text-gray-400 italic">No budget imported yet.</p>
                  : availableScenarios.map(s => (
                    <button key={s} onClick={()=>{ onSetBudget(s); setShowBudgetPicker(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all text-sm ${activeBudget===s ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-800 border-gray-200 bg-white hover:border-gray-400'}`}>
                      {s}
                    </button>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Variance helpers
// ─────────────────────────────────────────────────────────────────────────────

function varColor(delta, inverse=false) {
  if (!delta) return 'text-gray-500'
  const pos = delta > 0
  if (inverse) return pos ? 'text-red-600' : 'text-emerald-600'
  return pos ? 'text-emerald-600' : 'text-red-600'
}
function varBg(delta, inverse=false) {
  if (!delta) return 'bg-gray-100 text-gray-500'
  const pos = delta > 0
  if (inverse) return pos ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
  return pos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
}
function TrendBadge({ delta, inverse=false, label }) {
  const Icon = delta>0?TrendingUp:delta<0?TrendingDown:Minus
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${varBg(delta,inverse)}`}><Icon size={11}/>{label}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card (dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ title, value, cmp1Label, cmp1Value, cmp1Delta, cmp1Pct, cmp2Label, cmp2Value, cmp2Delta, cmp2Pct, inverse=false, onRemove, editMode, topBorderColor=null }) {
  return (
    <div className="relative rounded-xl p-6 flex-1 min-w-[220px]"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.06)',
        borderTopWidth: topBorderColor ? '3px' : '1px',
        borderTopColor: topBorderColor || 'rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
      }}>
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{color:'#6B7384'}}>{title}</div>
      <div className="font-bold text-gray-900 mb-4" style={{fontSize:'36px'}}>{value}</div>
      <div className="space-y-2.5">
        {cmp1Label && <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{color:'#9CA3AF'}}>{cmp1Label}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp1Delta} inverse={inverse} label={cmp1Pct}/>
            <span className="text-sm font-semibold" style={{color: (inverse ? cmp1Delta<=0 : cmp1Delta>=0) ? STATUS_COLORS.positive : STATUS_COLORS.negative}}>{cmp1Delta>0?'+':''}{formatCurrency(cmp1Delta)}</span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp1Value)}</span>
          </div>
        </div>}
        {cmp2Label && <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{color:'#9CA3AF'}}>{cmp2Label}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp2Delta} inverse={inverse} label={cmp2Pct}/>
            <span className="text-sm font-semibold" style={{color: (inverse ? cmp2Delta<=0 : cmp2Delta>=0) ? STATUS_COLORS.positive : STATUS_COLORS.negative}}>{cmp2Delta>0?'+':''}{formatCurrency(cmp2Delta)}</span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp2Value)}</span>
          </div>
        </div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual KPI Card — editable after creation
// ─────────────────────────────────────────────────────────────────────────────

// Parse a user-entered value string → number (strips $, commas, %, spaces)
function parseMetric(str) {
  if (!str) return null
  const n = parseFloat(String(str).replace(/[$,%\s]/g,'').replace(/,/g,''))
  return isNaN(n) ? null : n
}

function ManualKPICard({ card, editMode, onRemove, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(card)
  useEffect(() => { setDraft(card) }, [card])

  function cancel() { setEditing(false); setDraft(card) }
  function save()   { onEdit({ ...card, ...draft }); setEditing(false) }

  // Compute variance rows from parsed numbers when possible
  const mainNum  = parseMetric(card.value)
  const cmp1Num  = parseMetric(card.cmp1Value)
  const cmp2Num  = parseMetric(card.cmp2Value)
  const delta1   = (mainNum !== null && cmp1Num !== null) ? mainNum - cmp1Num : null
  const delta2   = (mainNum !== null && cmp2Num !== null) ? mainNum - cmp2Num : null
  const pct1     = (delta1 !== null && cmp1Num !== 0) ? formatPercent(delta1 / cmp1Num * 100, { showSign:true, decimals:1 }) : null
  const pct2     = (delta2 !== null && cmp2Num !== 0) ? formatPercent(delta2 / cmp2Num * 100, { showSign:true, decimals:1 }) : null

  const fields = [
    ['Card Label', 'label'], ['Primary Value', 'value'],
    ['Comparison 1 Label', 'cmp1Label'], ['Comparison 1 Value', 'cmp1Value'],
    ['Comparison 2 Label', 'cmp2Label'], ['Comparison 2 Value', 'cmp2Value'],
  ]

  if (editing) {
    return (
      <div className="relative bg-white rounded-2xl border-2 shadow-sm p-5 flex-1 min-w-[240px] space-y-2.5" style={{borderColor:'var(--color-primary)'}}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:'var(--neutral-60)'}}>Editing Card</span>
          <button onClick={cancel} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
        </div>
        {fields.map(([lbl, key]) => (
          <div key={key}>
            <label className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">{lbl}</label>
            <input value={draft[key]||''} onChange={e=>setDraft(p=>({...p,[key]:e.target.value}))}
              placeholder={lbl} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
          </div>
        ))}
        <p className="text-[9px] text-gray-400">Tip: Enter numeric values (e.g. $1,250,000) to auto-calculate % variance.</p>
        <button onClick={save} className="w-full py-2 rounded-lg text-sm font-medium text-white" style={{backgroundColor:'var(--color-primary)'}}>
          Save Changes
        </button>
      </div>
    )
  }

  function CmpRow({ label, delta, pct, cmpValue }) {
    if (!label) return null
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{label}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {pct && delta !== null ? (
            <>
              <TrendBadge delta={delta} label={pct}/>
              <span className={`text-sm font-semibold ${varColor(delta)}`}>{delta>0?'+':''}{formatCurrency(delta)}</span>
              {cmpValue && <span className="text-xs text-gray-400">vs {cmpValue}</span>}
            </>
          ) : (
            <span className="text-sm font-semibold text-gray-700">{cmpValue || '—'}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-white rounded-xl p-6 flex-1 min-w-[220px]" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
      {editMode && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={()=>setEditing(true)} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-500 flex items-center justify-center transition-colors" title="Edit card">
            <Pencil size={9}/>
          </button>
          <button onClick={onRemove} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Remove">
            <X size={9}/>
          </button>
        </div>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>{card.label || 'Custom KPI'}</div>
      <div className="text-3xl font-bold text-gray-900 mb-4">{card.value || '—'}</div>
      {(card.cmp1Label || card.cmp2Label) && (
        <div className="space-y-2.5">
          <CmpRow label={card.cmp1Label} delta={delta1} pct={pct1} cmpValue={card.cmp1Value}/>
          <CmpRow label={card.cmp2Label} delta={delta2} pct={pct2} cmpValue={card.cmp2Value}/>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Net Position Card
// ─────────────────────────────────────────────────────────────────────────────

function NetPositionCard({ value, cmp1Delta, cmp1Pct, cmp1Value, cmp2Delta, cmp2Pct, cmp2Value, breakdown, editMode, onRemove }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const isPositive = value >= 0
  const accentColor  = isPositive ? '#4CAF82' : '#FF6B6B'
  const borderColor  = isPositive ? STATUS_COLORS.positive : STATUS_COLORS.negative
  const badgeLabel   = isPositive ? 'Surplus' : 'Deficit'
  const badgeBg      = isPositive ? 'rgba(61,153,112,0.25)'  : 'rgba(192,57,43,0.25)'
  const badgeBorder  = isPositive ? 'rgba(61,153,112,0.4)'   : 'rgba(192,57,43,0.4)'
  const shadowColor  = isPositive ? 'rgba(61,153,112,0.15)'  : 'rgba(192,57,43,0.15)'
  function deltaColor(d) { return d > 0 ? '#4CAF82' : d < 0 ? '#FF6B6B' : 'rgba(255,255,255,0.4)' }

  return (
    <div className="relative w-full rounded-xl"
      style={{
        backgroundColor: '#1a1f2e',
        borderLeft: `5px solid ${borderColor}`,
        border: `1px solid rgba(255,255,255,0.06)`,
        borderLeftWidth: '5px',
        borderLeftColor: borderColor,
        boxShadow: `0 4px 20px ${shadowColor}`,
        padding: '28px 32px',
      }}>
      {editMode && onRemove && (
        <button onClick={onRemove} className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
          style={{backgroundColor:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)'}}>
          <X size={11}/>
        </button>
      )}

      {/* Header row: label left, badge right */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{color:'#6B7384'}}>
            Net Position YTD
          </div>
          <div className="relative" onMouseEnter={()=>setShowBreakdown(true)} onMouseLeave={()=>setShowBreakdown(false)}>
            <Info size={12} style={{color:'rgba(255,255,255,0.2)'}} className="cursor-help"/>
            {showBreakdown && (
              <div className="absolute left-0 top-5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Breakdown</div>
                {breakdown.lines.map((line,i) => (
                  <div key={i} className={`flex justify-between py-1 ${line.isTotal?'border-t border-gray-200 mt-1 pt-2 font-semibold':''} ${line.isSubtract?'text-red-600':'text-gray-700'}`}>
                    <span className="text-xs">{line.label}</span>
                    <span className="text-xs font-medium tabular-nums">{line.isSubtract?'−':''}{formatCurrency(line.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1.5 border-t-2 border-gray-800 mt-2 pt-2">
                  <span className="text-xs font-bold text-gray-900">Net Position</span>
                  <span className="text-xs font-bold text-gray-900 tabular-nums">{formatCurrency(value)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1 rounded-full"
          style={{backgroundColor: badgeBg, color: accentColor, border: `1px solid ${badgeBorder}`}}>
          {badgeLabel}
        </span>
      </div>

      {/* Big value */}
      <div className="font-bold mb-5 leading-none" style={{color: accentColor, fontSize: '52px'}}>{formatCurrency(value)}</div>

      {/* Comparisons */}
      <div className="flex gap-8 flex-wrap">
        {[
          {label:'vs Forecast',   delta:cmp1Delta, pct:cmp1Pct, base:cmp1Value},
          {label:'vs Prior Year', delta:cmp2Delta, pct:cmp2Pct, base:cmp2Value},
        ].map(({label,delta,pct,base})=>(
          <div key={label}>
            <div className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{color:'#6B7384'}}>{label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{backgroundColor:'rgba(255,255,255,0.08)',color:deltaColor(delta)}}>
                {delta>0?<TrendingUp size={11}/>:delta<0?<TrendingDown size={11}/>:<Minus size={11}/>}
                {pct}
              </span>
              <span className="text-sm font-semibold" style={{color:deltaColor(delta)}}>
                {delta>0?'+':''}{formatCurrency(delta)}
              </span>
              <span className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>vs {formatCurrency(base)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly KPI Card — matches Dashboard KPICard format exactly
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyKPICard({ title, actual, budget, priorYear, inverse=false, editMode, onRemove, onEdit }) {
  const d1 = actual - budget
  const d2 = actual - priorYear
  const p1 = budget   > 0 ? formatPercent(d1 / budget   * 100, { showSign: true, decimals: 1 }) : '—'
  const p2 = priorYear > 0 ? formatPercent(d2 / priorYear * 100, { showSign: true, decimals: 1 }) : '—'

  return (
    <div className="relative bg-white rounded-xl p-4 flex-1 min-w-[170px] max-w-[240px]" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
      {editMode && onRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11}/>
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>{title}</div>

      {editMode ? (
        <div className="space-y-2.5 mt-2">
          {[['Actual','actual',actual],['Budget','budget',budget],['Prior Year','priorYear',priorYear]].map(([lbl,field,val])=>(
            <div key={field} className="flex items-center gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-20 flex-shrink-0">{lbl}</label>
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                <input type="number" value={val} onChange={e=>onEdit(field, +e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-5 pr-2 py-1.5 text-sm focus:outline-none focus:border-gray-400 tabular-nums"/>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="text-3xl font-bold text-gray-900 mb-4">{formatCurrency(actual)}</div>
          <div className="space-y-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">vs Budget</div>
              <div className="flex items-center gap-2 flex-wrap">
                <TrendBadge delta={d1} inverse={inverse} label={p1}/>
                <span className={`text-sm font-semibold ${varColor(d1, inverse)}`}>{d1>0?'+':''}{formatCurrency(d1)}</span>
                <span className="text-xs text-gray-400">vs {formatCurrency(budget)}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">vs Prior Year</div>
              <div className="flex items-center gap-2 flex-wrap">
                <TrendBadge delta={d2} inverse={false} label={p2}/>
                <span className={`text-sm font-semibold ${varColor(d2, false)}`}>{d2>0?'+':''}{formatCurrency(d2)}</span>
                <span className="text-xs text-gray-400">vs {formatCurrency(priorYear)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI & Chart Catalogs
// ─────────────────────────────────────────────────────────────────────────────

const KPI_CATALOG = [
  { group: 'Giving & Revenue', items: [
    { id:'giving',       label:'Total Giving YTD',        description:'Contributions + secondary revenue vs forecast & prior year' },
    { id:'contributions',label:'Contributions Only',      description:'Direct supporter giving vs budget & prior year' },
    { id:'avg-gift',     label:'Avg Gift Size',           description:'Average supporter contribution amount vs prior year' },
    { id:'new-patrons',  label:'New Supporters (Period)', description:'New supporters this period vs prior period' },
    { id:'total-patrons',label:'Total Active Supporters', description:'Active supporter count with month/year comparisons' },
    { id:'retention',    label:'Supporter Retention',     description:'Active supporters as % of prior year base' },
  ]},
  { group: 'Expenses & Operations', items: [
    { id:'expenses',     label:'Expenses YTD',            description:'Total expenses vs budget & prior year' },
    { id:'top-expense',  label:'Top Expense Category',    description:'Largest spending category this period' },
    { id:'budget-pct',   label:'Budget Utilization',      description:'% of annual budget consumed YTD' },
    { id:'mom-change',   label:'Month-over-Month Change', description:'Giving or expense change vs prior month' },
    { id:'staff-ratio',  label:'Staff Cost Ratio',        description:'Staff expenses as % of total income' },
  ]},
  { group: 'Net & Cash', items: [
    { id:'net-position', label:'Net Position YTD',        description:'Giving minus expenses with forecast & prior year' },
    { id:'cash',         label:'Cash Position',           description:'Current cash vs prior month & prior year' },
    { id:'reserves',     label:'Operating Reserves',      description:'Months of operating expenses covered by reserves' },
    { id:'runway',       label:'Cash Runway',             description:'Estimated months of operations at current burn rate' },
  ]},
]

// KPI_DATA_AVAILABLE — used by AddCardPanel to flag live-wired cards
const KPI_DATA_AVAILABLE = new Set([
  'giving','expenses','net-position','cash',
  'total-patrons','new-patrons','avg-gift','retention','recurring-ratio',
])

const PATRON_KPI_CATALOG = [
  { group: 'Supporter Metrics', items: [
    { id:'total-patrons',   label:'Total Active Supporters',  description:'Active supporter count vs prior month & year' },
    { id:'new-patrons',     label:'New Supporters (Period)',  description:'New supporters this period vs prior period' },
    { id:'avg-gift',        label:'Avg Gift Size',            description:'Average supporter contribution vs prior year' },
    { id:'retention',       label:'Supporter Retention Rate', description:'YoY active supporter retention %' },
    { id:'recurring-ratio', label:'Recurring Mix %',          description:'Recurring supporters as % of total base' },
  ]},
]

const MONTHLY_SUGGESTED_KPI = [
  { id: 'monthly-giving',   label: 'Monthly Giving',   description: 'Total giving for selected month vs budget & prior year' },
  { id: 'monthly-expenses', label: 'Monthly Expenses', description: 'Total expenses for selected month vs budget & prior year' },
  { id: 'monthly-net',      label: 'Monthly Net',      description: 'Net position for selected month vs budget & prior year' },
  { id: 'monthly-cash',     label: 'Month-End Cash',   description: 'Cash on hand at month-end vs prior month' },
  { id: 'monthly-supporters', label: 'Monthly Supporters', description: 'Active supporter count vs prior month & prior year' },
]

// ─────────────────────────────────────────────────────────────────────────────
// AddCardPanel — Library + Manual entry tabs
// ─────────────────────────────────────────────────────────────────────────────

function AddCardPanel({ title, catalog, suggestedCards, existingIds, onAdd, onClose, isChart=false }) {
  const [mode, setMode] = useState('library')
  const [manualLabel, setManualLabel]   = useState('')
  const [manualValue, setManualValue]   = useState('')
  const [manualCmp1L, setManualCmp1L]   = useState('')
  const [manualCmp1V, setManualCmp1V]   = useState('')
  const [manualCmp2L, setManualCmp2L]   = useState('')
  const [manualCmp2V, setManualCmp2V]   = useState('')
  const [addVariance, setAddVariance]   = useState(false)

  const flatCatalog = catalog ? catalog.flatMap(g => g.items) : (suggestedCards || [])
  const available = flatCatalog.filter(c => !existingIds.includes(c.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[460px] max-h-[82vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>

        {!isChart && (
          <div className="flex items-center gap-1 mx-5 mt-4 bg-gray-100 rounded-full p-1">
            {['library','manual'].map(m=>(
              <button key={m} onClick={()=>setMode(m)} className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${mode===m?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>
                {m==='library' ? <span className="flex items-center justify-center gap-1.5"><BookOpen size={11}/> Library</span>
                              : <span className="flex items-center justify-center gap-1.5"><SlidersHorizontal size={11}/> Manual Entry</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(mode === 'library' || isChart) ? (
            catalog ? catalog.map(group => {
              const groupAvailable = group.items.filter(c => !existingIds.includes(c.id))
              if (groupAvailable.length === 0) return null
              return (
                <div key={group.group}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--neutral-60)'}}>{group.group}</div>
                  <div className="space-y-1.5">
                    {groupAvailable.map(card=>{
                      const hasData = KPI_DATA_AVAILABLE.has(card.id)
                      return (
                      <button key={card.id} onClick={()=>{onAdd(card);onClose()}} className={`w-full text-left px-4 py-3 rounded-xl border transition-all group ${hasData ? 'border-gray-100 hover:bg-gray-50 hover:border-gray-200' : 'border-gray-100 hover:bg-amber-50/50 hover:border-amber-200/50'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">{card.label}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{card.description}</div>
                            {!hasData && <div className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mt-1">No data connected yet</div>}
                          </div>
                          <Plus size={14} className="text-gray-300 group-hover:text-gray-600 flex-shrink-0"/>
                        </div>
                      </button>
                    )})}
                  </div>
                </div>
              )
            }) : (
              <div className="space-y-1.5">
                {available.length===0 && <p className="text-sm text-gray-400 text-center py-4">All cards already added.</p>}
                {available.map(card=>(
                  <button key={card.id} onClick={()=>{onAdd(card);onClose()}} className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all group">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{card.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{card.description}</div>
                      </div>
                      <Plus size={14} className="text-gray-300 group-hover:text-gray-600 flex-shrink-0"/>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            /* Manual entry mode */
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Card Label</label>
                <input type="text" value={manualLabel} onChange={e=>setManualLabel(e.target.value)}
                  placeholder="e.g. Reserve Fund Balance"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Primary Value</label>
                <input type="text" value={manualValue} onChange={e=>setManualValue(e.target.value)}
                  placeholder="e.g. $1,250,000 or 94.5%"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-500"/>
              </div>
              <button onClick={()=>setAddVariance(v=>!v)}
                className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${addVariance ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                <Plus size={11}/> {addVariance ? 'Remove variance rows' : 'Add variance rows (optional)'}
              </button>
              {addVariance && (
                <div className="space-y-3 pl-3 border-l-2 border-gray-100">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Comparison 1 Label</label>
                    <input type="text" value={manualCmp1L} onChange={e=>setManualCmp1L(e.target.value)} placeholder="e.g. vs Budget"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Comparison 1 Value</label>
                    <input type="text" value={manualCmp1V} onChange={e=>setManualCmp1V(e.target.value)} placeholder="e.g. $1,200,000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Comparison 2 Label (optional)</label>
                    <input type="text" value={manualCmp2L} onChange={e=>setManualCmp2L(e.target.value)} placeholder="e.g. vs Prior Year"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Comparison 2 Value (optional)</label>
                    <input type="text" value={manualCmp2V} onChange={e=>setManualCmp2V(e.target.value)} placeholder="e.g. $1,100,000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"/>
                  </div>
                </div>
              )}
              <button
                onClick={()=>{
                  if(!manualLabel.trim()) return
                  onAdd({ id:'manual-'+Date.now(), label:manualLabel, value:manualValue,
                    cmp1Label:manualCmp1L||null, cmp1Value:manualCmp1V||null,
                    cmp2Label:manualCmp2L||null, cmp2Value:manualCmp2V||null, manual:true })
                  onClose()
                }}
                disabled={!manualLabel.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                style={{backgroundColor:'var(--color-primary)'}}>
                Add Card
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section label with BibleProject styling
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children, color }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color: color || 'var(--ink-900)'}}>{children}</span>
      <div className="flex-1 border-t border-gray-200"/>
    </div>
  )
}

function SectionHeader({ title, editMode, onToggleEdit, onAdd, showAdd=true }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap" style={{color:'#6B7384'}}>{title}</h2>
      <div className="flex-1 h-px" style={{backgroundColor:'rgba(0,0,0,0.08)'}}/>
      <div className="flex items-center gap-2 flex-shrink-0">
        {editMode && showAdd && (
          <button onClick={onAdd} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white" style={{backgroundColor:'var(--color-primary)'}}>
            <Plus size={11}/> Add card
          </button>
        )}
        <button onClick={onToggleEdit} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editMode?'bg-gray-900 text-white':'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
          {editMode?<><Check size={12}/> Done</>:<><Pencil size={12}/> Edit</>}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Type Toggle
// ─────────────────────────────────────────────────────────────────────────────

function ChartTypeToggle({ type, onChange }) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-full p-0.5">
      {['line','area','bar'].map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${type===t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P&L Table
// ─────────────────────────────────────────────────────────────────────────────

function PLTable({ data, accounts = PL_ACCOUNTS, rangeLabel = 'Year-to-date', warnItems = {} }) {
  const [expanded, setExpanded] = useState(new Set())
  function toggle(id) { setExpanded(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n }) }

  const totalIncome = data.find(r=>r.id==='total-income')?.actual || 1

  function VarCell({ actual, budget, isExpense, isTotal, dark }) {
    const variance = (actual??0)-(budget??0)
    const pos = isExpense ? variance<=0 : variance>=0
    const col = isTotal ? (pos?'text-emerald-400':'text-red-400') : (pos?'text-emerald-600':'text-red-600')
    return <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${col}`}>
      {actual!==undefined ? (variance>=0?'+':'')+formatCurrency(variance,{compact:false}) : '—'}
    </td>
  }

  const rows = []
  data.forEach((row, i) => {
    const isSection  = row.type==='section'
    const isSubtotal = row.type==='subtotal'
    const isTotal    = row.type==='total'
    const isSpacer   = row.type==='spacer'
    const isExpense  = row.group==='expense'
    const hasAccts   = !!(accounts[row.id]?.length)
    const isExpanded = expanded.has(row.id)

    if (isSpacer) { rows.push(<tr key={`sp${i}`}><td colSpan={5} className="py-1.5"/></tr>); return }

    rows.push(
      <tr key={row.id||i}
        className={`border-b border-gray-50 transition-colors
          ${isSection  ? 'bg-gray-50' : ''}
          ${isTotal    ? 'bg-gray-900' : ''}
          ${isSubtotal ? 'bg-gray-50' : ''}
          ${!isSection&&!isSubtotal&&!isTotal&&!hasAccts ? 'hover:bg-gray-50' : ''}
          ${hasAccts ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={hasAccts ? ()=>toggle(row.id) : undefined}>
        <td className={`px-6 py-2.5
          ${isSection  ? 'text-[10px] font-semibold uppercase tracking-widest text-gray-400' : ''}
          ${isSubtotal ? 'font-semibold text-gray-700 pl-6' : ''}
          ${isTotal    ? 'font-bold text-white' : ''}
          ${!isSection&&!isSubtotal&&!isTotal ? 'text-gray-700 pl-10' : ''}`}>
          <div className="flex items-center gap-1.5">
            {hasAccts && (
              <span className={`transition-transform duration-150 text-gray-400 ${isExpanded?'rotate-90':''}`}>
                <ChevronRight size={12}/>
              </span>
            )}
            <span>{row.label}</span>
            {hasAccts && !isExpanded && (
              <span className="text-[9px] font-medium text-gray-400 ml-1">{accounts[row.id].length} accounts</span>
            )}
          </div>
        </td>
        {isSection ? <td colSpan={4}/> : (
          <>
            <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${isTotal?'text-white':isSubtotal?'text-gray-800':'text-gray-700'}`}>
              {row.actual!==undefined ? formatCurrency(row.actual,{compact:false}) : '—'}
            </td>
            <td className={`px-4 py-2.5 text-right tabular-nums ${isTotal?'text-gray-300':'text-gray-500'}`}>
              {row.budget!==undefined ? formatCurrency(row.budget,{compact:false}) : '—'}
            </td>
            <VarCell actual={row.actual} budget={row.budget} isExpense={isExpense} isTotal={isTotal}/>
            <td className={`px-6 py-2.5 text-right tabular-nums text-xs ${isTotal?'text-gray-300':'text-gray-400'}`}>
              {row.actual!==undefined && !isSection && !isTotal && !isSubtotal ? (
                <div className="flex items-center justify-end gap-2">
                  <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden flex-shrink-0">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min((row.actual/totalIncome*100)/100*100, 100)}%`,
                      backgroundColor: PL_ROW_COLORS[row.id] || 'var(--neutral-40)',
                    }}/>
                  </div>
                  <span className="text-gray-400 tabular-nums w-10 text-right">{formatPercent(row.actual/totalIncome*100,{decimals:1})}</span>
                </div>
              ) : isTotal ? (
                <span className="text-xs text-gray-300 italic">{formatPercent((totalIncome - (data.find(r=>r.id==='total-expenses')?.actual||0))/totalIncome*100,{decimals:1})} margin</span>
              ) : ''}
            </td>
          </>
        )}
      </tr>
    )

    // Account sub-rows (only when expanded)
    if (hasAccts && isExpanded) {
      accounts[row.id].forEach((acct, ai) => {
        const av = acct.actual - acct.budget
        const pos = isExpense ? av<=0 : av>=0
        rows.push(
          <tr key={`${row.id}-acct-${ai}`} className="border-b border-gray-50 bg-gray-50/40 hover:bg-gray-50 transition-colors">
            <td className="pl-14 pr-6 py-2 text-xs text-gray-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"/>
                {acct.label}
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-600">{formatCurrency(acct.actual,{compact:false})}</td>
            <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-400">{formatCurrency(acct.budget,{compact:false})}</td>
            <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium ${pos?'text-emerald-600':'text-red-600'}`}>
              {av>=0?'+':''}{formatCurrency(av,{compact:false})}
            </td>
            <td className="px-6 py-2 text-right tabular-nums text-xs text-gray-300">
              {formatPercent(acct.actual/totalIncome*100,{decimals:1})}
            </td>
          </tr>
        )
      })
    }
  })

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Profit & Loss</h2>
          <p className="text-xs text-gray-400 mt-0.5">{rangeLabel} · Actual vs. budget · Click a category row to expand accounts</p>
        </div>
        <button onClick={()=>{
            // Only expand rows that actually have account data
            const expandable = Object.entries(accounts).filter(([,v])=>v.length>0).map(([k])=>k)
            setExpanded(prev=>prev.size>0?new Set():new Set(expandable))
          }}
          className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          {expanded.size>0?<><ChevronUp size={12}/> Collapse all</>:<><ChevronDown size={12}/> Expand all</>}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 w-72">Line Item</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Actual</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Budget</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Variance</th>
              <th className="text-right px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">% of Income</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
      {/* Unresolved warnings — shown below the P&L table when data issues exist */}
      {Object.values(warnItems).some(v => (v?.actual || 0) + (v?.budget || 0) > 0) && (
        <div className="px-6 py-4 border-t border-gray-100">
          <UnresolvedSection warnMap={warnItems}/>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Patron cards (dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function PatronMetricCard({ label, mainValue, sub1Label, sub1Delta, sub1Base, sub1Format, sub2Label, sub2Delta, sub2Base, sub2Format, editMode, onRemove }) {
  function fmtDelta(delta, fmt) {
    if (delta === null || delta === undefined) return '—'
    const sign = delta > 0 ? '+' : ''
    if (fmt === 'currency') return sign + formatCurrency(delta)
    if (fmt === 'count')    return sign + Math.abs(delta).toLocaleString()
    if (fmt === 'percent')  return formatPercent(delta, { showSign: true, decimals: 1 })
    return sign + delta
  }
  function fmtBase(base, fmt) {
    if (base === null || base === undefined) return null
    if (fmt === 'currency') return formatCurrency(base)
    if (fmt === 'count')    return base.toLocaleString()
    return String(base)
  }
  function pct(delta, base) {
    if (delta === null || !base) return null
    return formatPercent(delta / base * 100, { showSign: true, decimals: 1 })
  }

  const p1 = sub1Format === 'percent' ? null : pct(sub1Delta, sub1Base)
  const p2 = sub2Format === 'percent' ? null : pct(sub2Delta, sub2Base)
  const b1 = fmtBase(sub1Base, sub1Format)
  const b2 = fmtBase(sub2Base, sub2Format)

  return (
    <div className="relative bg-white rounded-xl p-6 flex-1 min-w-[220px]" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>{label}</div>
      <div className="text-3xl font-bold text-gray-900 mb-4">{mainValue}</div>
      <div className="space-y-2.5">
        {sub1Label && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{sub1Label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {sub1Format === 'percent' ? (
                <TrendBadge delta={sub1Delta} label={fmtDelta(sub1Delta, 'percent')}/>
              ) : p1 ? (
                <><TrendBadge delta={sub1Delta} label={p1}/>
                <span className={`text-sm font-semibold ${varColor(sub1Delta)}`}>{fmtDelta(sub1Delta, sub1Format)}</span>
                {b1 && <span className="text-xs text-gray-400">vs {b1}</span>}</>
              ) : (
                <span className={`text-sm font-semibold ${varColor(sub1Delta)}`}>{fmtDelta(sub1Delta, sub1Format)}</span>
              )}
            </div>
          </div>
        )}
        {sub2Label && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{sub2Label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {sub2Format === 'percent' ? (
                <TrendBadge delta={sub2Delta} label={fmtDelta(sub2Delta, 'percent')}/>
              ) : p2 ? (
                <><TrendBadge delta={sub2Delta} label={p2}/>
                <span className={`text-sm font-semibold ${varColor(sub2Delta)}`}>{fmtDelta(sub2Delta, sub2Format)}</span>
                {b2 && <span className="text-xs text-gray-400">vs {b2}</span>}</>
              ) : (
                <span className={`text-sm font-semibold ${varColor(sub2Delta)}`}>{fmtDelta(sub2Delta, sub2Format)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const TOOLTIP_STYLE = { backgroundColor:'#fff', border:'1px solid var(--neutral-10)', borderRadius:'10px', fontSize:'12px', boxShadow:'0 4px 16px rgba(24,20,14,0.10)' }

// Chart 1: New Supporters by Month — year-over-year comparison, live from patron_data
function NewPatronChartCard({ patronData, dateRange, chartType='line', editMode=false, onChangeType, onRemove }) {
  // Build YoY dataset: x-axis = months Jan–Dec, one line per calendar year
  const chartData = useMemo(() => {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const byYear = {}
    for (const row of patronData) {
      if (!row.period) continue
      const [yr, mo] = row.period.split('-')
      if (!byYear[yr]) byYear[yr] = {}
      byYear[yr][parseInt(mo)] = row.new_patrons_total || 0
    }
    const years = Object.keys(byYear).sort()
    return MONTHS.map((m, i) => {
      const row = { month: m }
      for (const yr of years) row[`y${yr}`] = byYear[yr]?.[i + 1] ?? null
      return row
    })
  }, [patronData])

  const years = useMemo(() => {
    const yrSet = new Set()
    for (const row of patronData) { if (row.period) yrSet.add(row.period.slice(0, 4)) }
    return [...yrSet].sort()
  }, [patronData])

  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
  const xa   = <XAxis dataKey="month" tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const ya   = <YAxis tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const tip  = <Tooltip contentStyle={TOOLTIP_STYLE}/>
  const leg  = <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px'}}/>
  const common = { data: chartData, margin:{top:5,right:5,left:-20,bottom:0} }
  const noData = chartData.every(r => years.every(yr => r[`y${yr}`] == null))

  function renderLines() {
    return years.map((yr,i) => {
      const color = yearColor(yr), isCurr = i === years.length - 1
      return { line: <Line key={yr} type="monotone" dataKey={`y${yr}`} name={yr} stroke={color}
        strokeWidth={isCurr?2.5:1.8} dot={false} activeDot={isCurr?{r:4}:false}
        strokeDasharray={isCurr?undefined:'5 3'} opacity={isCurr?1:0.7} connectNulls={false}/>,
        area: <Area key={yr} type="monotone" dataKey={`y${yr}`} name={yr} stroke={color}
          fill={color} fillOpacity={isCurr?0.15:0.07} strokeWidth={isCurr?2:1.5} dot={false} connectNulls={false}/>,
        bar: <Bar key={yr} dataKey={`y${yr}`} name={yr} fill={color} radius={[3,3,0,0]} opacity={isCurr?1:0.6}/>,
      }
    })
  }

  return (
    <div className="relative bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',marginBottom:'16px'}}>
      {editMode && <button onClick={onRemove} className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-0.5">New Supporters by Month</div>
          <div className="text-[10px] text-gray-400">Year-over-year comparison</div>
        </div>
        {editMode && <ChartTypeToggle type={chartType} onChange={onChangeType}/>}
      </div>
      {noData
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No patron data imported yet</div>
        : <ResponsiveContainer width="100%" height={200}>
            {chartType === 'bar'
              ? <BarChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderLines().map(r=>r.bar)}</BarChart>
              : chartType === 'area'
              ? <AreaChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderLines().map(r=>r.area)}</AreaChart>
              : <LineChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderLines().map(r=>r.line)}</LineChart>
            }
          </ResponsiveContainer>
      }
    </div>
  )
}

// Chart 2: Monthly Supporter Base — recurring_patron_count by period
function PatronBaseChartCard({ patronData, dateRange, chartType='bar', editMode=false, onChangeType, onRemove }) {
  const { startDate, endDate } = dateRange
  const startP = startDate.slice(0,7), endP = endDate.slice(0,7)

  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a,b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        const label = new Date(parseInt(y), parseInt(m)-1, 1).toLocaleString('en-US', {month:'short'})
        return { label, count: r.recurring_patron_count || 0 }
      })
  , [patronData, startP, endP])

  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
  const xa   = <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const ya   = <YAxis tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const tip  = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>[v.toLocaleString(),'Patrons']}/>
  const common = { data: chartData, margin:{top:5,right:5,left:-20,bottom:0} }

  return (
    <div className="relative bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',marginBottom:'16px'}}>
      {editMode && <button onClick={onRemove} className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-0.5">Monthly Supporter Base</div>
          <div className="text-[10px] text-gray-400">Recurring patrons in range</div>
        </div>
        {editMode && <ChartTypeToggle type={chartType} onChange={onChangeType}/>}
      </div>
      {chartData.length === 0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No patron data in range</div>
        : <ResponsiveContainer width="100%" height={200}>
            {chartType === 'line'
              ? <LineChart {...common}>{grid}{xa}{ya}{tip}<Line type="monotone" dataKey="count" name="Patrons" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{r:4}}/></LineChart>
              : chartType === 'area'
              ? <AreaChart {...common}>{grid}{xa}{ya}{tip}<Area type="monotone" dataKey="count" name="Patrons" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} strokeWidth={2} dot={false}/></AreaChart>
              : <BarChart {...common}>{grid}{xa}{ya}{tip}<Bar dataKey="count" name="Patrons" fill="var(--color-primary)" radius={[4,4,0,0]}/></BarChart>
            }
          </ResponsiveContainer>
      }
    </div>
  )
}

// Chart 3: Monthly Giving vs Budget — income actual vs budget, with cumulative toggle
function MonthlyGivingVsBudgetCard({ actuals, budgetFlat, scenario, dateRange, chartType='line', editMode=false, onChangeType, onRemove }) {
  const [mode, setMode] = useState('monthly')
  const { startDate, endDate } = dateRange
  const startP = startDate.slice(0,7), endP = endDate.slice(0,7)

  const chartData = useMemo(() => {
    const incActuals = actuals.filter(t => {
      const p = t.period || (t.date ? t.date.slice(0,7) : null)
      return p && p >= startP && p <= endP && t.record_type === 'income'
    })
    // Apply the same period filter to income budget as to expense budget —
    // without this, ALL income budget rows across all years are summed.
    const incBudget = budgetFlat.filter(b =>
      b.scenario === scenario &&
      b.record_type === 'income' &&
      b.period && b.period >= startP && b.period <= endP
    )

    const actualByP = {}, budgetByP = {}
    for (const t of incActuals) {
      const p = t.period || (t.date ? t.date.slice(0,7) : null); if (!p) continue
      actualByP[p] = (actualByP[p] || 0) + Math.abs(t.amount || 0)
    }
    for (const b of incBudget) {
      if (b.period) budgetByP[b.period] = (budgetByP[b.period] || 0) + Math.abs(b.amount || 0)
    }

    const periods = [...new Set([...Object.keys(actualByP), ...Object.keys(budgetByP)])]
      .filter(p => p >= startP && p <= endP).sort()

    let cumA = 0, cumB = 0
    return periods.map(p => {
      const [y, m] = p.split('-')
      const label = new Date(parseInt(y), parseInt(m)-1, 1).toLocaleString('en-US', {month:'short'})
      const a = actualByP[p] || 0, b = budgetByP[p] || 0
      cumA += a; cumB += b
      return { label, actual: mode === 'cumulative' ? cumA : a, budget: mode === 'cumulative' ? cumB : b }
    })
  }, [actuals, budgetFlat, scenario, startDate, endDate, startP, endP, mode])

  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
  const xa   = <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const ya   = <YAxis tick={{fontSize:10,fill:'var(--chart-tick)'}} tickFormatter={v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v}`} axisLine={false} tickLine={false}/>
  const tip  = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v,n)=>[formatCurrency(v,{compact:true}),n]}/>
  const leg  = <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px'}}/>
  const common = { data: chartData, margin:{top:5,right:5,left:0,bottom:0} }

  function renderSeries(type) {
    if (type === 'bar') return <>
      <Bar dataKey="actual" name="Actual" fill="var(--color-primary)" radius={[4,4,0,0]}/>
      <Bar dataKey="budget" name="Budget" fill="#E8A838" radius={[4,4,0,0]} opacity={0.7}/>
    </>
    if (type === 'area') return <>
      <Area type="monotone" dataKey="actual" name="Actual" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} strokeWidth={2} dot={false}/>
      <Area type="monotone" dataKey="budget" name="Budget" stroke="#E8A838" fill="#E8A838" fillOpacity={0.1} strokeWidth={2} strokeDasharray="6 3" dot={false}/>
    </>
    return <>
      <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{r:4}}/>
      <Line type="monotone" dataKey="budget" name="Budget" stroke="#E8A838" strokeWidth={2} strokeDasharray="6 3" dot={false}/>
    </>
  }

  return (
    <div className="relative bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',marginBottom:'16px'}}>
      {editMode && <button onClick={onRemove} className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-0.5">Monthly Giving vs Budget</div>
          <div className="text-[10px] text-gray-400">Actual income vs {scenario||'budget'}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editMode && <ChartTypeToggle type={chartType} onChange={onChangeType}/>}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {['monthly','cumulative'].map(m=>(
              <button key={m} onClick={()=>setMode(m)}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${mode===m?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
                {m==='monthly'?'Mo':'Cu'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {chartData.length === 0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No data in range</div>
        : <ResponsiveContainer width="100%" height={200}>
            {chartType === 'bar'
              ? <BarChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderSeries('bar')}</BarChart>
              : chartType === 'area'
              ? <AreaChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderSeries('area')}</AreaChart>
              : <LineChart {...common}>{grid}{xa}{ya}{tip}{leg}{renderSeries('line')}</LineChart>
            }
          </ResponsiveContainer>
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Summary Tab — full narrative document
// ─────────────────────────────────────────────────────────────────────────────

const WATCH_STATUSES = {
  'needs-attention': { label: 'NEEDS ATTENTION', pill: 'bg-red-100 text-red-700 border border-red-200' },
  'monitoring':      { label: 'MONITORING',       pill: 'bg-sky-100 text-sky-700 border border-sky-200' },
  'on-track':        { label: 'ON TRACK',          pill: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
}

function EditableArea({ value, onChange, editMode, className='', rows=3, placeholder='' }) {
  if (!editMode) return (
    <div className={`whitespace-pre-wrap ${className}`}>{value || <span className="text-gray-300 italic">{placeholder}</span>}</div>
  )
  return (
    <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className={`w-full bg-transparent resize-none focus:outline-none border-b border-dashed border-gray-300 focus:border-gray-500 ${className}`}/>
  )
}

function EditableTitle({ value, onChange, editMode, className='' }) {
  if (!editMode) return <div className={className}>{value}</div>
  return (
    <textarea value={value} onChange={e=>onChange(e.target.value)} rows={3}
      className={`w-full bg-transparent resize-none focus:outline-none border-b border-dashed border-gray-300 focus:border-gray-500 ${className}`}/>
  )
}

function RollingQuoteSection() {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i+1)%ROLLING_QUOTES.length); setVisible(true) }, 600)
    }, 6000)
    return () => clearInterval(t)
  }, [])
  const q = ROLLING_QUOTES[idx]
  return (
    <div className="py-10 px-6 text-center rounded-2xl my-4" style={{backgroundColor:'var(--color-primary-light,#F2D5C8)'}}>
      <div style={{ transition: 'opacity 0.5s ease', opacity: visible ? 1 : 0 }}>
        <p className="text-lg font-medium text-gray-800 italic leading-relaxed">"{q.text}"</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>{q.author}</p>
      </div>
    </div>
  )
}

function highlightNumbers(text) {
  if (!text) return text
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?[MKB]?|\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/g)
  return parts.map((p,i) => /^(\$[\d,]+(?:\.\d+)?[MKB]?|\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)$/.test(p)
    ? <span key={i} style={{color:'var(--color-primary)'}}>{p}</span> : p)
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Summary helpers
// ─────────────────────────────────────────────────────────────────────────────

/** "April 2026" → "2026-04" */
function monthLabelToPeriod(label) {
  if (!label) return null
  const d = new Date('1 ' + label)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Format a dollar amount as e.g. "$10.6M", "$340K", "$12,400" */
function fmtDollars(n) {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toLocaleString()}`
}

/** Build aggregated AI context from actuals + budgetFlat for the given period */
function buildAIContext({ period, actuals, budgetFlat, activeBudget, orgConfig, cashData = [] }) {
  if (!period) return null

  // ── Current month P&L ──────────────────────────────────────────────────────
  const monthActuals = actuals.filter(t => (t.period || '').startsWith(period))
  const monthBudgets = budgetFlat.filter(b =>
    (b.period || '').startsWith(period) && (!activeBudget || b.scenario === activeBudget)
  )

  // Aggregate by record_type + category
  // Income amounts are stored as positive in the DB; ensure they remain positive here.
  const monthlySummary = {}
  for (const t of monthActuals) {
    const key = `${t.record_type}|${t.category || 'Uncategorized'}`
    if (!monthlySummary[key]) monthlySummary[key] = { record_type: t.record_type, category: t.category || 'Uncategorized', actual: 0, budget: 0 }
    monthlySummary[key].actual += t.record_type === 'income' ? Math.abs(t.amount || 0) : Math.abs(t.amount || 0)
  }
  for (const b of monthBudgets) {
    const key = `${b.record_type}|${b.category || 'Uncategorized'}`
    if (!monthlySummary[key]) monthlySummary[key] = { record_type: b.record_type, category: b.category || 'Uncategorized', actual: 0, budget: 0 }
    monthlySummary[key].budget += Math.abs(b.amount || 0)
  }

  // ── YTD P&L ────────────────────────────────────────────────────────────────
  const [yr, mo] = period.split('-').map(Number)
  const fyM  = orgConfig.fiscalYearStartMonth  || 10
  const fyYr = orgConfig.fiscalYearStartYear   || yr
  const fyStart = `${fyYr}-${String(fyM).padStart(2, '0')}`

  const ytdActuals = actuals.filter(t => {
    const p = t.period || ''
    return p >= fyStart && p <= period
  })
  const ytdBudgets = budgetFlat.filter(b => {
    const p = b.period || ''
    return p >= fyStart && p <= period && (!activeBudget || b.scenario === activeBudget)
  })

  const ytdSummary = {}
  for (const t of ytdActuals) {
    const key = `${t.record_type}|${t.category || 'Uncategorized'}`
    if (!ytdSummary[key]) ytdSummary[key] = { record_type: t.record_type, category: t.category || 'Uncategorized', actual: 0, budget: 0 }
    ytdSummary[key].actual += Math.abs(t.amount || 0)
  }
  for (const b of ytdBudgets) {
    const key = `${b.record_type}|${b.category || 'Uncategorized'}`
    if (!ytdSummary[key]) ytdSummary[key] = { record_type: b.record_type, category: b.category || 'Uncategorized', actual: 0, budget: 0 }
    ytdSummary[key].budget += Math.abs(b.amount || 0)
  }

  // ── Prior year same period ─────────────────────────────────────────────────
  const priorYearPeriod = `${yr - 1}-${String(mo).padStart(2, '0')}`
  const priorActuals = actuals.filter(t => (t.period || '').startsWith(priorYearPeriod))
  const priorSummary = {}
  for (const t of priorActuals) {
    const key = `${t.record_type}|${t.category || 'Uncategorized'}`
    if (!priorSummary[key]) priorSummary[key] = { record_type: t.record_type, category: t.category || 'Uncategorized', actual: 0 }
    priorSummary[key].actual += Math.abs(t.amount || 0)
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const monthRows  = Object.values(monthlySummary)
  const ytdRows    = Object.values(ytdSummary)

  const totalIncome   = monthRows.filter(r => r.record_type === 'income').reduce((s, r) => s + r.actual, 0)
  const totalExpenses = monthRows.filter(r => r.record_type === 'expense').reduce((s, r) => s + r.actual, 0)
  const totalIncBudget = monthRows.filter(r => r.record_type === 'income').reduce((s, r) => s + r.budget, 0)
  const totalExpBudget = monthRows.filter(r => r.record_type === 'expense').reduce((s, r) => s + r.budget, 0)

  const ytdTotalIncome   = ytdRows.filter(r => r.record_type === 'income').reduce((s, r) => s + r.actual, 0)
  const ytdTotalExpenses = ytdRows.filter(r => r.record_type === 'expense').reduce((s, r) => s + r.actual, 0)
  const ytdTotalIncBudget = ytdRows.filter(r => r.record_type === 'income').reduce((s, r) => s + r.budget, 0)
  const ytdTotalExpBudget = ytdRows.filter(r => r.record_type === 'expense').reduce((s, r) => s + r.budget, 0)

  // Fiscal month index (1-based)
  const fiscalMonthIndex = ((yr - fyYr) * 12 + mo - fyM + 12) % 12 + 1

  // ── Format rows for prompt ─────────────────────────────────────────────────
  function formatRows(rows) {
    return rows
      .sort((a, b) => b.actual - a.actual)
      .map(r => {
        const varAmt = r.actual - r.budget
        const varPct = r.budget !== 0 ? Math.round((varAmt / r.budget) * 100) : null
        return {
          type:     r.record_type,
          category: r.category,
          actual:   fmtDollars(r.actual),
          budget:   r.budget ? fmtDollars(r.budget) : 'no budget',
          variance: r.budget ? `${fmtDollars(varAmt)} (${varPct}%)` : 'n/a',
        }
      })
  }

  return {
    period,
    monthLabel: new Date(yr, mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    fiscalYearStart: fyStart,
    fiscalMonthIndex,
    orgName: orgConfig.name || 'the organization',
    materialityThreshold: orgConfig.materialityThreshold ?? 0.10,
    currentMonth: {
      rows: formatRows(monthRows),
      totalIncome:    fmtDollars(totalIncome),
      totalExpenses:  fmtDollars(totalExpenses),
      totalIncBudget: fmtDollars(totalIncBudget),
      totalExpBudget: fmtDollars(totalExpBudget),
      netActual:      fmtDollars(totalIncome - totalExpenses),
      netBudget:      fmtDollars(totalIncBudget - totalExpBudget),
    },
    ytd: {
      rows: formatRows(ytdRows),
      totalIncome:    fmtDollars(ytdTotalIncome),
      totalExpenses:  fmtDollars(ytdTotalExpenses),
      totalIncBudget: fmtDollars(ytdTotalIncBudget),
      totalExpBudget: fmtDollars(ytdTotalExpBudget),
      netActual:      fmtDollars(ytdTotalIncome - ytdTotalExpenses),
      netBudget:      fmtDollars(ytdTotalIncBudget - ytdTotalExpBudget),
    },
    priorYear: {
      rows: formatRows(Object.values(priorSummary)),
    },
    // Raw numbers for watch area materiality checks
    _totals: { totalIncome, totalExpenses, materialityThreshold: orgConfig.materialityThreshold ?? 0.10 },
    // Cash flow data for the Reserves section
    cash: (() => {
      if (!cashData?.length) return null
      const cashRow = cashData.find(r => r.period === period)
        || [...cashData].sort((a,b) => b.period.localeCompare(a.period))[0]
      if (!cashRow) return null
      const [pYr, pMo] = period.split('-').map(Number)
      const priorPeriod = pMo === 1
        ? `${pYr-1}-12`
        : `${pYr}-${String(pMo-1).padStart(2,'0')}`
      const priorRow = cashData.find(r => r.period === priorPeriod)
      const balance        = cashRow.cash_balance       || 0
      const priorBalance   = priorRow?.cash_balance ?? (cashRow.prior_month_balance || 0)
      const annualExpenses = (ytdTotalExpenses / Math.max(1, fiscalMonthIndex)) * 12
      const monthlyAvg     = annualExpenses / 12
      return {
        balance,
        reserveFloor:    cashRow.reserve_floor      || 0,
        aboveFloor:      cashRow.cash_above_floor   || 0,
        priorBalance,
        momChange:       balance - priorBalance,
        monthlyAvg,
        monthsCovered:   monthlyAvg > 0 ? +(balance / monthlyAvg).toFixed(1) : null,
      }
    })(),
  }
}

/** Build the API prompt for a given section + context */
function buildSectionPrompt(section, ctx) {
  const monthStr = ctx.monthLabel
  const fyStart  = ctx.fiscalYearStart.replace('-', '/')
  const monthNum = ctx.fiscalMonthIndex
  const orgName  = ctx.orgName
  const threshold = Math.round(ctx.materialityThreshold * 100)

  const currentMonthData  = JSON.stringify(ctx.currentMonth, null, 2)
  const ytdData           = JSON.stringify(ctx.ytd,          null, 2)
  const priorYearData     = JSON.stringify(ctx.priorYear,    null, 2)

  if (section === 'overall') {
    return `You are a financial writer for a nonprofit organization. Write a monthly financial summary in plain, direct language for organizational leaders. Avoid corporate jargon. Be specific with numbers. Write with confidence but not arrogance.

Here is the financial data for ${monthStr}:

CURRENT MONTH:
${currentMonthData}

FISCAL YEAR TO DATE (${fyStart} through ${ctx.period}):
${ytdData}

PRIOR YEAR SAME PERIOD:
${priorYearData}

ORG NAME: ${orgName}

Write two things:
1. A bold one-sentence headline that captures the month's overall financial story. Be direct and specific. Example style: "A steady month. Giving is strong, expenses disciplined, and we're ahead of plan."

2. A narrative paragraph (3-5 sentences) that explains:
   - How far into the fiscal year we are (month ${monthNum} of 12) and what the overall position looks like
   - How giving/income is tracking vs budget with the key driver
   - How expenses are tracking vs budget
   - What the net position means in plain terms

Return as JSON: {"headline": "...", "narrative": "..."}
Return only the JSON object, no other text.`
  }

  if (section === 'takeaways') {
    return `You are a financial analyst for a nonprofit. Write 3-5 key takeaways for organizational leaders based on this financial data. Each takeaway should have a bold headline and 1-2 sentences of explanation. Use specific numbers. Be direct. Prioritize what matters most to mission-driven leaders: are we healthy, are we growing, are we sustainable?

FINANCIAL DATA:
CURRENT MONTH:
${currentMonthData}

FISCAL YEAR TO DATE:
${ytdData}

PRIOR YEAR:
${priorYearData}

ORG NAME: ${orgName}
MONTH: ${monthStr}
FISCAL YEAR POSITION: Month ${monthNum} of 12

Questions to answer through the takeaways:
- What is driving performance?
- Where are we vs where we expected to be?
- What trends are visible in the data?
- Are we in a healthy, strong, or concerning position?

Return as JSON:
{
  "takeaways": [
    {"headline": "...", "body": "..."},
    {"headline": "...", "body": "..."}
  ]
}
Return only the JSON object, no other text.`
  }

  if (section === 'watchAreas') {
    const ti  = ctx._totals.totalIncome
    const te  = ctx._totals.totalExpenses
    const thr = ctx._totals.materialityThreshold
    return `You are a financial analyst for a nonprofit. Identify 3-5 watch areas for organizational leaders. These are the most important financial signals — positive and negative — that leaders need to be aware of.

MATERIALITY THRESHOLD: ${threshold}% of total org budget.
Only flag items that represent at least ${threshold}% of total income or total expenses. Do not flag minor line items.

FINANCIAL DATA:
CURRENT MONTH:
${currentMonthData}

FISCAL YEAR TO DATE:
${ytdData}

PRIOR YEAR:
${priorYearData}

TOTAL INCOME (current month): ${fmtDollars(ti)}
TOTAL EXPENSES (current month): ${fmtDollars(te)}
MATERIALITY FLOOR (income): ${fmtDollars(ti * thr)}
MATERIALITY FLOOR (expenses): ${fmtDollars(te * thr)}

Generate exactly 3-5 watch areas. Prioritize the most important.
Each watch area must:
- Have a status: "needs-attention", "monitoring", or "on-track"
- Have a title (one short sentence)
- Have a body (2-3 sentences with specific numbers and context)
- Represent a material item above the threshold

Return as JSON:
{
  "watch_areas": [
    {
      "status": "needs-attention",
      "title": "...",
      "body": "..."
    }
  ]
}
Return only the JSON object, no other text.`
  }

  if (section === 'reserves') {
    if (ctx.cash) {
      const c = ctx.cash
      return `You are a financial writer for a nonprofit. Write 2-3 sentences about the organization's cash reserves position for ${monthStr}. Be specific with numbers. Plain language, no jargon.

Write only about cash reserves — the cash balance, how many months of operating expenses it covers, and the change from prior month. Do not write about net operating income or YTD deficit. Only describe what the cash_flow data shows.

CASH RESERVES DATA FOR ${monthStr}:
Cash balance: ${fmtDollars(c.balance)}
Reserve floor (minimum required): ${fmtDollars(c.reserveFloor)}
Cash above floor: ${fmtDollars(c.aboveFloor)}
Prior month cash balance: ${fmtDollars(c.priorBalance)}
Month-over-month change: ${fmtDollars(c.momChange)} (${c.momChange >= 0 ? 'increase' : 'decrease'})
Monthly operating expenses (avg): ${fmtDollars(c.monthlyAvg)}
Months of expenses covered: ${c.monthsCovered !== null ? c.monthsCovered : 'N/A'}

ORG NAME: ${orgName}

Cover: current cash balance, months of expenses covered, and how the balance changed from the prior month.

Return as JSON: {"reserves": "..."}
Return only the JSON object, no other text.`
    }
    // Fallback to net position when no cash data exists
    return `Write 2-3 sentences about an organization's financial reserves position based on this data. Be specific with numbers. Only describe what the data shows.

FINANCIAL DATA FOR ${monthStr}:
Net position (income minus expenses): ${ctx.currentMonth.netActual}
Net position vs budget: ${ctx.currentMonth.netBudget}
YTD net position: ${ctx.ytd.netActual}
YTD vs budget: ${ctx.ytd.netBudget}

ORG NAME: ${orgName}
MONTH: ${monthStr}
FISCAL YEAR POSITION: Month ${monthNum} of 12

Return as JSON: {"reserves": "..."}
Return only the JSON object, no other text.`
  }

  if (section === 'monthlyActivity') {
    return `You are a financial writer for a nonprofit. Write 2-3 sentences describing what happened financially in ${monthStr} specifically — not year-to-date. Be specific with numbers. Plain language, no jargon.

CURRENT MONTH DATA (${monthStr}):
${currentMonthData}
Total income this month: ${ctx.currentMonth.totalIncome}
Total expenses this month: ${ctx.currentMonth.totalExpenses}
Net this month: ${ctx.currentMonth.netActual}
Income vs budget this month: actual ${ctx.currentMonth.totalIncome} vs budgeted ${ctx.currentMonth.totalIncBudget}
Expenses vs budget this month: actual ${ctx.currentMonth.totalExpenses} vs budgeted ${ctx.currentMonth.totalExpBudget}

ORG NAME: ${orgName}
FISCAL YEAR POSITION: Month ${monthNum} of 12

Cover: how giving/income came in vs budget, how expenses tracked, and what the net result was for the month.

Return as JSON: {"monthly_activity": "..."}
Return only the JSON object, no other text.`
  }

  return ''
}

/** Call the generate-summary edge function */
async function callGenerateAPI(prompt) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Generation timed out — please try again')), 30000)
  })
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('generate-summary', {
        body: { prompt, max_tokens: 1000 },
      }),
      timeout,
    ])
    if (error) throw new Error(error.message || 'Edge function error')
    if (!data?.content) throw new Error('Empty response from AI')
    return data.content
  } finally {
    // Always cancel the timer — prevents unhandled rejection if invoke wins
    clearTimeout(timeoutId)
  }
}

/** Parse JSON safely from Claude's response */
function parseAIResponse(text) {
  try {
    // Strip markdown code blocks if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    return JSON.parse(cleaned)
  } catch {
    throw new Error('AI returned invalid JSON')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate button sub-components
// ─────────────────────────────────────────────────────────────────────────────

function GenerateButton({ hasContent, loading, error, onGenerate }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-transparent animate-spin"/>
        Generating…
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        onClick={onGenerate}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all"
        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
        {hasContent ? '↺ Regenerate' : '✦ Generate'}
      </button>
    </div>
  )
}

function GenerateSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 bg-gray-100 rounded w-3/4"/>
      <div className="h-3 bg-gray-100 rounded w-full"/>
      <div className="h-3 bg-gray-100 rounded w-5/6"/>
      <div className="h-3 bg-gray-100 rounded w-2/3"/>
    </div>
  )
}

function MonthlySummaryTab({ summaries, onUpdateSummary, onAddSummary, orgConfig, actuals, budgetFlat, activeBudget, savedPeriods = new Set(), onSave }) {

  // BEHAVIOR 1: Exec dropdown — only months with a saved DB record, newest first
  const savedMonths = useMemo(() => {
    return [...savedPeriods]
      .map(p => periodToMonthLabel(p))
      .filter(Boolean)
      .sort((a, b) => new Date('1 ' + b) - new Date('1 ' + a))
  }, [savedPeriods])

  // BEHAVIOR 2: New Month picker — all months that have actuals data, newest first
  const allDataMonths = useMemo(() => {
    const monthSet = new Set()
    ;(actuals || []).forEach(t => {
      if (t.period) {
        const label = periodToMonthLabel(t.period)
        if (label) monthSet.add(label)
      }
    })
    // Also include already-saved months (in case actuals were removed)
    savedMonths.forEach(m => monthSet.add(m))
    return [...monthSet].sort((a, b) => new Date('1 ' + b) - new Date('1 ' + a))
  }, [actuals, savedMonths])

  const [currentMonth, setCurrentMonth] = useState(() => savedMonths[0] || ALL_MONTHS[0])

  // When DB loads and savedMonths populates, jump to the most recent saved month
  // (only if current selection has no actuals data — i.e., it's still the init default)
  useEffect(() => {
    if (savedMonths.length > 0 && !allDataMonths.includes(currentMonth)) {
      setCurrentMonth(savedMonths[0])
    }
  }, [savedMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-initialize an empty summary entry when the user switches to a month
  // that has no saved narrative yet — so KPI cards and Generate buttons work immediately
  useEffect(() => {
    if (currentMonth && !summaries[currentMonth]) {
      onAddSummary(currentMonth)
    }
  }, [currentMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  const [editMode, setEditMode] = useState(false)
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [showAddKPI, setShowAddKPI] = useState(false)
  const [manualCards, setManualCards] = useState({})

  // Cash flow data for Reserves AI section
  const [cashData, setCashData] = useState([])
  useEffect(() => {
    if (!ORG_ID) return
    supabase.from('v_cash_flow_enriched').select('*').eq('org_id', ORG_ID)
      .then(({ data }) => setCashData(data || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // AI generation state
  const [generating, setGenerating] = useState(new Set()) // section names being generated
  const [genErrors, setGenErrors]   = useState({})        // { section: errorMessage }
  const [showGenAllConfirm, setShowGenAllConfirm] = useState(false)

  // Save state
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle'|'saving'|'saved'|'error'
  const [saveBanner, setSaveBanner] = useState(null)   // { type: 'success'|'error', message: string }
  const saveTimerRef  = useRef(null)
  const bannerTimerRef = useRef(null)

  const summary = summaries[currentMonth] || null

  // ── Save helpers ────────────────────────────────────────────────────────────
  async function doSave(monthKey, summaryData) {
    if (!onSave || !summaryData) return
    setSaveStatus('saving')
    const { error } = await onSave(monthKey, summaryData)
    if (error) {
      setSaveStatus('error')
      setSaveBanner({ type: 'error', message: 'Save failed — please try again' })
    } else {
      setSaveStatus('saved')
      const ts = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      setSaveBanner({ type: 'success', message: `Summary saved ✓  ${ts}` })
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = setTimeout(() => { setSaveBanner(null); setSaveStatus('idle') }, 3000)
    }
  }

  function update(key, value) {
    onUpdateSummary(currentMonth, key, value)
    // Auto-save: debounce 2.5s after last edit
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('idle')
    // Guard: if summary is still initialising, pull fresh from state in the closure
    const updated = { ...(summary || {}), [key]: value }
    saveTimerRef.current = setTimeout(() => doSave(currentMonth, updated), 2500)
  }

  function updateFinancials(cat, field, val) {
    const fin = { ...(summary?.financials || {}) }
    fin[cat] = { ...(fin[cat] || {}), [field]: val }
    update('financials', fin)
  }

  function moveTakeaway(idx, dir) {
    const arr = [...summary.keyTakeaways]
    const to = idx + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
    update('keyTakeaways', arr)
  }

  function editTakeaway(idx, key, val) {
    const arr = summary.keyTakeaways.map((t,i)=>i===idx?{...t,[key]:val}:t)
    update('keyTakeaways', arr)
  }

  function addTakeaway() {
    update('keyTakeaways', [...(summary.keyTakeaways||[]), {id:'kt-'+Date.now(),title:'New takeaway.',body:''}])
  }

  function removeTakeaway(idx) {
    update('keyTakeaways', summary.keyTakeaways.filter((_,i)=>i!==idx))
  }

  function editWatchArea(idx, key, val) {
    const arr = summary.watchAreas.map((w,i)=>i===idx?{...w,[key]:val}:w)
    update('watchAreas', arr)
  }

  function addWatchArea() {
    update('watchAreas', [...(summary.watchAreas||[]), {id:'wa-'+Date.now(),status:'monitoring',title:'New watch area.',body:''}])
  }

  function removeWatchArea(idx) {
    update('watchAreas', summary.watchAreas.filter((_,i)=>i!==idx))
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  function setGen(section, on) {
    setGenerating(prev => {
      const next = new Set(prev)
      if (on) next.add(section); else next.delete(section)
      return next
    })
  }

  function setGenError(section, msg) {
    setGenErrors(prev => ({ ...prev, [section]: msg }))
  }

  async function generateSection(section) {
    const period = monthLabelToPeriod(currentMonth)
    if (!period) { setGenError(section, 'Cannot determine period for this month'); return }

    const ctx = buildAIContext({ period, actuals, budgetFlat, activeBudget, orgConfig, cashData })
    if (!ctx) { setGenError(section, 'No data available for this month'); return }

    setGen(section, true)
    setGenError(section, null)

    try {
      const prompt = buildSectionPrompt(section, ctx)
      const raw    = await callGenerateAPI(prompt)
      const parsed = parseAIResponse(raw)

      if (section === 'overall') {
        update('title', parsed.headline || '')
        update('overallSummary', parsed.narrative || '')
      } else if (section === 'takeaways') {
        const kts = (parsed.takeaways || []).map((t, i) => ({
          id: 'kt-ai-' + Date.now() + '-' + i,
          title: t.headline || t.title || '',
          body:  t.body || '',
        }))
        update('keyTakeaways', kts)
      } else if (section === 'watchAreas') {
        const was = (parsed.watch_areas || []).map((w, i) => ({
          id:     'wa-ai-' + Date.now() + '-' + i,
          status: w.status || 'monitoring',
          title:  w.title || '',
          body:   w.body  || '',
        }))
        update('watchAreas', was)
      } else if (section === 'reserves') {
        update('reserves', parsed.reserves || '')
      } else if (section === 'monthlyActivity') {
        update('monthlyActivity', parsed.monthly_activity || '')
      }
    } catch (err) {
      setGenError(section, 'Summary generation failed — please try again')
      console.error('AI generation error:', err)
    } finally {
      setGen(section, false)
    }
  }

  async function generateAll() {
    setShowGenAllConfirm(false)
    const sections = ['overall', 'monthlyActivity', 'takeaways', 'watchAreas', 'reserves']
    // Run all in parallel
    await Promise.all(sections.map(s => generateSection(s)))
  }

  // ── FIX 1: Compute Fiscal YTD KPI data from live actuals/budget ──────────
  const ytdKPI = useMemo(() => {
    const period = monthLabelToPeriod(currentMonth)
    if (!period || !actuals?.length) return { giving: {actual:0,budget:0,priorYear:0}, expenses: {actual:0,budget:0,priorYear:0} }

    const [yr, mo] = period.split('-').map(Number)
    const fyM   = orgConfig?.fiscalYearStartMonth || 10
    const fyYr  = orgConfig?.fiscalYearStartYear  || yr
    const fyStart = `${fyYr}-${String(fyM).padStart(2,'0')}`

    // Fiscal YTD actuals
    const ytdIncome   = (actuals||[]).filter(t => t.record_type === 'income'  && t.period >= fyStart && t.period <= period).reduce((s,t) => s + Math.abs(t.amount||0), 0)
    const ytdExpenses = (actuals||[]).filter(t => t.record_type === 'expense' && t.period >= fyStart && t.period <= period).reduce((s,t) => s + Math.abs(t.amount||0), 0)

    // Fiscal YTD budget
    const ytdBudRows      = (budgetFlat||[]).filter(b => b.period >= fyStart && b.period <= period && (!activeBudget || b.scenario === activeBudget))
    const ytdBudIncome    = ytdBudRows.filter(b => b.record_type === 'income' ).reduce((s,b) => s + Math.abs(b.amount||0), 0)
    const ytdBudExpenses  = ytdBudRows.filter(b => b.record_type === 'expense').reduce((s,b) => s + Math.abs(b.amount||0), 0)

    // Prior year same Fiscal YTD
    const pyFyStart  = `${fyYr-1}-${String(fyM).padStart(2,'0')}`
    const pyEnd      = `${yr-1}-${String(mo).padStart(2,'0')}`
    const pyIncome   = (actuals||[]).filter(t => t.record_type === 'income'  && t.period >= pyFyStart && t.period <= pyEnd).reduce((s,t) => s + Math.abs(t.amount||0), 0)
    const pyExpenses = (actuals||[]).filter(t => t.record_type === 'expense' && t.period >= pyFyStart && t.period <= pyEnd).reduce((s,t) => s + Math.abs(t.amount||0), 0)

    return {
      giving:   { actual: ytdIncome,   budget: ytdBudIncome,   priorYear: pyIncome   },
      expenses: { actual: ytdExpenses, budget: ytdBudExpenses, priorYear: pyExpenses },
    }
  }, [currentMonth, actuals, budgetFlat, activeBudget, orgConfig])

  function renderMonthlyKPICard(cardId) {
    const remove = () => update('kpiCards', (summary.kpiCards||[]).filter(c=>c!==cardId))
    if (cardId === 'monthly-giving') {
      return <MonthlyKPICard key={cardId} title="Total Giving — Fiscal YTD"
        actual={ytdKPI.giving.actual} budget={ytdKPI.giving.budget} priorYear={ytdKPI.giving.priorYear}
        editMode={false} onRemove={remove}/>
    }
    if (cardId === 'monthly-expenses') {
      return <MonthlyKPICard key={cardId} title="Expenses — Fiscal YTD" inverse
        actual={ytdKPI.expenses.actual} budget={ytdKPI.expenses.budget} priorYear={ytdKPI.expenses.priorYear}
        editMode={false} onRemove={remove}/>
    }
    if (cardId === 'monthly-net') {
      const netA = ytdKPI.giving.actual   - ytdKPI.expenses.actual
      const netB = ytdKPI.giving.budget   - ytdKPI.expenses.budget
      const netP = ytdKPI.giving.priorYear - ytdKPI.expenses.priorYear
      return <MonthlyKPICard key={cardId} title="Net Position — Fiscal YTD"
        actual={netA} budget={netB} priorYear={netP}
        editMode={false} onRemove={remove}/>
    }
    if (cardId === 'monthly-cash') {
      return <MonthlyKPICard key={cardId} title="Month-End Cash"
        actual={summary.cash?.actual||0} budget={summary.cash?.budget||0} priorYear={summary.cash?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>{const c={...(summary.cash||{}),[f]:v};update('cash',c)}} onRemove={remove}/>
    }
    if (cardId === 'monthly-supporters') {
      return <MonthlyKPICard key={cardId} title="Active Supporters"
        actual={summary.supporters?.actual||0} budget={summary.supporters?.budget||0} priorYear={summary.supporters?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>{const s={...(summary.supporters||{}),[f]:v};update('supporters',s)}} onRemove={remove}/>
    }
    // Manual cards — same as dashboard manual KPI cards
    if (cardId.startsWith('manual-')) {
      const stored = manualCards[cardId] || { id: cardId, label: 'Custom KPI', value: '—' }
      return <ManualKPICard key={cardId} card={stored} editMode={editMode}
        onRemove={remove}
        onEdit={updated => setManualCards(prev => ({ ...prev, [cardId]: updated }))}/>
    }
    return null
  }

  return (
    <div className="min-h-screen" style={{backgroundColor:'var(--color-primary-bg)'}}>
      <div className="max-w-3xl mx-auto px-6 py-8 pb-16">

        {/* ── Save banner ── */}
        {saveBanner && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 ${
            saveBanner.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {saveBanner.message}
          </div>
        )}

        {/* ── Document header: icon + title + inline month selector + action buttons ── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          {/* Left: icon + label + month dropdown + prepared date */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                 style={{backgroundColor: orgConfig?.primaryColor || 'var(--color-primary)'}}>
              <FileText size={18} className="text-white"/>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5"
                 style={{color:'var(--neutral-60)'}}>
                Financial Summary
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {savedMonths.length === 0 ? (
                  /* No saved summaries yet */
                  <span className="text-sm text-gray-400 italic">No summaries yet — click "+ New Month" to create one</span>
                ) : savedMonths.includes(currentMonth) ? (
                  /* Exec read-only dropdown: only shows saved/completed months */
                  <select
                    value={currentMonth}
                    onChange={e => setCurrentMonth(e.target.value)}
                    className="text-xl font-bold text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer py-0 pl-0 pr-6"
                    style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24'%3E%3Cpath fill='%236b7280' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 2px center', appearance:'none', WebkitAppearance:'none'}}>
                    {savedMonths.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  /* Creator is editing an unsaved/new month */
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-gray-900">{currentMonth}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                      style={{color:'var(--color-primary)', borderColor:'var(--color-primary)', opacity:0.7}}>
                      Draft
                    </span>
                  </div>
                )}
                {summary?.prepared && savedMonths.includes(currentMonth) && (
                  <>
                    <span className="text-gray-300 text-sm">·</span>
                    <span className="text-xs text-gray-400">Prepared {summary.prepared}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {summary && (
              generating.size > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 px-3 py-1.5">
                  <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-transparent animate-spin"/>
                  Generating…
                </div>
              ) : (
                <button
                  onClick={() => {
                    const hasContent = summary.title || summary.overallSummary || (summary.keyTakeaways||[]).length || (summary.watchAreas||[]).length || summary.reserves
                    if (hasContent) setShowGenAllConfirm(true)
                    else generateAll()
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                  ✦ Generate All
                </button>
              )
            )}
            {summary && (
              <button
                onClick={() => doSave(currentMonth, summary)}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white whitespace-nowrap transition-all disabled:opacity-60"
                style={{backgroundColor: orgConfig?.primaryColor || 'var(--color-primary)'}}>
                {saveStatus === 'saving' ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"/> Saving…</>
                ) : (
                  <><Save size={11}/> Save Summary</>
                )}
              </button>
            )}
            <button onClick={() => setShowAddMonth(true)}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg text-white whitespace-nowrap"
              style={{backgroundColor:'var(--color-primary)'}}>
              <Plus size={11}/> New Month
            </button>
            <button onClick={() => setEditMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${editMode ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
              {editMode ? <><Check size={12}/> Done</> : <><Pencil size={12}/> Edit</>}
            </button>
          </div>
        </div>

        <>

          {/* ── OVERALL SUMMARY ── */}
          <div className="flex items-center justify-between mb-2">
            <SectionLabel className="mb-0">Overall Summary</SectionLabel>
            <GenerateButton
              hasContent={!!(summary?.title || summary?.overallSummary)}
              loading={generating.has('overall')}
              error={genErrors.overall}
              onGenerate={() => generateSection('overall')}/>
          </div>
          {generating.has('overall') ? (
            <div className="mb-6 space-y-3">
              <div className="h-8 bg-gray-100 rounded w-2/3 animate-pulse"/>
              <GenerateSkeleton/>
            </div>
          ) : (
            <>
              <div className="mb-2">
                <EditableTitle value={summary?.title || ''} onChange={v=>update('title',v)} editMode={editMode}
                  className="text-3xl font-bold text-gray-900 leading-tight mb-4"/>
              </div>
              <EditableArea value={summary?.overallSummary || ''} onChange={v=>update('overallSummary',v)} editMode={editMode}
                className="text-sm text-gray-600 leading-relaxed" rows={4} placeholder="Write an overall summary of the month..."/>
            </>
          )}
          <div className="my-8 border-t border-gray-200"/>

          {/* ── FINANCIAL POSITION ── */}
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>Financial Position</SectionLabel>
          </div>
          <div className="flex gap-3 flex-wrap mb-4" style={{alignItems:'stretch'}}>
            {(summary?.kpiCards||[]).map(id => renderMonthlyKPICard(id))}
            {editMode && (
              <button onClick={()=>setShowAddKPI(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-4 min-w-[140px] max-w-[180px] text-gray-300 hover:text-gray-500">
                <Plus size={18}/><span className="text-xs font-medium">Add card</span>
              </button>
            )}
          </div>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── MONTHLY ACTIVITY ── */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-primary)'}}>
              Monthly Activity — {currentMonth}
            </span>
            <div className="flex-1 mx-4 border-t border-gray-200"/>
            <GenerateButton
              hasContent={!!summary?.monthlyActivity}
              loading={generating.has('monthlyActivity')}
              error={genErrors.monthlyActivity}
              onGenerate={() => generateSection('monthlyActivity')}/>
          </div>
          {generating.has('monthlyActivity') ? (
            <GenerateSkeleton/>
          ) : (
            <EditableArea value={summary?.monthlyActivity || ''} onChange={v=>update('monthlyActivity',v)} editMode={editMode}
              className="text-sm text-gray-600 leading-relaxed" rows={3}
              placeholder="What happened financially this month — income vs budget, expense trends, and net result..."/>
          )}
          <div className="my-8 border-t border-gray-200"/>

          {/* ── KEY TAKEAWAYS ── */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-primary)'}}>Key Takeaways</span>
            <div className="flex-1 mx-4 border-t border-gray-200"/>
            <div className="flex items-center gap-2">
              <GenerateButton
                hasContent={(summary?.keyTakeaways||[]).length > 0}
                loading={generating.has('takeaways')}
                error={genErrors.takeaways}
                onGenerate={() => generateSection('takeaways')}/>
              {editMode && <button onClick={addTakeaway} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{backgroundColor:'var(--color-primary)'}}><Plus size={11}/> Add</button>}
            </div>
          </div>
          {generating.has('takeaways') ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"/>
                  <div className="h-3 bg-gray-100 rounded w-full mb-1"/>
                  <div className="h-3 bg-gray-100 rounded w-4/5"/>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {(summary?.keyTakeaways||[]).map((kt, idx) => (
                <div key={kt.id} className="mb-3 last:mb-0 bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start gap-4">
                    <span className="text-sm font-bold tabular-nums flex-shrink-0 mt-0.5 w-6" style={{color:'var(--color-primary)'}}>{String(idx+1).padStart(2,'0')}</span>
                    <div className="flex-1 min-w-0">
                      {editMode ? (
                        <>
                          <input value={kt.title} onChange={e=>editTakeaway(idx,'title',e.target.value)}
                            className="w-full font-semibold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-gray-500 mb-2"/>
                          <textarea value={kt.body} onChange={e=>editTakeaway(idx,'body',e.target.value)} rows={3}
                            className="w-full text-sm text-gray-600 bg-transparent resize-none border-b border-dashed border-gray-300 focus:outline-none focus:border-gray-500"/>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-gray-900 mb-1">{kt.title}</p>
                          <p className="text-sm text-gray-600 leading-relaxed">{highlightNumbers(kt.body)}</p>
                        </>
                      )}
                    </div>
                    {editMode && (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={()=>moveTakeaway(idx,-1)} disabled={idx===0} className="p-1 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={14}/></button>
                        <button onClick={()=>moveTakeaway(idx,1)} disabled={idx===((summary?.keyTakeaways||[]).length-1)} className="p-1 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={14}/></button>
                        <button onClick={()=>removeTakeaway(idx)} className="p-1 rounded text-gray-300 hover:text-red-500"><X size={14}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(summary?.keyTakeaways||[]).length===0 && !generating.has('takeaways') && (
                <p className="text-sm text-gray-400 italic py-4">No takeaways yet. Click "✦ Generate" or "+ Add" to add some.</p>
              )}
            </div>
          )}
          <div className="my-8"/>

          {/* ── ROLLING QUOTE ── */}
          <RollingQuoteSection/>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── WATCH AREAS ── */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-primary)'}}>Watch Areas</span>
            <div className="flex-1 mx-4 border-t border-gray-200"/>
            <div className="flex items-center gap-2">
              <GenerateButton
                hasContent={(summary?.watchAreas||[]).length > 0}
                loading={generating.has('watchAreas')}
                error={genErrors.watchAreas}
                onGenerate={() => generateSection('watchAreas')}/>
              {editMode && <button onClick={addWatchArea} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{backgroundColor:'var(--color-primary)'}}><Plus size={11}/> Add</button>}
            </div>
          </div>
          {generating.has('watchAreas') ? (
            <div className="space-y-6">
              {[1,2,3].map(i => (
                <div key={i} className="border-b border-gray-100 pb-6 animate-pulse">
                  <div className="h-5 bg-gray-100 rounded w-24 mb-3"/>
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"/>
                  <div className="h-3 bg-gray-100 rounded w-full mb-1"/>
                  <div className="h-3 bg-gray-100 rounded w-4/5"/>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {(summary?.watchAreas||[]).map((wa, idx) => {
                const s = WATCH_STATUSES[wa.status] || WATCH_STATUSES['monitoring']
                return (
                  <div key={wa.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                    {editMode ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <select value={wa.status} onChange={e=>editWatchArea(idx,'status',e.target.value)}
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border border-gray-200 focus:outline-none bg-white cursor-pointer">
                            <option value="needs-attention">Needs Attention</option>
                            <option value="monitoring">Monitoring</option>
                            <option value="on-track">On Track</option>
                          </select>
                          <button onClick={()=>removeWatchArea(idx)} className="ml-auto p-1 rounded text-gray-300 hover:text-red-500"><X size={14}/></button>
                        </div>
                        <input value={wa.title} onChange={e=>editWatchArea(idx,'title',e.target.value)}
                          className="w-full font-semibold text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-gray-500"/>
                        <textarea value={wa.body} onChange={e=>editWatchArea(idx,'body',e.target.value)} rows={3}
                          className="w-full text-sm text-gray-600 bg-transparent resize-none border-b border-dashed border-gray-300 focus:outline-none focus:border-gray-500"/>
                      </div>
                    ) : (
                      <>
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3 ${s.pill}`}>{s.label}</span>
                        <p className="font-semibold text-gray-900 mb-1.5">{wa.title}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{wa.body}</p>
                      </>
                    )}
                  </div>
                )
              })}
              {(summary?.watchAreas||[]).length===0 && !generating.has('watchAreas') && (
                <p className="text-sm text-gray-400 italic">No watch areas yet. Click "✦ Generate" or "+ Add" to add one.</p>
              )}
            </div>
          )}
          <div className="my-8 border-t border-gray-200"/>

          {/* ── RESERVES ── */}
          <div className="flex items-center justify-between mb-2">
            <SectionLabel className="mb-0" color="var(--color-primary)">Reserves</SectionLabel>
            <GenerateButton
              hasContent={!!summary?.reserves}
              loading={generating.has('reserves')}
              error={genErrors.reserves}
              onGenerate={() => generateSection('reserves')}/>
          </div>
          {generating.has('reserves') ? (
            <div className="mb-4"><GenerateSkeleton/></div>
          ) : (
            <EditableArea value={summary?.reserves || ''} onChange={v=>update('reserves',v)} editMode={editMode}
              className="text-sm text-gray-700 leading-relaxed mb-4" rows={4} placeholder="Describe the reserves position, rationale, and outlook..."/>
          )}
          {(editMode || summary?.reservesNote) && (
            <EditableArea value={summary?.reservesNote || ''} onChange={v=>update('reservesNote',v)} editMode={editMode}
              className="text-xs text-gray-400 leading-relaxed" rows={2} placeholder="Add a footnote or note about reserve reporting timing..."/>
          )}

          {/* ── FOOTER ── */}
          <div className="mt-12 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>Prepared by the Finance Team · {summary?.prepared}</span>
            {savedMonths[1] && <span>Prev summary · {savedMonths[savedMonths.indexOf(currentMonth) + 1] || savedMonths[savedMonths.length - 1]}</span>}
          </div>
        </>

      </div>{/* end max-w-2xl */}

      {/* Generate All Confirmation Modal */}
      {showGenAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-96 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Replace existing content?</h3>
            <p className="text-sm text-gray-500 mb-5">This will replace existing content in all sections. Continue?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowGenAllConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={generateAll}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{backgroundColor:'var(--color-primary)'}}>
                Generate All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Month Picker — shows all months with transaction data */}
      {showAddMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setShowAddMonth(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-88 flex flex-col"
            style={{maxHeight:'70vh', width:360}}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Select Month</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">All months with transaction data · ✓ = summary saved</p>
              </div>
              <button onClick={() => setShowAddMonth(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={14}/>
              </button>
            </div>
            {/* Month list */}
            <div className="flex-1 overflow-y-auto p-2">
              {allDataMonths.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  No transaction data found.<br/>Import transactions to get started.
                </p>
              ) : (
                allDataMonths.map(m => {
                  const p  = monthLabelToPeriod(m)
                  const isSaved   = p && savedPeriods.has(p)
                  const isCurrent = m === currentMonth
                  return (
                    <button
                      key={m}
                      onClick={() => {
                        setCurrentMonth(m)
                        setShowAddMonth(false)
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors text-left ${
                        isCurrent
                          ? 'text-white'
                          : 'hover:bg-gray-50 text-gray-900'
                      }`}
                      style={isCurrent ? {backgroundColor:'var(--color-primary)'} : {}}>
                      <span className="text-sm font-medium">{m}</span>
                      {isSaved && !isCurrent && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <Check size={11}/> Saved
                        </span>
                      )}
                      {isSaved && isCurrent && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-white opacity-80">
                          <Check size={11}/> Saved
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add KPI Card Panel */}
      {showAddKPI && (
        <AddCardPanel title="Add Monthly KPI Card"
          suggestedCards={MONTHLY_SUGGESTED_KPI}
          existingIds={summary?.kpiCards||[]}
          onAdd={card=>{
            if(card.manual) setManualCards(p=>({...p,[card.id]:card}))
            update('kpiCards',[...(summary.kpiCards||[]),card.id])
          }}
          onClose={()=>setShowAddKPI(false)}/>
      )}

      {/* Comment pin FAB — carries current summary month as source_period */}
      <CommentPinFAB
        page="elt-summary"
        sourceDashboard="Executive"
        sourcePage="Summary"
        sourcePeriod={monthLabelToPeriod(currentMonth)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPI_CARDS      = ['giving','expenses','net-position','cash']
const DEFAULT_PATRON_METRICS = ['total-patrons','new-patrons','avg-gift']

// Chart catalog — preset charts that can be added / removed
const CHART_CATALOG = [
  { id:'new-patrons-yoy', label:'New Supporters YoY',     description:'Year-over-year comparison of new supporters by month', defaultType:'line' },
  { id:'patron-base',     label:'Monthly Supporter Base', description:'Recurring patron count across the selected date range', defaultType:'bar' },
  { id:'giving-vs-budget',label:'Giving vs Budget',       description:'Monthly income actuals vs budget/scenario with cumulative toggle', defaultType:'line' },
]

const DEFAULT_TREND_CHARTS = [
  { id:'new-patrons-yoy',  chartType:'line' },
  { id:'patron-base',      chartType:'bar'  },
  { id:'giving-vs-budget', chartType:'line' },
]

// ── Layout persistence helpers (localStorage, per-browser = per-user) ─────────
const LAYOUT_KEY = 'elt_dashboard_layout'

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch {}
}

function getSection(layout, section, defaults) {
  if (!layout[section]) return defaults
  const hidden = new Set(layout[section])
  return defaults.filter(item => {
    const id = typeof item === 'string' ? item : item.id
    return !hidden.has(id)
  })
}

function DashboardTab({ dateRange, orgConfig, activeBudget, incomeMonths, actuals }) {
  const { budgetFlat, availableScenarios } = useApp()
  // activeBudget is a scenario string from AppContext.availableScenarios
  const scenario = activeBudget || availableScenarios[0] || ''

  // Derive period label from the END of the selected date range, not "last month".
  // e.g. Fiscal YTD ending May 2026 → "May 2026"; Full Fiscal Year ending May 2026 → "May 2026"
  const endDateStr = dateRange?.endDate || new Date().toISOString().slice(0, 10)
  const currentMonthDisplay = new Date(endDateStr + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' })

  const [editKPI,            setEditKPI]            = useState(false)
  const [editPatronMetrics,  setEditPatronMetrics]  = useState(false)
  const [editCharts,         setEditCharts]         = useState(false)

  // Initialize from localStorage so removals persist across refreshes
  const [kpiCards,           setKpiCards]           = useState(() => getSection(loadLayout(), 'kpi',          DEFAULT_KPI_CARDS))
  const [patronMetricCards,  setPatronMetricCards]  = useState(() => getSection(loadLayout(), 'patron',       DEFAULT_PATRON_METRICS))
  const [trendCharts,        setTrendCharts]        = useState(() => getSection(loadLayout(), 'charts',       DEFAULT_TREND_CHARTS))
  const [showAddKPI,         setShowAddKPI]         = useState(false)
  const [showAddPatronMetric,setShowAddPatronMetric]= useState(false)
  const [showAddChart,       setShowAddChart]       = useState(false)
  const [manualCards,        setManualCards]        = useState({})

  // Supabase: cash flow + patron trends
  const [cashData,   setCashData]   = useState([])
  const [patronData, setPatronData] = useState([])
  useEffect(() => {
    Promise.all([
      supabase.from('v_cash_flow_enriched').select('*').eq('org_id', ORG_ID),
      supabase.from('v_patron_trends').select('*').eq('org_id', ORG_ID),
    ]).then(([{ data: cash }, { data: patron }]) => {
      setCashData(cash || [])
      setPatronData(patron || [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist layout changes to localStorage whenever cards/charts change
  useEffect(() => {
    const layout = loadLayout()
    const hiddenKpi = DEFAULT_KPI_CARDS.filter(id => !kpiCards.includes(id))
    if (hiddenKpi.length) layout.kpi = hiddenKpi; else delete layout.kpi
    saveLayout(layout)
  }, [kpiCards])

  useEffect(() => {
    const layout = loadLayout()
    const hiddenPatron = DEFAULT_PATRON_METRICS.filter(id => !patronMetricCards.includes(id))
    if (hiddenPatron.length) layout.patron = hiddenPatron; else delete layout.patron
    saveLayout(layout)
  }, [patronMetricCards])

  useEffect(() => {
    const layout = loadLayout()
    const defaultIds = DEFAULT_TREND_CHARTS.map(c => c.id)
    const hiddenCharts = defaultIds.filter(id => !trendCharts.find(c => c.id === id))
    if (hiddenCharts.length) layout.charts = hiddenCharts; else delete layout.charts
    saveLayout(layout)
  }, [trendCharts])

  function resetLayout() {
    localStorage.removeItem(LAYOUT_KEY)
    setKpiCards(DEFAULT_KPI_CARDS)
    setPatronMetricCards(DEFAULT_PATRON_METRICS)
    setTrendCharts(DEFAULT_TREND_CHARTS)
  }

  const d = useMemo(
    () => filterELTByRange(dateRange, incomeMonths, actuals, budgetFlat, scenario, cashData, patronData) || EMPTY_ELT,
    [dateRange, incomeMonths, actuals, budgetFlat, scenario, cashData, patronData]
  )
  const rangeLabel = d.rangeLabel || presetLabel(dateRange?.preset)
  const totalGiving   = d.giving.contributions + d.giving.merchandiseRevenue + d.giving.otherIncome
  const totalForecast = d.forecast.contributions + d.forecast.merchandiseRevenue + d.forecast.otherIncome
  const totalPriorGiv = d.priorYear.contributions + d.priorYear.merchandiseRevenue + d.priorYear.otherIncome
  const totalExpenses = Object.values(d.expenseLines).reduce((s,v)=>s+v,0)
  const totalBudgetExp = d.budget.staff+d.budget.contract+d.budget.technology+d.budget.travel+d.budget.otherGenAdmin
  const totalPriorExp = d.priorYear.expenses
  const netPosition   = totalGiving - totalExpenses
  const netForecast   = totalForecast - totalBudgetExp
  const netPriorYear  = totalPriorGiv - totalPriorExp

  const plData = [
    {id:'income-section',type:'section',label:'INCOME',group:'income'},
    {id:'contributions',type:'line',label:'Contributions',actual:d.giving.contributions,budget:d.budget.contributions,group:'income'},
    {id:'merch',type:'line',label:'Merchandise Revenue',actual:d.giving.merchandiseRevenue,budget:d.budget.merchandiseRevenue,group:'income'},
    {id:'other-inc',type:'line',label:'Other Income',actual:d.giving.otherIncome,budget:d.budget.otherIncome,group:'income'},
    {id:'total-income',type:'subtotal',label:'Total Income',actual:totalGiving,budget:totalForecast,group:'income'},
    {id:'sp1',type:'spacer'},
    {id:'expense-section',type:'section',label:'EXPENSES',group:'expense'},
    {id:'staff',type:'line',label:'Staff',actual:d.expenseLines.staff,budget:d.budget.staff,group:'expense'},
    {id:'contract',type:'line',label:'Contract Services',actual:d.expenseLines.contract,budget:d.budget.contract,group:'expense'},
    {id:'technology',type:'line',label:'Technology',actual:d.expenseLines.technology,budget:d.budget.technology,group:'expense'},
    {id:'travel',type:'line',label:'Travel',actual:d.expenseLines.travel,budget:d.budget.travel,group:'expense'},
    {id:'other-exp',type:'line',label:'Other Gen & Admin',actual:d.expenseLines.otherGenAdmin,budget:d.budget.otherGenAdmin,group:'expense'},
    {id:'total-expenses',type:'subtotal',label:'Total Expenses',actual:totalExpenses,budget:totalBudgetExp,group:'expense'},
    {id:'sp2',type:'spacer'},
    {id:'net-operating',type:'total',label:'Net Operating Income',actual:netPosition,budget:netForecast,group:'net'},
  ]

  // Unresolved rows — summarise _warnings for the current date range
  const plWarnItems = useMemo(() => {
    const startP = (dateRange.startDate || '').substring(0, 7)
    const endP   = (dateRange.endDate   || '').substring(0, 7)
    const map = {}
    for (const t of actuals) {
      const p = t.period || (t.date ? t.date.substring(0, 7) : null)
      if (!p || p < startP || p > endP) continue
      for (const w of (t._warnings || [])) {
        if (!map[w]) map[w] = { actual: 0, count: 0 }
        map[w].actual += Math.abs(t.amount || 0)
        map[w].count++
      }
    }
    for (const b of budgetFlat) {
      if (b.scenario !== scenario) continue
      if (!b.period || b.period < startP || b.period > endP) continue
      for (const w of (b._warnings || [])) {
        if (!map[w]) map[w] = { actual: 0, budget: 0, count: 0 }
        map[w].budget = (map[w].budget || 0) + Math.abs(b.amount || 0)
      }
    }
    return map
  }, [actuals, budgetFlat, scenario, dateRange])

  // Account-level rows for P&L expand — groups actuals by account within each category bucket
  const plAccounts = useMemo(
    () => computePLAccounts(actuals, {
      contributions: d.budget.contributions,
      merch:         d.budget.merchandiseRevenue,
      'other-inc':   d.budget.otherIncome,
      staff:         d.budget.staff,
      contract:      d.budget.contract,
      technology:    d.budget.technology,
      travel:        d.budget.travel,
      'other-exp':   Math.max(0, d.budget.otherGenAdmin),
    }, dateRange),
    [actuals, d.budget.contributions, d.budget.merchandiseRevenue, d.budget.otherIncome,
     d.budget.staff, d.budget.contract, d.budget.technology, d.budget.travel, d.budget.otherGenAdmin, dateRange]
  )

  function renderKPICard(cardId) {
    if(cardId==='giving') {
      const d1=totalGiving-totalForecast,d2=totalGiving-totalPriorGiv
      // Under forecast → red top border; over → green
      const topBorder = totalForecast > 0 ? (totalGiving >= totalForecast ? STATUS_COLORS.positive : STATUS_COLORS.negative) : null
      return <KPICard key={cardId} title={`Total Giving · ${rangeLabel}`} value={formatCurrency(totalGiving)}
        cmp1Label="vs Forecast" cmp1Value={totalForecast} cmp1Delta={d1} cmp1Pct={formatPercent(d1/totalForecast*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={totalPriorGiv} cmp2Delta={d2} cmp2Pct={formatPercent(d2/totalPriorGiv*100,{showSign:true})}
        topBorderColor={topBorder} editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    if(cardId==='expenses') {
      const d1=totalExpenses-totalBudgetExp,d2=totalExpenses-totalPriorExp
      // Over budget → red; under → green
      const topBorder = totalBudgetExp > 0 ? (totalExpenses > totalBudgetExp ? STATUS_COLORS.negative : STATUS_COLORS.positive) : null
      return <KPICard key={cardId} title={`Expenses · ${rangeLabel}`} value={formatCurrency(totalExpenses)}
        cmp1Label="vs Budget" cmp1Value={totalBudgetExp} cmp1Delta={d1} cmp1Pct={formatPercent(d1/totalBudgetExp*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={totalPriorExp} cmp2Delta={d2} cmp2Pct={formatPercent(d2/totalPriorExp*100,{showSign:true})}
        topBorderColor={topBorder} inverse editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    if(cardId==='net-position') {
      // Net Position renders separately as hero — skip in grid
      return null
    }
    if(cardId==='cash') {
      const d1=d.cash.current-d.cash.priorMonth,d2=d.cash.current-d.cash.priorYear
      return <KPICard key={cardId} title="Cash Position" value={formatCurrency(d.cash.current)}
        cmp1Label="vs Prior Month" cmp1Value={d.cash.priorMonth} cmp1Delta={d1} cmp1Pct={formatPercent(d1/d.cash.priorMonth*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={d.cash.priorYear} cmp2Delta={d2} cmp2Pct={formatPercent(d2/d.cash.priorYear*100,{showSign:true})}
        editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    // Manual card — fully editable
    const stored = manualCards[cardId] || { id: cardId, label: cardId, value: '—' }
    return <ManualKPICard key={cardId} card={stored} editMode={editKPI}
      onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}
      onEdit={updated=>setManualCards(prev=>({...prev,[cardId]:updated}))}/>
  }

  // ── Supporter Metric cards (KPI style)
  function renderPatronMetricCard(cardId) {
    const p = d.patrons
    const removeMetric = () => setPatronMetricCards(c=>c.filter(x=>x!==cardId))
    if(cardId==='total-patrons') return <PatronMetricCard key={cardId} label="Total Active Supporters" mainValue={p.total.toLocaleString()} sub1Label={p.priorMonth > 0 ? "vs Prior Month" : null} sub1Delta={p.total-p.priorMonth} sub1Base={p.priorMonth} sub1Format="count" sub2Label={p.priorYear > 0 ? "vs Prior Year" : null} sub2Delta={p.total-p.priorYear} sub2Base={p.priorYear} sub2Format="count" editMode={editPatronMetrics} onRemove={removeMetric}/>
    if(cardId==='new-patrons') {
      const growthRate = p.newPriorPeriod > 0 ? (p.newThisPeriod/p.newPriorPeriod-1)*100 : null
      return <PatronMetricCard key={cardId} label="New Supporters (Period)" mainValue={p.newThisPeriod.toLocaleString()} sub1Label="vs Prior Period" sub1Delta={p.newThisPeriod-p.newPriorPeriod} sub1Base={p.newPriorPeriod} sub1Format="count" sub2Label="Growth rate" sub2Delta={growthRate} sub2Format="percent" editMode={editPatronMetrics} onRemove={removeMetric}/>
    }
    if(cardId==='avg-gift'||cardId==='avg-gift-p') return <PatronMetricCard key={cardId} label="Avg Gift Size" mainValue={`$${p.avgGift.toFixed(2)}`} sub1Label="vs Prior Year" sub1Delta={p.avgGift-p.avgGiftPriorYear} sub1Base={p.avgGiftPriorYear} sub1Format="currency" sub2Label={null} sub2Delta={null} sub2Base={null} sub2Format="plain" editMode={editPatronMetrics} onRemove={removeMetric}/>
    if(cardId==='retention') return (
      <div key={cardId} className="relative bg-white rounded-xl p-6 flex-1 min-w-[180px]" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        {editPatronMetrics&&<button onClick={removeMetric} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>Retention Rate</div>
        <div className="text-3xl font-bold text-gray-900 mb-2">94.2%</div>
        <div className="text-xs text-gray-500">vs 93.1% prior year <span className="text-emerald-600 font-medium">+1.1 pts</span></div>
      </div>
    )
    if(cardId==='recurring-ratio') return (
      <div key={cardId} className="relative bg-white rounded-xl p-6 flex-1 min-w-[180px]" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        {editPatronMetrics&&<button onClick={removeMetric} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>Recurring Mix</div>
        <div className="text-3xl font-bold text-gray-900 mb-2">82.4%</div>
        <div className="text-xs text-gray-500">of total supporters are recurring givers</div>
      </div>
    )
    if(cardId.startsWith('manual-')) {
      const stored = manualCards[cardId] || { id:cardId, label:cardId, value:'—' }
      return <ManualKPICard key={cardId} card={stored} editMode={editPatronMetrics}
        onRemove={removeMetric}
        onEdit={updated=>setManualCards(prev=>({...prev,[cardId]:updated}))}/>
    }
    return null
  }

  return (
    <div className="p-6 space-y-8 max-w-screen-xl mx-auto">

      {/* ── Page header: org logo + "Financial Summary" + month | period ── */}
      <div className="flex items-start gap-4 pb-2 border-b border-gray-100">
        {/* Logo slot — swap orgConfig.logoUrl for a real image when ready */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
             style={{backgroundColor: orgConfig?.primaryColor || 'var(--color-primary)'}}>
          {orgConfig?.logoUrl
            ? <img src={orgConfig.logoUrl} alt={orgConfig?.name} className="w-8 h-8 object-contain rounded"/>
            : <BarChart2 size={22} className="text-white"/>}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1"
             style={{color:'var(--neutral-60)'}}>
            Dashboard
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-bold tracking-tight text-gray-900">{currentMonthDisplay}</span>
            <span className="text-xl font-extralight text-gray-300 leading-none">|</span>
            <span className="text-xl font-semibold text-gray-500">{presetLabel(dateRange.preset)}</span>
          </div>
        </div>
      </div>

      {/* KPI Section */}
      <section>
        <SectionHeader title="Key Metrics" editMode={editKPI} onToggleEdit={()=>setEditKPI(v=>!v)} onAdd={()=>setShowAddKPI(true)}/>

        {/* Net Position — full-width hero (always above the grid) */}
        {kpiCards.includes('net-position') && (() => {
          const d1=netPosition-netForecast, d2=netPosition-netPriorYear
          return (
            <div className="mb-4">
              <NetPositionCard value={netPosition}
                cmp1Delta={d1} cmp1Pct={formatPercent(d1/Math.abs(netForecast||1)*100,{showSign:true})} cmp1Value={netForecast}
                cmp2Delta={d2} cmp2Pct={formatPercent(d2/Math.abs(netPriorYear||1)*100,{showSign:true})} cmp2Value={netPriorYear}
                breakdown={{lines:[
                  {label:'Contributions',value:d.giving.contributions},
                  {label:'Merchandise Revenue',value:d.giving.merchandiseRevenue},
                  {label:'Other Income',value:d.giving.otherIncome},
                  {label:'Total Income',value:totalGiving,isTotal:true},
                  {label:'Total Expenses',value:totalExpenses,isSubtract:true,isTotal:true},
                ]}}
                editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!=='net-position'))}/>
            </div>
          )
        })()}

        {/* Driver cards grid (excluding net-position) */}
        <div className="flex gap-4 flex-wrap">
          {kpiCards.map(id=>renderKPICard(id))}
          {editKPI&&<button onClick={()=>setShowAddKPI(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-5 min-w-[160px] text-gray-300 hover:text-gray-500"><Plus size={20}/><span className="text-xs font-medium">Add card</span></button>}
        </div>
      </section>

      {/* Supporter Metrics — KPI cards */}
      <section>
        <SectionHeader title="Supporter Metrics" editMode={editPatronMetrics} onToggleEdit={()=>setEditPatronMetrics(v=>!v)} onAdd={()=>setShowAddPatronMetric(true)}/>
        <div className="flex gap-4 flex-wrap">
          {patronMetricCards.map(id=>renderPatronMetricCard(id))}
          {editPatronMetrics&&(
            <button onClick={()=>setShowAddPatronMetric(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-5 min-w-[160px] text-gray-300 hover:text-gray-500">
              <Plus size={20}/><span className="text-xs font-medium">Add metric</span>
            </button>
          )}
        </div>
      </section>

      {/* Trend Charts — editable preset charts */}
      <section>
        <SectionHeader title="Trend Charts" editMode={editCharts} onToggleEdit={()=>setEditCharts(v=>!v)} onAdd={()=>setShowAddChart(true)}/>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {trendCharts.map(tc => {
            const updateType = t => setTrendCharts(p => p.map(c => c.id===tc.id ? {...c, chartType:t} : c))
            const removeChart = () => setTrendCharts(p => p.filter(c => c.id !== tc.id))
            if (tc.id === 'new-patrons-yoy') return (
              <NewPatronChartCard key={tc.id} patronData={patronData} dateRange={dateRange}
                chartType={tc.chartType} editMode={editCharts} onChangeType={updateType} onRemove={removeChart}/>
            )
            if (tc.id === 'patron-base') return (
              <PatronBaseChartCard key={tc.id} patronData={patronData} dateRange={dateRange}
                chartType={tc.chartType} editMode={editCharts} onChangeType={updateType} onRemove={removeChart}/>
            )
            if (tc.id === 'giving-vs-budget') return (
              <MonthlyGivingVsBudgetCard key={tc.id} actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange}
                chartType={tc.chartType} editMode={editCharts} onChangeType={updateType} onRemove={removeChart}/>
            )
            return null
          })}
          {editCharts && (
            <button onClick={()=>setShowAddChart(true)}
              className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-5 min-h-[120px] text-gray-300 hover:text-gray-500">
              <Plus size={20}/><span className="text-xs font-medium">Add chart</span>
            </button>
          )}
        </div>
        {(editKPI || editPatronMetrics || editCharts) && (
          <div className="mt-4 flex justify-end">
            <button onClick={resetLayout}
              className="text-xs text-gray-400 hover:text-red-500 underline underline-offset-2 transition-colors">
              Reset all sections to default
            </button>
          </div>
        )}
      </section>

      {/* P&L */}
      <section><PLTable data={plData} accounts={plAccounts} rangeLabel={rangeLabel} warnItems={plWarnItems}/></section>

      {showAddKPI&&<AddCardPanel title="Add KPI Card" catalog={KPI_CATALOG} existingIds={kpiCards}
        onAdd={card=>{if(card.manual)setManualCards(p=>({...p,[card.id]:card}));setKpiCards(p=>[...p,card.id])}}
        onClose={()=>setShowAddKPI(false)}/>}
      {showAddPatronMetric&&<AddCardPanel title="Add Supporter Metric" catalog={PATRON_KPI_CATALOG} existingIds={patronMetricCards}
        onAdd={card=>{if(card.manual)setManualCards(p=>({...p,[card.id]:card}));setPatronMetricCards(p=>[...p,card.id])}}
        onClose={()=>setShowAddPatronMetric(false)}/>}
      {showAddChart&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setShowAddChart(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Add Trend Chart</h3>
              <button onClick={()=>setShowAddChart(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
            </div>
            <div className="space-y-2">
              {CHART_CATALOG.map(c => {
                const already = trendCharts.some(tc=>tc.id===c.id)
                return (
                  <button key={c.id} disabled={already}
                    onClick={()=>{setTrendCharts(p=>[...p,{id:c.id,chartType:c.defaultType}]);setShowAddChart(false)}}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${already?'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed':'border-gray-200 hover:border-teal-400 hover:bg-teal-50'}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-gray-800">{c.label}</span>
                      {already && <span className="text-[10px] text-gray-400 font-medium">Already added</span>}
                    </div>
                    <p className="text-xs text-gray-500">{c.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Comment pin FAB */}
      <CommentPinFAB page="elt-dashboard" sourceDashboard="Executive" sourcePage="Dashboard" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Detail Modal — centered, with category→account drill-down
// ─────────────────────────────────────────────────────────────────────────────

function TeamDetailDrawer({ team, globalDateRange, onClose }) {
  // selectedCat: null = all categories view; string = a category key
  // selectedAcct: null = category total view; string = an account key
  const [selectedCat,  setSelectedCat]  = useState(null)
  const [selectedAcct, setSelectedAcct] = useState(null)
  const [chartType,    setChartType]    = useState('bar')
  const [notes,        setNotes]        = useState('')
  const [localDateRange, setLocalDateRange] = useState(globalDateRange || { preset:'fiscal-ytd', startDate:'2025-06-01', endDate:'2026-05-31' })
  const [showLocalPicker, setShowLocalPicker] = useState(false)
  const localPickerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) { if(localPickerRef.current&&!localPickerRef.current.contains(e.target)) setShowLocalPicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const catKeys    = Object.keys(team.cats)
  const variance   = team.actual - team.budget
  const varPct     = team.budget > 0 ? (variance / team.budget * 100) : 0

  // Scale team data to local date range
  const localMonths = (() => {
    const s = localDateRange?.startDate || '2025-06-01'
    const e = localDateRange?.endDate   || '2026-05-31'
    return FISCAL_MONTHS.filter(m => m.date >= s && m.date <= e).length
  })()
  const localFraction = localMonths / 12
  const scaledTeam = {
    ...team,
    actual:  Math.round(team.actual  * localFraction),
    budget:  Math.round(team.budget  * localFraction),
    cats: Object.fromEntries(
      Object.entries(team.cats).map(([k,v]) => [k, {
        budget:    Math.round(v.budget    * localFraction),
        actual:    Math.round(v.actual    * localFraction),
        priorYear: Math.round(v.priorYear * localFraction),
      }])
    ),
  }
  const scaledVariance   = scaledTeam.actual - scaledTeam.budget
  const scaledVarPct     = scaledTeam.budget > 0 ? (scaledVariance / scaledTeam.budget * 100) : 0

  // ── chart data based on drill-down level
  // Prefer real per-month data when supplied; fall back to spread-pattern approximation
  const allMonthly = (team.realMonthly && team.realMonthly.length > 0)
    ? (() => {
        // Filter to local date range
        const s = (localDateRange?.startDate || '2000-01').slice(0,7)
        const e = (localDateRange?.endDate   || '2099-12').slice(0,7)
        return team.realMonthly.filter(r => r.period >= s && r.period <= e)
      })()
    : teamMonthly(scaledTeam.cats, team.spreadKey)

  // Category-level: stacked accounts for the selected category
  const catAccounts = selectedCat ? (TEAM_CAT_ACCOUNTS[selectedCat] || []) : []
  const catActual   = selectedCat ? scaledTeam.cats[selectedCat]?.actual || 0 : 0

  const catAcctMonthly = catAccounts.length > 0
    ? TEAM_MONTHS.map((month, i) => {
        const obj = { month }
        catAccounts.forEach(acct => {
          const sp    = SPREADS[team.spreadKey] || SPREADS.flat
          const norm  = sp.reduce((s, x) => s + x, 0)
          obj[acct.key] = Math.round(catActual * acct.share * sp[i] / norm)
        })
        return obj
      })
    : []

  // Account-level: single account monthly trend
  const acctData = selectedAcct && selectedCat
    ? (() => {
        const acct = catAccounts.find(a => a.key === selectedAcct)
        if (!acct) return []
        return accountMonthly(selectedCat, catActual, acct.share, team.spreadKey)
          .map(row => ({ month: row.month, value: row.value }))
      })()
    : []

  function handleCatClick(catKey) {
    if (selectedCat === catKey) {
      // clicking same cat → go back to all
      setSelectedCat(null); setSelectedAcct(null)
    } else {
      setSelectedCat(catKey); setSelectedAcct(null)
    }
  }

  function handleAcctClick(acctKey) {
    setSelectedAcct(prev => prev === acctKey ? null : acctKey)
  }

  function handleBackToAll() { setSelectedCat(null); setSelectedAcct(null) }

  // Chart title / subtitle
  const chartTitle = selectedAcct
    ? (catAccounts.find(a=>a.key===selectedAcct)?.label || selectedAcct) + ' — Monthly Trend'
    : selectedCat
      ? (TEAM_CAT_MAP[selectedCat]?.label || selectedCat) + ' — Account Breakdown'
      : 'Monthly Spend by Category'
  const chartSub = selectedAcct
    ? 'Single account monthly spending'
    : selectedCat
      ? 'Accounts within this category'
      : 'Seasonal distribution of annual actuals'

  // Shared recharts elements
  const xAxis = <XAxis dataKey="month" tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}/>
  const yAxis = <YAxis tick={{fontSize:10,fill:'var(--chart-tick)'}} axisLine={false} tickLine={false}
    tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}K`:v}/>
  const grid  = <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false}/>
  const tip   = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>formatCurrency(v,{compact:false})}/>
  const leg   = <Legend wrapperStyle={{fontSize:'10px',paddingTop:'8px'}}/>

  function renderChart() {
    // ── Account selected → single line/area/bar
    if (selectedAcct && acctData.length > 0) {
      const acct  = catAccounts.find(a => a.key === selectedAcct)
      const color = TEAM_CAT_MAP[selectedCat]?.color || '#00B3E5'
      const sharedProps = { data: acctData, margin:{top:5,right:5,left:-10,bottom:0} }
      if (chartType==='bar') return (
        <BarChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          <Bar dataKey="value" name={acct?.label||selectedAcct} fill={color} radius={[3,3,0,0]} opacity={0.85}/>
        </BarChart>
      )
      if (chartType==='area') return (
        <AreaChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          <Area type="monotone" dataKey="value" name={acct?.label||selectedAcct} stroke={color} fill={color} fillOpacity={0.35} strokeWidth={2.5}/>
        </AreaChart>
      )
      return (
        <LineChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          <Line type="monotone" dataKey="value" name={acct?.label||selectedAcct} stroke={color} strokeWidth={2.5} dot={false} activeDot={{r:4}}/>
        </LineChart>
      )
    }

    // ── Category selected → stacked accounts
    if (selectedCat && catAcctMonthly.length > 0) {
      const catColor = TEAM_CAT_MAP[selectedCat]?.color || '#00B3E5'
      // Generate lighter shades for accounts
      const acctColors = catAccounts.map((_, i) => {
        const hsl = catColor.startsWith('#')
          ? `${catColor}` : catColor
        // Use opacity variants approximated by mixing with white
        return [catColor, '#64B5B1', '#A0D8D5', '#C8ECEA', '#E0F5F4'][i % 5]
      })
      const sharedProps = { data: catAcctMonthly, margin:{top:5,right:5,left:-10,bottom:0} }
      if (chartType==='bar') return (
        <BarChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          {catAccounts.map((acct,i)=>(
            <Bar key={acct.key} dataKey={acct.key} stackId="a" name={acct.label}
              fill={acctColors[i]} radius={i===catAccounts.length-1?[3,3,0,0]:[0,0,0,0]}/>
          ))}
        </BarChart>
      )
      if (chartType==='area') return (
        <AreaChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          {catAccounts.map((acct,i)=>(
            <Area key={acct.key} type="monotone" dataKey={acct.key} stackId="1" name={acct.label}
              stroke={acctColors[i]} fill={acctColors[i]} fillOpacity={0.7}/>
          ))}
        </AreaChart>
      )
      return (
        <LineChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
          {catAccounts.map((acct,i)=>(
            <Line key={acct.key} type="monotone" dataKey={acct.key} name={acct.label}
              stroke={acctColors[i]} strokeWidth={2} dot={false}/>
          ))}
        </LineChart>
      )
    }

    // ── All categories → stacked categories
    const sharedProps = { data: allMonthly, margin:{top:5,right:5,left:-10,bottom:0} }
    if (chartType==='bar') return (
      <BarChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
        {catKeys.map((key,i)=>(
          <Bar key={key} dataKey={key} stackId="a" name={TEAM_CAT_MAP[key]?.label||key}
            fill={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
            radius={i===catKeys.length-1?[3,3,0,0]:[0,0,0,0]}/>
        ))}
      </BarChart>
    )
    if (chartType==='area') return (
      <AreaChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
        {catKeys.map((key,i)=>(
          <Area key={key} type="monotone" dataKey={key} stackId="1" name={TEAM_CAT_MAP[key]?.label||key}
            stroke={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
            fill={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color} fillOpacity={0.65}/>
        ))}
      </AreaChart>
    )
    return (
      <LineChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
        {catKeys.map((key,i)=>(
          <Line key={key} type="monotone" dataKey={key} name={TEAM_CAT_MAP[key]?.label||key}
            stroke={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color} strokeWidth={2} dot={false}/>
        ))}
      </LineChart>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
           onClick={e=>e.stopPropagation()}>

        {/* ── Modal header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{color:'var(--neutral-60)'}}>Team Detail</p>
            <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manager: {team.manager}{team.code ? ` · ${team.code}` : ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Local date range control */}
            <div className="relative" ref={localPickerRef}>
              <button onClick={() => setShowLocalPicker(v=>!v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors">
                <Calendar size={11} className="text-gray-400"/>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Period</span>
                <span>{presetLabel(localDateRange.preset)}</span>
                <ChevronDown size={11} className="text-gray-400"/>
              </button>
              {showLocalPicker && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <ELTDateRangePicker
                    dateRange={localDateRange}
                    org={{ fiscalYearStartMonth:6, fiscalYearStartYear:2025, operatingYearStartMonth:1, operatingYearStartYear:2026 }}
                    onApplyPreset={p => { const r = getELTPresetRange(p, {fiscalYearStartMonth:6,fiscalYearStartYear:2025,operatingYearStartMonth:1,operatingYearStartYear:2026}); setLocalDateRange({preset:p,...r}) }}
                    onApplyCustom={(s,e) => setLocalDateRange({preset:'custom',startDate:s,endDate:e})}
                    onClose={() => setShowLocalPicker(false)}/>
                </div>
              )}
            </div>
            <button
              onClick={() => { onClose(); navigate(`/team/${team.id}/briefing`) }}
              disabled={!team?.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${team?.id ? 'text-white bg-gray-900 hover:bg-gray-700 cursor-pointer' : 'text-gray-400 bg-gray-100 cursor-not-allowed opacity-60'}`}>
              <LayoutDashboard size={12}/> Open Dashboard
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* ── Modal body: stats + two-column main ── */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 px-6 pt-5 pb-4 flex-shrink-0">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Actual</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(scaledTeam.actual)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Budget</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(scaledTeam.budget)}</div>
            </div>
            <div className={`rounded-xl p-3 text-center ${scaledVariance>0?'bg-red-50':'bg-emerald-50'}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Variance</div>
              <div className={`text-lg font-bold ${scaledVariance>0?'text-red-600':'text-emerald-600'}`}>
                {scaledVariance>0?'+':''}{formatCurrency(scaledVariance)}
              </div>
              <div className={`text-[10px] font-medium mt-0.5 ${scaledVariance>0?'text-red-500':'text-emerald-500'}`}>
                {scaledVarPct>0?'+':''}{scaledVarPct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Two-column: left nav + right content */}
          <div className="flex flex-1 gap-0 overflow-hidden border-t border-gray-100">

            {/* ── Left: drill-down nav ── */}
            <div className="w-52 flex-shrink-0 border-r border-gray-100 overflow-y-auto py-3 px-2 space-y-0.5">
              {/* All categories link */}
              <button onClick={handleBackToAll}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${!selectedCat ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
                <BarChart2 size={11}/> All Categories
              </button>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300">Categories</span>
              </div>
              {catKeys.map((key, i) => {
                const cat   = team.cats[key]
                const label = TEAM_CAT_MAP[key]?.label || key
                const color = TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color
                const isActive = selectedCat === key
                const accts = TEAM_CAT_ACCOUNTS[key] || []
                return (
                  <div key={key}>
                    <button onClick={()=>handleCatClick(key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${isActive ? 'bg-gray-100 text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:color}}/>
                      <span className="flex-1 truncate">{label}</span>
                      {accts.length > 0 && <ChevronRight size={10} className={`transition-transform ${isActive?'rotate-90 text-gray-700':'text-gray-300'}`}/>}
                    </button>
                    {/* Account sub-items when category selected */}
                    {isActive && accts.map(acct => (
                      <button key={acct.key} onClick={()=>handleAcctClick(acct.key)}
                        className={`w-full text-left pl-8 pr-3 py-1.5 rounded-lg text-[10px] transition-colors flex items-center gap-1.5 ${selectedAcct===acct.key ? 'bg-gray-900 text-white font-medium' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'}`}>
                        <span className="w-1 h-1 rounded-full bg-current flex-shrink-0"/>
                        <span className="truncate">{acct.label}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
              {/* Unresolved warnings for this team */}
              {Object.values(team.warnItems || {}).some(v => (v?.actual || 0) + (v?.budget || 0) > 0) && (
                <div className="px-2 pt-2">
                  <UnresolvedSection warnMap={team.warnItems}/>
                </div>
              )}
            </div>

            {/* ── Right: chart + table + notes ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Breadcrumb */}
              {(selectedCat || selectedAcct) && (
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <button onClick={handleBackToAll} className="hover:text-gray-700 transition-colors font-medium">All Categories</button>
                  {selectedCat && <>
                    <ChevronRight size={10}/>
                    <button onClick={()=>setSelectedAcct(null)} className={`transition-colors font-medium ${!selectedAcct?'text-gray-700':'hover:text-gray-700'}`}>
                      {TEAM_CAT_MAP[selectedCat]?.label || selectedCat}
                    </button>
                  </>}
                  {selectedAcct && <>
                    <ChevronRight size={10}/>
                    <span className="text-gray-700 font-medium">
                      {catAccounts.find(a=>a.key===selectedAcct)?.label || selectedAcct}
                    </span>
                  </>}
                </div>
              )}

              {/* Chart */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-700">{chartTitle}</div>
                    <div className="text-[10px] text-gray-400">{chartSub}</div>
                  </div>
                  <ChartTypeToggle type={chartType} onChange={setChartType}/>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  {renderChart()}
                </ResponsiveContainer>
              </div>

              {/* ── Detail table: accounts or categories depending on drill level ── */}
              {selectedCat && catAccounts.length > 0 ? (
                /* Account breakdown table */
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">
                    {selectedAcct
                      ? (catAccounts.find(a=>a.key===selectedAcct)?.label) + ' — Detail'
                      : (TEAM_CAT_MAP[selectedCat]?.label || selectedCat) + ' — Accounts'}
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400">Account</th>
                          <th className="text-right px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400">Actual</th>
                          <th className="text-right px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400">Budget</th>
                          <th className="text-right px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var $</th>
                          <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catAccounts.map(acct => {
                          const catData = scaledTeam.cats[selectedCat]
                          const aActual = Math.round(catData.actual * acct.share)
                          const aBudget = Math.round(catData.budget * acct.share)
                          const av      = aActual - aBudget
                          const avPct   = aBudget > 0 ? (av/aBudget*100) : 0
                          const isHighlight = selectedAcct === acct.key
                          return (
                            <tr key={acct.key}
                              onClick={()=>handleAcctClick(acct.key)}
                              className={`border-b border-gray-50 cursor-pointer transition-colors ${isHighlight?'bg-gray-900':'hover:bg-gray-50'}`}>
                              <td className={`px-4 py-2 font-medium ${isHighlight?'text-white':'text-gray-700'}`}>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-current flex-shrink-0"/>
                                  {acct.label}
                                </div>
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums ${isHighlight?'text-white':'text-gray-700'}`}>{formatCurrency(aActual)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums ${isHighlight?'text-gray-300':'text-gray-400'}`}>{formatCurrency(aBudget)}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-medium ${isHighlight?(av>0?'text-red-300':'text-emerald-300'):(av>0?'text-red-600':'text-emerald-600')}`}>
                                {av>0?'+':''}{formatCurrency(av)}
                              </td>
                              <td className={`px-4 py-2 text-right tabular-nums font-medium ${isHighlight?(avPct>0?'text-red-300':'text-emerald-300'):(avPct>0?'text-red-600':'text-emerald-600')}`}>
                                {avPct>0?'+':''}{avPct.toFixed(1)}%
                              </td>
                            </tr>
                          )
                        })}
                        {/* Category total */}
                        <tr className="bg-gray-900">
                          <td className="px-4 py-2 font-bold text-white">Total — {TEAM_CAT_MAP[selectedCat]?.label||selectedCat}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{formatCurrency(scaledTeam.cats[selectedCat].actual)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-400">{formatCurrency(scaledTeam.cats[selectedCat].budget)}</td>
                          {(() => {
                            const cv = scaledTeam.cats[selectedCat].actual - scaledTeam.cats[selectedCat].budget
                            const cvp = scaledTeam.cats[selectedCat].budget > 0 ? cv/scaledTeam.cats[selectedCat].budget*100 : 0
                            return <>
                              <td className={`px-3 py-2 text-right tabular-nums font-bold ${cv>0?'text-red-400':'text-emerald-400'}`}>{cv>0?'+':''}{formatCurrency(cv)}</td>
                              <td className={`px-4 py-2 text-right tabular-nums font-bold ${cvp>0?'text-red-400':'text-emerald-400'}`}>{cvp>0?'+':''}{cvp.toFixed(1)}%</td>
                            </>
                          })()}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* All-categories table */
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-2">Category Breakdown</div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Line Item</th>
                          <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Actual</th>
                          <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Budget</th>
                          <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var $</th>
                          <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var %</th>
                          <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">PY Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catKeys.map((key,i) => {
                          const cat   = scaledTeam.cats[key]
                          const label = TEAM_CAT_MAP[key]?.label || key
                          const color = TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color
                          const v     = cat.actual - cat.budget
                          const vPct  = cat.budget > 0 ? (v/cat.budget*100) : 0
                          const vsPY  = cat.actual - (cat.priorYear||0)
                          return (
                            <tr key={key} onClick={()=>handleCatClick(key)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:color}}/>
                                  <span className="font-medium text-gray-700">{label}</span>
                                  {TEAM_CAT_ACCOUNTS[key]?.length > 0 && <ChevronRight size={10} className="text-gray-300"/>}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{formatCurrency(cat.actual)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{formatCurrency(cat.budget)}</td>
                              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${v>0?'text-red-600':'text-emerald-600'}`}>
                                {v>0?'+':''}{formatCurrency(v)}
                              </td>
                              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${v>0?'text-red-600':'text-emerald-600'}`}>
                                {v>0?'+':''}{vPct.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                                {cat.priorYear ? formatCurrency(cat.priorYear) : '—'}
                                {cat.priorYear && <span className={`ml-1 text-[9px] font-medium ${vsPY>0?'text-red-500':'text-emerald-500'}`}>
                                  {vsPY>0?'▲':'▼'}{Math.abs(vsPY/cat.priorYear*100).toFixed(0)}%
                                </span>}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-gray-900">
                          <td className="px-4 py-2.5 font-bold text-white text-xs">Total</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-white">{formatCurrency(scaledTeam.actual)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{formatCurrency(scaledTeam.budget)}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${scaledVariance>0?'text-red-400':'text-emerald-400'}`}>
                            {scaledVariance>0?'+':''}{formatCurrency(scaledVariance)}
                          </td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${scaledVarPct>0?'text-red-400':'text-emerald-400'}`}>
                            {scaledVarPct>0?'+':''}{scaledVarPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                            {formatCurrency(catKeys.reduce((s,k)=>s+(scaledTeam.cats[k].priorYear||0),0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Manager notes */}
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Manager Notes</div>
                <textarea
                  value={notes} onChange={e=>setNotes(e.target.value)}
                  placeholder="Add context, action items, or notes about this team's performance..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 placeholder-gray-300"/>
              </div>

            </div>{/* end right column */}
          </div>{/* end two-column */}
        </div>{/* end modal body */}
      </div>{/* end modal */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Tab — full enterprise layout
// ─────────────────────────────────────────────────────────────────────────────

function TeamsTab({ dateRange, activeBudget, orgConfig }) {
  const { actuals, budgetFlat } = useApp()
  const navigate = useNavigate()

  const { startDate, endDate } = dateRange
  const startM = (startDate || '2025-10-01').slice(0,7)
  const endM   = (endDate   || '2026-09-30').slice(0,7)
  const rangeLabel = presetLabel(dateRange?.preset)

  // Fetch team manager names + codes once
  const [teamManagers, setTeamManagers] = useState({})
  const [teamCodes,    setTeamCodes]    = useState({})
  useEffect(() => {
    supabase.from('teams').select('team_name, manager_name, team_code')
      .then(({ data }) => {
        if (!data) return
        const m = {}, c = {}
        data.forEach(t => {
          if (t.team_name) {
            m[t.team_name] = t.manager_name || ''
            c[t.team_name] = t.team_code    || ''
          }
        })
        setTeamManagers(m)
        setTeamCodes(c)
      })
  }, [])

  // Build per-team actuals (expenses only, in date range).
  // Transactions without a team_name are tallied separately as unassigned — they
  // represent real spend that either (a) was imported without a dept_code,
  // (b) has a dept_code that isn't linked to any team in the registry, or
  // (c) belonged to a team that was later deleted (on delete set null cascade).
  const { teamActualMap, teamIdMap, unassignedActual, unassignedDeptCodes } = useMemo(() => {
    const actualMap = {}, idMap = {}
    let unassigned = 0
    const deptCodes = new Set()
    for (const t of actuals) {
      if (!t.date || t.date < startDate || t.date > endDate) continue
      if (t.record_type === 'income') continue
      if (!t.team_name) {
        unassigned += Math.abs(t.amount || 0)
        if (t.dept_code) deptCodes.add(t.dept_code)
        else deptCodes.add('(no dept)')
        continue
      }
      const name = t.team_name
      actualMap[name] = (actualMap[name] || 0) + Math.abs(t.amount || 0)
      if (t.team_id && !idMap[name]) idMap[name] = t.team_id
    }
    return { teamActualMap: actualMap, teamIdMap: idMap, unassignedActual: unassigned, unassignedDeptCodes: deptCodes }
  }, [actuals, startDate, endDate])

  // Build per-team budget (selected scenario, in date range).
  // Budget rows without a team_name are tallied as unassigned budget.
  const { teamBudgetMap, unassignedBudget } = useMemo(() => {
    const m = {}
    let unassigned = 0
    for (const b of budgetFlat) {
      if (b.scenario !== activeBudget) continue
      if (b.record_type === 'income') continue
      if (!b.period || b.period < startM || b.period > endM) continue
      if (!b.team_name) {
        unassigned += Math.abs(b.amount || 0)
        continue
      }
      const name = b.team_name
      m[name] = (m[name] || 0) + Math.abs(b.amount || 0)
    }
    return { teamBudgetMap: m, unassignedBudget: unassigned }
  }, [budgetFlat, activeBudget, startM, endM])

  // Merge into team rows (assigned teams only — unassigned handled separately below)
  const teams = useMemo(() => {
    const allNames = new Set([...Object.keys(teamActualMap), ...Object.keys(teamBudgetMap)])
    return [...allNames].map(name => ({
      name,
      id:     teamIdMap[name] || null,
      actual: teamActualMap[name] || 0,
      budget: teamBudgetMap[name] || 0,
    }))
  }, [teamActualMap, teamBudgetMap, teamIdMap])

  const hasUnassigned   = unassignedActual > 0
  // Totals include unassigned so the page reconciles to real org spend
  const totalActual   = teams.reduce((s,t) => s + t.actual,  0) + unassignedActual
  const totalBudget   = teams.reduce((s,t) => s + t.budget,  0) + unassignedBudget
  const totalVariance = totalActual - totalBudget
  const overBudget    = teams.filter(t => t.budget > 0 && t.actual > t.budget).length

  const [sortKey, setSortKey] = useState('actual')
  const [sortDir, setSortDir] = useState(-1)
  const [selectedTeam, setSelectedTeam] = useState(null)

  // Build drawer-compatible team object from real actuals + budget for a team row
  function buildDrawerTeam(teamRow) {
    const teamTxs = actuals.filter(t => {
      const p = t.period || (t.date ? t.date.slice(0,7) : null)
      return t.team_name === teamRow.name && t.record_type !== 'income' && p && p >= startM && p <= endM
    })
    // Categorise using the same keyword matcher used everywhere else
    function catGroup(t) {
      if (_catMatch(t.category, _STAFF_W)) return 'staff'
      if (_catMatch(t.category, _CONTRACT_W)) return 'contract'
      if (_catMatch(t.category, _TECH_W)) return 'technology'
      if (_catMatch(t.category, _TRAVEL_W)) return 'travel'
      return 'other'
    }
    // Per-category actuals totals
    const catActualTotals = {}
    for (const t of teamTxs) {
      const key = catGroup(t)
      catActualTotals[key] = (catActualTotals[key] || 0) + Math.abs(t.amount || 0)
    }
    // Per-category budget totals — exclude orphaned rows (account_id not in chart_of_accounts)
    // so they don't inflate "Uncategorized" with $0 actual / phantom budget.
    const teamBudTxs = budgetFlat.filter(b =>
      b.team_name === teamRow.name && b.scenario === activeBudget &&
      b.record_type !== 'income' && b.period && b.period >= startM && b.period <= endM &&
      b._hasAccount !== false   // skip orphaned budget rows
    )
    const catBudgetTotals = {}
    for (const b of teamBudTxs) {
      const key = catGroup(b)
      catBudgetTotals[key] = (catBudgetTotals[key] || 0) + Math.abs(b.amount || 0)
    }
    // Per-category prior year actuals (same date range, one year back)
    const pyStartM = `${parseInt(startM.slice(0,4))-1}${startM.slice(4)}`
    const pyEndM   = `${parseInt(endM.slice(0,4))-1}${endM.slice(4)}`
    const pyTeamTxs = actuals.filter(t => {
      const p = t.period || (t.date ? t.date.slice(0,7) : null)
      return t.team_name === teamRow.name && t.record_type !== 'income' && p && p >= pyStartM && p <= pyEndM
    })
    const catPYTotals = {}
    for (const t of pyTeamTxs) {
      const key = catGroup(t)
      catPYTotals[key] = (catPYTotals[key] || 0) + Math.abs(t.amount || 0)
    }
    // Merge into cats shape TeamDetailDrawer expects
    const allCatKeys = new Set([...Object.keys(catActualTotals), ...Object.keys(catBudgetTotals)])
    const cats = {}
    for (const key of allCatKeys) {
      cats[key] = { actual: catActualTotals[key]||0, budget: catBudgetTotals[key]||0, priorYear: catPYTotals[key]||0 }
    }
    // Remove categories where BOTH actual and budget are $0 — these are orphaned
    // budget rows that slipped through (e.g. account_id with no matching chart entry)
    // or historical categories with no activity in the selected range.
    for (const key of Object.keys(cats)) {
      if (cats[key].actual === 0 && cats[key].budget === 0) delete cats[key]
    }
    // Real monthly data per category (for the category chart)
    const byPeriod = {}
    for (const t of teamTxs) {
      const p = t.period || (t.date ? t.date.slice(0,7) : null)
      if (!p) continue
      const key = catGroup(t)
      if (!byPeriod[p]) byPeriod[p] = { period: p }
      byPeriod[p][key] = (byPeriod[p][key] || 0) + Math.abs(t.amount || 0)
    }
    const realMonthly = Object.values(byPeriod).sort((a,b)=>a.period.localeCompare(b.period)).map(row => {
      const [y,m] = row.period.split('-')
      return { ...row, month: new Date(parseInt(y),parseInt(m)-1,1).toLocaleString('en-US',{month:'short'})+' '+y.slice(2) }
    })

    // Warning summary for this team's actuals in range
    const teamWarnItems = {}
    for (const t of teamTxs) {
      for (const w of (t._warnings || [])) {
        if (!teamWarnItems[w]) teamWarnItems[w] = { actual: 0, count: 0 }
        teamWarnItems[w].actual += Math.abs(t.amount || 0)
        teamWarnItems[w].count++
      }
    }
    // Also budget unresolved for this team
    for (const b of teamBudTxs) {
      for (const w of (b._warnings || [])) {
        if (!teamWarnItems[w]) teamWarnItems[w] = { actual: 0, budget: 0, count: 0 }
        teamWarnItems[w].budget = (teamWarnItems[w].budget || 0) + Math.abs(b.amount || 0)
      }
    }

    return {
      name:       teamRow.name,
      id:         teamRow.id,
      code:       teamCodes[teamRow.name] || '',
      manager:    teamManagers[teamRow.name] || 'Not assigned',
      actual:     teamRow.actual,
      budget:     teamRow.budget,
      spreadKey:  'flat',
      cats:       Object.keys(cats).length ? cats : { other: { actual: teamRow.actual, budget: teamRow.budget, priorYear: pyTeamTxs.reduce((s,t)=>s+Math.abs(t.amount||0),0) } },
      realMonthly,
      warnItems:  teamWarnItems,
    }
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(key === 'name' ? 1 : -1) }
  }

  const sorted = [...teams].sort((a,b) => {
    let av, bv
    if (sortKey==='name')    { av=a.name;               bv=b.name }
    if (sortKey==='actual')  { av=a.actual;             bv=b.actual }
    if (sortKey==='budget')  { av=a.budget;             bv=b.budget }
    if (sortKey==='variance'){ av=a.actual-a.budget;    bv=b.actual-b.budget }
    if (sortKey==='pct')     { av=a.budget>0?a.actual/a.budget:0; bv=b.budget>0?b.actual/b.budget:0 }
    if (sortKey==='share')   { av=totalActual>0?a.actual/totalActual:0; bv=totalActual>0?b.actual/totalActual:0 }
    if (typeof av === 'string') return sortDir * av.localeCompare(bv)
    return sortDir * (av - bv)
  })

  function SortTh({ col, children, right=false }) {
    const active = sortKey === col
    return (
      <th onClick={() => toggleSort(col)}
        className={`py-3 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors hover:text-gray-600
          ${right ? 'text-right px-4' : 'text-left px-6'}
          ${active ? 'text-gray-800' : 'text-gray-400'}`}>
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown size={10} className={active ? 'opacity-80' : 'opacity-30'}/>
        </span>
      </th>
    )
  }

  return (
    <>
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start gap-4 pb-2 border-b border-gray-100">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{backgroundColor: orgConfig?.primaryColor || 'var(--color-primary)'}}>
          <Users size={18} className="text-white"/>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{color:'var(--neutral-60)'}}>
            Financial Summary / Team Breakdown
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-bold tracking-tight text-gray-900">Team Spend</span>
            <span className="text-xl font-extralight text-gray-300 leading-none">|</span>
            <span className="text-xl font-semibold text-gray-500">{presetLabel(dateRange.preset)}</span>
          </div>
        </div>
      </div>

      {/* 4 KPI summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:`Total Actuals · ${rangeLabel}`, value: formatCurrency(totalActual), sub: null, positive: true },
          { label:`Total Budget · ${rangeLabel}`,  value: formatCurrency(totalBudget), sub: null, positive: true },
          { label:`Variance · ${rangeLabel}`, value: (totalVariance>0?'+':'')+formatCurrency(totalVariance),
            sub: (totalVariance>0?'+':'')+((totalVariance/totalBudget)*100).toFixed(1)+'% of budget',
            positive: totalVariance <= 0 },
          { label:'Teams Over Budget', value: String(overBudget),
            sub: `${teams.length - overBudget} of ${teams.length} within budget`,
            positive: overBudget === 0 },
        ].map((card,i) => (
          <div key={i} className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>{card.label}</div>
            <div className={`text-3xl font-bold mb-1 ${i>=2 ? (card.positive?'text-emerald-600':'text-red-600') : 'text-gray-900'}`}>
              {card.value}
            </div>
            {card.sub && <div className={`text-xs font-medium ${card.positive?'text-emerald-500':'text-red-500'}`}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Teams table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortTh col="name">Team</SortTh>
              <SortTh col="actual" right>Actual</SortTh>
              <SortTh col="budget" right>Budget</SortTh>
              <SortTh col="variance" right>Variance</SortTh>
              <SortTh col="pct" right>Var %</SortTh>
              <SortTh col="share" right>% of Total</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(team => {
              const v    = team.actual - team.budget
              const vPct = team.budget > 0 ? (v/team.budget*100) : 0
              const share = totalActual > 0 ? (team.actual/totalActual*100) : 0
              const isOverBudget = team.budget > 0 && v > 0
              return (
                <tr key={team.name}
                  onClick={() => setSelectedTeam(buildDrawerTeam(team))}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors group cursor-pointer">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 group-hover:text-teal-700 transition-colors">{team.name}</span>
                      {team.id && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/team/${team.id}/briefing`) }}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-teal-200 text-teal-600 hover:bg-teal-50 transition-all">
                          <ExternalLink size={9}/> Dashboard
                        </button>
                      )}
                    </div>
                    {teamManagers[team.name] && (
                      <div className="text-[10px] text-gray-400 mt-0.5">{teamManagers[team.name]}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-700">{formatCurrency(team.actual,{compact:false})}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-400">{formatCurrency(team.budget,{compact:false})}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${isOverBudget?'text-red-600':'text-emerald-600'}`}>
                    {v>0?'+':''}{formatCurrency(v,{compact:false})}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium text-xs ${isOverBudget?'text-red-500':'text-emerald-500'}`}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isOverBudget?'bg-red-50':'bg-emerald-50'}`}>
                      {vPct>0?'+':''}{team.budget > 0 ? vPct.toFixed(1)+'%' : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${Math.min(share*3,100)}%`,backgroundColor:'var(--color-primary)'}}/>
                      </div>
                      <span className="text-xs tabular-nums text-gray-500 w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {/* Unassigned row */}
            {hasUnassigned && (
              <tr className="border-b border-amber-100 bg-amber-50/40">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={13} className="text-amber-500 flex-shrink-0"/>
                    <span className="font-medium text-amber-800">Unassigned</span>
                  </div>
                  <div className="text-[10px] text-amber-600 mt-0.5">
                    {unassignedDeptCodes.size} dept code{unassignedDeptCodes.size !== 1 ? 's' : ''} — no team mapping
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700">{formatCurrency(unassignedActual,{compact:false})}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400">—</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400">—</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-600">—</span>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs tabular-nums text-amber-600">
                      {totalActual > 0 ? ((unassignedActual/totalActual)*100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </td>
              </tr>
            )}
            {/* Totals */}
            <tr className="bg-gray-900">
              <td className="px-6 py-3 font-bold text-white">Total — All Teams</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-white">{formatCurrency(totalActual,{compact:false})}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-400">{formatCurrency(totalBudget,{compact:false})}</td>
              <td className={`px-4 py-3 text-right tabular-nums font-bold ${totalVariance>0?'text-red-400':'text-emerald-400'}`}>
                {totalVariance>0?'+':''}{formatCurrency(totalVariance,{compact:false})}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${totalVariance>0?'bg-red-900/50 text-red-300':'bg-emerald-900/50 text-emerald-300'}`}>
                  {totalVariance>0?'+':''}{((totalVariance/totalBudget)*100).toFixed(1)}%
                </span>
              </td>
              <td className="px-6 py-3 text-right text-gray-400 text-xs">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Unassigned footnote — now with actionable warning links */}
      {hasUnassigned && (
        <UnresolvedSection
          warnMap={(() => {
            // Aggregate unassigned actuals by specific warn type
            const map = {}
            for (const t of actuals) {
              if (!t.date || t.date < startDate || t.date > endDate) continue
              if (t.record_type === 'income') continue
              if (t.team_name) continue  // assigned — skip
              for (const w of (t._warnings || [])) {
                if (!map[w]) map[w] = { actual: 0, count: 0 }
                map[w].actual += Math.abs(t.amount || 0)
                map[w].count++
              }
              // Fallback: if no _warnings but still unassigned, treat as no_team
              if (!(t._warnings?.length)) {
                if (!map.no_team) map.no_team = { actual: 0, count: 0 }
                map.no_team.actual += Math.abs(t.amount || 0)
                map.no_team.count++
              }
            }
            return map
          })()}
          className="mt-3"
        />
      )}

    </div>

    {selectedTeam && (
      <TeamDetailDrawer team={selectedTeam} globalDateRange={dateRange} onClose={() => setSelectedTeam(null)}/>
    )}

    <CommentPinFAB
      page="elt-teams"
      sourceDashboard="Executive"
      sourcePage="Teams"
      rightClassName="right-6"
    />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPES = ['Statement of Activity','Balance Sheet','Cash Flow Statement','P&L Summary','Budget vs Actual','Board Report','Audit Report','Other']
const DOC_FILE_TYPES = ['pdf','xlsx','png','jpg','csv']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function docIcon(fileType) {
  if (fileType==='xlsx'||fileType==='csv') return { bg:'bg-emerald-50', fg:'text-emerald-600' }
  if (fileType==='png'||fileType==='jpg') return { bg:'bg-blue-50',    fg:'text-blue-600' }
  return { bg:'bg-red-50', fg:'text-red-600' }
}

function docMonthToDate(month, year) {
  const idx = MONTH_NAMES.indexOf(month)
  return new Date(year, idx < 0 ? 0 : idx, 1)
}

function DocumentsTab({ orgConfig }) {
  const pickerRef = useRef(null)
  const fileInputRef = useRef(null)

  const [docs, setDocs] = useState([
    { id:1, displayName:'Statement of Activity – April 2026', fileType:'pdf', type:'Statement of Activity', month:'April', year:2026, size:'245 KB', uploadedAt:'2026-04-22' },
    { id:2, displayName:'Balance Sheet – Q2 FY2026',          fileType:'pdf', type:'Balance Sheet',         month:'March', year:2026, size:'189 KB', uploadedAt:'2026-03-21' },
    { id:3, displayName:'Cash Flow Statement – YTD',          fileType:'xlsx',type:'Cash Flow Statement',   month:'April', year:2026, size:'312 KB', uploadedAt:'2026-04-30' },
  ])

  // Upload modal state
  const [showUpload,  setShowUpload]  = useState(false)
  const [upName,      setUpName]      = useState('')
  const [upType,      setUpType]      = useState(DOC_TYPES[0])
  const [upMonth,     setUpMonth]     = useState('April')
  const [upYear,      setUpYear]      = useState(new Date().getFullYear())
  const [upFileType,  setUpFileType]  = useState('pdf')
  const [upFileName,  setUpFileName]  = useState('')
  const [isDragOver,  setIsDragOver]  = useState(false)

  function openWithFile(file) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    setUpFileName(file.name)
    if (DOC_FILE_TYPES.includes(ext)) setUpFileType(ext)
    setUpName(file.name.replace(/\.[^.]+$/, ''))
    setShowUpload(true)
  }

  function handleDropZoneDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) openWithFile(file)
  }

  // Date range filter (local to documents)
  const [showPicker,   setShowPicker]   = useState(false)
  const [filterPreset, setFilterPreset] = useState('all')
  const [filterRange,  setFilterRange]  = useState(null)

  useEffect(() => {
    function handle(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function applyDocPreset(preset) {
    const range = getELTPresetRange(preset, orgConfig)
    setFilterPreset(preset)
    setFilterRange(range)
    setShowPicker(false)
  }
  function applyDocCustom(s, e) {
    setFilterPreset('custom')
    setFilterRange({ startDate: s, endDate: e })
    setShowPicker(false)
  }

  const filteredDocs = (filterPreset === 'all' || !filterRange) ? docs : docs.filter(doc => {
    const d = docMonthToDate(doc.month, doc.year)
    return d >= new Date(filterRange.startDate) && d <= new Date(filterRange.endDate)
  })

  function handleUpload() {
    if (!upName.trim()) return
    const newDoc = {
      id: Date.now(),
      displayName: upName.trim(),
      fileType: upFileType,
      type: upType,
      month: upMonth,
      year: Number(upYear),
      size: upFileName ? `${Math.round(Math.random()*400+50)} KB` : 'Unknown',
      uploadedAt: new Date().toISOString().slice(0,10),
    }
    setDocs(prev => [newDoc, ...prev])
    setShowUpload(false)
    setUpName(''); setUpType(DOC_TYPES[0]); setUpFileName('')
  }

  function removeDoc(id) {
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  const filterLabel = filterPreset === 'all' ? 'All time' : presetLabel(filterPreset)

  return (
    <div className="p-6 max-w-screen-lg mx-auto">

      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{color:'var(--neutral-60)'}}>Financial Documents</p>
          <p className="text-xs text-gray-400">{filteredDocs.length} of {docs.length} documents{filterPreset!=='all'?' in selected period':''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range filter */}
          <div className="relative" ref={pickerRef}>
            <button onClick={() => setShowPicker(v=>!v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${filterPreset!=='all'?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              <Calendar size={11}/>
              <span>{filterLabel}</span>
              <ChevronDown size={11}/>
            </button>
            {showPicker && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-72">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Filter Documents by Period</div>
                  <button onClick={() => { setFilterPreset('all'); setFilterRange(null); setShowPicker(false) }}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm font-medium mb-3 transition-all ${filterPreset==='all'?'bg-gray-900 text-white border-gray-900':'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                    All time
                  </button>
                  <ELTDateRangePicker
                    dateRange={{ preset: filterPreset, startDate: filterRange?.startDate||'', endDate: filterRange?.endDate||'' }}
                    org={orgConfig}
                    onApplyPreset={applyDocPreset}
                    onApplyCustom={applyDocCustom}
                    onClose={() => setShowPicker(false)}/>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{backgroundColor:'var(--color-primary)'}}>
            <Upload size={11}/> Upload document
          </button>
        </div>
      </div>

      {/* Document list */}
      {filteredDocs.length > 0 ? (
        <div className="bg-white rounded-xl overflow-hidden mb-4" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
          {filteredDocs.map((doc, i) => {
            const ic = docIcon(doc.fileType)
            return (
              <div key={doc.id}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group ${i>0?'border-t border-gray-50':''}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${ic.bg}`}>
                  <FileText size={15} className={ic.fg}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{doc.displayName}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {doc.type} · {doc.month} {doc.year} · {doc.size}
                    <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ic.bg} ${ic.fg}`}>{doc.fileType}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-gray-400 hidden group-hover:block">Uploaded {doc.uploadedAt}</span>
                  <button onClick={() => removeDoc(doc.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 text-center mb-4" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
          <FileText size={32} className="mx-auto mb-3 text-gray-200"/>
          <p className="text-sm font-medium text-gray-500 mb-1">
            {filterPreset==='all' ? 'No documents yet' : `No documents for ${filterLabel}`}
          </p>
          <p className="text-xs text-gray-400">
            {filterPreset==='all' ? 'Upload a document to get started.' : 'Try a wider date range or upload a new document.'}
          </p>
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => setShowUpload(true)}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDropZoneDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${isDragOver ? 'border-gray-500 bg-gray-100/70 scale-[1.01]' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50/50'}`}>
        <Upload size={22} className={`mx-auto mb-2 transition-colors ${isDragOver ? 'text-gray-500' : 'text-gray-300'}`}/>
        <p className="text-sm text-gray-400">{isDragOver ? 'Release to attach file…' : 'Drop files here or click to upload'}</p>
        <p className="text-xs text-gray-300 mt-1">PDF, Excel, PNG, JPG, CSV — attached to a specific month</p>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[440px] p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
            </div>
            <div className="space-y-4">
              {/* File picker (cosmetic) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">File</label>
                <div onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-400 transition-colors">
                  <Upload size={16} className="text-gray-300 flex-shrink-0"/>
                  <span className="text-sm text-gray-400">{upFileName || 'Click to choose a file…'}</span>
                  <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.png,.jpg,.csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) openWithFile(f) }}/>
                </div>
              </div>
              {/* Document name */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Document Name</label>
                <input type="text" value={upName} onChange={e=>setUpName(e.target.value)}
                  placeholder="e.g. Statement of Activity – April 2026"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"/>
              </div>
              {/* Document type */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Document Type</label>
                <select value={upType} onChange={e=>setUpType(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                  {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Month / Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Month</label>
                  <select value={upMonth} onChange={e=>setUpMonth(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                    {MONTH_NAMES.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Year</label>
                  <select value={upYear} onChange={e=>setUpYear(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                    {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              {/* File type override */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">File Format</label>
                <div className="flex gap-2">
                  {DOC_FILE_TYPES.map(ft=>(
                    <button key={ft} onClick={()=>setUpFileType(ft)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${upFileType===ft?'bg-gray-900 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {ft}
                    </button>
                  ))}
                </div>
              </div>
              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowUpload(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
                <button onClick={handleUpload} disabled={!upName.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                  style={{backgroundColor:'var(--color-primary)'}}>
                  Add Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Tab — CSV templates + append / replace logic
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PDF Export
// ─────────────────────────────────────────────────────────────────────────────

function generateReportHTML({ sections, dateRange, orgConfig, summaries, summaryMonth, eltData }) {
  // Use real data passed in; fall back to zero-filled stubs so the report always renders
  const EMPTY_ELT = {
    giving:      { contributions:0, merchandiseRevenue:0, otherIncome:0 },
    budget:      { contributions:0, merchandiseRevenue:0, otherIncome:0, staff:0, contract:0, technology:0, travel:0, otherGenAdmin:0 },
    priorYear:   { contributions:0, merchandiseRevenue:0, otherIncome:0, expenses:0 },
    expenseLines:{ staff:0, contract:0, technology:0, travel:0, otherGenAdmin:0 },
    forecast:    { contributions:0, merchandiseRevenue:0, otherIncome:0 },
    cash:        { current:0, priorMonth:0, priorYear:0 },
  }
  const d           = eltData || EMPTY_ELT
  const primaryColor = orgConfig?.primaryColor || '#00B3E5'
  const orgName     = orgConfig?.name || 'Organization'
  const totalGiving   = d.giving.contributions + d.giving.merchandiseRevenue + d.giving.otherIncome
  const totalForecast = d.forecast.contributions + d.forecast.merchandiseRevenue + d.forecast.otherIncome
  const totalBudgetExp= d.budget.staff+d.budget.contract+d.budget.technology+d.budget.travel+d.budget.otherGenAdmin
  const totalExpenses = Object.values(d.expenseLines).reduce((s,v)=>s+v,0)
  const netPosition   = totalGiving - totalExpenses
  const totalPriorGiv = d.priorYear.contributions + d.priorYear.merchandiseRevenue + d.priorYear.otherIncome
  const periodLabel   = presetLabel(dateRange?.preset) || 'Fiscal YTD'
  const reportDate    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  function fmt(n)         { return '$'+Math.abs(n).toLocaleString() }
  function pct(a,b)       { if(!b) return '—'; const p=((a-b)/Math.abs(b)*100).toFixed(1); return (a>=b?'+':'')+p+'%' }
  function vc(n,inv=false){ return (inv?(n<=0):(n>=0)) ? '#059669' : '#dc2626' }

  const css = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#191A1B;font-size:12px;line-height:1.6;background:#fff}
.page{padding:48px;max-width:860px;margin:0 auto}
h1{font-size:26px;font-weight:800;color:#191A1B;margin-bottom:6px}
h2{font-size:16px;font-weight:700;color:#191A1B;margin:28px 0 10px}
h3{font-size:13px;font-weight:600;color:#4F5669;margin:16px 0 6px}
.label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:${primaryColor};margin-bottom:4px}
.divider{border:none;border-top:1px solid #E4E8ED;margin:24px 0}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:14px;margin:12px 0 20px}
.kpi{background:#FBF7EF;border:1px solid #E4E8ED;border-radius:10px;padding:14px}
.kpi-val{font-size:22px;font-weight:800;color:#191A1B;margin:6px 0}
.kpi-row{font-size:10px;color:#6B7384;margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:11px;margin:10px 0 20px}
th{background:#FBF7EF;padding:7px 12px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6B7384;border-bottom:2px solid #E4E8ED;text-align:left}
.tr{text-align:right}
td{padding:7px 12px;border-bottom:1px solid #ECEFF3}
.sec-row td{background:#F6EFE1;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${primaryColor};padding:6px 12px}
.sub-row td{padding-left:28px}
.sum-row td{background:#FBF7EF;font-weight:600}
.tot-row td{background:#1A140E;color:#F8F8F8;font-weight:700}
.narrative{line-height:1.8;color:#4F5669;margin:8px 0 14px}
.takeaway{padding:10px 0;border-bottom:1px solid #ECEFF3}
.tk-num{font-weight:800;color:${primaryColor};margin-right:6px}
.footer{margin-top:40px;padding-top:14px;border-top:1px solid #E4E8ED;font-size:10px;color:#89929E;display:flex;justify-content:space-between}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:32px}}`

  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${orgName} — Executive Report</title><style>${css}</style></head><body><div class="page">`

  // ── Cover header
  html += `<div class="label">${orgName}</div><h1>Executive Financial Report</h1>
  <div style="color:#6B7384;font-size:12px;margin-bottom:28px">Period: ${periodLabel} &nbsp;·&nbsp; Generated ${reportDate}</div>
  <hr class="divider"/>`

  // ── Dashboard section
  if (sections.includes('dashboard')) {
    html += `<h2>Key Financial Metrics</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Total Giving YTD</div><div class="kpi-val">${fmt(totalGiving)}</div>
        <div class="kpi-row">vs Forecast: <strong style="color:${vc(totalGiving-totalForecast)}">${pct(totalGiving,totalForecast)}</strong></div>
        <div class="kpi-row">vs Prior Year: <strong style="color:${vc(totalGiving-totalPriorGiv)}">${pct(totalGiving,totalPriorGiv)}</strong></div>
      </div>
      <div class="kpi"><div class="label">Expenses YTD</div><div class="kpi-val">${fmt(totalExpenses)}</div>
        <div class="kpi-row">vs Budget: <strong style="color:${vc(totalExpenses-totalBudgetExp,true)}">${pct(totalExpenses,totalBudgetExp)}</strong></div>
        <div class="kpi-row">vs Prior Year: <strong style="color:${vc(totalExpenses-d.priorYear.expenses,true)}">${pct(totalExpenses,d.priorYear.expenses)}</strong></div>
      </div>
      <div class="kpi"><div class="label">Net Position YTD</div><div class="kpi-val">${fmt(netPosition)}</div>
        <div class="kpi-row">vs Forecast: <strong style="color:${vc(netPosition-(totalForecast-totalBudgetExp))}">${pct(netPosition,totalForecast-totalBudgetExp)}</strong></div>
      </div>
      <div class="kpi"><div class="label">Cash Position</div><div class="kpi-val">${fmt(d.cash.current)}</div>
        <div class="kpi-row">vs Prior Month: <strong style="color:${vc(d.cash.current-d.cash.priorMonth)}">${pct(d.cash.current,d.cash.priorMonth)}</strong></div>
        <div class="kpi-row">vs Prior Year: <strong style="color:${vc(d.cash.current-d.cash.priorYear)}">${pct(d.cash.current,d.cash.priorYear)}</strong></div>
      </div>
    </div>
    <h3>Profit & Loss</h3>
    <table>
      <thead><tr><th>Line Item</th><th class="tr">Actual</th><th class="tr">Budget</th><th class="tr">Variance</th></tr></thead>
      <tbody>
        <tr class="sec-row"><td colspan="4">INCOME</td></tr>
        <tr class="sub-row"><td>Contributions</td><td class="tr">${fmt(d.giving.contributions)}</td><td class="tr" style="color:#89929E">${fmt(d.budget.contributions)}</td><td class="tr" style="color:${vc(d.giving.contributions-d.budget.contributions)}">${(d.giving.contributions-d.budget.contributions)>=0?'+':''}${fmt(d.giving.contributions-d.budget.contributions)}</td></tr>
        <tr class="sub-row"><td>Merchandise Revenue</td><td class="tr">${fmt(d.giving.merchandiseRevenue)}</td><td class="tr" style="color:#89929E">${fmt(d.budget.merchandiseRevenue)}</td><td class="tr" style="color:${vc(d.giving.merchandiseRevenue-d.budget.merchandiseRevenue)}">${(d.giving.merchandiseRevenue-d.budget.merchandiseRevenue)>=0?'+':''}${fmt(d.giving.merchandiseRevenue-d.budget.merchandiseRevenue)}</td></tr>
        <tr class="sub-row"><td>Other Income</td><td class="tr">${fmt(d.giving.otherIncome)}</td><td class="tr" style="color:#89929E">${fmt(d.budget.otherIncome)}</td><td class="tr" style="color:${vc(d.giving.otherIncome-d.budget.otherIncome)}">${(d.giving.otherIncome-d.budget.otherIncome)>=0?'+':''}${fmt(d.giving.otherIncome-d.budget.otherIncome)}</td></tr>
        <tr class="sum-row"><td><strong>Total Income</strong></td><td class="tr"><strong>${fmt(totalGiving)}</strong></td><td class="tr" style="color:#89929E">${fmt(totalForecast)}</td><td class="tr" style="color:${vc(totalGiving-totalForecast)}"><strong>${(totalGiving-totalForecast)>=0?'+':''}${fmt(totalGiving-totalForecast)}</strong></td></tr>
        <tr><td colspan="4">&nbsp;</td></tr>
        <tr class="sec-row"><td colspan="4">EXPENSES</td></tr>
        ${[['staff','Staff'],['contract','Contract Services'],['technology','Technology'],['travel','Travel'],['otherGenAdmin','Other Gen & Admin']].map(([k,lbl]) => {
          const v=d.expenseLines[k]||0, b=d.budget[k]||0, dv=v-b
          return `<tr class="sub-row"><td>${lbl}</td><td class="tr">${fmt(v)}</td><td class="tr" style="color:#89929E">${fmt(b)}</td><td class="tr" style="color:${vc(dv,true)}">${dv>=0?'+':''}${fmt(dv)}</td></tr>`
        }).join('')}
        <tr class="sum-row"><td><strong>Total Expenses</strong></td><td class="tr"><strong>${fmt(totalExpenses)}</strong></td><td class="tr" style="color:#89929E">${fmt(totalBudgetExp)}</td><td class="tr" style="color:${vc(totalExpenses-totalBudgetExp,true)}"><strong>${(totalExpenses-totalBudgetExp)>=0?'+':''}${fmt(totalExpenses-totalBudgetExp)}</strong></td></tr>
        <tr class="tot-row"><td><strong>Net Operating Income</strong></td><td class="tr"><strong>${fmt(netPosition)}</strong></td><td class="tr" style="color:#6B7384">${fmt(totalForecast-totalBudgetExp)}</td><td class="tr" style="color:${netPosition>=(totalForecast-totalBudgetExp)?'#34d399':'#f87171'}"><strong>${(netPosition-(totalForecast-totalBudgetExp))>=0?'+':''}${fmt(netPosition-(totalForecast-totalBudgetExp))}</strong></td></tr>
      </tbody>
    </table>`
  }

  // ── Summary section
  if (sections.includes('summary') && summaryMonth && summaries[summaryMonth]) {
    const s = summaries[summaryMonth]
    if (sections.includes('dashboard')) html += `<hr class="divider"/>`
    html += `<h2>Monthly Summary — ${summaryMonth}</h2>`
    if (s.title) html += `<h3 style="font-size:17px;font-weight:700;line-height:1.4;margin-bottom:10px">${s.title}</h3>`
    if (s.overallSummary) html += `<p class="narrative">${s.overallSummary.replace(/\n/g,'<br/>')}</p>`
    if (s.monthlyNarrative) html += `<p class="narrative">${s.monthlyNarrative.replace(/\n/g,'<br/>')}</p>`
    if (s.keyTakeaways?.length > 0) {
      html += `<h3>Key Takeaways</h3>`
      s.keyTakeaways.forEach((kt,i) => {
        html += `<div class="takeaway"><span class="tk-num">${String(i+1).padStart(2,'0')}</span><strong>${kt.title}</strong><p style="margin-top:4px;color:#6b7280;font-size:11px">${kt.body}</p></div>`
      })
    }
  }

  // ── Teams section
  if (sections.includes('teams')) {
    const totalA = TEAMS_MOCK.reduce((s,t)=>s+t.actual,0)
    const totalB = TEAMS_MOCK.reduce((s,t)=>s+t.budget,0)
    const totalV = totalA - totalB
    if (sections.includes('dashboard')||sections.includes('summary')) html += `<hr class="divider"/>`
    html += `<h2>Team Spend Summary</h2>
    <table>
      <thead><tr><th>Team</th><th>Manager</th><th class="tr">Actual YTD</th><th class="tr">Budget</th><th class="tr">Variance $</th><th class="tr">Variance %</th></tr></thead>
      <tbody>
        ${TEAMS_MOCK.map(t => {
          const v=t.actual-t.budget, vp=t.budget>0?(v/t.budget*100).toFixed(1):'—'
          return `<tr><td><strong>${t.name}</strong></td><td style="color:#6B7384">${t.manager}</td><td class="tr">${fmt(t.actual)}</td><td class="tr" style="color:#89929E">${fmt(t.budget)}</td><td class="tr" style="color:${vc(v,true)}">${v>=0?'+':''}${fmt(v)}</td><td class="tr" style="color:${vc(v,true)}">${v>=0?'+':''}${vp}%</td></tr>`
        }).join('')}
        <tr class="tot-row"><td colspan="2"><strong>Total — All Teams</strong></td><td class="tr">${fmt(totalA)}</td><td class="tr" style="color:#6B7384">${fmt(totalB)}</td><td class="tr" style="color:${vc(totalV,true)}">${totalV>=0?'+':''}${fmt(totalV)}</td><td class="tr" style="color:${vc(totalV,true)}">${totalV>=0?'+':''}${totalB>0?((totalV/totalB)*100).toFixed(1):'0'}%</td></tr>
      </tbody>
    </table>`
  }

  html += `<div class="footer"><span>${orgName} — Executive Report · Confidential</span><span>${periodLabel} · ${reportDate}</span></div>
  </div></body></html>`
  return html
}

function ExportPanel({ dateRange, orgConfig, summaries }) {
  const [sections,     setSections]     = useState(['dashboard','summary','teams'])
  const [summaryMonth, setSummaryMonth] = useState(Object.keys(summaries).sort((a,b)=>new Date('1 '+b)-new Date('1 '+a))[0] || ALL_MONTHS[0])
  const [exportRange,  setExportRange]  = useState(dateRange || { preset:'fiscal-ytd', startDate:'', endDate:'' })
  const [showPicker,   setShowPicker]   = useState(false)
  const pickerRef = useRef(null)

  // Close picker on outside click
  useEffect(() => {
    function handle(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function toggleSection(id) {
    setSections(prev => prev.includes(id) ? prev.filter(s=>s!==id) : [...prev,id])
  }

  function handleExport() {
    if (sections.length === 0) return
    const html = generateReportHTML({ sections, dateRange: exportRange, orgConfig, summaries, summaryMonth })
    const win  = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const sectionOpts = [
    { id:'dashboard', label:'Dashboard KPIs & P&L',  icon:'📊', desc:'Financial metrics, P&L table with actuals vs budget' },
    { id:'summary',   label:'Monthly Summary',         icon:'📄', desc:'Narrative summary, key takeaways, watch areas' },
    { id:'teams',     label:'Team Breakdown',           icon:'👥', desc:'All-team spend table with variance detail' },
  ]

  const existingMonths = Object.keys(summaries).sort((a,b)=>new Date('1 '+b)-new Date('1 '+a))

  return (
    <div className="space-y-4">

      {/* Sections */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>Sections to Include</div>
        <p className="text-[10px] mb-3" style={{color:'var(--fg-3)'}}>Choose which pages appear in the exported PDF.</p>
        <div className="space-y-2">
          {sectionOpts.map(opt => {
            const checked = sections.includes(opt.id)
            return (
              <button key={opt.id} onClick={() => toggleSection(opt.id)}
                className="w-full text-left px-4 py-3 rounded-xl border transition-all flex items-start gap-3"
                style={checked ? {borderColor:'var(--ink-900)',backgroundColor:'var(--cream-50)'} : {borderColor:'var(--neutral-10)'}}>
                <div className="w-4 h-4 rounded flex-shrink-0 mt-0.5 border-2 flex items-center justify-center transition-all"
                  style={checked ? {backgroundColor:'var(--ink-900)',borderColor:'var(--ink-900)'} : {borderColor:'var(--neutral-20)'}}>
                  {checked && <Check size={10} className="text-white"/>}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold" style={{color:'var(--fg-1)'}}>{opt.icon} {opt.label}</div>
                  <div className="text-[10px] mt-0.5" style={{color:'var(--fg-3)'}}>{opt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
        {/* Summary month picker */}
        {sections.includes('summary') && existingMonths.length > 0 && (
          <div className="mt-3 pt-3" style={{borderTop:'1px solid var(--neutral-09)'}}>
            <label className="block text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{color:'var(--fg-3)'}}>Which month's summary to include</label>
            <select value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
              style={{border:'1px solid var(--neutral-20)'}}>
              {existingMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        {sections.includes('summary') && existingMonths.length === 0 && (
          <p className="mt-2 text-[10px] font-medium" style={{color:'var(--ds-warning)'}}>No monthly summaries yet — create one in the Summary tab first.</p>
        )}
      </div>

      {/* Reporting period */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{color:'var(--neutral-60)'}}>Reporting Period</div>
        <p className="text-[10px] mb-3" style={{color:'var(--fg-3)'}}>Shown on the report cover. Defaults to the dashboard's current date range — edit it here without changing the main view.</p>

        {/* Trigger button */}
        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowPicker(v=>!v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
            style={{border:'1px solid var(--neutral-20)',backgroundColor:'var(--neutral-05)'}}>
            <div>
              <div className="text-xs font-semibold text-left" style={{color:'var(--fg-1)'}}>{presetLabel(exportRange?.preset)}</div>
              {exportRange?.startDate && (
                <div className="text-[10px] mt-0.5 text-left" style={{color:'var(--fg-3)'}}>
                  {exportRange.startDate} → {exportRange.endDate}
                </div>
              )}
            </div>
            <ChevronDown size={13} style={{color:'var(--fg-3)'}}/>
          </button>

          {showPicker && (
            <div className="absolute left-0 top-full mt-2 z-50">
              <ELTDateRangePicker
                dateRange={exportRange}
                org={orgConfig}
                onApplyPreset={p => {
                  const r = getELTPresetRange(p, orgConfig)
                  setExportRange({...r, preset: p})
                  setShowPicker(false)
                }}
                onApplyCustom={(s, e) => {
                  setExportRange({preset:'custom', startDate:s, endDate:e})
                  setShowPicker(false)
                }}
                onClose={() => setShowPicker(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Generate button */}
      <button onClick={handleExport} disabled={sections.length===0}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
        style={{backgroundColor:'var(--color-primary)'}}>
        <Download size={14}/> Generate PDF
      </button>
      <p className="text-[10px] text-center" style={{color:'var(--fg-3)'}}>Opens a print-ready page in a new tab · use browser Print → Save as PDF</p>
    </div>
  )
}

// Generate and trigger a CSV download
function downloadCSV(filename, rows) {
  const content = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Template definitions (headers + description rows)
const IMPORT_TEMPLATES = {
  financial: {
    label: 'Financial Data',
    subtitle: 'Giving, Revenue & P&L (single import)',
    description: 'One template covers all income lines (contributions, merchandise, other income) and all expense categories. Import monthly or annual actuals, budgets, and prior-year figures. Required for Dashboard KPI cards and P&L table.',
    columns: ['Period','Record Type','Category','Account','Actual','Budget','Prior Year'],
    notes: [
      'Period: YYYY-MM format (e.g. 2026-04)',
      'Record Type: "income" or "expense"',
      'Category: contributions | merchandise | other-income | staff | contract | technology | travel | other-ga',
      'Account: sub-account label (e.g. "Salaries & Wages")',
      'Monetary values: whole numbers, no symbols or commas',
    ],
    template: [
      ['Period','Record Type','Category','Account','Actual','Budget','Prior Year'],
    ],
    sample: [
      ['Period','Record Type','Category','Account','Actual','Budget','Prior Year'],
      ['2026-04','income','contributions','Recurring Giving','1980000','1950000','1750000'],
      ['2026-04','income','contributions','One-Time / Spontaneous','380000','340000','310000'],
      ['2026-04','income','contributions','Corporate & Grants','90000','90000','85000'],
      ['2026-04','income','merchandise','Online Store','112500','105000','98000'],
      ['2026-04','income','merchandise','Event Sales','42930','40000','38000'],
      ['2026-04','income','merchandise','Wholesale / Reseller','30000','30000','28000'],
      ['2026-04','income','other-income','Licensing & Royalties','24600','22000','20000'],
      ['2026-04','income','other-income','Speaking & Events','10500','10000','9500'],
      ['2026-04','income','other-income','Miscellaneous','7000','6000','5500'],
      ['2026-04','expense','staff','Salaries & Wages','1012400','1040000','950000'],
      ['2026-04','expense','staff','Benefits & Payroll Tax','180800','185000','170000'],
      ['2026-04','expense','staff','Contract Staff (Aug)','52600','55000','50000'],
      ['2026-04','expense','contract','Creative & Production','42800','45000','40000'],
      ['2026-04','expense','contract','Legal & Professional','28450','30000','27000'],
      ['2026-04','expense','contract','Consulting','16000','20000','15000'],
      ['2026-04','expense','technology','Software Subscriptions','68200','70000','62000'],
      ['2026-04','expense','technology','Infrastructure & Hosting','52400','58000','48000'],
      ['2026-04','expense','technology','Hardware & Equipment','33720','30000','28000'],
      ['2026-04','expense','travel','Domestic Travel','21300','22000','20000'],
      ['2026-04','expense','travel','International Travel','8570','10000','9000'],
      ['2026-04','expense','travel','Lodging & Meals','4000','6000','5500'],
      ['2026-04','expense','other-ga','Office Supplies','12400','14000','13000'],
      ['2026-04','expense','other-ga','Facility Costs','28600','28000','26000'],
      ['2026-04','expense','other-ga','Insurance','14940','15000','14500'],
      ['2026-04','expense','other-ga','Miscellaneous','10000','15000','14000'],
    ],
  },
  patrons: {
    label: 'Patron / Supporter Data',
    subtitle: 'Supporter counts, gift sizes, retention',
    description: 'Monthly supporter metrics used by Supporter Metrics KPI cards and trend charts. Each row represents one period.',
    columns: ['Period','Total Active','New Supporters','Prior Period New','Avg Gift USD','Avg Gift Prior Year USD','Recurring Mix Pct','Retention Rate Pct'],
    notes: [
      'Period: YYYY-MM format',
      'Pct columns: enter as decimal percentage, e.g. 82.4 (not 0.824)',
      'Avg Gift: monthly average gift amount in USD',
    ],
    template: [
      ['Period','Total Active','New Supporters','Prior Period New','Avg Gift USD','Avg Gift Prior Year USD','Recurring Mix Pct','Retention Rate Pct'],
    ],
    sample: [
      ['Period','Total Active','New Supporters','Prior Period New','Avg Gift USD','Avg Gift Prior Year USD','Recurring Mix Pct','Retention Rate Pct'],
      ['2026-04','24810','2510','2340','98.72','94.30','82.4','94.2'],
      ['2026-03','24540','2380','2210','97.85','94.30','81.9','93.8'],
      ['2026-02','24320','2280','2100','97.12','93.50','81.5','93.5'],
      ['2026-01','24130','2150','2050','96.50','93.50','81.2','93.1'],
    ],
  },
  cashflow: {
    label: 'Cash Flow',
    subtitle: 'Cash position by period',
    description: 'End-of-period cash balances used by the Cash Position KPI card. Supports month-end snapshots.',
    columns: ['Period','Cash Balance USD','Prior Month Balance USD','Prior Year Balance USD'],
    notes: [
      'Period: YYYY-MM format',
      'All amounts in USD whole numbers',
      'Use end-of-period (last day of month) balances',
    ],
    template: [
      ['Period','Cash Balance USD','Prior Month Balance USD','Prior Year Balance USD'],
    ],
    sample: [
      ['Period','Cash Balance USD','Prior Month Balance USD','Prior Year Balance USD'],
      ['2026-04','3240000','3105000','2870000'],
      ['2026-03','3105000','2980000','2750000'],
      ['2026-02','2980000','2840000','2620000'],
      ['2026-01','2840000','2710000','2510000'],
    ],
  },
}

// Period selector for targeted replace
function PeriodRangeSelect({ startPeriod, endPeriod, onChange }) {
  const periodOptions = (() => {
    const opts = []
    for (let y = 2024; y <= 2027; y++) {
      for (let m = 1; m <= 12; m++) {
        opts.push(`${y}-${String(m).padStart(2,'0')}`)
      }
    }
    return opts
  })()
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">From Period</label>
        <select value={startPeriod} onChange={e=>onChange('start',e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-gray-400 bg-white">
          {periodOptions.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">To Period</label>
        <select value={endPeriod} onChange={e=>onChange('end',e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-gray-400 bg-white">
          {periodOptions.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>
  )
}

function ImportTypePanel({ typeKey, summaries, onAddSummary }) {
  const tpl = IMPORT_TEMPLATES[typeKey]
  const { comments, updateComment } = useApp()
  const [mode, setMode]               = useState('append') // 'append' | 'replace'
  const [replaceScope, setReplaceScope] = useState('all')   // 'all' | 'period'
  const [startPeriod, setStartPeriod] = useState('2026-01')
  const [endPeriod,   setEndPeriod]   = useState('2026-04')
  const [fileName,    setFileName]    = useState('')
  const [status,      setStatus]      = useState(null) // 'success' | null
  const [showCommentWarning, setShowCommentWarning] = useState(false)
  const [commentCounts, setCommentCounts]           = useState({ tx: 0, general: 0 })
  const fileRef = useRef(null)

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setStatus(null)
  }

  function getAffectedComments() {
    // Find comments that would be affected by this replace operation
    const txComments = comments.filter(c => {
      if (!c.anchor?.txRef) return false
      if (mode !== 'replace') return false
      if (replaceScope === 'all') return true
      const txDate = c.anchor.txRef?.date || ''
      const txPeriod = txDate.slice(0, 7)
      return txPeriod >= startPeriod && txPeriod <= endPeriod
    })
    const generalComments = comments.filter(c => {
      if (c.anchor?.txRef) return false
      if (mode !== 'replace') return false
      if (replaceScope === 'period') {
        const ts = (c.timestamp || '').slice(0, 7)
        return ts >= startPeriod && ts <= endPeriod
      }
      return false // general comments never affected by replace all
    })
    return { txComments, generalComments }
  }

  function handleImport() {
    if (!fileName) return
    if (mode === 'replace') {
      const { txComments, generalComments } = getAffectedComments()
      if (txComments.length > 0) {
        setCommentCounts({ tx: txComments.length, general: generalComments.length })
        setShowCommentWarning(true)
        return
      }
    }
    runImport()
  }

  function runImport() {
    // Mark orphaned: any transaction-level comment that was at risk
    if (mode === 'replace') {
      const { txComments } = getAffectedComments()
      txComments.forEach(c => {
        // Attempt ID match: not possible in simulated import, so all become orphaned
        updateComment(c.id, {
          orphaned: true,
          original_transaction_context: {
            name:   c.anchor.txRef.vendor || c.anchor.txRef.department || '—',
            amount: c.anchor.txRef.amount,
            date:   c.anchor.txRef.date,
            vendor: c.anchor.txRef.vendor,
          },
        })
      })
    }
    setShowCommentWarning(false)
    // Simulated import — real backend would process the file
    setTimeout(() => setStatus('success'), 600)
  }

  function handlePeriodChange(which, val) {
    if (which === 'start') setStartPeriod(val)
    else setEndPeriod(val)
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-xs font-semibold text-gray-700 mb-0.5">{tpl.label}</div>
        <div className="text-xs text-gray-400 mb-4">{tpl.description}</div>

        {/* Column reference */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Expected Columns</div>
          <div className="flex flex-wrap gap-1.5">
            {tpl.columns.map(col => (
              <span key={col} className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-[10px] font-medium text-gray-600">{col}</span>
            ))}
          </div>
        </div>

        {/* Notes */}
        <ul className="space-y-1">
          {tpl.notes.map((n,i) => (
            <li key={i} className="text-[10px] text-gray-400 flex items-start gap-1.5">
              <span className="mt-0.5 text-gray-300">·</span>{n}
            </li>
          ))}
        </ul>
      </div>

      {/* Download templates */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Download Templates</div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadCSV(`${typeKey}-template.csv`, tpl.template)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors">
            <Download size={12}/> Blank Template
          </button>
          <button
            onClick={() => downloadCSV(`${typeKey}-sample.csv`, tpl.sample)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors">
            <Download size={12}/> Sample with Data
          </button>
        </div>
      </div>

      {/* Import mode */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Import Mode</div>
        <div className="flex gap-2 mb-4">
          {[{id:'append',label:'Append',desc:'Add new periods without touching existing data'},
            {id:'replace',label:'Replace',desc:'Overwrite existing data with imported records'}].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${mode===m.id?'bg-gray-900 text-white border-gray-900':'bg-white border-gray-200 hover:border-gray-400'}`}>
              <div className={`text-xs font-bold mb-0.5 ${mode===m.id?'text-white':'text-gray-800'}`}>{m.label}</div>
              <div className={`text-[10px] ${mode===m.id?'text-gray-300':'text-gray-400'}`}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Replace scope */}
        {mode === 'replace' && (
          <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">What to replace</div>
            {[{id:'all',label:'Replace all data',desc:'Clear everything and replace with import file'},
              {id:'period',label:'Replace by period',desc:'Only overwrite records for the specified period range'}].map(s => (
              <button key={s.id} onClick={() => setReplaceScope(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${replaceScope===s.id?'bg-white border-gray-800':'bg-white border-gray-200 hover:border-gray-400'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${replaceScope===s.id?'border-gray-800 bg-gray-800':'border-gray-300'}`}/>
                  <div>
                    <div className="text-xs font-medium text-gray-800">{s.label}</div>
                    <div className="text-[10px] text-gray-400">{s.desc}</div>
                  </div>
                </div>
              </button>
            ))}
            {replaceScope === 'period' && (
              <div className="pt-1">
                <PeriodRangeSelect startPeriod={startPeriod} endPeriod={endPeriod} onChange={handlePeriodChange}/>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File upload + import */}
      <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Upload File</div>
        <div onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors mb-4">
          <Upload size={18} className="text-gray-300 flex-shrink-0"/>
          <div>
            <div className="text-sm text-gray-500">{fileName || 'Choose CSV or Excel file…'}</div>
            <div className="text-[10px] text-gray-300 mt-0.5">.csv · .xlsx · .xls</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange}/>
        </div>

        {status === 'success' && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 mb-4">
            <CheckCircle size={14} className="text-emerald-600 flex-shrink-0"/>
            <p className="text-xs font-medium text-emerald-700">
              {mode === 'append' ? 'Data appended successfully.' : `Data replaced${replaceScope==='period'?` for ${startPeriod} → ${endPeriod}`:' (all periods)'}.`}
            </p>
          </div>
        )}

        <button onClick={handleImport} disabled={!fileName}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{backgroundColor:'var(--color-primary)'}}>
          {mode === 'append' ? 'Append Data' : 'Replace Data'}
        </button>
      </div>

      {/* Comment protection warning dialog */}
      {showCommentWarning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} className="text-amber-600"/>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Comments exist for this period</h3>
                <p className="text-xs text-gray-500 mt-0.5">Replacing data may orphan attached comments</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-xs text-gray-600">
              <p>You have <strong>{commentCounts.tx}</strong> comment{commentCounts.tx !== 1 ? 's' : ''} attached to transactions{commentCounts.general > 0 ? ` and ${commentCounts.general} general comment${commentCounts.general !== 1 ? 's' : ''}` : ''} in this date range.</p>
              <ul className="space-y-1 mt-2">
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span>Transaction comments will attempt to reattach to matching transactions in the new import.</li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span>Comments that cannot be reattached will be preserved as orphaned with original context.</li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">·</span>General comments will not be affected.</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setShowCommentWarning(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={runImport}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{backgroundColor:'var(--color-primary)'}}>
                Continue with Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ELTImportTab({ summaries, onUpdateSummary, onAddSummary, dateRange, orgConfig }) {
  const [activeImport, setActiveImport] = useState('financial')
  const [summaryMonth, setSummaryMonth] = useState(ALL_MONTHS[0])

  const importTabs = [
    { id:'financial', label:'Financial Data' },
    { id:'patrons',   label:'Patron Data' },
    { id:'cashflow',  label:'Cash Flow' },
    { id:'narrative', label:'Monthly Summary' },
    { id:'export',    label:'Export PDF' },
  ]

  const existingMonths = Object.keys(summaries)
  const targetSummary  = summaries[summaryMonth]

  function handleQuickAdd() {
    if (!summaries[summaryMonth]) onAddSummary(summaryMonth)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{color:'var(--neutral-60)'}}>Data Import</p>
        <p className="text-xs text-gray-400">Download templates, upload actuals, budgets, and prior-year data. All templates are designed to feed into the master dashboard build.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 mb-6 w-fit">
        {importTabs.map(t => (
          <button key={t.id} onClick={() => setActiveImport(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${activeImport===t.id?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:text-gray-900'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeImport === 'export' ? (
        <ExportPanel dateRange={dateRange} orgConfig={orgConfig} summaries={summaries}/>
      ) : activeImport === 'narrative' ? (
        /* Monthly Summary sub-tab (existing behavior) */
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Create or Link Monthly Summary</div>
            <div className="flex gap-3">
              <select value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                {ALL_MONTHS.map(m=><option key={m} value={m}>{m}{summaries[m]?' ✓':''}</option>)}
              </select>
              {!targetSummary && (
                <button onClick={handleQuickAdd} className="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap" style={{backgroundColor:'var(--color-primary)'}}>
                  + Create
                </button>
              )}
            </div>
            {targetSummary && (
              <p className="text-xs mt-2" style={{color:'var(--neutral-60)'}}>✓ Summary exists for {summaryMonth}. Switch to the Summary tab to edit it.</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-5" style={{border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)'}}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Existing Summaries</div>
            {existingMonths.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No summaries yet.</p>
            ) : (
              <div className="space-y-2">
                {existingMonths.sort((a,b)=>new Date('1 '+b)-new Date('1 '+a)).map(m=>(
                  <div key={m} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{m}</span>
                      <span className="ml-2 text-xs text-gray-400">Prepared {summaries[m].prepared}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">Complete</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <ImportTypePanel typeKey={activeImport} summaries={summaries} onAddSummary={onAddSummary}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared empty summary template
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers for monthly_summaries table
// ─────────────────────────────────────────────────────────────────────────────

/** "April 2026" → "2026-04" (reuse monthLabelToPeriod defined above) */

/** "2026-04" → "April 2026" */
function periodToMonthLabel(period) {
  if (!period) return null
  const [y, m] = period.split('-')
  const d = new Date(parseInt(y), parseInt(m) - 1, 1)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Map a summary object → DB row payload */
function summaryToDBRow(orgId, period, summary) {
  return {
    org_id:            orgId,
    period,
    overall_headline:  summary.title            || '',
    overall_narrative: summary.overallSummary   || '',
    monthly_activity:  summary.monthlyActivity  || '',
    takeaways:         summary.keyTakeaways     || [],
    watch_areas:       summary.watchAreas       || [],
    reserves:          summary.reserves         || '',
    reserves_note:     summary.reservesNote     || '',
    saved_at:          new Date().toISOString(),
    saved_by:          'system',
  }
}

/** Map a DB row → summary object shape */
function dbRowToSummary(row) {
  return {
    title:           row.overall_headline  || '',
    overallSummary:  row.overall_narrative || '',
    monthlyActivity: row.monthly_activity  || '',
    keyTakeaways:    row.takeaways         || [],
    watchAreas:      row.watch_areas       || [],
    reserves:        row.reserves          || '',
    reservesNote:    row.reserves_note     || '',
    prepared:        row.saved_at
      ? new Date(row.saved_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
      : new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),
  }
}

const EMPTY_SUMMARY_TEMPLATE = () => ({
  prepared: new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),
  title: '',
  overallSummary: '',
  monthlyNarrative: '',
  monthlyActivity: '',
  financials: {
    giving:   {actual:0,budget:0,priorYear:0},
    expenses: {actual:0,budget:0,priorYear:0},
  },
  kpiCards: ['monthly-giving','monthly-expenses','monthly-net'],
  keyTakeaways: [],
  watchAreas: [],
  reserves: '',
  reservesNote: '',
})

// ─────────────────────────────────────────────────────────────────────────────
// Main ELT Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function ELTDashboard() {
  const { orgConfig, incomeMonths, actuals, budgetFlat, availableScenarios, selectedScenario } = useApp()
  const [activeTab, setActiveTab] = useState('dashboard')
  // activeBudget is the selected scenario string (e.g. 'Planned Spend')
  // Initialise to selectedScenario (likely '' at first render since AppContext loads async)
  const [activeBudget, setActiveBudget] = useState(selectedScenario)

  // When AppContext finishes loading budget and selectedScenario becomes non-empty,
  // sync activeBudget — but ONLY if the user hasn't already picked one manually.
  useEffect(() => {
    if (selectedScenario && !activeBudget) {
      setActiveBudget(selectedScenario)
    }
  }, [selectedScenario])

  const defaultRange = getELTPresetRange('fiscal-ytd', orgConfig)
  const [dateRange, setDateRange] = useState({ preset:'fiscal-ytd', ...defaultRange })

  // Monthly summaries — lifted to root so Import and Summary tabs share data
  const [summaries, setSummaries] = useState(INITIAL_SUMMARIES)
  // Set of YYYY-MM strings for months that have a saved DB record
  const [savedPeriods, setSavedPeriods] = useState(new Set())

  // Load all saved summaries from DB when org data is available
  useEffect(() => {
    if (!ORG_ID) return
    async function loadSavedSummaries() {
      const { data } = await supabase
        .from('monthly_summaries')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('deleted', false)
      if (!data || data.length === 0) return
      setSavedPeriods(new Set(data.map(r => r.period)))
      setSummaries(prev => {
        const next = { ...prev }
        for (const row of data) {
          const label = periodToMonthLabel(row.period)
          if (!label) continue
          next[label] = { ...EMPTY_SUMMARY_TEMPLATE(), ...next[label], ...dbRowToSummary(row) }
        }
        return next
      })
    }
    loadSavedSummaries()
  }, [orgConfig.name]) // re-run when org loads (name changes from default)

  function applyPreset(preset) { setDateRange({preset,...getELTPresetRange(preset,orgConfig)}) }
  function applyCustom(s,e)    { setDateRange({preset:'custom',startDate:s,endDate:e}) }

  function handleUpdateSummary(month, key, value) {
    setSummaries(prev => ({ ...prev, [month]: { ...prev[month], [key]: value } }))
  }
  function handleAddSummary(month) {
    setSummaries(prev => ({ ...prev, [month]: { ...EMPTY_SUMMARY_TEMPLATE(), ...prev[month] } }))
  }

  async function handleSaveSummary(month, summary) {
    const period = monthLabelToPeriod(month)
    if (!period || !ORG_ID) return { error: 'Missing org or period' }

    // Fix 8: Only save if the summary has meaningful content.
    // An empty row (both headline and narrative null/empty) is never written to DB.
    const headline  = summary?.title         || ''
    const narrative = summary?.overallSummary || ''
    if (!headline.trim() && !narrative.trim()) {
      return { error: 'Summary has no content — generate or write content before saving' }
    }

    // Fix 8: Clean up any existing empty ghost row for this period before upserting.
    await supabase
      .from('monthly_summaries')
      .delete()
      .eq('org_id', ORG_ID)
      .eq('period', period)
      .is('overall_headline', null)

    const payload = summaryToDBRow(ORG_ID, period, summary)
    const { data, error } = await supabase
      .from('monthly_summaries')
      .upsert(payload, { onConflict: 'org_id,period' })
      .select()
      .single()
    if (!error) {
      setSavedPeriods(prev => new Set([...prev, period]))
    }
    return { data, error }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{backgroundColor:'var(--color-primary-bg)'}}>
      <ELTNav orgConfig={orgConfig} activeTab={activeTab} setActiveTab={setActiveTab}
        dateRange={dateRange} onApplyPreset={applyPreset} onApplyCustom={applyCustom}
        activeBudget={activeBudget} onSetBudget={setActiveBudget}/>
      <main className="flex-1 overflow-auto">
        {activeTab==='dashboard' && <DashboardTab dateRange={dateRange} orgConfig={orgConfig} activeBudget={activeBudget} incomeMonths={incomeMonths} actuals={actuals}/>}
        {activeTab==='summary'   && <MonthlySummaryTab summaries={summaries} onUpdateSummary={handleUpdateSummary} onAddSummary={handleAddSummary} orgConfig={orgConfig} actuals={actuals} budgetFlat={budgetFlat} activeBudget={activeBudget} savedPeriods={savedPeriods} onSave={handleSaveSummary}/>}
        {activeTab==='teams'     && <TeamsTab dateRange={dateRange} activeBudget={activeBudget} orgConfig={orgConfig}/>}
        {activeTab==='documents' && <DocumentsTab orgConfig={orgConfig}/>}
        {activeTab==='comments'  && <CommentsPage context="executive" />}
      </main>
    </div>
  )
}
