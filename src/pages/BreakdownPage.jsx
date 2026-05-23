import React, { useState, useMemo } from 'react'
import { ChevronRight, X, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2, Tag } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  filterActualsByRange,
  calcBudgetByCategory,
  aggregateBy,
  countBy,
} from '../utils/dataProcessing'
import {
  formatCurrency,
  formatOverUnder,
  formatPercent,
  calcOverUnderPct,
} from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Drill path item (breadcrumb chip)
// ─────────────────────────────────────────────────────────────────────────────

function DrillChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white text-xs rounded-full font-medium">
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5">
        <X size={10} />
      </button>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl p-4 flex items-start gap-3">
      {Icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color ? color + '20' : '#F3F4F6' }}>
          <Icon size={16} style={{ color: color || '#6B7280' }} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
        <div className="text-xl font-bold mt-0.5" style={{ color: color || 'inherit' }}>{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget vs Actuals table row
// ─────────────────────────────────────────────────────────────────────────────

function TableRow({ label, actual, budget, transactions, onClick, depth = 0 }) {
  const delta = actual - budget
  const pct = calcOverUnderPct(actual, budget)
  const isOver = delta >= 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-100 transition-colors group"
      style={{ paddingLeft: `${16 + depth * 20}px` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-800">{label}</span>
          {onClick && <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors" />}
        </div>
        {transactions !== undefined && (
          <div className="text-xs text-gray-400 mt-0.5">{transactions} transactions</div>
        )}
      </div>
      <div className="text-right" style={{ width: '110px' }}>
        <div className="text-sm font-semibold text-gray-800">{formatCurrency(actual)}</div>
        <div className="text-xs text-gray-400">actual</div>
      </div>
      <div className="text-right" style={{ width: '110px' }}>
        <div className="text-sm text-gray-600">{formatCurrency(budget)}</div>
        <div className="text-xs text-gray-400">budget</div>
      </div>
      <div className="text-right" style={{ width: '100px' }}>
        <div
          className="text-sm font-bold"
          style={{ color: isOver ? 'var(--color-over)' : 'var(--color-under)' }}
        >
          {formatOverUnder(delta)}
        </div>
        <div className="text-xs text-gray-400">{pct !== null ? formatPercent(pct, { showSign: true }) : '—'}</div>
      </div>
      {/* Bar */}
      <div className="w-24 flex-shrink-0">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min((actual / Math.max(actual, budget)) * 100, 100)}%`,
              backgroundColor: isOver ? 'var(--color-over)' : 'var(--color-under)',
            }}
          />
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 text-right">
          {budget > 0 ? Math.round((actual / budget) * 100) + '%' : '—'}
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown Page
// ─────────────────────────────────────────────────────────────────────────────

const DRILL_FIELDS = ['department', 'category', 'account', 'vendor', 'grant']
const DRILL_LABELS = { department: 'Department', category: 'Category', account: 'Account', vendor: 'Vendor', grant: 'Grant' }

export default function BreakdownPage() {
  const { actuals, budgetFlat, selectedScenario, dateRange } = useApp()

  // Active drill filters: [{ field, value }]
  const [drillPath, setDrillPath] = useState([])

  // Which field is the current grouping dimension
  const [groupBy, setGroupBy] = useState('category')

  // Filter actuals to date range + current drill path
  const filtered = useMemo(() => {
    let rows = filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate)
    for (const { field, value } of drillPath) {
      rows = rows.filter(t => (t[field] || 'N/A') === value)
    }
    return rows
  }, [actuals, dateRange, drillPath])

  // Budget for range
  const budgetByCat = useMemo(() =>
    calcBudgetByCategory(budgetFlat, selectedScenario, dateRange.startDate, dateRange.endDate),
    [budgetFlat, selectedScenario, dateRange]
  )

  // Group filtered actuals by current dimension
  const groups = useMemo(() => {
    const byGroup = aggregateBy(filtered, groupBy)
    const txCount = countBy(filtered, groupBy)
    const total   = filtered.reduce((s, t) => s + t.amount, 0)

    return Object.entries(byGroup)
      .map(([key, actual]) => {
        const budget = groupBy === 'category' ? (budgetByCat[key] || 0) : 0
        const delta  = actual - budget
        return { key, actual, budget, delta, transactions: txCount[key] || 0 }
      })
      .sort((a, b) => b.actual - a.actual)
  }, [filtered, groupBy, budgetByCat])

  // Summary KPIs
  const totalActual  = filtered.reduce((s, t) => s + t.amount, 0)
  const totalBudget  = groupBy === 'category'
    ? Object.entries(budgetByCat)
        .filter(([cat]) => !drillPath.some(d => d.field === 'category' && d.value !== cat))
        .reduce((s, [, v]) => s + v, 0)
    : 0
  const overUnder    = totalActual - totalBudget
  const avgTx        = filtered.length > 0 ? totalActual / filtered.length : 0
  const uniqueVendors= [...new Set(filtered.map(t => t.vendor))].length

  function drill(field, value) {
    // Can only drill deeper than current group by
    setDrillPath(prev => [...prev.filter(d => d.field !== field), { field, value }])
    // Move to next useful groupBy
    const idx = DRILL_FIELDS.indexOf(field)
    const next = DRILL_FIELDS[idx + 1]
    if (next) setGroupBy(next)
  }

  function removeDrill(field) {
    const idx = drillPath.findIndex(d => d.field === field)
    const newPath = drillPath.slice(0, idx)
    setDrillPath(newPath)
    // Reset groupBy to the field we removed at
    setGroupBy(field)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Breakdown</h1>
          <p className="text-sm text-gray-500 mt-0.5">Drill down by any combination of dimension</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          label="Total Spend"
          value={formatCurrency(totalActual)}
          sub={`${filtered.length} transactions`}
          icon={DollarSign}
          color="#1A1A2E"
        />
        <KPICard
          label="Vs Budget"
          value={formatOverUnder(overUnder)}
          sub={totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}% of budget` : 'No budget data'}
          icon={overUnder >= 0 ? TrendingUp : TrendingDown}
          color={overUnder >= 0 ? 'var(--color-over)' : 'var(--color-under)'}
        />
        <KPICard
          label="Avg Transaction"
          value={formatCurrency(avgTx)}
          sub={`${filtered.length} transactions`}
          icon={Receipt}
          color="#8B5CF6"
        />
        <KPICard
          label="Unique Vendors"
          value={uniqueVendors.toString()}
          sub="in this selection"
          icon={Tag}
          color="#0EA5A0"
        />
      </div>

      {/* Controls: drill path + group by */}
      <div className="bg-white rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters:</span>
          {drillPath.length === 0 && (
            <span className="text-xs text-gray-400 italic">None — showing all data</span>
          )}
          {drillPath.map(({ field, value }) => (
            <DrillChip
              key={field}
              label={`${DRILL_LABELS[field]}: ${value}`}
              onRemove={() => removeDrill(field)}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group by:</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1 py-1">
              {DRILL_FIELDS.map(f => (
                <button
                  key={f}
                  onClick={() => setGroupBy(f)}
                  className={`px-3 py-0.5 rounded-full text-xs font-medium capitalize transition-all ${
                    groupBy === f
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {DRILL_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
          <div className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {DRILL_LABELS[groupBy]}
          </div>
          <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500" style={{ width: '110px' }}>Actual</div>
          <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500" style={{ width: '110px' }}>Budget</div>
          <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500" style={{ width: '100px' }}>Over/(Under)</div>
          <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-24">% Used</div>
        </div>

        {groups.length === 0 && (
          <div className="text-center py-12 text-gray-400">No data for this selection</div>
        )}

        {groups.map(g => (
          <TableRow
            key={g.key}
            label={g.key}
            actual={g.actual}
            budget={g.budget}
            transactions={g.transactions}
            onClick={() => drill(groupBy, g.key)}
          />
        ))}

        {/* Total row */}
        {groups.length > 0 && (
          <div className="px-4 py-3 flex items-center gap-3 bg-gray-50 border-t-2 border-gray-200">
            <div className="flex-1 text-xs font-bold text-gray-700 uppercase tracking-wider">Total</div>
            <div className="text-right font-bold text-gray-800" style={{ width: '110px' }}>{formatCurrency(totalActual)}</div>
            <div className="text-right text-gray-600 font-semibold" style={{ width: '110px' }}>{totalBudget > 0 ? formatCurrency(totalBudget) : '—'}</div>
            <div
              className="text-right font-bold"
              style={{ width: '100px', color: overUnder >= 0 ? 'var(--color-over)' : 'var(--color-under)' }}
            >
              {totalBudget > 0 ? formatOverUnder(overUnder) : '—'}
            </div>
            <div className="w-24" />
          </div>
        )}
      </div>

      {/* Transaction list (when drilled in) */}
      {drillPath.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Transactions</h3>
            <p className="text-xs text-gray-500 mt-0.5">{filtered.length} transactions in current selection</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filtered.slice(0, 100).map((t, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                <div className="text-xs text-gray-400 w-20 flex-shrink-0">{t.date}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{t.vendor}</div>
                  <div className="text-xs text-gray-400 truncate">{t.description}</div>
                </div>
                <div className="text-xs text-gray-500 w-20 text-right">{t.category}</div>
                <div className="text-sm font-semibold text-gray-800 w-24 text-right">{formatCurrency(t.amount)}</div>
              </div>
            ))}
            {filtered.length > 100 && (
              <div className="text-center py-3 text-xs text-gray-400">
                Showing first 100 of {filtered.length} transactions
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
