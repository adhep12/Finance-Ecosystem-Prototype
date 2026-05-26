import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Minus,
  ChevronDown, ChevronRight, ChevronLeft,
  Plus, X, Edit2, Trash2,
  BarChart2, Activity, Filter, Search, Check, Settings,
  Building2, Calendar, Download, GripVertical, RotateCcw,
  Ban, Eye, EyeOff, ArrowUp, ArrowDown, CheckSquare, Square,
  Layers, FileText, Clock, ChevronUp, ArrowUpDown, ExternalLink,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import CommentsPage from './CommentsPage'
import SetupPage from './SetupPage'
import TransactionImportFlow from './TransactionImportFlow'
import BudgetImportFlow from './BudgetImportFlow'
import MasterTransactionsEditor from './MasterTransactionsEditor'
import PatronImportFlow from './PatronImportFlow'
import CashFlowImportFlow from './CashFlowImportFlow'
import { useOrgSettings } from '../hooks/useRegistry'
import { formatCurrency, formatOverUnder, formatPercent } from '../utils/formatters'
import {
  filterActualsByRange, calcBudgetByCategory,
  buildVisibleRows, getUniqueValues,
} from '../utils/dataProcessing'
import CalendarBreakdownView from '../components/CalendarBreakdownView'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { supabase, ORG_ID } from '../lib/supabase'
import { WARN_CONFIG, UnresolvedSection } from '../components/UnresolvedWarning'
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEPT_COLORS  = { '101':'#0EA5A0','102':'#C05A2F','103':'#E8A838' }
// Colour rotation for team spend stacked bar
const TEAM_PALETTE = ['#0EA5A0','#C05A2F','#E8A838','#4A2E5A','#6366F1','#10B981','#EC4899','#9BA8B5']
const FIELD_COLORS = { department:'#0EA5A0', category:'#C05A2F', account:'#E8A838', grant:'#4A2E5A', vendor:'#9BA8B5' }
const FIELD_LABELS = { department:'Department', category:'Category', account:'Account', grant:'Grant', vendor:'Vendor' }
const ALL_DRILL_FIELDS = ['department','category','account','grant','vendor']

