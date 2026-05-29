/**
 * ChartSlot.jsx — Switchable chart panel for the ELT Executive Dashboard.
 *
 * Each slot shows a gear icon on hover to open a chart picker. No chart-type
 * toggle — each chart uses the most natural visualization. Preferences saved
 * to localStorage key `elt_chart_prefs`.
 */

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Settings, X, Check, AlertCircle, BarChart2, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '../utils/formatters'
import { filterActualsByRange, calcBudgetByCategory } from '../utils/dataProcessing'
import { STATUS_COLORS, getTeamColor } from '../constants/colors'
import { supabase, ORG_ID } from '../lib/supabase'

// ─── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'elt_chart_prefs'  // local fallback while Supabase loads

// Read/write chart slot prefs via org_chart_preferences (key = "elt_slot:<slotId>")
async function loadSlotPrefsFromDB() {
  if (!ORG_ID) return {}
  const { data } = await supabase
    .from('org_chart_preferences')
    .select('chart_key, chart_type')
    .eq('org_id', ORG_ID)
    .like('chart_key', 'elt_slot:%')
  if (!data?.length) return {}
  const map = {}
  data.forEach(r => { map[r.chart_key.replace('elt_slot:', '')] = r.chart_type })
  return map
}

async function saveSlotPrefToDB(slotId, chartId) {
  if (!ORG_ID) return
  supabase.from('org_chart_preferences').upsert(
    { org_id: ORG_ID, chart_key: `elt_slot:${slotId}`, chart_type: chartId, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,chart_key' }
  )
}

const DEFAULT_SLOT_CHARTS = {
  'new-patrons-yoy':           'total_patrons_yoy',
  'patron-base':               'recurring_patron_base',
  'giving-vs-budget':          'total_giving_yoy',
  'net-position-by-month':     'net_position_by_month',
  'cash-position':             'cash_position',
  'cash-position-above-floor': 'cash_above_floor',
  'team-spend':                'team_spend',
  'budget-watch-areas':        'budget_watch',
  'patron-watch-areas':        'patron_watch',
}

const CARD_STYLE = {
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
}

const TIP = {
  backgroundColor: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
}

const $ = v =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K`
  : `$${Math.round(v)}`

// Palette — index 0 = most recent year (darkest/primary)
const YR_COLORS = [
  'var(--color-primary, #0A7EA4)',
  '#C05A2F',
  '#E8A838',
  '#9BA8B5',
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const GRID  = <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false}/>
const XAXIS = (key = 'label') => <XAxis dataKey={key} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
const YAXIS = (fmt) => <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={fmt} axisLine={false} tickLine={false}/>
const LEG   = <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
const M     = { top: 5, right: 5, left: 0, bottom: 0 }
const ML    = { top: 5, right: 5, left: -20, bottom: 0 }

function EmptyState({ msg, hint }) {
  return (
    <div className="flex flex-col items-center justify-center h-44 gap-2 text-center px-4">
      <AlertCircle size={20} className="text-gray-200"/>
      <p className="text-xs text-gray-400 font-medium">{msg}</p>
      {hint && <p className="text-[10px] text-gray-300 leading-relaxed">{hint}</p>}
    </div>
  )
}

function TypeToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
      <button onClick={() => onChange('bar')} title="Bar chart"
        className={`px-2 py-1 flex items-center transition-colors ${value === 'bar' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
        <BarChart2 size={11}/>
      </button>
      <button onClick={() => onChange('line')} title="Line chart"
        className={`px-2 py-1 flex items-center transition-colors ${value === 'line' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-50'}`}>
        <TrendingUp size={11}/>
      </button>
    </div>
  )
}

/** Return the last `n` years ending at current year, oldest first. */
function lastYears(n = 4) {
  const cur = new Date().getFullYear()
  return Array.from({ length: n }, (_, i) => String(cur - (n - 1 - i)))
}

/** Build a Jan–Dec YoY dataset from a map of { year: { month: value } }. */
function buildYoYData(byYearMonth, years) {
  return MONTHS.map((m, i) => {
    const row = { month: m }
    years.forEach(yr => { row[`y${yr}`] = byYearMonth[yr]?.[i + 1] ?? null })
    return row
  })
}

// ─── Chart body components ─────────────────────────────────────────────────────
// Each receives: { patronData, actuals, budgetFlat, cashData, dateRange, scenario }

