// ─────────────────────────────────────────────────────────────────────────────
// Currency formatting
// ─────────────────────────────────────────────────────────────────────────────

export function formatCurrency(amount, { compact = true, showSign = false } = {}) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : (showSign && amount > 0 ? '+' : '')

  if (!compact) {
    return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1)
    return sign + '$' + val + 'M'
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(1)
    return sign + '$' + val + 'K'
  }
  return sign + '$' + abs.toFixed(0)
}

export function formatCurrencyShort(amount) {
  return formatCurrency(amount, { compact: true, showSign: false })
}

export function formatOverUnder(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—'
  const abs = Math.abs(amount)
  const sign = amount >= 0 ? '+' : '-'
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(1) + 'K'
  return sign + '$' + abs.toFixed(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Percentage formatting
// ─────────────────────────────────────────────────────────────────────────────

export function formatPercent(value, { showSign = false, decimals = 1 } = {}) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—'
  const sign = value > 0 ? (showSign ? '+' : '') : ''
  return sign + value.toFixed(decimals) + '%'
}

export function formatBudgetUsed(actual, budget) {
  if (!budget || budget === 0) return '—'
  return Math.round((actual / budget) * 100) + '% used'
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG  = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatMonth(date) {
  const d = typeof date === 'string' ? new Date(date + (date.length === 7 ? '-01' : '')) : date
  return MONTH_SHORT[d.getMonth()]
}

export function formatMonthYear(date) {
  const d = typeof date === 'string' ? new Date(date + (date.length === 7 ? '-01' : '')) : date
  return MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear()
}

export function formatMonthLong(date) {
  const d = typeof date === 'string' ? new Date(date + (date.length === 7 ? '-01' : '')) : date
  return MONTH_LONG[d.getMonth()] + ' ' + d.getFullYear()
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${y}`
}

export function formatDateInput(dateStr) {
  // returns YYYY-MM-DD for input[type=date]
  if (!dateStr) return ''
  return dateStr.substring(0, 10)
}

export function parseDateStr(str) {
  // Accepts YYYY-MM-DD or M/D/YYYY
  if (!str) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10)
  const parts = str.split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

export function daysBetween(start, end) {
  const a = new Date(start), b = new Date(end)
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount parsing (for import)
// ─────────────────────────────────────────────────────────────────────────────

export function parseAmount(str) {
  if (typeof str === 'number') return str
  if (!str) return 0
  const s = String(str).trim()
  const negative = s.startsWith('(') && s.endsWith(')')
  const clean = s.replace(/[($,)]/g, '').trim()
  const val = parseFloat(clean)
  return isNaN(val) ? 0 : (negative ? -val : val)
}

// ─────────────────────────────────────────────────────────────────────────────
// Number helpers
// ─────────────────────────────────────────────────────────────────────────────

export function calcOverUnderPct(actual, budget) {
  if (!budget || budget === 0) return null
  return ((actual - budget) / budget) * 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Date range display label  (e.g. "October – May")
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_LONG_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function formatDateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return 'Selected Period'
  const s = new Date(startDate + 'T00:00:00')
  const e = new Date(endDate   + 'T00:00:00')
  const sName = MONTH_LONG_NAMES[s.getMonth()]
  const eName = MONTH_LONG_NAMES[e.getMonth()]
  if (sName === eName && s.getFullYear() === e.getFullYear()) return sName
  return `${sName} – ${eName}`
}
