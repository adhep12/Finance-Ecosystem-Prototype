/**
 * ChartSlot.jsx — Switchable chart panel for the ELT Executive Dashboard.
 *
 * Wraps a chart panel with a gear icon (visible on hover) that opens a picker
 * modal. Users can swap any slot to show a different metric. Preferences are
 * persisted to localStorage under the key `elt_chart_prefs`.
 *
 * Usage:
 *   <ChartSlot slotId="patron-base" patronData={...} actuals={...} ... />
 */

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Settings, X, Check, AlertCircle } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, AreaChart, BarChart,
  Line, Area, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '../utils/formatters'

// ─── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'elt_chart_prefs'

const DEFAULT_SLOT_CHARTS = {
  'new-patrons-yoy':  'new_patrons_yoy',
  'patron-base':      'recurring_patron_base',
  'giving-vs-budget': 'giving_vs_budget',
}

const CARD_STYLE = {
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
}

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
}

const MONEY_FORMATTER = v =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K`
  : `$${v}`

const YEAR_PALETTE = [
  'var(--color-primary, #0A7EA4)',
  '#C05A2F',
  '#E8A838',
  '#9BA8B5',
  '#C8D0D8',
]

// ─── Shared sub-components ─────────────────────────────────────────────────────

function EmptyState({ msg, hint }) {
  return (
    <div className="flex flex-col items-center justify-center h-44 gap-2 text-center px-4">
      <AlertCircle size={20} className="text-gray-200"/>
      <p className="text-xs text-gray-400 font-medium">{msg}</p>
      {hint && <p className="text-[10px] text-gray-300 leading-relaxed">{hint}</p>}
    </div>
  )
}

function ChartGrid() {
  return <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false}/>
}

function ChartXAxis({ dataKey = 'label' }) {
  return <XAxis dataKey={dataKey} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
}

function ChartYAxis({ formatter }) {
  return <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={formatter} axisLine={false} tickLine={false}/>
}

// ─── Headless chart body components ───────────────────────────────────────────
// Each receives { patronData, actuals, budgetFlat, cashData, dateRange, scenario }
// and renders only the chart (no card wrapper).

// 1. Total Active Patrons over time
function TotalActivePatronsChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        const label = new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`
        return { label, patrons: r.total_active_patrons }
      })
  , [patronData, startP, endP])

  if (!chartData.length || chartData.every(r => r.patrons == null))
    return <EmptyState msg="No patron data in range" hint="Import patron data to populate this chart"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis/>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v?.toLocaleString(), 'Active Patrons']}/>
        <Line type="monotone" dataKey="patrons" name="Active Patrons"
          stroke="var(--color-primary, #0A7EA4)" strokeWidth={2.5}
          dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 2. New Supporters YoY
function NewPatronsYoYChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const { chartData, years } = useMemo(() => {
    const byYear = {}
    for (const row of patronData) {
      if (!row.period) continue
      // Only include years that overlap the selected date range
      if (startP && endP) {
        const rowYear = row.period.slice(0, 4)
        const rangeStart = startP.slice(0, 4)
        const rangeEnd   = endP.slice(0, 4)
        if (rowYear < rangeStart || rowYear > rangeEnd) continue
      }
      const [yr, mo] = row.period.split('-')
      if (!byYear[yr]) byYear[yr] = {}
      byYear[yr][parseInt(mo)] = row.new_patrons_total
    }
    const years = Object.keys(byYear).sort()
    const chartData = MONTHS.map((m, i) => {
      const row = { month: m }
      for (const yr of years) row[`y${yr}`] = byYear[yr]?.[i + 1] ?? null
      return row
    })
    return { chartData, years }
  }, [patronData, startP, endP])

  if (!years.length || chartData.every(r => years.every(yr => r[`y${yr}`] == null)))
    return <EmptyState msg="No new patron data available" hint="Requires new_patrons_total — not available from raw giving imports"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <ChartGrid/>
        <ChartXAxis dataKey="month"/>
        <ChartYAxis/>
        <Tooltip contentStyle={TOOLTIP_STYLE}/>
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
        {years.map((yr, i) => (
          <Line key={yr} type="monotone" dataKey={`y${yr}`} name={yr}
            stroke={YEAR_PALETTE[i % YEAR_PALETTE.length]}
            strokeWidth={i === years.length - 1 ? 2.5 : 1.8}
            strokeDasharray={i === years.length - 1 ? undefined : '5 3'}
            opacity={i === years.length - 1 ? 1 : 0.7}
            dot={false} connectNulls={false}/>
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// 3. Recurring Patron Base
function RecurringPatronBaseChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          count: r.recurring_patron_count,
        }
      })
  , [patronData, startP, endP])

  if (!chartData.length || chartData.every(r => r.count == null))
    return <EmptyState msg="No recurring patron data in range" hint="Requires recurring_patron_count field"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis/>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [v?.toLocaleString(), 'Recurring Patrons']}/>
        <Bar dataKey="count" name="Recurring Patrons"
          fill="var(--color-primary, #0A7EA4)" radius={[4, 4, 0, 0]}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// 4. Monthly Giving Totals (recurring + spontaneous stacked)
function GivingTotalsChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          recurring:    r.recurring_giving_total    ?? null,
          spontaneous:  r.spontaneous_giving_total  ?? null,
        }
      })
  , [patronData, startP, endP])

  if (!chartData.length || chartData.every(r => r.recurring == null && r.spontaneous == null))
    return <EmptyState msg="No giving total data in range" hint="Requires recurring_giving_total or spontaneous_giving_total"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis formatter={MONEY_FORMATTER}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, n) => [formatCurrency(v, { compact: false }), n]}/>
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
        <Bar dataKey="recurring"   name="Recurring"   fill="var(--color-primary, #0A7EA4)" radius={[0, 0, 0, 0]} stackId="g"/>
        <Bar dataKey="spontaneous" name="Spontaneous" fill="#E8A838"                        radius={[4, 4, 0, 0]} stackId="g"/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// 5. Giving vs Budget
function GivingVsBudgetChart({ actuals = [], budgetFlat = [], dateRange = {}, scenario = '' }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const [mode, setMode] = useState('monthly')

  const chartData = useMemo(() => {
    const incActuals = actuals.filter(t => {
      const p = t.period || (t.date ? t.date.slice(0, 7) : null)
      return p && p >= startP && p <= endP && t.record_type === 'income'
    })
    const incBudget = budgetFlat.filter(b =>
      b.scenario === scenario && b.record_type === 'income' &&
      b.period && b.period >= startP && b.period <= endP
    )
    const aByP = {}, bByP = {}
    for (const t of incActuals) {
      const p = t.period || t.date?.slice(0, 7); if (!p) continue
      aByP[p] = (aByP[p] || 0) + Math.abs(t.amount || 0)
    }
    for (const b of incBudget) {
      if (b.period) bByP[b.period] = (bByP[b.period] || 0) + Math.abs(b.amount || 0)
    }
    const periods = [...new Set([...Object.keys(aByP), ...Object.keys(bByP)])]
      .filter(p => p >= startP && p <= endP).sort()
    let cumA = 0, cumB = 0
    return periods.map(p => {
      const [y, m] = p.split('-')
      const a = aByP[p] || 0, b = bByP[p] || 0
      cumA += a; cumB += b
      return {
        label:  new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
        actual: mode === 'cumulative' ? cumA : a,
        budget: mode === 'cumulative' ? cumB : b,
      }
    })
  }, [actuals, budgetFlat, scenario, startP, endP, mode])

  if (!chartData.length)
    return <EmptyState msg="No income data in range" hint="Import actuals or budget to populate"/>

  return (
    <div>
      <div className="flex justify-end mb-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {['monthly', 'cumulative'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                mode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {m === 'monthly' ? 'Mo' : 'Cu'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <ChartGrid/><ChartXAxis/><ChartYAxis formatter={MONEY_FORMATTER}/>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
          <Bar dataKey="actual" name="Actual" fill="var(--color-primary, #0A7EA4)" radius={[4, 4, 0, 0]}/>
          <Bar dataKey="budget" name="Budget" fill="#E8A838" radius={[4, 4, 0, 0]} opacity={0.7}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// 6. Avg Gift Size
function AvgGiftSizeChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          avg: r.avg_gift_size ?? null,
        }
      })
  , [patronData, startP, endP])

  if (!chartData.length || chartData.every(r => r.avg == null))
    return <EmptyState msg="No avg gift size data in range" hint="Requires avg_gift_size field"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/>
        <ChartYAxis formatter={v => `$${v}`}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={v => [formatCurrency(v, { compact: false }), 'Avg Gift']}/>
        <Line type="monotone" dataKey="avg" name="Avg Gift Size"
          stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 7. Patron Retention Rate
