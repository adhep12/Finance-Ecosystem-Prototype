import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { X, Plus, ChevronDown, Info } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTeam } from '../context/TeamContext'
import CommentPinFAB from '../components/CommentPinFAB'
import {
  filterActualsByRange,
  calcBudgetByCategory,
  aggregateBy,
  getTopCategories,
  getTopVendors,
  calcBriefingSummary,
  buildChartSeries,
  getUniqueValues,
} from '../utils/dataProcessing'
import {
  formatCurrency,
  formatOverUnder,
  formatBudgetUsed,
  formatPercent,
  calcOverUnderPct,
  daysBetween,
} from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Exclude Modal
// ─────────────────────────────────────────────────────────────────────────────

function ExcludeModal({ allCategories, excluded, onChange, onClose }) {
  function toggle(cat) {
    if (excluded.includes(cat)) {
      onChange(excluded.filter(c => c !== cat))
    } else {
      onChange([...excluded, cat])
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-80 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Exclude from Briefing</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Excluded categories are removed from all Briefing page numbers. Other pages are unaffected.
        </p>
        <div className="space-y-1">
          {allCategories.map(cat => (
            <label key={cat} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={excluded.includes(cat)}
                onChange={() => toggle(cat)}
                className="w-4 h-4 rounded accent-teal-500"
              />
              <span className="text-sm text-gray-800">{cat}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Briefing Hero Card
// ─────────────────────────────────────────────────────────────────────────────

function BriefingHero({ summary, excluded, allCategories, onExcludeChange }) {
  const { orgConfig, selectedScenario, dateRange } = useApp()
  const { team } = useTeam()
  const displayName = team?.team_name || orgConfig.teamName
  const [showModal, setShowModal] = useState(false)

  const days = dateRange.startDate && dateRange.endDate
    ? daysBetween(dateRange.startDate, dateRange.endDate)
    : 0

  const isOver = summary.overUnder >= 0
  const pct    = summary.overUnderPct

  return (
    <>
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ backgroundColor: orgConfig.primaryLight || 'var(--color-primary-light)' }}
      >
        {/* Top label */}
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
          Budget Briefing · {dateRange.preset === 'full-fiscal' ? 'Full Fiscal Year' : dateRange.preset === 'fiscal-ytd' ? 'Fiscal YTD' : 'Selected Period'} · vs {selectedScenario}
        </div>

        <div className="flex items-start justify-between">
          {/* Left: team info */}
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: orgConfig.primaryColor || 'var(--color-primary)' }}
            >
              {orgConfig.logoInitial}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                {days > 0 ? `${days} days · ` : ''}{summary.transactions.toLocaleString()} transactions
                {excluded.length > 0 && (
                  <span className="ml-1 text-gray-500">· excludes {excluded.length}</span>
                )}
              </p>
            </div>
          </div>

          {/* Right: over/under amount */}
          <div className="text-right">
            <div
              className="text-4xl font-bold"
              style={{ color: isOver ? 'var(--color-over)' : 'var(--color-under)' }}
            >
              {formatOverUnder(summary.overUnder)}
            </div>
            <div className="flex items-center gap-2 justify-end mt-1">
              <span className="text-gray-600 text-sm">{isOver ? 'over budget' : 'under budget'}</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: isOver ? 'var(--color-over)' : 'var(--color-under)' }}
              >
                {pct !== null ? (isOver ? '+' : '') + pct.toFixed(1) + '%' : '—'}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {formatCurrency(summary.totalActual)} Spend ·{' '}
              {formatCurrency(summary.totalBudget)} {selectedScenario} ·{' '}
              {formatBudgetUsed(summary.totalActual, summary.totalBudget)}
            </div>
          </div>
        </div>

        {/* Exclusions bar */}
        <div className="mt-5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Excludes from all numbers:
          </span>
          {excluded.length === 0 && (
            <span className="text-xs text-gray-400 italic">None</span>
          )}
          {excluded.map(cat => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/70 text-gray-700"
            >
              {cat}
              <button
                onClick={() => onExcludeChange(excluded.filter(c => c !== cat))}
                className="hover:text-red-500"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/70 hover:bg-white text-gray-700 transition-colors border border-dashed border-gray-300"
          >
            <Plus size={10} /> Edit
          </button>
        </div>
      </div>

      {showModal && (
        <ExcludeModal
          allCategories={allCategories}
          excluded={excluded}
          onChange={onExcludeChange}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Categories Card
// ─────────────────────────────────────────────────────────────────────────────

function TopCategories({ categories, sortMode, onSortMode, onSelectCategory, selectedCategory, excluded }) {
  const excludedCount = excluded.length
  const showExcluded = sortMode === 'excluded'

  return (
    <div className="bg-white rounded-2xl p-5 flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Top by Spend</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-900 text-base">Top 3 categories</h2>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
          {['spend','over','under'].map(mode => (
            <button
              key={mode}
              onClick={() => onSortMode(mode)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all capitalize ${
                sortMode === mode
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {mode}
            </button>
          ))}
          {excludedCount > 0 && (
            <button
              onClick={() => onSortMode('excluded')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                sortMode === 'excluded'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Excluded {excludedCount}
            </button>
          )}
        </div>
      </div>

      {categories.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">No categories found</div>
      )}

      <div className="space-y-3">
        {categories.map((cat, i) => {
          const isSelected = selectedCategory === cat.category
          const isOver = cat.delta >= 0
          return (
            <button
              key={cat.category}
              onClick={() => onSelectCategory(isSelected ? null : cat.category)}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 flex gap-3">
                    <span>Spend <strong className="text-gray-700">{formatCurrency(cat.actual)}</strong></span>
                    <span>Planned <strong className="text-gray-700">{formatCurrency(cat.budget)}</strong></span>
                  </div>
                </div>
                <div className="text-center min-w-[80px]">
                  <div className="text-sm font-semibold text-gray-800">{cat.category}</div>
                </div>
                <div className="text-right min-w-[80px]">
                  <div
                    className="text-sm font-bold"
                    style={{ color: isOver ? 'var(--color-over)' : 'var(--color-under)' }}
                  >
                    {formatOverUnder(cat.delta)}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase">Over/(Under)</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Vendors Card
// ─────────────────────────────────────────────────────────────────────────────

// Uses illustrative palette CSS vars so they update when org colors change
const VENDOR_COLORS = [
  'var(--ill-1)',   // accent  (org primary CTA)
  'var(--ill-3)',   // primary (org secondary)
  'var(--ill-4)',   // Rust
  'var(--ill-6)',   // Teal
  'var(--ill-5)',   // Mustard
]

function TopVendors({ vendors, total, selectedCategory }) {
  const title = selectedCategory ? `In ${selectedCategory}` : 'Across all categories'
  const hint  = selectedCategory ? null : 'Pick a category % to scope'

  return (
    <div className="bg-white rounded-2xl p-5" style={{ width: '340px', flexShrink: 0 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{title}</span>
        {hint && <span className="text-[10px] text-gray-400 italic">{hint}</span>}
      </div>
      <h2 className="font-bold text-gray-900 text-base mb-4">Top 3 vendors</h2>

      {total > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          Where the team's money went · <strong>{formatCurrency(total)}</strong> total
        </p>
      )}

      {vendors.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">No vendor data</div>
      )}

      <div className="space-y-4">
        {vendors.map((v, i) => (
          <div key={v.vendor} className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
              style={{ backgroundColor: VENDOR_COLORS[i % VENDOR_COLORS.length] }}
            >
              {v.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 leading-tight">{v.vendor}</span>
                <span className="text-sm font-bold text-gray-900 flex-shrink-0">{formatCurrency(v.amount)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(v.pct, 100)}%`,
                      backgroundColor: VENDOR_COLORS[i % VENDOR_COLORS.length],
                    }}
                  />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">
                {v.pct.toFixed(0)}% of total · {v.transactions} transaction{v.transactions !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart tooltip
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, cumulative }) {
  if (!active || !payload?.length) return null
  const actual = payload.find(p => p.dataKey === 'actual')
  const budget = payload.find(p => p.dataKey === 'budget')
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <div className="font-semibold text-gray-700 mb-2">{label}</div>
      {actual && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-gray-900 rounded" />
          <span className="text-gray-600">Spend</span>
          <span className="font-bold ml-auto">{formatCurrency(actual.value)}</span>
        </div>
      )}
      {budget && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-0.5 border-t-2 border-dashed border-teal-500" />
          <span className="text-gray-600">{cumulative ? 'Planned (cumulative)' : 'Planned'}</span>
          <span className="font-bold ml-auto">{formatCurrency(budget.value)}</span>
        </div>
      )}
      {actual && budget && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-500">Over/(Under)</span>
            <span
              className="font-bold"
              style={{ color: actual.value >= budget.value ? 'var(--color-over)' : 'var(--color-under)' }}
            >
              {formatOverUnder(actual.value - budget.value)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Chart Card
// ─────────────────────────────────────────────────────────────────────────────

function TrendChart({ actuals, budgetFlat, scenario, dateRange, excluded, selectedCategory }) {
  const [cumulative, setCumulative] = useState(true)
  const [chartCategory, setChartCategory] = useState(null)

  // When a category is selected from the top categories panel, reflect it
  const displayCategory = selectedCategory || chartCategory

  const allCategories = useMemo(() => {
    const cats = [...new Set(actuals.map(t => t.category).filter(Boolean))].sort()
    return cats
  }, [actuals])

  const filteredActuals = useMemo(() => {
    const inRange = filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate)
    return inRange.filter(t => !excluded.includes(t.category))
  }, [actuals, dateRange, excluded])

  const series = useMemo(() => buildChartSeries(
    filteredActuals,
    budgetFlat.filter(b => !excluded.includes(b.category)),
    scenario,
    dateRange.startDate,
    dateRange.endDate,
    displayCategory,
    cumulative,
  ), [filteredActuals, budgetFlat, scenario, dateRange, displayCategory, cumulative, excluded])

  const periodSpend   = filteredActuals.reduce((s, t) => s + t.amount, 0)
  const budgetByCat   = calcBudgetByCategory(
    budgetFlat.filter(b => !excluded.includes(b.category)),
    scenario,
    dateRange.startDate,
    dateRange.endDate,
  )
  const periodBudget  = Object.values(budgetByCat).reduce((s, v) => s + v, 0)
  const overUnder     = periodSpend - periodBudget

  // Monthly avg and peak
  const monthlyActuals = useMemo(() => {
    const byMonth = {}
    filteredActuals.forEach(t => {
      const m = t.date.substring(0, 7)
      byMonth[m] = (byMonth[m] || 0) + t.amount
    })
    return Object.values(byMonth)
  }, [filteredActuals])
  const monthlyAvg    = monthlyActuals.length > 0 ? monthlyActuals.reduce((a,b) => a+b, 0) / monthlyActuals.length : 0
  const peakMonth     = monthlyActuals.length > 0 ? Math.max(...monthlyActuals) : 0

  const yMax = series.length > 0
    ? Math.ceil(Math.max(...series.map(d => Math.max(d.actual, d.budget))) * 1.1 / 50000) * 50000
    : 100000

  function yFormatter(val) {
    if (val >= 1000000) return '$' + (val/1000000).toFixed(1) + 'M'
    if (val >= 1000)    return '$' + (val/1000).toFixed(0) + 'K'
    return '$' + val
  }

  return (
    <div className="bg-white rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Trend · vs {scenario}{excluded.length > 0 ? ` · Excludes ${excluded.join(', ')}` : ''}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h2 className="font-bold text-gray-900">Monthly spend</h2>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-gray-900" />
              {displayCategory ? `${displayCategory} only` : 'Total spend'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Category dropdown */}
          <div className="relative">
            <select
              value={displayCategory || ''}
              onChange={e => setChartCategory(e.target.value || null)}
              className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="">All categories (Total)</option>
              {allCategories
                .filter(c => !excluded.includes(c))
                .map(c => <option key={c} value={c}>{c}</option>)
              }
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* Monthly / Cumulative */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1 py-1">
            <button
              onClick={() => setCumulative(false)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${
                !cumulative ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCumulative(true)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${
                cumulative ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Cumulative
            </button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4 mb-6 py-3 border-y border-gray-100">
        {[
          { label: 'Period Spend',     value: formatCurrency(periodSpend) },
          { label: 'Planned Spend',    value: formatCurrency(periodBudget) },
          { label: 'Over/(Under)',     value: formatOverUnder(overUnder),  color: overUnder >= 0 ? 'var(--color-over)' : 'var(--color-under)' },
          { label: 'Monthly Avg',      value: formatCurrency(monthlyAvg) },
          { label: 'Peak Month',       value: formatCurrency(peakMonth) },
        ].map(stat => (
          <div key={stat.label}>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{stat.label}</div>
            <div className="text-lg font-bold mt-0.5" style={{ color: stat.color || 'inherit' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={series} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={yFormatter}
            tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
            axisLine={false}
            tickLine={false}
            domain={[0, yMax]}
            width={55}
          />
          <Tooltip content={<ChartTooltip cumulative={cumulative} />} />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="var(--ill-1)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--ill-1)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            name="Spend"
          />
          <Line
            type="monotone"
            dataKey="budget"
            stroke="var(--ill-3)"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4 }}
            name="Planned Spend"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-2 justify-center">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 h-0.5 rounded" style={{ backgroundColor: 'var(--ill-1)' }} />
          Spend
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-5 border-t-2 border-dashed" style={{ borderColor: 'var(--ill-3)' }} />
          {scenario} {cumulative ? '(cumulative)' : ''}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Briefing Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  const {
    budgetFlat,
    selectedScenario,
    dateRange,
    briefingExclusions,
    setBriefingExclusions,
  } = useApp()

  // Scope all actuals to this team's departments only
  const { teamActuals: actuals } = useTeam()

  const [sortMode, setSortMode] = useState('spend')
  const [selectedCategory, setSelectedCategory] = useState(null)

  // When sort mode changes, reset category selection
  function handleSortMode(mode) {
    setSortMode(mode)
    setSelectedCategory(null)
  }

  // All categories from actuals
  const allCategories = useMemo(() => getUniqueValues(actuals, 'category'), [actuals])

  // Filter actuals to selected range
  const filteredActuals = useMemo(() =>
    filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate)
      .filter(t => !briefingExclusions.includes(t.category)),
    [actuals, dateRange, briefingExclusions]
  )

  // Budget by category for selected scenario + range
  const budgetByCat = useMemo(() =>
    calcBudgetByCategory(budgetFlat, selectedScenario, dateRange.startDate, dateRange.endDate),
    [budgetFlat, selectedScenario, dateRange]
  )

  // Summary for hero
  const summary = useMemo(() =>
    calcBriefingSummary(actuals, budgetFlat, selectedScenario, dateRange.startDate, dateRange.endDate, briefingExclusions),
    [actuals, budgetFlat, selectedScenario, dateRange, briefingExclusions]
  )

  // Top categories
  const actualsByCat = useMemo(() => aggregateBy(filteredActuals, 'category'), [filteredActuals])

  const topCategories = useMemo(() => {
    if (sortMode === 'excluded') {
      return briefingExclusions.map(cat => ({
        category: cat,
        actual:   aggregateBy(filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate), 'category')[cat] || 0,
        budget:   budgetByCat[cat] || 0,
        delta:    0,
      }))
    }
    return getTopCategories(actualsByCat, budgetByCat, sortMode, 3, briefingExclusions)
  }, [actualsByCat, budgetByCat, sortMode, briefingExclusions, actuals, dateRange])

  // Top vendors
  const inRangeActuals = useMemo(() =>
    filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate),
    [actuals, dateRange]
  )

  const topVendors = useMemo(() => {
    return getTopVendors(
      inRangeActuals,
      selectedCategory,        // null = all, else filter by category
      briefingExclusions,
      3,
    )
  }, [inRangeActuals, selectedCategory, briefingExclusions])

  const vendorTotal = useMemo(() => topVendors.reduce((s, v) => s + v.amount, 0), [topVendors])

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Hero */}
        <BriefingHero
          summary={summary}
          excluded={briefingExclusions}
          allCategories={allCategories}
          onExcludeChange={setBriefingExclusions}
        />

        {/* Categories + Vendors row */}
        <div className="flex gap-5">
          <TopCategories
            categories={topCategories}
            sortMode={sortMode}
            onSortMode={handleSortMode}
            onSelectCategory={setSelectedCategory}
            selectedCategory={selectedCategory}
            excluded={briefingExclusions}
          />
          <TopVendors
            vendors={topVendors}
            total={vendorTotal}
            selectedCategory={selectedCategory}
          />
        </div>

        {/* Trend chart */}
        <TrendChart
          actuals={actuals}
          budgetFlat={budgetFlat}
          scenario={selectedScenario}
          dateRange={dateRange}
          excluded={briefingExclusions}
          selectedCategory={selectedCategory}
        />
      </div>
      <CommentPinFAB page="briefing" rightClassName="right-6" />
    </>
  )
}