// 1. Total Giving YoY — income actuals, last 4 years, Jan–Dec lines
function TotalGivingYoY({ actuals = [] }) {
  const years = useMemo(lastYears, [])
  const chartData = useMemo(() => {
    const map = {}
    actuals.forEach(t => {
      const p = t.period || t.date?.slice(0, 7)
      if (!p || t.record_type !== 'income') return
      const [yr, mo] = p.split('-')
      if (!years.includes(yr)) return
      if (!map[yr]) map[yr] = {}
      map[yr][+mo] = (map[yr][+mo] || 0) + Math.abs(t.amount || 0)
    })
    return buildYoYData(map, years)
  }, [actuals, years])

  if (!chartData.some(r => years.some(yr => r[`y${yr}`] != null)))
    return <EmptyState msg="No income data for the last 4 years" hint="Import actuals to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={M}>
        {GRID}{XAXIS('month')}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [v != null ? formatCurrency(v, { compact: true }) : '—', n]}/>{LEG}
        {years.map((yr, i) => {
          const isCur = i === years.length - 1
          return <Line key={yr} type="monotone" dataKey={`y${yr}`} name={yr}
            stroke={YR_COLORS[years.length - 1 - i]}
            strokeWidth={isCur ? 2.5 : 1.8}
            strokeDasharray={isCur ? undefined : '5 3'}
            opacity={isCur ? 1 : 0.75}
            dot={false} activeDot={isCur ? { r: 4 } : false} connectNulls={false}/>
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}

// 2. Total Patrons YoY — total_active_patrons, last 4 years, Jan–Dec lines
function TotalPatronsYoY({ patronData = [] }) {
  const years = useMemo(lastYears, [])
  const chartData = useMemo(() => {
    const map = {}
    patronData.forEach(r => {
      if (!r.period) return
      const [yr, mo] = r.period.split('-')
      if (!years.includes(yr)) return
      if (!map[yr]) map[yr] = {}
      map[yr][+mo] = r.total_active_patrons
    })
    return buildYoYData(map, years)
  }, [patronData, years])

  if (!chartData.some(r => years.some(yr => r[`y${yr}`] != null)))
    return <EmptyState msg="No patron data for the last 4 years" hint="Import patron data to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={ML}>
        {GRID}{XAXIS('month')}{YAXIS()}<Tooltip contentStyle={TIP} formatter={(v, n) => [v?.toLocaleString() ?? '—', n]}/>{LEG}
        {years.map((yr, i) => {
          const isCur = i === years.length - 1
          return <Line key={yr} type="monotone" dataKey={`y${yr}`} name={yr}
            stroke={YR_COLORS[years.length - 1 - i]}
            strokeWidth={isCur ? 2.5 : 1.8}
            strokeDasharray={isCur ? undefined : '5 3'}
            opacity={isCur ? 1 : 0.75}
            dot={false} activeDot={isCur ? { r: 4 } : false} connectNulls={false}/>
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}

// 3. Recurring Patron Base — bar (default) or line
function RecurringPatronBase({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [type, setType] = useState('bar')
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), count: r.recurring_patron_count }
      })
  , [patronData, sp, ep])

  if (!chartData.length || chartData.every(r => r.count == null))
    return <EmptyState msg="No recurring patron data in range" hint="Requires recurring_patron_count field"/>

  return (
    <div>
      <div className="flex justify-end mb-2"><TypeToggle value={type} onChange={setType}/></div>
      <ResponsiveContainer width="100%" height={178}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS()}<Tooltip contentStyle={TIP} formatter={v => [v?.toLocaleString(), 'Recurring Patrons']}/>
            <Line type="monotone" dataKey="count" name="Recurring Patrons" stroke="var(--color-primary, #0A7EA4)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS()}<Tooltip contentStyle={TIP} formatter={v => [v?.toLocaleString(), 'Recurring Patrons']}/>
            <Bar dataKey="count" name="Recurring Patrons" fill="var(--color-primary, #0A7EA4)" radius={[4, 4, 0, 0]}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 4. Total Active Patrons — area chart over time
function TotalActivePatrons({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`, patrons: r.total_active_patrons }
      })
  , [patronData, sp, ep])

  if (!chartData.length || chartData.every(r => r.patrons == null))
    return <EmptyState msg="No patron data in range" hint="Import patron data to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={ML}>
        {GRID}{XAXIS()}{YAXIS()}<Tooltip contentStyle={TIP} formatter={v => [v?.toLocaleString(), 'Active Patrons']}/>
        <Area type="monotone" dataKey="patrons" name="Active Patrons"
          stroke="var(--color-primary, #0A7EA4)" fill="var(--color-primary, #0A7EA4)" fillOpacity={0.12} strokeWidth={2.5} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// 5. Monthly Giving Totals — stacked bar (default) or lines
function GivingTotals({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [type, setType] = useState('bar')
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label:       new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          recurring:   r.recurring_giving_total   ?? null,
          spontaneous: r.spontaneous_giving_total ?? null,
        }
      })
  , [patronData, sp, ep])

  if (!chartData.length || chartData.every(r => r.recurring == null && r.spontaneous == null))
    return <EmptyState msg="No giving total data in range" hint="Requires recurring_giving_total or spontaneous_giving_total"/>

  return (
    <div>
      <div className="flex justify-end mb-2"><TypeToggle value={type} onChange={setType}/></div>
      <ResponsiveContainer width="100%" height={178}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: false }), n]}/>{LEG}
            <Line type="monotone" dataKey="recurring"   name="Recurring"   stroke="var(--color-primary, #0A7EA4)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
            <Line type="monotone" dataKey="spontaneous" name="Spontaneous" stroke="#E8A838" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: false }), n]}/>{LEG}
            <Bar dataKey="recurring"   name="Recurring"   fill="var(--color-primary, #0A7EA4)" stackId="g" radius={[0, 0, 0, 0]}/>
            <Bar dataKey="spontaneous" name="Spontaneous" fill="#E8A838"                        stackId="g" radius={[4, 4, 0, 0]}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 6. Avg Gift Size — line chart
function AvgGiftSize({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), avg: r.avg_gift_size ?? null }
      })
  , [patronData, sp, ep])

  if (!chartData.length || chartData.every(r => r.avg == null))
    return <EmptyState msg="No avg gift size data in range" hint="Requires avg_gift_size field"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={M}>
        {GRID}{XAXIS()}{YAXIS(v => `$${v}`)}<Tooltip contentStyle={TIP} formatter={v => [formatCurrency(v, { compact: false }), 'Avg Gift']}/>
        <Line type="monotone" dataKey="avg" name="Avg Gift Size" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 7. Giving vs Budget — grouped bars (default) or lines, with monthly/cumulative toggle
function GivingVsBudget({ actuals = [], budgetFlat = [], dateRange = {}, scenario = '' }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [mode, setMode] = useState('monthly')
  const [type, setType] = useState('bar')

  const chartData = useMemo(() => {
    const aByP = {}, bByP = {}
    actuals.forEach(t => {
      const p = t.period || t.date?.slice(0, 7)
      if (!p || p < sp || p > ep || t.record_type !== 'income') return
      aByP[p] = (aByP[p] || 0) + Math.abs(t.amount || 0)
    })
    budgetFlat.forEach(b => {
      if (!b.period || b.period < sp || b.period > ep || b.scenario !== scenario || b.record_type !== 'income') return
      bByP[b.period] = (bByP[b.period] || 0) + Math.abs(b.amount || 0)
    })
    const periods = [...new Set([...Object.keys(aByP), ...Object.keys(bByP)])].sort()
    let cA = 0, cB = 0
    return periods.map(p => {
      const [y, m] = p.split('-')
      const a = aByP[p] || 0, b = bByP[p] || 0
      cA += a; cB += b
      return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), actual: mode === 'cumulative' ? cA : a, budget: mode === 'cumulative' ? cB : b }
    })
  }, [actuals, budgetFlat, scenario, sp, ep, mode])

  if (!chartData.length)
    return <EmptyState msg="No income data in range" hint="Import actuals or budget to populate"/>

  return (
    <div>
      <div className="flex justify-end items-center gap-2 mb-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {['monthly', 'cumulative'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${mode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {m === 'monthly' ? 'Mo' : 'Cu'}
            </button>
          ))}
        </div>
        <TypeToggle value={type} onChange={setType}/>
      </div>
      <ResponsiveContainer width="100%" height={168}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>{LEG}
            <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--color-primary, #0A7EA4)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
            <Line type="monotone" dataKey="budget" name="Budget" stroke="#E8A838" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false}/>
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>{LEG}
            <Bar dataKey="actual" name="Actual" fill="var(--color-primary, #0A7EA4)" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="budget" name="Budget" fill="#E8A838"                        radius={[4, 4, 0, 0]} opacity={0.7}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 8. Expense vs Budget — grouped bars (default) or lines
function ExpenseVsBudget({ actuals = [], budgetFlat = [], dateRange = {}, scenario = '' }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [type, setType] = useState('bar')
  const chartData = useMemo(() => {
    const aByP = {}, bByP = {}
    actuals.forEach(t => {
      const p = t.period || t.date?.slice(0, 7)
      if (!p || p < sp || p > ep || t.record_type !== 'expense') return
      aByP[p] = (aByP[p] || 0) + Math.abs(t.amount || 0)
    })
    budgetFlat.forEach(b => {
      if (!b.period || b.period < sp || b.period > ep || b.scenario !== scenario || b.record_type !== 'expense') return
      bByP[b.period] = (bByP[b.period] || 0) + Math.abs(b.amount || 0)
    })
    const periods = [...new Set([...Object.keys(aByP), ...Object.keys(bByP)])].sort()
    return periods.map(p => {
      const [y, m] = p.split('-')
      return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), actual: aByP[p] || 0, budget: bByP[p] || 0 }
    })
  }, [actuals, budgetFlat, scenario, sp, ep])

  if (!chartData.length)
    return <EmptyState msg="No expense data in range" hint="Import actuals or budget to populate"/>

  return (
    <div>
      <div className="flex justify-end mb-2"><TypeToggle value={type} onChange={setType}/></div>
      <ResponsiveContainer width="100%" height={178}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>{LEG}
            <Line type="monotone" dataKey="actual" name="Actual Expenses" stroke="#EF4444" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
            <Line type="monotone" dataKey="budget" name="Budget"          stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false}/>
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={M}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>{LEG}
            <Bar dataKey="actual" name="Actual Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} opacity={0.85}/>
            <Bar dataKey="budget" name="Budget"          fill="#9CA3AF" radius={[4, 4, 0, 0]} opacity={0.65}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 9. Expense vs Prior Year — two lines
function ExpenseVsPriorYear({ actuals = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() => {
    const byP = {}
    actuals.forEach(t => {
      const p = t.period || t.date?.slice(0, 7)
      if (!p || t.record_type !== 'expense') return
      byP[p] = (byP[p] || 0) + Math.abs(t.amount || 0)
    })
    const rows = []
    let cur = sp
    while (cur <= ep) {
      const [y, m] = cur.split('-')
      rows.push({
        label:   new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`,
        current: byP[cur]             ?? null,
        prior:   byP[`${+y - 1}-${m}`] ?? null,
      })
      const next = new Date(+y, +m, 1)
      cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    }
    return rows
  }, [actuals, sp, ep])

  if (!chartData.length || chartData.every(r => r.current == null && r.prior == null))
    return <EmptyState msg="No expense data in range" hint="Import actuals to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={M}>
        {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>{LEG}
        <Line type="monotone" dataKey="current" name="Current Year" stroke="#EF4444" strokeWidth={2.5} dot={false} connectNulls={false}/>
        <Line type="monotone" dataKey="prior"   name="Prior Year"   stroke="#9CA3AF" strokeWidth={1.8} strokeDasharray="5 3" dot={false} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 10. Cash Balance — area with reserve floor dashed line
function CashBalance({ cashData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    cashData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), cash: r.cash_balance ?? null, floor: r.reserve_floor ?? null }
      })
  , [cashData, sp, ep])

  if (!chartData.length)
    return <EmptyState msg="No cash flow data in range" hint="Import cash flow data to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={M}>
        {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: false }), n]}/>{LEG}
        <Area type="monotone" dataKey="cash"  name="Cash Balance"   stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.12} strokeWidth={2.5}/>
        <Area type="monotone" dataKey="floor" name="Reserve Floor"  stroke="#EF4444" fill="transparent" fillOpacity={0} strokeWidth={1.5} strokeDasharray="5 3"/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// 11. Patron Retention Rate — line chart