// ── Full 15-card Finance KPI catalog ─────────────────────────────────────────
const FINANCE_KPI_CATALOG = [
  { id:'total-giving',       label:'Total Giving',              group:'Giving & Revenue'  },
  { id:'total-expenses',     label:'Total Expenses',            group:'Expenses'          },
  { id:'net-position',       label:'Net Position',              group:'Net & Cash'        },
  { id:'cash-position',      label:'Cash Position',             group:'Net & Cash'        },
  { id:'cash-above-floor',   label:'Cash Above Floor',          group:'Net & Cash'        },
  { id:'teams-over-budget',  label:'Teams Over Budget',         group:'Operations'        },
  { id:'total-supporters',   label:'Total Active Supporters',   group:'Supporter Metrics' },
  { id:'new-supporters',     label:'New Supporters',            group:'Supporter Metrics' },
  { id:'avg-gift',           label:'Avg Gift Size',             group:'Supporter Metrics' },
  { id:'recurring-patrons',  label:'Recurring Patrons',         group:'Supporter Metrics' },
  { id:'recurring-giving',   label:'Recurring Giving',          group:'Giving & Revenue'  },
  { id:'spontaneous-giving', label:'Spontaneous Giving',        group:'Giving & Revenue'  },
  { id:'total-transactions', label:'Total Transactions',        group:'Operations'        },
  { id:'budget-utilization', label:'Budget Utilization',        group:'Operations'        },
  { id:'open-comments',      label:'Open Comments & Requests',  group:'Operations'        },
]
// Default 9-card layout: Row 1 = financial health (6), Row 2 = supporter health (3)
// Removed from default but available via Add: recurring-patrons, recurring-giving,
// spontaneous-giving, total-transactions, budget-utilization, open-comments
const FINANCIAL_KPI_IDS  = ['total-giving','total-expenses','net-position','cash-position','cash-above-floor','teams-over-budget']
const SUPPORTER_KPI_IDS  = ['total-supporters','new-supporters','avg-gift']
const DEFAULT_FINANCE_KPI_IDS = [...FINANCIAL_KPI_IDS, ...SUPPORTER_KPI_IDS]

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n){ return String(n).padStart(2,'0') }
function ymd(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}` }
function monthKey(dateStr){ return dateStr.slice(0,7) }

function getMasterPresetRange(preset, org = {}){
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth()+1, today.getDate())

  const fy  = org.fiscalYearStartMonth    || 10
  const fyY = org.fiscalYearStartYear     || 2025
  const oy  = org.operatingYearStartMonth || 5
  const oyY = org.operatingYearStartYear  || 2025

  // End of fiscal year = month before start, next year (Jan start = Dec same year)
  const fyeY = fy===1?fyY:fyY+1, fyeM = fy===1?12:fy-1
  const fyeD = new Date(fyeY, fyeM, 0).getDate()   // last day of fyeM (1-indexed trick)
  // End of operating year
  const oyeY = oy===1?oyY:oyY+1, oyeM = oy===1?12:oy-1
  const oyeD = new Date(oyeY, oyeM, 0).getDate()

  if(preset==='full-fiscal')    return { startDate:ymd(fyY,fy,1), endDate:ymd(fyeY,fyeM,fyeD) }
  if(preset==='fiscal-ytd')     return { startDate:ymd(fyY,fy,1), endDate:todayStr }
  if(preset==='full-operating') return { startDate:ymd(oyY,oy,1), endDate:ymd(oyeY,oyeM,oyeD) }
  if(preset==='operating-ytd')  return { startDate:ymd(oyY,oy,1), endDate:todayStr }
  if(preset==='last-month'){
    const d=new Date(today.getFullYear(),today.getMonth()-1,1)
    const last=new Date(today.getFullYear(),today.getMonth(),0).getDate()
    return { startDate:ymd(d.getFullYear(),d.getMonth()+1,1), endDate:ymd(today.getFullYear(),today.getMonth(),last) }
  }
  if(preset==='last-3'){ const d=new Date(today); d.setMonth(d.getMonth()-3); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if(preset==='last-6'){ const d=new Date(today); d.setMonth(d.getMonth()-6); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if(preset==='last-12'){ const d=new Date(today); d.setFullYear(d.getFullYear()-1); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  return { startDate:ymd(fyY,fy,1), endDate:todayStr }
}
function presetLabel(p){
  return {'full-fiscal':'Full fiscal year','fiscal-ytd':'Fiscal YTD','full-operating':'Full operating year','operating-ytd':'Operating YTD','last-month':'Last month','last-3':'Last 3 months','last-6':'Last 6 months','last-12':'Last 12 months','custom':'Custom range'}[p]||'Date range'
}

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────────────────

function getIncomeInRange(incomeMonths, startDate, endDate){
  // Compare by YYYY-MM period prefix so mid-month end dates include the full end month
  const startP = startDate.slice(0,7)
  const endP   = endDate.slice(0,7)
  return incomeMonths.filter(m => {
    const p = m.period || (m.date ? m.date.slice(0,7) : null)
    return p && p >= startP && p <= endP
  })
}

function numMonthsInRange(startDate, endDate){
  // Parse directly from string to avoid UTC→local timezone shift
  const [sy,sm] = startDate.substring(0,7).split('-').map(Number)
  const [ey,em] = endDate.substring(0,7).split('-').map(Number)
  return (ey-sy)*12 + (em-sm) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Variance display helpers — match ELT dashboard exactly
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
  const Icon = delta>0 ? TrendingUp : delta<0 ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${varBg(delta,inverse)}`}>
      <Icon size={11}/>{label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterDatePicker
// ─────────────────────────────────────────────────────────────────────────────

function MasterDatePicker({ dateRange, onApplyPreset, onApplyCustom, onClose }){
  const { orgConfig } = useApp()
  const [start, setStart] = useState(dateRange.startDate||'')
  const [end,   setEnd]   = useState(dateRange.endDate||'')

  // Compute date-range sub-labels from org fiscal / operating year settings
  const fy  = orgConfig.fiscalYearStartMonth    || 10
  const fyY = orgConfig.fiscalYearStartYear     || 2025
  const oy  = orgConfig.operatingYearStartMonth || 5
  const oyY = orgConfig.operatingYearStartYear  || 2025
  const fyeY = fy===1?fyY:fyY+1, fyeM = fy===1?12:fy-1
  const oyeY = oy===1?oyY:oyY+1, oyeM = oy===1?12:oy-1
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mn = m => MN[m-1]

  const groups = [
    { label:'Fiscal Year', items:[
      ['full-fiscal',    'Full fiscal year',    `${mn(fy)} ${fyY} → ${mn(fyeM)} ${fyeY}`],
      ['fiscal-ytd',     'Fiscal YTD',          `${mn(fy)} ${fyY} → Today`],
    ]},
    { label:'Operating Year', items:[
      ['full-operating', 'Full operating year', `${mn(oy)} ${oyY} → ${mn(oyeM)} ${oyeY}`],
      ['operating-ytd',  'Operating YTD',       `${mn(oy)} ${oyY} → Today`],
    ]},
    { label:'Rolling', items:[
      ['last-month', 'Last month',    ''],
      ['last-3',     'Last 3 months', ''],
      ['last-6',     'Last 6 months', ''],
      ['last-12',    'Last 12 months',''],
    ]},
  ]

  return (
    <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-72 p-4">
      {groups.map(g=>(
        <div key={g.label} className="mb-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{g.label}</div>
          {g.items.map(([id,lbl,sub])=>(
            <button key={id} onClick={()=>{onApplyPreset(id);onClose()}}
              className={`w-full text-left px-3 py-1.5 rounded-lg hover:bg-teal-50 hover:text-teal-700 transition-colors ${dateRange.preset===id?'bg-teal-50 text-teal-700 font-semibold':''}`}>
              <div className="text-sm">{lbl}</div>
              {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
            </button>
          ))}
        </div>
      ))}
      <div className="border-t border-gray-100 pt-3 mt-2">
        <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Custom Range</div>
        <div className="flex gap-2 items-center mb-2">
          <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs"/>
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs"/>
        </div>
        <button onClick={()=>{ if(start&&end){ onApplyCustom(start,end); onClose() } }}
          className="w-full bg-teal-600 text-white rounded-lg py-1.5 text-sm font-semibold hover:bg-teal-700 transition-colors">
          Apply
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamMultiSelect — multi-select team pill dropdown for nav
// ─────────────────────────────────────────────────────────────────────────────

function TeamMultiSelect({ activeDepts, onToggle, onSelectAll, onClose }){
  const { deptNames } = useApp()
  const allDepts = Object.keys(deptNames)
  const allActive = !activeDepts || activeDepts.size === allDepts.length
  return (
    <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52 py-2">
      <button onClick={()=>{ onSelectAll(); onClose() }}
        className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${allActive?'font-semibold text-teal-700':''}`}>
        {allActive ? <CheckSquare size={14} className="text-teal-600"/> : <Square size={14} className="text-gray-300"/>}
        All Teams
      </button>
      <div className="border-t border-gray-100 my-1"/>
      {allDepts.map(code=>{
        const active = !activeDepts || activeDepts.has(code)
        const color  = DEPT_COLORS[code] || '#9BA8B5'
        return (
          <button key={code} onClick={()=>onToggle(code)}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0`}
              style={{ backgroundColor: active ? color : 'transparent', border:`2px solid ${color}` }}>
              {active && <Check size={9} className="text-white"/>}
            </div>
            <span className={active?'text-gray-800':'text-gray-400'}>{deptNames[code] || code}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterNav — 5 tabs, multi-select teams, date picker, scenario
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id:'overview',      label:'Overview' },
  { id:'breakdown',     label:'P&L Breakdown' },
  { id:'transactions',  label:'Transactions' },
  { id:'teams',         label:'Teams' },
  { id:'comments',      label:'Comments & Requests' },
  { id:'import',        label:'Import' },
]

function MasterNav({ activeTab, setActiveTab, dateRange, onApplyPreset, onApplyCustom,
  activeDepts, onToggleDept, onSelectAllDepts,
  activeBudget, availableScenarios, onSetBudget }){
  const [showDate,  setShowDate]  = useState(false)
  const [showTeam,  setShowTeam]  = useState(false)
  const [showBudget,setShowBudget]= useState(false)
  const navRef = useRef(null)

  useEffect(()=>{
    function handler(e){ if(navRef.current && !navRef.current.contains(e.target)){ setShowDate(false); setShowTeam(false); setShowBudget(false) } }
    document.addEventListener('mousedown', handler)
    return ()=>document.removeEventListener('mousedown', handler)
  },[])

  const { orgConfig, deptNames } = useApp()
  const allDepts  = Object.keys(deptNames)
  const allActive = !activeDepts || activeDepts.size === allDepts.length
  const teamLabel = allActive ? 'All Teams' : `${activeDepts.size} Team${activeDepts.size!==1?'s':''}`

  return (
    <header ref={navRef} className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-6 gap-4">

        {/* Left: org identity */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{backgroundColor:'var(--color-accent)'}}>
            {orgConfig.logoInitial || (orgConfig.name||'F').charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-gray-800">{orgConfig.name||'Finance'}</span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm font-medium text-gray-500">Admin</span>
        </div>

        {/* Center: pill tab navigation */}
        <nav className="flex-1 flex justify-center">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`px-4 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap
                  ${activeTab===t.id?'bg-gray-900 text-white shadow-sm':'text-gray-600 hover:text-gray-900'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Right: controls */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Team multi-select */}
          <div className="relative">
            <button onClick={()=>{ setShowTeam(p=>!p); setShowDate(false); setShowBudget(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors ${!allActive?'border-gray-900 bg-gray-900 text-white hover:bg-gray-800':'border-gray-200'}`}>
              <Building2 size={13}/>
              {teamLabel}
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showTeam && <TeamMultiSelect activeDepts={activeDepts} onToggle={code=>{ onToggleDept(code) }} onSelectAll={onSelectAllDepts} onClose={()=>setShowTeam(false)}/>}
          </div>

          {/* Budget scenario */}
          <div className="relative">
            <button onClick={()=>{ setShowBudget(p=>!p); setShowDate(false); setShowTeam(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">BUDGET</span>
              <span className="max-w-[100px] truncate">{activeBudget||'Budget'}</span>
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showBudget && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-56">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Budget Scenario</div>
                <div className="space-y-1">
                  {availableScenarios.length===0
                    ? <p className="text-xs text-gray-400 italic">No budget imported yet.</p>
                    : availableScenarios.map(s=>(
                      <button key={s} onClick={()=>{ onSetBudget(s); setShowBudget(false) }}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-all text-sm ${activeBudget===s?'bg-gray-900 text-white border-gray-900':'text-gray-800 border-gray-200 bg-white hover:border-gray-400'}`}>
                        {s}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          {/* Date range */}
          <div className="relative">
            <button onClick={()=>{ setShowDate(p=>!p); setShowBudget(false); setShowTeam(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">REPORTING PERIOD</span>
              <span>{presetLabel(dateRange.preset)}</span>
              <ChevronDown size={11} className="text-gray-400"/>
            </button>
            {showDate && <MasterDatePicker dateRange={dateRange} onApplyPreset={onApplyPreset} onApplyCustom={onApplyCustom} onClose={()=>setShowDate(false)}/>}
          </div>

          {/* Settings gear */}
          <button onClick={()=>setActiveTab('setup')}
            title="Setup"
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${activeTab==='setup'?'bg-gray-900 border-gray-900 text-white':'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            <Settings size={14}/>
          </button>

        </div>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance KPI Card — 15 data-wired cards
// ─────────────────────────────────────────────────────────────────────────────

function FinanceKPICard({ id, actuals, budgetFlat, scenario, incomeMonths,
  cashFlowData, patronData, dateRange, orgConfig, editMode, onRemove }){
  const { deptNames, comments } = useApp()
  const { startDate, endDate } = dateRange
  const startM = startDate.slice(0,7), endM = endDate.slice(0,7)
  const catalogDef = FINANCE_KPI_CATALOG.find(k => k.id === id)

  // ── Shared derived values ─────────────────────────────────────────────────
  const incInRange = useMemo(() =>
    getIncomeInRange(incomeMonths, startDate, endDate)
  , [incomeMonths, startDate, endDate])

  const expInRange = useMemo(() =>
    filterActualsByRange(actuals, startDate, endDate).filter(t => t.record_type !== 'income')
  , [actuals, startDate, endDate])

  const allInRange = useMemo(() =>
    filterActualsByRange(actuals, startDate, endDate)
  , [actuals, startDate, endDate])

  const totalGiving   = useMemo(() =>
    incInRange.reduce((s,m) => s + (m.contributions||0) + (m.merch||0) + (m.other||0), 0)
  , [incInRange])

  const totalExpenses = useMemo(() =>
    expInRange.reduce((s,t) => s + Math.abs(t.amount||0), 0)
  , [expInRange])

  const expBudget = useMemo(() =>
    budgetFlat.filter(b => b.scenario===scenario && b.record_type!=='income' && b.period>=startM && b.period<=endM)
      .reduce((s,b) => s+(b.amount||0), 0)
  , [budgetFlat, scenario, startM, endM])

  const incBudget = useMemo(() =>
    budgetFlat.filter(b => b.scenario===scenario && b.record_type==='income' && b.period>=startM && b.period<=endM)
      .reduce((s,b) => s+(b.amount||0), 0)
  , [budgetFlat, scenario, startM, endM])

  const latestCash = useMemo(() => {
    const rows = cashFlowData.filter(r => r.period>=startM && r.period<=endM)
      .sort((a,b) => a.period.localeCompare(b.period))
    return rows.length > 0 ? rows[rows.length-1] : null
  }, [cashFlowData, startM, endM])

  const patronInRange = useMemo(() =>
    patronData.filter(p => p.period>=startM && p.period<=endM)
      .sort((a,b) => a.period.localeCompare(b.period))
  , [patronData, startM, endM])

  const latestPatron = patronInRange.length > 0 ? patronInRange[patronInRange.length-1] : null

  // ── Per-card value + comparison rows ─────────────────────────────────────
  let mainValue = '—'
  let cmp1 = null   // { label, delta, base } — primary comparison
  let cmp2 = null   // secondary comparison
  let isInverse = false
  let subNote = null

  const makePct = (delta, base) =>
    base && Math.abs(base) > 0
      ? formatPercent(delta / Math.abs(base) * 100, {showSign:true, decimals:1})
      : '—'

  switch (id) {
    case 'total-giving': {
      mainValue = formatCurrency(totalGiving)
      if (incBudget > 0) cmp1 = { label:'vs Budget', delta: totalGiving - incBudget, base: incBudget }
      break
    }
    case 'total-expenses': {
      mainValue = formatCurrency(totalExpenses)
      isInverse = true
      // "good" direction = under budget (expBudget - totalExpenses positive = good)
      if (expBudget > 0) cmp1 = { label:'vs Budget', delta: expBudget - totalExpenses, base: expBudget }
      break
    }
    case 'net-position': {
      const net = totalGiving - totalExpenses
      mainValue = formatCurrency(net)
      const budgetNet = incBudget - expBudget
      if (Math.abs(budgetNet) > 0) cmp1 = { label:'vs Budget', delta: net - budgetNet, base: budgetNet }
      subNote = net >= 0 ? 'Surplus' : 'Deficit'
      break
    }
    case 'cash-position': {
      if (latestCash) {
        mainValue = formatCurrency(latestCash.cash_balance)
        if (latestCash.prior_month_balance)
          cmp1 = { label:'vs Prior Month', delta: latestCash.cash_balance - latestCash.prior_month_balance, base: latestCash.prior_month_balance }
        if (latestCash.prior_year_balance)
          cmp2 = { label:'vs Prior Year', delta: latestCash.cash_balance - latestCash.prior_year_balance, base: latestCash.prior_year_balance }
      }
      break
    }
    case 'cash-above-floor': {
      if (latestCash) {
        const floor = latestCash.reserve_floor || orgConfig?.reserveFloor || 0
        const above = latestCash.cash_balance - floor
        mainValue = formatCurrency(above)
        subNote = floor > 0 ? `Reserve floor: ${formatCurrency(floor)}` : null
        if (above < 0) subNote = `${formatCurrency(Math.abs(above))} below reserve floor`
      }
      break
    }
    case 'teams-over-budget': {
      // Build dept-code → team-name from budgetFlat (rows carry team_name from mapBudgetFlatDirect)
      const deptToTeam = {}
      for (const b of budgetFlat) {
        if (b.department && b.team_name) deptToTeam[b.department] = b.team_name
      }
      // All teams that have expense budget entries in the selected scenario+range
      const relevantBudget = budgetFlat.filter(b =>
        b.scenario===scenario && b.record_type!=='income' &&
        b.period && b.period>=startM && b.period<=endM && b.team_name
      )
      const allTeams = [...new Set(relevantBudget.map(b => b.team_name))]
      // Sum budget and actual per team
      const budByTeam = {}
      for (const b of relevantBudget) budByTeam[b.team_name] = (budByTeam[b.team_name]||0) + (b.amount||0)
      const actByTeam = {}
      for (const t of expInRange) {
        const tn = deptToTeam[t.department]
        if (tn) actByTeam[tn] = (actByTeam[tn]||0) + Math.abs(t.amount||0)
      }
      const overCount = allTeams.filter(tn => (actByTeam[tn]||0) > (budByTeam[tn]||0)).length
      mainValue = `${overCount} of ${allTeams.length}`
      isInverse = overCount > 0
      subNote = overCount === 0 ? 'All teams on budget ✓' : `${overCount} team${overCount!==1?'s':''} over budget`
      break
    }
    case 'total-supporters': {
      const total = latestPatron?.total_active_patrons || 0
      mainValue = total > 0 ? total.toLocaleString() : '—'
      subNote = latestPatron ? `as of ${latestPatron.period}` : 'No patron data'
      break
    }
    case 'new-supporters': {
      const newTotal = patronInRange.reduce((s,p) => s + (p.new_patrons_total||0), 0)
      mainValue = newTotal > 0 ? newTotal.toLocaleString() : '—'
      subNote = `${patronInRange.length} month${patronInRange.length!==1?'s':''} in range`
      break
    }
    case 'avg-gift': {
      mainValue = latestPatron?.avg_gift_size > 0 ? formatCurrency(latestPatron.avg_gift_size) : '—'
      subNote = latestPatron ? `as of ${latestPatron.period}` : 'No patron data'
      break
    }
    case 'recurring-patrons': {
      const count = latestPatron?.recurring_patron_count || 0
      mainValue = count > 0 ? count.toLocaleString() : '—'
      const totalBase = latestPatron?.total_active_patrons || 0
      subNote = totalBase > 0 ? `${Math.round(count/totalBase*100)}% of active base` : 'No patron data'
      break
    }
    case 'recurring-giving': {
      // Recurring giving breakdown not tracked in current import — show patron count
      const recPatrons = patronInRange.reduce((s,p) => s + (p.new_patrons_recurring||0), 0)
      mainValue = recPatrons > 0 ? `${recPatrons.toLocaleString()} new` : '—'
      subNote = 'New recurring patrons in range'
      break
    }
    case 'spontaneous-giving': {
      const spPatrons = patronInRange.reduce((s,p) => s + (p.new_patrons_spontaneous||0), 0)
      mainValue = spPatrons > 0 ? `${spPatrons.toLocaleString()} new` : '—'
      subNote = 'New spontaneous patrons in range'
      break
    }
    case 'total-transactions': {
      mainValue = allInRange.length.toLocaleString()
      subNote = 'transactions in range'
      break
    }
    case 'budget-utilization': {
      const pct = expBudget > 0 ? totalExpenses / expBudget * 100 : 0
      mainValue = expBudget > 0 ? `${pct.toFixed(1)}%` : '—'
      isInverse = pct > 100
      subNote = expBudget > 0 ? `${formatCurrency(totalExpenses)} of ${formatCurrency(expBudget)}` : 'No budget data'
      break
    }
    case 'open-comments': {
      const open = (comments||[]).filter(c => c.status !== 'resolved' && c.status !== 'closed').length
      mainValue = open.toLocaleString()
      subNote = `${(comments||[]).length} total`
      break
    }
    default:
      mainValue = '—'
  }

  // ── Comparison row renderer ───────────────────────────────────────────────
  function CmpRow({ cmp }) {
    if (!cmp) return null
    const pct = makePct(cmp.delta, cmp.base)
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">{cmp.label}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <TrendBadge delta={cmp.delta} inverse={isInverse} label={pct}/>
          <span className={`text-sm font-semibold ${varColor(cmp.delta, isInverse)}`}>
            {cmp.delta >= 0 ? '+' : ''}{formatCurrency(cmp.delta)}
          </span>
          <span className="text-xs text-gray-400">vs {formatCurrency(cmp.base)}</span>
        </div>
      </div>
    )
  }

  const isDark = id === 'net-position'

  return (
    <div className={`relative rounded-2xl p-5 ${isDark ? '' : 'bg-white border border-gray-100'}`}
      style={{
        ...(isDark ? {backgroundColor:'var(--ink-900)',border:'1px solid var(--ink-800)'} : {}),
        boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
      }}>
      {editMode && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
          style={isDark
            ? {backgroundColor:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)'}
            : {backgroundColor:'#F3F4F6',color:'#9CA3AF'}}>
          <X size={11}/>
        </button>
      )}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1"
        style={{color: isDark ? 'rgba(255,255,255,0.45)' : 'var(--neutral-60)'}}>{catalogDef?.label || id}</div>
      <div className="text-3xl font-bold mb-3" style={{color: isDark ? '#FFFFFF' : '#111827'}}>{mainValue}</div>
      {(cmp1 || cmp2) && (
        <div className="space-y-2.5">
          <CmpRow cmp={cmp1}/>
          <CmpRow cmp={cmp2}/>
        </div>
      )}
      {subNote && (
        <div className="text-xs mt-2" style={{color: isDark ? 'rgba(255,255,255,0.45)' : (isInverse && id==='teams-over-budget' ? '#EF4444' : '#9CA3AF')}}>
          {subNote}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Finance KPI Panel — catalog browser
// ─────────────────────────────────────────────────────────────────────────────

function AddFinanceKPIPanel({ existingIds, onAdd, onClose }) {
  // Group catalog by group key
  const grouped = useMemo(() => {
    const m = {}
    FINANCE_KPI_CATALOG.forEach(k => {
      if (!m[k.group]) m[k.group] = []
      m[k.group].push(k)
    })
    return m
  }, [])

  const hasAvailable = FINANCE_KPI_CATALOG.some(k => !existingIds.includes(k.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[480px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Add KPI Card</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!hasAvailable && (
            <p className="text-sm text-gray-400 text-center py-6">All cards are already visible.</p>
          )}
          {Object.entries(grouped).map(([group, cards]) => {
            const available = cards.filter(k => !existingIds.includes(k.id))
            if (available.length === 0) return null
            return (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{color:'var(--neutral-60)'}}>{group}</div>
                <div className="space-y-1.5">
                  {available.map(card => (
                    <button key={card.id} onClick={() => { onAdd(card.id); onClose() }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all group">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{card.label}</span>
                        <Plus size={14} className="text-gray-300 group-hover:text-gray-600 flex-shrink-0 transition-colors"/>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recharts preset chart renderer — fixed, explicit heights
// ─────────────────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = { fontSize:11, borderRadius:8, border:'1px solid #E5E7EB', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }
const fmtK = v => v>=1000?`$${(v/1000).toFixed(1)}M`:`$${v}K`
const axisStyle = { fontSize:10, fill:'#9CA3AF' }

// (PresetChartRender removed — replaced by 4 hardwired chart components below)

// ─────────────────────────────────────────────────────────────────────────────
// Chart Panel wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartPanel({ title, subtitle, editMode, onRemove, children }){
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      {editMode && onRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center z-10">
          <X size={11}/>
        </button>
      )}
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>{title}</div>
        {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance Overview — 4 preset chart components
// ─────────────────────────────────────────────────────────────────────────────

function periodLabel(ym){ // 'YYYY-MM' → 'Jan'
  if(!ym) return ''
  const [y,m] = ym.split('-')
  return new Date(parseInt(y),parseInt(m)-1,1).toLocaleString('en-US',{month:'short'})
}

function fmtCompact(v){ // raw dollars → compact string
  if(v==null) return '—'
  const abs=Math.abs(v)
  if(abs>=1e6) return `$${(v/1e6).toFixed(1)}M`
  if(abs>=1e3) return `$${(v/1e3).toFixed(0)}K`
  return `$${Math.round(v)}`
}

// Chart 1: Monthly Spend vs Planned — full width, line chart, with stats + toggle
function SpendVsPlannedCard({ actuals, budgetFlat, scenario, dateRange }){
  const [mode, setMode] = useState('monthly')
  const { startDate, endDate } = dateRange
  const startP = startDate.slice(0,7), endP = endDate.slice(0,7)

  const expActuals = useMemo(()=>
    filterActualsByRange(actuals,startDate,endDate).filter(t=>t.record_type!=='income')
  ,[actuals,startDate,endDate])

  const expBudget = useMemo(()=>
    budgetFlat.filter(b=>b.scenario===scenario && b.record_type!=='income')
  ,[budgetFlat,scenario])

  const chartData = useMemo(()=>{
    const actualByP={}, budgetByP={}
    for(const t of expActuals){
      const p=t.period||(t.date?t.date.slice(0,7):null); if(!p) continue
      actualByP[p]=(actualByP[p]||0)+Math.abs(t.amount||0)
    }
    for(const b of expBudget){
      if(b.period) budgetByP[b.period]=(budgetByP[b.period]||0)+Math.abs(b.amount||0)
    }
    const periods=[...new Set([...Object.keys(actualByP),...Object.keys(budgetByP)])]
      .filter(p=>p>=startP&&p<=endP).sort()
    let cumA=0,cumB=0
    return periods.map(p=>{
      const a=actualByP[p]||0, b=budgetByP[p]||0
      cumA+=a; cumB+=b
      return { period:p, label:periodLabel(p),
        actual: mode==='cumulative'?cumA:a,
        budget: mode==='cumulative'?cumB:b }
    })
  },[expActuals,expBudget,startP,endP,mode])

  const totalActual = useMemo(()=>expActuals.reduce((s,t)=>s+Math.abs(t.amount||0),0),[expActuals])
  const totalBudget = useMemo(()=>expBudget.filter(b=>b.period>=startP&&b.period<=endP).reduce((s,b)=>s+Math.abs(b.amount||0),0),[expBudget,startP,endP])
  const delta = totalActual - totalBudget
  const avgMonthly = chartData.length>0 ? expActuals.reduce((s,t)=>s+Math.abs(t.amount||0),0)/chartData.length : 0
  const peakRow = [...chartData].sort((a,b)=>b.actual-a.actual)[0]

  const grid=<CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
  const xa=<XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false}/>
  const ya=<YAxis tick={axisStyle} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={56}/>
  const tip=<Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>[fmtCompact(v)]}/>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Monthly Spend vs Planned</div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {['monthly','cumulative'].map(m=>(
            <button key={m} onClick={()=>setMode(m)}
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${mode===m?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {m==='monthly'?'Monthly':'Cumulative'}
            </button>
          ))}
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4 pb-4 border-b border-gray-100">
        {[
          {label:'Period Spend', val:fmtCompact(totalActual), cls:'text-gray-900'},
          {label:'Planned Spend', val:fmtCompact(totalBudget), cls:'text-gray-900'},
          {label:'Over / Under', val:(delta>0?'+':'')+fmtCompact(Math.abs(delta)), cls:delta>0?'text-red-600':'text-teal-600'},
          {label:'Monthly Avg', val:fmtCompact(avgMonthly), cls:'text-gray-900'},
          {label:'Peak Month', val:peakRow?.label||'—', sub:peakRow?fmtCompact(peakRow.actual):null, cls:'text-gray-900'},
        ].map(s=>(
          <div key={s.label}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{s.label}</div>
            <div className={`text-sm font-bold ${s.cls}`}>{s.val}</div>
            {s.sub&&<div className="text-[10px] text-gray-400">{s.sub}</div>}
          </div>
        ))}
      </div>
      {/* Chart */}
      {chartData.length===0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No data in range</div>
        : <div style={{height:200}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                {grid}{xa}{ya}{tip}
                <Legend wrapperStyle={{fontSize:10,paddingTop:6}}/>
                <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{r:4}}/>
                <Line type="monotone" dataKey="budget" name="Budget" stroke="#E8A838" strokeWidth={2} strokeDasharray="6 3" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
      }
    </div>
  )
}

// Chart 2: Net Position by Month — bar chart, green/red conditional coloring
function NetPositionCard({ actuals, incomeMonths, dateRange }){
  const { startDate, endDate } = dateRange
  const startP=startDate.slice(0,7), endP=endDate.slice(0,7)

  const chartData = useMemo(()=>{
    const incRange = getIncomeInRange(incomeMonths,startDate,endDate)
    const expRange = filterActualsByRange(actuals,startDate,endDate).filter(t=>t.record_type!=='income')
    const expByP={}
    for(const t of expRange){
      const p=t.period||(t.date?t.date.slice(0,7):null); if(!p) continue
      expByP[p]=(expByP[p]||0)+Math.abs(t.amount||0)
    }
    const incByP={}
    for(const m of incRange){
      const p=m.period||(m.date?m.date.slice(0,7):null); if(!p) continue
      incByP[p]=(incByP[p]||0)+(m.contributions+m.merch+m.other)
    }
    const periods=[...new Set([...Object.keys(incByP),...Object.keys(expByP)])]
      .filter(p=>p>=startP&&p<=endP).sort()
    return periods.map(p=>({ period:p, label:periodLabel(p), net:(incByP[p]||0)-(expByP[p]||0) }))
  },[actuals,incomeMonths,startDate,endDate,startP,endP])

  const grid=<CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
  const xa=<XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false}/>
  const ya=<YAxis tick={axisStyle} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={56}/>
  const tip=<Tooltip contentStyle={TOOLTIP_STYLE} formatter={v=>[fmtCompact(v),'Net']}/>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{color:'var(--neutral-60)'}}>Net Position by Month</div>
      {chartData.length===0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No data in range</div>
        : <div style={{height:180}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                {grid}{xa}{ya}{tip}
                <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="0" label={{ value:'$0', position:'insideLeft', fontSize:9, fill:'#9CA3AF', dy:-6 }}/>
                <Bar dataKey="net" radius={[3,3,0,0]}>
                  {chartData.map((d,i)=><Cell key={i} fill={d.net>=0?'#10B981':'#EF4444'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
      }
    </div>
  )
}

// Chart 3: Cash Position Over Time — line chart, cash_balance + reserve_floor
function CashPositionCard({ cashFlowData, dateRange }){
  const { startDate, endDate } = dateRange
  const startP=startDate.slice(0,7), endP=endDate.slice(0,7)

  const chartData = useMemo(()=>
    cashFlowData
      .filter(r=>r.period>=startP&&r.period<=endP)
      .sort((a,b)=>a.period.localeCompare(b.period))
      .map(r=>({ label:periodLabel(r.period), cash:r.cash_balance, floor:r.reserve_floor }))
  ,[cashFlowData,startP,endP])

  const grid=<CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
  const xa=<XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false}/>
  const ya=<YAxis tick={axisStyle} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={56}/>
  const tip=<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v,n)=>[fmtCompact(v),n]}/>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{color:'var(--neutral-60)'}}>Cash Position</div>
      {chartData.length===0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No cash flow data</div>
        : <div style={{height:180}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                {grid}{xa}{ya}{tip}
                <Legend wrapperStyle={{fontSize:10,paddingTop:6}}/>
                <Line type="monotone" dataKey="cash"  name="Cash Balance"   stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{r:4}}/>
                <Line type="monotone" dataKey="floor" name="Reserve Floor"  stroke="#EF4444" strokeWidth={1.5} strokeDasharray="6 3" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
      }
    </div>
  )
}

// Chart 4: Team Spend Comparison — stacked bar chart, one segment per team
function TeamSpendCard({ actuals, dateRange }){
  const { startDate, endDate } = dateRange
  const startP=startDate.slice(0,7), endP=endDate.slice(0,7)

  const { chartData, teams } = useMemo(()=>{
    const expRange = filterActualsByRange(actuals,startDate,endDate).filter(t=>t.record_type!=='income')
    // group by period + team_name (not department — keeps 8 series not 24)
    const byPeriodTeam={}
    const teamSet=new Set()
    for(const t of expRange){
      const p=t.period||(t.date?t.date.slice(0,7):null); if(!p) continue
      if(p<startP||p>endP) continue
      const team=t.team_name||'Unknown'
      teamSet.add(team)
      if(!byPeriodTeam[p]) byPeriodTeam[p]={}
      byPeriodTeam[p][team]=(byPeriodTeam[p][team]||0)+Math.abs(t.amount||0)
    }
    const teams=[...teamSet].sort()
    const data=Object.entries(byPeriodTeam).sort(([a],[b])=>a.localeCompare(b)).map(([p,tm])=>({
      label:periodLabel(p), ...tm
    }))
    return { chartData:data, teams }
  },[actuals,startDate,endDate,startP,endP])

  const grid=<CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
  const xa=<XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false}/>
  const ya=<YAxis tick={axisStyle} tickFormatter={fmtCompact} axisLine={false} tickLine={false} width={56}/>
  const tip=<Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v,n)=>[fmtCompact(v),n]}/>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{color:'var(--neutral-60)'}}>Team Spend Comparison</div>
      {chartData.length===0
        ? <div className="flex items-center justify-center h-44 text-gray-300 text-xs">No data in range</div>
        : <div style={{height:180}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                {grid}{xa}{ya}{tip}
                <Legend wrapperStyle={{fontSize:10,paddingTop:6}}/>
                {teams.map((t,i)=>(
                  <Bar key={t} dataKey={t} name={t} stackId="a"
                    fill={TEAM_PALETTE[i%TEAM_PALETTE.length]} radius={i===teams.length-1?[3,3,0,0]:[0,0,0,0]}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Watch Area Panel
// ─────────────────────────────────────────────────────────────────────────────

function WatchAreaPanel({ actuals, budgetFlat, scenario, dateRange, editMode, onRemove }){
  const { startDate, endDate } = dateRange
  const inRange = useMemo(()=>filterActualsByRange(actuals,startDate,endDate),[actuals,startDate,endDate])
  const budgetByCat = useMemo(()=>calcBudgetByCategory(budgetFlat,scenario,startDate,endDate),[budgetFlat,scenario,startDate,endDate])
  const byCat = useMemo(()=>inRange.reduce((acc,t)=>{ acc[t.category]=(acc[t.category]||0)+t.amount; return acc },{}), [inRange])

  const alerts = useMemo(()=>
    Object.entries(budgetByCat)
      .map(([cat,bud])=>({ cat, bud, actual:byCat[cat]||0, pct:bud>0?((byCat[cat]||0)/bud*100):0 }))
      .filter(r=>r.pct>=80)
      .sort((a,b)=>b.pct-a.pct)
      .slice(0,5)
  ,[budgetByCat,byCat])

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{color:'var(--neutral-60)'}}>Budget Watch Areas</div>
      {alerts.length===0 && <div className="text-xs text-gray-400 text-center py-4">All categories under 80% of budget</div>}
      {alerts.map(({cat,bud,actual,pct})=>(
        <div key={cat} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pct>=100?'bg-red-500':pct>=90?'bg-orange-400':'bg-amber-400'}`}/>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-700 truncate">{cat}</div>
            <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
              <div className="h-1 rounded-full" style={{width:`${Math.min(pct,100)}%`, backgroundColor:pct>=100?'#EF4444':pct>=90?'#F97316':'#F59E0B'}}/>
            </div>
          </div>
          <div className="text-xs font-semibold flex-shrink-0" style={{color:pct>=100?'#EF4444':pct>=90?'#F97316':'#F59E0B'}}>{Math.round(pct)}%</div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Patron Watch Areas Panel
// ─────────────────────────────────────────────────────────────────────────────

function PatronWatchAreaPanel({ patronData, dateRange }){
  const { startDate, endDate } = dateRange
  const startM = startDate.slice(0,7), endM = endDate.slice(0,7)

  const signals = useMemo(()=>{
    const inRange = patronData
      .filter(p => p.period >= startM && p.period <= endM)
      .sort((a,b) => a.period.localeCompare(b.period))

    if (inRange.length < 2) return []

    const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    function mLabel(period){ const [y,m] = period.split('-'); return MN[parseInt(m)-1]+' '+y }

    const alerts = []

    // Signal 1 — Declining new patrons for 2+ consecutive months
    let consecutiveDecline = 0
    let declineMonths = []
    for (let i = 1; i < inRange.length; i++) {
      const prev = inRange[i-1].new_patrons_total || 0
      const curr = inRange[i].new_patrons_total || 0
      if (curr < prev) {
        consecutiveDecline++
        if (consecutiveDecline === 1) declineMonths = [inRange[i-1].period, inRange[i].period]
        else declineMonths[1] = inRange[i].period
      } else {
        consecutiveDecline = 0
        declineMonths = []
      }
    }
    if (consecutiveDecline >= 2) {
      alerts.push({
        id: 'new-declining',
        color: 'amber',
        msg: `New patron acquisition declining — ${mLabel(declineMonths[0])} and ${mLabel(declineMonths[1])} both below prior month pace.`,
      })
    }

    // Signal 2 — Retention rate dropped > 3pp below trailing 6-month avg
    const allPatronData = patronData.filter(p => p.retention_rate != null)
      .sort((a,b) => a.period.localeCompare(b.period))
    const latest = allPatronData[allPatronData.length - 1]
    if (latest) {
      const trailing6 = allPatronData.slice(-7, -1) // 6 months before latest
      if (trailing6.length >= 3) {
        const avg = trailing6.reduce((s,p)=>s+(p.retention_rate||0),0) / trailing6.length
        const curr = latest.retention_rate || 0
        if (avg - curr > 3) {
          alerts.push({
            id: 'retention-drop',
            color: 'amber',
            msg: `Retention rate dropped to ${curr.toFixed(1)}% — below ${avg.toFixed(1)}% trailing average.`,
          })
        }
      }
    }

    // Signal 3 — Avg gift size declining for 2+ consecutive months
    let giftDecline = 0
    let giftMonths = []
    for (let i = 1; i < inRange.length; i++) {
      const prev = inRange[i-1].avg_gift_size || 0
      const curr = inRange[i].avg_gift_size || 0
      if (prev > 0 && curr < prev) {
        giftDecline++
        if (giftDecline === 1) giftMonths = [inRange[i-1], inRange[i]]
        else giftMonths[1] = inRange[i]
      } else {
        giftDecline = 0
        giftMonths = []
      }
    }
    if (giftDecline >= 2) {
      const cur = giftMonths[1]?.avg_gift_size || 0
      const pri = giftMonths[0]?.avg_gift_size || 0
      alerts.push({
        id: 'gift-declining',
        color: 'amber',
        msg: `Avg gift size trending down — ${fmtCompact(cur)} vs ${fmtCompact(pri)} prior month.`,
      })
    }

    return alerts
  }, [patronData, startM, endM])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{color:'var(--neutral-60)'}}>Patron Watch Areas</div>
      {signals.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"/>
          Patron metrics on track — no watch areas.
        </div>
      ) : signals.map(s => (
        <div key={s.id} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1"/>
          <p className="text-xs text-gray-700 leading-relaxed">{s.msg}</p>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab — three independently-editable sections
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ actuals, budgetFlat, scenario, incomeMonths, dateRange }){
  const { orgConfig } = useApp()
  // v2 key — resets any saved 15-card layout to the new 9-card default
  const [visibleKPIs, setVisibleKPIs] = useLocalStorage('finance-kpi-v2-ids', DEFAULT_FINANCE_KPI_IDS)
  const [editKPI,     setEditKPI]     = useState(false)
  const [showAddKPI,  setShowAddKPI]  = useState(false)
  const [editWatch,   setEditWatch]   = useState(false)

  // Drag-to-reorder state
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  // Remote data fetches (once on mount)
  const [cashFlowData, setCashFlowData] = useState([])
  const [patronData,   setPatronData]   = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('v_cash_flow_enriched').select('*').eq('org_id', ORG_ID),
      supabase.from('patron_data').select('*').eq('org_id', ORG_ID),
    ]).then(([cashRes, patronRes]) => {
      setCashFlowData(cashRes.data || [])
      setPatronData(patronRes.data || [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag handlers
  function handleDragStart(i){ setDragIdx(i) }
  function handleDragOver(e, i){ e.preventDefault(); setDropIdx(i) }
  function handleDrop(i){
    if(dragIdx===null || dragIdx===i){ setDragIdx(null); setDropIdx(null); return }
    const next = [...visibleKPIs]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    setVisibleKPIs(next)
    setDragIdx(null); setDropIdx(null)
  }

  const kpiProps = { actuals, budgetFlat, scenario, incomeMonths, cashFlowData, patronData, dateRange, orgConfig }

  // Split visibleKPIs into two display rows by group membership
  // Row 1 = financial health cards; Row 2 = supporter health cards; overflow → Row 1
  const row1Ids = visibleKPIs.filter(id => !SUPPORTER_KPI_IDS.includes(id) || FINANCIAL_KPI_IDS.includes(id))
    .filter(id => !SUPPORTER_KPI_IDS.includes(id))
  const row2Ids = visibleKPIs.filter(id => SUPPORTER_KPI_IDS.includes(id))
  // any extra ids (non-standard) go into row1
  const extraIds = visibleKPIs.filter(id => !FINANCIAL_KPI_IDS.includes(id) && !SUPPORTER_KPI_IDS.includes(id))
  const allRow1 = [...row1Ids, ...extraIds]

  function KPIRow({ ids, rowStartIndex }) {
    if (ids.length === 0) return null
    return (
      <div className="grid gap-4" style={{gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))'}}>
        {ids.map((id) => {
          const i = visibleKPIs.indexOf(id)
          return (
            <div key={id}
              draggable={editKPI}
              onDragStart={()=>handleDragStart(i)}
              onDragOver={e=>handleDragOver(e,i)}
              onDrop={()=>handleDrop(i)}
              onDragEnd={()=>{ setDragIdx(null); setDropIdx(null) }}
              className={`relative transition-opacity ${editKPI?'cursor-grab active:cursor-grabbing':''} ${dragIdx===i?'opacity-40':''}`}>
              {editKPI && dropIdx===i && dragIdx!==null && dragIdx!==i && (
                <div className="absolute -top-1 left-0 right-0 h-0.5 bg-gray-900 rounded-full z-10"/>
              )}
              {editKPI && (
                <div className="absolute top-3 left-3 z-10 opacity-30 pointer-events-none">
                  <GripVertical size={13} className="text-gray-600"/>
                </div>
              )}
              <FinanceKPICard id={id} {...kpiProps} editMode={editKPI}
                onRemove={()=>setVisibleKPIs(p=>p.filter(v=>v!==id))}/>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8" style={{backgroundColor:'var(--color-primary-bg)'}}>

      {/* ── KPI Section ── */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Key Metrics</span>
          <div className="flex items-center gap-2">
            {editKPI && (
              <button onClick={()=>setShowAddKPI(true)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
                <Plus size={11}/> Add Card
              </button>
            )}
            <button onClick={()=>setEditKPI(p=>!p)}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${editKPI?'bg-gray-900 border-gray-900 text-white':'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
              <Edit2 size={11}/> {editKPI?'Done':'Edit'}
            </button>
          </div>
        </div>

        {visibleKPIs.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10 bg-white rounded-2xl border border-gray-100">
            No cards visible. Click <strong>Edit → Add Card</strong> to add some.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Row 1 — Financial Health */}
            {allRow1.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-3">Financial Health</div>
                <KPIRow ids={allRow1} rowStartIndex={0}/>
              </div>
            )}
            {/* Row 2 — Supporter Health */}
            {row2Ids.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-3">Supporter Health</div>
                <KPIRow ids={row2Ids} rowStartIndex={allRow1.length}/>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Charts Section ── */}
      <section>
        <div className="mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Charts</span>
        </div>
        {/* Chart 1: full-width spend vs planned */}
        <SpendVsPlannedCard actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange}/>
        {/* Charts 2 & 3: side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <NetPositionCard actuals={actuals} incomeMonths={incomeMonths} dateRange={dateRange}/>
          <CashPositionCard cashFlowData={cashFlowData} dateRange={dateRange}/>
        </div>
        {/* Team Spend chart moved to Teams tab */}
      </section>

      {/* ── Watch Areas Section ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Watch Areas</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-2xl">
          <WatchAreaPanel actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange} editMode={false} onRemove={()=>{}}/>
          <PatronWatchAreaPanel patronData={patronData} dateRange={dateRange}/>
        </div>
      </section>

      {/* ── Add KPI Modal ── */}
      {showAddKPI && (
        <AddFinanceKPIPanel
          existingIds={visibleKPIs}
          onAdd={id => setVisibleKPIs(p => [...p, id])}
          onClose={() => setShowAddKPI(false)}/>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown Tab — replaces P&L + Teams; mirrors BreakdownPage logic
// ─────────────────────────────────────────────────────────────────────────────

function DeptStatusCards({ actuals, budgetFlat, scenario, dateRange, activeDepts }){
  const { deptNames } = useApp()
  const { startDate, endDate } = dateRange
  const inRange = useMemo(()=>filterActualsByRange(actuals,startDate,endDate),[actuals,startDate,endDate])

  const allDepts = Object.keys(deptNames)
  const depts    = activeDepts ? [...activeDepts] : allDepts

  const startM = startDate.substring(0,7)
  const endM   = endDate.substring(0,7)

  const cards = useMemo(()=>depts.map(code=>{
    const dActuals = inRange.filter(t=>t.department===code)
    const actual   = dActuals.reduce((s,t)=>s+t.amount,0)
    // Budget: sum rows for this dept (handles period-based and legacy shapes)
    const dBudgetRows = budgetFlat.filter(b=>b.scenario===scenario && b.department===code)
    const n = numMonthsInRange(startDate,endDate)
    const budget = dBudgetRows.reduce((s,b)=>{
      if(b.period != null) return b.period >= startM && b.period <= endM ? s + (b.amount||0) : s
      return s + (b.monthlyAmount||0) * n
    }, 0)
    const pct = budget>0 ? Math.round(actual/budget*100) : null
    const delta = actual - budget
    return { code, actual, budget, pct, delta }
  }),[depts,inRange,budgetFlat,scenario,startDate,endDate,startM,endM])

  return (
    <div className="flex gap-3 px-5 py-3 border-b border-gray-100 overflow-x-auto">
      {cards.map(({code,actual,budget,pct,delta})=>{
        const color = DEPT_COLORS[code]||'#9BA8B5'
        const over  = delta>0
        return (
          <div key={code} className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 px-4 py-3 min-w-[170px]"
            style={{borderLeftColor:color,borderLeftWidth:3,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color}}>{deptNames[code]||code}</div>
            <div className="text-base font-bold text-gray-900">{formatCurrency(actual)}</div>
            <div className="text-[11px] text-gray-400">{budget>0?`of ${formatCurrency(budget)}`:'No budget'}</div>
            {pct!==null && (
              <div className="flex items-center gap-1 mt-1">
                <div className="flex-1 bg-gray-100 rounded-full h-1">
                  <div className="h-1 rounded-full" style={{width:`${Math.min(pct,100)}%`,backgroundColor:over?'#EF4444':color}}/>
                </div>
                <span className="text-[10px] font-semibold" style={{color:over?'#EF4444':'#10B981'}}>{pct}%</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// DrillOrderBar (master version)
function MasterDrillOrderBar({ drillOrder, setDrillOrder, openPath, setOpenPath, searchQuery, setSearchQuery, viewMode, setViewMode }){
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const inactive = ALL_DRILL_FIELDS.filter(f=>!drillOrder.includes(f))

  function handleDragStart(e,i){ setDragIdx(i); e.dataTransfer.effectAllowed='move' }
  function handleDragOver(e,i){ e.preventDefault(); setDropIdx(i) }
  function handleDrop(e,i){
    e.preventDefault()
    if(dragIdx===null||dragIdx===i){ setDragIdx(null); setDropIdx(null); return }
    const next=[...drillOrder]; const [mv]=next.splice(dragIdx,1); next.splice(i,0,mv)
    setDrillOrder(next); setOpenPath([]); setDragIdx(null); setDropIdx(null)
  }
  function removeField(f){ setDrillOrder(drillOrder.filter(x=>x!==f)); setOpenPath([]) }
  function addField(f){ setDrillOrder([...drillOrder,f]); setOpenPath([]) }
  function reset(){ setDrillOrder(['department','category','account','vendor']); setOpenPath([]) }

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white flex-wrap">
      {/* Search */}
      <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 w-52 flex-shrink-0">
        <Search size={12} className="text-gray-400"/>
        <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search…"
          className="text-sm bg-transparent outline-none w-full text-gray-700 placeholder-gray-400"/>
        {searchQuery && <button onClick={()=>setSearchQuery('')} className="text-gray-400 hover:text-gray-600"><X size={10}/></button>}
      </div>
      <div className="w-px h-5 bg-gray-200"/>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">Drill Order</span>
      {/* Draggable pills */}
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        {drillOrder.map((field,idx)=>(
          <div key={field} draggable onDragStart={e=>handleDragStart(e,idx)} onDragOver={e=>handleDragOver(e,idx)} onDrop={e=>handleDrop(e,idx)} onDragEnd={()=>{ setDragIdx(null); setDropIdx(null) }} className="relative">
            {dropIdx===idx && dragIdx!==null && dragIdx!==idx && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-teal-500 rounded-full"/>}
            <div className={`flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-xs font-semibold border cursor-grab ${dragIdx===idx?'opacity-40':''}`}
              style={{backgroundColor:FIELD_COLORS[field]+'20',borderColor:FIELD_COLORS[field]+'60',color:FIELD_COLORS[field]}}>
              <GripVertical size={10} className="opacity-60"/>
              {FIELD_LABELS[field]}
              <button onClick={()=>removeField(field)} className="opacity-60 hover:opacity-100 ml-0.5"><X size={9}/></button>
            </div>
          </div>
        ))}
        {inactive.length>0 && (
          <div className="relative group">
            <button className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-gray-400">
              <Plus size={10}/> Add
            </button>
            <div className="hidden group-hover:block absolute left-0 top-7 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 w-36">
              {inactive.map(f=>(
                <button key={f} onClick={()=>addField(f)} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  {FIELD_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><RotateCcw size={10}/>Reset</button>
      </div>
      {/* View toggle */}
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
        {[['summary','List'],['calendar','Calendar']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setViewMode(id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode===id?'bg-teal-600 text-white':'text-gray-500 hover:bg-gray-50'}`}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

// Breakdown table: GroupRow
function MasterGroupRow({ row, onToggle, onHide }){
  const delta = row.budget!==null ? row.actual - row.budget : null
  const isOver = delta!==null && delta>=0
  const pct = row.budget ? Math.round(row.actual/row.budget*100) : null
  const indent = 12 + row.depth*20
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 group cursor-pointer hover:bg-gray-50 transition-colors"
      style={{paddingLeft:indent,paddingRight:16,paddingTop:9,paddingBottom:9,opacity:row.isDimmed?0.35:1}}
      onClick={()=>onToggle(row.depth,row.value)}>
      <div className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform ${row.isExpanded?'rotate-90':''}`}>
        <ChevronRight size={12} className="text-gray-400"/>
      </div>
      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
        style={{backgroundColor:FIELD_COLORS[row.field]+'20',color:FIELD_COLORS[row.field]}}>
        {FIELD_LABELS[row.field]}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-gray-800 truncate">{row.value}</span>
        <button onClick={e=>{ e.stopPropagation(); onHide(row.field,row.value) }}
          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"><Ban size={10}/></button>
      </div>
      <div className="text-right flex-shrink-0 font-semibold text-gray-800 text-sm w-24">{formatCurrency(row.actual)}</div>
      <div className="text-right flex-shrink-0 text-gray-400 text-sm w-24">{row.budget>0?formatCurrency(row.budget):'—'}</div>
      <div className="text-right flex-shrink-0 w-28">
        {delta!==null ? (
          <div>
            <div className="text-sm font-bold" style={{color:isOver?'var(--color-over)':'var(--color-under)'}}>{formatOverUnder(delta)}</div>
            {pct!==null&&<div className="text-[10px] text-gray-400">{pct}% used</div>}
          </div>
        ) : <span className="text-gray-300">—</span>}
      </div>
    </div>
  )
}

function MasterTxRow({ row, onSelect }){
  const t = row.item
  const indent = 12 + row.depth*20
  return (
    <div className="flex items-center gap-3 border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
      style={{paddingLeft:indent,paddingRight:16,paddingTop:7,paddingBottom:7}}
      onClick={()=>onSelect(t)}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-800 truncate">{t.vendor}</div>
        <div className="text-[10px] text-gray-400">{t.date}{t.description&&` · ${t.description}`}</div>
      </div>
      <div className="text-sm font-semibold text-gray-700 flex-shrink-0 w-24 text-right">{formatCurrency(t.amount)}</div>
      <div className="w-24 flex-shrink-0"/>
      <div className="w-28 flex-shrink-0"/>
    </div>
  )
}

function MasterTableHeader({ drillOrder, scenario, sortCol, sortDir, onSort }){
  const SortBtn = ({col,children})=>(
    <button onClick={()=>onSort(col)} className="flex items-center justify-end gap-1 hover:text-gray-700 transition-colors w-full">
      {children}
      {sortCol===col ? (sortDir==='desc'?<ArrowDown size={10}/>:<ArrowUp size={10}/>) : <ArrowUp size={10} className="opacity-20"/>}
    </button>
  )
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
      <div className="flex-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {drillOrder.map(f=>FIELD_LABELS[f]).join(' → ')}
      </div>
      <div className="w-24 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right"><SortBtn col="actual">Actual</SortBtn></div>
      <div className="w-24 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right"><SortBtn col="budget">Budget</SortBtn></div>
      <div className="w-28 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-right"><SortBtn col="delta">Over/Under</SortBtn></div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Department Filter Dropdown — for Breakdown P&L
// ─────────────────────────────────────────────────────────────────────────────

function DeptFilterDropdown({ allDepts, deptNames, deptFilter, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isAll  = !deptFilter || deptFilter.size === allDepts.length
  const label  = isAll ? 'All Departments'
    : deptFilter.size === 1 ? (deptNames[[...deptFilter][0]] || [...deptFilter][0])
    : `${deptFilter.size} Departments`

  function toggleDept(code) {
    const cur = deptFilter ? new Set(deptFilter) : new Set(allDepts)
    if (cur.has(code)) cur.delete(code); else cur.add(code)
    onChange(cur.size === allDepts.length ? null : cur)
  }
  function selectAll()  { onChange(null) }
  function clearAll()   { onChange(new Set()) }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!isAll ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        <Building2 size={11}/>
        {label}
        <ChevronDown size={10}/>
      </button>
      {open && (
        <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-xl z-40 w-64 py-1 max-h-80 overflow-y-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100">
            <button onClick={() => { selectAll(); setOpen(false) }} className="text-xs text-teal-600 hover:underline">Select all</button>
            <span className="text-gray-200">·</span>
            <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Clear all</button>
          </div>
          {allDepts.map(code => {
            const active = !deptFilter || deptFilter.has(code)
            return (
              <button key={code} onClick={() => toggleDept(code)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors">
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${active ? 'bg-teal-600 border-teal-600' : 'border-gray-300'}`}>
                  {active && <Check size={9} className="text-white"/>}
                </div>
                <span className={`font-medium ${active ? 'text-gray-800' : 'text-gray-400'}`}>
                  {code} · {deptNames[code] || code}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P&L Breakdown Tab — full redesign per Fix 3
// ─────────────────────────────────────────────────────────────────────────────

function BreakdownTab({ actuals, budgetFlat, scenario, dateRange, activeDepts }){
  const { deptNames, incomeMonths, orgConfig, comments } = useApp()
  const navigate = useNavigate()

  // Drill order: category is always first (P&L rows are categories)
  const [drillOrder, setDrillOrder] = useLocalStorage('master-pl-drill', ['category','account','grant','vendor'])
  const [viewMode,   setViewMode]   = useState('summary')
  const [searchQ,    setSearchQ]    = useState('')
  const [deptFilter, setDeptFilter] = useState(null)  // null = all
  const [selectedTx, setSelectedTx] = useState(null)

  // Expand state: Set of category values expanded in each section
  const [expandedIncome,   setExpandedIncome]   = useState(new Set())
  const [expandedExpenses, setExpandedExpenses] = useState(new Set())
  // Sub-path state: {catValue: openPath[]} for drill within each expanded category
  const [incSubPaths, setIncSubPaths] = useState({})
  const [expSubPaths, setExpSubPaths] = useState({})

  // Right-panel KPI cards
  const [panelKPIs,    setPanelKPIs]    = useLocalStorage('breakdown-panel-kpis', ['net-position','budget-utilization','cash-position'])
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [cashFlowData, setCashFlowData] = useState([])
  const [patronData,   setPatronData]   = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('v_cash_flow_enriched').select('*').eq('org_id', ORG_ID),
      supabase.from('patron_data').select('*').eq('org_id', ORG_ID),
    ]).then(([cf, pd]) => {
      if (!cf.error) setCashFlowData(cf.data || [])
      if (!pd.error) setPatronData(pd.data || [])
    })
  }, [])

  const { startDate, endDate } = dateRange

  // All unique dept codes in actuals (for dropdown)
  const allDepts = useMemo(() =>
    [...new Set(actuals.map(t => t.department).filter(Boolean))].sort()
  , [actuals])

  // Filtered actuals
  const dateFiltered = useMemo(() => filterActualsByRange(actuals, startDate, endDate), [actuals, startDate, endDate])
  const navFiltered  = useMemo(() => activeDepts ? dateFiltered.filter(t => activeDepts.has(t.department)) : dateFiltered, [dateFiltered, activeDepts])
  const deptFiltered = useMemo(() => deptFilter ? navFiltered.filter(t => deptFilter.has(t.department)) : navFiltered, [navFiltered, deptFilter])
  const searched     = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return deptFiltered
    return deptFiltered.filter(t => [t.vendor, t.description, t.category, t.account, t.grant].some(v => v?.toLowerCase().includes(q)))
  }, [deptFiltered, searchQ])

  // Split income vs expense (income amounts made positive)
  const incomeActuals  = useMemo(() => searched.filter(t => t.record_type === 'income').map(t => ({ ...t, amount: Math.abs(t.amount||0) })), [searched])
  const expenseActuals = useMemo(() => searched.filter(t => t.record_type !== 'income'), [searched])

  // Budget split
  const expBudgetByCat = useMemo(() => calcBudgetByCategory(budgetFlat.filter(b=>b.record_type!=='income'), scenario, startDate, endDate, null), [budgetFlat, scenario, startDate, endDate])
  const incBudgetByCat = useMemo(() => calcBudgetByCategory(budgetFlat.filter(b=>b.record_type==='income'),  scenario, startDate, endDate, null), [budgetFlat, scenario, startDate, endDate])

  // Category groups (for P&L rows at depth 0)
  const incomeGroups = useMemo(() => {
    const map = {}
    for (const t of incomeActuals) {
      const cat = t.category || 'Uncategorized'
      if (!map[cat]) map[cat] = { actual: 0, items: [] }
      map[cat].actual += (t.amount || 0)
      map[cat].items.push(t)
    }
    return Object.entries(map).sort(([,a],[,b]) => b.actual - a.actual).map(([cat, d]) => ({ cat, ...d, budget: incBudgetByCat[cat] || 0 }))
  }, [incomeActuals, incBudgetByCat])

  const expenseGroups = useMemo(() => {
    const map = {}
    for (const t of expenseActuals) {
      const cat = t.category || 'Uncategorized'
      if (!map[cat]) map[cat] = { actual: 0, items: [] }
      map[cat].actual += (t.amount || 0)
      map[cat].items.push(t)
    }
    return Object.entries(map).sort(([,a],[,b]) => b.actual - a.actual).map(([cat, d]) => ({ cat, ...d, budget: expBudgetByCat[cat] || 0 }))
  }, [expenseActuals, expBudgetByCat])

  // Totals
  const totalIncActual   = useMemo(() => incomeGroups.reduce((s,g)=>s+g.actual,0), [incomeGroups])
  const totalIncBudget   = useMemo(() => incomeGroups.reduce((s,g)=>s+g.budget,0), [incomeGroups])
  const totalExpActual   = useMemo(() => expenseGroups.reduce((s,g)=>s+g.actual,0), [expenseGroups])
  const totalExpBudget   = useMemo(() => expenseGroups.reduce((s,g)=>s+g.budget,0), [expenseGroups])
  const netActual        = totalIncActual - totalExpActual
  const netBudget        = totalIncBudget - totalExpBudget

  // Unresolved rows — actuals with _warnings in range
  const unresolvedMap = useMemo(() => {
    const startP = (startDate || '').substring(0, 7)
    const endP   = (endDate   || '').substring(0, 7)
    const map = {}
    for (const t of searched) {
      for (const w of (t._warnings || [])) {
        if (!map[w]) map[w] = { actual: 0, count: 0 }
        map[w].actual += Math.abs(t.amount || 0)
        map[w].count++
      }
    }
    // Also surface budget unresolved rows so the admin knows the budget impact
    for (const b of budgetFlat) {
      if (b.scenario !== scenario) continue
      if (!b.period || b.period < startP || b.period > endP) continue
      for (const w of (b._warnings || [])) {
        if (!map[w]) map[w] = { actual: 0, budget: 0, count: 0 }
        map[w].budget = (map[w].budget || 0) + Math.abs(b.amount || 0)
      }
    }
    return map
  }, [searched, budgetFlat, scenario, startDate, endDate])

  // Sub-drill order (everything below category)
  const subDrillOrder = useMemo(() => drillOrder.filter(f => f !== 'category'), [drillOrder])

  // Expand / collapse all
  function expandAll() {
    setExpandedIncome(new Set(incomeGroups.map(g=>g.cat)))
    setExpandedExpenses(new Set(expenseGroups.map(g=>g.cat)))
  }
  function collapseAll() {
    setExpandedIncome(new Set()); setExpandedExpenses(new Set())
    setIncSubPaths({}); setExpSubPaths({})
  }
  const anyExpanded = expandedIncome.size > 0 || expandedExpenses.size > 0

  // Toggle category expand
  function toggleIncCat(cat) {
    setExpandedIncome(prev => { const n=new Set(prev); n.has(cat)?n.delete(cat):n.add(cat); return n })
    setIncSubPaths(p => ({ ...p, [cat]: [] }))
  }
  function toggleExpCat(cat) {
    setExpandedExpenses(prev => { const n=new Set(prev); n.has(cat)?n.delete(cat):n.add(cat); return n })
    setExpSubPaths(p => ({ ...p, [cat]: [] }))
  }

  // Toggle sub-row within an expanded category
  function toggleIncSub(cat, depth, value) {
    setIncSubPaths(p => {
      const prev = p[cat] || []
      const next = prev[depth]===value ? prev.slice(0,depth) : [...prev.slice(0,depth), value]
      return { ...p, [cat]: next }
    })
  }
  function toggleExpSub(cat, depth, value) {
    setExpSubPaths(p => {
      const prev = p[cat] || []
      const next = prev[depth]===value ? prev.slice(0,depth) : [...prev.slice(0,depth), value]
      return { ...p, [cat]: next }
    })
  }

  // Top vendors (for summary panel)
  const topVendors = useMemo(() => {
    const map = {}
    for (const t of expenseActuals) {
      const v = t.vendor || 'Unknown'
      map[v] = (map[v]||0) + (t.amount||0)
    }
    return Object.entries(map).sort(([,a],[,b])=>b-a).slice(0,5).map(([vendor,amount])=>({ vendor, amount }))
  }, [expenseActuals])

  // ── Row render helpers ──────────────────────────────────────────────────────

  function PLCategoryRow({ cat, actual, budget, isExpense, isExpanded, totalInc, onToggle }) {
    const variance = actual - budget
    const pos = isExpense ? variance <= 0 : variance >= 0
    const varColor = pos ? 'text-emerald-600' : 'text-red-600'
    const pctInc = totalInc > 0 ? actual / totalInc * 100 : 0
    return (
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggle}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2" style={{ paddingLeft: 8 }}>
            <span className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${isExpanded?'rotate-90':''}`}>
              <ChevronRight size={13}/>
            </span>
            <span className="text-sm font-medium text-gray-800">{cat}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold text-gray-800">{formatCurrency(actual,{compact:false})}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-400">{budget>0?formatCurrency(budget,{compact:false}):'—'}</td>
        <td className={`px-4 py-2.5 text-right tabular-nums text-sm font-medium ${varColor}`}>
          {budget>0 ? `${variance>=0?'+':''}${formatCurrency(variance,{compact:false})}` : '—'}
        </td>
        <td className="px-6 py-2.5 text-right tabular-nums text-xs">
          <div className="flex items-center justify-end gap-2">
            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(pctInc, 100)}%` }}/>
            </div>
            <span className="text-gray-400 tabular-nums w-9 text-right">{pctInc.toFixed(1)}%</span>
          </div>
        </td>
      </tr>
    )
  }

  function PLSubRows({ items, subDrillOrder, openPath, onToggle, totalInc, catBudget }) {
    const subRows = useMemo(() =>
      buildVisibleRows(items, subDrillOrder, openPath, {}, null, catBudget || 0)
    , [items, subDrillOrder, openPath, catBudget])

    return subRows.map((row, i) => {
      if (row.type === 'transaction') {
        const t = row.item
        return (
          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => setSelectedTx(t)}>
            <td className="py-2" style={{ paddingLeft: 16 + row.depth*20 + 24 }}>
              <div className="flex items-center gap-2">
                <span className="text-gray-200 flex-shrink-0">•</span>
                <span className="text-xs text-gray-600 truncate max-w-[160px]">{t.vendor||'—'}</span>
                {t.date && <span className="text-[10px] text-gray-300 flex-shrink-0">{t.date}</span>}
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-xs font-medium text-gray-700">{formatCurrency(t.amount,{compact:false})}</td>
            <td className="px-4 py-2 text-right text-xs text-gray-300">—</td>
            <td className="px-4 py-2 text-right text-xs text-gray-300">—</td>
            <td className="px-6 py-2 text-right text-xs text-gray-300">—</td>
          </tr>
        )
      }
      // Group row
      const delta = row.budgetIsReal && row.budget > 0 ? row.actual - row.budget : null
      return (
        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
          onClick={() => onToggle(row.depth, row.value)}
          style={{ opacity: row.isDimmed ? 0.35 : 1 }}>
          <td className="py-2.5" style={{ paddingLeft: 16 + row.depth*20 + 16 }}>
            <div className="flex items-center gap-1.5">
              <span className={`text-gray-300 flex-shrink-0 transition-transform duration-150 ${row.isExpanded?'rotate-90':''}`}>
                <ChevronRight size={11}/>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: FIELD_COLORS[row.field]+'20', color: FIELD_COLORS[row.field] }}>
                {FIELD_LABELS[row.field]}
              </span>
              <span className="text-xs font-medium text-gray-700 truncate">{row.value}</span>
            </div>
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-xs font-medium text-gray-700">{formatCurrency(row.actual,{compact:false})}</td>
          <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-400">
            {row.budgetIsReal && row.budget > 0 ? formatCurrency(row.budget,{compact:false}) : <span className="text-gray-300" title="Budget tracked at category and account level.">—</span>}
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-400">
            {delta!==null ? `${delta>=0?'+':''}${formatCurrency(delta,{compact:false})}` : <span className="text-gray-300" title="Budget tracked at category and account level.">—</span>}
          </td>
          <td className="px-6 py-2.5 text-right text-xs text-gray-300">
            {totalInc>0 ? `${(row.actual/totalInc*100).toFixed(1)}%` : '—'}
          </td>
        </tr>
      )
    })
  }

  function PLSectionRow({ label }) {
    return (
      <tr className="bg-gray-50/80">
        <td colSpan={5} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</td>
      </tr>
    )
  }

  function PLTotalRow({ label, actual, budget, isNet }) {
    const variance = actual - budget
    const pos = actual >= 0
    return (
      <tr className={isNet ? 'bg-gray-900' : 'bg-gray-50'}>
        <td className={`px-6 py-3 text-sm font-bold ${isNet ? 'text-white' : 'text-gray-800'}`}>{label}</td>
        <td className={`px-4 py-3 text-right tabular-nums text-sm font-bold ${isNet ? 'text-white' : 'text-gray-800'}`}>{formatCurrency(actual,{compact:false})}</td>
        <td className={`px-4 py-3 text-right tabular-nums text-sm ${isNet ? 'text-gray-300' : 'text-gray-500'}`}>{budget>0?formatCurrency(budget,{compact:false}):'—'}</td>
        <td className={`px-4 py-3 text-right tabular-nums text-sm font-bold ${isNet ? (pos?'text-emerald-400':'text-red-400') : (pos?'text-emerald-600':'text-red-600')}`}>
          {budget>0 ? `${variance>=0?'+':''}${formatCurrency(variance,{compact:false})}` : '—'}
        </td>
        <td className={`px-6 py-3 text-right text-xs ${isNet ? 'text-gray-300 italic' : 'text-gray-400'}`}>
          {isNet && totalIncActual>0 ? `${(actual/totalIncActual*100).toFixed(1)}% margin` : ''}
        </td>
      </tr>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden">

      {/* Controls bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-white flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 w-48 flex-shrink-0">
          <Search size={12} className="text-gray-400"/>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search…"
            className="text-sm bg-transparent outline-none w-full text-gray-700 placeholder-gray-400"/>
          {searchQ&&<button onClick={()=>setSearchQ('')}><X size={10} className="text-gray-400"/></button>}
        </div>

        {/* Department filter dropdown */}
        <DeptFilterDropdown allDepts={allDepts} deptNames={deptNames} deptFilter={deptFilter} onChange={setDeptFilter}/>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0"/>

        {/* Drill order label */}
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">Sub-drill</span>

        {/* Draggable pills (sub-levels only — Category is always fixed as P&L rows) */}
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {subDrillOrder.map((field,idx) => {
            const fullIdx = drillOrder.indexOf(field)
            return (
              <div key={field}
                draggable
                onDragStart={e=>{ e._dragField=field; e.dataTransfer.effectAllowed='move' }}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{
                  e.preventDefault()
                  const from=e._dragField||drillOrder.find(f=>f!=='category'&&f!==field)
                  if(!from||from===field) return
                  const next=[...drillOrder]
                  const fi=next.indexOf(from), ti=next.indexOf(field)
                  if(fi<0||ti<0) return
                  next.splice(fi,1); next.splice(ti,0,from)
                  setDrillOrder(next); setIncSubPaths({}); setExpSubPaths({})
                }}>
                <div className="flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-xs font-semibold border cursor-grab select-none"
                  style={{ backgroundColor:FIELD_COLORS[field]+'20', borderColor:FIELD_COLORS[field]+'60', color:FIELD_COLORS[field] }}>
                  <GripVertical size={10} className="opacity-60"/>
                  {FIELD_LABELS[field]}
                  <button onClick={()=>{ setDrillOrder(drillOrder.filter(f=>f!==field)); setIncSubPaths({}); setExpSubPaths({}) }}
                    className="opacity-60 hover:opacity-100 ml-0.5"><X size={9}/></button>
                </div>
              </div>
            )
          })}
          {/* Add field */}
          {ALL_DRILL_FIELDS.filter(f=>!drillOrder.includes(f)).length>0 && (
            <div className="relative group">
              <button className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-gray-400">
                <Plus size={10}/> Add
              </button>
              <div className="hidden group-hover:block absolute left-0 top-7 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 w-36">
                {ALL_DRILL_FIELDS.filter(f=>!drillOrder.includes(f)).map(f=>(
                  <button key={f} onClick={()=>setDrillOrder([...drillOrder,f])} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                    {FIELD_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={()=>{ setDrillOrder(['category','account','grant','vendor']); setIncSubPaths({}); setExpSubPaths({}) }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><RotateCcw size={10}/>Reset</button>
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
          {[['summary','P&L'],['calendar','Calendar']].map(([id,lbl])=>(
            <button key={id} onClick={()=>setViewMode(id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode===id?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar view */}
      {viewMode==='calendar' && (
        <div className="flex-1 overflow-y-auto p-4" style={{backgroundColor:'var(--color-primary-bg)'}}>
          <CalendarBreakdownView transactions={searched} budgetFlat={budgetFlat} selectedScenario={scenario}
            drillOrder={drillOrder} dateRange={dateRange} deptNames={deptNames} activeDepts={activeDepts} onHide={()=>{}}/>
        </div>
      )}

      {/* P&L table view */}
      {viewMode==='summary' && (
        <div className="flex-1 flex overflow-hidden">

          {/* Main P&L table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-72">Line Item</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Actual</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Budget</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Variance</th>
                  <th className="text-right px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-32">
                    <div className="flex items-center justify-end gap-2">
                      <span>% of Income</span>
                      <button onClick={anyExpanded?collapseAll:expandAll}
                        className="text-teal-600 hover:text-teal-700 transition-colors flex items-center gap-0.5 font-medium normal-case tracking-normal text-xs">
                        {anyExpanded?<><ChevronUp size={10}/> Collapse</>:<><ChevronDown size={10}/> Expand</>}
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* ── INCOME ── */}
                <PLSectionRow label="Income"/>
                {incomeGroups.length===0 && (
                  <tr><td colSpan={5} className="px-4 py-3 text-xs text-gray-300 italic">No income in range</td></tr>
                )}
                {incomeGroups.map(g => (
                  <React.Fragment key={g.cat}>
                    <PLCategoryRow cat={g.cat} actual={g.actual} budget={g.budget} isExpense={false}
                      isExpanded={expandedIncome.has(g.cat)} totalInc={totalIncActual}
                      onToggle={() => toggleIncCat(g.cat)}/>
                    {expandedIncome.has(g.cat) && g.items.length > 0 && subDrillOrder.length > 0 && (
                      <PLSubRows items={g.items} subDrillOrder={subDrillOrder}
                        openPath={incSubPaths[g.cat]||[]}
                        onToggle={(d,v) => toggleIncSub(g.cat,d,v)}
                        totalInc={totalIncActual}
                        catBudget={g.budget}/>
                    )}
                  </React.Fragment>
                ))}
                <PLTotalRow label="Total Income" actual={totalIncActual} budget={totalIncBudget}/>
                <tr><td colSpan={5} className="py-1.5"/></tr>

                {/* ── EXPENSES ── */}
                <PLSectionRow label="Expenses"/>
                {expenseGroups.length===0 && (
                  <tr><td colSpan={5} className="px-4 py-3 text-xs text-gray-300 italic">No expenses in range</td></tr>
                )}
                {expenseGroups.map(g => (
                  <React.Fragment key={g.cat}>
                    <PLCategoryRow cat={g.cat} actual={g.actual} budget={g.budget} isExpense={true}
                      isExpanded={expandedExpenses.has(g.cat)} totalInc={totalIncActual}
                      onToggle={() => toggleExpCat(g.cat)}/>
                    {expandedExpenses.has(g.cat) && g.items.length > 0 && subDrillOrder.length > 0 && (
                      <PLSubRows items={g.items} subDrillOrder={subDrillOrder}
                        openPath={expSubPaths[g.cat]||[]}
                        onToggle={(d,v) => toggleExpSub(g.cat,d,v)}
                        totalInc={totalIncActual}
                        catBudget={g.budget}/>
                    )}
                  </React.Fragment>
                ))}
                <PLTotalRow label="Total Expenses" actual={totalExpActual} budget={totalExpBudget}/>
                <tr><td colSpan={5} className="py-1.5"/></tr>

                {/* ── NET OPERATING INCOME ── */}
                <PLTotalRow label="Net Operating Income" actual={netActual} budget={netBudget} isNet/>

                {/* ── UNRESOLVED ITEMS ── */}
                {Object.entries(unresolvedMap).some(([, v]) => (v.actual || 0) + (v.budget || 0) > 0) && (
                  <>
                    <tr><td colSpan={5} className="py-1"/></tr>
                    <tr className="bg-amber-50/80">
                      <td colSpan={5} className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={11} className="text-amber-500"/>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Unresolved Items</span>
                          <span className="text-[10px] text-amber-400 ml-1">· click any row to fix</span>
                        </div>
                      </td>
                    </tr>
                    {Object.entries(unresolvedMap).map(([type, vals]) => {
                      if (!vals || (vals.actual || 0) + (vals.budget || 0) === 0) return null
                      const cfg = WARN_CONFIG[type]
                      if (!cfg) return null
                      const total = (vals.actual || 0) + (vals.budget || 0)
                      return (
                        <tr key={type}
                          onClick={() => navigate(cfg.url)}
                          className="border-b border-amber-100 bg-amber-50/40 hover:bg-amber-100 cursor-pointer transition-colors group">
                          <td className="px-4 py-2.5">
                            <div className="flex items-start gap-2" style={{ paddingLeft: 8 }}>
                              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                              <div>
                                <div className="text-sm font-medium text-amber-800">{cfg.label}</div>
                                <div className="text-xs text-amber-500 underline group-hover:no-underline">{cfg.action}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold text-amber-700">
                            {formatCurrency(total, {compact: false})}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-amber-300">—</td>
                          <td className="px-4 py-2.5 text-right text-xs text-amber-300">—</td>
                          <td className="px-6 py-2.5 text-right text-xs text-amber-400 font-medium">fix →</td>
                        </tr>
                      )
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary panel */}
          <div className="w-64 border-l border-gray-100 overflow-y-auto flex-shrink-0" style={{backgroundColor:'var(--color-primary-bg)'}}>
            <div className="p-4 space-y-4">
              {/* Totals */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Summary</p>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-xs"
                  style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Income</span>
                    <span className="font-semibold text-gray-800 tabular-nums">{formatCurrency(totalIncActual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Expenses</span>
                    <span className="font-semibold text-gray-800 tabular-nums">{formatCurrency(totalExpActual)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between">
                    <span className="text-gray-600 font-medium">Net</span>
                    <span className={`font-bold tabular-nums ${netActual>=0?'text-emerald-600':'text-red-500'}`}>{formatCurrency(netActual)}</span>
                  </div>
                </div>
              </div>

              {/* Top vendors */}
              {topVendors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Top Vendors</p>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2"
                    style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    {topVendors.map((v,i)=>(
                      <div key={v.vendor} className="text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-gray-600 truncate max-w-[100px]">{v.vendor}</span>
                          <span className="font-medium text-gray-800 flex-shrink-0 tabular-nums">{formatCurrency(v.amount)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1">
                          <div className="h-full rounded-full" style={{ width:`${totalExpActual>0?(v.amount/totalExpActual*100):0}%`, backgroundColor:'var(--color-accent)' }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Income categories */}
              {incomeGroups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>Income Breakdown</p>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-1.5"
                    style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    {incomeGroups.slice(0,5).map(g=>(
                      <div key={g.cat} className="flex justify-between text-xs">
                        <span className="text-gray-500 truncate max-w-[100px]">{g.cat}</span>
                        <span className="font-medium text-gray-700 tabular-nums">{formatCurrency(g.actual)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI Cards panel */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{color:'var(--neutral-60)'}}>KPI Cards</p>
                <div className="space-y-2">
                  {panelKPIs.map(id => (
                    <div key={id} className="relative group">
                      <FinanceKPICard
                        id={id}
                        actuals={actuals}
                        budgetFlat={budgetFlat}
                        scenario={scenario}
                        incomeMonths={incomeMonths}
                        cashFlowData={cashFlowData}
                        patronData={patronData}
                        dateRange={dateRange}
                        orgConfig={orgConfig}
                        editMode={false}
                        onRemove={null}
                      />
                      {/* X button on hover */}
                      <button
                        onClick={() => setPanelKPIs(prev => prev.filter(k => k !== id))}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 flex items-center justify-center text-gray-500"
                      >
                        <X size={10}/>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add card button */}
                <button
                  onClick={() => setShowAddPanel(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 border border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Plus size={12}/> Add Card
                </button>
              </div>

              {/* AddFinanceKPIPanel modal */}
              {showAddPanel && (
                <AddFinanceKPIPanel
                  existingIds={panelKPIs}
                  onAdd={id => { setPanelKPIs(prev => [...prev, id]); setShowAddPanel(false) }}
                  onClose={() => setShowAddPanel(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tx detail modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={()=>setSelectedTx(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-96 p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-gray-800">{selectedTx.vendor||'Transaction'}</span>
              <button onClick={()=>setSelectedTx(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Amount', formatCurrency(Math.abs(selectedTx.amount||0),{compact:false})],
                ['Date', selectedTx.date || selectedTx.period],
                ['Department', deptNames[selectedTx.department]||selectedTx.department],
                ['Category', selectedTx.category],
                ['Account', selectedTx.account],
                selectedTx.grant && ['Grant', selectedTx.grant],
                selectedTx.description && ['Note', selectedTx.description],
              ].filter(Boolean).map(([k,v])=>(
                <div key={k} className="flex gap-3">
                  <span className="text-gray-400 w-24 flex-shrink-0">{k}</span>
                  <span className="text-gray-800">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions Tab — multi-select filters
// ─────────────────────────────────────────────────────────────────────────────

function MultiSelectFilter({ label, options, selected, onToggle, onClear }){
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(()=>{
    function h(e){ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])
  const count = selected.length
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(p=>!p)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${count>0?'bg-teal-50 border-teal-300 text-teal-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        <Filter size={11}/>
        {label}{count>0&&` (${count})`}
        <ChevronDown size={10}/>
      </button>
      {open && (
        <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-xl z-40 w-48 py-1 max-h-60 overflow-y-auto">
          {count>0 && <button onClick={()=>{ onClear(); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100">Clear all</button>}
          {options.map(opt=>{
            const active = selected.includes(opt)
            return (
              <button key={opt} onClick={()=>onToggle(opt)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${active?'bg-teal-600 border-teal-600':'border-gray-300'}`}>
                  {active&&<Check size={9} className="text-white"/>}
                </div>
                <span className="truncate">{opt}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MasterTransactionsTab({ actuals, budgetFlat, scenario, dateRange, activeDepts }){
  const { deptNames } = useApp()
  const [search,       setSearch]       = useState('')
  const [teamFilter,   setTeamFilter]   = useState([])
  const [catFilter,    setCatFilter]    = useState([])
  const [vendorFilter, setVendorFilter] = useState([])
  const [grantFilter,  setGrantFilter]  = useState([])
  const [sortCol,      setSortCol]      = useState('date')
  const [sortDir,      setSortDir]      = useState('desc')
  const [page,         setPage]         = useState(1)
  const PAGE = 50

  const { startDate, endDate } = dateRange

  const inRange = useMemo(()=>filterActualsByRange(actuals,startDate,endDate),[actuals,startDate,endDate])
  const deptRows = useMemo(()=>activeDepts ? inRange.filter(t=>activeDepts.has(t.department)) : inRange,[inRange,activeDepts])

  const allTeams    = useMemo(()=>getUniqueValues(deptRows,'department').map(d=>deptNames[d]||d),[deptRows,deptNames])
  const allCats     = useMemo(()=>getUniqueValues(deptRows,'category'),[deptRows])
  const allVendors  = useMemo(()=>getUniqueValues(deptRows,'vendor'),[deptRows])
  const allGrants   = useMemo(()=>getUniqueValues(deptRows,'grant').filter(Boolean),[deptRows])

  const filtered = useMemo(()=>{
    let rows = deptRows
    const q = search.trim().toLowerCase()
    if(q) rows = rows.filter(t=>[t.vendor,t.description,t.category,t.account,t.grant].some(v=>v?.toLowerCase().includes(q)))
    if(teamFilter.length)   rows = rows.filter(t=>teamFilter.includes(deptNames[t.department]||t.department))
    if(catFilter.length)    rows = rows.filter(t=>catFilter.includes(t.category))
    if(vendorFilter.length) rows = rows.filter(t=>vendorFilter.includes(t.vendor))
    if(grantFilter.length)  rows = rows.filter(t=>grantFilter.includes(t.grant))
    return rows
  },[deptRows,search,teamFilter,catFilter,vendorFilter,grantFilter])

  const sorted = useMemo(()=>[...filtered].sort((a,b)=>{
    let va=a[sortCol], vb=b[sortCol]
    if(typeof va==='string') va=va.toLowerCase(), vb=vb.toLowerCase()
    return (va<vb?-1:va>vb?1:0)*(sortDir==='asc'?1:-1)
  }),[filtered,sortCol,sortDir])

  const pages = Math.max(1,Math.ceil(sorted.length/PAGE))
  const pageRows = sorted.slice((page-1)*PAGE, page*PAGE)

  function toggleSort(col){ if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortCol(col); setSortDir('desc') } }
  function toggleCat(v){ setCatFilter(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]); setPage(1) }
  function toggleTeam(v){ setTeamFilter(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]); setPage(1) }
  function toggleVendor(v){ setVendorFilter(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]); setPage(1) }
  function toggleGrant(v){ setGrantFilter(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]); setPage(1) }

  const ColHead = ({col,children})=>(
    <th className="text-left px-4 py-2 cursor-pointer select-none hover:bg-gray-100 transition-colors" onClick={()=>toggleSort(col)}>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {children}
        {sortCol===col?(sortDir==='desc'?<ArrowDown size={9}/>:<ArrowUp size={9}/>):<ArrowUp size={9} className="opacity-20"/>}
      </div>
    </th>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-white flex-wrap">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 w-60">
          <Search size={12} className="text-gray-400"/>
          <input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} placeholder="Search vendor, description…"
            className="text-sm bg-transparent outline-none flex-1 placeholder-gray-400"/>
          {search&&<button onClick={()=>setSearch('')}><X size={10} className="text-gray-400"/></button>}
        </div>
        <MultiSelectFilter label="Team"   options={allTeams}   selected={teamFilter}   onToggle={toggleTeam}   onClear={()=>setTeamFilter([])}/>
        <MultiSelectFilter label="Category" options={allCats}  selected={catFilter}    onToggle={toggleCat}    onClear={()=>setCatFilter([])}/>
        <MultiSelectFilter label="Vendor" options={allVendors} selected={vendorFilter} onToggle={toggleVendor} onClear={()=>setVendorFilter([])}/>
        {allGrants.length>0 && <MultiSelectFilter label="Grant" options={allGrants} selected={grantFilter} onToggle={toggleGrant} onClear={()=>setGrantFilter([])}/>}
        <div className="ml-auto text-xs text-gray-400">{filtered.length} of {deptRows.length} transactions</div>
      </div>
      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <tr>
              <ColHead col="date">Date</ColHead>
              <ColHead col="vendor">Vendor</ColHead>
              <ColHead col="department">Team</ColHead>
              <ColHead col="category">Category</ColHead>
              <ColHead col="account">Account</ColHead>
              <ColHead col="amount">Amount</ColHead>
              <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Grant</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length===0 && (
              <tr><td colSpan={7} className="text-center py-16 text-gray-400">No transactions match your filters</td></tr>
            )}
            {pageRows.map((t,i)=>(
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 text-gray-500 tabular-nums">{t.date}</td>
                <td className="px-4 py-2 font-medium text-gray-800 max-w-[180px] truncate">{t.vendor}</td>
                <td className="px-4 py-2"><span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{backgroundColor:(DEPT_COLORS[t.department]||'#9BA8B5')+'20',color:DEPT_COLORS[t.department]||'#9BA8B5'}}>
                  {deptNames[t.department]||t.department}</span></td>
                <td className="px-4 py-2 text-gray-600">{t.category}</td>
                <td className="px-4 py-2 text-gray-400 text-xs">{t.account}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-800 tabular-nums">{formatCurrency(t.amount,{compact:false})}</td>
                <td className="px-4 py-2">{t.grant&&<span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{t.grant}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {pages>1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-white">
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="flex items-center gap-1 text-sm text-gray-500 disabled:opacity-30 hover:text-gray-700">
            <ChevronLeft size={14}/> Previous
          </button>
          <span className="text-xs text-gray-400">Page {page} of {pages}</span>
          <button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="flex items-center gap-1 text-sm text-gray-500 disabled:opacity-30 hover:text-gray-700">
            Next <ChevronRight size={14}/>
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Tab — clean 8-team table with hover preview + TeamSpend chart
// ─────────────────────────────────────────────────────────────────────────────

function TeamsTab({ actuals, budgetFlat, scenario, dateRange }){
  const navigate = useNavigate()
  const { startDate, endDate } = dateRange
  const startP = startDate.slice(0,7), endP = endDate.slice(0,7)

  const [sortCol, setSortCol] = useState('actual')
  const [sortDir, setSortDir] = useState('desc')
  const [hoverTeam, setHoverTeam] = useState(null)
  const [hoverPos,  setHoverPos]  = useState({ x:0, y:0 })
  const [managers,  setManagers]  = useState({})  // team_id → manager name

  useEffect(() => {
    supabase.from('teams').select('id, manager_name').eq('org_id', ORG_ID)
      .then(({ data }) => {
        const m = {}
        for (const t of data || []) if (t.manager_name) m[t.id] = t.manager_name
        setManagers(m)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actuals by team ────────────────────────────────────────────────────────
  const { actualByTeam, idByTeam } = useMemo(() => {
    const act = {}, ids = {}
    for (const t of actuals) {
      const p = t.period||(t.date?t.date.slice(0,7):null)
      if (!p||p<startP||p>endP||t.record_type==='income'||!t.team_name) continue
      const name = t.team_name
      act[name] = (act[name]||0) + Math.abs(t.amount||0)
      if (t.team_id && !ids[name]) ids[name] = t.team_id
    }
    return { actualByTeam: act, idByTeam: ids }
  }, [actuals, startP, endP])

  // ── Budget by team ─────────────────────────────────────────────────────────
  const budgetByTeam = useMemo(() => {
    const m = {}
    for (const b of budgetFlat) {
      if (b.scenario!==scenario||b.record_type==='income'||!b.team_name) continue
      if (!b.period||b.period<startP||b.period>endP) continue
      m[b.team_name] = (m[b.team_name]||0) + Math.abs(b.amount||0)
    }
    return m
  }, [budgetFlat, scenario, startP, endP])

  // ── Per-team per-category breakdown (for Top Issue + hover) ───────────────
  const teamCatMap = useMemo(() => {
    const result = {}
    for (const t of actuals) {
      const p = t.period||(t.date?t.date.slice(0,7):null)
      if (!p||p<startP||p>endP||t.record_type==='income'||!t.team_name) continue
      const team = t.team_name, cat = t.category||'Other'
      if (!result[team]) result[team] = {}
      if (!result[team][cat]) result[team][cat] = { actual:0, budget:0 }
      result[team][cat].actual += Math.abs(t.amount||0)
    }
    for (const b of budgetFlat) {
      if (b.scenario!==scenario||b.record_type==='income'||!b.team_name) continue
      if (!b.period||b.period<startP||b.period>endP) continue
      const team = b.team_name, cat = b.category||'Other'
      if (!result[team]) result[team] = {}
      if (!result[team][cat]) result[team][cat] = { actual:0, budget:0 }
      result[team][cat].budget += Math.abs(b.amount||0)
    }
    return result
  }, [actuals, budgetFlat, scenario, startP, endP])

  // ── Build team rows ────────────────────────────────────────────────────────
  const teams = useMemo(() => {
    const allNames = new Set([...Object.keys(actualByTeam), ...Object.keys(budgetByTeam)])
    return [...allNames].map(name => {
      const actual   = actualByTeam[name] || 0
      const budget   = budgetByTeam[name] || 0
      const variance = actual - budget
      const varPct   = budget > 0 ? (variance / budget * 100) : null
      const id       = idByTeam[name] || null
      const txCount  = actuals.filter(t => {
        const p = t.period||(t.date?t.date.slice(0,7):null)
        return p&&p>=startP&&p<=endP&&t.team_name===name&&t.record_type!=='income'
      }).length
      // Over-budget categories sorted by % over
      const catData  = teamCatMap[name] || {}
      const overCats = Object.entries(catData)
        .filter(([,d]) => d.budget > 0 && d.actual > d.budget)
        .map(([cat,d]) => ({ cat, pct:(d.actual-d.budget)/d.budget*100 }))
        .sort((a,b) => b.pct - a.pct)
      const topIssue = overCats[0] || null
      const top3     = overCats.slice(0,3)
      // Status pill
      let status
      if      (budget === 0)    status = 'no-budget'
      else if (varPct !== null && varPct >= 0) status = 'over'
      else if (varPct !== null && varPct >= -15) status = 'watch'
      else                      status = 'on-track'
      return { name, id, actual, budget, variance, varPct, txCount, topIssue, top3, status }
    })
  }, [actualByTeam, budgetByTeam, idByTeam, teamCatMap, actuals, startP, endP])

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalActual   = teams.reduce((s,t) => s+t.actual,   0)
  const totalBudget   = teams.reduce((s,t) => s+t.budget,   0)
  const totalVariance = totalActual - totalBudget
  const teamsOver     = teams.filter(t => t.status === 'over').length

  // ── Sorted rows ───────────────────────────────────────────────────────────
  const sorted = useMemo(() => [...teams].sort((a,b) => {
    if (sortCol === 'name') {
      return sortDir==='asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    }
    const av = sortCol==='actual'   ? a.actual
             : sortCol==='budget'   ? a.budget
             : sortCol==='variance' ? a.variance
             : sortCol==='varpct'   ? (a.varPct??-999)
             : a.actual
    const bv = sortCol==='actual'   ? b.actual
             : sortCol==='budget'   ? b.budget
             : sortCol==='variance' ? b.variance
             : sortCol==='varpct'   ? (b.varPct??-999)
             : b.actual
    return sortDir==='asc' ? av-bv : bv-av
  }), [teams, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortTh({ col, right, children }) {
    const active = sortCol === col
    return (
      <th onClick={()=>toggleSort(col)}
        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap
          ${right?'text-right':'text-left'} ${active?'text-gray-900':'text-gray-400 hover:text-gray-600'}`}>
        <span className={`inline-flex items-center gap-1 ${right?'justify-end':''}`}>
          {children}
          {active
            ? (sortDir==='asc' ? <ArrowUp size={9}/> : <ArrowDown size={9}/>)
            : <ArrowUpDown size={9} className="opacity-30"/>}
        </span>
      </th>
    )
  }

  function StatusPill({ status }) {
    if (status==='over')      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Over Budget</span>
    if (status==='watch')     return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Watch</span>
    if (status==='on-track')  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">On Track</span>
    return <span className="text-[10px] text-gray-400">—</span>
  }

  // ── Hover tooltip ─────────────────────────────────────────────────────────
  function HoverCard({ team }) {
    if (!team) return null
    const mgr = managers[team.id]
    return (
      <div className="fixed z-50 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 pointer-events-none"
        style={{ left: hoverPos.x + 20, top: hoverPos.y - 10 }}>
        <div className="text-sm font-semibold text-gray-900 mb-1">{team.name}</div>
        {mgr && <div className="text-[10px] text-gray-400 mb-3">{mgr}</div>}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Actual</span>
            <span className="font-semibold text-gray-800">{formatCurrency(team.actual,{compact:false})}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Budget</span>
            <span className="text-gray-400">{team.budget>0?formatCurrency(team.budget,{compact:false}):'—'}</span>
          </div>
          {team.variance !== 0 && team.budget > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Variance</span>
              <span className={`font-semibold ${team.variance>0?'text-red-600':'text-emerald-600'}`}>
                {team.variance>0?'+':''}{formatCurrency(team.variance,{compact:false})}
              </span>
            </div>
          )}
        </div>
        {team.top3.length > 0 && (
          <div className="border-t border-gray-100 pt-2 mb-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Over-Budget Categories</div>
            {team.top3.map(({cat,pct}) => (
              <div key={cat} className="flex justify-between text-[11px] py-0.5">
                <span className="text-gray-600 truncate">{cat}</span>
                <span className="text-red-600 font-semibold flex-shrink-0 ml-2">+{pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">{team.txCount} transactions in period</div>
        {team.id && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">Click row to open dashboard →</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{backgroundColor:'var(--color-primary-bg)'}}>

      {/* ── Summary stats bar ──────────────────────────────────────────── */}
      <div className="flex gap-4 px-6 py-4 bg-white border-b border-gray-100 overflow-x-auto">
        {[
          { label:'Total Actuals', val: formatCurrency(totalActual,{compact:false}), sub: null },
          { label:'Total Budget',  val: formatCurrency(totalBudget,{compact:false}),  sub: null },
          { label:'Variance',
            val: (totalVariance>0?'+':'')+formatCurrency(Math.abs(totalVariance),{compact:false}),
            sub: totalBudget>0 ? `${(totalVariance/totalBudget*100).toFixed(1)}% of budget` : null,
            cls: totalVariance>0?'text-red-600':totalVariance<0?'text-emerald-600':'text-gray-900' },
          { label:'Teams Over Budget', val:`${teamsOver} of ${teams.length}`,
            sub: teamsOver===0?'All teams within budget':'team'+(teamsOver!==1?'s':'')+' over budget',
            cls: teamsOver>0?'text-red-600':'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="flex-shrink-0 bg-white rounded-xl border border-gray-100 px-4 py-3 min-w-[150px]"
            style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{s.label}</div>
            <div className={`text-sm font-bold tabular-nums ${s.cls||'text-gray-900'}`}>{s.val}</div>
            {s.sub && <div className="text-[10px] text-gray-400 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {/* ── Main table ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <SortTh col="name">Team</SortTh>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Manager</th>
                <SortTh col="actual" right>Actual</SortTh>
                <SortTh col="budget" right>Budget</SortTh>
                <SortTh col="variance" right>Variance $</SortTh>
                <SortTh col="varpct" right>Var %</SortTh>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Top Issue</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 text-sm">No team data in range</td></tr>
              )}
              {sorted.map(team => {
                const isOver = team.status === 'over'
                const mgr    = managers[team.id] || null
                return (
                  <tr key={team.name}
                    onClick={() => team.id && navigate(`/team/${team.id}/briefing`)}
                    onMouseEnter={e => { setHoverTeam(team); setHoverPos({x:e.clientX, y:e.clientY}) }}
                    onMouseMove={e => setHoverPos({x:e.clientX, y:e.clientY})}
                    onMouseLeave={() => setHoverTeam(null)}
                    className={`border-b border-gray-50 transition-colors group ${team.id?'cursor-pointer hover:bg-gray-50':'hover:bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 group-hover:text-teal-700 transition-colors">{team.name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{mgr || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-800">{formatCurrency(team.actual,{compact:false})}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-400">{team.budget>0?formatCurrency(team.budget,{compact:false}):'—'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${team.budget>0?(isOver?'text-red-600':'text-emerald-600'):'text-gray-400'}`}>
                      {team.budget>0 ? ((team.variance>0?'+':'')+formatCurrency(team.variance,{compact:false})) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {team.varPct !== null
                        ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isOver?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'}`}>
                            {isOver?'+':''}{team.varPct.toFixed(1)}%
                          </span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={team.status}/></td>
                    <td className="px-4 py-3">
                      {team.topIssue
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium whitespace-nowrap">
                            {team.topIssue.cat} +{team.topIssue.pct.toFixed(0)}%
                          </span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Team Spend chart (moved from Overview) ───────────────────── */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{color:'var(--neutral-60)'}}>Monthly Team Spend</div>
          <TeamSpendCard actuals={actuals} dateRange={dateRange}/>
        </div>
      </div>

      {/* ── Hover tooltip ────────────────────────────────────────────────── */}
      <HoverCard team={hoverTeam}/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Tab — four Supabase-backed import flows
// Legacy in-memory imports (Actuals, Budget legacy, Income) removed.
// ─────────────────────────────────────────────────────────────────────────────

function MasterImportTab(){
  const [subTab, setSubTab] = useState('transactions')
  const SUB_TABS = [
    { id:'transactions', label:'Transactions' },
    { id:'budget',       label:'Budget'       },
    { id:'patron',       label:'Patron Data'  },
    { id:'cashflow',     label:'Cash Flow'    },
  ]
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex gap-1 border-b border-gray-200 px-6 pt-2">
        {SUB_TABS.map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab===t.id?'border-teal-600 text-teal-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-6">
        {subTab==='transactions' && <TransactionImportFlow/>}
        {subTab==='budget'       && <BudgetImportFlow/>}
        {subTab==='patron'       && <PatronImportFlow/>}
        {subTab==='cashflow'     && <CashFlowImportFlow/>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: MasterDashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function MasterDashboard(){
  const {
    orgConfig,
    actuals,
    budgetFlat,
    incomeMonths,
    availableScenarios, selectedScenario, setSelectedScenario,
    deptNames,
  } = useApp()

  const allDepts = useMemo(() => Object.keys(deptNames), [deptNames])

  // Load org settings for fiscal year config (used by MasterTransactionsEditor)
  const { settings: orgSettings } = useOrgSettings()

  const location = useLocation()

  const [activeTab,   setActiveTab]   = useState('overview')
  const [activeDepts, setActiveDepts] = useState(null) // null = all

  // Deep-link support: /master?tab=setup&setup=accounts navigates directly
  // to a specific tab (and setup subtab) — used by UnresolvedWarning links.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab) setActiveTab(tab)
  }, [location.search])

  // Extract setup subtab from URL to pass to SetupPage
  const setupInitialTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('setup') || null
  }, [location.search])

  // Local date range (master dashboard has its own, independent of AppContext global)
  const [dateRange, setDateRange] = useState(() => ({
    preset: 'fiscal-ytd',
    ...getMasterPresetRange('fiscal-ytd', orgConfig),
  }))

  // Re-sync when org fiscal/operating year settings load from Supabase
  useEffect(()=>{
    setDateRange(prev => {
      if(prev.preset === 'custom') return prev
      return { ...prev, ...getMasterPresetRange(prev.preset, orgConfig) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgConfig.fiscalYearStartMonth, orgConfig.fiscalYearStartYear,
      orgConfig.operatingYearStartMonth, orgConfig.operatingYearStartYear])

  function applyPreset(p){ setDateRange({ preset:p, ...getMasterPresetRange(p, orgConfig) }) }
  function applyCustom(s,e){ setDateRange({ preset:'custom', startDate:s, endDate:e }) }

  function toggleDept(code){
    setActiveDepts(prev=>{
      const all = new Set(allDepts)
      const cur = prev || all
      const next = new Set(cur)
      if(next.has(code)) next.delete(code); else next.add(code)
      if(next.size===all.size) return null
      return next
    })
  }

  // Filtered actuals for tabs that respect team multi-select
  const filteredActuals = useMemo(()=>
    activeDepts ? actuals.filter(t=>activeDepts.has(t.department)) : actuals
  ,[actuals,activeDepts])

  const tabProps = { actuals:filteredActuals, budgetFlat, scenario:selectedScenario, incomeMonths, dateRange, activeDepts }

  return (
    <div className="flex flex-col min-h-screen" style={{backgroundColor:'var(--color-primary-bg)'}}>
      <MasterNav
        activeTab={activeTab} setActiveTab={setActiveTab}
        dateRange={dateRange} onApplyPreset={applyPreset} onApplyCustom={applyCustom}
        activeDepts={activeDepts} onToggleDept={toggleDept} onSelectAllDepts={()=>setActiveDepts(null)}
        activeBudget={selectedScenario} availableScenarios={availableScenarios} onSetBudget={setSelectedScenario}/>

      {activeTab==='overview'      && <OverviewTab {...tabProps}/>}
      {activeTab==='breakdown'     && <BreakdownTab {...tabProps}/>}
      {activeTab==='transactions'  && <MasterTransactionsEditor orgSettings={orgSettings}/>}
      {activeTab==='teams'         && <TeamsTab {...tabProps}/>}
      {activeTab==='comments'      && <div className="flex-1"><CommentsPage/></div>}
      {activeTab==='import'        && <MasterImportTab/>}
      {activeTab==='setup'         && <SetupPage initialTab={setupInitialTab}/>}
    </div>
  )
}
