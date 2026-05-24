import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  Plus, X, Edit2, Trash2, Upload, FileText, RefreshCw,
  Save, BarChart2, LineChart as LineIcon, Activity,
  Filter, Search, Check, Settings, Eye, EyeOff,
  Building2, ArrowUpDown, Calendar, Download, Clock, CheckCircle,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import CommentsPage from './CommentsPage'
import { formatCurrency, formatPercent } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEPT_NAMES = { '101': 'Product Design', '102': 'Product Engineering', '103': 'Operations' }
const ALL_DEPTS  = ['101','102','103']

// Monthly income mock (Oct 2025 → May 2026, 8 months matching actuals window)
const INCOME_MONTHS = [
  { date:'2025-10-01', label:'Oct', contributions:220_000, merch:16_100, other:3_600 },
  { date:'2025-11-01', label:'Nov', contributions:265_000, merch:19_500, other:4_200 },
  { date:'2025-12-01', label:'Dec', contributions:310_000, merch:23_000, other:4_800 },
  { date:'2026-01-01', label:'Jan', contributions:185_000, merch:13_500, other:2_800 },
  { date:'2026-02-01', label:'Feb', contributions:198_000, merch:14_200, other:3_100 },
  { date:'2026-03-01', label:'Mar', contributions:215_000, merch:16_000, other:3_500 },
  { date:'2026-04-01', label:'Apr', contributions:245_000, merch:18_500, other:4_100 },
  { date:'2026-05-01', label:'May', contributions:270_000, merch:20_000, other:4_600 },
]
const INCOME_BUDGET_MONTHLY = {
  contributions: [230_000, 280_000, 295_000, 195_000, 205_000, 220_000, 250_000, 275_000],
  merch:         [ 16_500,  20_000,  22_000,  14_000,  14_500,  16_000,  18_000,  19_500],
  other:         [  3_500,   4_000,   4_500,   2_800,   3_000,   3_400,   4_000,   4_500],
}

const ACCENT   = 'var(--color-accent)'
const CAT_COLORS = {
  Software: '#0EA5A0', Computers: '#C05A2F', Travel: '#E8A838',
  Contract: '#4A2E5A', Office: '#9BA8B5',  Other: '#89929E',
}
const DEPT_COLORS = { '101': '#0EA5A0', '102': '#C05A2F', '103': '#E8A838' }