function RetentionRate({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return { label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }), rate: r.retention_rate != null ? Math.round(r.retention_rate * 1000) / 10 : null }
      })
  , [patronData, sp, ep])

  if (!chartData.length || chartData.every(r => r.rate == null))
    return <EmptyState msg="No retention rate data available" hint="Requires retention_rate — not available from raw giving imports"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={M}>
        {GRID}{XAXIS()}{YAXIS(v => `${v}%`)}
        <Tooltip contentStyle={TIP} formatter={v => [`${v?.toFixed(1)}%`, 'Retention Rate']}/>
        <ReferenceLine y={80} stroke="#E8A838" strokeDasharray="4 2" label={{ value: '80%', position: 'right', fontSize: 9, fill: '#E8A838' }}/>
        <Line type="monotone" dataKey="rate" name="Retention Rate" stroke="#8B5CF6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Operational chart components ─────────────────────────────────────────────

// 12. Net Position by Month — bar colored by positive/negative
function NetPositionByMonth({ actuals = [], incomeMonths = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() => {
    const expByP = {}
    filterActualsByRange(actuals, dateRange.startDate || sp, dateRange.endDate || ep)
      .filter(t => t.record_type !== 'income')
      .forEach(t => {
        const p = t.period || t.date?.slice(0, 7)
        if (p) expByP[p] = (expByP[p] || 0) + Math.abs(t.amount || 0)
      })
    const incByP = {}
    ;(incomeMonths || []).forEach(m => {
      const p = m.period || m.date?.slice(0, 7)
      if (!p || p < sp || p > ep) return
      incByP[p] = (incByP[p] || 0) + (m.contributions || 0) + (m.merch || 0) + (m.other || 0)
    })
    const periods = [...new Set([...Object.keys(incByP), ...Object.keys(expByP)])].filter(p => p >= sp && p <= ep).sort()
    return periods.map(p => {
      const [y, m2] = p.split('-')
      return { label: new Date(+y, +m2 - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`, net: (incByP[p] || 0) - (expByP[p] || 0) }
    })
  }, [actuals, incomeMonths, sp, ep, dateRange])

  if (!chartData.length) return <EmptyState msg="No data in range" hint="Import actuals to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={ML}>
        {GRID}{XAXIS()}{YAXIS($)}
        <Tooltip contentStyle={TIP} formatter={v => [formatCurrency(v, { compact: true }), 'Net Position']}/>
        <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4 4"/>
        <Bar dataKey="net" radius={[3, 3, 0, 0]}>
          {chartData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// 13. Cash Position — line chart with reserve floor
function CashPosition({ cashData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    cashData.filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m2] = r.period.split('-')
        return { label: new Date(+y, +m2 - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`, cash: r.cash_balance, floor: r.reserve_floor }
      })
  , [cashData, sp, ep])

  if (!chartData.length) return <EmptyState msg="No cash flow data in range" hint="Import cash flow data to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={ML}>
        {GRID}{XAXIS()}{YAXIS($)}{LEG}
        <Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
        <Line type="monotone" dataKey="cash"  name="Cash Balance"  stroke="var(--color-primary, #0A7EA4)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}/>
        <Line type="monotone" dataKey="floor" name="Reserve Floor" stroke={STATUS_COLORS.negative} strokeWidth={1.5} strokeDasharray="6 3" dot={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 14. Cash Above Floor — bar chart of surplus over reserve floor
function CashAboveFloor({ cashData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [type, setType] = useState('bar')
  const chartData = useMemo(() =>
    cashData.filter(r => r.period >= sp && r.period <= ep)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m2] = r.period.split('-')
        return { label: new Date(+y, +m2 - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`, above: Math.max(0, (r.cash_balance || 0) - (r.reserve_floor || 0)) }
      })
  , [cashData, sp, ep])

  if (!chartData.length) return <EmptyState msg="No cash flow data in range" hint="Import cash flow data to populate"/>

  return (
    <div>
      <div className="flex justify-end mb-2"><TypeToggle value={type} onChange={setType}/></div>
      <ResponsiveContainer width="100%" height={178}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={v => [formatCurrency(v, { compact: true }), 'Above Floor']}/>
            <Line type="monotone" dataKey="above" name="Above Floor" stroke={STATUS_COLORS.positive} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}/>
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS($)}<Tooltip contentStyle={TIP} formatter={v => [formatCurrency(v, { compact: true }), 'Above Floor']}/>
            <Bar dataKey="above" name="Above Floor" fill={STATUS_COLORS.positive} radius={[3, 3, 0, 0]}/>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 15. Team Spend — stacked bars by team
function TeamSpend({ actuals = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const [type, setType] = useState('bar')
  const { chartData, teams } = useMemo(() => {
    const byPT = {}, teamSet = new Set()
    filterActualsByRange(actuals, dateRange.startDate || sp, dateRange.endDate || ep)
      .filter(t => t.record_type !== 'income')
      .forEach(t => {
        const p = t.period || t.date?.slice(0, 7)
        if (!p || p < sp || p > ep) return
        const team = t.team_name || 'Other'
        teamSet.add(team)
        if (!byPT[p]) byPT[p] = {}
        byPT[p][team] = (byPT[p][team] || 0) + Math.abs(t.amount || 0)
      })
    const ts = [...teamSet].sort()
    const data = Object.entries(byPT).sort(([a], [b]) => a.localeCompare(b)).map(([p, tm]) => {
      const [y, m2] = p.split('-')
      return { label: new Date(+y, +m2 - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`, ...tm }
    })
    return { chartData: data, teams: ts }
  }, [actuals, sp, ep, dateRange])

  if (!chartData.length) return <EmptyState msg="No expense data in range" hint="Import actuals with team data to populate"/>

  return (
    <div>
      <div className="flex justify-end mb-2"><TypeToggle value={type} onChange={setType}/></div>
      <ResponsiveContainer width="100%" height={178}>
        {type === 'line' ? (
          <LineChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS($)}{LEG}
            <Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
            {teams.map(t => <Line key={t} type="monotone" dataKey={t} name={t} stroke={getTeamColor(t)} strokeWidth={2} dot={false} activeDot={{ r: 3 }}/>)}
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={ML}>
            {GRID}{XAXIS()}{YAXIS($)}{LEG}
            <Tooltip contentStyle={TIP} formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
            {teams.map((t, i) => <Bar key={t} dataKey={t} name={t} stackId="a" fill={getTeamColor(t)} radius={i === teams.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}/>)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// 16. Budget Watch — categories at or over 80% spend
function BudgetWatch({ actuals = [], budgetFlat = [], dateRange = {}, scenario = '' }) {
  const sp = dateRange.startDate || ''
  const ep = dateRange.endDate   || ''
  const alerts = useMemo(() => {
    const inRange   = filterActualsByRange(actuals, sp, ep)
    const budgetCat = calcBudgetByCategory(budgetFlat, scenario, sp, ep)
    const byCat     = inRange.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc }, {})
    return Object.entries(budgetCat)
      .map(([cat, bud]) => ({ cat, bud, actual: byCat[cat] || 0, pct: bud > 0 ? ((byCat[cat] || 0) / bud * 100) : 0 }))
      .filter(r => r.pct >= 80).sort((a, b) => b.pct - a.pct).slice(0, 5)
  }, [actuals, budgetFlat, scenario, sp, ep])

  if (!alerts.length)
    return <EmptyState msg="All categories under 80% of budget" hint="Import budget and actuals to see alerts"/>

  return (
    <div className="space-y-1 py-2">
      {alerts.map(({ cat, pct }) => {
        const c = pct > 100 ? STATUS_COLORS.negative : STATUS_COLORS.warning
        return (
          <div key={cat} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }}/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-700 truncate">{cat}</div>
              <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                <div className="h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: c }}/>
              </div>
            </div>
            <div className="text-xs font-semibold flex-shrink-0" style={{ color: c }}>{Math.round(pct)}%</div>
          </div>
        )
      })}
    </div>
  )
}

// 17. Patron Watch — signal alerts for declining/growing patron trends
function PatronWatch({ patronData = [], dateRange = {} }) {
  const sp = (dateRange.startDate || '').slice(0, 7)
  const ep = (dateRange.endDate   || '').slice(0, 7)
  const signals = useMemo(() => {
    const inRange = patronData.filter(p => p.period >= sp && p.period <= ep).sort((a, b) => a.period.localeCompare(b.period))
    if (inRange.length < 2) return []
    const mLabel = period => { const [y, m2] = period.split('-'); return new Date(+y, +m2 - 1, 1).toLocaleString('en-US', { month: 'short' }) + ' ' + y }
    const alerts = []
    let decline = 0, decMonths = []
    for (let i = 1; i < inRange.length; i++) {
      const prev = inRange[i - 1].new_patrons_total || 0, curr = inRange[i].new_patrons_total || 0
      if (curr < prev) { decline++; if (decline === 1) decMonths = [inRange[i - 1].period, inRange[i].period]; else decMonths[1] = inRange[i].period }
      else { decline = 0; decMonths = [] }
      if (decline >= 2) { alerts.push({ level: 'warn', text: `New supporters declining: ${mLabel(decMonths[0])} → ${mLabel(decMonths[1])}` }); break }
    }
    const last = inRange[inRange.length - 1], prev2 = inRange[inRange.length - 2]
    if (last && prev2 && prev2.recurring_patron_count > 0) {
      const growth = (last.recurring_patron_count - prev2.recurring_patron_count) / prev2.recurring_patron_count * 100
      if (growth < -2) alerts.push({ level: 'warn', text: `Recurring base down ${Math.abs(growth).toFixed(1)}% in ${mLabel(last.period)}` })
      else if (growth > 5) alerts.push({ level: 'ok', text: `Strong growth: +${growth.toFixed(1)}% recurring supporters in ${mLabel(last.period)}` })
    }
    return alerts
  }, [patronData, sp, ep])

  if (!patronData.length) return <EmptyState msg="No patron data imported" hint="Import patron data to see signals"/>

  return (
    <div className="space-y-1 py-2">
      {signals.length === 0
        ? <p className="text-xs text-gray-400 text-center py-4">All signals healthy</p>
        : signals.map((s, i) => (
            <div key={i} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
              <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: s.level === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.warning }}/>
              <p className="text-xs text-gray-700">{s.text}</p>
            </div>
          ))
      }
    </div>
  )
}

