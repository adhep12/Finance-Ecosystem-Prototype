import React, { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
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
 * Build actuals lookup: { rowKey → { monthKey → total } }
 * rowKey formats:
 *   depth 0:  'DEPT'
 *   depth 1:  'DEPT|val1'
 *   depth 2:  'DEPT|val1|val2'
 */
function buildActualsLookup(transactions, drillOrder) {
  const lu = {}
  const add = (k, mo, amt) => { if (!lu[k]) lu[k] = {}; lu[k][mo] = (lu[k][mo] || 0) + amt }

  for (const tx of transactions) {
    const mo  = tx.date?.slice(0, 7); if (!mo) continue
    const amt = tx.amount || 0
    const d   = tx.department || 'Unknown'
    add(d, mo, amt)
    const f1 = drillOrder[0]
    if (f1) {
      const v1 = tx[f1] || 'N/A'
      add(`${d}|${v1}`, mo, amt)
      const f2 = drillOrder[1]
      if (f2) add(`${d}|${v1}|${tx[f2] || 'N/A'}`, mo, amt)
    }
  }
  return lu
}

/**
 * Build budget lookup (department + first drillOrder field = category granularity)
 */
function buildBudgetLookup(budgetFlat, scenario, months) {
  const lu = {}
  const add = (k, mo, amt) => { if (!lu[k]) lu[k] = {}; lu[k][mo] = (lu[k][mo] || 0) + amt }
  for (const m of months) {
    for (const e of (budgetFlat || [])) {
      if (e.scenario !== scenario) continue
      const d   = e.department || 'Unknown'
      const cat = e.category   || 'N/A'
      const amt = e.monthlyAmount || 0
      add(d,          m.key, amt)
      add(`${d}|${cat}`, m.key, amt)
    }
  }
  return lu
}

/**
 * Build flat list of visible rows with depth and expansion info.
 * Hierarchy: Department (depth 0) → drillOrder[0] (depth 1) → drillOrder[1] (depth 2)
 */
function buildRows(transactions, drillOrder, expanded) {
  const rows = []
  const depts = [...new Set(transactions.map(t => t.department || 'Unknown'))].sort()

  for (const dept of depts) {
    rows.push({ key: dept, label: dept, depth: 0, hasChildren: true })
    if (!expanded.has(dept)) continue

    const f1 = drillOrder[0]
    if (!f1) continue
    const dTx = transactions.filter(t => (t.department || 'Unknown') === dept)
    const v1s = [...new Set(dTx.map(t => t[f1] || 'N/A'))].sort()

    for (const v1 of v1s) {
      const k1     = `${dept}|${v1}`
      const hasSub = !!drillOrder[1]
      rows.push({ key: k1, label: v1, depth: 1, hasChildren: hasSub })
      if (!expanded.has(k1) || !drillOrder[1]) continue

      const f2    = drillOrder[1]
      const subTx = dTx.filter(t => (t[f1] || 'N/A') === v1)
      const v2s   = [...new Set(subTx.map(t => t[f2] || 'N/A'))].sort()

      for (const v2 of v2s) {
        rows.push({ key: `${k1}|${v2}`, label: v2, depth: 2, hasChildren: false })
      }
    }
  }
  return rows
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
}) {
  const [mode,           setMode]           = useState('actuals')
  const [collapsedYears, setCollapsedYears] = useState(new Set())
  const [expanded,       setExpanded]       = useState(new Set())

  const months     = useMemo(() => getCalendarMonths(dateRange), [dateRange])
  const yearGroups = useMemo(() => groupByYear(months), [months])
  const years      = useMemo(() => Object.keys(yearGroups).map(Number).sort(), [yearGroups])

  const actualsLu = useMemo(() => buildActualsLookup(transactions, drillOrder),              [transactions, drillOrder])
  const budgetLu  = useMemo(() => buildBudgetLookup(budgetFlat, selectedScenario, months),   [budgetFlat, selectedScenario, months])
  const lu        = mode === 'actuals' ? actualsLu : budgetLu

  const rows = useMemo(() => buildRows(transactions, drillOrder, expanded), [transactions, drillOrder, expanded])

  function toggleYear(yr) {
    setCollapsedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n })
  }
  function toggleRow(key) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const get      = (key, mk)  => lu[key]?.[mk] || 0
  const yearTot  = (key, yr)  => (yearGroups[yr] || []).reduce((s, m) => s + get(key, m.key), 0)
  const rowTotal = (key)      => months.reduce((s, m) => s + get(key, m.key), 0)
  const rowLabel = (row)      => row.depth === 0 ? (deptNames[row.label] || row.label) : row.label

  const cc = 'px-2.5 py-2 text-right tabular-nums text-xs whitespace-nowrap'
  const ch = 'px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap'

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
                style={{ minWidth: 230 }}>
                Name
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
                style={{ minWidth: 230 }}/>
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
              const isExp  = expanded.has(row.key)
              const tot    = rowTotal(row.key)
              const isTop  = row.depth === 0
              const isMid  = row.depth === 1
              const rowBg  = isTop ? 'bg-gray-50/70' : ''
              const numCls = isTop ? 'font-semibold text-gray-700' : isMid ? 'font-medium text-gray-600' : 'text-gray-500'
              const namCls = isTop ? 'font-semibold text-gray-800' : isMid ? 'font-medium text-gray-700' : 'text-gray-600'

              return (
                <tr key={row.key}
                  className={`border-b border-gray-50 last:border-0 ${rowBg} hover:bg-gray-50/50 transition-colors`}>

                  {/* Sticky name cell */}
                  <td className={`sticky left-0 z-10 border-r border-gray-100 px-4 py-2 ${isTop ? 'bg-gray-50/80' : 'bg-white'}`}
                    style={{ minWidth: 230 }}>
                    <div className="flex items-center gap-1.5" style={{ paddingLeft: row.depth * 16 }}>
                      {row.hasChildren ? (
                        <button onClick={() => toggleRow(row.key)}
                          className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors">
                          {isExp ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                        </button>
                      ) : (
                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-gray-300"/>
                        </span>
                      )}
                      <span className={`text-xs ${namCls} truncate`} style={{ maxWidth: 175 }}>
                        {rowLabel(row)}
                      </span>
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
                  <td className={`${cc} border-l border-gray-200 ${isTop ? 'font-bold text-gray-800' : isMid ? 'font-semibold text-gray-700' : 'font-medium text-gray-600'}`}>
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
    </div>
  )
}