function RetentionRateChart({ patronData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    patronData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          rate: r.retention_rate != null ? Math.round(r.retention_rate * 1000) / 10 : null,
        }
      })
  , [patronData, startP, endP])

  if (!chartData.length || chartData.every(r => r.rate == null))
    return <EmptyState msg="No retention rate data available" hint="Requires retention_rate — not available from raw giving imports"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/>
        <ChartYAxis formatter={v => `${v}%`}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={v => [`${v?.toFixed(1)}%`, 'Retention Rate']}/>
        <ReferenceLine y={80} stroke="#E8A838" strokeDasharray="4 2"
          label={{ value: '80%', position: 'right', fontSize: 9, fill: '#E8A838' }}/>
        <Line type="monotone" dataKey="rate" name="Retention Rate"
          stroke="#8B5CF6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 8. Expenses vs Budget
function ExpenseVsBudgetChart({ actuals = [], budgetFlat = [], dateRange = {}, scenario = '' }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() => {
    const expActuals = actuals.filter(t => {
      const p = t.period || (t.date ? t.date.slice(0, 7) : null)
      return p && p >= startP && p <= endP && t.record_type === 'expense'
    })
    const expBudget = budgetFlat.filter(b =>
      b.scenario === scenario && b.record_type === 'expense' &&
      b.period && b.period >= startP && b.period <= endP
    )
    const aByP = {}, bByP = {}
    for (const t of expActuals) {
      const p = t.period || t.date?.slice(0, 7); if (!p) continue
      aByP[p] = (aByP[p] || 0) + Math.abs(t.amount || 0)
    }
    for (const b of expBudget) {
      if (b.period) bByP[b.period] = (bByP[b.period] || 0) + Math.abs(b.amount || 0)
    }
    const periods = [...new Set([...Object.keys(aByP), ...Object.keys(bByP)])]
      .filter(p => p >= startP && p <= endP).sort()
    return periods.map(p => {
      const [y, m] = p.split('-')
      return {
        label:  new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
        actual: aByP[p] || 0,
        budget: bByP[p] || 0,
      }
    })
  }, [actuals, budgetFlat, scenario, startP, endP])

  if (!chartData.length)
    return <EmptyState msg="No expense data in range" hint="Import actuals or budget to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis formatter={MONEY_FORMATTER}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
        <Bar dataKey="actual" name="Actual Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} opacity={0.85}/>
        <Bar dataKey="budget" name="Budget"           fill="#9CA3AF" radius={[4, 4, 0, 0]} opacity={0.6}/>
      </BarChart>
    </ResponsiveContainer>
  )
}

// 9. Expenses vs Prior Year
function ExpenseVsPriorYearChart({ actuals = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() => {
    const byPeriod = {}
    for (const t of actuals) {
      const p = t.period || (t.date ? t.date.slice(0, 7) : null)
      if (!p || t.record_type !== 'expense') continue
      byPeriod[p] = (byPeriod[p] || 0) + Math.abs(t.amount || 0)
    }
    const rows = []
    let cur = startP
    while (cur <= endP) {
      const [y, m] = cur.split('-')
      // Derive prior year per row so multi-year ranges compare correctly
      const prevY = String(+y - 1)
      const prevP = `${prevY}-${m}`
      rows.push({
        label:   new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) + ` '${y.slice(2)}`,
        current: byPeriod[cur]   ?? null,
        prior:   byPeriod[prevP] ?? null,
      })
      const next = new Date(+y, +m, 1)
      cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    }
    return rows
  }, [actuals, startP, endP])

  if (!chartData.length || chartData.every(r => r.current == null && r.prior == null))
    return <EmptyState msg="No expense data in range" hint="Import actuals to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis formatter={MONEY_FORMATTER}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, n) => [formatCurrency(v, { compact: true }), n]}/>
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
        <Line type="monotone" dataKey="current" name="Current Year"
          stroke="#EF4444" strokeWidth={2.5} dot={false} connectNulls={false}/>
        <Line type="monotone" dataKey="prior"   name="Prior Year"
          stroke="#9CA3AF" strokeWidth={1.8} strokeDasharray="5 3" dot={false} connectNulls={false}/>
      </LineChart>
    </ResponsiveContainer>
  )
}

