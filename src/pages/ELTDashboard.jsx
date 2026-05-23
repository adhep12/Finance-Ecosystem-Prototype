import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import {
  ChevronDown, Pencil, Plus, X, Check, ChevronRight, ChevronLeft,
  ChevronUp, TrendingUp, TrendingDown, Minus, Info, Upload,
  FileText, Users, BarChart2, LayoutDashboard, Settings,
  GripVertical, AlertCircle, Eye, CheckCircle, Quote,
  ArrowUpDown, ExternalLink, Activity, SlidersHorizontal, BookOpen
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { formatCurrency, formatPercent, daysBetween } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Rolling Quotes
// ─────────────────────────────────────────────────────────────────────────────

const ROLLING_QUOTES = [
  { text: "One foot in the grave, one foot on a banana peel.", author: "Steve Atkinson" },
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
// Initial Monthly Summaries Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_SUMMARIES = {
  'April 2026': {
    prepared: 'April 22, 2026',
    title: "A steady month. Giving is strong, expenses disciplined, and we're ahead of plan.",
    overallSummary: "Six months into the fiscal year, contributions are running 7.6% ahead of budget and expenses 4.2% under. That leaves us nearly $3.8M in net operating income — almost double the budgeted position at this point in the year. Supporter growth continues, though new acquisition deserves attention.",
    monthlyNarrative: "April contributions came in at $3.2M, right on budget for the month. Our strength continues to come from a generous and growing supporter base — over 24,800 total active supporters giving this month — and the year-over-year increase continues its quiet compounding. Secondary revenue lines softened slightly in April, but not enough to move the overall picture.\n\nOn the expense side, every major category came in at or below budget for April. Staff costs are the single largest line at 51.5% of total income, and we remain disciplined there. Technology infrastructure spiked in March due to a planned refresh, but YTD stays within 2.4% of plan — a timing effect, not a new trend.",
    financials: {
      giving:   { actual: 3_200_000, budget: 3_180_000, priorYear: 2_950_000 },
      expenses: { actual: 2_780_000, budget: 2_840_000, priorYear: 2_620_000 },
    },
    kpiCards: ['monthly-giving', 'monthly-expenses', 'monthly-net'],
    keyTakeaways: [
      { id: 'kt1', title: "Supporter base is the engine.", body: "24,800 total active supporters in April (recurring + one-time), up 11.3% year-over-year. Sustained growth in the recurring base is our most durable financial asset." },
      { id: 'kt2', title: "We're running ahead of plan.", body: "YTD net operating income is $3.83M versus a budgeted $1.98M. We built the budget conservatively, and both sides of the ledger are moving in our favor." },
      { id: 'kt3', title: "New supporter acquisition on the rise.", body: "April brought in 2,510 total new supporters — our highest April count in two years. Engagement campaigns and digital channels are driving the improvement." },
      { id: 'kt4', title: "Reserves remain healthy.", body: "Estimated cash above the operating floor at month-end was $16.2M, up $1.0M from March. This reflects the final tranche of a planned grant receivable." },
    ],
    watchAreas: [
      { id: 'wa1', status: 'needs-attention', title: "New supporter acquisition — monitoring closely.", body: "February and March 2026 both landed below prior-year pace. Reviewing marketing mix and digital conversion paths. Expect a deeper read in May." },
      { id: 'wa2', status: 'needs-attention', title: "Secondary revenue under forecast.", body: "April secondary revenue was 37% of budget. YTD we're at 87% of plan. Q1 product mix underperformed; adjusting promotion timing and re-evaluating the catalog." },
      { id: 'wa3', status: 'monitoring', title: "Staff cost growth vs. output velocity.", body: "Staff is on budget YTD but growing with the team. We're tracking output per FTE across all production categories to make sure cost growth tracks output growth." },
      { id: 'wa4', status: 'on-track', title: "Cash Strategy", body: "Two months of operating cash in primary checking; three months in a money market account earning ~3%; $10M allocated across private credit and real estate earning ~9%; remaining cash in laddered CDs maturing every four weeks at ~3.65%." },
    ],
    reserves: "Operating reserves ended April at an estimated $21.4M — roughly eight months of operating expenses. We remain inside the board-approved band. A scheduled Q2 allocation to strategic initiatives will process in May.",
    reservesNote: "Exact reserve totals are confirmed at the end of each quarter. Q2 close report drops May 15.",
  },
  'March 2026': {
    prepared: 'March 21, 2026',
    title: "March closes strong. Supporter growth on pace, expenses tight, reserves building.",
    overallSummary: "Five months into the fiscal year, we're tracking well ahead of the net operating income plan. Contributions remain solid, secondary revenue picked up sequentially, and expenses remained disciplined across every category. The supporter base grew by 220 net new supporters in March.",
    monthlyNarrative: "March giving came in at $3.1M, slightly ahead of the $3.0M budget for the month. Supporter growth continues to compound quietly — the recurring base is the foundation that gives us confidence in the forward outlook.\n\nExpenses were well-managed across the board. The planned technology refresh created a one-time spike in infrastructure costs, which is already reflected in the April actuals. Staff costs remain on plan.",
    financials: {
      giving:   { actual: 3_100_000, budget: 3_000_000, priorYear: 2_870_000 },
      expenses: { actual: 2_690_000, budget: 2_750_000, priorYear: 2_540_000 },
    },
    kpiCards: ['monthly-giving', 'monthly-expenses', 'monthly-net'],
    keyTakeaways: [
      { id: 'kt1', title: "Giving ahead of monthly budget.", body: "March came in at $3.1M vs. $3.0M budgeted — a solid $100K beat driven by spontaneous giving and a late-month engagement push." },
      { id: 'kt2', title: "Expenses under budget by $60K.", body: "Disciplined spend across all categories. The technology refresh timing shift means March looks elevated vs. plan but April will normalize." },
      { id: 'kt3', title: "Net supporter count up 220.", body: "March added 220 net new supporters, in line with seasonal trends. The recurring base remains the primary growth lever." },
    ],
    watchAreas: [
      { id: 'wa1', status: 'monitoring', title: "Technology refresh cost timing.", body: "The Q2 infrastructure refresh was planned but arrived in March. YTD total remains within 2.4% of annual plan." },
      { id: 'wa2', status: 'on-track', title: "Staff and benefits on plan.", body: "No material variances. Headcount is stable and benefits enrollment is consistent with budget assumptions." },
    ],
    reserves: "Operating reserves ended March at an estimated $20.4M — roughly seven and a half months of operating expenses. This is within the board-approved range.",
    reservesNote: "Q2 reserve allocation will be processed in May following the quarterly close.",
  },
}

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

// ─────────────────────────────────────────────────────────────────────────────
// ELT Mock Dashboard Data
// ─────────────────────────────────────────────────────────────────────────────

const ELT_MOCK = {
  giving: { contributions: 2_450_000, merchandiseRevenue: 185_430, otherIncome: 42_100 },
  budget: { contributions: 2_380_000, merchandiseRevenue: 175_000, otherIncome: 38_000,
            staff: 1_280_000, contract: 95_000, technology: 158_000, travel: 38_000, otherGenAdmin: 72_000 },
  priorYear: { contributions: 2_210_000, merchandiseRevenue: 168_200, otherIncome: 37_500, expenses: 1_520_000 },
  cash: { current: 3_240_000, priorMonth: 3_105_000, priorYear: 2_870_000 },
  forecast: { contributions: 2_350_000, merchandiseRevenue: 178_000, otherIncome: 40_000 },
  patrons: {
    total: 24_810, priorMonth: 24_420, priorYear: 22_300,
    newThisPeriod: 2_510, newPriorPeriod: 2_340,
    avgGift: 98.72, avgGiftPriorYear: 94.30,
    monthly: [
      { month: 'Jun', newCY: 195, newPY: 175 }, { month: 'Jul', newCY: 210, newPY: 188 },
      { month: 'Aug', newCY: 225, newPY: 195 }, { month: 'Sep', newCY: 198, newPY: 182 },
      { month: 'Oct', newCY: 215, newPY: 200 }, { month: 'Nov', newCY: 242, newPY: 218 },
      { month: 'Dec', newCY: 290, newPY: 260 }, { month: 'Jan', newCY: 185, newPY: 170 },
      { month: 'Feb', newCY: 195, newPY: 178 }, { month: 'Mar', newCY: 220, newPY: 195 },
      { month: 'Apr', newCY: 230, newPY: 205 }, { month: 'May', newCY: 305, newPY: 274 },
    ],
    base: [
      { month: 'Jun', total: 22_600 }, { month: 'Jul', total: 22_800 },
      { month: 'Aug', total: 23_020 }, { month: 'Sep', total: 23_215 },
      { month: 'Oct', total: 23_420 }, { month: 'Nov', total: 23_660 },
      { month: 'Dec', total: 23_945 }, { month: 'Jan', total: 24_130 },
      { month: 'Feb', total: 24_320 }, { month: 'Mar', total: 24_540 },
      { month: 'Apr', total: 24_770 }, { month: 'May', total: 24_810 },
    ],
  },
  expenseLines: { staff: 1_245_800, contract: 87_250, technology: 154_320, travel: 33_870, otherGenAdmin: 65_940 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Mock Data + Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_CATEGORIES = [
  { key: 'staff',      label: 'Staff & Benefits',     color: '#0EA5A0' },
  { key: 'contract',   label: 'Contract Services',    color: '#D4896A' },
  { key: 'technology', label: 'Technology',            color: '#3B82F6' },
  { key: 'travel',     label: 'Travel & Expense',      color: '#F59E0B' },
  { key: 'marketing',  label: 'Marketing',             color: '#8B5CF6' },
  { key: 'facilities', label: 'Facilities',            color: '#EC4899' },
  { key: 'supplies',   label: 'Supplies & Materials',  color: '#10B981' },
  { key: 'training',   label: 'Training & Dev',        color: '#6366F1' },
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
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white" style={{backgroundColor:'var(--color-accent)'}}>Apply</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Nav
// ─────────────────────────────────────────────────────────────────────────────

const ELT_TABS = [
  {id:'dashboard',label:'Dashboard'},{id:'summary',label:'Summary'},
  {id:'teams',label:'Teams'},{id:'documents',label:'Documents'},{id:'import',label:'Import'},
]

function ELTNav({ orgConfig, activeTab, setActiveTab, dateRange, onApplyPreset, onApplyCustom }) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const pickerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) { if(pickerRef.current&&!pickerRef.current.contains(e.target)) setShowDatePicker(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-6 gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => navigate('/briefing')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mr-1">
            <ChevronLeft size={13}/><span className="hidden sm:inline">Team</span>
          </button>
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:'var(--color-accent)'}}>
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

function KPICard({ title, value, cmp1Label, cmp1Value, cmp1Delta, cmp1Pct, cmp2Label, cmp2Value, cmp2Delta, cmp2Pct, inverse=false, onRemove, editMode }) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--color-accent)'}}>{title}</div>
      <div className="text-3xl font-bold text-gray-900 mb-4">{value}</div>
      <div className="space-y-2.5">
        {cmp1Label && <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{cmp1Label}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp1Delta} inverse={inverse} label={cmp1Pct}/>
            <span className={`text-sm font-semibold ${varColor(cmp1Delta,inverse)}`}>{cmp1Delta>0?'+':''}{formatCurrency(cmp1Delta)}</span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp1Value)}</span>
          </div>
        </div>}
        {cmp2Label && <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{cmp2Label}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp2Delta} inverse={inverse} label={cmp2Pct}/>
            <span className={`text-sm font-semibold ${varColor(cmp2Delta,inverse)}`}>{cmp2Delta>0?'+':''}{formatCurrency(cmp2Delta)}</span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp2Value)}</span>
          </div>
        </div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Net Position Card