// ─── Chart catalog ─────────────────────────────────────────────────────────────

export const CHART_CATALOG = [
  // ── Comparison charts ────────────────────────────────────────────────────────
  {
    id:          'total_giving_yoy',
    label:       'Total Giving — Year over Year',
    description: 'Monthly income by year · last 4 years · Jan–Dec',
    category:    'comparison',
    hasData:     ({ actuals }) => (actuals || []).some(t => t.record_type === 'income'),
    Component:   TotalGivingYoY,
  },
  {
    id:          'total_patrons_yoy',
    label:       'Total Patrons — Year over Year',
    description: 'Active patrons by month · last 4 years · Jan–Dec',
    category:    'comparison',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.total_active_patrons != null),
    Component:   TotalPatronsYoY,
  },
  {
    id:          'expense_vs_prior_year',
    label:       'Expenses — Year over Year',
    description: 'Current year expenses vs prior year by month',
    category:    'comparison',
    hasData:     ({ actuals }) => (actuals || []).some(t => t.record_type === 'expense'),
    Component:   ExpenseVsPriorYear,
  },
  // ── Financial charts ─────────────────────────────────────────────────────────
  {
    id:          'giving_vs_budget',
    label:       'Giving vs Budget',
    description: 'Actual income vs budget scenario · monthly or cumulative',
    category:    'financial',
    hasData:     ({ actuals, budgetFlat }) =>
      (actuals || []).some(t => t.record_type === 'income') ||
      (budgetFlat || []).some(b => b.record_type === 'income'),
    Component:   GivingVsBudget,
  },
  {
    id:          'expense_vs_budget',
    label:       'Expenses vs Budget',
    description: 'Actual expenses vs budget by month',
    category:    'financial',
    hasData:     ({ actuals, budgetFlat }) =>
      (actuals || []).some(t => t.record_type === 'expense') ||
      (budgetFlat || []).some(b => b.record_type === 'expense'),
    Component:   ExpenseVsBudget,
  },
  {
    id:          'cash_balance',
    label:       'Cash Balance & Reserve Floor',
    description: 'Monthly cash balance with reserve floor reference',
    category:    'financial',
    hasData:     ({ cashData }) => (cashData || []).length > 0,
    Component:   CashBalance,
  },
  // ── Patron charts ────────────────────────────────────────────────────────────
  {
    id:          'total_active_patrons',
    label:       'Total Active Patrons',
    description: 'Patron headcount over the selected date range',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.total_active_patrons != null),
    Component:   TotalActivePatrons,
  },
  {
    id:          'recurring_patron_base',
    label:       'Recurring Supporter Base',
    description: 'Monthly recurring patron count in selected range',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.recurring_patron_count != null),
    Component:   RecurringPatronBase,
  },
  {
    id:          'giving_totals',
    label:       'Monthly Giving Totals',
    description: 'Recurring + spontaneous giving stacked by month',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r =>
      r.recurring_giving_total != null || r.spontaneous_giving_total != null),
    Component:   GivingTotals,
  },
  {
    id:          'avg_gift_size',
    label:       'Avg Gift Size',
    description: 'Average gift size per month',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.avg_gift_size != null),
    Component:   AvgGiftSize,
  },
  {
    id:          'retention_rate',
    label:       'Patron Retention Rate',
    description: 'Monthly retention % · requires pre-aggregated import',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.retention_rate != null),
    Component:   RetentionRate,
  },
  // ── Operational charts ───────────────────────────────────────────────────────
  {
    id:          'net_position_by_month',
    label:       'Net Position by Month',
    description: 'Monthly net income minus expenses · bars colored by +/−',
    category:    'operational',
    hasData:     ({ actuals }) => (actuals || []).length > 0,
    Component:   NetPositionByMonth,
  },
  {
    id:          'cash_position',
    label:       'Cash Position',
    description: 'Cash balance vs reserve floor over the selected range',
    category:    'operational',
    hasData:     ({ cashData }) => (cashData || []).length > 0,
    Component:   CashPosition,
  },
  {
    id:          'cash_above_floor',
    label:       'Cash Above Reserve Floor',
    description: 'Monthly surplus above the reserve floor',
    category:    'operational',
    hasData:     ({ cashData }) => (cashData || []).length > 0,
    Component:   CashAboveFloor,
  },
  {
    id:          'team_spend',
    label:       'Team Spend Comparison',
    description: 'Expenses by team per month — stacked or grouped',
    category:    'operational',
    hasData:     ({ actuals }) => (actuals || []).some(t => t.record_type !== 'income'),
    Component:   TeamSpend,
  },
  {
    id:          'budget_watch',
    label:       'Budget Watch Areas',
    description: 'Categories at or over 80% of budget · top 5 alerts',
    category:    'operational',
    hasData:     ({ actuals, budgetFlat }) => (actuals || []).length > 0 && (budgetFlat || []).length > 0,
    Component:   BudgetWatch,
  },
  {
    id:          'patron_watch',
    label:       'Patron Watch Areas',
    description: 'Patron health signals: declining sign-ups, churn risk, growth',
    category:    'operational',
    hasData:     ({ patronData }) => (patronData || []).length > 0,
    Component:   PatronWatch,
  },
]

