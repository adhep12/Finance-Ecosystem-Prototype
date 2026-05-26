/**
 * PresetCard.jsx — Renders optional preset cards for the admin overview
 *
 * Each card is identified by a `cardKey` matching a key in PRESET_CARDS.
 * Receives all data props from OverviewTab plus editMode / onRemove.
 *
 * Card keys:
 *   Financial Health: budget_burn_rate, prior_year_net, expense_ratio, largest_variance
 *   Supporter Health: recurring_vs_onetime, avg_gift_trend, new_supporter_trend
 *   Charts:           giving_trend_chart, expense_by_category, yoy_comparison, team_variance_chart
 */

import React, { useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend,
} from 'recharts'
import { X, GripVertical } from 'lucide-react'
import { STATUS_COLORS, DATA_COLORS, ORG_COLORS } from '../constants/colors'
import { formatCurrency } from '../utils/formatters'
import { filterActualsByRange, calcBudgetByCategory } from '../utils/dataProcessing'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CARD_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
}

const axisStyle = { fontSize: 10, fill: '#9CA3AF' }
const tipStyle  = { backgroundColor: '#1F2937', border: 'none', fontSize: 11, color: '#F9FAFB' }

function fmtC(v) {
  if (v == null || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + '$' + (abs / 1_000).toFixed(1) + 'K'
  return sign + '$' + abs.toFixed(0)
}

function periodLabel(p) {
  if (!p) return ''
  const [y, m] = p.split('-')
  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return mn[parseInt(m) - 1] + ' ' + y.slice(2)
}

// Remove handle + drag grip (only visible in edit mode)
function EditControls({ editMode, onRemove }) {
  if (!editMode) return null
  return (
    <>
      <button
        onClick={onRemove}
        title="Remove card"
        className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-10 transition-colors hover:bg-red-100"
        style={{ backgroundColor: '#F3F4F6', color: '#9CA3AF' }}
      >
        <X size={11} />
      </button>
      <GripVertical size={14} className="absolute top-3.5 left-3 text-gray-300 cursor-grab" />
    </>
  )
}

// ─── PresetCard ───────────────────────────────────────────────────────────────

export default function PresetCard({
  cardKey,
  actuals, budgetFlat, scenario, incomeMonths, cashFlowData, patronData,
  dateRange, editMode, onRemove,
}) {
  const { startDate, endDate } = dateRange
  const startM = startDate.slice(0, 7)
  const endM   = endDate.slice(0, 7)

  const inRange    = useMemo(() => filterActualsByRange(actuals, startDate, endDate), [actuals, startDate, endDate])
  const expInRange = useMemo(() => inRange.filter(t => t.record_type !== 'income'), [inRange])
  const budgetByCat = useMemo(() => calcBudgetByCategory(budgetFlat, scenario, startDate, endDate), [budgetFlat, scenario, startDate, endDate])

  const totalExpenses = useMemo(() => expInRange.reduce((s, t) => s + Math.abs(t.amount || 0), 0), [expInRange])
  const totalGiving   = useMemo(() => {
    return (incomeMonths || [])
      .filter(m => m.period >= startM && m.period <= endM)
      .reduce((s, m) => s + (m.contributions || 0) + (m.merch || 0) + (m.other || 0), 0)
  }, [incomeMonths, startM, endM])

  // ── budget_burn_rate ──────────────────────────────────────────────────────
  if (cardKey === 'budget_burn_rate') {
    const uniqueMonths = [...new Set(
      expInRange.map(t => t.period || t.date?.slice(0, 7)).filter(Boolean)
    )].length || 1
    const monthlyAvg = totalExpenses / uniqueMonths
    const totalBudget = Object.values(budgetByCat).reduce((s, v) => s + v, 0)
    const burnPct = totalBudget > 0 ? (totalExpenses / totalBudget * 100) : null
    const isOver = burnPct !== null && burnPct > 100
    const barColor = burnPct === null ? STATUS_COLORS.neutral
      : burnPct > 100 ? STATUS_COLORS.negative
      : burnPct > 80  ? STATUS_COLORS.warning
      : STATUS_COLORS.positive

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Budget Burn Rate</div>
        <div className="text-2xl font-bold mb-1" style={{ color: isOver ? STATUS_COLORS.negative : '#111827' }}>
          {burnPct !== null ? `${burnPct.toFixed(1)}%` : '—'}
        </div>
        <div className="text-xs text-gray-400 mb-3">of budget consumed</div>
        {burnPct !== null && (
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(burnPct, 100)}%`, backgroundColor: barColor }} />
          </div>
        )}
        <div className="text-xs text-gray-400 mt-2">{fmtC(monthlyAvg)}/mo avg</div>
      </div>
    )
  }

  // ── prior_year_net ────────────────────────────────────────────────────────
  if (cardKey === 'prior_year_net') {
    const shiftBack = s => s.replace(/^(\d{4})/, y => String(parseInt(y) - 1))
    const pyStart = shiftBack(startM), pyEnd = shiftBack(endM)
    const pyIncome = (incomeMonths || [])
      .filter(m => m.period >= pyStart && m.period <= pyEnd)
      .reduce((s, m) => s + (m.contributions || 0) + (m.merch || 0) + (m.other || 0), 0)
    const pyExp = (actuals || [])
      .filter(t => { const p = t.period || t.date?.slice(0, 7); return p >= pyStart && p <= pyEnd && t.record_type !== 'income' })
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0)
    const pyNet = pyIncome - pyExp
    const yoyDelta = (totalGiving - totalExpenses) - pyNet

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Prior Year Net</div>
        <div className="text-2xl font-bold mb-1" style={{ color: pyNet >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative }}>
          {fmtC(pyNet)}
        </div>
        <div className="text-xs text-gray-400 mb-2">{pyStart} – {pyEnd}</div>
        <div className="text-sm font-semibold" style={{ color: yoyDelta >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative }}>
          {yoyDelta >= 0 ? '▲' : '▼'} {fmtC(Math.abs(yoyDelta))} YoY
        </div>
      </div>
    )
  }

  // ── expense_ratio ─────────────────────────────────────────────────────────
  if (cardKey === 'expense_ratio') {
    const ratio = totalGiving > 0 ? (totalExpenses / totalGiving * 100) : null
    const isHigh = ratio !== null && ratio > 100

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Expense Ratio</div>
        <div className="text-2xl font-bold mb-1" style={{ color: isHigh ? STATUS_COLORS.negative : '#111827' }}>
          {ratio !== null ? `${ratio.toFixed(1)}%` : '—'}
        </div>
        <div className="text-xs text-gray-400">expenses / income</div>
        {ratio !== null && (
          <div className="text-xs mt-2 font-medium" style={{ color: isHigh ? STATUS_COLORS.negative : STATUS_COLORS.positive }}>
            {isHigh ? 'Spending exceeds income' : `${(100 - ratio).toFixed(1)}% surplus ratio`}
          </div>
        )}
      </div>
    )
  }

  // ── largest_variance ──────────────────────────────────────────────────────
  if (cardKey === 'largest_variance') {
    const byCat = expInRange.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount || 0)
      return acc
    }, {})
    const overBudget = Object.entries(budgetByCat)
      .map(([cat, bud]) => ({ cat, variance: (byCat[cat] || 0) - bud }))
      .filter(v => v.variance > 0)
      .sort((a, b) => b.variance - a.variance)
    const worst = overBudget[0]

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Largest Variance</div>
        <div className="text-2xl font-bold mb-1" style={{ color: worst ? STATUS_COLORS.negative : STATUS_COLORS.positive }}>
          {worst ? fmtC(worst.variance) : '$0'}
        </div>
        <div className="text-xs text-gray-500 truncate mb-1">{worst?.cat || 'All categories on budget ✓'}</div>
        {overBudget.length > 1 && (
          <div className="text-xs text-gray-400">{overBudget.length - 1} other {overBudget.length - 1 === 1 ? 'category' : 'categories'} over</div>
        )}
      </div>
    )
  }

  // ── recurring_vs_onetime ──────────────────────────────────────────────────
  if (cardKey === 'recurring_vs_onetime') {
    const inRangePat = (patronData || []).filter(p => p.period >= startM && p.period <= endM)
    const totalNew   = inRangePat.reduce((s, p) => s + (p.new_patrons_total || 0), 0)
    const totalRec   = inRangePat.reduce((s, p) => s + (p.new_patrons_recurring || 0), 0)
    const pct = totalNew > 0 ? (totalRec / totalNew * 100) : null

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Recurring vs One-Time</div>
        <div className="text-2xl font-bold mb-1">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</div>
        <div className="text-xs text-gray-400 mb-3">new recurring donors</div>
        {pct !== null && (
          <>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
              <div style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS.positive }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
              <span>{totalRec.toLocaleString()} recurring</span>
              <span>{(totalNew - totalRec).toLocaleString()} one-time</span>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── avg_gift_trend ────────────────────────────────────────────────────────
  if (cardKey === 'avg_gift_trend') {
    const sorted  = (patronData || []).filter(p => p.avg_gift_size != null).sort((a, b) => a.period.localeCompare(b.period))
    const last6   = sorted.slice(-6)
    const sparkData = last6.map(p => ({ label: periodLabel(p.period), v: p.avg_gift_size || 0 }))
    const latest  = last6[last6.length - 1]?.avg_gift_size || 0
    const prev    = last6[last6.length - 2]?.avg_gift_size || 0
    const trend   = latest - prev

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>Avg Gift 6-Month</div>
        <div className="text-2xl font-bold mb-3">{latest > 0 ? fmtC(latest) : '—'}</div>
        {sparkData.length > 1 && (
          <div style={{ height: 48 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line type="monotone" dataKey="v" stroke={ORG_COLORS.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {trend !== 0 && (
          <div className="text-xs mt-2 font-medium" style={{ color: trend >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative }}>
            {trend >= 0 ? '▲' : '▼'} {fmtC(Math.abs(trend))} vs prior month
          </div>
        )}
      </div>
    )
  }

  // ── new_supporter_trend ───────────────────────────────────────────────────
  if (cardKey === 'new_supporter_trend') {
    const shiftBack = s => s.replace(/^(\d{4})/, y => String(parseInt(y) - 1))
    const pyStart   = shiftBack(startM), pyEnd = shiftBack(endM)
    const curr = (patronData || []).filter(p => p.period >= startM && p.period <= endM)
      .reduce((s, p) => s + (p.new_patrons_total || 0), 0)
    const prior = (patronData || []).filter(p => p.period >= pyStart && p.period <= pyEnd)
      .reduce((s, p) => s + (p.new_patrons_total || 0), 0)
    const delta = curr - prior

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>New Supporter Trend</div>
        <div className="text-2xl font-bold mb-1">{curr.toLocaleString()}</div>
        <div className="text-xs text-gray-400 mb-2">new supporters this period</div>
        {prior > 0 && (
          <div className="text-sm font-semibold" style={{ color: delta >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative }}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()} YoY
          </div>
        )}
      </div>
    )
  }

  // ── giving_trend_chart ────────────────────────────────────────────────────
  if (cardKey === 'giving_trend_chart') {
    const chartData = (incomeMonths || [])
      .filter(m => m.period >= startM && m.period <= endM)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(m => ({ label: periodLabel(m.period), giving: (m.contributions || 0) + (m.merch || 0) + (m.other || 0) }))

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: '#6B7384' }}>Giving Trend</div>
        {chartData.length === 0
          ? <div className="text-xs text-gray-300 text-center py-8">No giving data in range</div>
          : <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pcGivingGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={ORG_COLORS.primary} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={ORG_COLORS.primary} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} tickFormatter={fmtC} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={tipStyle} formatter={v => [fmtC(v), 'Giving']} />
                  <Area type="monotone" dataKey="giving" stroke={ORG_COLORS.primary} fill="url(#pcGivingGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
        }
      </div>
    )
  }

  // ── expense_by_category ───────────────────────────────────────────────────
  if (cardKey === 'expense_by_category') {
    const byCat = expInRange.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount || 0)
      return acc
    }, {})
    const chartData = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([cat, amt]) => ({ cat: cat.length > 15 ? cat.slice(0, 13) + '…' : cat, amt }))

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: '#6B7384' }}>Expense by Category</div>
        {chartData.length === 0
          ? <div className="text-xs text-gray-300 text-center py-8">No expense data</div>
          : <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} tickFormatter={fmtC} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="cat" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={tipStyle} formatter={v => [fmtC(v), 'Spend']} />
                  <Bar dataKey="amt" radius={[0, 3, 3, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={DATA_COLORS[i % DATA_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
        }
      </div>
    )
  }

  // ── yoy_comparison ────────────────────────────────────────────────────────
  if (cardKey === 'yoy_comparison') {
    const shiftBack = s => s.replace(/^(\d{4})/, y => String(parseInt(y) - 1))
    const shiftFwd  = s => s.replace(/^(\d{4})/, y => String(parseInt(y) + 1))
    const pyStart = shiftBack(startM), pyEnd = shiftBack(endM)
    const currByP = {}
    for (const m of (incomeMonths || []).filter(m => m.period >= startM && m.period <= endM)) {
      currByP[m.period] = (m.contributions || 0) + (m.merch || 0) + (m.other || 0)
    }
    const priorByP = {}
    for (const m of (incomeMonths || []).filter(m => m.period >= pyStart && m.period <= pyEnd)) {
      priorByP[shiftFwd(m.period)] = (m.contributions || 0) + (m.merch || 0) + (m.other || 0)
    }
    const yoyData = Object.keys(currByP).sort().map(p => ({
      label: periodLabel(p),
      current: currByP[p] || 0,
      prior:   priorByP[p]  || 0,
    }))

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: '#6B7384' }}>Year-over-Year</div>
        {yoyData.length === 0
          ? <div className="text-xs text-gray-300 text-center py-8">No data</div>
          : <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yoyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} tickFormatter={fmtC} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={tipStyle} formatter={(v, n) => [fmtC(v), n]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="current" name="This Year"  fill={ORG_COLORS.primary} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="prior"   name="Prior Year" fill={DATA_COLORS[7]}      radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
        }
      </div>
    )
  }

  // ── team_variance_chart ───────────────────────────────────────────────────
  if (cardKey === 'team_variance_chart') {
    const relBudget = budgetFlat.filter(b =>
      b.scenario === scenario && b.record_type !== 'income' &&
      b.period >= startM && b.period <= endM && b.team_name
    )
    const budByTeam = {}
    for (const b of relBudget) budByTeam[b.team_name] = (budByTeam[b.team_name] || 0) + (b.amount || 0)
    const deptToTeam = {}
    for (const b of budgetFlat) { if (b.department && b.team_name) deptToTeam[b.department] = b.team_name }
    const actByTeam = {}
    for (const t of expInRange) {
      const tn = deptToTeam[t.department]
      if (tn) actByTeam[tn] = (actByTeam[tn] || 0) + Math.abs(t.amount || 0)
    }
    const chartData = Object.keys(budByTeam)
      .map(team => ({ team, variance: (budByTeam[team] || 0) - (actByTeam[team] || 0) }))
      .sort((a, b) => a.variance - b.variance)

    return (
      <div className="relative rounded-xl p-5" style={CARD_STYLE}>
        <EditControls editMode={editMode} onRemove={onRemove} />
        <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: '#6B7384' }}>Team Variance</div>
        {chartData.length === 0
          ? <div className="text-xs text-gray-300 text-center py-8">No team budget data</div>
          : <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="team" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} tickFormatter={fmtC} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={tipStyle} formatter={v => [fmtC(v), 'Budget Remaining']} />
                  <ReferenceLine y={0} stroke={STATUS_COLORS.neutral} strokeWidth={1} strokeDasharray="4 4" />
                  <Bar dataKey="variance" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.variance >= 0 ? STATUS_COLORS.positive : STATUS_COLORS.negative} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
        }
      </div>
    )
  }

  // Fallback
  return (
    <div className="relative rounded-xl p-5" style={CARD_STYLE}>
      <EditControls editMode={editMode} onRemove={onRemove} />
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6B7384' }}>{cardKey}</div>
      <div className="text-xs text-gray-400">Preview not available</div>
    </div>
  )
}