// 10. Cash Balance vs Reserve Floor
function CashBalanceChart({ cashData = [], dateRange = {} }) {
  const startP = (dateRange.startDate || '').slice(0, 7)
  const endP   = (dateRange.endDate   || '').slice(0, 7)
  const chartData = useMemo(() =>
    cashData
      .filter(r => r.period >= startP && r.period <= endP)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(r => {
        const [y, m] = r.period.split('-')
        return {
          label: new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }),
          cash:  r.cash_balance   ?? null,
          floor: r.reserve_floor  ?? null,
        }
      })
  , [cashData, startP, endP])

  if (!chartData.length)
    return <EmptyState msg="No cash flow data in range" hint="Import cash flow data to populate"/>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <ChartGrid/><ChartXAxis/><ChartYAxis formatter={MONEY_FORMATTER}/>
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, n) => [formatCurrency(v, { compact: false }), n]}/>
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}/>
        <Area type="monotone" dataKey="cash"  name="Cash Balance"
          stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.12} strokeWidth={2.5}/>
        <Area type="monotone" dataKey="floor" name="Reserve Floor"
          stroke="#EF4444" fill="transparent" fillOpacity={0}
          strokeWidth={1.5} strokeDasharray="5 3"/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Chart catalog ─────────────────────────────────────────────────────────────

export const CHART_CATALOG = [
  {
    id:          'total_active_patrons',
    label:       'Total Active Patrons',
    description: 'Headcount of active patrons over time',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.total_active_patrons != null),
    Component:   TotalActivePatronsChart,
  },
  {
    id:          'new_patrons_yoy',
    label:       'New Supporters YoY',
    description: 'Year-over-year new patron comparison by month',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.new_patrons_total != null),
    Component:   NewPatronsYoYChart,
  },
  {
    id:          'recurring_patron_base',
    label:       'Recurring Supporter Base',
    description: 'Monthly recurring patron count in selected range',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.recurring_patron_count != null),
    Component:   RecurringPatronBaseChart,
  },
  {
    id:          'giving_totals',
    label:       'Monthly Giving Totals',
    description: 'Recurring + spontaneous giving stacked by month',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r =>
      r.recurring_giving_total != null || r.spontaneous_giving_total != null),
    Component:   GivingTotalsChart,
  },
  {
    id:          'avg_gift_size',
    label:       'Avg Gift Size',
    description: 'Average gift size per month',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.avg_gift_size != null),
    Component:   AvgGiftSizeChart,
  },
  {
    id:          'retention_rate',
    label:       'Patron Retention Rate',
    description: 'Monthly patron retention % (requires pre-aggregated import)',
    category:    'patron',
    hasData:     ({ patronData }) => (patronData || []).some(r => r.retention_rate != null),
    Component:   RetentionRateChart,
  },
  {
    id:          'giving_vs_budget',
    label:       'Giving vs Budget',
    description: 'Actual income vs budget scenario by month',
    category:    'financial',
    hasData:     ({ actuals, budgetFlat }) =>
      (actuals || []).some(t => t.record_type === 'income') ||
      (budgetFlat || []).some(b => b.record_type === 'income'),
    Component:   GivingVsBudgetChart,
  },
  {
    id:          'expense_vs_budget',
    label:       'Expenses vs Budget',
    description: 'Actual expenses vs budget by month',
    category:    'financial',
    hasData:     ({ actuals, budgetFlat }) =>
      (actuals || []).some(t => t.record_type === 'expense') ||
      (budgetFlat || []).some(b => b.record_type === 'expense'),
    Component:   ExpenseVsBudgetChart,
  },
  {
    id:          'expense_vs_prior_year',
    label:       'Expenses vs Prior Year',
    description: 'Current year expenses compared to prior year by month',
    category:    'financial',
    hasData:     ({ actuals }) => (actuals || []).some(t => t.record_type === 'expense'),
    Component:   ExpenseVsPriorYearChart,
  },
  {
    id:          'cash_balance',
    label:       'Cash Balance & Reserve Floor',
    description: 'Monthly cash balance with reserve floor reference',
    category:    'financial',
    hasData:     ({ cashData }) => (cashData || []).length > 0,
    Component:   CashBalanceChart,
  },
]

