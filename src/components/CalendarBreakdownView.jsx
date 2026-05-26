import React, { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Ban } from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────────────────────────────────────

// Pulls from CSS vars so they update automatically when org colors change
const INCOME_COLOR    = 'var(--ill-1)'   // accent — org primary CTA / current-year
const EXPENSE_PALETTE = [
  'var(--ill-4)',    // Rust
  'var(--ill-3)',    // org primary (Ochre by default)
  'var(--ill-9)',    // Plum
  'var(--ill-6)',    // Teal
  'var(--ill-7)',    // Moss
  'var(--ill-8)',    // Olive
  'var(--ill-10)',   // Wine
  'var(--ill-2)',    // Sky muted
  'var(--ill-5)',    // Mustard
  'var(--neutral-40)', // fallback neutral for 10th category
]

// ─────────────────────────────────────────────────────────────────────────────
// Existing table-view helpers (unchanged)
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

function getAllExpandableKeys(transactions, drillOrder) {
  if (drillOrder.length < 2) return new Set()
  const keys = new Set()
  function process(items, depth, keyPrefix) {
    if (depth >= drillOrder.length - 1) return
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

function getTransactionsForKey(transactions, key, drillOrder) {
  const parts = key.split('|')
  return transactions.filter(tx =>
    parts.every((part, i) => (tx[drillOrder[i]] || 'N/A') === part)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart-view helpers (new for Fix 10)
// ─────────────────────────────────────────────────────────────────────────────

function getWeekBoundaries(startDate, endDate) {
  if (!startDate || !endDate) return []
  const boundaries = []
  const end = new Date(endDate + 'T00:00:00')
  const cur = new Date(startDate + 'T00:00:00')
  // Advance to next Monday
  const dow = cur.getDay()
  cur.setDate(cur.getDate() + (dow === 0 ? 1 : 8 - dow))
  while (cur <= end) {
    boundaries.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 7)
  }
  return boundaries
}

function buildChartData(transactions, dateRange) {
  const empty = { categories: [], catColors: {}, data: [], txMap: {}, weekBounds: [] }
  if (!transactions.length || !dateRange?.startDate) return empty

  // Collect category → record_type
  const catMeta = {}
  for (const tx of transactions) {
    const cat = tx.category || 'Uncategorized'
    if (!catMeta[cat]) catMeta[cat] = tx.record_type
  }

  // Sort: income first, then expenses, all alphabetical within group
  const categories = Object.keys(catMeta).sort((a, b) => {
    const ai = catMeta[a] === 'income', bi = catMeta[b] === 'income'
    if (ai && !bi) return -1
    if (!ai && bi) return 1
    return a.localeCompare(b)
  })

  // Assign colors: income = teal, each expense gets a unique palette color
  let expIdx = 0
  const catColors = {}
  for (const cat of categories) {
    catColors[cat] = catMeta[cat] === 'income'
      ? INCOME_COLOR
      : EXPENSE_PALETTE[expIdx++ % EXPENSE_PALETTE.length]
  }

  // txMap: { "date|cat" → [tx, ...] }
  const txMap = {}
  for (const tx of transactions) {
    const date = tx.date?.slice(0, 10); if (!date) continue
    const cat  = tx.category || 'Uncategorized'
    const key  = `${date}|${cat}`
    if (!txMap[key]) txMap[key] = []
    txMap[key].push(tx)
  }

  // Which dates have transactions per category (for dot rendering)
  const catTxDates = {}
  for (const cat of categories) {
    catTxDates[cat] = new Set(
      transactions
        .filter(tx => (tx.category || 'Uncategorized') === cat && tx.date)
        .map(tx => tx.date.slice(0, 10))
    )
  }

  // Unique transaction dates
  const txDates = [...new Set(transactions.map(tx => tx.date?.slice(0, 10)).filter(Boolean))]

  // Week boundaries so reference lines land on real data points
  const weekBounds = getWeekBoundaries(dateRange.startDate, dateRange.endDate)

  // Merge all dates (range bounds + tx dates + week bounds)
  const allDates = [...new Set([
    dateRange.startDate,
    ...txDates,
    ...weekBounds,
    dateRange.endDate,
  ])].filter(Boolean).sort()

  // Build cumulative chart data — carry-forward for each category
  const cumulative = {}
  for (const cat of categories) cumulative[cat] = 0

  const data = allDates.map(date => {
    // Add any transactions on this date
    for (const cat of categories) {
      for (const tx of (txMap[`${date}|${cat}`] || [])) {
        cumulative[cat] += Math.abs(tx.amount || 0)
      }
    }
    const entry = { date }
    for (const cat of categories) {
      entry[cat]             = cumulative[cat]         // carry-forward line value
      entry[`_t_${cat}`]     = catTxDates[cat].has(date) // flag: actual tx on this date
    }
    return entry
  })

  return { categories, catColors, data, txMap, weekBounds }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip for chart view
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, txMap, catColors }) {
  if (!active || !payload?.length) return null

  // Only show categories that have actual transactions on this date
  const txEntries = payload.filter(p => txMap[`${label}|${p.dataKey}`]?.length > 0)
  if (!txEntries.length) return null

  const fmtDate = (d) => {
    try { return new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return d }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs max-w-xs pointer-events-none">
      <p className="font-semibold text-gray-600 mb-2">{fmtDate(label)}</p>
      {txEntries.map(p => {
        const cat  = p.dataKey
        const txs  = txMap[`${label}|${cat}`] || []
        const col  = catColors[cat]
        return (
          <div key={cat} className="mb-2 last:mb-0">
            <div className="flex items-center gap-1.5 mb-1">
              <svg width="14" height="8" className="flex-shrink-0">
                <line x1="0" y1="4" x2="14" y2="4" stroke={col} strokeWidth="2"/>
                <circle cx="7" cy="4" r="3" fill={col} stroke="white" strokeWidth="1"/>
              </svg>
              <span className="font-semibold text-gray-700 truncate flex-1">{cat}</span>
              <span className="ml-2 font-bold tabular-nums flex-shrink-0" style={{ color: col }}>
                {formatCurrency(p.value, { compact: true })}
              </span>
            </div>
            {txs.map((tx, i) => (
              <div key={i}
                className="pl-3 py-0.5 mb-0.5 border-l-2 text-[10px] leading-relaxed text-gray-500"
                style={{ borderColor: col + '70' }}>
                <span className="font-medium text-gray-700">{tx.vendor || '—'}</span>
                <span className="mx-1 text-gray-300">·</span>
                {tx.date}
                <span className="mx-1 text-gray-300">·</span>
                <span className="font-medium">{formatCurrency(Math.abs(tx.amount || 0), { compact: false })}</span>
                {tx.category && (
                  <><span className="mx-1 text-gray-300">·</span>{tx.category}</>
                )}
                {tx.description && (
                  <><span className="mx-1 text-gray-300">·</span>{tx.description}</>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
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
  // ── View mode: chart (default) vs table ──
  const [chartMode,      setChartMode]      = useState('chart')

  // ── Chart state ──
  const [hoveredCat,     setHoveredCat]     = useState(null)

  // ── Table state ──
  const [mode,           setMode]           = useState('actuals')
  const [collapsedYears, setCollapsedYears] = useState(new Set())
  const [expanded,       setExpanded]       = useState(new Set())
  const [openLeaves,     setOpenLeaves]     = useState(new Set())

  const today = new Date().toISOString().slice(0, 10)

  // ── Shared data ──
  const months     = useMemo(() => getCalendarMonths(dateRange), [dateRange])
  const yearGroups = useMemo(() => groupByYear(months), [months])
  const years      = useMemo(() => Object.keys(yearGroups).map(Number).sort(), [yearGroups])

  // ── Table data ──
  const actualsLu = useMemo(
    () => buildActualsLookup(transactions, drillOrder), [transactions, drillOrder])
  const budgetLu  = useMemo(
    () => buildBudgetLookup(budgetFlat, selectedScenario, months, drillOrder, activeDepts),
    [budgetFlat, selectedScenario, months, drillOrder, activeDepts])
  const lu   = mode === 'actuals' ? actualsLu : budgetLu
  const rows = useMemo(() => buildRows(transactions, drillOrder, expanded), [transactions, drillOrder, expanded])

  // ── Chart data ──
  const { categories, catColors, data: chartData, txMap, weekBounds } = useMemo(
    () => buildChartData(transactions, dateRange), [transactions, dateRange])

  // ── Table handlers ──
  function toggleYear(yr) {
    setCollapsedYears(prev => { const n = new Set(prev); n.has(yr) ? n.delete(yr) : n.add(yr); return n })
  }
  function handleRowClick(row) {
    if (!row.hasChildren) {
      setOpenLeaves(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n })
      return
    }
    setExpanded(prev => { const n = new Set(prev); n.has(row.key) ? n.delete(row.key) : n.add(row.key); return n })
  }
  function expandAll()   { setExpanded(getAllExpandableKeys(transactions, drillOrder)) }
  function collapseAll() { setExpanded(new Set()); setOpenLeaves(new Set()) }

  const get           = (key, mk) => lu[key]?.[mk] || 0
  const yearTot       = (key, yr) => (yearGroups[yr] || []).reduce((s, m) => s + get(key, m.key), 0)
  const rowTotal      = (key)     => months.reduce((s, m) => s + get(key, m.key), 0)
  const rowLabel      = (row)     => row?.field === 'department' ? (deptNames[row.label] || row.label) : (row?.label ?? '')
  // Budget helpers — always read from budgetLu regardless of mode
  const getBgt        = (key, mk) => budgetLu[key]?.[mk] || 0
  const budgetRowTot  = (key)     => months.reduce((s, m) => s + getBgt(key, m.key), 0)
  const hasBudgetData = Object.keys(budgetLu).length > 0

  const cc  = 'px-2.5 py-2 text-right tabular-nums text-xs whitespace-nowrap'
  const cct = 'px-2.5 py-1.5 text-right tabular-nums text-xs whitespace-nowrap'
  const ch  = 'px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 whitespace-nowrap'

  const topFieldLabel = drillOrder[0]
    ? drillOrder[0].charAt(0).toUpperCase() + drillOrder[0].slice(1)
    : 'Name'

  const fmtXAxis = (d) => {
    try { return new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }) }
    catch { return d }
  }

  if (months.length === 0 && chartMode === 'table') {
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

        {/* Table-only: expand/collapse + actuals/budget */}
        {chartMode === 'table' && (
          <>
            <div className="flex items-center gap-0.5">
              <button onClick={expandAll}
                className="text-[10px] text-gray-500 hover:text-gray-800 font-medium hover:bg-gray-200/60 px-2 py-0.5 rounded transition-colors">
                Expand all
              </button>
              <button onClick={collapseAll}
                className="text-[10px] text-gray-500 hover:text-gray-800 font-medium hover:bg-gray-200/60 px-2 py-0.5 rounded transition-colors">
                Collapse all
              </button>
            </div>
            <div className="w-px h-4 bg-gray-200"/>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-1 py-0.5">
              {['actuals','budget'].map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-0.5 rounded-full text-xs font-medium capitalize transition-all ${
                    mode === m ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-gray-200"/>
          </>
        )}

        {/* Chart / Table toggle */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-1 py-0.5">
          {[['chart','Chart'],['table','Table']].map(([id, lbl]) => (
            <button key={id} onClick={() => setChartMode(id)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium capitalize transition-all ${
                chartMode === id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CHART VIEW (default)
          ══════════════════════════════════════════════════════════ */}
      {chartMode === 'chart' && (
        <div className="p-4 pt-3">

          {/* Legend */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4">
              {categories.map(cat => (
                <button
                  key={cat}
                  onMouseEnter={() => setHoveredCat(cat)}
                  onMouseLeave={() => setHoveredCat(null)}
                  style={{ opacity: hoveredCat && hoveredCat !== cat ? 0.3 : 1 }}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-opacity"
                >
                  {/* Mini line + dot swatch */}
                  <svg width="20" height="12" aria-hidden="true">
                    <line x1="0" y1="6" x2="20" y2="6"
                      stroke={catColors[cat]}
                      strokeWidth={hoveredCat === cat ? 3 : 2}/>
                    <circle cx="10" cy="6" r="3"
                      fill={catColors[cat]} stroke="white" strokeWidth="1.5"/>
                  </svg>
                  <span className="truncate max-w-[140px]">{cat}</span>
                </button>
              ))}
            </div>
          )}

          {/* Chart or empty state */}
          {chartData.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              No transactions in the selected date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 8, right: 20, bottom: 20, left: 64 }}>

                {/* Horizontal grid only */}
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>

                {/* Week boundary vertical lines — subtle */}
                {weekBounds.map(wb => (
                  <ReferenceLine key={`wb-${wb}`} x={wb}
                    stroke="#E9EBF0" strokeWidth={1}/>
                ))}

                {/* Today — dashed gray */}
                <ReferenceLine x={today}
                  stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 3"
                  label={{ value: 'Today', position: 'insideTopLeft', fontSize: 9, fill: '#9CA3AF' }}/>

                <XAxis
                  dataKey="date"
                  tickFormatter={fmtXAxis}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={v => formatCurrency(v, { compact: true })}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  axisLine={false} tickLine={false}
                  width={64}
                />

                <Tooltip
                  content={<ChartTooltip txMap={txMap} catColors={catColors}/>}
                />

                {categories.map(cat => (
                  <Line
                    key={cat}
                    dataKey={cat}
                    stroke={catColors[cat]}
                    strokeWidth={hoveredCat === cat ? 3 : 2}
                    strokeOpacity={hoveredCat && hoveredCat !== cat ? 0.3 : 1}
                    dot={(props) => {
                      const { cx, cy, payload } = props
                      // Only render dot at dates with actual transactions for this category
                      if (!payload[`_t_${cat}`]) return <g/>
                      const isHov = hoveredCat === cat
                      const dimmed = hoveredCat && !isHov
                      return (
                        <circle
                          cx={cx} cy={cy}
                          r={isHov ? 5 : 4}
                          fill={catColors[cat]}
                          stroke="white"
                          strokeWidth={1.5}
                          opacity={dimmed ? 0.3 : 1}
                        />
                      )
                    }}
                    activeDot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TABLE VIEW (existing, unchanged)
          ══════════════════════════════════════════════════════════ */}
      {chartMode === 'table' && (
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
                {hasBudgetData && <>
                  <th className={`${ch} text-right border-l border-b border-gray-200 bg-gray-50`}>Budget</th>
                  <th className={`${ch} text-right border-l border-b border-gray-200 bg-gray-50`}>Variance</th>
                </>}
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
                {hasBudgetData && <>
                  <th className={`${ch} border-l border-b border-gray-200`}/>
                  <th className={`${ch} border-l border-b border-gray-200`}/>
                </>}
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

                const mainRow = (
                  <tr key={row.key}
                    className={`border-b border-gray-50 transition-colors ${
                      isLeafOpen
                        ? 'bg-teal-50/40'
                        : isTop ? 'bg-gray-50/70 hover:bg-gray-100/40' : 'hover:bg-gray-50/50'
                    }`}>
                    <td
                      className={`sticky left-0 z-10 border-r border-gray-100 px-4 py-2 ${
                        isLeafOpen ? 'bg-teal-50/60' : isTop ? 'bg-gray-50/80' : 'bg-white'
                      }`}
                      style={{ minWidth: 240 }}>
                      <div className="flex items-center gap-1.5 group" style={{ paddingLeft: row.depth * 16 }}>
                        <button
                          onClick={() => handleRowClick(row)}
                          className={`w-4 h-4 flex-shrink-0 flex items-center justify-center transition-colors ${
                            !row.hasChildren
                              ? isLeafOpen ? 'text-teal-600' : 'text-gray-300 hover:text-teal-500'
                              : 'text-gray-400 hover:text-gray-700'
                          }`}>
                          {!row.hasChildren
                            ? (isLeafOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>)
                            : (isExp ? <ChevronDown size={11}/> : <ChevronRight size={11}/>)
                          }
                        </button>
                        <span
                          className={`text-xs ${namCls} flex-1 min-w-0 truncate ${!row.hasChildren ? 'cursor-pointer hover:text-teal-700' : ''}`}
                          onClick={() => !row.hasChildren ? handleRowClick(row) : undefined}
                          title={rowLabel(row)}>
                          {rowLabel(row)}
                        </span>
                        {onHide && (
                          <button
                            className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                            onClick={e => { e.stopPropagation(); onHide(row.field, row.label) }}
                            title={`Hide ${row.label}`}>
                            <Ban size={10}/>
                          </button>
                        )}
                      </div>
                    </td>

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
                                {v ? formatCurrency(v, { compact: true }) : <span className="text-gray-200">—</span>}
                              </td>
                            )
                          })
                    )}

                    <td className={`${cc} border-l border-gray-200 ${
                      isTop ? 'font-bold text-gray-800' : isMid ? 'font-semibold text-gray-700' : 'font-medium text-gray-600'
                    }`}>
                      {tot ? formatCurrency(tot, { compact: true }) : <span className="text-gray-300">—</span>}
                    </td>
                    {hasBudgetData && (() => {
                      const bgt = budgetRowTot(row.key)
                      const variance = tot - bgt
                      const varColor = variance > 0 ? '#C0392B' : variance < 0 ? '#3D9970' : '#6B7384'
                      const fwCls = isTop ? 'font-bold' : isMid ? 'font-semibold' : 'font-medium'
                      return <>
                        <td className={`${cc} border-l border-gray-200 ${fwCls} text-gray-600`}>
                          {bgt ? formatCurrency(bgt, { compact: true }) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`${cc} border-l border-gray-200 ${fwCls}`} style={{color: bgt ? varColor : '#D1D5DB'}}>
                          {bgt
                            ? `${variance >= 0 ? '+' : ''}${formatCurrency(variance, { compact: true })}`
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </>
                    })()}
                  </tr>
                )

                if (!isLeafOpen) return [mainRow]

                const txs = getTransactionsForKey(transactions, row.key, drillOrder)
                  .sort((a, b) => b.date.localeCompare(a.date))

                const txRows = txs.map((t, ti) => {
                  const txMo = t.date?.slice(0, 7)
                  const txYr = t.date?.slice(0, 4)
                  return (
                    <tr key={`${row.key}-tx-${ti}`}
                      className="border-b border-gray-50 last:border-0 bg-white hover:bg-teal-50/20 transition-colors">
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
                      <td className={`${cct} border-l border-gray-200 text-gray-600`}>
                        {formatCurrency(t.amount, { compact: true })}
                      </td>
                      {hasBudgetData && <>
                        <td className={`${cct} border-l border-gray-200`}/>
                        <td className={`${cct} border-l border-gray-200`}/>
                      </>}
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
      )}
    </div>
  )
}