// ─────────────────────────────────────────────────────────────────────────────

function NetPositionCard({ value, cmp1Delta, cmp1Pct, cmp1Value, cmp2Delta, cmp2Pct, cmp2Value, breakdown, editMode, onRemove }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--color-accent)'}}>Net Position YTD</div>
        <div className="relative" onMouseEnter={()=>setShowBreakdown(true)} onMouseLeave={()=>setShowBreakdown(false)}>
          <Info size={12} className="text-gray-300 hover:text-gray-500 cursor-help"/>
          {showBreakdown && (
            <div className="absolute left-0 top-5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Breakdown</div>
              {breakdown.lines.map((line,i) => (
                <div key={i} className={`flex justify-between py-1 text-sm ${line.isTotal?'border-t border-gray-200 mt-1 pt-2 font-semibold':''} ${line.isSubtract?'text-red-600':'text-gray-700'}`}>
                  <span className="text-xs">{line.label}</span>
                  <span className="text-xs font-medium tabular-nums">{line.isSubtract?'−':''}{formatCurrency(Math.abs(line.value))}</span>
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
      <div className="text-3xl font-bold text-gray-900 mb-4">{formatCurrency(value)}</div>
      <div className="space-y-2.5">
        {[{label:'vs Forecast',delta:cmp1Delta,pct:cmp1Pct,base:cmp1Value},{label:'vs Prior Year',delta:cmp2Delta,pct:cmp2Pct,base:cmp2Value}].map(({label,delta,pct,base})=>(
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendBadge delta={delta} label={pct}/>
              <span className={`text-sm font-semibold ${varColor(delta)}`}>{delta>0?'+':''}{formatCurrency(delta)}</span>
              <span className="text-xs text-gray-400">vs {formatCurrency(base)}</span>
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
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11}/>
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--color-accent)'}}>{title}</div>

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

const CHART_CATALOG = [
  { group: 'Giving & Supporters', items: [
    { id:'new-patron-chart',   label:'New Supporters by Month',    description:'Year-over-year monthly new supporter comparison' },
    { id:'patron-base-chart',  label:'Monthly Supporter Base',     description:'Total active supporters each month' },
    { id:'giving-trend',       label:'Giving Trend',               description:'Monthly giving over time vs prior year' },
    { id:'avg-gift-trend',     label:'Avg Gift Size Trend',        description:'Average gift amount month-over-month' },
  ]},
  { group: 'Expenses & Operations', items: [
    { id:'expense-trend',      label:'Expense Trend',              description:'Monthly expenses vs budget over time' },
    { id:'expense-breakdown',  label:'Expense Breakdown',          description:'Spending by category as stacked bars' },
    { id:'budget-utilization', label:'Budget Utilization',         description:'% of budget consumed each month, cumulative' },
    { id:'staff-ratio-trend',  label:'Staff Cost Ratio Trend',     description:'Staff % of income over time' },
  ]},
  { group: 'Net & Cash', items: [
    { id:'net-income-trend',   label:'Net Income Trend',           description:'Monthly net operating income over time' },
    { id:'cash-position',      label:'Cash Position Trend',        description:'Cash balance over time' },
    { id:'giving-vs-budget',   label:'Giving vs Budget',           description:'Actual giving vs budget line — monthly' },
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
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--color-accent)'}}>{group.group}</div>
                  <div className="space-y-1.5">
                    {groupAvailable.map(card=>(
                      <button key={card.id} onClick={()=>{onAdd(card);onClose()}} className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all group">
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
                style={{backgroundColor:'var(--color-accent)'}}>
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

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-accent)'}}>{children}</span>
      <div className="flex-1 border-t border-gray-200"/>
    </div>
  )
}

function SectionHeader({ title, editMode, onToggleEdit, onAdd, showAdd=true }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{color:'var(--color-accent)'}}>{title}</h2>
      <div className="flex items-center gap-2">
        {editMode && showAdd && (
          <button onClick={onAdd} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white" style={{backgroundColor:'var(--color-accent)'}}>
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

function PLTable({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Profit & Loss</h2>
        <p className="text-xs text-gray-400 mt-0.5">Year-to-date actual vs. budget</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 w-64">Line Item</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Actual</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Budget</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Variance</th>
              <th className="text-right px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">% of Income</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row,i) => {
              const variance = (row.actual??0)-(row.budget??0)
              const totalIncome = data.find(r=>r.id==='total-income')?.actual||1
              const isSection=row.type==='section', isSubtotal=row.type==='subtotal', isTotal=row.type==='total', isSpacer=row.type==='spacer', isExpense=row.group==='expense'
              if(isSpacer) return <tr key={i}><td colSpan={5} className="py-2"/></tr>
              return (
                <tr key={i} className={`border-b border-gray-50 transition-colors ${isSection?'bg-gray-50':''} ${isTotal?'bg-gray-900':''} ${isSubtotal?'bg-gray-50':''} ${!isSection&&!isSubtotal&&!isTotal?'hover:bg-gray-50':''}`}>
                  <td className={`px-6 py-2.5 ${isSection?'text-[10px] font-bold uppercase tracking-widest':''} ${isSubtotal?'font-semibold text-gray-700 pl-6':''} ${isTotal?'font-bold text-white':''} ${!isSection&&!isSubtotal&&!isTotal?'text-gray-700 pl-10':''}`}
                    style={isSection?{color:'var(--color-accent)'}:{}}>
                    {row.label}
                  </td>
                  {isSection?<td colSpan={4}/>:(
                    <>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${isTotal?'text-white':isSubtotal?'text-gray-800':'text-gray-700'}`}>{row.actual!==undefined?formatCurrency(row.actual,{compact:false}):'—'}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${isTotal?'text-gray-300':'text-gray-500'}`}>{row.budget!==undefined?formatCurrency(row.budget,{compact:false}):'—'}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${isTotal?(variance>=0?'text-emerald-400':'text-red-400'):isExpense?(variance<=0?'text-emerald-600':'text-red-600'):(variance>=0?'text-emerald-600':'text-red-600')}`}>{row.actual!==undefined?(variance>=0?'+':'')+formatCurrency(variance,{compact:false}):'—'}</td>
                      <td className={`px-6 py-2.5 text-right tabular-nums text-xs ${isTotal?'text-gray-300':'text-gray-400'}`}>{row.actual!==undefined&&!isSection?formatPercent(row.actual/totalIncome*100,{decimals:1}):''}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Patron cards (dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function PatronMetricCard({ label, mainValue, sub1Label, sub1Delta, sub1Format, sub2Label, sub2Delta, sub2Format, editMode, onRemove }) {
  function fmt(d, f) {
    if(d===null||d===undefined) return '—'
    if(f==='currency') return (d>0?'+':'')+formatCurrency(d)
    if(f==='percent') return formatPercent(d,{showSign:true,decimals:1})
    if(f==='count') return (d>0?'+':'')+d.toLocaleString()
    return (d>0?'+':'')+d
  }
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[180px]">
      {editMode&&onRemove&&<button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--color-accent)'}}>{label}</div>
      <div className="text-3xl font-bold text-gray-900 mb-3">{mainValue}</div>
      <div className="space-y-1.5">
        {sub1Label&&<div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-400">{sub1Label}</span><span className={`text-xs font-semibold tabular-nums ${varColor(sub1Delta)}`}>{fmt(sub1Delta,sub1Format)}</span></div>}
        {sub2Label&&<div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-400">{sub2Label}</span><span className={`text-xs font-semibold tabular-nums ${varColor(sub2Delta)}`}>{fmt(sub2Delta,sub2Format)}</span></div>}
      </div>
    </div>
  )
}

const TOOLTIP_STYLE = { backgroundColor:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', fontSize:'12px' }

function NewPatronChartCard({ data, editMode, onRemove }) {
  const [chartType, setChartType] = useState('line')
  const sharedProps = { data, margin:{top:5,right:5,left:-20,bottom:0} }
  const xAxis = <XAxis dataKey="month" tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
  const yAxis = <YAxis tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
  const grid  = <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
  const tip   = <Tooltip contentStyle={TOOLTIP_STYLE}/>
  const leg   = <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px'}}/>

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {editMode&&onRemove&&<button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors z-10"><X size={11}/></button>}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-0.5">New Supporters by Month</div>
          <div className="text-[10px] text-gray-400">Year-over-year comparison</div>
        </div>
        <ChartTypeToggle type={chartType} onChange={setChartType}/>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType==='bar' ? (
          <BarChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Bar dataKey="newCY" name="This Year"  fill="var(--color-accent)"  radius={[3,3,0,0]} opacity={0.85}/>
            <Bar dataKey="newPY" name="Prior Year" fill="var(--color-primary)" radius={[3,3,0,0]} opacity={0.6}/>
          </BarChart>
        ) : chartType==='area' ? (
          <AreaChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Area type="monotone" dataKey="newCY" name="This Year"  stroke="var(--color-accent)"  fill="var(--color-accent-light)"   strokeWidth={2.5} fillOpacity={0.4}/>
            <Area type="monotone" dataKey="newPY" name="Prior Year" stroke="var(--color-primary)" fill="var(--color-primary-light)"  strokeWidth={2}   fillOpacity={0.3}/>
          </AreaChart>
        ) : (
          <LineChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Line type="monotone" dataKey="newCY" name="This Year"  stroke="var(--color-accent)"  strokeWidth={2.5} dot={false} activeDot={{r:4}}/>
            <Line type="monotone" dataKey="newPY" name="Prior Year" stroke="var(--color-primary)" strokeWidth={2}   dot={false} strokeDasharray="5 3" opacity={0.7}/>
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function PatronBaseChartCard({ data, editMode, onRemove }) {
  const [chartType, setChartType] = useState('bar')
  const sharedProps = { data, margin:{top:5,right:5,left:-20,bottom:0} }
  const xAxis = <XAxis dataKey="month" tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
  const yAxis = <YAxis tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false} domain={[20000,'auto']} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}K`:v}/>
  const grid  = <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
  const tip   = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>v.toLocaleString()}/>
  const leg   = <Legend wrapperStyle={{fontSize:'11px',paddingTop:'8px'}}/>

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {editMode&&onRemove&&<button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors z-10"><X size={11}/></button>}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-0.5">Monthly Supporter Base</div>
          <div className="text-[10px] text-gray-400">Total active supporters per month</div>
        </div>
        <ChartTypeToggle type={chartType} onChange={setChartType}/>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType==='line' ? (
          <LineChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Line type="monotone" dataKey="total" name="Total Supporters" stroke="var(--color-accent)" strokeWidth={2.5} dot={false} activeDot={{r:4}}/>
          </LineChart>
        ) : chartType==='area' ? (
          <AreaChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Area type="monotone" dataKey="total" name="Total Supporters" stroke="var(--color-accent)" fill="var(--color-accent-light)" strokeWidth={2.5} fillOpacity={0.5}/>
          </AreaChart>
        ) : (
          <BarChart {...sharedProps}>{grid}{xAxis}{yAxis}{tip}{leg}
            <Bar dataKey="total" name="Total Supporters" fill="var(--color-accent)" radius={[4,4,0,0]} opacity={0.85}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Summary Tab — full narrative document
// ─────────────────────────────────────────────────────────────────────────────

const WATCH_STATUSES = {
  'needs-attention': { label: 'NEEDS ATTENTION', pill: 'bg-red-50 text-red-600 border border-red-200' },
  'monitoring':      { label: 'MONITORING',       pill: 'bg-blue-50 text-blue-600 border border-blue-200' },
  'on-track':        { label: 'ON TRACK',          pill: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
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
        <p className="mt-3 text-xs font-semibold uppercase tracking-widest" style={{color:'var(--color-accent)'}}>{q.author}</p>
      </div>
    </div>
  )
}

function MonthlySummaryTab({ summaries, onUpdateSummary, onAddSummary }) {
  // Months that have data
  const existingMonths = Object.keys(summaries).sort((a,b) => new Date('1 '+b)-new Date('1 '+a))
  const [currentMonth, setCurrentMonth] = useState(existingMonths[0] || ALL_MONTHS[0])
  const [editMode, setEditMode] = useState(false)
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [showAddKPI, setShowAddKPI] = useState(false)
  const [newMonthSel, setNewMonthSel] = useState(ALL_MONTHS[0])

  const summary = summaries[currentMonth]
  const noData  = !summary

  function update(key, value) { onUpdateSummary(currentMonth, key, value) }

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

  function handleCreateMonth() {
    onAddSummary(newMonthSel)
    setCurrentMonth(newMonthSel)
    setShowAddMonth(false)
    setEditMode(true)
  }

  const fin = summary?.financials || {}
  const netActual  = (fin.giving?.actual||0) - (fin.expenses?.actual||0)
  const netBudget  = (fin.giving?.budget||0) - (fin.expenses?.budget||0)
  const netPriorYr = (fin.giving?.priorYear||0) - (fin.expenses?.priorYear||0)

  // Extract just the month name (e.g. "April 2026" → "April")
  const monthLabel = currentMonth.split(' ')[0]

  function renderMonthlyKPICard(cardId) {
    const remove = () => update('kpiCards', (summary.kpiCards||[]).filter(c=>c!==cardId))
    if (cardId === 'monthly-giving') {
      return <MonthlyKPICard key={cardId} title={`Total Giving — ${monthLabel}`}
        actual={fin.giving?.actual||0} budget={fin.giving?.budget||0} priorYear={fin.giving?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>updateFinancials('giving',f,v)} onRemove={remove}/>
    }
    if (cardId === 'monthly-expenses') {
      return <MonthlyKPICard key={cardId} title={`Expenses — ${monthLabel}`} inverse
        actual={fin.expenses?.actual||0} budget={fin.expenses?.budget||0} priorYear={fin.expenses?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>updateFinancials('expenses',f,v)} onRemove={remove}/>
    }
    if (cardId === 'monthly-net') {
      return <MonthlyKPICard key={cardId} title={`Net Position — ${monthLabel}`}
        actual={netActual} budget={netBudget} priorYear={netPriorYr}
        editMode={editMode} onEdit={()=>{}} onRemove={remove}/>
    }
    if (cardId === 'monthly-cash') {
      return <MonthlyKPICard key={cardId} title={`Month-End Cash — ${monthLabel}`}
        actual={summary.cash?.actual||0} budget={summary.cash?.budget||0} priorYear={summary.cash?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>{const c={...(summary.cash||{}),[f]:v};update('cash',c)}} onRemove={remove}/>
    }
    if (cardId === 'monthly-supporters') {
      return <MonthlyKPICard key={cardId} title={`Active Supporters — ${monthLabel}`}
        actual={summary.supporters?.actual||0} budget={summary.supporters?.budget||0} priorYear={summary.supporters?.priorYear||0}
        editMode={editMode} onEdit={(f,v)=>{const s={...(summary.supporters||{}),[f]:v};update('supporters',s)}} onRemove={remove}/>
    }
    return null
  }

  return (
    <div className="min-h-screen" style={{backgroundColor:'var(--color-primary-bg)'}}>
      <div className="max-w-2xl mx-auto px-6 py-8 pb-16">

        {/* ── Document header: icon + title + inline month selector + action buttons ── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          {/* Left: icon + label + month dropdown + prepared date */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                 style={{backgroundColor:'var(--color-accent-light)'}}>
              <FileText size={18} style={{color:'var(--color-accent)'}}/>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5"
                 style={{color:'var(--color-accent)'}}>
                Financial Summary
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {existingMonths.length > 0 ? (
                  <select
                    value={currentMonth}
                    onChange={e => setCurrentMonth(e.target.value)}
                    className="text-xl font-bold text-gray-900 bg-transparent border-none focus:outline-none cursor-pointer py-0 pl-0 pr-6"
                    style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24'%3E%3Cpath fill='%236b7280' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 2px center', appearance:'none', WebkitAppearance:'none'}}>
                    {existingMonths.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <span className="text-xl font-bold text-gray-900">{currentMonth}</span>
                )}
                {summary && (
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
            <button onClick={() => setShowAddMonth(true)}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg text-white whitespace-nowrap"
              style={{backgroundColor:'var(--color-accent)'}}>
              <Plus size={11}/> New Month
            </button>
            <button onClick={() => setEditMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${editMode ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
              {editMode ? <><Check size={12}/> Done</> : <><Pencil size={12}/> Edit</>}
            </button>
          </div>
        </div>

        {noData ? (
          /* ── No summary state ── */
          <div className="text-center py-16">
            <FileText size={40} className="text-gray-200 mx-auto mb-4"/>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No summary for {currentMonth}</h3>
            <p className="text-sm text-gray-400 mb-6">Create a monthly narrative summary for this period.</p>
            <button onClick={() => { onAddSummary(currentMonth); setEditMode(true) }}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white"
              style={{backgroundColor:'var(--color-accent)'}}>
              Create Summary
            </button>
          </div>
        ) : (
          <>

          {/* ── OVERALL SUMMARY ── */}
          <SectionLabel>Overall Summary</SectionLabel>
          <div className="mb-2">
            <EditableTitle value={summary.title} onChange={v=>update('title',v)} editMode={editMode}
              className="text-3xl font-bold text-gray-900 leading-tight mb-4"/>
          </div>
          <EditableArea value={summary.overallSummary} onChange={v=>update('overallSummary',v)} editMode={editMode}
            className="text-sm text-gray-600 leading-relaxed" rows={4} placeholder="Write an overall summary of the month..."/>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── FINANCIAL POSITION ── */}
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>Financial Position</SectionLabel>
          </div>
          <div className="flex gap-3 flex-wrap mb-4">
            {(summary.kpiCards||[]).map(id => renderMonthlyKPICard(id))}
            {editMode && (
              <button onClick={()=>setShowAddKPI(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-4 min-w-[140px] text-gray-300 hover:text-gray-500">
                <Plus size={18}/><span className="text-xs font-medium">Add card</span>
              </button>
            )}
          </div>
          <div className="mt-6">
            <EditableArea value={summary.monthlyNarrative} onChange={v=>update('monthlyNarrative',v)} editMode={editMode}
              className="text-sm text-gray-600 leading-relaxed" rows={6} placeholder="Describe what happened this month, why, and whether you're on track..."/>
          </div>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── KEY TAKEAWAYS ── */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-accent)'}}>Key Takeaways</span>
            <div className="flex-1 mx-4 border-t border-gray-200"/>
            {editMode && <button onClick={addTakeaway} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{backgroundColor:'var(--color-accent)'}}><Plus size={11}/> Add</button>}
          </div>
          <div className="space-y-0">
            {(summary.keyTakeaways||[]).map((kt, idx) => (
              <div key={kt.id} className="py-5 border-b border-gray-100 last:border-0">
                <div className="flex items-start gap-4">
                  <span className="text-sm font-bold tabular-nums flex-shrink-0 mt-0.5 w-6" style={{color:'var(--color-accent)'}}>{String(idx+1).padStart(2,'0')}</span>
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
                        <p className="text-sm text-gray-600 leading-relaxed">{kt.body}</p>
                      </>
                    )}
                  </div>
                  {editMode && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={()=>moveTakeaway(idx,-1)} disabled={idx===0} className="p-1 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={14}/></button>
                      <button onClick={()=>moveTakeaway(idx,1)} disabled={idx===(summary.keyTakeaways.length-1)} className="p-1 rounded text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={14}/></button>
                      <button onClick={()=>removeTakeaway(idx)} className="p-1 rounded text-gray-300 hover:text-red-500"><X size={14}/></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(summary.keyTakeaways||[]).length===0 && editMode && (
              <p className="text-sm text-gray-400 italic py-4">No takeaways yet. Click "+ Add" to add one.</p>
            )}
          </div>
          <div className="my-8"/>

          {/* ── ROLLING QUOTE ── */}
          <RollingQuoteSection/>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── WATCH AREAS ── */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-accent)'}}>Watch Areas</span>
            <div className="flex-1 mx-4 border-t border-gray-200"/>
            {editMode && <button onClick={addWatchArea} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white" style={{backgroundColor:'var(--color-accent)'}}><Plus size={11}/> Add</button>}
          </div>
          <div className="space-y-6">
            {(summary.watchAreas||[]).map((wa, idx) => {
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
            {(summary.watchAreas||[]).length===0 && editMode && (
              <p className="text-sm text-gray-400 italic">No watch areas yet. Click "+ Add" to add one.</p>
            )}
          </div>
          <div className="my-8 border-t border-gray-200"/>

          {/* ── RESERVES ── */}
          <SectionLabel>Reserves</SectionLabel>
          <EditableArea value={summary.reserves} onChange={v=>update('reserves',v)} editMode={editMode}
            className="text-sm text-gray-700 leading-relaxed mb-4" rows={4} placeholder="Describe the reserves position, rationale, and outlook..."/>
          {(editMode || summary.reservesNote) && (
            <EditableArea value={summary.reservesNote} onChange={v=>update('reservesNote',v)} editMode={editMode}
              className="text-xs text-gray-400 leading-relaxed" rows={2} placeholder="Add a footnote or note about reserve reporting timing..."/>
          )}

          {/* ── FOOTER ── */}
          <div className="mt-12 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>Prepared by the Finance Team · {summary.prepared}</span>
            {existingMonths[1] && <span>Next summary · {existingMonths[0]}</span>}
          </div>
          </>
        )}

      </div>{/* end max-w-2xl */}

      {/* Add Month Modal */}
      {showAddMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Create Summary for Month</h3>
            <select value={newMonthSel} onChange={e=>setNewMonthSel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 mb-4">
              {ALL_MONTHS.filter(m=>!summaries[m]).map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={()=>setShowAddMonth(false)} className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleCreateMonth} className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors" style={{backgroundColor:'var(--color-accent)'}}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add KPI Card Panel */}
      {showAddKPI && (
        <AddCardPanel title="Add Monthly KPI Card"
          suggestedCards={MONTHLY_SUGGESTED_KPI}
          existingIds={summary?.kpiCards||[]}
          onAdd={card=>update('kpiCards',[...(summary.kpiCards||[]),card.id])}
          onClose={()=>setShowAddKPI(false)}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPI_CARDS    = ['giving','expenses','net-position','cash']
const DEFAULT_PATRON_CARDS = ['total-patrons','new-patrons','avg-gift','new-patron-chart','patron-base-chart']
const manualCardStore = {}

function DashboardTab({ dateRange, orgConfig }) {
  const now = new Date()
  // Most recent completed month (last month)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const currentMonthDisplay = lastMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  const [editKPI,       setEditKPI]       = useState(false)
  const [editPatron,    setEditPatron]    = useState(false)
  const [kpiCards,      setKpiCards]      = useState(DEFAULT_KPI_CARDS)
  const [patronCards,   setPatronCards]   = useState(DEFAULT_PATRON_CARDS)
  const [showAddKPI,    setShowAddKPI]    = useState(false)
  const [showAddPatron, setShowAddPatron] = useState(false)

  const d = ELT_MOCK
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

  function renderKPICard(cardId) {
    if(cardId==='giving') {
      const d1=totalGiving-totalForecast,d2=totalGiving-totalPriorGiv
      return <KPICard key={cardId} title="Total Giving YTD" value={formatCurrency(totalGiving)}
        cmp1Label="vs Forecast" cmp1Value={totalForecast} cmp1Delta={d1} cmp1Pct={formatPercent(d1/totalForecast*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={totalPriorGiv} cmp2Delta={d2} cmp2Pct={formatPercent(d2/totalPriorGiv*100,{showSign:true})}
        editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    if(cardId==='expenses') {
      const d1=totalExpenses-totalBudgetExp,d2=totalExpenses-totalPriorExp
      return <KPICard key={cardId} title="Expenses YTD" value={formatCurrency(totalExpenses)}
        cmp1Label="vs Budget" cmp1Value={totalBudgetExp} cmp1Delta={d1} cmp1Pct={formatPercent(d1/totalBudgetExp*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={totalPriorExp} cmp2Delta={d2} cmp2Pct={formatPercent(d2/totalPriorExp*100,{showSign:true})}
        inverse editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    if(cardId==='net-position') {
      const d1=netPosition-netForecast,d2=netPosition-netPriorYear
      return <NetPositionCard key={cardId} value={netPosition}
        cmp1Delta={d1} cmp1Pct={formatPercent(d1/Math.abs(netForecast)*100,{showSign:true})} cmp1Value={netForecast}
        cmp2Delta={d2} cmp2Pct={formatPercent(d2/Math.abs(netPriorYear)*100,{showSign:true})} cmp2Value={netPriorYear}
        breakdown={{lines:[
          {label:'Contributions',value:d.giving.contributions},
          {label:'Merchandise Revenue',value:d.giving.merchandiseRevenue},
          {label:'Other Income',value:d.giving.otherIncome},
          {label:'Total Income',value:totalGiving,isTotal:true},
          {label:'Total Expenses',value:totalExpenses,isSubtract:true,isTotal:true},
        ]}}
        editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    if(cardId==='cash') {
      const d1=d.cash.current-d.cash.priorMonth,d2=d.cash.current-d.cash.priorYear
      return <KPICard key={cardId} title="Cash Position" value={formatCurrency(d.cash.current)}
        cmp1Label="vs Prior Month" cmp1Value={d.cash.priorMonth} cmp1Delta={d1} cmp1Pct={formatPercent(d1/d.cash.priorMonth*100,{showSign:true})}
        cmp2Label="vs Prior Year" cmp2Value={d.cash.priorYear} cmp2Delta={d2} cmp2Pct={formatPercent(d2/d.cash.priorYear*100,{showSign:true})}
        editMode={editKPI} onRemove={()=>setKpiCards(p=>p.filter(c=>c!==cardId))}/>
    }
    const stored = manualCardStore[cardId] || {label:cardId,value:'—'}
    return (
      <div key={cardId} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
        {editKPI&&<button onClick={()=>setKpiCards(p=>p.filter(c=>c!==cardId))} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"><X size={11}/></button>}
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--color-accent)'}}>{stored.label}</div>
        <div className="text-3xl font-bold text-gray-900">{stored.value||'—'}</div>
      </div>
    )
  }

  function renderPatronCard(cardId) {
    const p = d.patrons
    if(cardId==='total-patrons') return <PatronMetricCard key={cardId} label="Total Patrons" mainValue={p.total.toLocaleString()} sub1Label="vs Prior Month" sub1Delta={p.total-p.priorMonth} sub1Format="count" sub2Label="vs Prior Year" sub2Delta={p.total-p.priorYear} sub2Format="count" editMode={editPatron} onRemove={()=>setPatronCards(c=>c.filter(x=>x!==cardId))}/>
    if(cardId==='new-patrons') return <PatronMetricCard key={cardId} label="New Patrons (Period)" mainValue={p.newThisPeriod.toLocaleString()} sub1Label="vs Prior Period" sub1Delta={p.newThisPeriod-p.newPriorPeriod} sub1Format="count" sub2Label="Growth rate" sub2Delta={(p.newThisPeriod/p.newPriorPeriod-1)*100} sub2Format="percent" editMode={editPatron} onRemove={()=>setPatronCards(c=>c.filter(x=>x!==cardId))}/>
    if(cardId==='avg-gift'||cardId==='avg-gift-p') return <PatronMetricCard key={cardId} label="Avg Gift Size" mainValue={`$${p.avgGift.toFixed(2)}`} sub1Label="vs Prior Year" sub1Delta={p.avgGift-p.avgGiftPriorYear} sub1Format="currency" sub2Label={null} sub2Delta={null} sub2Format="plain" editMode={editPatron} onRemove={()=>setPatronCards(c=>c.filter(x=>x!==cardId))}/>
    if(cardId==='new-patron-chart') return <NewPatronChartCard key={cardId} data={p.monthly} editMode={editPatron} onRemove={()=>setPatronCards(c=>c.filter(x=>x!==cardId))}/>
    if(cardId==='patron-base-chart') return <PatronBaseChartCard key={cardId} data={p.base} editMode={editPatron} onRemove={()=>setPatronCards(c=>c.filter(x=>x!==cardId))}/>
    return null
  }

  const patronMetricIds = patronCards.filter(id=>['total-patrons','new-patrons','avg-gift','avg-gift-p'].includes(id)||id.startsWith('manual-'))
  const patronChartIds  = patronCards.filter(id=>['new-patron-chart','patron-base-chart'].includes(id))

  return (
    <div className="p-6 space-y-8 max-w-screen-xl mx-auto">

      {/* ── Page header: org logo + "Financial Summary" + month | period ── */}
      <div className="flex items-start gap-4 pb-2 border-b border-gray-100">
        {/* Logo slot — swap orgConfig.logoUrl for a real image when ready */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
             style={{backgroundColor: orgConfig?.accentColor || 'var(--color-accent)'}}>
          {orgConfig?.logoUrl
            ? <img src={orgConfig.logoUrl} alt={orgConfig?.name} className="w-8 h-8 object-contain rounded"/>
            : <BarChart2 size={22} className="text-white"/>}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1"
             style={{color:'var(--color-accent)'}}>
            Financial Summary
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
        <div className="flex gap-4 flex-wrap">
          {kpiCards.map(id=>renderKPICard(id))}
          {editKPI&&<button onClick={()=>setShowAddKPI(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-5 min-w-[160px] text-gray-300 hover:text-gray-500"><Plus size={20}/><span className="text-xs font-medium">Add card</span></button>}
        </div>
      </section>

      {/* Patron Composition */}
      <section>
        <SectionHeader title="Patron Composition" editMode={editPatron} onToggleEdit={()=>setEditPatron(v=>!v)} onAdd={()=>setShowAddPatron(true)}/>
        {patronMetricIds.length>0&&(
          <div className="flex gap-4 flex-wrap mb-5">
            {patronMetricIds.map(id=>renderPatronCard(id))}
            {editPatron&&<button onClick={()=>setShowAddPatron(true)} className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-400 transition-all p-5 min-w-[160px] text-gray-300 hover:text-gray-500"><Plus size={20}/><span className="text-xs font-medium">Add card</span></button>}
          </div>
        )}
        {patronChartIds.length>0&&(
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {patronChartIds.map(id=>renderPatronCard(id))}
          </div>
        )}
      </section>

      {/* P&L */}
      <section><PLTable data={plData}/></section>

      {showAddKPI&&<AddCardPanel title="Add KPI Card" catalog={KPI_CATALOG} existingIds={kpiCards} onAdd={card=>{if(card.manual)manualCardStore[card.id]=card;setKpiCards(p=>[...p,card.id])}} onClose={()=>setShowAddKPI(false)}/>}
      {showAddPatron&&<AddCardPanel title="Add Chart / Patron Card" catalog={CHART_CATALOG} existingIds={patronCards} onAdd={card=>{if(card.manual)manualCardStore[card.id]=card;setPatronCards(p=>[...p,card.id])}} onClose={()=>setShowAddPatron(false)} isChart/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────

function TeamDetailDrawer({ team, onClose }) {
  const [chartType, setChartType] = useState('bar')
  const [notes, setNotes] = useState('')
  const monthly = teamMonthly(team.cats, team.spreadKey)
  const catKeys = Object.keys(team.cats)
  const variance    = team.actual - team.budget
  const variancePct = team.budget > 0 ? (variance / team.budget * 100) : 0

  const xAxis = <XAxis dataKey="month" tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false}/>
  const yAxis = <YAxis tick={{fontSize:10,fill:'#9ca3af'}} axisLine={false} tickLine={false}
    tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}K`:v}/>
  const grid  = <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
  const tip   = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>formatCurrency(v,{compact:false})}/>
  const leg   = <Legend wrapperStyle={{fontSize:'10px',paddingTop:'8px'}}/>

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose}/>
      <div className="fixed top-0 right-0 h-full w-[580px] z-50 bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{color:'var(--color-accent)'}}>Team Detail</p>
            <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manager: {team.manager} · Dept {team.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button disabled title="Dashboard not yet created"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 bg-gray-100 cursor-not-allowed opacity-60">
              <LayoutDashboard size={12}/> Open Dashboard
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Actual YTD</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(team.actual)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Budget YTD</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(team.budget)}</div>
            </div>
            <div className={`rounded-xl p-3 text-center ${variance>0?'bg-red-50':'bg-emerald-50'}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Variance</div>
              <div className={`text-lg font-bold ${variance>0?'text-red-600':'text-emerald-600'}`}>
                {variance>0?'+':''}{formatCurrency(variance)}
              </div>
              <div className={`text-[10px] font-medium mt-0.5 ${variance>0?'text-red-500':'text-emerald-500'}`}>
                {variance>0?'+':''}{variancePct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Monthly spend chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-semibold text-gray-700">Monthly Spend by Category</div>
                <div className="text-[10px] text-gray-400">Based on annual actuals with seasonal distribution</div>
              </div>
              <ChartTypeToggle type={chartType} onChange={setChartType}/>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              {chartType==='line' ? (
                <LineChart data={monthly} margin={{top:5,right:5,left:-10,bottom:0}}>
                  {grid}{xAxis}{yAxis}{tip}{leg}
                  {catKeys.map((key,i)=>(
                    <Line key={key} type="monotone" dataKey={key}
                      name={TEAM_CAT_MAP[key]?.label||key}
                      stroke={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
                      strokeWidth={2} dot={false}/>
                  ))}
                </LineChart>
              ) : chartType==='area' ? (
                <AreaChart data={monthly} margin={{top:5,right:5,left:-10,bottom:0}}>
                  {grid}{xAxis}{yAxis}{tip}{leg}
                  {catKeys.map((key,i)=>(
                    <Area key={key} type="monotone" dataKey={key} stackId="1"
                      name={TEAM_CAT_MAP[key]?.label||key}
                      stroke={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
                      fill={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
                      fillOpacity={0.65}/>
                  ))}
                </AreaChart>
              ) : (
                <BarChart data={monthly} margin={{top:5,right:5,left:-10,bottom:0}}>
                  {grid}{xAxis}{yAxis}{tip}{leg}
                  {catKeys.map((key,i)=>(
                    <Bar key={key} dataKey={key} stackId="a"
                      name={TEAM_CAT_MAP[key]?.label||key}
                      fill={TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color}
                      radius={i===catKeys.length-1?[3,3,0,0]:[0,0,0,0]}/>
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Category line-item variance table */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-3">Category Breakdown</div>
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left  px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Line Item</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Actual</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Budget</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var $</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">Var %</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-400">PY Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {catKeys.map((key,i) => {
                    const cat   = team.cats[key]
                    const label = TEAM_CAT_MAP[key]?.label || key
                    const color = TEAM_CATEGORIES[i%TEAM_CATEGORIES.length].color
                    const v     = cat.actual - cat.budget
                    const vPct  = cat.budget > 0 ? (v/cat.budget*100) : 0
                    const vsPY  = cat.actual - (cat.priorYear||0)
                    return (
                      <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:color}}/>
                            <span className="font-medium text-gray-700">{label}</span>
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
                  {/* Totals row */}
                  <tr className="bg-gray-900">
                    <td className="px-4 py-2.5 font-bold text-white text-xs">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-white">{formatCurrency(team.actual)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{formatCurrency(team.budget)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${variance>0?'text-red-400':'text-emerald-400'}`}>
                      {variance>0?'+':''}{formatCurrency(variance)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${variancePct>0?'text-red-400':'text-emerald-400'}`}>
                      {variancePct>0?'+':''}{variancePct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {formatCurrency(catKeys.reduce((s,k)=>s+(team.cats[k].priorYear||0),0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Manager notes */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2">Manager Notes</div>
            <textarea
              value={notes} onChange={e=>setNotes(e.target.value)}
              placeholder="Add context, action items, or notes about this team's performance..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 resize-none focus:outline-none focus:border-gray-400 placeholder-gray-300"/>
          </div>

        </div>{/* end scroll */}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Tab — full enterprise layout
// ─────────────────────────────────────────────────────────────────────────────

function TeamsTab({ dateRange }) {
  const teams = TEAMS_MOCK
  const totalActual  = teams.reduce((s,t) => s+t.actual, 0)
  const totalBudget  = teams.reduce((s,t) => s+t.budget, 0)
  const totalVariance = totalActual - totalBudget
  const overBudget   = teams.filter(t => t.actual > t.budget).length

  const [sortKey,  setSortKey]  = useState('name')
  const [sortDir,  setSortDir]  = useState(1)
  const [selected, setSelected] = useState(null)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const sorted = [...teams].sort((a,b) => {
    let av, bv
    if (sortKey==='name')    { av=a.name;                 bv=b.name }
    if (sortKey==='actual')  { av=a.actual;               bv=b.actual }
    if (sortKey==='budget')  { av=a.budget;               bv=b.budget }
    if (sortKey==='variance'){ av=a.actual-a.budget;      bv=b.actual-b.budget }
    if (sortKey==='pct')     { av=a.actual/a.budget;      bv=b.actual/b.budget }
    if (sortKey==='share')   { av=a.actual/totalActual;   bv=b.actual/totalActual }
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
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start gap-4 pb-2 border-b border-gray-100">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:'var(--color-accent-light)'}}>
          <Users size={18} style={{color:'var(--color-accent)'}}/>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{color:'var(--color-accent)'}}>
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
          { label:`Total Actuals · ${presetLabel(dateRange.preset)}`, value: formatCurrency(totalActual), sub: null, positive: true },
          { label:`Total Budget · ${presetLabel(dateRange.preset)}`,  value: formatCurrency(totalBudget), sub: null, positive: true },
          { label:'Variance YTD', value: (totalVariance>0?'+':'')+formatCurrency(totalVariance),
            sub: (totalVariance>0?'+':'')+((totalVariance/totalBudget)*100).toFixed(1)+'% of budget',
            positive: totalVariance <= 0 },
          { label:'Teams Over Budget', value: String(overBudget),
            sub: `${teams.length - overBudget} of ${teams.length} within budget`,
            positive: overBudget === 0 },
        ].map((card,i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{color:'var(--color-accent)'}}>{card.label}</div>
            <div className={`text-3xl font-bold mb-1 ${i>=2 ? (card.positive?'text-emerald-600':'text-red-600') : 'text-gray-900'}`}>
              {card.value}
            </div>
            {card.sub && <div className={`text-xs font-medium ${card.positive?'text-emerald-500':'text-red-500'}`}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Teams table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SortTh col="name">Team</SortTh>
              <SortTh col="actual" right>Actual</SortTh>
              <SortTh col="budget" right>Budget</SortTh>
              <SortTh col="variance" right>Variance</SortTh>
              <SortTh col="pct" right>Var %</SortTh>
              <th className="text-right px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(team => {
              const v    = team.actual - team.budget
              const vPct = team.budget > 0 ? (v/team.budget*100) : 0
              const share = totalActual > 0 ? (team.actual/totalActual*100) : 0
              const overBudget = v > 0
              return (
                <tr key={team.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={()=>setSelected(team)}
                        className="font-medium text-gray-800 hover:text-gray-600 hover:underline text-left transition-colors">
                        {team.name}
                      </button>
                      <button disabled title="Dashboard not yet created"
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-400 cursor-not-allowed transition-all">
                        <ExternalLink size={9}/> Dashboard
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{team.manager}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-700">{formatCurrency(team.actual,{compact:false})}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-400">{formatCurrency(team.budget,{compact:false})}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${overBudget?'text-red-600':'text-emerald-600'}`}>
                    {v>0?'+':''}{formatCurrency(v,{compact:false})}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium text-xs ${overBudget?'text-red-500':'text-emerald-500'}`}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${overBudget?'bg-red-50':'bg-emerald-50'}`}>
                      {vPct>0?'+':''}{vPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${Math.min(share*3,100)}%`,backgroundColor:'var(--color-accent)'}}/>
                      </div>
                      <span className="text-xs tabular-nums text-gray-500 w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
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

      {selected && <TeamDetailDrawer team={selected} onClose={()=>setSelected(null)}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [docs] = useState([
    {id:1,name:'Statement of Activity – April 2026.pdf',month:'Apr 2026',type:'Statement of Activity',size:'245 KB'},
    {id:2,name:'Balance Sheet – Q2 FY2026.pdf',month:'Mar 2026',type:'Balance Sheet',size:'189 KB'},
    {id:3,name:'Cash Flow Statement – YTD.xlsx',month:'May 2026',type:'Cash Flow',size:'312 KB'},
  ])
  return (
    <div className="p-6 max-w-screen-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-accent)'}}>Financial Documents</span>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{backgroundColor:'var(--color-accent)'}}><Upload size={12}/> Upload document</button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        {docs.map((doc,i)=>(
          <div key={doc.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${i>0?'border-t border-gray-50':''}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{backgroundColor:'var(--color-accent-light)'}}>
              <FileText size={14} style={{color:'var(--color-accent)'}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{doc.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{doc.type} · {doc.month} · {doc.size}</div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium flex-shrink-0">{doc.month}</span>
          </div>
        ))}
      </div>
      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-gray-400 transition-all cursor-pointer">
        <Upload size={24} className="text-gray-300 mx-auto mb-2"/>
        <p className="text-sm text-gray-400">Drop files here or click to upload</p>
        <p className="text-xs text-gray-300 mt-1">PDF, Excel, PNG, JPG — tied to a specific month</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Import Tab — includes Monthly Summary narrative import
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY_TEMPLATE = () => ({
  prepared: new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}),
  title: '',
  overallSummary: '',
  monthlyNarrative: '',
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

function ELTImportTab({ summaries, onUpdateSummary, onAddSummary }) {
  const [activeImport, setActiveImport] = useState('giving')
  const [summaryMonth, setSummaryMonth] = useState(ALL_MONTHS[0])
  const importTypes = [
    {id:'giving',label:'Giving & Revenue'},{id:'patrons',label:'Patron Data'},
    {id:'cash',label:'Cash Flow'},{id:'pnl',label:'P&L Data'},{id:'narrative',label:'Monthly Summary'},
  ]

  // Monthly summary quick-add form
  const existingMonths = Object.keys(summaries)
  const targetSummary = summaries[summaryMonth]

  function handleQuickAdd() {
    if (!summaries[summaryMonth]) onAddSummary(summaryMonth)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4"><span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{color:'var(--color-accent)'}}>ELT Data Import</span></div>
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 mb-6 w-fit flex-wrap">
        {importTypes.map(t=>(
          <button key={t.id} onClick={()=>setActiveImport(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${activeImport===t.id?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:text-gray-900'}`}>{t.label}</button>
        ))}
      </div>

      {activeImport === 'narrative' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Select Month</div>
            <div className="flex gap-3">
              <select value={summaryMonth} onChange={e=>setSummaryMonth(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
                {ALL_MONTHS.map(m=><option key={m} value={m}>{m}{summaries[m]?' ✓':''}</option>)}
              </select>
              {!targetSummary && (
                <button onClick={handleQuickAdd} className="px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap" style={{backgroundColor:'var(--color-accent)'}}>
                  + Create
                </button>
              )}
            </div>
            {targetSummary && (
              <p className="text-xs mt-2" style={{color:'var(--color-accent)'}}>✓ Summary exists for {summaryMonth}. Switch to the Summary tab to edit it.</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <Upload size={32} className="text-gray-200 mx-auto mb-3"/>
          <div className="text-sm font-medium text-gray-600 mb-1">
            Import {importTypes.find(t=>t.id===activeImport)?.label}
          </div>
          <div className="text-xs text-gray-400 mb-5">
            Upload a CSV or Excel file with {activeImport==='giving'?'giving/revenue':activeImport==='patrons'?'patron':activeImport==='cash'?'cash flow':'P&L'} data
          </div>
          <button className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{backgroundColor:'var(--color-accent)'}}>Choose file</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ELT Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function ELTDashboard() {
  const { orgConfig } = useApp()
  const [activeTab, setActiveTab] = useState('dashboard')

  const defaultRange = getELTPresetRange('fiscal-ytd', orgConfig)
  const [dateRange, setDateRange] = useState({ preset:'fiscal-ytd', ...defaultRange })

  // Monthly summaries — lifted to root so Import and Summary tabs share data
  const [summaries, setSummaries] = useState(INITIAL_SUMMARIES)

  function applyPreset(preset) { setDateRange({preset,...getELTPresetRange(preset,orgConfig)}) }
  function applyCustom(s,e)    { setDateRange({preset:'custom',startDate:s,endDate:e}) }

  function handleUpdateSummary(month, key, value) {
    setSummaries(prev => ({ ...prev, [month]: { ...prev[month], [key]: value } }))
  }
  function handleAddSummary(month) {
    setSummaries(prev => ({ ...prev, [month]: { ...EMPTY_SUMMARY_TEMPLATE(), ...prev[month] } }))
  }

  return (
    <div className="min-h-screen flex flex-col" style={{backgroundColor:'var(--color-primary-bg)'}}>
      <ELTNav orgConfig={orgConfig} activeTab={activeTab} setActiveTab={setActiveTab}
        dateRange={dateRange} onApplyPreset={applyPreset} onApplyCustom={applyCustom}/>
      <main className="flex-1 overflow-auto">
        {activeTab==='dashboard' && <DashboardTab dateRange={dateRange} orgConfig={orgConfig}/>}
        {activeTab==='summary'   && <MonthlySummaryTab summaries={summaries} onUpdateSummary={handleUpdateSummary} onAddSummary={handleAddSummary}/>}
        {activeTab==='teams'     && <TeamsTab dateRange={dateRange}/>}
        {activeTab==='documents' && <DocumentsTab/>}
        {activeTab==='import'    && <ELTImportTab summaries={summaries} onUpdateSummary={handleUpdateSummary} onAddSummary={handleAddSummary}/>}
      </main>
    </div>
  )
}