// ─── Chart slot picker modal ───────────────────────────────────────────────────

function ChartSlotPicker({ current, onSelect, onClose, patronData, actuals, budgetFlat, cashData }) {
  const dataProps = { patronData, actuals, budgetFlat, cashData }
  const categories = [
    { id: 'patron',    label: 'Patron Metrics' },
    { id: 'financial', label: 'Financial' },
  ]

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.08)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Switch Chart</h3>
              <p className="text-xs text-gray-400 mt-0.5">Choose what this panel displays</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={14}/>
            </button>
          </div>

          {/* Chart list */}
          <div className="overflow-y-auto flex-1 p-4 space-y-5">
            {categories.map(cat => {
              const items = CHART_CATALOG.filter(c => c.category === cat.id)
              return (
                <div key={cat.id}>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">
                    {cat.label}
                  </div>
                  <div className="space-y-1.5">
                    {items.map(def => {
                      const available  = def.hasData(dataProps)
                      const isSelected = def.id === current
                      return (
                        <button
                          key={def.id}
                          onClick={() => { onSelect(def.id); onClose() }}
                          disabled={!available && !isSelected}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? 'border-teal-500 bg-teal-50'
                              : available
                                ? 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                : 'border-gray-100 opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${isSelected ? 'text-teal-800' : 'text-gray-700'}`}>
                                {def.label}
                              </span>
                              {isSelected && <Check size={12} className="text-teal-600 flex-shrink-0"/>}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                              {def.description}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 self-center px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                            available
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-400'
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
  patronData  = [],
  actuals     = [],
  budgetFlat  = [],
  cashData    = [],
  dateRange   = {},
  scenario    = '',
  editMode    = false,
  onRemove,
}) {
  const [chartId, setChartId] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      return saved[slotId] || DEFAULT_SLOT_CHARTS[slotId] || 'total_active_patrons'
    } catch {
      return DEFAULT_SLOT_CHARTS[slotId] || 'total_active_patrons'
    }
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const def = CHART_CATALOG.find(d => d.id === chartId) || CHART_CATALOG[0]
  const ChartComponent = def.Component

  const dataProps = { patronData, actuals, budgetFlat, cashData, dateRange, scenario }

  function selectChart(id) {
    setChartId(id)
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      localStorage.setItem(LS_KEY, JSON.stringify({ ...saved, [slotId]: id }))
    } catch { /* localStorage unavailable */ }
  }

  return (
    <div className="group relative bg-white rounded-xl p-5" style={CARD_STYLE}>
      {/* Edit/remove button */}
      {editMode && onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
        >
          <X size={11}/>
        </button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-gray-700 mb-0.5">{def.label}</div>
          <div className="text-[10px] text-gray-400 leading-relaxed">{def.description}</div>
        </div>
        {/* Gear — visible on group-hover, always visible in editMode */}
        <button
          onClick={() => setPickerOpen(true)}
          title="Switch chart"
          className={`flex-shrink-0 ml-3 w-7 h-7 rounded-lg border border-gray-200 bg-white shadow-sm flex items-center justify-center text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-all ${
            editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Settings size={13}/>
        </button>
      </div>

      {/* Chart body */}
      <ChartComponent {...dataProps}/>

      {/* Picker modal */}
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
