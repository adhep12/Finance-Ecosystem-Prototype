// ─────────────────────────────────────────────────────────────────────────────
// Core data processing utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter actuals to a date range (inclusive).
 * Optionally restrict to a set of department codes.
 */
export function filterActualsByRange(actuals, startDate, endDate, depts = null) {
  if (!actuals) return []
  let rows = actuals
  if (startDate && endDate) {
    rows = rows.filter(t => t.date >= startDate && t.date <= endDate)
  }
  if (depts && depts.length > 0) {
    rows = rows.filter(t => depts.includes(t.department))
  }
  return rows
}

/**
 * Calculate total budget per category for a scenario + date range.
 * Counts the number of calendar months overlapping the range and multiplies
 * monthly amounts. Optionally restrict to specific department codes.
 *
 * @param {Array}    budgetFlat  [{ department, category, scenario, monthlyAmount }]
 * @param {string}   scenario
 * @param {string}   startDate  YYYY-MM-DD
 * @param {string}   endDate    YYYY-MM-DD
 * @param {string[]} depts      optional department filter
 */
export function calcBudgetByCategory(budgetFlat, scenario, startDate, endDate, depts = null) {
  if (!budgetFlat || !startDate || !endDate) return {}

  // Count calendar months overlapping the range
  const start = new Date(startDate)
  const end   = new Date(endDate)
  let months = 0
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= endMonth) { months++; cur.setMonth(cur.getMonth() + 1) }

  const result = {}
  for (const entry of budgetFlat) {
    if (entry.scenario !== scenario) continue
    if (depts && depts.length > 0 && !depts.includes(entry.department)) continue
    const key = entry.category
    result[key] = (result[key] || 0) + entry.monthlyAmount * months
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
 * @returns {Array} [{ month: "2025-10", actual: number }] sorted ascending
 */
export function aggregateByMonth(actuals) {
  const byMonth = actuals.reduce((acc, t) => {
    const month = t.date.substring(0, 7)
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
  const monthlyBudgetTotal = relevantBudget.reduce((s, b) => s + b.monthlyAmount, 0)

  // Aggregate actuals by month (with optional category filter)
  const filteredActuals = categoryFilter
    ? actuals.filter(t => t.category === categoryFilter)
    : actuals
  const byMonth = aggregateByMonth(filteredActuals)
  const byMonthMap = Object.fromEntries(byMonth.map(d => [d.month, d.actual]))

  let cumActual = 0, cumBudget = 0
  return months.map(m => {
    const actual = byMonthMap[m] || 0
    const budget = monthlyBudgetTotal
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
 * @param {Array}    actuals         already filtered (dept, search, hidden)
 * @param {string[]} drillOrder      e.g. ['category','account','grant','vendor']
 * @param {string[]} openPath        e.g. ['Computers','Software'] — one value per depth
 * @param {Object}   budgetByCat     { category: totalBudgetForRange }
 */
export function buildVisibleRows(actuals, drillOrder, openPath, budgetByCat) {
  const result = []

  function process(items, depth, parentBudget, parentActual) {
    if (depth >= drillOrder.length) {
      // Leaf: individual transactions
      for (const t of items) {
        result.push({ type: 'transaction', depth, item: t, field: null, value: null, actual: t.amount, budget: 0, isExpanded: false, isDimmed: false })
      }
      return
    }

    const field      = drillOrder[depth]
    const groups     = groupByField(items, field)
    const openAtThis = openPath[depth]
    const hasOpen    = depth < openPath.length

    for (const g of groups) {
      const isExpanded = g.key === openAtThis
      const isDimmed   = hasOpen && g.key !== openAtThis

      // Budget at this level
      let budget = 0
      if (field === 'category') {
        budget = budgetByCat[g.key] || 0
      } else if (parentActual > 0) {
        // Proportional allocation from parent
        budget = parentBudget * (g.total / parentActual)
      }

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