// ─── Chart slot picker modal ───────────────────────────────────────────────────

function ChartSlotPicker({ current, onSelect, onClose, patronData, actuals, budgetFlat, cashData }) {
  const dp = { patronData, actuals, budgetFlat, cashData }
  const categories = [
    { id: 'comparison',  label: 'Comparison Charts' },
    { id: 'financial',   label: 'Financial' },
    { id: 'patron',      label: 'Patron Metrics' },
    { id: 'operational', label: 'Operational' },
  ]

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40" onClick={onClose}/>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.08)' }}>

          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Switch Chart</h3>
              <p className="text-xs text-gray-400 mt-0.5">Choose what this panel displays</p>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors">
              <X size={14}/>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-5">
            {categories.map(cat => {
              const items = CHART_CATALOG.filter(c => c.category === cat.id)
              return (
                <div key={cat.id}>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">{cat.label}</div>
                  <div className="space-y-1.5">
                    {items.map(def => {
                      const available  = def.hasData(dp)
                      const isSelected = def.id === current
                      return (
                        <button key={def.id}
                          onClick={() => { onSelect(def.id); onClose() }}
                          disabled={!available && !isSelected}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                            isSelected          ? 'border-teal-500 bg-teal-50'
                            : available         ? 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                : 'border-gray-100 opacity-40 cursor-not-allowed'
                          }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${isSelected ? 'text-teal-800' : 'text-gray-700'}`}>{def.label}</span>
                              {isSelected && <Check size={12} className="text-teal-600 flex-shrink-0"/>}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{def.description}</p>
                          </div>
                          <span className={`flex-shrink-0 self-center px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                            available ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {available ? 'Available' : 'No data'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── ChartSlot — exported wrapper ─────────────────────────────────────────────

export function ChartSlot({
  slotId,
  patronData    = [],
  actuals       = [],
  budgetFlat    = [],
  cashData      = [],
  incomeMonths  = [],
  dateRange     = {},
  scenario      = '',
  editMode      = false,
  onRemove,
}) {
  const [chartId, setChartId] = useState(() => {
    // Seed from localStorage immediately so the chart renders without waiting for DB
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      return s[slotId] || DEFAULT_SLOT_CHARTS[slotId] || 'total_giving_yoy'
    } catch { return DEFAULT_SLOT_CHARTS[slotId] || 'total_giving_yoy' }
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  // Sync from DB on mount — overwrites the localStorage seed if DB has a newer value
  useEffect(() => {
    loadSlotPrefsFromDB().then(map => {
      if (map[slotId]) {
        setChartId(map[slotId])
        // Keep localStorage in sync for instant next render
        try {
          const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
          localStorage.setItem(LS_KEY, JSON.stringify({ ...s, ...map }))
        } catch {}
      }
    })
  }, [slotId])

  const def = CHART_CATALOG.find(d => d.id === chartId) || CHART_CATALOG[0]
  const ChartComponent = def.Component
  const dataProps = { patronData, actuals, budgetFlat, cashData, incomeMonths, dateRange, scenario }

  function selectChart(id) {
    setChartId(id)
    // Update localStorage immediately for instant render on next visit
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      localStorage.setItem(LS_KEY, JSON.stringify({ ...s, [slotId]: id }))
    } catch {}
    // Persist to DB so it survives across browsers and devices
    saveSlotPrefToDB(slotId, id)
  }

  return (
    <div className="group relative bg-white rounded-xl p-5" style={CARD_STYLE}>
      {editMode && onRemove && (
        <button onClick={onRemove}
          className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
          <X size={11}/>
        </button>
      )}

      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-gray-700 mb-0.5">{def.label}</div>
          <div className="text-[10px] text-gray-400 leading-relaxed">{def.description}</div>
        </div>
        {/* Gear — visible on hover, always in editMode */}
        <button onClick={() => setPickerOpen(true)} title="Switch chart"
          className={`flex-shrink-0 w-7 h-7 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-all ${
            editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}>
          <Settings size={13}/>
        </button>
      </div>

      <ChartComponent {...dataProps}/>

      {pickerOpen && (
        <ChartSlotPicker
          current={chartId}
          onSelect={selectChart}
          onClose={() => setPickerOpen(false)}
          patronData={patronData}
          actuals={actuals}
          budgetFlat={budgetFlat}
          cashData={cashData}
        />
      )}
    </div>
  )
}