const MASTER_IMPORT_TABS = [
  { id:'actuals',   label:'Actuals' },
  { id:'budget',    label:'Budget' },
  { id:'financial', label:'Financial Data' },
  { id:'patron',    label:'Patron Data' },
  { id:'cashflow',  label:'Cash Flow' },
  { id:'summary',   label:'Monthly Summary' },
  { id:'history',   label:'Import History' },
]

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date utilities (self-contained — same approach as ELTDashboard)
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2,'0') }
function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}` }
function monthKey(dateStr) { return dateStr.slice(0,7) } // "2025-10"

function getMasterPresetRange(preset) {
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth()+1, today.getDate())
  if (preset === 'full-fiscal')   return { startDate:'2025-10-01', endDate:'2026-09-30' }
  if (preset === 'fiscal-ytd')    return { startDate:'2025-10-01', endDate: todayStr }
  if (preset === 'full-operating') return { startDate:'2025-05-01', endDate:'2026-04-30' }
  if (preset === 'operating-ytd') return { startDate:'2025-05-01', endDate: todayStr }
  if (preset === 'last-month') {
    const d = new Date(today.getFullYear(), today.getMonth()-1, 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
    return { startDate: ymd(d.getFullYear(), d.getMonth()+1, 1), endDate: ymd(today.getFullYear(), today.getMonth(), lastDay) }
  }
  if (preset === 'last-3')  { const d=new Date(today); d.setMonth(d.getMonth()-3);  return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if (preset === 'last-6')  { const d=new Date(today); d.setMonth(d.getMonth()-6);  return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if (preset === 'last-12') { const d=new Date(today); d.setFullYear(d.getFullYear()-1); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  return { startDate:'2025-10-01', endDate: todayStr }
}

function presetLabel(preset) {
  return { 'full-fiscal':'Full fiscal year','fiscal-ytd':'Fiscal YTD','full-operating':'Full operating year','operating-ytd':'Operating YTD','last-month':'Last month','last-3':'Last 3 months','last-6':'Last 6 months','last-12':'Last 12 months','custom':'Custom range' }[preset] || 'Date range'
}

// ─────────────────────────────────────────────────────────────────────────────
// Data aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

function filterActuals(actuals, startDate, endDate, dept=null) {
  return actuals.filter(t => {
    if (t.date < startDate || t.date > endDate) return false
    if (dept && t.department !== dept) return false
    return true
  })
}

function sumByCategory(transactions) {
  const out = {}
  for (const t of transactions) {
    out[t.category] = (out[t.category] || 0) + t.amount
  }
  return out
}

function sumByDept(transactions) {
  const out = {}
  for (const t of transactions) {
    out[t.department] = (out[t.department] || 0) + t.amount
  }
  return out
}

function groupByMonth(transactions) {
  const out = {}
  for (const t of transactions) {
    const k = monthKey(t.date)
    out[k] = (out[k] || 0) + t.amount
  }
  return out
}

function getIncomeInRange(startDate, endDate) {
  return INCOME_MONTHS.filter(m => m.date >= startDate && m.date <= endDate)
}

function getBudgetForMonths(budgetFlat, scenario, startDate, endDate, dept=null) {
  const months = INCOME_MONTHS.filter(m => m.date >= startDate && m.date <= endDate)
  const n = months.length
  const out = {}
  for (const b of budgetFlat) {
    if (b.scenario !== scenario) continue
    if (dept && b.department !== dept) continue
    out[b.category] = (out[b.category] || 0) + b.monthlyAmount * n
  }
  return out
}

function numMonthsInRange(startDate, endDate) {
  return INCOME_MONTHS.filter(m => m.date >= startDate && m.date <= endDate).length
}

// Variance helpers
function varColor(delta) { return delta <= 0 ? '#10B981' : '#EF4444' }  // expenses: under=good
function varBg(delta)    { return delta <= 0 ? '#ECFDF5' : '#FEF2F2' }
function incVarColor(delta) { return delta >= 0 ? '#10B981' : '#EF4444' } // income: over=good
function incVarBg(delta)    { return delta >= 0 ? '#ECFDF5' : '#FEF2F2' }

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker (self-contained for master dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function MasterDatePicker({ dateRange, onApplyPreset, onApplyCustom, onClose }) {
  const [localStart, setLocalStart] = useState(dateRange.startDate)
  const [localEnd,   setLocalEnd]   = useState(dateRange.endDate)

  const btn = (id, label, sub) => (
    <button key={id} onClick={() => { onApplyPreset(id); onClose() }}
      className={`text-left px-3 py-2 rounded-lg border transition-all text-xs ${
        dateRange.preset === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'
      }`}>
      <div className="font-medium">{label}</div>
      {sub && <div className="opacity-60 mt-0.5 text-[10px] uppercase tracking-wide">{sub}</div>}
    </button>
  )

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Date Range</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Fiscal Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('full-fiscal','Full fiscal year','Oct 2025 → Sep 2026')}
        {btn('fiscal-ytd','Fiscal YTD','Oct 2025 → Today')}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Operating Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('full-operating','Full operating year','May 2025 → Apr 2026')}
        {btn('operating-ytd','Operating YTD','May 2025 → Today')}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Rolling</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {btn('last-month','Last month','')}
        {btn('last-3','Last 3 months','')}
        {btn('last-6','Last 6 months','')}
        {btn('last-12','Last 12 months','')}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">From</div>
          <input type="date" value={localStart} onChange={e => setLocalStart(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500"/>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">To</div>
          <input type="date" value={localEnd} onChange={e => setLocalEnd(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500"/>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={() => { if(localStart&&localEnd&&localStart<=localEnd) { onApplyCustom(localStart,localEnd); onClose() }}}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: ACCENT }}>Apply</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterNav
// ─────────────────────────────────────────────────────────────────────────────

const MASTER_TABS = [
  { id:'overview',      label:'Overview' },
  { id:'pl',            label:'P&L Breakdown' },
  { id:'transactions',  label:'Transactions' },
  { id:'teams',         label:'Teams' },
  { id:'comments',      label:'Comments & Requests' },
  { id:'import',        label:'Import' },
]

function MasterNav({ orgConfig, activeTab, setActiveTab, dateRange, onApplyPreset, onApplyCustom,
                     activeBudget, onSetBudget, availableScenarios, teamFilter, setTeamFilter }) {
  const [showDatePicker,   setShowDatePicker]   = useState(false)
  const [showBudgetPicker, setShowBudgetPicker] = useState(false)
  const [showTeamPicker,   setShowTeamPicker]   = useState(false)
  const dateRef   = useRef(null)
  const budgetRef = useRef(null)
  const teamRef   = useRef(null)
  useEffect(() => {
    function h(e) { if(dateRef.current   && !dateRef.current.contains(e.target))   setShowDatePicker(false)   }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  },[])
  useEffect(() => {
    function h(e) { if(budgetRef.current && !budgetRef.current.contains(e.target)) setShowBudgetPicker(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  },[])
  useEffect(() => {
    function h(e) { if(teamRef.current   && !teamRef.current.contains(e.target))   setShowTeamPicker(false)   }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  },[])

  const teamLabel = teamFilter === 'all' ? 'All Teams' : DEPT_NAMES[teamFilter] || teamFilter

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-4 gap-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
               style={{ backgroundColor: orgConfig.accentColor || ACCENT }}>
            {orgConfig.logoInitial}
          </div>
          <span className="text-sm font-semibold text-gray-800 truncate">{orgConfig.name}</span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm text-gray-500">Finance</span>
        </div>

        {/* Tabs */}
        <nav className="flex-1 flex justify-center overflow-x-auto">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
            {MASTER_TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Team filter */}
          <div className="relative" ref={teamRef}>
            <button onClick={() => setShowTeamPicker(v=>!v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">TEAM</span>
              <span className="max-w-[100px] truncate">{teamLabel}</span>
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showTeamPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-52">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Filter by Team</div>
                <div className="space-y-1">
                  {['all',...ALL_DEPTS].map(d => (
                    <button key={d} onClick={() => { setTeamFilter(d); setShowTeamPicker(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                        teamFilter===d ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-800 border-gray-200 bg-white hover:border-gray-400'
                      }`}>
                      {d==='all' ? 'All Teams' : DEPT_NAMES[d]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Budget scenario */}
          <div className="relative" ref={budgetRef}>
            <button onClick={() => setShowBudgetPicker(v=>!v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">BUDGET</span>
              <span className="max-w-[100px] truncate">{activeBudget}</span>
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showBudgetPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-60">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Budget Scenario</div>
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">Select which budget to compare actuals against.</p>
                <div className="space-y-1">
                  {availableScenarios.map(s => (
                    <button key={s} onClick={() => { onSetBudget(s); setShowBudgetPicker(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                        activeBudget===s ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-800 border-gray-200 bg-white hover:border-gray-400'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date range */}
          <div className="relative" ref={dateRef}>
            <button onClick={() => setShowDatePicker(v=>!v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">DATES</span>
              <span>{presetLabel(dateRange.preset)}</span>
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <MasterDatePicker dateRange={dateRange} onApplyPreset={onApplyPreset}
                  onApplyCustom={onApplyCustom} onClose={() => setShowDatePicker(false)}/>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ title, value, sub, sub2, delta, deltaLabel, inverse=false, accent, onHide, editMode }) {
  const good = inverse ? delta < 0 : delta > 0
  const dColor = delta === null || delta === undefined ? '#9BA8B5' : good ? '#10B981' : '#EF4444'
  const dBg    = delta === null || delta === undefined ? '#F3F4F6' : good ? '#ECFDF5' : '#FEF2F2'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 relative group">
      {editMode && onHide && (
        <button onClick={onHide}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center">
          <X size={10} className="text-gray-400 hover:text-red-500"/>
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{title}</div>
      <div className="text-2xl font-bold text-gray-900 mb-1" style={accent ? {color:ACCENT}:{}}>
        {value}
      </div>
      {(sub || sub2) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {sub  && <span className="text-[11px] text-gray-500">{sub}</span>}
          {sub2 && <span className="text-[11px] text-gray-400">· {sub2}</span>}
        </div>
      )}
      {delta !== null && delta !== undefined && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
             style={{ backgroundColor: dBg, color: dColor }}>
          {good ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
          {deltaLabel}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Panel wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartPanel({ title, subtitle, onRemove, editMode, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 relative group">
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center">
          <X size={10} className="text-gray-400 hover:text-red-500"/>
        </button>
      )}
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-800">{title}</div>
        {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Builder
// ─────────────────────────────────────────────────────────────────────────────

const CHART_PRESETS = [
  { id:'monthly-income',  title:'Monthly Income Trend',  type:'area', xKey:'label', yKeys:['contributions','merch','other'], source:'income', colors:['#0EA5A0','#C05A2F','#E8A838'], stacked:false },
  { id:'monthly-expense', title:'Monthly Expenses',      type:'bar',  xKey:'label', yKeys:['total'],  source:'expenses', colors:['#C05A2F'], stacked:false },
  { id:'dept-breakdown',  title:'Spending by Team',      type:'bar',  xKey:'dept',  yKeys:['amount'], source:'dept',     colors:['#0EA5A0'], stacked:false },
  { id:'budget-vs-actual',title:'Budget vs Actual',      type:'bar',  xKey:'label', yKeys:['actual','budget'], source:'bva', colors:['#0EA5A0','#9BA8B5'], stacked:false },
  { id:'cat-breakdown',   title:'Spend by Category',     type:'bar',  xKey:'category', yKeys:['amount'], source:'category', colors:['#E8A838'], stacked:false },
  { id:'net-position',    title:'Net Position Trend',    type:'line', xKey:'label', yKeys:['net'], source:'net', colors:['#10B981'], stacked:false },
]

function buildChartData(preset, actuals, dateRange, budgetFlat, scenario) {
  const { startDate, endDate } = dateRange
  const inRange = filterActuals(actuals, startDate, endDate)
  const incMonths = getIncomeInRange(startDate, endDate)

  if (preset.source === 'income') {
    return incMonths.map(m => ({
      label: m.label,
      contributions: m.contributions / 1000,
      merch: m.merch / 1000,
      other: m.other / 1000,
    }))
  }
  if (preset.source === 'expenses') {
    const byMonth = groupByMonth(inRange)
    return incMonths.map(m => {
      const k = monthKey(m.date)
      return { label: m.label, total: Math.round((byMonth[k]||0)/1000) }
    })
  }
  if (preset.source === 'dept') {
    const byDept = sumByDept(inRange)
    return ALL_DEPTS.map(d => ({ dept: DEPT_NAMES[d].split(' ').pop(), amount: Math.round((byDept[d]||0)/1000) }))
  }
  if (preset.source === 'bva') {
    const byMonth = groupByMonth(inRange)
    const n = numMonthsInRange(startDate, endDate)
    const budgetRows = budgetFlat.filter(b => b.scenario === scenario)
    return incMonths.map((m, i) => {
      const k = monthKey(m.date)
      const budgetTotal = budgetRows.reduce((s,b) => s + b.monthlyAmount, 0)
      return { label: m.label, actual: Math.round((byMonth[k]||0)/1000), budget: Math.round(budgetTotal/1000) }
    })
  }
  if (preset.source === 'category') {
    const byCat = sumByCategory(inRange)
    return Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => ({
      category: cat, amount: Math.round(amt/1000)
    }))
  }
  if (preset.source === 'net') {
    const byMonth = groupByMonth(inRange)
    return incMonths.map(m => {
      const k = monthKey(m.date)
      const income = m.contributions + m.merch + m.other
      const expenses = byMonth[k] || 0
      return { label: m.label, net: Math.round((income - expenses)/1000) }
    })
  }
  return []
}

function PresetChart({ preset, data }) {
  const { type, xKey, yKeys, colors, stacked } = preset
  const fmt = v => `$${v}K`

  if (type === 'area') return (
    <AreaChart data={data} margin={{top:4,right:4,left:0,bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
      <XAxis dataKey={xKey} tick={{fontSize:10}} axisLine={false} tickLine={false}/>
      <YAxis tick={{fontSize:10}} tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}M`:`$${v}K`} axisLine={false} tickLine={false} width={50}/>
      <Tooltip formatter={(v)=>[fmt(v)]}/>
      {yKeys.map((k,i) => (
        <Area key={k} type="monotone" dataKey={k} fill={colors[i]+'33'} stroke={colors[i]} strokeWidth={2} stackId={stacked?'a':undefined}/>
      ))}
    </AreaChart>
  )
  if (type === 'line') return (
    <LineChart data={data} margin={{top:4,right:4,left:0,bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
      <XAxis dataKey={xKey} tick={{fontSize:10}} axisLine={false} tickLine={false}/>
      <YAxis tick={{fontSize:10}} tickFormatter={v=>`$${v}K`} axisLine={false} tickLine={false} width={50}/>
      <Tooltip formatter={(v)=>[fmt(v)]}/>
      {yKeys.map((k,i) => (
        <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2} dot={false}/>
      ))}
    </LineChart>
  )
  // bar (default)
  return (
    <BarChart data={data} margin={{top:4,right:4,left:0,bottom:0}}>
      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
      <XAxis dataKey={xKey} tick={{fontSize:10}} axisLine={false} tickLine={false}/>
      <YAxis tick={{fontSize:10}} tickFormatter={v=>`$${v}K`} axisLine={false} tickLine={false} width={50}/>
      <Tooltip formatter={(v)=>[fmt(v)]}/>
      {yKeys.map((k,i) => (
        <Bar key={k} dataKey={k} fill={colors[i]} radius={[3,3,0,0]} barSize={stacked?undefined:20}
             stackId={stacked?'a':undefined}/>
      ))}
    </BarChart>
  )
}

function ChartBuilderModal({ onSave, onClose, actuals, dateRange, budgetFlat, scenario }) {
  const [mode, setMode] = useState('presets') // 'presets' | 'custom'
  // Custom builder state
  const [title,     setTitle]     = useState('')
  const [chartType, setChartType] = useState('bar')
  const [source,    setSource]    = useState('expenses')
  const [saved,     setSaved]     = useState(false)

  const previewPreset = mode==='presets' ? null : {
    id: 'custom-' + Date.now(),
    title: title || 'Custom Chart',
    type: chartType,
    xKey: source==='dept' ? 'dept' : source==='category' ? 'category' : 'label',
    yKeys: source==='bva' ? ['actual','budget'] : source==='income' ? ['contributions','merch','other'] : ['total'],
    source,
    colors: ['#0EA5A0','#C05A2F','#E8A838'],
    stacked: false,
  }
  const customData = previewPreset ? buildChartData(previewPreset, actuals, dateRange, budgetFlat, scenario) : []

  function handleSaveCustom() {
    if (!previewPreset) return
    onSave(previewPreset)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1000)
  }

  function handleSavePreset(preset) {
    onSave(preset)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{backgroundColor:'rgba(0,0,0,0.4)'}}>
      <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="text-base font-bold text-gray-900">Chart Builder</div>
            <div className="text-xs text-gray-400 mt-0.5">Add charts to your Overview dashboard</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setMode('presets')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode==='presets'?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>
                Preset Gallery
              </button>
              <button onClick={() => setMode('custom')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode==='custom'?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>
                Custom Builder
              </button>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
              <X size={14} className="text-gray-500"/>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {mode === 'presets' ? (
            <div>
              <p className="text-xs text-gray-500 mb-4">Click a preset to add it to your overview dashboard.</p>
              <div className="grid grid-cols-3 gap-4">
                {CHART_PRESETS.map(preset => {
                  const data = buildChartData(preset, actuals, dateRange, budgetFlat, scenario)
                  return (
                    <div key={preset.id}
                      className="border border-gray-200 rounded-xl p-3 hover:border-teal-400 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => handleSavePreset(preset)}>
                      <div className="text-xs font-semibold text-gray-800 mb-2 group-hover:text-teal-600">{preset.title}</div>
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <PresetChart preset={preset} data={data}/>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{preset.type}</span>
                        <span className="text-[10px] text-teal-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">+ Add</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Left: config */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Chart Title</label>
                  <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Monthly Revenue"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Chart Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{id:'bar',label:'Bar',Icon:BarChart2},{id:'line',label:'Line',Icon:LineIcon},{id:'area',label:'Area',Icon:Activity}].map(({id,label,Icon})=>(
                      <button key={id} onClick={()=>setChartType(id)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-xs font-medium ${
                          chartType===id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                        }`}>
                        <Icon size={18}/>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Data Source</label>
                  <div className="space-y-1.5">
                    {[
                      {id:'income',    label:'Income (Contributions, Merch, Other)'},
                      {id:'expenses',  label:'Expenses by Month'},
                      {id:'bva',       label:'Budget vs Actual by Month'},
                      {id:'dept',      label:'Spending by Department'},
                      {id:'category',  label:'Spending by Category'},
                      {id:'net',       label:'Net Position by Month'},
                    ].map(({id,label})=>(
                      <button key={id} onClick={()=>setSource(id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-all ${
                          source===id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-400'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleSaveCustom}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    saved ? 'bg-green-500 text-white' : 'text-white'
                  }`}
                  style={saved ? {} : {backgroundColor: ACCENT}}>
                  {saved ? <><Check size={14}/> Saved!</> : <><Save size={14}/> Save to Dashboard</>}
                </button>
              </div>
              {/* Right: preview */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-semibold text-gray-700 mb-3">{title || 'Preview'}</div>
                <div className="h-56">
                  {customData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PresetChart preset={previewPreset} data={customData}/>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400">
                      Select a data source to preview
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Watch Area — threshold alerts
// ─────────────────────────────────────────────────────────────────────────────

function WatchAreaPanel({ actuals, budgetFlat, scenario, dateRange }) {
  const { startDate, endDate } = dateRange
  const inRange   = useMemo(() => filterActuals(actuals, startDate, endDate), [actuals, startDate, endDate])
  const budgetMap = useMemo(() => getBudgetForMonths(budgetFlat, scenario, startDate, endDate), [budgetFlat, scenario, startDate, endDate])
  const byCat     = useMemo(() => sumByCategory(inRange), [inRange])

  const alerts = useMemo(() => {
    const out = []
    for (const [cat, actual] of Object.entries(byCat)) {
      const budget = budgetMap[cat] || 0
      if (!budget) continue
      const pct = actual / budget * 100
      if (pct >= 90) {
        out.push({ cat, actual, budget, pct, level: pct >= 100 ? 'over' : 'near' })
      }
    }
    return out.sort((a,b) => b.pct - a.pct)
  }, [byCat, budgetMap])

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-800 mb-3">Watch Areas</div>
        <div className="flex items-center gap-2 text-xs text-green-600">
          <CheckCircle size={14}/> All categories within budget thresholds
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs font-semibold text-gray-800">Watch Areas</div>
        <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold">{alerts.length}</span>
      </div>
      <div className="space-y-2">
        {alerts.map(a => (
          <div key={a.cat} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.level==='over'?'bg-red-500':'bg-amber-400'}`}/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800">{a.cat}</div>
              <div className="text-[10px] text-gray-400">{formatCurrency(a.actual)} of {formatCurrency(a.budget)} budget</div>
            </div>
            <div className={`text-xs font-bold ${a.level==='over'?'text-red-500':'text-amber-500'}`}>
              {Math.round(a.pct)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_KPI_IDS = ['total-revenue','total-expenses','net-position','budget-variance','ytd-income','ytd-expense','patron-count','cash-balance']
const DEFAULT_CHART_IDS = ['monthly-income','monthly-expense','budget-vs-actual','dept-breakdown','cat-breakdown','net-position-chart']

function OverviewTab({ actuals, budgetFlat, scenario, dateRange }) {
  const { startDate, endDate } = dateRange
  const [editMode,      setEditMode]      = useState(false)
  const [showBuilder,   setShowBuilder]   = useState(false)
  const [savedCharts,   setSavedCharts]   = useState(() => readLS('master-saved-charts', []))
  const [visibleKPIs,   setVisibleKPIs]   = useState(() => readLS('master-visible-kpis', DEFAULT_KPI_IDS))
  const [visibleCharts, setVisibleCharts] = useState(() => readLS('master-visible-charts', DEFAULT_CHART_IDS))

  // Persist state
  useEffect(() => { localStorage.setItem('master-saved-charts',   JSON.stringify(savedCharts))   }, [savedCharts])
  useEffect(() => { localStorage.setItem('master-visible-kpis',   JSON.stringify(visibleKPIs))   }, [visibleKPIs])
  useEffect(() => { localStorage.setItem('master-visible-charts', JSON.stringify(visibleCharts)) }, [visibleCharts])

  // Derived data
  const inRange   = useMemo(() => filterActuals(actuals, startDate, endDate), [actuals, startDate, endDate])
  const incMonths = useMemo(() => getIncomeInRange(startDate, endDate), [startDate, endDate])
  const budgetMap = useMemo(() => getBudgetForMonths(budgetFlat, scenario, startDate, endDate), [budgetFlat, scenario, startDate, endDate])

  const totalIncome   = useMemo(() => incMonths.reduce((s,m) => s + m.contributions + m.merch + m.other, 0), [incMonths])
  const totalExpenses = useMemo(() => inRange.reduce((s,t) => s + t.amount, 0), [inRange])
  const netPosition   = totalIncome - totalExpenses
  const totalBudget   = useMemo(() => Object.values(budgetMap).reduce((s,v)=>s+v,0), [budgetMap])
  const budgetVar     = totalExpenses - totalBudget

  // Budget for income (simple estimate)
  const n = numMonthsInRange(startDate, endDate)
  const incomeBudget = n * (230_000 + 16_500 + 3_500) // ~250K/mo
  const incomeVar = totalIncome - incomeBudget

  const ALL_KPI_DEFS = [
    { id:'total-revenue',    title:'Total Revenue',     value: formatCurrency(totalIncome),    sub:`${n} months`,                delta: incomeVar,   deltaLabel: `${formatCurrency(Math.abs(incomeVar))} ${incomeVar>=0?'above':'below'} budget` },
    { id:'total-expenses',   title:'Total Expenses',    value: formatCurrency(totalExpenses),  sub:`${n} months`,                delta: budgetVar,   deltaLabel: `${formatCurrency(Math.abs(budgetVar))} ${budgetVar<=0?'under':'over'} budget`, inverse:true },
    { id:'net-position',     title:'Net Position',      value: formatCurrency(netPosition),    sub:'Income minus expenses',      delta: netPosition, deltaLabel: netPosition >= 0 ? 'Surplus' : 'Deficit', accent: netPosition>0 },
    { id:'budget-variance',  title:'Expense Budget Var',value: formatCurrency(Math.abs(budgetVar)), sub: budgetVar<=0?'Under budget':'Over budget', delta: -budgetVar, deltaLabel:`${Math.abs(Math.round(budgetVar/totalBudget*100))}% of budget`, inverse:false },
    { id:'ytd-income',       title:'YTD Contributions', value: formatCurrency(incMonths.reduce((s,m)=>s+m.contributions,0)), sub:'Patron contributions', delta: null, deltaLabel:'' },
    { id:'ytd-expense',      title:'Largest Department',value: (() => { const bd = sumByDept(inRange); const top = Object.entries(bd).sort((a,b)=>b[1]-a[1])[0]; return top ? formatCurrency(top[1]) : '—' })(), sub: (() => { const bd = sumByDept(inRange); const top = Object.entries(bd).sort((a,b)=>b[1]-a[1])[0]; return top ? DEPT_NAMES[top[0]] : '—' })(), delta: null, deltaLabel:'' },
    { id:'patron-count',     title:'Patron Count',      value:'24,810',                        sub: '+390 vs prior mo',         delta: 390,         deltaLabel: '+1.6% growth' },
    { id:'cash-balance',     title:'Cash Balance',      value:'$3.24M',                        sub:'Prior month: $3.1M',        delta: 135_000,     deltaLabel: '+$135K MOM' },
  ]

  const activeKPIs   = ALL_KPI_DEFS.filter(k => visibleKPIs.includes(k.id))
  const allPresets   = CHART_PRESETS.map(p => ({ ...p, isPreset: true }))
  const allCharts    = [...allPresets, ...savedCharts]
  const activeCharts = allCharts.filter(c => visibleCharts.includes(c.id) || visibleCharts.includes(c.id+'-chart'))

  function addChart(preset) {
    const id = preset.id + (preset.isPreset ? '-chart' : '')
    setSavedCharts(prev => prev.find(c=>c.id===preset.id) ? prev : [...prev, preset])
    setVisibleCharts(prev => prev.includes(id) ? prev : [...prev, id])
  }

  function removeChart(chartId) {
    setVisibleCharts(prev => prev.filter(id => id !== chartId))
  }

  function removeKPI(kpiId) {
    setVisibleKPIs(prev => prev.filter(id => id !== kpiId))
  }

  // Build chart data for each active chart
  const chartDataMap = useMemo(() => {
    const map = {}
    for (const c of allCharts) {
      map[c.id] = buildChartData(c, actuals, dateRange, budgetFlat, scenario)
    }
    return map
  }, [actuals, dateRange, budgetFlat, scenario])

  const hiddenKPIs   = ALL_KPI_DEFS.filter(k => !visibleKPIs.includes(k.id))
  const hiddenCharts = allCharts.filter(c => {
    const id = c.id + (c.isPreset ? '-chart' : '')
    return !visibleCharts.includes(c.id) && !visibleCharts.includes(id)
  })

  return (
    <div className="p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Financial Overview</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {presetLabel(dateRange.preset)} · {formatCurrency(totalIncome)} income · {formatCurrency(totalExpenses)} expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBuilder(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
            <Plus size={13}/> Add Chart
          </button>
          <button onClick={() => setEditMode(v=>!v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              editMode ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
            <Settings size={13}/>{editMode ? 'Done' : 'Customize'}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Key Metrics</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeKPIs.map(kpi => (
            <KPICard key={kpi.id} {...kpi} editMode={editMode} onHide={() => removeKPI(kpi.id)}/>
          ))}
          {editMode && hiddenKPIs.map(kpi => (
            <button key={kpi.id} onClick={() => setVisibleKPIs(p => [...p, kpi.id])}
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-teal-300 hover:text-teal-500 transition-colors flex items-center gap-1.5">
              <Plus size={12}/> {kpi.title}
            </button>
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Charts</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeCharts.map(chart => {
            const chartId = chart.id + (chart.isPreset ? '-chart' : '')
            const preset  = CHART_PRESETS.find(p=>p.id===chart.id) || chart
            const data    = chartDataMap[chart.id] || []
            return (
              <ChartPanel key={chartId} title={chart.title || preset.title}
                subtitle={`${chart.type} chart · ${presetLabel(dateRange.preset)}`}
                editMode={editMode} onRemove={() => removeChart(chartId)}>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PresetChart preset={preset} data={data}/>
                  </ResponsiveContainer>
                </div>
              </ChartPanel>
            )
          })}
          {editMode && (
            <button onClick={() => setShowBuilder(true)}
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-teal-300 hover:text-teal-500 transition-colors flex items-center justify-center gap-2 h-56">
              <Plus size={14}/> Add Chart
            </button>
          )}
        </div>
      </div>

      {/* Watch Areas */}
      <WatchAreaPanel actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange}/>

      {/* Chart Builder Modal */}
      {showBuilder && (
        <ChartBuilderModal
          onSave={addChart}
          onClose={() => setShowBuilder(false)}
          actuals={actuals}
          dateRange={dateRange}
          budgetFlat={budgetFlat}
          scenario={scenario}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P&L Breakdown Tab
// ─────────────────────────────────────────────────────────────────────────────

function PLBreakdownTab({ actuals, budgetFlat, scenario, dateRange, teamFilter }) {
  const { startDate, endDate } = dateRange
  const [expandedDepts, setExpandedDepts] = useState(new Set())

  const depts = teamFilter === 'all' ? ALL_DEPTS : [teamFilter]
  const inRange = useMemo(() => filterActuals(actuals, startDate, endDate), [actuals, startDate, endDate])
  const incMonths = useMemo(() => getIncomeInRange(startDate, endDate), [startDate, endDate])
  const n = numMonthsInRange(startDate, endDate)

  // Income
  const totalContributions  = incMonths.reduce((s,m)=>s+m.contributions,0)
  const totalMerch          = incMonths.reduce((s,m)=>s+m.merch,0)
  const totalOtherInc       = incMonths.reduce((s,m)=>s+m.other,0)
  const totalIncome         = totalContributions + totalMerch + totalOtherInc

  const budgetContributions = n * 230_000
  const budgetMerch         = n * 16_500
  const budgetOtherInc      = n * 3_500
  const budgetIncome        = budgetContributions + budgetMerch + budgetOtherInc

  // Expenses by dept and category
  const expenseRows = useMemo(() => {
    return depts.map(dept => {
      const deptTx = filterActuals(inRange, startDate, endDate, dept).filter(t => depts.includes(t.department) ? true : dept==='all')
      // actually re-filter by dept
      const dtx = inRange.filter(t => t.department === dept)
      const byCat = sumByCategory(dtx)
      const deptBudget = budgetFlat.filter(b => b.scenario===scenario && b.department===dept)
      const budgetByCat = {}
      for (const b of deptBudget) { budgetByCat[b.category] = (budgetByCat[b.category]||0) + b.monthlyAmount * n }
      const total  = Object.values(byCat).reduce((s,v)=>s+v,0)
      const budgetTotal = Object.values(budgetByCat).reduce((s,v)=>s+v,0)
      const cats = Object.keys({...byCat,...budgetByCat}).sort()
      return { dept, deptName: DEPT_NAMES[dept], total, budgetTotal, byCat, budgetByCat, cats }
    })
  }, [inRange, depts, budgetFlat, scenario, n, startDate, endDate])

  const totalExpenses       = expenseRows.reduce((s,r)=>s+r.total,0)
  const totalBudgetExpenses = expenseRows.reduce((s,r)=>s+r.budgetTotal,0)
  const netPosition         = totalIncome - totalExpenses
  const netBudget           = budgetIncome - totalBudgetExpenses

  function toggleDept(dept) {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      next.has(dept) ? next.delete(dept) : next.add(dept)
      return next
    })
  }

  const colHdr = 'text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 py-2'
  const hdrRow = 'text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-gray-50 px-4 py-2 border-b border-gray-200'
  const dataRow = (label, actual, budget, indent=0, bold=false, isIncome=false) => {
    const vari = isIncome ? actual - budget : actual - budget
    const pct  = budget > 0 ? actual/budget*100 : null
    const good = isIncome ? vari >= 0 : vari <= 0
    return (
      <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
        <td className="px-4 py-2" style={{ paddingLeft: 16 + indent*16 + 'px' }}>
          <span className={`text-xs ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{label}</span>
        </td>
        <td className="text-right px-3 py-2">
          <span className={`text-xs font-medium ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
            {formatCurrency(actual, {compact:false})}
          </span>
        </td>
        <td className="text-right px-3 py-2">
          <span className="text-xs text-gray-500">{budget > 0 ? formatCurrency(budget, {compact:false}) : '—'}</span>
        </td>
        <td className="text-right px-3 py-2">
          {budget > 0 ? (
            <span className="text-xs font-medium" style={{color: good ? '#10B981' : '#EF4444'}}>
              {vari >= 0 ? '+' : ''}{formatCurrency(vari, {compact:false})}
            </span>
          ) : <span className="text-xs text-gray-300">—</span>}
        </td>
        <td className="text-right px-3 py-2 w-20">
          {pct !== null ? (
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
              <div className="w-12 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: Math.min(pct,100)+'%',
                  backgroundColor: good ? '#10B981' : '#EF4444'
                }}/>
              </div>
            </div>
          ) : null}
        </td>
      </tr>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">P&L Breakdown</h2>
        <p className="text-xs text-gray-400 mt-0.5">{presetLabel(dateRange.preset)} · {scenario}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Line Item</th>
              <th className={colHdr}>Actual</th>
              <th className={colHdr}>Budget</th>
              <th className={colHdr}>Variance</th>
              <th className={colHdr}>% of Budget</th>
            </tr>
          </thead>
          <tbody>
            {/* INCOME */}
            <tr><td colSpan={5} className={hdrRow}>Income</td></tr>
            {dataRow('Contributions',   totalContributions, budgetContributions, 0, false, true)}
            {dataRow('Merchandise Revenue', totalMerch,    budgetMerch,         0, false, true)}
            {dataRow('Other Income',    totalOtherInc,     budgetOtherInc,      0, false, true)}
            <tr className="bg-teal-50 border-b border-teal-100">
              <td className="px-4 py-2.5 text-xs font-bold text-teal-800">Total Income</td>
              <td className="text-right px-3 py-2.5 text-xs font-bold text-teal-800">{formatCurrency(totalIncome, {compact:false})}</td>
              <td className="text-right px-3 py-2.5 text-xs text-teal-600">{formatCurrency(budgetIncome, {compact:false})}</td>
              <td className="text-right px-3 py-2.5 text-xs font-bold" style={{color:(totalIncome-budgetIncome)>=0?'#0EA5A0':'#EF4444'}}>
                {(totalIncome-budgetIncome)>=0?'+':''}{formatCurrency(totalIncome-budgetIncome, {compact:false})}
              </td>
              <td className="text-right px-3 py-2.5 text-xs text-teal-600">{budgetIncome>0 ? Math.round(totalIncome/budgetIncome*100)+'%' : '—'}</td>
            </tr>

            {/* EXPENSES */}
            <tr><td colSpan={5} className={hdrRow}>Expenses</td></tr>
            {expenseRows.map(row => (
              <React.Fragment key={row.dept}>
                <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleDept(row.dept)}>
                  <td className="px-4 py-2.5 flex items-center gap-2">
                    <span className="text-gray-300">{expandedDepts.has(row.dept) ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</span>
                    <span className="text-xs font-semibold text-gray-800">{row.deptName}</span>
                  </td>
                  <td className="text-right px-3 py-2.5 text-xs font-semibold text-gray-800">{formatCurrency(row.total, {compact:false})}</td>
                  <td className="text-right px-3 py-2.5 text-xs text-gray-500">{formatCurrency(row.budgetTotal, {compact:false})}</td>
                  <td className="text-right px-3 py-2.5 text-xs font-semibold"
                      style={{color:(row.total-row.budgetTotal)<=0?'#10B981':'#EF4444'}}>
                    {(row.total-row.budgetTotal)<=0?'+':''}{formatCurrency(row.budgetTotal-row.total, {compact:false})}
                  </td>
                  <td className="text-right px-3 py-2.5 text-xs text-gray-500">
                    {row.budgetTotal > 0 ? Math.round(row.total/row.budgetTotal*100)+'%' : '—'}
                  </td>
                </tr>
                {expandedDepts.has(row.dept) && row.cats.map(cat => (
                  dataRow(cat, row.byCat[cat]||0, row.budgetByCat[cat]||0, 1, false, false)
                ))}
              </React.Fragment>
            ))}

            {/* Total Expenses */}
            <tr className="bg-orange-50 border-b border-orange-100">
              <td className="px-4 py-2.5 text-xs font-bold text-orange-800">Total Expenses</td>
              <td className="text-right px-3 py-2.5 text-xs font-bold text-orange-800">{formatCurrency(totalExpenses, {compact:false})}</td>
              <td className="text-right px-3 py-2.5 text-xs text-orange-600">{formatCurrency(totalBudgetExpenses, {compact:false})}</td>
              <td className="text-right px-3 py-2.5 text-xs font-bold"
                  style={{color:(totalExpenses-totalBudgetExpenses)<=0?'#10B981':'#EF4444'}}>
                {(totalExpenses-totalBudgetExpenses)<=0?'+':''}{formatCurrency(totalBudgetExpenses-totalExpenses, {compact:false})}
              </td>
              <td className="text-right px-3 py-2.5 text-xs text-orange-600">{totalBudgetExpenses>0 ? Math.round(totalExpenses/totalBudgetExpenses*100)+'%' : '—'}</td>
            </tr>

            {/* Net Position */}
            <tr className="border-t-2 border-gray-300" style={{backgroundColor: netPosition>=0?'#ECFDF5':'#FEF2F2'}}>
              <td className="px-4 py-3 text-sm font-bold" style={{color:netPosition>=0?'#065F46':'#991B1B'}}>Net Position</td>
              <td className="text-right px-3 py-3 text-sm font-bold" style={{color:netPosition>=0?'#10B981':'#EF4444'}}>
                {formatCurrency(netPosition, {compact:false})}
              </td>
              <td className="text-right px-3 py-3 text-xs" style={{color:netPosition>=0?'#6EE7B7':'#FCA5A5'}}>
                {formatCurrency(netBudget, {compact:false})}
              </td>
              <td className="text-right px-3 py-3 text-xs font-semibold" style={{color:netPosition>=0?'#10B981':'#EF4444'}}>
                {(netPosition-netBudget)>=0?'+':''}{formatCurrency(netPosition-netBudget, {compact:false})}
              </td>
              <td/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions Tab
// ─────────────────────────────────────────────────────────────────────────────

function MasterTransactionsTab({ actuals, dateRange, teamFilter }) {
  const { startDate, endDate } = dateRange
  const [search,   setSearch]   = useState('')
  const [deptFilt, setDeptFilt] = useState(teamFilter === 'all' ? 'all' : teamFilter)
  const [catFilt,  setCatFilt]  = useState('all')
  const [sortCol,  setSortCol]  = useState('date')
  const [sortDir,  setSortDir]  = useState('desc')
  const [page,     setPage]     = useState(0)
  const PAGE_SIZE = 50

  // Sync team filter from nav
  useEffect(() => { if(teamFilter !== 'all') setDeptFilt(teamFilter) }, [teamFilter])

  const inRange = useMemo(() => filterActuals(actuals, startDate, endDate), [actuals, startDate, endDate])
  const categories = useMemo(() => ['all', ...new Set(inRange.map(t=>t.category)).values()], [inRange])

  const filtered = useMemo(() => {
    let rows = inRange
    if (deptFilt !== 'all') rows = rows.filter(t => t.department === deptFilt)
    if (catFilt  !== 'all') rows = rows.filter(t => t.category   === catFilt)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(t => t.vendor?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.account?.toLowerCase().includes(q))
    }
    rows = [...rows].sort((a,b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase() }
      return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
    })
    return rows
  }, [inRange, deptFilt, catFilt, search, sortCol, sortDir])

  const pageData   = filtered.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortHdr = ({ col, children }) => (
    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 cursor-pointer hover:text-gray-700 select-none"
        onClick={() => handleSort(col)}>
      <div className="flex items-center gap-1">
        {children}
        {sortCol===col ? (sortDir==='asc'?<ChevronUp size={10}/>:<ChevronDown size={10}/>) : <ArrowUpDown size={10} className="opacity-30"/>}
      </div>
    </th>
  )

  const totalFiltered = filtered.reduce((s,t)=>s+t.amount,0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">All Transactions</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} transactions · {formatCurrency(totalFiltered)} total
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Search vendor, account…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"/>
        </div>
        <select value={deptFilt} onChange={e=>{setDeptFilt(e.target.value);setPage(0)}}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="all">All Teams</option>
          {ALL_DEPTS.map(d => <option key={d} value={d}>{DEPT_NAMES[d]}</option>)}
        </select>
        <select value={catFilt} onChange={e=>{setCatFilt(e.target.value);setPage(0)}}
          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          {categories.map(c => <option key={c} value={c}>{c==='all'?'All Categories':c}</option>)}
        </select>
        {(search||deptFilt!=='all'||catFilt!=='all') && (
          <button onClick={() => { setSearch(''); setDeptFilt('all'); setCatFilt('all'); setPage(0) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={12}/> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <SortHdr col="date">Date</SortHdr>
              <SortHdr col="department">Team</SortHdr>
              <SortHdr col="vendor">Vendor</SortHdr>
              <SortHdr col="category">Category</SortHdr>
              <SortHdr col="account">Account</SortHdr>
              <SortHdr col="amount">Amount</SortHdr>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Grant</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((t, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{t.date}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{backgroundColor: (DEPT_COLORS[t.department]||'#9BA8B5')+'18', color: DEPT_COLORS[t.department]||'#9BA8B5'}}>
                    {DEPT_NAMES[t.department] || t.department}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-800 font-medium max-w-[160px] truncate">{t.vendor}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{backgroundColor:(CAT_COLORS[t.category]||'#9BA8B5')+'18', color:CAT_COLORS[t.category]||'#9BA8B5'}}>
                    {t.category}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px] truncate">{t.account}</td>
                <td className="px-3 py-2 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">{formatCurrency(t.amount, {compact:false})}</td>
                <td className="px-3 py-2 text-xs text-gray-400">{t.grant || '—'}</td>
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">No transactions match the current filters.</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-400">
              {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page===0} onClick={()=>setPage(p=>p-1)}
                className="px-2 py-1 rounded text-xs text-gray-500 disabled:opacity-30 hover:bg-gray-100 transition-colors">
                <ChevronLeft size={14}/>
              </button>
              {Array.from({length:totalPages},(_, i)=>i).slice(Math.max(0,page-2), page+3).map(i=>(
                <button key={i} onClick={()=>setPage(i)}
                  className={`w-7 h-7 rounded text-xs transition-colors ${i===page?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-100'}`}>
                  {i+1}
                </button>
              ))}
              <button disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}
                className="px-2 py-1 rounded text-xs text-gray-500 disabled:opacity-30 hover:bg-gray-100 transition-colors">
                <ChevronRight size={14}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Tab
// ─────────────────────────────────────────────────────────────────────────────

function MasterTeamsTab({ actuals, budgetFlat, scenario, dateRange }) {
  const { startDate, endDate } = dateRange
  const [expandedDept, setExpandedDept] = useState(null)
  const inRange = useMemo(() => filterActuals(actuals, startDate, endDate), [actuals, startDate, endDate])
  const n = numMonthsInRange(startDate, endDate)

  const deptRows = useMemo(() => {
    return ALL_DEPTS.map(dept => {
      const dtx    = inRange.filter(t => t.department === dept)
      const byCat  = sumByCategory(dtx)
      const total  = dtx.reduce((s,t)=>s+t.amount,0)
      const budgetRows = budgetFlat.filter(b => b.scenario===scenario && b.department===dept)
      const budgetTotal = budgetRows.reduce((s,b)=>s+b.monthlyAmount*n,0)
      const variance = total - budgetTotal
      const pct = budgetTotal > 0 ? total/budgetTotal*100 : null
      const status = pct === null ? 'no-budget' : pct <= 85 ? 'good' : pct <= 100 ? 'caution' : 'over'
      const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
      return { dept, deptName: DEPT_NAMES[dept], total, budgetTotal, variance, pct, status, cats }
    })
  }, [inRange, budgetFlat, scenario, n])

  const STATUS_CONFIG = {
    good:       { label:'On Track',   dot:'#10B981', bg:'#ECFDF5', text:'#065F46' },
    caution:    { label:'Watch',      dot:'#F59E0B', bg:'#FFF8ED', text:'#B45309' },
    over:       { label:'Over Budget',dot:'#EF4444', bg:'#FEF2F2', text:'#991B1B' },
    'no-budget':{ label:'No Budget',  dot:'#9BA8B5', bg:'#F3F4F6', text:'#6B7280' },
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Team Comparison</h2>
        <p className="text-xs text-gray-400 mt-0.5">{presetLabel(dateRange.preset)} · {scenario}</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {deptRows.map(row => (
          <div key={row.dept} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-800">{row.deptName}</div>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                    style={{backgroundColor:STATUS_CONFIG[row.status].bg, color:STATUS_CONFIG[row.status].text}}>
                <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:STATUS_CONFIG[row.status].dot}}/>
                {STATUS_CONFIG[row.status].label}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{formatCurrency(row.total)}</div>
            <div className="text-[11px] text-gray-400 mb-2">Budget: {formatCurrency(row.budgetTotal)}</div>
            {row.pct !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">Budget used</span>
                  <span className="text-[10px] font-semibold" style={{color:STATUS_CONFIG[row.status].dot}}>{Math.round(row.pct)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: Math.min(row.pct,100)+'%',
                    backgroundColor: STATUS_CONFIG[row.status].dot
                  }}/>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Team / Category</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Actual</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Budget</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Variance</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">% Budget</th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {deptRows.map(row => (
              <React.Fragment key={row.dept}>
                <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedDept(expandedDept===row.dept ? null : row.dept)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300">{expandedDept===row.dept ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</span>
                      <div className="w-2 h-2 rounded-full" style={{backgroundColor:DEPT_COLORS[row.dept]}}/>
                      <span className="text-xs font-semibold text-gray-800">{row.deptName}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2.5 text-xs font-semibold text-gray-900">{formatCurrency(row.total, {compact:false})}</td>
                  <td className="text-right px-3 py-2.5 text-xs text-gray-500">{formatCurrency(row.budgetTotal, {compact:false})}</td>
                  <td className="text-right px-3 py-2.5 text-xs font-semibold" style={{color:row.variance<=0?'#10B981':'#EF4444'}}>
                    {row.variance<=0?'+':''}{formatCurrency(Math.abs(row.variance), {compact:false})} {row.variance<=0?'under':'over'}
                  </td>
                  <td className="text-right px-3 py-2.5 text-xs text-gray-600">{row.pct!==null ? Math.round(row.pct)+'%' : '—'}</td>
                  <td className="text-center px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                          style={{backgroundColor:STATUS_CONFIG[row.status].bg, color:STATUS_CONFIG[row.status].text}}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:STATUS_CONFIG[row.status].dot}}/>
                      {STATUS_CONFIG[row.status].label}
                    </span>
                  </td>
                </tr>
                {expandedDept === row.dept && row.cats.map(([cat,amt]) => {
                  const budgetForCat = (budgetFlat.find(b=>b.scenario===scenario&&b.department===row.dept&&b.category===cat)?.monthlyAmount||0)*n
                  const catVar = amt - budgetForCat
                  return (
                    <tr key={cat} className="border-b border-gray-100 bg-gray-50/30">
                      <td className="px-4 py-2 pl-10">
                        <span className="text-[11px] text-gray-600">{cat}</span>
                      </td>
                      <td className="text-right px-3 py-2 text-[11px] text-gray-700">{formatCurrency(amt, {compact:false})}</td>
                      <td className="text-right px-3 py-2 text-[11px] text-gray-400">{budgetForCat>0?formatCurrency(budgetForCat, {compact:false}):'—'}</td>
                      <td className="text-right px-3 py-2 text-[11px] font-medium" style={{color:catVar<=0?'#10B981':'#EF4444'}}>
                        {budgetForCat>0 ? `${catVar<=0?'+':''} ${formatCurrency(Math.abs(catVar), {compact:false})}` : '—'}
                      </td>
                      <td className="text-right px-3 py-2 text-[11px] text-gray-400">
                        {budgetForCat>0 ? Math.round(amt/budgetForCat*100)+'%' : '—'}
                      </td>
                      <td/>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Tab
// ─────────────────────────────────────────────────────────────────────────────

function ImportDropZone({ label, description, acceptedTypes }) {
  const [dragging, setDragging] = useState(false)
  const [files,    setFiles]    = useState([])
  const inputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...dropped.map(f => ({ name: f.name, size: f.size, status:'ready' }))])
  }

  function handleSelect(e) {
    const selected = Array.from(e.target.files)
    setFiles(prev => [...prev, ...selected.map(f => ({ name: f.name, size: f.size, status:'ready' }))])
  }

  return (
    <div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
           onClick={() => inputRef.current?.click()}
           className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
             dragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
           }`}>
        <input ref={inputRef} type="file" className="hidden" onChange={handleSelect} multiple accept={acceptedTypes}/>
        <Upload size={24} className={`mx-auto mb-3 ${dragging?'text-teal-500':'text-gray-300'}`}/>
        <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
        <div className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-colors"
             style={{backgroundColor: ACCENT}}>
          <Upload size={12}/> Choose file
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 text-xs">
              <FileText size={13} className="text-gray-400 flex-shrink-0"/>
              <span className="flex-1 text-gray-700 truncate">{f.name}</span>
              <span className="text-gray-400">{(f.size/1024).toFixed(0)} KB</span>
              <span className="text-teal-600 font-medium">Ready</span>
              <button onClick={e=>{e.stopPropagation();setFiles(prev=>prev.filter((_,j)=>j!==i))}}
                className="text-gray-300 hover:text-red-400 transition-colors"><X size={12}/></button>
            </div>
          ))}
          <button className="w-full py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                  style={{backgroundColor:ACCENT}}>
            Upload {files.length} file{files.length>1?'s':''}
          </button>
        </div>
      )}
    </div>
  )
}

const IMPORT_HISTORY_MOCK = [
  { date:'2026-05-01', type:'Actuals',          file:'actuals-apr-2026.csv',   rows:142, user:'Alex H.',     status:'success' },
  { date:'2026-04-01', type:'Budget',            file:'budget-fy2026-v2.csv',   rows:24,  user:'Alex H.',     status:'success' },
  { date:'2026-03-15', type:'Patron Data',       file:'patron-mar-2026.xlsx',   rows:890, user:'Jordan M.',   status:'success' },
  { date:'2026-03-01', type:'Actuals',           file:'actuals-feb-2026.csv',   rows:138, user:'Alex H.',     status:'success' },
  { date:'2026-02-12', type:'Financial Data',    file:'financial-q2.csv',       rows:56,  user:'Sam T.',      status:'error',  error:'Missing required column: grant' },
  { date:'2026-02-01', type:'Actuals',           file:'actuals-jan-2026.csv',   rows:145, user:'Alex H.',     status:'success' },
]

function MasterImportTab() {
  const [activeImportTab, setActiveImportTab] = useState('actuals')

  const IMPORT_CONFIGS = {
    actuals:   { label:'Actuals',          description:'CSV or Excel with columns: date, amount, department, vendor, category, account, grant, description', accept:'.csv,.xlsx,.xls' },
    budget:    { label:'Budget',           description:'CSV or Excel with columns: department, category, scenario, monthlyAmount', accept:'.csv,.xlsx,.xls' },
    financial: { label:'Financial Data',   description:'General ledger exports, balance sheet data, or cash position reports', accept:'.csv,.xlsx,.xls,.pdf' },
    patron:    { label:'Patron Data',      description:'Donor database export with columns: id, date, amount, type, status', accept:'.csv,.xlsx,.xls' },
    cashflow:  { label:'Cash Flow',        description:'Bank statement or cash flow projection file', accept:'.csv,.xlsx,.xls,.pdf' },
    summary:   { label:'Monthly Summary',  description:'ELT-style monthly narrative summary (JSON or text format)', accept:'.json,.txt,.csv' },
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Import Data</h2>
        <p className="text-xs text-gray-400 mt-0.5">Upload financial data to update dashboards across the organization</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl px-1 py-1 mb-6 w-fit">
        {MASTER_IMPORT_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveImportTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeImportTab===tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeImportTab === 'history' ? (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Date</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">File</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rows</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Uploaded by</th>
                  <th className="text-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {IMPORT_HISTORY_MOCK.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-600">{row.date}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-gray-800">{row.type}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-gray-700">
                        <FileText size={12} className="text-gray-400"/>
                        {row.file}
                      </div>
                      {row.error && <div className="text-[10px] text-red-500 mt-0.5">{row.error}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right text-gray-500">{row.rows.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{row.user}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
                        row.status==='success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {row.status==='success' ? <Check size={9}/> : <X size={9}/>}
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            {IMPORT_CONFIGS[activeImportTab] && (
              <ImportDropZone
                label={`Import ${IMPORT_CONFIGS[activeImportTab].label}`}
                description={IMPORT_CONFIGS[activeImportTab].description}
                acceptedTypes={IMPORT_CONFIGS[activeImportTab].accept}/>
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-800 mb-3">Format Requirements</div>
              <div className="space-y-2 text-xs text-gray-500">
                {activeImportTab === 'actuals' && <>
                  <div className="font-medium text-gray-700">Required columns:</div>
                  <div className="font-mono text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                    date, amount, department, vendor, category, account
                  </div>
                  <div className="font-medium text-gray-700 mt-2">Optional columns:</div>
                  <div className="font-mono text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                    grant, description
                  </div>
                  <div className="mt-2">Date format: YYYY-MM-DD. Amounts in USD (no currency symbol).</div>
                </>}
                {activeImportTab === 'budget' && <>
                  <div className="font-medium text-gray-700">Required columns:</div>
                  <div className="font-mono text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                    department, category, scenario, monthlyAmount
                  </div>
                  <div className="mt-2">monthlyAmount is the average monthly budget for that dept/category combination. It will be multiplied by the number of months in any date range query.</div>
                </>}
                {activeImportTab === 'patron' && <>
                  <div className="font-medium text-gray-700">Required columns:</div>
                  <div className="font-mono text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                    date, amount, patron_id
                  </div>
                  <div className="mt-2">Used to compute patron counts, average gift size, and monthly giving trends shown in the Overview.</div>
                </>}
                {!['actuals','budget','patron'].includes(activeImportTab) && (
                  <div>Contact your Finance administrator for the expected column format for this data type.</div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-800 mb-2">Recent Imports</div>
              {IMPORT_HISTORY_MOCK.filter(r=>r.type.toLowerCase().includes(IMPORT_CONFIGS[activeImportTab]?.label.split(' ')[0].toLowerCase())).slice(0,3).map((row,i)=>(
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${row.status==='success'?'bg-green-400':'bg-red-400'}`}/>
                  <span className="text-xs text-gray-700 flex-1 truncate">{row.file}</span>
                  <span className="text-[10px] text-gray-400">{row.date}</span>
                </div>
              ))}
              {IMPORT_HISTORY_MOCK.filter(r=>r.type.toLowerCase().includes(IMPORT_CONFIGS[activeImportTab]?.label.split(' ')[0].toLowerCase())).length === 0 && (
                <div className="text-xs text-gray-400 py-1">No recent imports for this type.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Master Dashboard (main export)
// ─────────────────────────────────────────────────────────────────────────────

export default function MasterDashboard() {
  const { orgConfig, actuals, budgetFlat, availableScenarios, selectedScenario } = useApp()

  const [activeTab,   setActiveTab]   = useState('overview')
  const [activeBudget, setActiveBudget] = useState(selectedScenario || 'Planned Spend')
  const [teamFilter,  setTeamFilter]  = useState('all')

  // Local date range (independent of global AppContext, like ELTDashboard)
  const defaultRange = getMasterPresetRange('fiscal-ytd')
  const [dateRange, setDateRange] = useState({ preset:'fiscal-ytd', ...defaultRange })

  function applyPreset(preset) {
    setDateRange({ preset, ...getMasterPresetRange(preset) })
  }
  function applyCustom(startDate, endDate) {
    setDateRange({ preset:'custom', startDate, endDate })
  }

  // Filter actuals by team filter if set (for passing down to tabs)
  const filteredActuals = useMemo(() => {
    if (teamFilter === 'all') return actuals
    return actuals.filter(t => t.department === teamFilter)
  }, [actuals, teamFilter])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor:'var(--color-primary-bg)' }}>
      <MasterNav
        orgConfig={orgConfig}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dateRange={dateRange}
        onApplyPreset={applyPreset}
        onApplyCustom={applyCustom}
        activeBudget={activeBudget}
        onSetBudget={setActiveBudget}
        availableScenarios={availableScenarios}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
      />

      <main className="flex-1 overflow-auto">
        {activeTab === 'overview'     && (
          <OverviewTab
            actuals={filteredActuals}
            budgetFlat={budgetFlat}
            scenario={activeBudget}
            dateRange={dateRange}
          />
        )}
        {activeTab === 'pl'           && (
          <PLBreakdownTab
            actuals={actuals}
            budgetFlat={budgetFlat}
            scenario={activeBudget}
            dateRange={dateRange}
            teamFilter={teamFilter}
          />
        )}
        {activeTab === 'transactions' && (
          <MasterTransactionsTab
            actuals={actuals}
            dateRange={dateRange}
            teamFilter={teamFilter}
          />
        )}
        {activeTab === 'teams'        && (
          <MasterTeamsTab
            actuals={actuals}
            budgetFlat={budgetFlat}
            scenario={activeBudget}
            dateRange={dateRange}
          />
        )}
        {activeTab === 'comments'     && <CommentsPage />}
        {activeTab === 'import'       && <MasterImportTab />}
      </main>
    </div>
  )
}
