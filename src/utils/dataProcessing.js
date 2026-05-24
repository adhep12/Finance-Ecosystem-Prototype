// ─────────────────────────────────────────────────────────────────────────────
// Core data processing utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter actuals to a date range (inclusive).
 * Uses the `period` field (YYYY-MM) when available, falls back to `date`.
 * startDate / endDate can be YYYY-MM-DD — only the YYYY-MM prefix is used.
 * Optionally restrict to a set of department codes.
 */
export function filterActualsByRange(actuals, startDate, endDate, depts = null) {
  if (!actuals) return []
  let rows = actuals
  if (startDate && endDate) {
    const startP = startDate.substring(0, 7)  // YYYY-MM
    const endP   = endDate.substring(0, 7)    // YYYY-MM
    rows = rows.filter(t => {
      const p = t.period || (t.date ? t.date.substring(0, 7) : null)
      return p && p >= startP && p <= endP
    })
  }
  if (depts && depts.length > 0) {
    rows = rows.filter(t => depts.includes(t.department))
  }
  return rows
}

/**
 * Calculate total budget per category for a scenario + date range.
 *
 * Supports two budget row shapes:
 *   • New (Supabase) shape: { period, amount, category, scenario, department }
 *     — period is YYYY-MM; rows outside the date range are excluded.
 *   • Legacy (in-memory import) shape: { monthlyAmount, category, scenario, department }
 *     — multiplied by the number of calendar months in the range.
 *
 * @param {Array}    budgetFlat
 * @param {string}   scenario
 * @param {string}   startDate  YYYY-MM-DD
 * @param {string}   endDate    YYYY-MM-DD
 * @param {string[]} depts      optional department filter
 */
export function calcBudgetByCategory(budgetFlat, scenario, startDate, endDate, depts = null) {
  if (!budgetFlat || !startDate || !endDate) return {}

  // Build set of YYYY-MM values in range + count months (for legacy shape)
  const monthSet = new Set()
  let legacyMonthCount = 0
  const cur      = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth(), 1)
  const endMonth = new Date(new Date(endDate).getFullYear(),   new Date(endDate).getMonth(),   1)
  while (cur <= endMonth) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    monthSet.add(`${y}-${m}`)
    legacyMonthCount++
    cur.setMonth(cur.getMonth() + 1)
  }

  const result = {}
  for (const entry of budgetFlat) {
    if (entry.scenario !== scenario) continue
    if (depts && depts.length > 0 && !depts.includes(entry.department)) continue
    const key = entry.category
    if (!key) continue

    if (entry.period != null) {
      // New period-based shape — only count if period falls within range
      if (!monthSet.has(entry.period)) continue
      result[key] = (result[key] || 0) + (entry.amount || 0)
    } else {
      // Legacy shape — monthly amount × number of months in range
      result[key] = (result[key] || 0) + (entry.monthlyAmount || 0) * legacyMonthCount
    }
  }
  return result
}

/**
 * Aggregate actuals by a field. Returns { [fieldValue]: totalAmount }.
 */
export function aggregateBy(actuals, field) {
  return actuals.reduce((acc, t) => {
    const key = t[field] ?? 'N/A'
    acc[key] = (acc[key] || 0) + (t.amount || 0)
    return acc
  }, {})
}

/**
 * Count transactions per field value.
 */
export function countBy(actuals, field) {
  return actuals.reduce((acc, t) => {
    const key = t[field] ?? 'N/A'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

/**
 * Aggregate actuals by month.
 * Uses `period` (YYYY-MM) field when available; falls back to t.date.substring(0,7).
 * @returns {Array} [{ month: "2025-10", actual: number }] sorted ascending
 */
export function aggregateByMonth(actuals) {
  const byMonth = actuals.reduce((acc, t) => {
    const month = t.period || (t.date ? t.date.substring(0, 7) : null)
    if (!month) return acc
    acc[month] = (acc[month] || 0) + (t.amount || 0)
    return acc
  }, {})
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, actual]) => ({ month, actual }))
}

/**
 * Build monthly chart series (actual vs budget lines).
 *
 * @param {Array}       actuals        already filtered to date range + exclusions
 * @param {Array}       budgetFlat
 * @param {string}      scenario
 * @param {string}      startDate
 * @param {string}      endDate
 * @param {string|null} categoryFilter if set, only show that category
 * @param {boolean}     cumulative
 * @param {string[]}    depts          optional dept filter for budget
 * @returns {Array} [{ month, label, monthLabel, actual, budget }]
 */
