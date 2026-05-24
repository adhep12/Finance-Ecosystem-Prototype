import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  ChevronDown, ChevronRight, ChevronLeft,
  Plus, X, Edit2, Trash2, Upload, RefreshCw,
  BarChart2, Activity, Filter, Search, Check, Settings,
  Building2, Calendar, Download, GripVertical, RotateCcw,
  Ban, Eye, EyeOff, ArrowUp, ArrowDown, CheckSquare, Square,
  Layers, FileText, Clock, ChevronUp,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import CommentsPage from './CommentsPage'
import SetupPage from './SetupPage'
import { formatCurrency, formatOverUnder } from '../utils/formatters'
import {
  filterActualsByRange, calcBudgetByCategory,
  buildVisibleRows, getUniqueValues,
} from '../utils/dataProcessing'
import CalendarBreakdownView from '../components/CalendarBreakdownView'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { DEPT_NAMES } from '../data/mockData'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_DEPTS = Object.keys(DEPT_NAMES)

const DEPT_COLORS  = { '101':'#0EA5A0','102':'#C05A2F','103':'#E8A838' }
const FIELD_COLORS = { department:'#0EA5A0', category:'#C05A2F', account:'#E8A838', grant:'#4A2E5A', vendor:'#9BA8B5' }
const FIELD_LABELS = { department:'Department', category:'Category', account:'Account', grant:'Grant', vendor:'Vendor' }
const ALL_DRILL_FIELDS = ['department','category','account','grant','vendor']

const INCOME_BUDGET_MONTHLY = {
  contributions: [230_000,280_000,295_000,195_000,205_000,220_000,250_000,275_000],
  merch:         [ 16_500, 20_000, 22_000, 14_000, 14_500, 16_000, 18_000, 19_500],
  other:         [  3_500,  4_000,  4_500,  2_800,  3_000,  3_400,  4_000,  4_500],
}

// Chart preset catalogue
const CHART_PRESETS = [
  { id:'monthly-income',   title:'Monthly Income Trend',   type:'area', xKey:'label', yKeys:['contributions','merch','other'],  source:'income',   colors:['#0EA5A0','#C05A2F','#E8A838'], stacked:false },
  { id:'monthly-expense',  title:'Monthly Expenses',       type:'bar',  xKey:'label', yKeys:['total'],                          source:'expenses', colors:['#C05A2F'],                    stacked:false },
  { id:'budget-vs-actual', title:'Budget vs Actual',       type:'bar',  xKey:'label', yKeys:['actual','budget'],                source:'bva',      colors:['#0EA5A0','#9BA8B5'],          stacked:false },
  { id:'dept-breakdown',   title:'Spending by Team',       type:'bar',  xKey:'dept',  yKeys:['amount'],                         source:'dept',     colors:['#0EA5A0'],                    stacked:false },
  { id:'cat-breakdown',    title:'Spend by Category',      type:'bar',  xKey:'category', yKeys:['amount'],                      source:'category', colors:['#E8A838'],                    stacked:false },
  { id:'net-position',     title:'Net Position Trend',     type:'line', xKey:'label', yKeys:['net'],                            source:'net',      colors:['#10B981'],                    stacked:false },
]

const DEFAULT_CHART_IDS = ['monthly-income','monthly-expense','budget-vs-actual','dept-breakdown','cat-breakdown','net-position']

