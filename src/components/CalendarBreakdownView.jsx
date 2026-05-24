import React, { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Ban } from 'lucide-react'
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
 * Budget data has department + category. Maps to drill order keys when
 * f0 = 'category' or 'department'; zeros for other first-level fields.
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

      if (activeDepts && !activeDepts.has(d)) continue

      if (f0 === 'department') {
        add(d, m.key, amt)
        if (f1 === 'category') add(`${d}|${cat}`, m.key, amt)
      } else if (f0 === 'category') {
        add(cat, m.key, amt)
        if (f1 === 'department') add(`${cat}|${d}`, m.key, amt)
      }
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
 * Get every expandable row key across all drill levels (for "expand all").
 */
function getAllExpandableKeys(transactions, drillOrder) {
  if (drillOrder.length < 2) return new Set()
  const keys = new Set()

  function process(items, depth, keyPrefix) {
    if (depth >= drillOrder.length - 1) return   // leaf level — nothing to expand
    const field = drillOrder[depth]
    const values = [...new Set(items.map(t => t[field] || 'N/A'))]
    for (const val of values) {
      const key = keyPrefix ? `${keyPrefix}|${val}` : val
      keys.add(key)
      const sub = items.filter(t => (t[field] || 'N/A') === val)
      process(sub, depth + 1, key)
    }
  }

  process(transactions, 0, '')
  return keys
}

/**
 * Filter transactions matching a key path (pipe-separated drillOrder values).
 */