export function buildChartSeries(
  actuals, budgetFlat, scenario, startDate, endDate,
  categoryFilter, cumulative, depts = null,
) {
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Build list of months in range
  const months = []
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const cur   = new Date(start.getFullYear(), start.getMonth(), 1)
  const endM  = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= endM) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
    cur.setMonth(cur.getMonth() + 1)
  }

  // Monthly budget total (for the given category filter and depts)
  const relevantBudget = budgetFlat.filter(b => {
    if (b.scenario !== scenario) return false
    if (categoryFilter && b.category !== categoryFilter) return false
    if (depts && depts.length > 0 && !depts.includes(b.department)) return false
    return true
  })

  // Build per-month budget map (new shape) and legacy flat total (old shape)
  const budgetByMonth  = {}
  let legacyMonthlyTotal = 0
  for (const b of relevantBudget) {
    if (b.period != null) {
      budgetByMonth[b.period] = (budgetByMonth[b.period] || 0) + (b.amount || 0)
    } else {
      legacyMonthlyTotal += (b.monthlyAmount || 0)
    }
  }
  const hasPeriodBudget = Object.keys(budgetByMonth).length > 0

  // Aggregate actuals by month (with optional category filter)
  const filteredActuals = categoryFilter
    ? actuals.filter(t => t.category === categoryFilter)
    : actuals
  const byMonth = aggregateByMonth(filteredActuals)
  const byMonthMap = Object.fromEntries(byMonth.map(d => [d.month, d.actual]))

  let cumActual = 0, cumBudget = 0
  return months.map(m => {
    const actual = byMonthMap[m] || 0
    const budget = hasPeriodBudget ? (budgetByMonth[m] || 0) : legacyMonthlyTotal
    cumActual += actual
    cumBudget += budget
    const [y, mo] = m.split('-')
    const label = MONTH_SHORT[parseInt(mo) - 1]
    return {
      month: m,
      label,
      monthLabel: label + ' ' + y,
      actual: cumulative ? cumActual : actual,
      budget: cumulative ? cumBudget : budget,
    }
  })
}

/**
 * Get top N categories sorted by spend / over / under.
 *
 * @param {Object}   actualsByCategory  { category: amount }
 * @param {Object}   budgetByCategory   { category: amount }
 * @param {string}   sortMode           "spend" | "over" | "under"
 * @param {number}   n
 * @param {string[]} excluded           category names to skip
 */
export function getTopCategories(actualsByCategory, budgetByCategory, sortMode, n = 3, excluded = []) {
  const categories = [
    ...new Set([...Object.keys(actualsByCategory), ...Object.keys(budgetByCategory)])
  ].filter(c => !excluded.includes(c))

  return categories
    .map(cat => ({
      category: cat,
      actual:   actualsByCategory[cat]  || 0,
      budget:   budgetByCategory[cat]   || 0,
      delta:    (actualsByCategory[cat] || 0) - (budgetByCategory[cat] || 0),
    }))
    .filter(d => {
      if (sortMode === 'over')  return d.delta > 0
      if (sortMode === 'under') return d.delta < 0
      return true
    })
    .sort((a, b) => {
      if (sortMode === 'spend') return b.actual - a.actual
      if (sortMode === 'over')  return b.delta  - a.delta
      if (sortMode === 'under') return a.delta  - b.delta
      return b.actual - a.actual
    })
    .slice(0, n)
}

/**
 * Get top N vendors by spend across filtered actuals.
 *
 * @param {Array}       actuals
 * @param {string|null} categoryFilter  restrict to this category
 * @param {string[]}    excluded        excluded categories
 * @param {number}      n
 */
