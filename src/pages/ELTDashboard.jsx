import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import {
  ChevronDown, Pencil, Plus, X, Check, ChevronRight, ChevronLeft,
  TrendingUp, TrendingDown, Minus, Info, Upload,
  FileText, Users, BarChart2, LayoutDashboard, Settings
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { formatCurrency, formatPercent, daysBetween } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// ELT Mock Data — replace via ELT Import tab
// ─────────────────────────────────────────────────────────────────────────────

const ELT_MOCK = {
  // Income categories (YTD actuals)
  giving: {
    contributions:       2_450_000,
    merchandiseRevenue:    185_430,
    otherIncome:            42_100,
  },
  // Budget amounts
  budget: {
    contributions:       2_380_000,
    merchandiseRevenue:    175_000,
    otherIncome:            38_000,
    staff:             1_280_000,
    contract:             95_000,
    technology:          158_000,
    travel:               38_000,
    otherGenAdmin:        72_000,
  },
  // Prior year actuals
  priorYear: {
    contributions:       2_210_000,
    merchandiseRevenue:    168_200,
    otherIncome:            37_500,
    expenses:            1_520_000,
  },
  // Cash position
  cash: {
    current:           3_240_000,
    priorMonth:        3_105_000,
    priorYear:         2_870_000,
  },
  // Forecast (full-year giving projection, prorated for current period)
  forecast: {
    contributions:       2_350_000,
    merchandiseRevenue:    178_000,
    otherIncome:            40_000,
  },
  // Patron data
  patrons: {
    total:                   24_810,
    priorMonth:              24_420,
    priorYear:               22_300,
    newThisPeriod:            2_510,
    newPriorPeriod:           2_340,
    avgGift:                 98.72,
    avgGiftPriorYear:        94.30,
    // monthly: new patrons by month (last 12 months, with prior year)
    monthly: [
      { month: 'Jun', newCY: 195, newPY: 175 },
      { month: 'Jul', newCY: 210, newPY: 188 },
      { month: 'Aug', newCY: 225, newPY: 195 },
      { month: 'Sep', newCY: 198, newPY: 182 },
      { month: 'Oct', newCY: 215, newPY: 200 },
      { month: 'Nov', newCY: 242, newPY: 218 },
      { month: 'Dec', newCY: 290, newPY: 260 },
      { month: 'Jan', newCY: 185, newPY: 170 },
      { month: 'Feb', newCY: 195, newPY: 178 },
      { month: 'Mar', newCY: 220, newPY: 195 },
      { month: 'Apr', newCY: 230, newPY: 205 },
      { month: 'May', newCY: 305, newPY: 274 },
    ],
    // monthly patron base
    base: [
      { month: 'Jun', total: 22_600 },
      { month: 'Jul', total: 22_800 },
      { month: 'Aug', total: 23_020 },
      { month: 'Sep', total: 23_215 },
      { month: 'Oct', total: 23_420 },
      { month: 'Nov', total: 23_660 },
      { month: 'Dec', total: 23_945 },
      { month: 'Jan', total: 24_130 },
      { month: 'Feb', total: 24_320 },
      { month: 'Mar', total: 24_540 },
      { month: 'Apr', total: 24_770 },
      { month: 'May', total: 24_810 },
    ],
  },
  // P&L expense line items (in addition to actuals aggregation)
  expenseLines: {
    staff:           1_245_800,
    contract:           87_250,
    technology:        154_320,
    travel:             33_870,
    otherGenAdmin:      65_940,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Date range helpers (self-contained for ELT)
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }
function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}` }

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getELTPresetRange(preset) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const fy = 10, fyYear = 2025

  if (preset === 'full-fiscal') {
    return { startDate: ymd(fyYear, fy, 1), endDate: ymd(fyYear + 1, 9, 30) }
  }
  if (preset === 'fiscal-ytd') {
    return { startDate: ymd(fyYear, fy, 1), endDate: todayStr }
  }
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

function presetLabel(preset) {
  const map = {
    'full-fiscal':  'Full fiscal year',
    'fiscal-ytd':   'Fiscal YTD',
    'last-month':   'Last month',
    'last-3':       'Last 3 months',
    'last-6':       'Last 6 months',
    'last-12':      'Last 12 months',
    'custom':       'Custom range',
  }
  return map[preset] || 'Reporting period'
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Date Range Picker
// ─────────────────────────────────────────────────────────────────────────────

function ELTDateRangePicker({ dateRange, onApplyPreset, onApplyCustom, onClose }) {
  const [localStart, setLocalStart] = useState(dateRange.startDate)
  const [localEnd,   setLocalEnd]   = useState(dateRange.endDate)

  const days = localStart && localEnd ? daysBetween(localStart, localEnd) : 0

  function handlePreset(p) { onApplyPreset(p); onClose() }

  function handleApply() {
    if (localStart && localEnd && localStart <= localEnd) {
      onApplyCustom(localStart, localEnd)
      onClose()
    }
  }

  const btn = (id, label, sub) => (
    <button
      key={id}
      onClick={() => handlePreset(id)}
      className={`text-left px-3 py-2 rounded-lg border transition-all ${
        dateRange.preset === id
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-[10px] uppercase tracking-wide mt-0.5 opacity-60">{sub}</div>}
    </button>
  )

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Reporting Period</div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Fiscal Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('full-fiscal', 'Full fiscal year', 'Oct 2025 → Sep 2026')}
        {btn('fiscal-ytd',  'Fiscal YTD', 'Oct 2025 → Today')}
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Rolling</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('last-month', 'Last month', '')}
        {btn('last-3',     'Last 3 months', '')}
        {btn('last-6',     'Last 6 months', '')}
        {btn('last-12',    'Last 12 months', '')}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">From</div>
          <input type="date" value={localStart} onChange={e => setLocalStart(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">To</div>
          <input type="date" value={localEnd} onChange={e => setLocalEnd(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{days > 0 ? `${days} days selected` : ''}</span>
        <button onClick={handleApply}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors">
          Apply
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Navigation Header
// ─────────────────────────────────────────────────────────────────────────────

const ELT_TABS = [
  { id: 'dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'summary',    label: 'Monthly Summary',  icon: FileText },
  { id: 'teams',      label: 'Teams',            icon: Users },
  { id: 'documents',  label: 'Documents',        icon: Upload },
  { id: 'import',     label: 'Import',           icon: Settings },
]

function ELTNav({ orgConfig, activeTab, setActiveTab, dateRange, onApplyPreset, onApplyCustom }) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const pickerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowDatePicker(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-6 gap-4">
        {/* Back + Breadcrumb */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => navigate('/briefing')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mr-1">
            <ChevronLeft size={13} />
            <span className="hidden sm:inline">Team</span>
          </button>
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: orgConfig.accentColor || '#0EA5A0' }}>
            {orgConfig.logoInitial}
          </div>
          <span className="text-sm font-semibold text-gray-800">{orgConfig.name}</span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm font-medium text-gray-500">Executive Overview</span>
        </div>

        {/* Tabs */}
        <nav className="flex-1 flex justify-center">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
            {ELT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Reporting period */}
        <div className="relative flex-shrink-0" ref={pickerRef}>
          <button
            onClick={() => setShowDatePicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors"
          >
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">
              REPORTING PERIOD
            </span>
            <span>{presetLabel(dateRange.preset)}</span>
            <ChevronDown size={12} className="text-gray-400" />
          </button>
          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 z-50">
              <ELTDateRangePicker
                dateRange={dateRange}
                onApplyPreset={onApplyPreset}
                onApplyCustom={onApplyCustom}
                onClose={() => setShowDatePicker(false)}
              />
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

function varColor(delta, inverse = false) {
  if (delta === 0) return 'text-gray-500'
  const pos = delta > 0
  if (inverse) return pos ? 'text-red-600' : 'text-emerald-600'
  return pos ? 'text-emerald-600' : 'text-red-600'
}

function varBg(delta, inverse = false) {
  if (delta === 0) return 'bg-gray-50 text-gray-500'
  const pos = delta > 0
  if (inverse) return pos ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
  return pos ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
}

function TrendBadge({ delta, inverse = false, label }) {
  const pct = label
  const color = varBg(delta, inverse)
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon size={11} />
      {pct}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card: standard 2-comparison layout
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ title, value, cmp1Label, cmp1Value, cmp1Delta, cmp1Pct, cmp2Label, cmp2Value, cmp2Delta, cmp2Pct, inverse = false, onRemove, editMode, children }) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11} />
        </button>
      )}

      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{title}</div>
      <div className="text-3xl font-bold text-gray-900 mb-4">{value}</div>

      <div className="space-y-2.5">
        {/* Comparison 1 */}
        {cmp1Label && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{cmp1Label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendBadge delta={cmp1Delta} inverse={inverse} label={cmp1Pct} />
              <span className={`text-sm font-semibold ${varColor(cmp1Delta, inverse)}`}>
                {cmp1Delta > 0 ? '+' : ''}{formatCurrency(cmp1Delta)}
              </span>
              <span className="text-xs text-gray-400">vs {formatCurrency(cmp1Value)}</span>
            </div>
          </div>
        )}

        {/* Comparison 2 */}
        {cmp2Label && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{cmp2Label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <TrendBadge delta={cmp2Delta} inverse={inverse} label={cmp2Pct} />
              <span className={`text-sm font-semibold ${varColor(cmp2Delta, inverse)}`}>
                {cmp2Delta > 0 ? '+' : ''}{formatCurrency(cmp2Delta)}
              </span>
              <span className="text-xs text-gray-400">vs {formatCurrency(cmp2Value)}</span>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Net Position Card (with hover breakdown)
// ─────────────────────────────────────────────────────────────────────────────

function NetPositionCard({ value, cmp1Delta, cmp1Pct, cmp1Value, cmp2Delta, cmp2Pct, cmp2Value, breakdown, editMode, onRemove }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const tooltipRef = useRef(null)

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11} />
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Net Position YTD</div>
        <div className="relative" ref={tooltipRef}
          onMouseEnter={() => setShowBreakdown(true)}
          onMouseLeave={() => setShowBreakdown(false)}>
          <Info size={12} className="text-gray-300 hover:text-gray-500 cursor-help transition-colors" />

          {showBreakdown && (
            <div className="absolute left-0 top-5 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Breakdown</div>
              {breakdown.lines.map((line, i) => (
                <div key={i} className={`flex justify-between py-1 ${line.isTotal ? 'border-t border-gray-200 mt-1 pt-2 font-semibold' : ''} ${line.isSubtract ? 'text-red-600' : 'text-gray-700'}`}>
                  <span className="text-xs">{line.label}</span>
                  <span className="text-xs font-medium tabular-nums">
                    {line.isSubtract ? '−' : ''}{formatCurrency(Math.abs(line.value))}
                  </span>
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
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">vs Forecast</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp1Delta} label={cmp1Pct} />
            <span className={`text-sm font-semibold ${varColor(cmp1Delta)}`}>
              {cmp1Delta > 0 ? '+' : ''}{formatCurrency(cmp1Delta)}
            </span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp1Value)}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">vs Prior Year</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TrendBadge delta={cmp2Delta} label={cmp2Pct} />
            <span className={`text-sm font-semibold ${varColor(cmp2Delta)}`}>
              {cmp2Delta > 0 ? '+' : ''}{formatCurrency(cmp2Delta)}
            </span>
            <span className="text-xs text-gray-400">vs {formatCurrency(cmp2Value)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add KPI Card panel
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTED_CARDS = [
  { id: 'top-expense', label: 'Top Expense Category', description: 'Largest spending category this period' },
  { id: 'mom-change',  label: 'Month-over-Month Change', description: 'Giving change vs prior month' },
  { id: 'budget-pct',  label: 'Budget Utilization', description: '% of annual budget consumed' },
  { id: 'avg-gift',    label: 'Avg Gift Size', description: 'Average patron contribution amount' },
  { id: 'retention',   label: 'Patron Retention Rate', description: 'Active patrons vs prior year' },
]

function AddKPIPanel({ existingIds, onAdd, onClose }) {
  const [mode, setMode] = useState('suggested') // 'suggested' | 'manual'
  const [manualLabel, setManualLabel] = useState('')
  const [manualValue, setManualValue] = useState('')

  const available = SUGGESTED_CARDS.filter(c => !existingIds.includes(c.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[420px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Add KPI Card</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 mx-5 mt-4 bg-gray-100 rounded-full p-1">
          {['suggested', 'manual'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1 rounded-full text-xs font-medium transition-all capitalize ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {m === 'suggested' ? 'Suggested from data' : 'Manual entry'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'suggested' ? (
            <div className="space-y-2">
              {available.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">All suggested cards are already added.</p>
              )}
              {available.map(card => (
                <button key={card.id} onClick={() => { onAdd(card); onClose() }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 group-hover:text-teal-700">{card.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{card.description}</div>
                    </div>
                    <Plus size={14} className="text-gray-300 group-hover:text-teal-500 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Card Label</label>
                <input type="text" value={manualLabel} onChange={e => setManualLabel(e.target.value)}
                  placeholder="e.g. Reserve Fund Balance"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Value</label>
                <input type="text" value={manualValue} onChange={e => setManualValue(e.target.value)}
                  placeholder="e.g. $1,250,000 or 94.5%"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500" />
              </div>
              <button
                onClick={() => {
                  if (!manualLabel.trim()) return
                  onAdd({ id: 'manual-' + Date.now(), label: manualLabel, value: manualValue, manual: true })
                  onClose()
                }}
                disabled={!manualLabel.trim()}
                className="w-full py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
            {data.map((row, i) => {
              const variance = row.actual - row.budget
              const totalIncome = data.find(r => r.id === 'total-income')?.actual || 1
              const pctOfIncome = row.actual / totalIncome * 100
              const isSection   = row.type === 'section'
              const isSubtotal  = row.type === 'subtotal'
              const isTotal     = row.type === 'total'
              const isSpacer    = row.type === 'spacer'
              const isExpense   = row.group === 'expense'

              if (isSpacer) return <tr key={i}><td colSpan={5} className="py-2" /></tr>

              return (
                <tr key={i} className={`
                  border-b border-gray-50 transition-colors
                  ${isSection ? 'bg-gray-50' : ''}
                  ${isTotal   ? 'bg-gray-900' : ''}
                  ${isSubtotal ? 'bg-gray-50' : ''}
                  ${!isSection && !isSubtotal && !isTotal ? 'hover:bg-gray-50' : ''}
                `}>
                  <td className={`px-6 py-2.5 ${isSection ? 'text-[10px] font-bold uppercase tracking-widest text-gray-400' : ''} ${isSubtotal ? 'font-semibold text-gray-700 pl-6' : ''} ${isTotal ? 'font-bold text-white' : ''} ${!isSection && !isSubtotal && !isTotal ? 'text-gray-700 pl-10' : ''}`}>
                    {row.label}
                  </td>
                  {isSection ? (
                    <td colSpan={4} />
                  ) : (
                    <>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${isTotal ? 'text-white' : isSubtotal ? 'text-gray-800' : 'text-gray-700'}`}>
                        {row.actual !== undefined ? formatCurrency(row.actual, { compact: false }) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${isTotal ? 'text-gray-300' : 'text-gray-500'}`}>
                        {row.budget !== undefined ? formatCurrency(row.budget, { compact: false }) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${isTotal ? (variance >= 0 ? 'text-emerald-400' : 'text-red-400') : (isExpense ? (variance < 0 ? 'text-emerald-600' : 'text-red-600') : (variance >= 0 ? 'text-emerald-600' : 'text-red-600'))}`}>
                        {row.actual !== undefined ? (variance >= 0 ? '+' : '') + formatCurrency(variance, { compact: false }) : '—'}
                      </td>
                      <td className={`px-6 py-2.5 text-right tabular-nums text-xs ${isTotal ? 'text-gray-300' : 'text-gray-400'}`}>
                        {row.actual !== undefined && !isSection ? formatPercent(pctOfIncome, { decimals: 1 }) : ''}
                      </td>
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
// Patron Metrics Section
// ─────────────────────────────────────────────────────────────────────────────

function PatronMetricCard({ label, value, sub1Label, sub1Value, sub1Delta, sub2Label, sub2Value, sub2Delta }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mb-3">{value}</div>
      <div className="space-y-1.5">
        {sub1Label && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{sub1Label}</span>
            <span className={`text-xs font-semibold ${varColor(sub1Delta)}`}>
              {sub1Delta > 0 ? '+' : ''}{sub1Value}
            </span>
          </div>
        )}
        {sub2Label && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{sub2Label}</span>
            <span className={`text-xs font-semibold ${varColor(sub2Delta)}`}>
              {sub2Delta > 0 ? '+' : ''}{sub2Value}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const CustomTooltipStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual KPI Card (for manually entered values)
// ─────────────────────────────────────────────────────────────────────────────

function ManualKPICard({ card, onRemove, editMode }) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11} />
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{card.label}</div>
      <div className="text-3xl font-bold text-gray-900">{card.value || '—'}</div>
      <div className="mt-3 text-xs text-gray-400 italic">Manually entered</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggested KPI Card (from data)
// ─────────────────────────────────────────────────────────────────────────────

function SuggestedKPICard({ cardId, expenseData, patronData, editMode, onRemove }) {
  let label = '', value = '', sub = null

  if (cardId === 'top-expense') {
    const lines = [
      { label: 'Staff', val: expenseData.staff },
      { label: 'Technology', val: expenseData.technology },
      { label: 'Contract', val: expenseData.contract },
      { label: 'Other G&A', val: expenseData.otherGenAdmin },
      { label: 'Travel', val: expenseData.travel },
    ]
    const top = lines.sort((a, b) => b.val - a.val)[0]
    label = 'Top Expense Category'
    value = top.label
    sub = formatCurrency(top.val)
  } else if (cardId === 'avg-gift') {
    label = 'Avg Gift Size'
    const delta = patronData.avgGift - patronData.avgGiftPriorYear
    value = `$${patronData.avgGift.toFixed(2)}`
    sub = `${delta > 0 ? '+' : ''}$${Math.abs(delta).toFixed(2)} vs prior year`
  } else if (cardId === 'budget-pct') {
    const totalExpense = Object.values(expenseData).reduce((a, b) => a + b, 0)
    const totalBudget  = 1_590_000
    const pct = (totalExpense / totalBudget) * 100
    label = 'Budget Utilization'
    value = `${pct.toFixed(1)}%`
    sub = `${formatCurrency(totalExpense)} of ${formatCurrency(totalBudget)}`
  } else if (cardId === 'retention') {
    const retained = ((patronData.total - patronData.newThisPeriod) / patronData.priorYear * 100)
    label = 'Patron Retention'
    value = `${retained.toFixed(1)}%`
    sub = `vs ${(patronData.total / patronData.priorYear * 100).toFixed(1)}% prior year`
  } else {
    label = cardId
    value = '—'
  }

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[220px]">
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11} />
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPI_CARDS = ['giving', 'expenses', 'net-position', 'cash']

function DashboardTab({ dateRange }) {
  const [editMode,    setEditMode]    = useState(false)
  const [kpiCards,    setKpiCards]    = useState(DEFAULT_KPI_CARDS)
  const [showAddPanel, setShowAddPanel] = useState(false)

  const d = ELT_MOCK

  // Derived totals
  const totalGiving   = d.giving.contributions + d.giving.merchandiseRevenue + d.giving.otherIncome
  const totalForecast = d.forecast.contributions + d.forecast.merchandiseRevenue + d.forecast.otherIncome
  const totalPriorGiving = d.priorYear.contributions + d.priorYear.merchandiseRevenue + d.priorYear.otherIncome

  const totalExpenses = Object.values(d.expenseLines).reduce((s, v) => s + v, 0)
  const totalBudgetExp = Object.values(d.budget).filter((_, i) => i >= 3).reduce((s, v) => s + v, 0)
  const totalPriorExp = d.priorYear.expenses

  const netPosition = totalGiving - totalExpenses
  const netForecast = totalForecast - totalBudgetExp
  const netPriorYear = totalPriorGiving - totalPriorExp

  // P&L data
  const plData = [
    { id: 'income-section', type: 'section', label: 'INCOME', group: 'income' },
    { id: 'contributions', type: 'line', label: 'Contributions', actual: d.giving.contributions, budget: d.budget.contributions, group: 'income' },
    { id: 'merch',    type: 'line', label: 'Merchandise Revenue', actual: d.giving.merchandiseRevenue, budget: d.budget.merchandiseRevenue, group: 'income' },
    { id: 'other-inc',type: 'line', label: 'Other Income', actual: d.giving.otherIncome, budget: d.budget.otherIncome, group: 'income' },
    { id: 'total-income', type: 'subtotal', label: 'Total Income', actual: totalGiving, budget: totalForecast, group: 'income' },
    { id: 'spacer1', type: 'spacer' },
    { id: 'expense-section', type: 'section', label: 'EXPENSES', group: 'expense' },
    { id: 'staff',    type: 'line', label: 'Staff', actual: d.expenseLines.staff, budget: d.budget.staff, group: 'expense' },
    { id: 'contract', type: 'line', label: 'Contract Services', actual: d.expenseLines.contract, budget: d.budget.contract, group: 'expense' },
    { id: 'technology',type:'line', label: 'Technology', actual: d.expenseLines.technology, budget: d.budget.technology, group: 'expense' },
    { id: 'travel',   type: 'line', label: 'Travel', actual: d.expenseLines.travel, budget: d.budget.travel, group: 'expense' },
    { id: 'other-exp',type: 'line', label: 'Other Gen & Admin', actual: d.expenseLines.otherGenAdmin, budget: d.budget.otherGenAdmin, group: 'expense' },
    { id: 'total-expenses', type: 'subtotal', label: 'Total Expenses', actual: totalExpenses, budget: totalBudgetExp, group: 'expense' },
    { id: 'spacer2', type: 'spacer' },
    { id: 'net-operating', type: 'total', label: 'Net Operating Income', actual: netPosition, budget: netForecast, group: 'net' },
  ]

  function removeCard(id) { setKpiCards(prev => prev.filter(c => c !== id)) }
  function addCard(card) { setKpiCards(prev => [...prev, card.id]) }

  function renderKPICard(cardId, idx) {
    if (cardId === 'giving') {
      const delta1 = totalGiving - totalForecast
      const delta2 = totalGiving - totalPriorGiving
      return (
        <KPICard key={cardId}
          title="Total Giving YTD" value={formatCurrency(totalGiving)}
          cmp1Label="vs Forecast" cmp1Value={totalForecast} cmp1Delta={delta1} cmp1Pct={formatPercent(delta1/totalForecast*100, { showSign: true })}
          cmp2Label="vs Prior Year" cmp2Value={totalPriorGiving} cmp2Delta={delta2} cmp2Pct={formatPercent(delta2/totalPriorGiving*100, { showSign: true })}
          editMode={editMode} onRemove={() => removeCard(cardId)} />
      )
    }
    if (cardId === 'expenses') {
      const delta1 = totalExpenses - totalBudgetExp
      const delta2 = totalExpenses - totalPriorExp
      return (
        <KPICard key={cardId}
          title="Expenses YTD" value={formatCurrency(totalExpenses)}
          cmp1Label="vs Budget" cmp1Value={totalBudgetExp} cmp1Delta={delta1} cmp1Pct={formatPercent(delta1/totalBudgetExp*100, { showSign: true })}
          cmp2Label="vs Prior Year" cmp2Value={totalPriorExp} cmp2Delta={delta2} cmp2Pct={formatPercent(delta2/totalPriorExp*100, { showSign: true })}
          inverse
          editMode={editMode} onRemove={() => removeCard(cardId)} />
      )
    }
    if (cardId === 'net-position') {
      const delta1 = netPosition - netForecast
      const delta2 = netPosition - netPriorYear
      return (
        <NetPositionCard key={cardId}
          value={netPosition}
          cmp1Delta={delta1} cmp1Pct={formatPercent(delta1/Math.abs(netForecast)*100, { showSign: true })} cmp1Value={netForecast}
          cmp2Delta={delta2} cmp2Pct={formatPercent(delta2/Math.abs(netPriorYear)*100, { showSign: true })} cmp2Value={netPriorYear}
          breakdown={{
            lines: [
              { label: 'Contributions',       value: d.giving.contributions },
              { label: 'Merchandise Revenue',  value: d.giving.merchandiseRevenue },
              { label: 'Other Income',         value: d.giving.otherIncome },
              { label: 'Total Income',         value: totalGiving, isTotal: true },
              { label: 'Total Expenses',       value: totalExpenses, isSubtract: true, isTotal: true },
            ]
          }}
          editMode={editMode} onRemove={() => removeCard(cardId)} />
      )
    }
    if (cardId === 'cash') {
      const delta1 = d.cash.current - d.cash.priorMonth
      const delta2 = d.cash.current - d.cash.priorYear
      return (
        <KPICard key={cardId}
          title="Cash Position" value={formatCurrency(d.cash.current)}
          cmp1Label="vs Prior Month" cmp1Value={d.cash.priorMonth} cmp1Delta={delta1} cmp1Pct={formatPercent(delta1/d.cash.priorMonth*100, { showSign: true })}
          cmp2Label="vs Prior Year" cmp2Value={d.cash.priorYear} cmp2Delta={delta2} cmp2Pct={formatPercent(delta2/d.cash.priorYear*100, { showSign: true })}
          editMode={editMode} onRemove={() => removeCard(cardId)} />
      )
    }
    // Suggested cards
    if (SUGGESTED_CARDS.find(s => s.id === cardId)) {
      return (
        <SuggestedKPICard key={cardId} cardId={cardId}
          expenseData={d.expenseLines} patronData={d.patrons}
          editMode={editMode} onRemove={() => removeCard(cardId)} />
      )
    }
    // Manual cards
    return (
      <ManualKPICard key={cardId} card={{ id: cardId, label: cardId, value: '—' }}
        editMode={editMode} onRemove={() => removeCard(cardId)} />
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-screen-xl mx-auto">

      {/* KPI Cards Row */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Key Performance Indicators</h2>
          <button
            onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              editMode
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            {editMode ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Edit cards</>}
          </button>
        </div>

        <div className="flex gap-4 flex-wrap">
          {kpiCards.map((id, i) => renderKPICard(id, i))}

          {/* Add card button in edit mode */}
          {editMode && (
            <button onClick={() => setShowAddPanel(true)}
              className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all p-5 min-w-[160px] text-gray-400 hover:text-teal-600">
              <Plus size={20} />
              <span className="text-xs font-medium">Add card</span>
            </button>
          )}
        </div>
      </section>

      {/* Patron Composition */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Patron Composition</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <PatronMetricCard
            label="Total Patrons"
            value={ELT_MOCK.patrons.total.toLocaleString()}
            sub1Label="vs Prior Month"
            sub1Value={`+${(ELT_MOCK.patrons.total - ELT_MOCK.patrons.priorMonth).toLocaleString()}`}
            sub1Delta={ELT_MOCK.patrons.total - ELT_MOCK.patrons.priorMonth}
            sub2Label="vs Prior Year"
            sub2Value={`+${(ELT_MOCK.patrons.total - ELT_MOCK.patrons.priorYear).toLocaleString()}`}
            sub2Delta={ELT_MOCK.patrons.total - ELT_MOCK.patrons.priorYear}
          />
          <PatronMetricCard
            label="New Patrons (Period)"
            value={ELT_MOCK.patrons.newThisPeriod.toLocaleString()}
            sub1Label="vs Prior Period"
            sub1Value={`${ELT_MOCK.patrons.newThisPeriod > ELT_MOCK.patrons.newPriorPeriod ? '+' : ''}${(ELT_MOCK.patrons.newThisPeriod - ELT_MOCK.patrons.newPriorPeriod).toLocaleString()}`}
            sub1Delta={ELT_MOCK.patrons.newThisPeriod - ELT_MOCK.patrons.newPriorPeriod}
            sub2Label="Growth rate"
            sub2Value={`${formatPercent((ELT_MOCK.patrons.newThisPeriod / ELT_MOCK.patrons.newPriorPeriod - 1) * 100, { showSign: true })}`}
            sub2Delta={ELT_MOCK.patrons.newThisPeriod - ELT_MOCK.patrons.newPriorPeriod}
          />
          <PatronMetricCard
            label="Avg Gift Size"
            value={`$${ELT_MOCK.patrons.avgGift.toFixed(2)}`}
            sub1Label="vs Prior Year"
            sub1Value={`${ELT_MOCK.patrons.avgGift > ELT_MOCK.patrons.avgGiftPriorYear ? '+' : ''}$${Math.abs(ELT_MOCK.patrons.avgGift - ELT_MOCK.patrons.avgGiftPriorYear).toFixed(2)}`}
            sub1Delta={ELT_MOCK.patrons.avgGift - ELT_MOCK.patrons.avgGiftPriorYear}
            sub2Label="Prior year avg"
            sub2Value={`$${ELT_MOCK.patrons.avgGiftPriorYear.toFixed(2)}`}
            sub2Delta={0}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* New Patrons by Month — Year over Year */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-xs font-semibold text-gray-700 mb-0.5">New Patrons by Month</div>
            <div className="text-[10px] text-gray-400 mb-4">Year-over-year comparison</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ELT_MOCK.patrons.monthly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CustomTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="newCY" name="This Year" stroke="#0EA5A0" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="newPY" name="Prior Year" stroke="#d1d5db" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly Patron Base */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-xs font-semibold text-gray-700 mb-0.5">Monthly Patron Base</div>
            <div className="text-[10px] text-gray-400 mb-4">Total active patrons per month</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ELT_MOCK.patrons.base} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  domain={[20000, 'auto']}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip contentStyle={CustomTooltipStyle} formatter={v => v.toLocaleString()} />
                <Bar dataKey="total" name="Total Patrons" fill="#0EA5A0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* P&L Table */}
      <section>
        <PLTable data={plData} />
      </section>

      {/* Add KPI Panel */}
      {showAddPanel && (
        <AddKPIPanel
          existingIds={kpiCards}
          onAdd={addCard}
          onClose={() => setShowAddPanel(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Summary Tab (stub)
// ─────────────────────────────────────────────────────────────────────────────

function MonthlySummaryTab() {
  const months = ['Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026']
  const [selectedMonth, setSelectedMonth] = useState('May 2026')
  const [takeaways,  setTakeaways]  = useState('')
  const [watchAreas, setWatchAreas] = useState('')
  const [notes,      setNotes]      = useState('')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-900">Monthly Narrative</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
          {months.map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                selectedMonth === m ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {[
          { id: 'takeaways',  label: 'Key Takeaways',       placeholder: 'Summarize the most important financial highlights for this month...', val: takeaways,  set: setTakeaways },
          { id: 'watch',      label: 'Watch Areas',          placeholder: 'List areas of concern or items to monitor closely...', val: watchAreas, set: setWatchAreas },
          { id: 'notes',      label: 'Additional Notes',     placeholder: 'Any other notes, context, or observations...', val: notes, set: setNotes },
        ].map(f => (
          <div key={f.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{f.label}</div>
            <textarea
              value={f.val} onChange={e => f.set(e.target.value)}
              rows={5} placeholder={f.placeholder}
              className="w-full text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none" />
          </div>
        ))}

        <div className="flex justify-end">
          <button className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors">
            Save narrative for {selectedMonth}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Tab (stub)
// ─────────────────────────────────────────────────────────────────────────────

function TeamsTab() {
  const teams = [
    { name: 'Product Design',      dept: '101', actual: 482_310,  budget: 510_000 },
    { name: 'Product Engineering', dept: '102', actual: 623_880,  budget: 595_000 },
    { name: 'Operations',          dept: '103', actual: 481_000,  budget: 485_000 },
  ]
  const totalActual = teams.reduce((s, t) => s + t.actual, 0)

  return (
    <div className="p-6 max-w-screen-lg mx-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Team Spend Overview</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Team</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Actual</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Budget</th>
              <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Variance</th>
              <th className="text-right px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">% of Org</th>
            </tr>
          </thead>
          <tbody>
            {teams.map(t => {
              const variance = t.actual - t.budget
              const pctOrg   = (t.actual / totalActual) * 100
              return (
                <tr key={t.dept} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer group">
                  <td className="px-6 py-3 font-medium text-gray-800 group-hover:text-teal-700">
                    <div className="flex items-center gap-2">
                      {t.name}
                      <ChevronRight size={12} className="text-gray-300 group-hover:text-teal-400" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-700">{formatCurrency(t.actual, { compact: false })}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{formatCurrency(t.budget, { compact: false })}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${variance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {variance > 0 ? '+' : ''}{formatCurrency(variance, { compact: false })}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-gray-400 text-xs">
                    {formatPercent(pctOrg, { decimals: 1 })}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="bg-gray-900">
              <td className="px-6 py-3 font-bold text-white">Total</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-white">
                {formatCurrency(totalActual, { compact: false })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                {formatCurrency(teams.reduce((s, t) => s + t.budget, 0), { compact: false })}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums font-bold ${
                totalActual - teams.reduce((s,t) => s+t.budget,0) <= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {(() => { const v = totalActual - teams.reduce((s,t)=>s+t.budget,0); return (v>0?'+':'')+formatCurrency(v,{compact:false}) })()}
              </td>
              <td className="px-6 py-3 text-right tabular-nums text-gray-400 text-xs">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">Click a team row to drill into their detailed dashboard.</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents Tab (stub)
// ─────────────────────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [docs] = useState([
    { id: 1, name: 'Statement of Activity – April 2026.pdf', month: 'Apr 2026', type: 'Statement of Activity', size: '245 KB' },
    { id: 2, name: 'Balance Sheet – Q2 FY2026.pdf',          month: 'Mar 2026', type: 'Balance Sheet',          size: '189 KB' },
    { id: 3, name: 'Cash Flow Statement – YTD.xlsx',         month: 'May 2026', type: 'Cash Flow',             size: '312 KB' },
  ])

  return (
    <div className="p-6 max-w-screen-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Financial Documents</h2>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors">
          <Upload size={12} /> Upload document
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {docs.map((doc, i) => (
          <div key={doc.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${i > 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <FileText size={14} className="text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{doc.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{doc.type} · {doc.month} · {doc.size}</div>
            </div>
            <div className="flex-shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">{doc.month}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-teal-400 hover:bg-teal-50 transition-all cursor-pointer">
        <Upload size={24} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Drop files here or click to upload</p>
        <p className="text-xs text-gray-300 mt-1">PDF, Excel, PNG, JPG — tied to a specific month</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ELT Import Tab (stub)
// ─────────────────────────────────────────────────────────────────────────────

function ELTImportTab() {
  const [activeImport, setActiveImport] = useState('giving')
  const importTypes = [
    { id: 'giving',  label: 'Giving & Revenue' },
    { id: 'patrons', label: 'Patron Data' },
    { id: 'cash',    label: 'Cash Flow' },
    { id: 'pnl',     label: 'P&L Data' },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">ELT Data Import</h2>

      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 mb-6 w-fit">
        {importTypes.map(t => (
          <button key={t.id} onClick={() => setActiveImport(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              activeImport === t.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <Upload size={32} className="text-gray-200 mx-auto mb-3" />
        <div className="text-sm font-medium text-gray-600 mb-1">
          Import {importTypes.find(t => t.id === activeImport)?.label}
        </div>
        <div className="text-xs text-gray-400 mb-5">
          Upload a CSV or Excel file with {activeImport === 'giving' ? 'giving/revenue' : activeImport === 'patrons' ? 'patron' : activeImport === 'cash' ? 'cash flow' : 'P&L'} data
        </div>
        <button className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors">
          Choose file
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ELT Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ELTDashboard() {
  const { orgConfig } = useApp()
  const [activeTab, setActiveTab] = useState('dashboard')

  const defaultRange = getELTPresetRange('fiscal-ytd')
  const [dateRange, setDateRange] = useState({ preset: 'fiscal-ytd', ...defaultRange })

  function applyPreset(preset) {
    const range = getELTPresetRange(preset)
    setDateRange({ preset, ...range })
  }
  function applyCustom(startDate, endDate) {
    setDateRange({ preset: 'custom', startDate, endDate })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <ELTNav
        orgConfig={orgConfig}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dateRange={dateRange}
        onApplyPreset={applyPreset}
        onApplyCustom={applyCustom}
      />
      <main className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <DashboardTab dateRange={dateRange} />}
        {activeTab === 'summary'   && <MonthlySummaryTab />}
        {activeTab === 'teams'     && <TeamsTab />}
        {activeTab === 'documents' && <DocumentsTab />}
        {activeTab === 'import'    && <ELTImportTab />}
      </main>
    </div>
  )
}