function getTransactionsForKey(transactions, key, drillOrder) {
  const parts = key.split('|')
  return transactions.filter(tx =>
    parts.every((part, i) => (tx[drillOrder[i]] || 'N/A') === part)
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
  const [openLeaves,     setOpenLeaves]     = useState(new Set())   // leaf rows showing inline txs

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

  function toggleYear(yr) {
    setCollapsedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n })
  }

  function handleRowClick(row) {
    if (!row.hasChildren) {
      // Leaf: toggle inline transaction expansion
      setOpenLeaves(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n })
      return
    }
    setExpanded(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n })
  }

  function expandAll() {
    setExpanded(getAllExpandableKeys(transactions, drillOrder))
  }

  function collapseAll() {
    setExpanded(new Set())
    setOpenLeaves(new Set())
  }

  const get      = (key, mk) => lu[key]?.[mk] || 0
  const yearTot  = (key, yr) => (yearGroups[yr] || []).reduce((s, m) => s + get(key, m.key), 0)
  const rowTotal = (key)     => months.reduce((s, m) => s + get(key, m.key), 0)
  const rowLabel = (row)     => row?.field === 'department' ? (deptNames[row.label] || row.label) : (row?.label ?? '')

  const cc  = 'px-2.5 py-2 text-right tabular-nums text-xs whitespace-nowrap'
  const cct = 'px-2.5 py-1.5 text-right tabular-nums text-xs whitespace-nowrap'
  const ch  = 'px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap'

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
            <span className="ml-2 opacity-60">· {drillOrder.slice(0, 3).join(' → ')}</span>
          )}
        </span>

        {/* Expand / Collapse all */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={expandAll}
            className="text-[10px] text-gray-500 hover:text-gray-800 font-medium hover:bg-gray-200/60 px-2 py-0.5 rounded transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="text-[10px] text-gray-500 hover:text-gray-800 font-medium hover:bg-gray-200/60 px-2 py-0.5 rounded transition-colors"
          >
            Collapse all
          </button>
        </div>

        <div className="w-px h-4 bg-gray-200" />

        {/* Actuals / Budget toggle */}
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
            {rows.flatMap(row => {
              const isExp      = expanded.has(row.key)
              const isLeafOpen = !row.hasChildren && openLeaves.has(row.key)
              const tot        = rowTotal(row.key)
              const isTop      = row.depth === 0
              const isMid      = row.depth === 1
              const numCls     = isTop ? 'font-semibold text-gray-700' : isMid ? 'font-medium text-gray-600' : 'text-gray-500'
              const namCls     = isTop ? 'font-semibold text-gray-800' : isMid ? 'font-medium text-gray-700' : 'text-gray-600'

              // ── Main group row ──
              const mainRow = (
                <tr key={row.key}
                  className={`border-b border-gray-50 transition-colors ${
                    isLeafOpen
                      ? 'bg-teal-50/40'
                      : isTop ? 'bg-gray-50/70 hover:bg-gray-100/40' : 'hover:bg-gray-50/50'
                  }`}>

                  {/* Sticky name cell */}
                  <td
                    className={`sticky left-0 z-10 border-r border-gray-100 px-4 py-2 ${
                      isLeafOpen ? 'bg-teal-50/60' : isTop ? 'bg-gray-50/80' : 'bg-white'
                    }`}
                    style={{ minWidth: 240 }}>

                    <div className="flex items-center gap-1.5 group" style={{ paddingLeft: row.depth * 16 }}>

                      {/* Expand/collapse or open-transactions icon */}
                      <button
                        onClick={() => handleRowClick(row)}
                        className={`w-4 h-4 flex-shrink-0 flex items-center justify-center transition-colors ${
                          !row.hasChildren
                            ? isLeafOpen ? 'text-teal-600' : 'text-gray-300 hover:text-teal-500'
                            : 'text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {!row.hasChildren
                          ? (isLeafOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>)
                          : (isExp ? <ChevronDown size={11}/> : <ChevronRight size={11}/>)
                        }
                      </button>

                      {/* Label */}
                      <span
                        className={`text-xs ${namCls} flex-1 min-w-0 truncate ${!row.hasChildren ? 'cursor-pointer hover:text-teal-700' : ''}`}
                        onClick={() => !row.hasChildren ? handleRowClick(row) : undefined}
                        title={rowLabel(row)}
                      >
                        {rowLabel(row)}
                      </span>

                      {/* Hide button — appears on row hover */}
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

              // ── Inline transaction rows (leaf only, when expanded) ──
              if (!isLeafOpen) return [mainRow]

              const txs = getTransactionsForKey(transactions, row.key, drillOrder)
                .sort((a, b) => b.date.localeCompare(a.date))

              const txRows = txs.map((t, ti) => {
                const txMo = t.date?.slice(0, 7)   // 'YYYY-MM'
                const txYr = t.date?.slice(0, 4)   // 'YYYY'

                return (
                  <tr key={`${row.key}-tx-${ti}`}
                    className="border-b border-gray-50 last:border-0 bg-white hover:bg-teal-50/20 transition-colors">

                    {/* Name cell */}
                    <td className="sticky left-0 z-10 bg-white border-r border-gray-100 px-4 py-1.5"
                      style={{ minWidth: 240 }}>
                      <div className="flex items-center gap-2 min-w-0"
                        style={{ paddingLeft: (row.depth + 1) * 16 + 4 }}>
                        <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"/>
                        <span className="text-xs text-gray-700 font-medium truncate flex-1 min-w-0">
                          {t.vendor || '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                          {t.date}
                        </span>
                      </div>
                    </td>

                    {/* Month cells — amount only in the matching month */}
                    {years.flatMap(yr =>
                      collapsedYears.has(yr)
                        ? [(
                          <td key={yr} className={`${cct} border-l border-gray-100`}>
                            {txYr === String(yr)
                              ? <span className="text-gray-600">{formatCurrency(t.amount, { compact: true })}</span>
                              : <span className="text-gray-200">—</span>}
                          </td>
                        )]
                        : (yearGroups[yr] || []).map((m, i) => (
                          <td key={m.key}
                            className={`${cct} ${i === 0 ? 'border-l border-gray-100' : ''}`}>
                            {m.key === txMo
                              ? <span className="text-gray-600">{formatCurrency(t.amount, { compact: true })}</span>
                              : <span className="text-gray-200">—</span>}
                          </td>
                        ))
                    )}

                    {/* Total cell */}
                    <td className={`${cct} border-l border-gray-200 text-gray-600`}>
                      {formatCurrency(t.amount, { compact: true })}
                    </td>
                  </tr>
                )
              })

              return [mainRow, ...txRows]
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
    </div>
  )
}
