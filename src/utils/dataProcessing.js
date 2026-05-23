// ─────────────────────────────────────────────────────────────────────────────
// Core data processing utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter actuals to a date range (inclusive)
 * @param {Array} actuals
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 */
export function filterActualsByRange(actuals, startDate, endDate) {
  if (!actuals || !startDate || !endDate) return actuals || []
  return actuals.filter(t => t.date >= startDate && t.date <= endDate)
}

/**
 * Given a flat budget list and a date range, calculate the total budget
 * per category by counting how many full (or partial) months fall in the range.
 *
 * We use a simple month-counting approach: for each month that overlaps the range
 * we count 1 full month of budget.
 *
 * @param {Array} budgetFlat - [{ department, category, scenario, monthlyAmount }]
 * @param {string} scenario
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 */
export function calcBudgetByCategory(budgetFlat, scenario, startDate, endDate) {
  if (!budgetFlat || !startDate || !endDate) return {}

  // Count the number of calendar months that fall (even partially) within the range
  const start = new Date(startDate)
  const end   = new Date(endDate)

  let months = 0
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= endMonth) {
    months++
    cur.setMonth(cur.getMonth() + 1)
  }

  const result = {}
  for (const entry of budgetFlat) {
    if (entry.scenario !== scenario) continue
    const key = entry.category
    result[key] = (result[key] || 0) + entry.monthlyAmount * months
  }
  return result
}

/**
 * Aggregate actuals by a field (e.g. 'category', 'vendor', 'department')
 * Returns an object { [fieldValue]: totalAmount }
 */
export function aggregateBy(actuals, field) {
  return actuals.reduce((acc, t) => {
    const key = t[field] || 'Unknown'
    acc[key] = (acc[key] || 0) + (t.amount || 0)
    return acc
  }, {})
}

/**
 * Count transactions per vendor (or any field)
 */
export function countBy(actuals, field) {
  return actuals.reduce((acc, t) => {
    const key = t[field] || 'Unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

/**
 * Aggregate actuals by month (returns array sorted by month)
 * @returns {Array} [{ month: "2025-10", actual: number }]
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
 * Aggregate actuals by month AND category
 * @returns {Object} { "2025-10": { Computers: 500, Software: 200 } }
 */
export function aggregateByMonthAndCategory(actuals) {
  return actuals.reduce((acc, t) => {
    const month = t.date.substring(0, 7)
    if (!acc[month]) acc[month] = {}
    acc[month][t.category] = (acc[month][t.category] || 0) + (t.amount || 0)
    return acc
  }, {})
}

/**
 * Build monthly series for chart with actual and budget lines
 * @param {Array}  actuals
 * @param {Object} budgetByCategory - { category: totalBudget }
 * @param {string} startDate
 * @param {string} endDate
 * @param {string|null} categoryFilter - if set, only show that category
 * @param {boolean} cumulative
 * @returns {Array} [{ label: "Oct", actual, budget, cumActual, cumBudget }]
 */
export function buildChartSeries(actuals, budgetFlat, scenario, startDate, endDate, categoryFilter, cumulative) {
  // 1. Build list of months in range
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

  // 2. Get monthly budget amount for category (or total)
  const relevantBudget = budgetFlat.filter(b => {
    if (b.scenario !== scenario) return false
    if (categoryFilter && b.category !== categoryFilter) return false
    return true
  })
  const monthlyBudgetTotal = relevantBudget.reduce((s, b) => s + b.monthlyAmount, 0)

  // 3. Aggregate actuals by month
  const filteredActuals = categoryFilter
    ? actuals.filter(t => t.category === categoryFilter)
    : actuals
  const byMonth = aggregateByMonth(filteredActuals)
  const byMonthMap = Object.fromEntries(byMonth.map(d => [d.month, d.actual]))

  // 4. Build series
  let cumActual = 0, cumBudget = 0
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
 * Get top N categories by spend / over / under
 * @param {Object} actualsByCategory  { category: amount }
 * @param {Object} budgetByCategory   { category: amount }
 * @param {string} sortMode           "spend" | "over" | "under"
 * @param {number} n
 * @param {Array}  excluded           category names to exclude
 */
export function getTopCategories(actualsByCategory, budgetByCategory, sortMode, n = 3, excluded = []) {
  const categories = Object.keys({ ...actualsByCategory, ...budgetByCategory })
    .filter(c => !excluded.includes(c))

  return categories
    .map(cat => {
      const actual  = actualsByCategory[cat]  || 0
      const budget  = budgetByCategory[cat]   || 0
      const delta   = actual - budget
      return { category: cat, actual, budget, delta }
    })
    .filter(d => {
      if (sortMode === 'over')  return d.delta > 0
      if (sortMode === 'under') return d.delta < 0
      return true
    })
    .sort((a, b) => {
      if (sortMode === 'spend') return b.actual  - a.actual
      if (sortMode === 'over')  return b.delta   - a.delta
      if (sortMode === 'under') return a.delta   - b.delta  // most negative first
      return b.actual - a.actual
    })
    .slice(0, n)
}

/**
 * Get top N vendors by spend
 * @param {Array}       actuals
 * @param {string|null} categoryFilter  - restrict to this category
 * @param {Array}       excluded        - excluded categories
 * @param {number}      n
 */
export function getTopVendors(actuals, categoryFilter, excluded = [], n = 3) {
  const filtered = actuals.filter(t => {
    if (excluded.includes(t.category)) return false
    if (categoryFilter && t.category !== categoryFilter) return false
    return true
  })

  const total = filtered.reduce((s, t) => s + t.amount, 0)

  const byVendor = aggregateBy(filtered, 'vendor')
  const txCount  = countBy(filtered, 'vendor')

  return Object.entries(byVendor)
    .map(([vendor, amount]) => ({
      vendor,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
      transactions: txCount[vendor] || 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((v, i) => ({ ...v, rank: i + 1 }))
}

/**
 * Calculate summary stats for the briefing hero
 */
export function calcBriefingSummary(actuals, budgetFlat, scenario, startDate, endDate, excluded) {
  const filtered     = filterActualsByRange(actuals, startDate, endDate)
    .filter(t => !excluded.includes(t.category))

  const totalActual  = filtered.reduce((s, t) => s + t.amount, 0)
  const budgetByCat  = calcBudgetByCategory(budgetFlat, scenario, startDate, endDate)
  const totalBudget  = Object.entries(budgetByCat)
    .filter(([cat]) => !excluded.includes(cat))
    .reduce((s, [, v]) => s + v, 0)

  const overUnder    = totalActual - totalBudget
  const overUnderPct = totalBudget > 0 ? (overUnder / totalBudget) * 100 : null
  const transactions = filtered.length

  return { totalActual, totalBudget, overUnder, overUnderPct, transactions }
}

/**
 * Get all unique values for a field across actuals
 */
export function getUniqueValues(actuals, field) {
  return [...new Set(actuals.map(t => t[field]).filter(Boolean))].sort()
}

/**
 * Get all unique scenarios from budget flat data
 */
export function getScenarios(budgetFlat) {
  return [...new Set(budgetFlat.map(b => b.scenario))].sort()
}