const KPI_DEFS = [
  { id:'total-income',    label:'Total Income',    icon:'TrendingUp',  color:'#0EA5A0' },
  { id:'total-expenses',  label:'Total Expenses',  icon:'TrendingDown',color:'#C05A2F' },
  { id:'net-position',    label:'Net Position',    icon:'DollarSign',  color:'#10B981' },
  { id:'budget-variance', label:'Budget Variance', icon:'AlertTriangle',color:'#E8A838' },
]
const DEFAULT_KPI_IDS = ['total-income','total-expenses','net-position','budget-variance']

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n){ return String(n).padStart(2,'0') }
function ymd(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}` }
function monthKey(dateStr){ return dateStr.slice(0,7) }

function getMasterPresetRange(preset){
  const today = new Date()
  const todayStr = ymd(today.getFullYear(), today.getMonth()+1, today.getDate())
  if(preset==='full-fiscal')    return { startDate:'2025-10-01', endDate:'2026-09-30' }
  if(preset==='fiscal-ytd')     return { startDate:'2025-10-01', endDate:todayStr }
  if(preset==='full-operating') return { startDate:'2025-05-01', endDate:'2026-04-30' }
  if(preset==='operating-ytd')  return { startDate:'2025-05-01', endDate:todayStr }
  if(preset==='last-month'){
    const d=new Date(today.getFullYear(),today.getMonth()-1,1)
    const last=new Date(today.getFullYear(),today.getMonth(),0).getDate()
    return { startDate:ymd(d.getFullYear(),d.getMonth()+1,1), endDate:ymd(today.getFullYear(),today.getMonth(),last) }
  }
  if(preset==='last-3'){ const d=new Date(today); d.setMonth(d.getMonth()-3); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if(preset==='last-6'){ const d=new Date(today); d.setMonth(d.getMonth()-6); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  if(preset==='last-12'){ const d=new Date(today); d.setFullYear(d.getFullYear()-1); return { startDate:ymd(d.getFullYear(),d.getMonth()+1,d.getDate()), endDate:todayStr } }
  return { startDate:'2025-10-01', endDate:todayStr }
}
function presetLabel(p){
  return {'full-fiscal':'Full fiscal year','fiscal-ytd':'Fiscal YTD','full-operating':'Full operating year','operating-ytd':'Operating YTD','last-month':'Last month','last-3':'Last 3 months','last-6':'Last 6 months','last-12':'Last 12 months','custom':'Custom range'}[p]||'Date range'
}

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────────────────

function getIncomeInRange(incomeMonths, startDate, endDate){
  return incomeMonths.filter(m => m.date >= startDate && m.date <= endDate)
}

function groupByMonth(actuals){
  return actuals.reduce((acc,t)=>{
    const k = monthKey(t.date)
    acc[k] = (acc[k]||0) + t.amount
    return acc
  },{})
}

function numMonthsInRange(startDate, endDate){
  const s=new Date(startDate), e=new Date(endDate)
  return (e.getFullYear()-s.getFullYear())*12 + (e.getMonth()-s.getMonth()) + 1
}

/**
 * Build Recharts-ready data array for a chart preset.
 * incomeMonths comes from AppContext — all income charts update on import.
 */
function buildChartData(preset, actuals, dateRange, budgetFlat, scenario, incomeMonths){
  const { startDate, endDate } = dateRange
  const inRange   = filterActualsByRange(actuals, startDate, endDate)
  const incMonths = getIncomeInRange(incomeMonths, startDate, endDate)

  if(preset.source==='income'){
    return incMonths.map(m=>({
      label: m.label,
      contributions: Math.round(m.contributions/1000),
      merch:         Math.round(m.merch/1000),
      other:         Math.round(m.other/1000),
    }))
  }
  if(preset.source==='expenses'){
    const byMonth = groupByMonth(inRange)
    return incMonths.map(m=>({
      label: m.label,
      total: Math.round((byMonth[monthKey(m.date)]||0)/1000),
    }))
  }
  if(preset.source==='bva'){
    const byMonth   = groupByMonth(inRange)
    const n         = numMonthsInRange(startDate, endDate)
    const budgetRows= budgetFlat.filter(b=>b.scenario===scenario)
    const monthlyBudget = budgetRows.reduce((s,b)=>s+b.monthlyAmount,0)
    return incMonths.map(m=>({
      label:  m.label,
      actual: Math.round((byMonth[monthKey(m.date)]||0)/1000),
      budget: Math.round(monthlyBudget/1000),
    }))
  }
  if(preset.source==='dept'){
    const byDept = inRange.reduce((acc,t)=>{
      acc[t.department]=(acc[t.department]||0)+t.amount; return acc
    },{})
    return Object.entries(byDept).map(([dept,amt])=>({
      dept: DEPT_NAMES[dept]||dept, amount: Math.round(amt/1000),
    })).sort((a,b)=>b.amount-a.amount)
  }
  if(preset.source==='category'){
    const byCat = inRange.reduce((acc,t)=>{
      acc[t.category]=(acc[t.category]||0)+t.amount; return acc
    },{})
    return Object.entries(byCat).map(([cat,amt])=>({
      category: cat, amount: Math.round(amt/1000),
    })).sort((a,b)=>b.amount-a.amount)
  }
  if(preset.source==='net'){
    const byMonth = groupByMonth(inRange)
    return incMonths.map(m=>{
      const income = m.contributions + m.merch + m.other
      const exp    = byMonth[monthKey(m.date)]||0
      return { label:m.label, net:Math.round((income-exp)/1000) }
    })
  }
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterDatePicker
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_GROUPS = [
  { label:'Fiscal Year', items:[['full-fiscal','Full fiscal year'],['fiscal-ytd','Fiscal YTD']] },
  { label:'Operating Year', items:[['full-operating','Full operating year'],['operating-ytd','Operating YTD']] },
  { label:'Rolling', items:[['last-month','Last month'],['last-3','Last 3 months'],['last-6','Last 6 months'],['last-12','Last 12 months']] },
]

function MasterDatePicker({ dateRange, onApplyPreset, onApplyCustom, onClose }){
  const [start, setStart] = useState(dateRange.startDate||'')
  const [end,   setEnd]   = useState(dateRange.endDate||'')
  return (
    <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-72 p-4">
      {PRESET_GROUPS.map(g=>(
        <div key={g.label} className="mb-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{g.label}</div>
          {g.items.map(([id,lbl])=>(
            <button key={id} onClick={()=>{onApplyPreset(id);onClose()}}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${dateRange.preset===id?'bg-teal-50 text-teal-700 font-semibold':''}`}>
              {lbl}
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
  const allActive = !activeDepts || activeDepts.size === ALL_DEPTS.length
  return (
    <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52 py-2">
      <button onClick={()=>{ onSelectAll(); onClose() }}
        className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${allActive?'font-semibold text-teal-700':''}`}>
        {allActive ? <CheckSquare size={14} className="text-teal-600"/> : <Square size={14} className="text-gray-300"/>}
        All Teams
      </button>
      <div className="border-t border-gray-100 my-1"/>
      {ALL_DEPTS.map(code=>{
        const active = !activeDepts || activeDepts.has(code)
        return (
          <button key={code} onClick={()=>onToggle(code)}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0`}
              style={{ backgroundColor: active ? DEPT_COLORS[code] : 'transparent', border:`2px solid ${DEPT_COLORS[code]}` }}>
              {active && <Check size={9} className="text-white"/>}
            </div>
            <span className={active?'text-gray-800':'text-gray-400'}>{DEPT_NAMES[code]}</span>
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
  { id:'breakdown',     label:'Breakdown' },
  { id:'transactions',  label:'Transactions' },
  { id:'comments',      label:'Comments & Requests' },
  { id:'import',        label:'Import' },
  { id:'setup',         label:'⚙ Setup' },
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

  const allActive = !activeDepts || activeDepts.size === ALL_DEPTS.length
  const teamLabel = allActive ? 'All Teams' : `${activeDepts.size} Team${activeDepts.size!==1?'s':''}`

  return (
    <nav ref={navRef} className="sticky top-0 z-30 flex items-center gap-0 px-6 border-b border-gray-200 bg-white/95 backdrop-blur-sm" style={{height:48}}>
      {/* Tabs */}
      <div className="flex items-center gap-1 flex-1">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab===t.id?'border-teal-600 text-teal-700':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Team multi-select */}
        <div className="relative">
          <button onClick={()=>{ setShowTeam(p=>!p); setShowDate(false); setShowBudget(false) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!allActive?'bg-teal-50 border-teal-300 text-teal-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Building2 size={13}/>
            {teamLabel}
            <ChevronDown size={11}/>
          </button>
          {showTeam && <TeamMultiSelect activeDepts={activeDepts} onToggle={code=>{ onToggleDept(code) }} onSelectAll={onSelectAllDepts} onClose={()=>setShowTeam(false)}/>}
        </div>

        {/* Budget scenario */}
        <div className="relative">
          <button onClick={()=>{ setShowBudget(p=>!p); setShowDate(false); setShowTeam(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors">
            <BarChart2 size={13}/>
            {activeBudget||'Budget'}
            <ChevronDown size={11}/>
          </button>
          {showBudget && (
            <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52 py-2">
              {availableScenarios.map(s=>(
                <button key={s} onClick={()=>{ onSetBudget(s); setShowBudget(false) }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${activeBudget===s?'font-semibold text-teal-700':''}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
        <div className="relative">
          <button onClick={()=>{ setShowDate(p=>!p); setShowBudget(false); setShowTeam(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors">
            <Calendar size={13}/>
            {presetLabel(dateRange.preset)}
            <ChevronDown size={11}/>
          </button>
          {showDate && <MasterDatePicker dateRange={dateRange} onApplyPreset={onApplyPreset} onApplyCustom={onApplyCustom} onClose={()=>setShowDate(false)}/>}
        </div>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ def, actuals, budgetFlat, scenario, incomeMonths, dateRange, editMode, onRemove }){
  const { startDate, endDate } = dateRange
  const inRange = useMemo(()=>filterActualsByRange(actuals, startDate, endDate),[actuals,startDate,endDate])
  const incomeInRange = useMemo(()=>getIncomeInRange(incomeMonths, startDate, endDate),[incomeMonths,startDate,endDate])

  const totalExpenses = useMemo(()=>inRange.reduce((s,t)=>s+t.amount,0),[inRange])
  const totalIncome   = useMemo(()=>incomeInRange.reduce((s,m)=>s+(m.contributions+m.merch+m.other),0),[incomeInRange])
  const totalBudget   = useMemo(()=>{
    const n = numMonthsInRange(startDate, endDate)
    return budgetFlat.filter(b=>b.scenario===scenario).reduce((s,b)=>s+b.monthlyAmount*n,0)
  },[budgetFlat,scenario,startDate,endDate])

  let value, sub, subColor='text-gray-400'
  if(def.id==='total-income'){
    value = formatCurrency(totalIncome)
    sub   = `${incomeInRange.length} months`
  } else if(def.id==='total-expenses'){
    value = formatCurrency(totalExpenses)
    sub   = `${inRange.length} transactions`
  } else if(def.id==='net-position'){
    const net = totalIncome - totalExpenses
    value = formatCurrency(net)
    sub   = net>=0 ? 'Surplus' : 'Deficit'
    subColor = net>=0 ? 'text-emerald-600' : 'text-red-500'
  } else if(def.id==='budget-variance'){
    const delta = totalExpenses - totalBudget
    value = formatOverUnder(delta)
    sub   = delta<=0 ? `${Math.round(Math.abs(delta/totalBudget||0)*100)}% under budget` : `${Math.round((delta/(totalBudget||1))*100)}% over budget`
    subColor = delta<=0 ? 'text-emerald-600' : 'text-red-500'
  }

  const IconComp = def.icon==='TrendingUp'?TrendingUp:def.icon==='TrendingDown'?TrendingDown:def.icon==='DollarSign'?DollarSign:AlertTriangle

  return (
    <div className="relative bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
      {editMode && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{backgroundColor:def.color+'20'}}>
        <IconComp size={16} style={{color:def.color}}/>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{def.label}</div>
        <div className="text-xl font-bold text-gray-900">{value||'—'}</div>
        <div className={`text-xs mt-0.5 ${subColor}`}>{sub}</div>
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

function PresetChartRender({ preset, data }){
  if(!data || data.length===0) return (
    <div className="flex items-center justify-center h-full text-gray-300 text-xs">No data in range</div>
  )
  const { type, xKey, yKeys=[], colors=[], stacked } = preset
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
  const xAxis = <XAxis dataKey={xKey} tick={axisStyle} axisLine={false} tickLine={false}/>
  const yAxis = <YAxis tick={axisStyle} tickFormatter={fmtK} axisLine={false} tickLine={false} width={44}/>
  const tip   = <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v,n)=>[fmtK(v),n]}/>
  const leg   = yKeys.length>1 ? <Legend wrapperStyle={{fontSize:10,paddingTop:6}}/> : null
  const common = { data, margin:{top:4,right:4,left:0,bottom:0} }

  if(type==='area') return (
    <AreaChart {...common}>
      {grid}{xAxis}{yAxis}{tip}{leg}
      {yKeys.map((k,i)=>(
        <Area key={k} type="monotone" dataKey={k} name={k}
          fill={colors[i]+'33'} stroke={colors[i]} strokeWidth={2}
          stackId={stacked?'a':undefined}/>
      ))}
    </AreaChart>
  )
  if(type==='line') return (
    <LineChart {...common}>
      {grid}{xAxis}{yAxis}{tip}{leg}
      {yKeys.map((k,i)=>(
        <Line key={k} type="monotone" dataKey={k} name={k}
          stroke={colors[i]} strokeWidth={2} dot={false} activeDot={{r:4}}/>
      ))}
    </LineChart>
  )
  // default bar
  return (
    <BarChart {...common}>
      {grid}{xAxis}{yAxis}{tip}{leg}
      {yKeys.map((k,i)=>(
        <Bar key={k} dataKey={k} name={k} fill={colors[i]} radius={[3,3,0,0]}/>
      ))}
    </BarChart>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Panel wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartPanel({ title, subtitle, editMode, onRemove, children }){
  return (
    <div className="relative bg-white rounded-xl border border-gray-100 p-4" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
      {editMode && onRemove && (
        <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center z-10">
          <X size={11}/>
        </button>
      )}
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Builder Wizard
// ─────────────────────────────────────────────────────────────────────────────

const APP_SOURCES = CHART_PRESETS.map(p=>({ id:p.id, label:p.title, type:p.type }))

function ChartBuilderWizard({ onSave, onClose, actuals, budgetFlat, scenario, incomeMonths, dateRange }){
  // step 0 = series type, 1 = data mode, 2 = app source or manual rows, 3 = title + type + save
  const [step,      setStep]      = useState(0)
  const [isMulti,   setIsMulti]   = useState(false)
  const [dataMode,  setDataMode]  = useState(null)   // 'app' | 'manual'
  const [appSource, setAppSource] = useState(null)   // preset id
  const [chartType, setChartType] = useState('bar')
  const [title,     setTitle]     = useState('')
  const [rows,      setRows]      = useState([{label:'',v0:'',v1:''}])
  const [series,    setSeries]    = useState(['Series A','Series B'])

  function addRow(){ setRows(r=>[...r,{label:'',v0:'',v1:''}]) }
  function removeRow(i){ setRows(r=>r.filter((_,j)=>j!==i)) }
  function updateRow(i,field,val){ setRows(r=>r.map((row,j)=>j===i?{...row,[field]:val}:row)) }

  // Preview data for app-source charts
  const previewData = useMemo(()=>{
    if(dataMode!=='app'||!appSource) return []
    const preset = CHART_PRESETS.find(p=>p.id===appSource)
    if(!preset) return []
    return buildChartData(preset, actuals, dateRange, budgetFlat, scenario, incomeMonths)
  },[dataMode,appSource,actuals,dateRange,budgetFlat,scenario,incomeMonths])

  function handleSave(){
    if(dataMode==='app' && appSource){
      const preset = CHART_PRESETS.find(p=>p.id===appSource)
      if(!preset) return
      onSave({ ...preset, id:'custom-app-'+Date.now(), title:title||preset.title, type:chartType, source:appSource, manualData:null })
    } else {
      const yKeys   = isMulti ? ['v0','v1'] : ['v0']
      const names   = isMulti ? { v0:series[0]||'A', v1:series[1]||'B' } : { v0:series[0]||'Value' }
      const data    = rows.filter(r=>r.label).map(r=>({ label:r.label, v0:parseFloat(r.v0)||0, v1:isMulti?parseFloat(r.v1)||0:undefined }))
      onSave({ id:'custom-manual-'+Date.now(), title:title||'Custom Chart', type:chartType, source:'manual',
        xKey:'label', yKeys, seriesNames:names, colors:['#0EA5A0','#C05A2F'], manualData:data })
    }
    onClose()
  }

  const canSave = (dataMode==='app'&&appSource) || (dataMode==='manual'&&title&&rows.some(r=>r.label))

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose}/>
      <div className="w-[440px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {step>0 && <button onClick={()=>setStep(s=>s-1)} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={18}/></button>}
            <span className="font-semibold text-gray-800 text-sm">Add Chart</span>
            <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Step {step+1} of 3</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* ── Step 0: Series type ── */}
          {step===0 && (
            <>
              <p className="text-sm font-semibold text-gray-700">How many data series?</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id:false, label:'Simple', sub:'One X axis + one Y axis', icon:<BarChart2 size={22}/> },
                  { id:true,  label:'Multi-series', sub:'Compare two or more series', icon:<Layers size={22}/> },
                ].map(opt=>(
                  <button key={String(opt.id)} onClick={()=>{ setIsMulti(opt.id); setStep(1) }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${isMulti===opt.id?'border-teal-500 bg-teal-50':'border-gray-200 hover:border-gray-300'}`}>
                    <div className="text-teal-600">{opt.icon}</div>
                    <div className="font-semibold text-sm text-gray-800">{opt.label}</div>
                    <div className="text-[11px] text-gray-400 text-center">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Step 1: Data mode ── */}
          {step===1 && (
            <>
              <p className="text-sm font-semibold text-gray-700">Where does the data come from?</p>
              <div className="space-y-2">
                <button onClick={()=>{ setDataMode('app'); setStep(2) }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all text-left">
                  <Activity size={20} className="text-teal-600 flex-shrink-0"/>
                  <div>
                    <div className="font-semibold text-sm text-gray-800">From app data</div>
                    <div className="text-[11px] text-gray-400">Auto-updates when you import · actuals, budget, income</div>
                  </div>
                </button>
                <button onClick={()=>{ setDataMode('manual'); setStep(2) }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all text-left">
                  <FileText size={20} className="text-teal-600 flex-shrink-0"/>
                  <div>
                    <div className="font-semibold text-sm text-gray-800">Enter manually</div>
                    <div className="text-[11px] text-gray-400">Type in your own numbers · stored locally</div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ── Step 2a: App source picker ── */}
          {step===2 && dataMode==='app' && (
            <>
              <p className="text-sm font-semibold text-gray-700">Pick a data source</p>
              <div className="space-y-1.5">
                {APP_SOURCES.map(src=>{
                  const preset = CHART_PRESETS.find(p=>p.id===src.id)
                  const preview = preset ? buildChartData(preset, actuals, dateRange, budgetFlat, scenario, incomeMonths) : []
                  const hasData = preview.length > 0
                  return (
                    <button key={src.id} onClick={()=>setAppSource(src.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${appSource===src.id?'border-teal-500 bg-teal-50':'border-gray-100 hover:border-gray-200'}`}>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-medium text-gray-800">{src.label}</div>
                        <div className="text-[10px] text-gray-400">{src.type} · {hasData?`${preview.length} points`:'no data in range'}</div>
                      </div>
                      {appSource===src.id && <Check size={14} className="text-teal-600 flex-shrink-0"/>}
                    </button>
                  )
                })}
              </div>
              {appSource && previewData.length>0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                  <div className="text-[10px] text-gray-400 mb-2 font-semibold uppercase tracking-wider">Preview</div>
                  <ResponsiveContainer width="100%" height={100}>
                    <PresetChartRender preset={{...CHART_PRESETS.find(p=>p.id===appSource), type:chartType}} data={previewData}/>
                  </ResponsiveContainer>
                </div>
              )}
              {appSource && <button onClick={()=>setStep(3)} className="w-full bg-teal-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors mt-2">Continue →</button>}
            </>
          )}

          {/* ── Step 2b: Manual entry ── */}
          {step===2 && dataMode==='manual' && (
            <>
              <p className="text-sm font-semibold text-gray-700">Enter your data</p>
              {isMulti && (
                <div className="grid grid-cols-2 gap-2">
                  {[0,1].map(i=>(
                    <div key={i}>
                      <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Series {i+1} name</label>
                      <input value={series[i]} onChange={e=>setSeries(s=>s.map((v,j)=>j===i?e.target.value:v))}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder={`Series ${i+1}`}/>
                    </div>
                  ))}
                </div>
              )}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
                  style={{gridTemplateColumns:isMulti?'1fr 1fr 1fr auto':'1fr 1fr auto'}}>
                  <div className="px-3 py-2">Label</div>
                  <div className="px-3 py-2">{isMulti?(series[0]||'Series A'):'Value'}</div>
                  {isMulti && <div className="px-3 py-2">{series[1]||'Series B'}</div>}
                  <div className="px-3 py-2"/>
                </div>
                {rows.map((row,i)=>(
                  <div key={i} className="grid border-b border-gray-100 last:border-0"
                    style={{gridTemplateColumns:isMulti?'1fr 1fr 1fr auto':'1fr 1fr auto'}}>
                    <input value={row.label} onChange={e=>updateRow(i,'label',e.target.value)} placeholder="e.g. Oct"
                      className="px-3 py-2 text-sm border-r border-gray-100 focus:outline-none focus:bg-teal-50"/>
                    <input value={row.v0} onChange={e=>updateRow(i,'v0',e.target.value)} placeholder="0"
                      className="px-3 py-2 text-sm border-r border-gray-100 focus:outline-none focus:bg-teal-50"/>
                    {isMulti && <input value={row.v1} onChange={e=>updateRow(i,'v1',e.target.value)} placeholder="0"
                      className="px-3 py-2 text-sm border-r border-gray-100 focus:outline-none focus:bg-teal-50"/>}
                    <button onClick={()=>removeRow(i)} className="px-2 text-gray-300 hover:text-red-400"><X size={12}/></button>
                  </div>
                ))}
              </div>
              <button onClick={addRow} className="text-sm text-teal-600 font-medium hover:underline flex items-center gap-1">
                <Plus size={13}/> Add row
              </button>
              <button onClick={()=>setStep(3)} className="w-full bg-teal-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors">Continue →</button>
            </>
          )}

          {/* ── Step 3: Title + chart type + save ── */}
          {step===3 && (
            <>
              <p className="text-sm font-semibold text-gray-700">Finish up</p>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chart title</label>
                <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Monthly Revenue"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"/>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chart type</label>
                <div className="flex gap-2 mt-1">
                  {[['bar','Bar'],['line','Line'],['area','Area']].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setChartType(id)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${chartType===id?'border-teal-500 bg-teal-50 text-teal-700':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {/* Preview */}
              {dataMode==='app' && appSource && previewData.length>0 && (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-[10px] text-gray-400 mb-2 font-semibold uppercase tracking-wider">Preview</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <PresetChartRender preset={{...CHART_PRESETS.find(p=>p.id===appSource),type:chartType}} data={previewData}/>
                  </ResponsiveContainer>
                </div>
              )}
              {dataMode==='manual' && rows.some(r=>r.label) && (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <div className="text-[10px] text-gray-400 mb-2 font-semibold uppercase tracking-wider">Preview</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <PresetChartRender
                      preset={{ type:chartType, xKey:'label', yKeys:isMulti?['v0','v1']:['v0'], colors:['#0EA5A0','#C05A2F'], stacked:false }}
                      data={rows.filter(r=>r.label).map(r=>({label:r.label,v0:parseFloat(r.v0)||0,v1:isMulti?parseFloat(r.v1)||0:undefined}))}/>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — save on step 3 */}
        {step===3 && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button onClick={handleSave} disabled={!canSave}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${canSave?'bg-teal-600 text-white hover:bg-teal-700':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
              Add to dashboard
            </button>
          </div>
        )}
      </div>
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
    <div className="relative bg-white rounded-xl border border-gray-100 p-4" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
      {editMode && onRemove && <button onClick={onRemove} className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><X size={11}/></button>}
      <div className="text-xs font-semibold text-gray-700 mb-3">Budget Watch Areas</div>
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
// Overview Tab — three independently-editable sections
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ actuals, budgetFlat, scenario, incomeMonths, dateRange }){
  const [visibleKPIs,   setVisibleKPIs]   = useLocalStorage('master-kpi-ids',    DEFAULT_KPI_IDS)
  const [visibleCharts, setVisibleCharts] = useLocalStorage('master-chart-ids',  DEFAULT_CHART_IDS)
  const [savedCharts,   setSavedCharts]   = useLocalStorage('master-saved-charts',[])
  const [showBuilder,   setShowBuilder]   = useState(false)
  const [editKPI,       setEditKPI]       = useState(false)
  const [editCharts,    setEditCharts]    = useState(false)
  const [editWatch,     setEditWatch]     = useState(false)
  const [showWatch,     setShowWatch]     = useLocalStorage('master-show-watch',  true)

  // All charts = presets + custom saved
  const allCharts = useMemo(()=>[
    ...CHART_PRESETS.map(p=>({...p,isPreset:true})),
    ...savedCharts,
  ],[savedCharts])

  const activeCharts = useMemo(()=>
    allCharts.filter(c=>visibleCharts.includes(c.id))
  ,[allCharts,visibleCharts])

  // Build chart data — all charts share this map; income is live from AppContext
  const chartDataMap = useMemo(()=>{
    const map={}
    for(const c of allCharts){
      if(c.source==='manual') map[c.id] = c.manualData||[]
      else map[c.id] = buildChartData(c, actuals, dateRange, budgetFlat, scenario, incomeMonths)
    }
    return map
  },[allCharts,actuals,dateRange,budgetFlat,scenario,incomeMonths])

  function addPresetChart(id){
    if(!visibleCharts.includes(id)) setVisibleCharts(p=>[...p,id])
  }
  function addCustomChart(chart){
    setSavedCharts(p=>[...p,chart])
    setVisibleCharts(p=>[...p,chart.id])
  }
  function removeChart(id){
    setVisibleCharts(p=>p.filter(v=>v!==id))
    setSavedCharts(p=>p.filter(c=>c.id!==id))
  }
  function removeKPI(id){ setVisibleKPIs(p=>p.filter(v=>v!==id)) }
  function addKPI(id){ if(!visibleKPIs.includes(id)) setVisibleKPIs(p=>[...p,id]) }

  const hiddenPresets = CHART_PRESETS.filter(p=>!visibleCharts.includes(p.id))
  const hiddenKPIs    = KPI_DEFS.filter(k=>!visibleKPIs.includes(k.id))

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8" style={{backgroundColor:'var(--color-primary-bg)'}}>

      {/* ── KPI Section ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Key Metrics</span>
          <div className="flex items-center gap-2">
            {editKPI && hiddenKPIs.length>0 && hiddenKPIs.map(k=>(
              <button key={k.id} onClick={()=>addKPI(k.id)} className="text-[10px] px-2 py-1 rounded-full border border-dashed border-teal-400 text-teal-600 hover:bg-teal-50">
                + {k.label}
              </button>
            ))}
            <button onClick={()=>setEditKPI(p=>!p)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${editKPI?'border-teal-400 bg-teal-50 text-teal-700':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Settings size={11}/> {editKPI?'Done':'Edit'}
            </button>
          </div>
        </div>
        <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))'}}>
          {visibleKPIs.map(id=>{
            const def = KPI_DEFS.find(k=>k.id===id)
            if(!def) return null
            return <KPICard key={id} def={def} actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} incomeMonths={incomeMonths} dateRange={dateRange} editMode={editKPI} onRemove={()=>removeKPI(id)}/>
          })}
        </div>
      </section>

      {/* ── Charts Section ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Charts</span>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowBuilder(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-teal-400 text-teal-600 hover:bg-teal-50 transition-colors">
              <Plus size={11}/> Add Chart
            </button>
            <button onClick={()=>setEditCharts(p=>!p)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${editCharts?'border-teal-400 bg-teal-50 text-teal-700':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Settings size={11}/> {editCharts?'Done':'Edit'}
            </button>
          </div>
        </div>
        {/* Hidden preset restore bar */}
        {editCharts && hiddenPresets.length>0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] text-gray-400">Hidden:</span>
            {hiddenPresets.map(p=>(
              <button key={p.id} onClick={()=>addPresetChart(p.id)} className="text-[10px] px-2 py-1 rounded-full border border-dashed border-gray-400 text-gray-500 hover:bg-gray-50">
                + {p.title}
              </button>
            ))}
          </div>
        )}
        {activeCharts.length===0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            No charts visible — <button onClick={()=>setShowBuilder(true)} className="text-teal-600 underline">add one</button>
          </div>
        )}
        <div className="grid gap-4" style={{gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))'}}>
          {activeCharts.map(chart=>{
            const data   = chartDataMap[chart.id]||[]
            const preset = CHART_PRESETS.find(p=>p.id===chart.id)||chart
            return (
              <ChartPanel key={chart.id} title={chart.title} subtitle={`${presetLabel(dateRange.preset)} · ${data.length} points`}
                editMode={editCharts} onRemove={()=>removeChart(chart.id)}>
                <div style={{height:200}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PresetChartRender preset={preset} data={data}/>
                  </ResponsiveContainer>
                </div>
              </ChartPanel>
            )
          })}
        </div>
      </section>

      {/* ── Watch Areas Section ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Watch Areas</span>
          <div className="flex items-center gap-2">
            <button onClick={()=>setEditWatch(p=>!p)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${editWatch?'border-teal-400 bg-teal-50 text-teal-700':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Settings size={11}/> {editWatch?'Done':'Edit'}
            </button>
          </div>
        </div>
        <div className="max-w-sm">
          <WatchAreaPanel actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange} editMode={editWatch} onRemove={()=>setShowWatch(false)}/>
        </div>
      </section>

      {showBuilder && (
        <ChartBuilderWizard
          onSave={addCustomChart}
          onClose={()=>setShowBuilder(false)}
          actuals={actuals}
          budgetFlat={budgetFlat}
          scenario={scenario}
          incomeMonths={incomeMonths}
          dateRange={dateRange}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown Tab — replaces P&L + Teams; mirrors BreakdownPage logic
// ─────────────────────────────────────────────────────────────────────────────

function DeptStatusCards({ actuals, budgetFlat, scenario, dateRange, activeDepts }){
  const { startDate, endDate } = dateRange
  const inRange = useMemo(()=>filterActualsByRange(actuals,startDate,endDate),[actuals,startDate,endDate])
  const budgetByCat = useMemo(()=>calcBudgetByCategory(budgetFlat,scenario,startDate,endDate),[budgetFlat,scenario,startDate,endDate])

  const depts = activeDepts ? [...activeDepts] : ALL_DEPTS

  const cards = useMemo(()=>depts.map(code=>{
    const dActuals = inRange.filter(t=>t.department===code)
    const actual   = dActuals.reduce((s,t)=>s+t.amount,0)
    // Budget: sum categories belonging to this dept
    const dBudgetRows = budgetFlat.filter(b=>b.scenario===scenario && b.department===code)
    const n = numMonthsInRange(startDate,endDate)
    const budget = dBudgetRows.reduce((s,b)=>s+b.monthlyAmount*n,0)
    const pct = budget>0 ? Math.round(actual/budget*100) : null
    const delta = actual - budget
    return { code, actual, budget, pct, delta }
  }),[depts,inRange,budgetFlat,scenario,startDate,endDate])

  return (
    <div className="flex gap-3 px-5 py-3 border-b border-gray-100 overflow-x-auto">
      {cards.map(({code,actual,budget,pct,delta})=>{
        const color = DEPT_COLORS[code]||'#9BA8B5'
        const over  = delta>0
        return (
          <div key={code} className="flex-shrink-0 bg-white rounded-xl border border-gray-100 px-4 py-3 min-w-[170px]"
            style={{borderLeftColor:color,borderLeftWidth:3,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color}}>{DEPT_NAMES[code]||code}</div>
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

function BreakdownTab({ actuals, budgetFlat, scenario, dateRange, activeDepts }){
  const [drillOrder, setDrillOrder] = useLocalStorage('master-drill-order',['department','category','account','vendor'])
  const [hidden,     setHidden]     = useLocalStorage('master-bd-hidden',[])
  const [viewMode,   setViewMode]   = useState('summary')
  const [searchQ,    setSearchQ]    = useState('')
  const [openPath,   setOpenPath]   = useState([])
  const [sortCol,    setSortCol]    = useState(null)
  const [sortDir,    setSortDir]    = useState('desc')
  const [selectedTx, setSelectedTx] = useState(null)

  function handleSort(col){ if(sortCol===col){ setSortDir(d=>d==='desc'?'asc':'desc') } else { setSortCol(col); setSortDir('desc') } }

  const { startDate, endDate } = dateRange

  const dateFiltered = useMemo(()=>filterActualsByRange(actuals,startDate,endDate),[actuals,startDate,endDate])
  const deptFiltered = useMemo(()=>
    activeDepts ? dateFiltered.filter(t=>activeDepts.has(t.department)) : dateFiltered
  ,[dateFiltered,activeDepts])
  const unhidden = useMemo(()=>
    deptFiltered.filter(t=>!hidden.some(h=>(t[h.field]??'N/A')===h.value))
  ,[deptFiltered,hidden])
  const searchFiltered = useMemo(()=>{
    const q=searchQ.trim().toLowerCase()
    if(!q) return unhidden
    return unhidden.filter(t=>[t.vendor,t.description,t.category,t.account,t.grant].some(v=>v?.toLowerCase().includes(q)))
  },[unhidden,searchQ])

  const budgetByCat = useMemo(()=>{
    const depts = activeDepts ? [...activeDepts] : null
    return calcBudgetByCategory(budgetFlat,scenario,startDate,endDate,depts)
  },[budgetFlat,scenario,startDate,endDate,activeDepts])

  const sortConfig = useMemo(()=>sortCol?{col:sortCol,dir:sortDir}:null,[sortCol,sortDir])
  const visibleRows = useMemo(()=>
    buildVisibleRows(searchFiltered,drillOrder,openPath,budgetByCat,sortConfig)
  ,[searchFiltered,drillOrder,openPath,budgetByCat,sortConfig])

  const toggleRow = useCallback((depth,value)=>{
    setOpenPath(prev=>{ if(prev[depth]===value) return prev.slice(0,depth); const next=prev.slice(0,depth); next[depth]=value; return next })
  },[])
  function hideRow(field,value){ setHidden(p=>p.some(h=>h.field===field&&h.value===value)?p:[...p,{field,value}]) }
  function restoreHidden(field,value){ setHidden(p=>p.filter(h=>!(h.field===field&&h.value===value))) }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden">
      {/* Dept KPI cards */}
      <DeptStatusCards actuals={actuals} budgetFlat={budgetFlat} scenario={scenario} dateRange={dateRange} activeDepts={activeDepts}/>
      {/* Drill order bar */}
      <MasterDrillOrderBar drillOrder={drillOrder} setDrillOrder={setDrillOrder} openPath={openPath} setOpenPath={setOpenPath}
        searchQuery={searchQ} setSearchQuery={setSearchQ} viewMode={viewMode} setViewMode={setViewMode}/>
      {/* Hidden bar */}
      {hidden.length>0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-amber-50 flex-wrap">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Hidden:</span>
          {hidden.map(h=>(
            <button key={`${h.field}:${h.value}`} onClick={()=>restoreHidden(h.field,h.value)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-300 text-xs text-amber-700 hover:bg-amber-100">
              {h.value} <X size={9}/>
            </button>
          ))}
          <button onClick={()=>setHidden([])} className="text-xs text-amber-600 ml-auto hover:underline">Show all</button>
        </div>
      )}
      {/* Calendar view */}
      {viewMode==='calendar' && (
        <div className="flex-1 overflow-y-auto p-4" style={{backgroundColor:'var(--color-primary-bg)'}}>
          <CalendarBreakdownView transactions={unhidden} budgetFlat={budgetFlat} selectedScenario={scenario}
            drillOrder={drillOrder} dateRange={dateRange} deptNames={DEPT_NAMES}
            activeDepts={activeDepts} onHide={hideRow}/>
        </div>
      )}
      {/* Summary table */}
      {viewMode==='summary' && (
        <div className="flex-1 overflow-y-auto">
          <MasterTableHeader drillOrder={drillOrder} scenario={scenario} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}/>
          {visibleRows.length===0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              {searchQ ? `No results for "${searchQ}"` : 'No data in this date range'}
            </div>
          )}
          {visibleRows.map((row,i)=>{
            if(row.type==='transaction') return <MasterTxRow key={i} row={row} onSelect={setSelectedTx}/>
            return <MasterGroupRow key={i} row={row} onToggle={toggleRow} onHide={hideRow}/>
          })}
        </div>
      )}
      {/* Tx detail modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={()=>setSelectedTx(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-96 p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-gray-800">{selectedTx.vendor}</span>
              <button onClick={()=>setSelectedTx(null)}><X size={16} className="text-gray-400"/></button>
            </div>
            <div className="space-y-2 text-sm">
              {[['Amount',formatCurrency(selectedTx.amount,{compact:false})],['Date',selectedTx.date],['Department',DEPT_NAMES[selectedTx.department]||selectedTx.department],['Category',selectedTx.category],['Account',selectedTx.account],selectedTx.grant&&['Grant',selectedTx.grant],selectedTx.description&&['Note',selectedTx.description]].filter(Boolean).map(([k,v])=>(
                <div key={k} className="flex gap-3"><span className="text-gray-400 w-24 flex-shrink-0">{k}</span><span className="text-gray-800">{v}</span></div>
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

  const allTeams    = useMemo(()=>getUniqueValues(deptRows,'department').map(d=>DEPT_NAMES[d]||d),[deptRows])
  const allCats     = useMemo(()=>getUniqueValues(deptRows,'category'),[deptRows])
  const allVendors  = useMemo(()=>getUniqueValues(deptRows,'vendor'),[deptRows])
  const allGrants   = useMemo(()=>getUniqueValues(deptRows,'grant').filter(Boolean),[deptRows])

  const filtered = useMemo(()=>{
    let rows = deptRows
    const q = search.trim().toLowerCase()
    if(q) rows = rows.filter(t=>[t.vendor,t.description,t.category,t.account,t.grant].some(v=>v?.toLowerCase().includes(q)))
    if(teamFilter.length)   rows = rows.filter(t=>teamFilter.includes(DEPT_NAMES[t.department]||t.department))
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
                  {DEPT_NAMES[t.department]||t.department}</span></td>
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
// Import Tab — actuals, budget, and income CSV upload
// ─────────────────────────────────────────────────────────────────────────────

function DropZone({ onFile }){
  const [drag, setDrag] = useState(false)
  const ref = useRef(null)
  function handleDrop(e){ e.preventDefault(); setDrag(false); const f=e.dataTransfer.files[0]; if(f) onFile(f) }
  function handleFile(e){ const f=e.target.files[0]; if(f) onFile(f) }
  return (
    <div onDragOver={e=>{ e.preventDefault(); setDrag(true) }} onDragLeave={()=>setDrag(false)} onDrop={handleDrop}
      onClick={()=>ref.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${drag?'border-teal-400 bg-teal-50':'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
      <input ref={ref} type="file" accept=".csv" className="hidden" onChange={handleFile}/>
      <Upload size={24} className={`mx-auto mb-2 ${drag?'text-teal-500':'text-gray-300'}`}/>
      <p className="text-sm font-medium text-gray-600">Drop CSV here or click to browse</p>
      <p className="text-xs text-gray-400 mt-1">Accepts .csv files</p>
    </div>
  )
}

function parseCSV(text){
  const lines = text.trim().split('\n').map(l=>l.trim()).filter(Boolean)
  if(lines.length<2) return []
  const headers = lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim())
  return lines.slice(1).map(line=>{
    const vals=[]; let cur='',inQ=false
    for(const ch of line){
      if(ch==='"'){ inQ=!inQ } else if(ch===','&&!inQ){ vals.push(cur.trim()); cur='' } else { cur+=ch }
    }
    vals.push(cur.trim())
    return Object.fromEntries(headers.map((h,i)=>[h,vals[i]??'']))
  })
}

function findCol(row,...names){
  const keys=Object.keys(row)
  for(const n of names){
    const k=keys.find(k=>k.toLowerCase().replace(/\s+/g,'').includes(n.toLowerCase()))
    if(k) return row[k]
  }
  return ''
}

function parseDate(s){ const m=String(s||'').match(/(\d{4})-(\d{1,2})-(\d{1,2})/); return m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:'' }
function parseAmt(s){ return parseFloat(String(s||'').replace(/[$,]/g,''))||0 }
function monthLabel(dateStr){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(dateStr.slice(5,7),10)-1]||dateStr.slice(0,7) }

function MasterImportTab({ appendActuals, replaceActuals, appendBudget, replaceBudget, appendIncome, replaceIncome, previousActuals, restorePreviousActuals, previousIncome, restorePreviousIncome }){
  const [subTab, setSubTab] = useState('actuals')
  const [preview, setPreview] = useState(null)
  const [mode,    setMode]    = useState('replace')
  const [success, setSuccess] = useState(null)
  const [error,   setError]   = useState(null)

  function reset(){ setPreview(null); setSuccess(null); setError(null) }

  function handleFile(type, file){
    reset()
    const reader = new FileReader()
    reader.onload = e=>{
      try{
        const rows = parseCSV(e.target.result)
        if(rows.length===0){ setError('No data rows found in file.'); return }
        let mapped
        if(type==='actuals'){
          mapped = rows.map(r=>({
            date:       parseDate(findCol(r,'date')),
            amount:     parseAmt(findCol(r,'amount','amt')),
            department: findCol(r,'department','dept','dept_code'),
            vendor:     findCol(r,'vendor'),
            category:   findCol(r,'category','cat'),
            account:    findCol(r,'account','acct','gl_account'),
            grant:      findCol(r,'grant','fund','grant_code')||null,
            description:findCol(r,'description','memo','note','desc'),
          })).filter(r=>r.date&&r.amount)
        } else if(type==='budget'){
          mapped = rows.map(r=>({
            department:    findCol(r,'department','dept'),
            category:      findCol(r,'category','cat'),
            scenario:      findCol(r,'scenario','plan','budget_name')||'Planned Spend',
            monthlyAmount: parseAmt(findCol(r,'monthly','monthly_amount','amount')),
          })).filter(r=>r.department&&r.category)
        } else if(type==='income'){
          mapped = rows.map(r=>({
            date:          parseDate(findCol(r,'date','month')),
            label:         findCol(r,'label','month_label')||monthLabel(parseDate(findCol(r,'date','month'))),
            contributions: parseAmt(findCol(r,'contributions','giving','contributions_total')),
            merch:         parseAmt(findCol(r,'merch','merchandise','merch_revenue')),
            other:         parseAmt(findCol(r,'other','other_income','other_revenue')),
          })).filter(r=>r.date)
        }
        setPreview({ type, mapped, count:mapped.length, sample:mapped.slice(0,3) })
      } catch(err){ setError('Could not parse file: '+err.message) }
    }
    reader.readAsText(file)
  }

  function commit(){
    if(!preview) return
    const { type, mapped } = preview
    if(type==='actuals'){ if(mode==='append') appendActuals(mapped); else replaceActuals(mapped) }
    if(type==='budget'){  if(mode==='append') appendBudget(mapped);  else replaceBudget(mapped) }
    if(type==='income'){  if(mode==='append') appendIncome(mapped);  else replaceIncome(mapped) }
    setSuccess(`Imported ${preview.count} rows.`)
    setPreview(null)
  }

  const SUB_TABS = [
    { id:'actuals', label:'Actuals' },
    { id:'budget',  label:'Budget' },
    { id:'income',  label:'Income' },
  ]

  const TEMPLATES = {
    actuals: 'date,amount,department,vendor,category,account,grant,description\n2026-01-15,5000,101,Vendor Name,Software,Software Subscriptions,,SaaS renewal',
    budget:  'department,category,scenario,monthly_amount\n101,Software,Planned Spend,8000',
    income:  'date,label,contributions,merch,other\n2026-01-01,Jan,185000,13500,2800',
  }

  function downloadTemplate(type){
    const blob = new Blob([TEMPLATES[type]],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${type}-template.csv`; a.click()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto space-y-6">
      {/* Sub-tab selector */}
      <div className="flex gap-1 border-b border-gray-200">
        {SUB_TABS.map(t=>(
          <button key={t.id} onClick={()=>{ setSubTab(t.id); reset() }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab===t.id?'border-teal-600 text-teal-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Template download */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm text-gray-800">Import {SUB_TABS.find(t=>t.id===subTab)?.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{
            subTab==='actuals'?'date, amount, department, vendor, category, account, grant, description':
            subTab==='budget'?'department, category, scenario, monthly_amount':
            'date, label, contributions, merch, other'
          }</div>
        </div>
        <button onClick={()=>downloadTemplate(subTab)} className="flex items-center gap-1.5 text-xs text-teal-600 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50">
          <Download size={12}/> Template
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        {[['replace','Replace all'],['append','Append']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setMode(id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${mode===id?'border-teal-500 bg-teal-50 text-teal-700':'border-gray-200 text-gray-500'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      {!preview && !success && <DropZone onFile={f=>handleFile(subTab,f)}/>}

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}<button onClick={reset} className="ml-2 text-red-400 hover:text-red-600"><X size={12}/></button></div>}

      {/* Preview */}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-gray-800">{preview.count} rows ready to {mode}</div>
              <div className="text-xs text-gray-400 mt-0.5">Sample: {JSON.stringify(preview.sample[0])}</div>
            </div>
            <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
          </div>
          <div className="flex gap-2">
            <button onClick={commit} className="flex-1 bg-teal-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-teal-700">
              Confirm import
            </button>
            <button onClick={reset} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Check size={14}/> {success}
          </div>
          <div className="flex gap-2">
            {subTab==='actuals' && previousActuals && <button onClick={()=>{ restorePreviousActuals(); setSuccess(null) }} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><RefreshCw size={10}/>Undo</button>}
            {subTab==='income'  && previousIncome  && <button onClick={()=>{ restorePreviousIncome();  setSuccess(null) }} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><RefreshCw size={10}/>Undo</button>}
            <button onClick={()=>{ reset() }} className="text-xs text-gray-400 hover:text-gray-600">Import another file</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: MasterDashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function MasterDashboard(){
  const {
    orgConfig,
    actuals, appendActuals, replaceActuals,
    budgetFlat, appendBudget, replaceBudget,
    incomeMonths, appendIncome, replaceIncome, previousIncome, restorePreviousIncome,
    availableScenarios, selectedScenario, setSelectedScenario,
    previousActuals, restorePreviousActuals,
  } = useApp()

  const [activeTab,   setActiveTab]   = useState('overview')
  const [activeDepts, setActiveDepts] = useState(null) // null = all

  // Local date range (master dashboard has its own, independent of AppContext global)
  const defaultRange = getMasterPresetRange('fiscal-ytd')
  const [dateRange, setDateRange] = useState({ preset:'fiscal-ytd', ...defaultRange })

  function applyPreset(p){ setDateRange({ preset:p, ...getMasterPresetRange(p) }) }
  function applyCustom(s,e){ setDateRange({ preset:'custom', startDate:s, endDate:e }) }

  function toggleDept(code){
    setActiveDepts(prev=>{
      const all = new Set(ALL_DEPTS)
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
    <div className="flex flex-col min-h-screen bg-white">
      <MasterNav
        activeTab={activeTab} setActiveTab={setActiveTab}
        dateRange={dateRange} onApplyPreset={applyPreset} onApplyCustom={applyCustom}
        activeDepts={activeDepts} onToggleDept={toggleDept} onSelectAllDepts={()=>setActiveDepts(null)}
        activeBudget={selectedScenario} availableScenarios={availableScenarios} onSetBudget={setSelectedScenario}/>

      {activeTab==='overview'      && <OverviewTab {...tabProps}/>}
      {activeTab==='breakdown'     && <BreakdownTab {...tabProps}/>}
      {activeTab==='transactions'  && <MasterTransactionsTab {...tabProps}/>}
      {activeTab==='comments'      && <div className="flex-1"><CommentsPage/></div>}
      {activeTab==='import'        && (
        <MasterImportTab
          appendActuals={appendActuals} replaceActuals={replaceActuals}
          appendBudget={appendBudget}   replaceBudget={replaceBudget}
          appendIncome={appendIncome}   replaceIncome={replaceIncome}
          previousActuals={previousActuals} restorePreviousActuals={restorePreviousActuals}
          previousIncome={previousIncome}   restorePreviousIncome={restorePreviousIncome}/>
      )}
      {activeTab==='setup' && <SetupPage/>}
    </div>
  )
}
