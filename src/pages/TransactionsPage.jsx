import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUp, ArrowDown, ArrowUpDown, FileDown, XCircle, Search,
  MessageSquare, X, ChevronDown, Check, SlidersHorizontal,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTeam } from '../context/TeamContext'
import { UnresolvedChip } from '../components/UnresolvedWarning'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100

const PIN_TYPES = [
  { type: 'question',             label: 'Question',             color: '#0EA5A0', placeholder: 'What are you wondering about?' },
  { type: 'variance-explanation', label: 'Variance Explanation', color: '#F97316', placeholder: 'Explain the variance…' },
  { type: 'reclassification',     label: 'Reclassify',           color: '#F59E0B', placeholder: 'Describe the reclassification needed…' },
  { type: 'financial-highlight',  label: 'Financial Highlight',  color: '#10B981', placeholder: 'Share a financial insight…' },
  { type: 'budget-request',       label: 'Budget Request',       color: '#8B5CF6', placeholder: 'Describe the budget request…' },
]

const MONTH_NAMES      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatDateReadable(dateStr) {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const [y, m, d] = parts.map(Number)
  return `${MONTH_NAMES_FULL[m - 1]} ${d}, ${y}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtAmt(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(n)
}

function fmtAmtCompact(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

function formatPeriod(p) {
  if (!p) return '—'
  const [y, m] = p.split('-').map(Number)
  return `${MONTH_NAMES[m-1]} ${y}`
}

function downloadCSV(filename, rows2d) {
  const csv = rows2d
    .map(r => r.map(v => (String(v).includes(',') ? `"${v}"` : v)).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function matchesTx(anchor, row) {
  const ref = anchor?.txRef
  if (!ref) return false
  return ref.date === row.date &&
    ref.vendor === row.vendor &&
    Math.abs((ref.amount || 0) - (row.amount || 0)) < 0.01
}

function quickPresets() {
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth()
  const todayStr     = today.toISOString().slice(0, 10)
  const thisMonthStart = new Date(y, m, 1).toISOString().slice(0, 10)
  const lastMonthStart = new Date(y, m-1, 1).toISOString().slice(0, 10)
  const lastMonthEnd   = new Date(y, m, 0).toISOString().slice(0, 10)
  const last3Start     = new Date(y, m-2, 1).toISOString().slice(0, 10)
  return [
    { label: 'This month',    start: thisMonthStart, end: todayStr },
    { label: 'Last month',    start: lastMonthStart, end: lastMonthEnd },
    { label: 'Last 3 months', start: last3Start,     end: todayStr },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Cascading filter helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyActualsFilters(rows, except, { search, recordType, deptFilter, catFilter, acctFilter, vendorFilter, grantFilter, amtMin, amtMax }) {
  let r = rows
  if (except !== 'recordType' && recordType !== 'all') r = r.filter(row => row.record_type === recordType)
  if (except !== 'search' && search.trim()) {
    const q = search.trim().toLowerCase()
    r = r.filter(row => [row.vendor, row.dept_name, row.department, row.category, row.account, row.grant, row.description].some(v => String(v||'').toLowerCase().includes(q)))
  }
  if (except !== 'dept' && deptFilter.size > 0) r = r.filter(row => deptFilter.has(row.dept_name || row.department))
  if (except !== 'cat' && catFilter.size > 0) r = r.filter(row => catFilter.has(row.category))
  if (except !== 'acct' && acctFilter.size > 0) r = r.filter(row => acctFilter.has(row.account))
  if (except !== 'vendor' && vendorFilter.size > 0) r = r.filter(row => vendorFilter.has(row.vendor || ''))
  if (except !== 'grant' && grantFilter.size > 0) r = r.filter(row => grantFilter.has(row.grant || 'No grant (N/A)'))
  if (except !== 'amt') {
    if (amtMin !== '') r = r.filter(row => Math.abs(row.amount||0) >= parseFloat(amtMin))
    if (amtMax !== '') r = r.filter(row => Math.abs(row.amount||0) <= parseFloat(amtMax))
  }
  return r
}

function applyBudgetFilters(rows, except, { budgetDeptFilter, budgetCatFilter, budgetScenarioFilter, budgetStartPeriod, budgetEndPeriod }) {
  let r = rows
  if (except !== 'period') {
    if (budgetStartPeriod) r = r.filter(b => b.period >= budgetStartPeriod)
    if (budgetEndPeriod)   r = r.filter(b => b.period <= budgetEndPeriod)
  }
  if (except !== 'dept' && budgetDeptFilter.size > 0) r = r.filter(b => budgetDeptFilter.has(b.dept_name || b.department))
  if (except !== 'cat' && budgetCatFilter.size > 0)   r = r.filter(b => budgetCatFilter.has(b.category))
  if (except !== 'scenario' && budgetScenarioFilter.size > 0) r = r.filter(b => budgetScenarioFilter.has(b.scenario))
  return r
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiCheckFilter
// ─────────────────────────────────────────────────────────────────────────────

function MultiCheckFilter({ label, options, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const activeCount = selected.size
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors
          ${activeCount > 0 ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
        {label}
        {activeCount > 0 && <span className="bg-white/20 px-1 rounded-full text-[10px] font-bold">{activeCount}</span>}
        <ChevronDown size={10}/>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 min-w-[180px] max-h-64 overflow-y-auto">
          {/* Header row: All / Clear */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100">
            <button onClick={() => { onClear() }} className="text-xs text-teal-600 hover:underline font-medium">All</button>
            {activeCount > 0 && <>
              <span className="text-gray-300 text-xs">·</span>
              <button onClick={() => { onClear(); setOpen(false) }} className="text-xs text-red-500 hover:underline">Clear ({activeCount})</button>
            </>}
          </div>
          {options.map(o => (
            <button key={o.value} onClick={() => onToggle(o.value)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0
                ${selected.has(o.value) ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                {selected.has(o.value) && <Check size={8} className="text-white"/>}
              </div>
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AmountRangeFilter with presets + mini histogram
// ─────────────────────────────────────────────────────────────────────────────

function AmountRangeFilter({ amtMin, amtMax, onMin, onMax, onClear, baseAmounts = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const active = amtMin !== '' || amtMax !== ''

  const presets = [
    { label: 'Under $1K',   min: '',     max: '1000'  },
    { label: '$1K – $10K',  min: '1000', max: '10000' },
    { label: 'Over $10K',   min: '10000',max: ''      },
    { label: 'Over $50K',   min: '50000',max: ''      },
  ]
  const BUCKETS = [
    { label: '<$1K',      min: 0,     max: 1000      },
    { label: '$1K-$10K',  min: 1000,  max: 10000     },
    { label: '$10K-$50K', min: 10000, max: 50000     },
    { label: '>$50K',     min: 50000, max: Infinity   },
  ]
  const counts = BUCKETS.map(b => baseAmounts.filter(a => a >= b.min && a < b.max).length)
  const maxCount = Math.max(...counts, 1)

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors
          ${active ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
        Amount{active ? ' ✓' : ''}
        <ChevronDown size={10}/>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-56">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Amount Range</div>

          {/* Mini histogram */}
          {baseAmounts.length > 0 && (
            <div className="flex items-end gap-1 mb-3 h-10">
              {BUCKETS.map((b, i) => (
                <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-teal-100 rounded-sm transition-all"
                    style={{ height: `${(counts[i] / maxCount) * 32}px`, minHeight: counts[i] > 0 ? 2 : 0 }}/>
                  <span className="text-[8px] text-gray-400 leading-none">{b.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1 mb-2">
            {presets.map(p => (
              <button key={p.label}
                onClick={() => { onMin(p.min); onMax(p.max) }}
                className="px-2 py-0.5 text-[10px] border border-gray-200 rounded-full text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </div>

          {/* Min/Max inputs */}
          <div className="flex gap-2 items-center">
            <input type="number" placeholder="Min" value={amtMin}
              onChange={e => onMin(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none"/>
            <span className="text-gray-400 text-xs">–</span>
            <input type="number" placeholder="Max" value={amtMax}
              onChange={e => onMax(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none"/>
          </div>
          {active && (
            <button onClick={onClear} className="mt-2 text-xs text-red-600 hover:underline">Clear</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort header button
// ─────────────────────────────────────────────────────────────────────────────

function SH({ col, right, sortCol, sortDir, onSort, children }) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap
        ${right ? 'text-right' : 'text-left'} ${active ? 'text-gray-900 bg-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {children}
        {active
          ? (sortDir === 'asc' ? <ArrowUp size={8}/> : <ArrowDown size={8}/>)
          : <ArrowUpDown size={8} className="opacity-30"/>}
      </span>
    </th>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction comment modal
// ─────────────────────────────────────────────────────────────────────────────

function TxCommentModal({ transaction: t, onClose }) {
  const { addComment } = useApp()
  const [type,   setType]   = useState('question')
  const [text,   setText]   = useState('')
  const [author, setAuthor] = useState('')
  const [saved,  setSaved]  = useState(false)

  const pin = PIN_TYPES.find(p => p.type === type) || PIN_TYPES[0]

  function handlePost() {
    if (!text.trim() || !author.trim()) return
    addComment({
      author,
      avatar:            author.charAt(0).toUpperCase(),
      type,
      page:              'breakdown',
      source_dashboard:  'Content Team',
      source_page:       'Transactions',
      text,
      category:          t.category,
      status:            'open',
      anchor: {
        type: 'tx',
        txRef: {
          date:       t.date,
          vendor:     t.vendor,
          amount:     t.amount,
          department: t.dept_name || t.department,
          category:   t.category,
          account:    t.account || '',
        },
      },
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{t.vendor}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{formatDateReadable(t.date)} · {t.category} · {t.dept_name || t.department}</p>
          </div>
          <div className="flex items-center gap-3 ml-3 flex-shrink-0">
            <span className="text-lg font-bold text-gray-900">{fmtAmt(t.amount)}</span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="px-5 pt-4 pb-2 flex flex-wrap gap-1.5">
          {PIN_TYPES.map(pt => (
            <button key={pt.type} onClick={() => setType(pt.type)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                type === pt.type ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
              style={type === pt.type ? { backgroundColor: pt.color, borderColor: pt.color } : {}}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: type === pt.type ? 'rgba(255,255,255,0.7)' : pt.color }}/>
              {pt.label}
            </button>
          ))}
        </div>
        <div className="px-5 pb-3 space-y-2">
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400"/>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={pin.placeholder}
            rows={3} autoFocus
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400"/>
        </div>
        <div className="flex items-center gap-2 px-5 pb-5">
          {saved
            ? <span className="text-xs text-green-600 font-medium flex-1">Posted! → view in Comments & Requests</span>
            : <div className="flex-1"/>}
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handlePost} disabled={!text.trim() || !author.trim()}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-colors"
            style={{ backgroundColor: pin.color }}>
            Post {pin.label}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TransactionsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { comments, dateRange, deptNames, selectedScenario } = useApp()
  const { teamActuals: actuals, teamBudget } = useTeam()

  // ── Date range — default to global fiscal year range from AppContext ──
  const today = new Date().toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`
  const [startDate, setStartDate] = useState(dateRange?.startDate || yearStart)
  const [endDate,   setEndDate]   = useState(dateRange?.endDate   || today)

  // ── View mode: actuals | budget ──
  const [viewMode, setViewMode] = useState('actuals')

  // ── Actuals filters ──
  const [search,          setSearch]          = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchDebounceRef = useRef(null)
  const [recordType,   setRecordType]   = useState('all')
  const [deptFilter,   setDeptFilter]   = useState(new Set())
  const [catFilter,    setCatFilter]    = useState(new Set())
  const [acctFilter,   setAcctFilter]   = useState(new Set())
  const [vendorFilter, setVendorFilter] = useState(new Set())  // multiselect Set
  const [grantFilter,  setGrantFilter]  = useState(new Set())
  const [amtMin,       setAmtMin]       = useState('')
  const [amtMax,       setAmtMax]       = useState('')

  // ── Budget filters ──
  const [budgetDeptFilter,     setBudgetDeptFilter]     = useState(new Set())
  const [budgetCatFilter,      setBudgetCatFilter]      = useState(new Set())
  const [budgetScenarioFilter, setBudgetScenarioFilter] = useState(new Set())
  const [budgetStartPeriod,    setBudgetStartPeriod]    = useState(dateRange?.startDate?.substring(0,7) || '')
  const [budgetEndPeriod,      setBudgetEndPeriod]      = useState(dateRange?.endDate?.substring(0,7)   || '')

  // ── Budget sort ──
  const [budgetSortCol, setBudgetSortCol] = useState('period')
  const [budgetSortDir, setBudgetSortDir] = useState('asc')

  // ── Actuals sort ──
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // ── Pagination ──
  const [page, setPage] = useState(1)
  const [budgetPage, setBudgetPage] = useState(1)

  // ── Modal ──
  const [selectedTx, setSelectedTx] = useState(null)

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'amount' ? 'desc' : 'asc') }
    setPage(1)
  }

  function toggleBudgetSort(col) {
    if (budgetSortCol === col) setBudgetSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setBudgetSortCol(col); setBudgetSortDir(col === 'amount' ? 'desc' : 'asc') }
    setBudgetPage(1)
  }

  // ── In-range rows (date filter applied first) ──
  const inRange = useMemo(() =>
    actuals.filter(r => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate))
  , [actuals, startDate, endDate])

  // Build filter state object for helpers
  const actualsFilterState = { search: debouncedSearch, recordType, deptFilter, catFilter, acctFilter, vendorFilter, grantFilter, amtMin, amtMax }
  const budgetFilterState  = { budgetDeptFilter, budgetCatFilter, budgetScenarioFilter: new Set(), budgetStartPeriod, budgetEndPeriod }

  // Pre-filter budget by globally selected scenario
  const budgetBase = useMemo(
    () => selectedScenario ? teamBudget.filter(b => b.scenario === selectedScenario) : teamBudget,
    [teamBudget, selectedScenario]
  )

  // ── Dynamic cascade options — each computed from all OTHER active filters ──

  const deptOptions = useMemo(() => {
    const pool = applyActualsFilters(inRange, 'dept', actualsFilterState)
    const seen = new Map()
    for (const r of pool) {
      const name = r.dept_name || r.department
      if (name && !seen.has(name)) seen.set(name, { value: name, label: name })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [inRange, debouncedSearch, recordType, catFilter, acctFilter, vendorFilter, grantFilter, amtMin, amtMax])

  const catOptions = useMemo(() => {
    const pool = applyActualsFilters(inRange, 'cat', actualsFilterState)
    const seen = new Set()
    for (const r of pool) if (r.category) seen.add(r.category)
    return [...seen].sort().map(c => ({ value: c, label: c }))
  }, [inRange, debouncedSearch, recordType, deptFilter, acctFilter, vendorFilter, grantFilter, amtMin, amtMax])

  const acctOptions = useMemo(() => {
    const pool = applyActualsFilters(inRange, 'acct', actualsFilterState)
    const seen = new Map()
    for (const r of pool) {
      const name = r.account
      if (name && !seen.has(name)) seen.set(name, { value: name, label: name })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [inRange, debouncedSearch, recordType, deptFilter, catFilter, vendorFilter, grantFilter, amtMin, amtMax])

  const vendorOptions = useMemo(() => {
    const pool = applyActualsFilters(inRange, 'vendor', actualsFilterState)
    const seen = new Set()
    for (const r of pool) if (r.vendor) seen.add(r.vendor)
    return [...seen].sort().map(v => ({ value: v, label: v }))
  }, [inRange, debouncedSearch, recordType, deptFilter, catFilter, acctFilter, grantFilter, amtMin, amtMax])

  const grantOptions = useMemo(() => {
    const pool = applyActualsFilters(inRange, 'grant', actualsFilterState)
    const seen = new Set()
    for (const r of pool) seen.add(r.grant || 'No grant (N/A)')
    return [...seen].sort().map(g => ({ value: g, label: g }))
  }, [inRange, debouncedSearch, recordType, deptFilter, catFilter, acctFilter, vendorFilter, amtMin, amtMax])

  // Base amounts for histogram (all filters except amount applied)
  const baseAmounts = useMemo(() =>
    applyActualsFilters(inRange, 'amt', actualsFilterState).map(r => Math.abs(r.amount||0))
  , [inRange, debouncedSearch, recordType, deptFilter, catFilter, acctFilter, vendorFilter, grantFilter])

  // ── Filtered + sorted actuals rows ──
  const filtered = useMemo(() => {
    let rows = applyActualsFilters(inRange, null, actualsFilterState)

    rows = [...rows].sort((a, b) => {
      let av, bv
      if (sortCol === 'date')   { av = a.date   || ''; bv = b.date   || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortCol === 'dept')   { av = a.dept_name || a.department || ''; bv = b.dept_name || b.department || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortCol === 'cat')    { av = a.category || ''; bv = b.category || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortCol === 'acct')   { av = a.account  || ''; bv = b.account  || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortCol === 'vendor') { av = a.vendor   || ''; bv = b.vendor   || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortCol === 'amount') { av = Math.abs(a.amount || 0); bv = Math.abs(b.amount || 0); return sortDir === 'asc' ? av - bv : bv - av }
      return 0
    })
    return rows
  }, [inRange, debouncedSearch, recordType, deptFilter, catFilter, acctFilter, vendorFilter, grantFilter, amtMin, amtMax, sortCol, sortDir])

  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + Math.abs(r.amount || 0), 0), [filtered])

  // ── Budget cascade options ──
  const budgetDeptOptions = useMemo(() => {
    const pool = applyBudgetFilters(budgetBase, 'dept', budgetFilterState)
    const seen = new Set()
    for (const b of pool) {
      const name = b.dept_name || b.department
      if (name) seen.add(name)
    }
    return [...seen].sort().map(n => ({ value: n, label: n }))
  }, [budgetBase, budgetCatFilter, budgetStartPeriod, budgetEndPeriod])

  const budgetCatOptions = useMemo(() => {
    const pool = applyBudgetFilters(budgetBase, 'cat', budgetFilterState)
    const seen = new Set()
    for (const b of pool) if (b.category) seen.add(b.category)
    return [...seen].sort().map(c => ({ value: c, label: c }))
  }, [budgetBase, budgetDeptFilter, budgetStartPeriod, budgetEndPeriod])

  // ── Filtered budget rows ──
  const filteredBudget = useMemo(() => {
    let rows = applyBudgetFilters(budgetBase, null, budgetFilterState)

    rows = [...rows].sort((a, b) => {
      let av, bv
      if (budgetSortCol === 'period')   { av = a.period||''; bv = b.period||''; return budgetSortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (budgetSortCol === 'dept')     { av = a.dept_name||a.department||''; bv = b.dept_name||b.department||''; return budgetSortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (budgetSortCol === 'cat')      { av = a.category||''; bv = b.category||''; return budgetSortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (budgetSortCol === 'scenario') { av = a.scenario||''; bv = b.scenario||''; return budgetSortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (budgetSortCol === 'amount')   { av = a.amount||0; bv = b.amount||0; return budgetSortDir==='asc'?av-bv:bv-av }
      return 0
    })
    return rows
  }, [budgetBase, budgetDeptFilter, budgetCatFilter, budgetStartPeriod, budgetEndPeriod, budgetSortCol, budgetSortDir])

  const filteredBudgetTotal = useMemo(() => filteredBudget.reduce((s, b) => s + (b.amount||0), 0), [filteredBudget])

  // ── Active filter count ──
  function activeFilterCount() {
    return [
      debouncedSearch.trim() ? 1 : 0,
      recordType !== 'all' ? 1 : 0,
      deptFilter.size,
      catFilter.size,
      acctFilter.size,
      vendorFilter.size,
      grantFilter.size,
      amtMin !== '' || amtMax !== '' ? 1 : 0,
    ].reduce((a, b) => a + b, 0)
  }

  function clearAllFilters() {
    setSearch(''); setDebouncedSearch(''); setRecordType('all')
    setDeptFilter(new Set()); setCatFilter(new Set()); setAcctFilter(new Set())
    setVendorFilter(new Set()); setGrantFilter(new Set())
    setAmtMin(''); setAmtMax('')
    setPage(1)
  }

  function clearAllBudgetFilters() {
    setBudgetDeptFilter(new Set()); setBudgetCatFilter(new Set())
    setBudgetStartPeriod(dateRange?.startDate?.substring(0,7) || '')
    setBudgetEndPeriod(dateRange?.endDate?.substring(0,7) || '')
    setBudgetPage(1)
  }

  // ── Comments index ──
  const txCommentMap = useMemo(() => {
    const map = new Map()
    comments.forEach(c => {
      if (c.anchor?.type === 'tx') {
        const r = c.anchor.txRef
        const key = `${r.date}|${r.vendor}|${r.amount}`
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(c)
      }
    })
    return map
  }, [comments])

  function txKey(row) { return `${row.date}|${row.vendor}|${row.amount}` }
  function txComments(row) { return txCommentMap.get(txKey(row)) || [] }

  const totalPages       = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows         = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const budgetTotalPages = Math.max(1, Math.ceil(filteredBudget.length / PAGE_SIZE))
  const budgetPageRows   = filteredBudget.slice((budgetPage - 1) * PAGE_SIZE, budgetPage * PAGE_SIZE)

  function handleExport() {
    if (viewMode === 'budget') {
      const keys = ['period', 'department', 'category', 'scenario', 'amount', 'period_type']
      downloadCSV('budget-export.csv', [
        keys,
        ...filteredBudget.map(r => keys.map(k => r[k] ?? '')),
      ])
      return
    }
    const keys = ['date', 'dept_name', 'category', 'account', 'grant', 'vendor', 'amount', 'description']
    downloadCSV('transactions-export.csv', [
      keys,
      ...filtered.map(r => keys.map(k => r[k] ?? '')),
    ])
  }

  const shProps = { sortCol, sortDir, onSort: (col) => { toggleSort(col); setPage(1) } }

  const budgetActiveFx = (budgetDeptFilter.size + budgetCatFilter.size) +
    (budgetStartPeriod ? 1 : 0) + (budgetEndPeriod ? 1 : 0)

  return (
    <>
    <div className="flex flex-col min-h-0 h-full">

      {/* Page header */}
      <div className="flex items-end justify-between px-6 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {viewMode === 'budget'
              ? 'Budget line items for this team. Switch to Actuals to see transactions.'
              : 'All actuals for this team. Click any row to leave a comment.'}
          </p>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm">
          <FileDown size={14}/> Export{viewMode === 'actuals' && activeFilterCount() > 0 ? ' filtered' : viewMode === 'budget' ? ' budget' : ' all'}
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm mx-6 mb-6 flex flex-col">

        {/* ── Toolbar row 1: date range + presets + record type + view mode ── */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-gray-100 bg-gray-50">
          {viewMode === 'actuals' ? (
            <>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              {quickPresets().map(p => (
                <button key={p.label} onClick={() => { setStartDate(p.start); setEndDate(p.end); setPage(1) }}
                  className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-white hover:border-gray-400 transition-colors whitespace-nowrap">
                  {p.label}
                </button>
              ))}
              <div className="w-px h-5 bg-gray-200"/>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {[['all','All'],['expense','Expense'],['income','Income']].map(([val, lbl]) => (
                  <button key={val} onClick={() => { setRecordType(val); setPage(1) }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${recordType === val ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Budget period range (month inputs) */
            <>
              <span className="text-xs text-gray-500 font-medium">Period:</span>
              <input type="month" value={budgetStartPeriod} onChange={e => { setBudgetStartPeriod(e.target.value); setBudgetPage(1) }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              <span className="text-xs text-gray-400">to</span>
              <input type="month" value={budgetEndPeriod} onChange={e => { setBudgetEndPeriod(e.target.value); setBudgetPage(1) }}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            </>
          )}

          {/* Actuals / Budget view toggle — right side of toolbar row 1 */}
          <div className="ml-auto flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-0.5 flex-shrink-0">
            {[['actuals','Actuals'],['budget','Budget']].map(([id, lbl]) => (
              <button key={id} onClick={() => setViewMode(id)}
                className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* ── Toolbar row 2: search + column filters ── */}
        {viewMode === 'actuals' ? (
          <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 border-b border-gray-200 bg-white">
            <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
            {/* Global search */}
            <div className="relative min-w-[180px]">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e => {
                const v = e.target.value
                setSearch(v)
                setPage(1)
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                searchDebounceRef.current = setTimeout(() => setDebouncedSearch(v), 200)
              }} placeholder="Search…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"/>
            </div>
            {/* Department */}
            <MultiCheckFilter label="Department" options={deptOptions} selected={deptFilter}
              onToggle={v => { setDeptFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setPage(1) }}
              onClear={() => { setDeptFilter(new Set()); setPage(1) }}/>
            {/* Category */}
            <MultiCheckFilter label="Category" options={catOptions} selected={catFilter}
              onToggle={v => { setCatFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setPage(1) }}
              onClear={() => { setCatFilter(new Set()); setPage(1) }}/>
            {/* Account */}
            <MultiCheckFilter label="Account" options={acctOptions} selected={acctFilter}
              onToggle={v => { setAcctFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setPage(1) }}
              onClear={() => { setAcctFilter(new Set()); setPage(1) }}/>
            {/* Vendor — now multiselect dropdown */}
            <MultiCheckFilter label="Vendor" options={vendorOptions} selected={vendorFilter}
              onToggle={v => { setVendorFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setPage(1) }}
              onClear={() => { setVendorFilter(new Set()); setPage(1) }}/>
            {/* Grant — multiselect including "No grant (N/A)" */}
            <MultiCheckFilter label="Grant" options={grantOptions} selected={grantFilter}
              onToggle={v => { setGrantFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setPage(1) }}
              onClear={() => { setGrantFilter(new Set()); setPage(1) }}/>
            {/* Amount range */}
            <AmountRangeFilter amtMin={amtMin} amtMax={amtMax}
              onMin={v => { setAmtMin(v); setPage(1) }}
              onMax={v => { setAmtMax(v); setPage(1) }}
              onClear={() => { setAmtMin(''); setAmtMax(''); setPage(1) }}
              baseAmounts={baseAmounts}/>
            {/* Filter badge + clear */}
            {activeFilterCount() > 0 && (
              <>
                <span className="text-[10px] font-bold bg-gray-900 text-white px-2 py-0.5 rounded-full">
                  {activeFilterCount()} filter{activeFilterCount() !== 1 ? 's' : ''}
                </span>
                <button onClick={clearAllFilters} className="text-xs text-red-600 hover:underline font-medium">
                  Clear all
                </button>
              </>
            )}
          </div>
        ) : (
          /* Budget filter row */
          <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 border-b border-gray-200 bg-white">
            <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
            <MultiCheckFilter label="Department" options={budgetDeptOptions} selected={budgetDeptFilter}
              onToggle={v => { setBudgetDeptFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setBudgetPage(1) }}
              onClear={() => { setBudgetDeptFilter(new Set()); setBudgetPage(1) }}/>
            <MultiCheckFilter label="Category" options={budgetCatOptions} selected={budgetCatFilter}
              onToggle={v => { setBudgetCatFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setBudgetPage(1) }}
              onClear={() => { setBudgetCatFilter(new Set()); setBudgetPage(1) }}/>
            {(budgetDeptFilter.size + budgetCatFilter.size) > 0 && (
              <>
                <span className="text-[10px] font-bold bg-gray-900 text-white px-2 py-0.5 rounded-full">
                  {budgetDeptFilter.size + budgetCatFilter.size} filter{(budgetDeptFilter.size + budgetCatFilter.size) !== 1 ? 's' : ''}
                </span>
                <button onClick={clearAllBudgetFilters} className="text-xs text-red-600 hover:underline font-medium">
                  Clear all
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Stats bar ── */}
        <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-100 text-xs text-gray-400">
          {viewMode === 'actuals' ? (
            <>
              <span className="font-medium text-gray-600">{filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''}</span>
              {filtered.length < inRange.length && (
                <span>of {inRange.length.toLocaleString()} in range</span>
              )}
              <span className="font-semibold text-gray-700">{fmtAmtCompact(filteredTotal)}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-gray-600">{filteredBudget.length.toLocaleString()} budget line{filteredBudget.length !== 1 ? 's' : ''}</span>
              <span className="font-semibold text-gray-700">{fmtAmtCompact(filteredBudgetTotal)} total budgeted</span>
            </>
          )}
        </div>

        {/* ── Table (Actuals) ── */}
        {viewMode === 'actuals' && (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 780 }}>
              <thead>
                <tr className="bg-gray-900 text-white select-none">
                  <SH col="date"   {...shProps}>Date</SH>
                  <SH col="dept"   {...shProps}>Department</SH>
                  <SH col="cat"    {...shProps}>Category</SH>
                  <SH col="acct"   {...shProps}>Account</SH>
                  <SH col="vendor" {...shProps}>Vendor</SH>
                  <SH col="amount" right {...shProps}>Amount</SH>
                  <th className="px-2 py-2.5 w-10 bg-gray-900"/>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                      {activeFilterCount() > 0
                        ? 'No transactions match your filters.'
                        : 'No transactions in this date range.'}
                    </td>
                  </tr>
                ) : pageRows.map((row, i) => {
                  const rowComments  = txComments(row)
                  const hasComments  = rowComments.length > 0
                  const commentColor = hasComments
                    ? (PIN_TYPES.find(p => p.type === rowComments[0].type)?.color || '#6B7280')
                    : null
                  return (
                    <tr key={i} onClick={() => setSelectedTx(row)}
                      className={`border-b border-gray-50 hover:bg-teal-50/40 transition-colors cursor-pointer group ${
                        i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}>
                      <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{formatDateReadable(row.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row._warnings?.includes('no_dept') ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-400 text-xs">{row.dept_name || row.department || '—'}</span>
                            <UnresolvedChip warnType="no_dept"/>
                          </div>
                        ) : (
                          <span className="text-gray-700">{row.dept_name || row.department || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[160px]">
                        {(row._warnings?.length > 0) ? (
                          <div className="flex flex-col gap-0.5">
                            {row.category && <span className="text-gray-600 text-xs truncate">{row.category}</span>}
                            {(row._warnings || [])
                              .filter(w => w !== 'no_dept')
                              .map(w => <UnresolvedChip key={w} warnType={w}/>)
                            }
                          </div>
                        ) : (
                          <span className="text-gray-700 whitespace-nowrap truncate">{row.category || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.account || '—'}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{row.vendor || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                        {fmtAmt(row.amount)}
                      </td>
                      <td className="px-2 py-2 w-10 text-center">
                        {hasComments ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: commentColor }}
                            title={`${rowComments.length} comment${rowComments.length !== 1 ? 's' : ''}`}>
                            <MessageSquare size={9}/>
                            {rowComments.length}
                          </span>
                        ) : (
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-teal-100 text-teal-400">
                            <MessageSquare size={12}/>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              {pageRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {activeFilterCount() > 0 ? `Filtered total (${filtered.length} rows)` : `Total (${inRange.length} rows)`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 tabular-nums">
                      {fmtAmt(filteredTotal)}
                    </td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Table (Budget) ── */}
        {viewMode === 'budget' && (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr className="bg-gray-900 text-white select-none">
                  {[
                    { col: 'period',      label: 'Period'      },
                    { col: 'dept',        label: 'Department'  },
                    { col: 'cat',         label: 'Category'    },
                    { col: 'scenario',    label: 'Scenario'    },
                    { col: 'amount',      label: 'Amount' },
                    { col: 'period_type', label: 'Period Type' },
                  ].map(({ col, label, right }) => (
                    <th key={col} onClick={() => { toggleBudgetSort(col); setBudgetPage(1) }}
                      className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap text-left ${budgetSortCol === col ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
                      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
                        {label}
                        {budgetSortCol === col
                          ? (budgetSortDir === 'asc' ? <ArrowUp size={8}/> : <ArrowDown size={8}/>)
                          : <ArrowUpDown size={8} className="opacity-30"/>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {budgetPageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                      No budget lines match your filters.
                    </td>
                  </tr>
                ) : budgetPageRows.map((row, i) => (
                  <tr key={i}
                    className={`border-b border-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{formatPeriod(row.period)}</td>
                    <td className="px-3 py-2 text-gray-700">{row.dept_name || row.department || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{row.category || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700">
                        {row.scenario || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                      {fmtAmt(row.amount || 0)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{row.period_type || '—'}</td>
                  </tr>
                ))}
              </tbody>
              {budgetPageRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Total ({filteredBudget.length} lines)
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 tabular-nums">
                      {fmtAmt(filteredBudgetTotal)}
                    </td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Pagination (Actuals) ── */}
        {viewMode === 'actuals' && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} · rows {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}
            </span>
            <div className="flex gap-1">
              {[['«', () => setPage(1), page === 1], ['‹', () => setPage(p => Math.max(1, p-1)), page === 1]].map(([l, fn, dis]) => (
                <button key={l} onClick={fn} disabled={dis}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">{l}</button>
              ))}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(page - 3, totalPages - 5))
                const p = offset + i + 1
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-2.5 py-1 text-xs border rounded-lg transition-colors ${
                      p === page ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-100'
                    }`}>{p}</button>
                )
              })}
              {[['›', () => setPage(p => Math.min(totalPages, p+1)), page === totalPages], ['»', () => setPage(totalPages), page === totalPages]].map(([l, fn, dis]) => (
                <button key={l} onClick={fn} disabled={dis}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Pagination (Budget) ── */}
        {viewMode === 'budget' && budgetTotalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {budgetPage} of {budgetTotalPages} · rows {((budgetPage - 1) * PAGE_SIZE) + 1}–{Math.min(budgetPage * PAGE_SIZE, filteredBudget.length)}
            </span>
            <div className="flex gap-1">
              {[['«', () => setBudgetPage(1), budgetPage === 1], ['‹', () => setBudgetPage(p => Math.max(1, p-1)), budgetPage === 1]].map(([l, fn, dis]) => (
                <button key={l} onClick={fn} disabled={dis}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">{l}</button>
              ))}
              {Array.from({ length: Math.min(5, budgetTotalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(budgetPage - 3, budgetTotalPages - 5))
                const p = offset + i + 1
                return (
                  <button key={p} onClick={() => setBudgetPage(p)}
                    className={`px-2.5 py-1 text-xs border rounded-lg transition-colors ${
                      p === budgetPage ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-100'
                    }`}>{p}</button>
                )
              })}
              {[['›', () => setBudgetPage(p => Math.min(budgetTotalPages, p+1)), budgetPage === budgetTotalPages], ['»', () => setBudgetPage(budgetTotalPages), budgetPage === budgetTotalPages]].map(([l, fn, dis]) => (
                <button key={l} onClick={fn} disabled={dis}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Comment modal */}
    {selectedTx && (
      <TxCommentModal transaction={selectedTx} onClose={() => setSelectedTx(null)}/>
    )}
    </>
  )
}