export function getTopVendors(actuals, categoryFilter, excluded = [], n = 3) {
  const filtered = actuals.filter(t => {
    if (excluded.includes(t.category)) return false
    if (categoryFilter && t.category !== categoryFilter) return false
    return true
  })

  const total    = filtered.reduce((s, t) => s + t.amount, 0)
  const byVendor = aggregateBy(filtered, 'vendor')
  const txCount  = countBy(filtered, 'vendor')

  return Object.entries(byVendor)
    .map(([vendor, amount]) => ({
      vendor,
      amount,
      pct:          total > 0 ? (amount / total) * 100 : 0,
      transactions: txCount[vendor] || 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((v, i) => ({ ...v, rank: i + 1 }))
}

/**
 * Calculate the high-level Briefing summary stats.
 *
 * @param {Array}    actuals
 * @param {Array}    budgetFlat
 * @param {string}   scenario
 * @param {string}   startDate
 * @param {string}   endDate
 * @param {string[]} excluded    briefing exclusions (category names)
 * @param {string[]} depts       optional dept filter (null = all)
 */
export function calcBriefingSummary(actuals, budgetFlat, scenario, startDate, endDate, excluded, depts = null) {
  const filtered = filterActualsByRange(actuals, startDate, endDate, depts)
    .filter(t => !excluded.includes(t.category))

  const totalActual = filtered.reduce((s, t) => s + t.amount, 0)
  const budgetByCat = calcBudgetByCategory(budgetFlat, scenario, startDate, endDate, depts)
  const totalBudget = Object.entries(budgetByCat)
    .filter(([cat]) => !excluded.includes(cat))
    .reduce((s, [, v]) => s + v, 0)

  const overUnder    = totalActual - totalBudget
  const overUnderPct = totalBudget > 0 ? (overUnder / totalBudget) * 100 : null

  return {
    totalActual,
    totalBudget,
    overUnder,
    overUnderPct,
    transactions: filtered.length,
  }
}

/**
 * Group actuals by a field. Returns sorted array of group objects.
 *
 * @returns {Array} [{ key, total, items }] sorted by total descending
 */
export function groupByField(actuals, field) {
  const groups = {}
  for (const t of actuals) {
    const key = t[field] ?? 'N/A'
    if (!groups[key]) groups[key] = { key, total: 0, items: [] }
    groups[key].total += t.amount || 0
    groups[key].items.push(t)
  }
  return Object.values(groups).sort((a, b) => b.total - a.total)
}

/**
 * Build the flat list of visible rows for the Breakdown table.
 *
 * Each visible row: {
 *   type: 'group' | 'transaction'
 *   field:      string   (e.g. 'category')
 *   value:      string   (e.g. 'Computers')
 *   actual:     number
 *   budget:     number   (0 if unknown)
 *   depth:      number
 *   isExpanded: boolean
 *   isDimmed:   boolean  (something else is open at this level)
 *   item:       object   (only for type==='transaction')
 * }
 *
 * Budget calculation:
 *   - depth 0, field='category': use budgetByCategory[value]
 *   - deeper levels: proportional allocation (parentBudget * myActual / parentActual)
 *
 * @param {Array}       actuals      already filtered (dept, search, hidden)
 * @param {string[]}    drillOrder   e.g. ['category','account','grant','vendor']
 * @param {string[]}    openPath     e.g. ['Computers','Software'] — one value per depth
 * @param {Object}      budgetByCat  { category: totalBudgetForRange }
 * @param {Object|null} sortConfig   { col: 'actual'|'budget'|'delta'|'pct', dir: 'asc'|'desc' }
 */
export function buildVisibleRows(actuals, drillOrder, openPath, budgetByCat, sortConfig = null) {
  const result = []

  function getBudget(g, field, parentBudget, parentActual) {
    if (field === 'category') return budgetByCat[g.key] || 0
    if (parentActual > 0)     return parentBudget * (g.total / parentActual)
    return 0
  }

  function sortGroups(groups, field, parentBudget, parentActual) {
    if (!sortConfig || !sortConfig.col) return groups
    return [...groups].sort((a, b) => {
      const ab = getBudget(a, field, parentBudget, parentActual)
      const bb = getBudget(b, field, parentBudget, parentActual)
      let av, bv
      switch (sortConfig.col) {
        case 'actual':  av = a.total;           bv = b.total;           break
        case 'budget':  av = ab;                bv = bb;                break
        case 'delta':   av = a.total - ab;      bv = b.total - bb;      break
        case 'pct':
          av = ab > 0 ? (a.total - ab) / ab : 0
          bv = bb > 0 ? (b.total - bb) / bb : 0
          break
        default:        av = a.total;           bv = b.total
      }
      return sortConfig.dir === 'asc' ? av - bv : bv - av
    })
  }

  function process(items, depth, parentBudget, parentActual) {
    if (depth >= drillOrder.length) {
      // Leaf: individual transactions
      for (const t of items) {
        result.push({ type: 'transaction', depth, item: t, field: null, value: null, actual: t.amount, budget: 0, isExpanded: false, isDimmed: false })
      }
      return
    }

    const field      = drillOrder[depth]
    let   groups     = groupByField(items, field)
    const openAtThis = openPath[depth]
    const hasOpen    = depth < openPath.length

    groups = sortGroups(groups, field, parentBudget, parentActual)

    for (const g of groups) {
      const isExpanded = g.key === openAtThis
      const isDimmed   = hasOpen && g.key !== openAtThis
      const budget     = getBudget(g, field, parentBudget, parentActual)

      result.push({ type: 'group', field, value: g.key, actual: g.total, budget, depth, isExpanded, isDimmed, items: g.items })

      if (isExpanded) {
        process(g.items, depth + 1, budget, g.total)
      }
    }
  }

  process(actuals, 0, 0, actuals.reduce((s, t) => s + t.amount, 0))
  return result
}

/**
 * Get all unique values for a field across actuals.
 */
export function getUniqueValues(actuals, field) {
  return [...new Set(actuals.map(t => t[field]).filter(Boolean))].sort()
}

/**
 * Get all unique scenarios from budget flat data.
 */
export function getScenarios(budgetFlat) {
  return [...new Set(budgetFlat.map(b => b.scenario))].sort()
}
