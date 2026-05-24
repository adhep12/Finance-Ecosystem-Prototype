import React, { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, X, Ban } from 'lucide-react'
import { formatCurrency } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCalendarMonths(dateRange) {
  if (!dateRange?.startDate || !dateRange?.endDate) return []
  const months = []
  const end = new Date(dateRange.endDate + 'T00:00:00')
  const cur = new Date(dateRange.startDate + 'T00:00:00')
  cur.setDate(1)
  while (cur <= end) {
    months.push({
      year:  cur.getFullYear(),
      month: cur.getMonth() + 1,
      key:   `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      label: cur.toLocaleString('en-US', { month: 'short' }),
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

function groupByYear(months) {
  return months.reduce((acc, m) => {
    if (!acc[m.year]) acc[m.year] = []
    acc[m.year].push(m)
    return acc
  }, {})
}

/**
 * Build actuals lookup following drill order exactly.
 * Keys: drillOrder field values joined by '|' at each depth.
 * { rowKey → { monthKey → total } }
 */
function buildActualsLookup(transactions, drillOrder) {
  if (!drillOrder.length) return {}
  const lu = {}
  const add = (k, mo, amt) => { if (!lu[k]) lu[k] = {}; lu[k][mo] = (lu[k][mo] || 0) + amt }

  for (const tx of transactions) {
    const mo = tx.date?.slice(0, 7); if (!mo) continue
    const amt = tx.amount || 0
    let key = ''
    for (let depth = 0; depth < drillOrder.length; depth++) {
      const val = tx[drillOrder[depth]] || 'N/A'
      key = key ? `${key}|${val}` : val
      add(key, mo, amt)
    }
  }
  return lu
}

/**
 * Build budget lookup.
 * Budget data has department + category fields.
 * Maps to drill order keys for f0='category' or 'department'.
 * Other first-level fields: no budget data available (returns zeros).
 */
function buildBudgetLookup(budgetFlat, scenario, months, drillOrder, activeDepts) {
  if (!drillOrder.length) return {}
  const lu = {}
  const add = (k, mo, amt) => { if (!lu[k]) lu[k] = {}; lu[k][mo] = (lu[k][mo] || 0) + amt }

  const f0 = drillOrder[0]
  const f1 = drillOrder[1]

  for (const m of months) {
    for (const e of (budgetFlat || [])) {
      if (e.scenario !== scenario) continue
      const d   = e.department || 'Unknown'
      const cat = e.category   || 'N/A'
      const amt = e.monthlyAmount || 0

      // Apply department filter
      if (activeDepts && !activeDepts.has(d)) continue

      if (f0 === 'department') {
        add(d, m.key, amt)
        if (f1 === 'category') add(`${d}|${cat}`, m.key, amt)
      } else if (f0 === 'category') {
        add(cat, m.key, amt)
        if (f1 === 'department') add(`${cat}|${d}`, m.key, amt)
      }
      // Other f0 values: budget data not available at this granularity
    }
  }
  return lu
}

/**
 * Build flat list of visible rows following drill order exactly.
 * Row: { key, label, depth, hasChildren, field }
 */
function buildRows(transactions, drillOrder, expanded) {
  if (!drillOrder.length) return []
  const rows = []

  function process(items, depth, keyPrefix) {
    if (depth >= drillOrder.length) return
    const field       = drillOrder[depth]
    const values      = [...new Set(items.map(t => t[field] || 'N/A'))].sort()
    const hasChildren = depth < drillOrder.length - 1

    for (const val of values) {
      const key      = keyPrefix ? `${keyPrefix}|${val}` : val
      const subItems = items.filter(t => (t[field] || 'N/A') === val)
      rows.push({ key, label: val, depth, hasChildren, field })
      if (hasChildren && expanded.has(key)) {
        process(subItems, depth + 1, key)
      }
    }
  }

  process(transactions, 0, '')
  return rows
}

/**
 * Filter transactions matching a given key path (pipe-separated values per drillOrder).
 */
function getTransactionsForKey(transactions, key, drillOrder) {
  const parts = key.split('|')
  return transactions.filter(tx =>
    parts.every((part, i) => (tx[drillOrder[i]] || 'N/A') === part)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction side panel
// ─────────────────────────────────────────────────────────────────────────────

function TransactionPanel({ label, field, transactions: txs, deptNames, onClose }) {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date))
  const total  = txs.reduce((s, t) => s + t.amount, 0)

  return (
    <>
      {/* Scrim */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-gray-200 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{field}</div>
            <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate" title={label}>{label}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-3 mt-0.5">
            <span className="text-sm font-bold text-gray-900">{formatCurrency(total)}</span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Count bar */}
        <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {sorted.length} transaction{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {sorted.map((t, i) => (
            <div key={i} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{t.vendor || '—'}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                    <span>{t.date}</span>
                    {t.description && <span className="truncate opacity-70">{t.description}</span>}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {deptNames?.[t.department] || t.department}
                    {t.category ? ` · ${t.category}` : ''}
                    {t.account  ? ` · ${t.account}`  : ''}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {formatCurrency(t.amount)}
                </div>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">No transactions</div>
          )}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarBreakdownView({
  transactions = [],
  budgetFlat   = [],
  selectedScenario,
  drillOrder   = ['category', 'account', 'grant', 'vendor'],
  dateRange,
  deptNames    = {},
  activeDepts  = null,
  onHide,
}) {
  const [mode,           setMode]           = useState('actuals')
  const [collapsedYears, setCollapsedYears] = useState(new Set())
  const [expanded,       setExpanded]       = useState(new Set())
  const [panelRow,       setPanelRow]       = useState(null)   // { key, label, field }

  const months     = useMemo(() => getCalendarMonths(dateRange), [dateRange])
  const yearGroups = useMemo(() => groupByYear(months), [months])
  const years      = useMemo(() => Object.keys(yearGroups).map(Number).sort(), [yearGroups])

  const actualsLu = useMemo(
    () => buildActualsLookup(transactions, drillOrder),
    [transactions, drillOrder],
  )
  const budgetLu = useMemo(
    () => buildBudgetLookup(budgetFlat, selectedScenario, months, drillOrder, activeDepts),
    [budgetFlat, selectedScenario, months, drillOrder, activeDepts],
  )
  const lu = mode === 'actuals' ? actualsLu : budgetLu

  const rows = useMemo(
    () => buildRows(transactions, drillOrder, expanded),
    [transactions, drillOrder, expanded],
  )

  // Transactions for the side panel
  const panelTxs = useMemo(() => {
    if (!panelRow) return []
    return getTransactionsForKey(transactions, panelRow.key, drillOrder)
  }, [panelRow, transactions, drillOrder])

  function toggleYear(yr) {
    setCollapsedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n })
  }

  function handleRowClick(row) {
    if (!row.hasChildren) {
      // Leaf: toggle transaction panel
      setPanelRow(prev => prev?.key === row.key ? null : { key: row.key, label: row.label, field: row.field })
      return
    }
    setExpanded(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n })
  }

  const get      = (key, mk) => lu[key]?.[mk] || 0
  const yearTot  = (key, yr) => (yearGroups[yr] || []).reduce((s, m) => s + get(key, m.key), 0)
  const rowTotal = (key)     => months.reduce((s, m) => s + get(key, m.key), 0)
  const rowLabel = (row)     => row?.field === 'department' ? (deptNames[row.label] || row.label) : (row?.label ?? '')

  const cc = 'px-2.5 py-2 text-right tabular-nums text-xs whitespace-nowrap'
  const ch = 'px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap'

  const topFieldLabel = drillOrder[0]
    ? drillOrder[0].charAt(0).toUpperCase() + drillOrder[0].slice(1)
    : 'Name'

  if (months.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm bg-white">
        No months in the selected date range.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50/70">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex-1">
          {months.length} month{months.length !== 1 ? 's' : ''} · {years.length} year{years.length !== 1 ? 's' : ''}
          {drillOrder.length > 0 && (
            <span className="ml-2 opacity-60">
              · {drillOrder.slice(0, 3).join(' → ')}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-1 py-0.5">
          {['actuals', 'budget'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium capitalize transition-all ${
                mode === m ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 'max-content', width: '100%' }}>
          <thead>
            {/* Year row */}
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-50 border-b border-gray-200 text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400"
                style={{ minWidth: 240 }}>
                {topFieldLabel}
              </th>
              {years.map(yr => {
                const ms        = yearGroups[yr] || []
                const collapsed = collapsedYears.has(yr)
                return collapsed ? (
                  <th key={yr} onClick={() => toggleYear(yr)}
                    className={`${ch} text-right border-l border-b border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors`}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      <ChevronRight size={10}/>{yr}
                    </span>
                  </th>
                ) : (
                  <th key={yr} colSpan={ms.length} onClick={() => toggleYear(yr)}
                    className={`${ch} text-center border-l border-b border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors`}>
                    <span className="inline-flex items-center gap-1 justify-center">
                      <ChevronDown size={10}/>{yr}
                      <span className="font-normal opacity-60">({ms.length}mo)</span>
                    </span>
                  </th>
                )
              })}
              <th className={`${ch} text-right border-l border-b border-gray-200 bg-gray-50`}>Total</th>
            </tr>

            {/* Month row */}
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-50 border-b border-gray-200 px-4 py-1.5"
                style={{ minWidth: 240 }}/>
              {years.flatMap(yr =>
                collapsedYears.has(yr) ? [] :
                (yearGroups[yr] || []).map((m, i) => (
                  <th key={m.key}
                    className={`${ch} border-b border-gray-200 ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                    {m.label}
                  </th>
                ))
              )}
              <th className={`${ch} border-l border-b border-gray-200`}/>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => {
              const isExp    = expanded.has(row.key)
              const tot      = rowTotal(row.key)
              const isTop    = row.depth === 0
              const isMid    = row.depth === 1
              const isLeaf   = !row.hasChildren
              const isActive = panelRow?.key === row.key
              const numCls   = isTop ? 'font-semibold text-gray-700' : isMid ? 'font-medium text-gray-600' : 'text-gray-500'
              const namCls   = isTop ? 'font-semibold text-gray-800' : isMid ? 'font-medium text-gray-700' : 'text-gray-600'

              return (
                <tr key={row.key}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${
                    isActive
                      ? 'bg-teal-50/40'
                      : isTop ? 'bg-gray-50/70 hover:bg-gray-100/40' : 'hover:bg-gray-50/50'
                  }`}>

                  {/* Sticky name cell */}
                  <td
                    className={`sticky left-0 z-10 border-r border-gray-100 px-4 py-2 ${
                      isActive ? 'bg-teal-50/60' : isTop ? 'bg-gray-50/80' : 'bg-white'
                    }`}
                    style={{ minWidth: 240 }}>

                    <div className="flex items-center gap-1.5 group" style={{ paddingLeft: row.depth * 16 }}>

                      {/* Expand/collapse or open-panel icon */}
                      <button
                        onClick={() => handleRowClick(row)}
                        className={`w-4 h-4 flex-shrink-0 flex items-center justify-center transition-colors ${
                          isLeaf
                            ? isActive ? 'text-teal-600' : 'text-gray-300 hover:text-teal-500'
                            : 'text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {isLeaf
                          ? <ChevronRight size={11}/>
                          : isExp ? <ChevronDown size={11}/> : <ChevronRight size={11}/>
                        }
                      </button>

                      {/* Label */}
                      <span
                        className={`text-xs ${namCls} flex-1 min-w-0 truncate ${isLeaf ? 'cursor-pointer hover:text-teal-700' : ''}`}
                        onClick={() => isLeaf ? handleRowClick(row) : undefined}
                        title={rowLabel(row)}
                      >
                        {rowLabel(row)}
                      </span>

                      {/* Hide button — visible on row hover */}
                      {onHide && (
                        <button
                          className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                          onClick={e => { e.stopPropagation(); onHide(row.field, row.label) }}
                          title={`Hide ${row.label}`}
                        >
                          <Ban size={10} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Month value cells */}
                  {years.flatMap(yr =>
                    collapsedYears.has(yr)
                      ? [(
                        <td key={yr} className={`${cc} border-l border-gray-100 ${numCls}`}>
                          {yearTot(row.key, yr)
                            ? formatCurrency(yearTot(row.key, yr), { compact: true })
                            : <span className="text-gray-200">—</span>}
                        </td>
                      )]
                      : (yearGroups[yr] || []).map((m, i) => {
                          const v = get(row.key, m.key)
                          return (
                            <td key={m.key}
                              className={`${cc} ${i === 0 ? 'border-l border-gray-100' : ''} ${numCls}`}>
                              {v
                                ? formatCurrency(v, { compact: true })
                                : <span className="text-gray-200">—</span>}
                            </td>
                          )
                        })
                  )}

                  {/* Total cell */}
                  <td className={`${cc} border-l border-gray-200 ${
                    isTop ? 'font-bold text-gray-800' : isMid ? 'font-semibold text-gray-700' : 'font-medium text-gray-600'
                  }`}>
                    {tot ? formatCurrency(tot, { compact: true }) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={200} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No data for the selected date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction side panel */}
      {panelRow && (
        <TransactionPanel
          label={rowLabel(panelRow)}
          field={panelRow.field}
          transactions={panelTxs}
          deptNames={deptNames}
          onClose={() => setPanelRow(null)}
        />
      )}
    </div>
  )
}
