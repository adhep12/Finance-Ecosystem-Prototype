/**
 * MasterTransactionsEditor.jsx — Step 6: Master Transaction Editing
 *
 * Reads from Supabase `transactions` table (client-side enriched via registry maps).
 * Supports: add (manual entry), inline edit, soft delete, restore,
 * "Show deleted" toggle, `manual entry` badge, `edited` badge, export CSV.
 *
 * Non-negotiable spec rules enforced here:
 *  - All deletes are soft (deleted=true). No hard deletes.
 *  - Every edit is logged to edit_log (via dbUpdate helper).
 *  - `source: 'manual'` on manually-added rows.
 *  - `edited` badge shown for rows with edit_log entries.
 *  - Registry change vs transaction edit are SEPARATE flows (registry changes
 *    happen in Setup → Chart of Accounts, not here).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Plus, Trash2, RotateCcw, Download, Search, ChevronDown,
  Check, X, Clock, Eye, EyeOff, Loader2, AlertTriangle,
  Edit2, Filter, ChevronLeft, ChevronRight, ArrowUp, ArrowDown,
  ArrowUpDown, SlidersHorizontal,
} from 'lucide-react'
import { supabase, ORG_ID, dbUpdate, dbSoftDelete } from '../lib/supabase'
import DataEditModal from '../components/DataEditModal'
import AuditLogPanel from '../components/AuditLogPanel'
import { useApp } from '../context/AppContext'
import { UnresolvedChip, UnresolvedSection } from '../components/UnresolvedWarning'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n)
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}

function parseAmount(str) {
  if (!str && str !== 0) return null
  const n = parseFloat(String(str).replace(/[$,]/g, '').replace(/[()]/g, m => m === '(' ? '-' : ''))
  return isNaN(n) ? null : n
}

function downloadCSV(filename, rows, columns) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(r => columns.map(c => {
    const v = String(r[c.key] ?? '')
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick preset dates
// ─────────────────────────────────────────────────────────────────────────────

function quickPresets() {
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth()
  const todayStr = today.toISOString().slice(0, 10)
  const thisMonthStart = new Date(y, m, 1).toISOString().slice(0, 10)
  const lastMonthStart = new Date(y, m-1, 1).toISOString().slice(0, 10)
  const lastMonthEnd   = new Date(y, m, 0).toISOString().slice(0, 10)
  const last3Start     = new Date(y, m-2, 1).toISOString().slice(0, 10)
  return [
    { label:'This month',    start: thisMonthStart, end: todayStr },
    { label:'Last month',    start: lastMonthStart, end: lastMonthEnd },
    { label:'Last 3 months', start: last3Start,     end: todayStr },
  ]
}

function monthPresets() {
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth()
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  const thisMonth  = ym(today)
  const lastMonth  = ym(new Date(y, m-1, 1))
  const last3Start = ym(new Date(y, m-2, 1))
  const last6Start = ym(new Date(y, m-5, 1))
  const last12Start = ym(new Date(y, m-11, 1))
  return [
    { label:'This month',     start: thisMonth,   end: thisMonth },
    { label:'Last month',     start: lastMonth,   end: lastMonth },
    { label:'Last 3 months',  start: last3Start,  end: thisMonth },
    { label:'Last 6 months',  start: last6Start,  end: thisMonth },
    { label:'Last 12 months', start: last12Start, end: thisMonth },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiCheckFilter dropdown
// ─────────────────────────────────────────────────────────────────────────────

function MultiCheckFilter({ label, options, selected, onToggle, onClear, groups }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const activeCount = selected.size
  // Render grouped or flat
  const renderItems = () => {
    if (groups && groups.length > 0) {
      return groups.map(g => (
        <div key={g.label}>
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 px-3 pt-2 pb-1">{g.label}</div>
          {g.items.map(o => (
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
      ))
    }
    return options.map(o => (
      <button key={o.value} onClick={() => onToggle(o.value)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0
          ${selected.has(o.value) ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
          {selected.has(o.value) && <Check size={8} className="text-white"/>}
        </div>
        <span className="truncate">{o.label}</span>
      </button>
    ))
  }

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
          {renderItems()}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AmountRangeFilter
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

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function formatPeriod(p) {
  if (!p) return '—'
  const [y, m] = p.split('-').map(Number)
  return `${MONTH_NAMES[m-1]} ${y}`
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

// Apply all actuals filters except the named one — used to compute each
// dropdown's available options from the live dataset (cascading/dynamic filters).
function applyActualsFilters(rows, except, { search, recordType, deptFilter, catFilter, acctFilter, grantFilter, vendorFilter, amtMin, amtMax }) {
  let r = rows
  const q = (search || '').trim().toLowerCase()
  if (q && except !== 'search') {
    r = r.filter(row => [row.vendor, row.description, row.account_name, row.dept_name, row.category, row.grant_name, row.account_code, row.dept_code]
      .some(v => String(v || '').toLowerCase().includes(q)))
  }
  if (recordType !== 'all' && except !== 'recordType') r = r.filter(row => row.record_type === recordType)
  if (except !== 'dept'   && deptFilter.size   > 0) r = r.filter(row => deptFilter.has(row.department_id))
  if (except !== 'cat'    && catFilter.size    > 0) r = r.filter(row => catFilter.has(row.category))
  if (except !== 'acct'   && acctFilter.size   > 0) r = r.filter(row => acctFilter.has(row.account_id))
  if (except !== 'grant'  && grantFilter.size  > 0) r = r.filter(row => {
    if (grantFilter.has('none')) return !row.grant_id || grantFilter.has(row.grant_id)
    return grantFilter.has(row.grant_id)
  })
  if (except !== 'vendor' && vendorFilter.size > 0) r = r.filter(row => vendorFilter.has(row.vendor || ''))
  if (except !== 'amount') {
    if (amtMin !== '') r = r.filter(row => Math.abs(row.amount || 0) >= parseFloat(amtMin))
    if (amtMax !== '') r = r.filter(row => Math.abs(row.amount || 0) <= parseFloat(amtMax))
  }
  return r
}

/** Compute default date range: current fiscal year start → today */
function defaultDateRange(fyStartMonth) {
  const today = new Date()
  const m = today.getMonth() + 1
  const y = today.getFullYear()
  const fyYear = m >= fyStartMonth ? y + 1 : y
  const fyStart = new Date(`${fyYear - 1}-${String(fyStartMonth).padStart(2,'0')}-01`)
  return {
    startDate: fyStart.toISOString().slice(0, 10),
    endDate:   today.toISOString().slice(0, 10),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline editable cell
// ─────────────────────────────────────────────────────────────────────────────

function EditCell({ value, displayValue, onChange, type = 'text', options, placeholder, numeric }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef()

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  function commit() {
    setEditing(false)
    const finalVal = numeric ? (parseFloat(draft) || 0) : draft
    if (String(finalVal) !== String(value)) onChange(finalVal)
  }
  function cancel() { setEditing(false); setDraft(value) }

  const display = displayValue !== undefined ? displayValue : (value || <span className="text-gray-300 italic text-xs">{placeholder || '—'}</span>)

  if (!editing) {
    return (
      <div onClick={() => { setDraft(value); setEditing(true) }}
        className="cursor-pointer hover:bg-teal-50 rounded px-1 py-0.5 min-h-[20px] text-sm transition-colors"
        title="Click to edit">
        {display}
      </div>
    )
  }

  if (type === 'select') {
    return (
      <select ref={ref} value={draft ?? ''}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        className="text-xs border border-teal-400 rounded px-1.5 py-0.5 bg-white focus:outline-none w-full max-w-[180px]">
        <option value="">— none —</option>
        {(options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  return (
    <input ref={ref} type={type} value={draft ?? ''}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
      onBlur={commit}
      className="text-xs border border-teal-400 rounded px-1.5 py-0.5 focus:outline-none w-full max-w-[160px]"/>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// History panel
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPanel({ txId, onClose }) {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('edit_log').select('*')
      .eq('table_name', 'transactions').eq('record_id', txId)
      .order('edited_at', { ascending: false }).limit(50)
      .then(({ data }) => { setLog(data || []); setLoading(false) })
  }, [txId])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20" onClick={onClose}/>
      <div className="w-88 bg-white border-l border-gray-200 h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 font-semibold text-gray-800 text-sm">
            <Clock size={15} className="text-teal-600"/>Change History
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={15}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-xs text-gray-400 text-center py-8">Loading…</p>}
          {!loading && log.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No changes recorded.</p>}
          {log.map(e => (
            <div key={e.id} className="mb-4 pb-4 border-b border-gray-100 last:border-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{e.field}</span>
                <span className="text-xs text-gray-400">{formatDate(e.edited_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="line-through text-gray-400 max-w-[100px] truncate">{e.old_value || '—'}</span>
                <span className="text-gray-300">→</span>
                <span className="font-medium text-gray-700 max-w-[100px] truncate">{e.new_value || '—'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">by {e.edited_by}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Transaction Form
// ─────────────────────────────────────────────────────────────────────────────

function AddTransactionForm({ departments, accounts, grants, onAdd, onCancel }) {
  const [vals, setVals] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    department_id: '',
    account_id: '',
    vendor: '',
    grant_id: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(k, v) { setVals(p => ({ ...p, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    const amt = parseAmount(vals.amount)
    if (!vals.date) { setError('Date is required'); return }
    if (amt === null) { setError('Amount must be a valid number'); return }

    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('transactions').insert([{
      org_id:        ORG_ID,
      date:          vals.date,
      fiscal_period: vals.date.slice(0, 7),
      amount:        amt,
      department_id: vals.department_id || null,
      account_id:    vals.account_id    || null,
      vendor:        vals.vendor        || null,
      grant_id:      vals.grant_id      || null,
      description:   vals.description   || null,
      source:        'manual',
      deleted:       false,
    }])
    setSaving(false)
    if (err) setError(err.message)
    else onAdd()
  }

  return (
    <form onSubmit={submit} className="p-4 bg-teal-50 border border-teal-200 rounded-xl mb-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-teal-800">Add Manual Transaction</span>
        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">manual entry</span>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Date <span className="text-red-400">*</span></label>
          <input type="date" value={vals.date} onChange={e => set('date', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Amount <span className="text-red-400">*</span></label>
          <input type="text" value={vals.amount} onChange={e => set('amount', e.target.value)}
            placeholder="e.g. 5000 or -1200"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Department</label>
          <select value={vals.department_id} onChange={e => set('department_id', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
            <option value="">— none —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code} — {d.dept_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Account</label>
          <select value={vals.account_id} onChange={e => set('account_id', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
            <option value="">— none —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Vendor</label>
          <input type="text" value={vals.vendor} onChange={e => set('vendor', e.target.value)}
            placeholder="Payee name"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Grant</label>
          <select value={vals.grant_id} onChange={e => set('grant_id', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
            <option value="">— none —</option>
            {grants.map(g => <option key={g.id} value={g.id}>{g.grant_code} — {g.grant_name}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Description / Memo</label>
          <input type="text" value={vals.description} onChange={e => set('description', e.target.value)}
            placeholder="Optional note"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
          <Plus size={14}/> {saving ? 'Saving…' : 'Add Transaction'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function MasterTransactionsEditor({ orgSettings }) {
  const fyStartMonth = orgSettings?.fiscal_year_start_month || 10
  const {
    budgetFlat, deptNames: contextDeptNames,
    cashFlowData, patronData,
    addBudgetRow,  updateBudgetRow,  deleteBudgetRow,
    addPatronRow,  updatePatronRow,  deletePatronRow,
    addCashFlowRow, updateCashFlowRow, deleteCashFlowRow,
  } = useApp()

  // ── Registries ──────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState([])
  const [accounts,    setAccounts]    = useState([])
  const [grants,      setGrants]      = useState([])
  const [teams,       setTeams]       = useState([])

  // Lookup maps keyed by ID
  const deptMap  = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const acctMap  = useMemo(() => new Map(accounts.map(a => [a.id, a])),   [accounts])
  const grantMap = useMemo(() => new Map(grants.map(g => [g.id, g])),     [grants])

  // Dropdown options
  const deptOpts  = departments.map(d => ({ value: d.id,  label: `${d.dept_code} — ${d.dept_name}` }))
  const acctOpts  = accounts.map(a =>   ({ value: a.id,   label: `${a.account_code} — ${a.account_name}` }))
  const grantOpts = grants.map(g =>     ({ value: g.id,   label: `${g.grant_code} — ${g.grant_name}` }))

  // ── Registry error ──────────────────────────────────────────────────────────
  const [regError, setRegError] = useState(null)

  // ── Transactions state ──────────────────────────────────────────────────────
  const [rows,        setRows]        = useState([])
  const [deletedRows, setDeletedRows] = useState([])
  const [editedIds,   setEditedIds]   = useState(new Set())
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [totalCount,  setTotalCount]  = useState(0)
  const [page,        setPage]        = useState(0)

  // ── UI state ────────────────────────────────────────────────────────────────
  const { startDate: defStart, endDate: defEnd } = defaultDateRange(fyStartMonth)
  const [startDate,   setStartDate]   = useState(defStart)
  const [endDate,     setEndDate]     = useState(defEnd)
  const [search,      setSearch]      = useState('')
  const [recordType,  setRecordType]  = useState('all') // 'all' | 'income' | 'expense'
  const [showDeleted, setShowDeleted] = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [historyId,   setHistoryId]   = useState(null)
  const [saving,      setSaving]      = useState({}) // { [id]: bool }
  const [toast,       setToast]       = useState(null)
  const [viewMode,    setViewMode]    = useState('actuals')  // 'actuals' | 'budget' | 'patron' | 'cashflow' | 'audit'
  const [editModal,   setEditModal]   = useState(null)       // { mode, row }

  // Column filters (actuals)
  const [deptFilter,   setDeptFilter]   = useState(new Set())  // dept IDs
  const [catFilter,    setCatFilter]    = useState(new Set())  // category strings
  const [acctFilter,   setAcctFilter]   = useState(new Set())  // account IDs
  const [grantFilter,  setGrantFilter]  = useState(new Set())  // grant IDs or 'none'
  const [amtMin,       setAmtMin]       = useState('')
  const [amtMax,       setAmtMax]       = useState('')
  const [vendorFilter, setVendorFilter] = useState(new Set())  // multiselect Set

  // Budget filters
  const [budgetDeptFilter,     setBudgetDeptFilter]     = useState(new Set())
  const [budgetCatFilter,      setBudgetCatFilter]      = useState(new Set())
  const [budgetScenarioFilter, setBudgetScenarioFilter] = useState(new Set())
  const [budgetStartPeriod,    setBudgetStartPeriod]    = useState(defStart.substring(0, 7))
  const [budgetEndPeriod,      setBudgetEndPeriod]      = useState(defEnd.substring(0, 7))
  const [budgetPage,           setBudgetPage]           = useState(1)
  const [budgetSortCol,        setBudgetSortCol]        = useState('period')
  const [budgetSortDir,        setBudgetSortDir]        = useState('asc')

  // Sort (actuals)
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
  }

  function activeFilterCount() {
    return (deptFilter.size > 0 ? 1 : 0) + (catFilter.size > 0 ? 1 : 0) +
           (acctFilter.size > 0 ? 1 : 0) + (grantFilter.size > 0 ? 1 : 0) +
           (amtMin !== '' ? 1 : 0) + (amtMax !== '' ? 1 : 0) +
           (vendorFilter.size > 0 ? 1 : 0)
  }
  function clearAllFilters() {
    setDeptFilter(new Set()); setCatFilter(new Set()); setAcctFilter(new Set())
    setGrantFilter(new Set()); setAmtMin(''); setAmtMax(''); setVendorFilter(new Set())
    setSearch('')
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Load registries ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('departments').select('*').eq('org_id', ORG_ID).eq('deleted', false).order('dept_code'),
      supabase.from('chart_of_accounts').select('*').eq('org_id', ORG_ID).eq('deleted', false).order('account_code'),
      supabase.from('grants').select('*').eq('org_id', ORG_ID).eq('deleted', false).order('grant_code'),
      supabase.from('teams').select('id, team_name').eq('org_id', ORG_ID).eq('deleted', false).order('team_name'),
    ]).then(([{ data: d, error: dErr }, { data: a, error: aErr }, { data: g, error: gErr }, { data: t, error: tErr }]) => {
      if (dErr || aErr || gErr || tErr) {
        setRegError('Failed to load required data — please refresh and try again')
        return
      }
      setDepartments(d || [])
      setAccounts(a || [])
      setGrants(g || [])
      setTeams(t || [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load edited IDs ─────────────────────────────────────────────────────────
  const loadEditedIds = useCallback(async () => {
    const { data } = await supabase
      .from('edit_log')
      .select('record_id')
      .eq('table_name', 'transactions')
      .eq('org_id', ORG_ID)
    if (data) setEditedIds(new Set(data.map(r => r.record_id)))
  }, [])

  useEffect(() => { loadEditedIds() }, [loadEditedIds])

  // ── Load transactions ───────────────────────────────────────────────────────
  const loadRows = useCallback(async (pg = 0) => {
    setLoading(true)
    setError(null)
    const from = pg * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    const { data, count, error: err } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('org_id', ORG_ID)
      .eq('deleted', false)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .range(from, to)

    if (err) { setError(err.message); setLoading(false); return }
    setRows(data || [])
    setTotalCount(count || 0)
    setPage(pg)
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { loadRows(0) }, [loadRows])

  // ── Load deleted ────────────────────────────────────────────────────────────
  const loadDeleted = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('deleted', true)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('updated_at', { ascending: false })
      .limit(100)
    setDeletedRows(data || [])
  }, [startDate, endDate])

  useEffect(() => { if (showDeleted) loadDeleted() }, [showDeleted, loadDeleted])

  // ── Enriched rows (client-side join) ────────────────────────────────────────
  const enriched = useMemo(() => rows.map(r => {
    const _warnings = []
    if (r.account_id && !acctMap.has(r.account_id)) _warnings.push('no_account')
    if (r.department_id && !deptMap.has(r.department_id)) _warnings.push('no_dept')
    else if (r.department_id && deptMap.has(r.department_id) && !deptMap.get(r.department_id)?.team_id) _warnings.push('no_team')
    return {
      ...r,
      dept_name:    deptMap.get(r.department_id)?.dept_name    || '',
      dept_code:    deptMap.get(r.department_id)?.dept_code    || '',
      account_name: acctMap.get(r.account_id)?.account_name   || '',
      account_code: acctMap.get(r.account_id)?.account_code   || '',
      category:     acctMap.get(r.account_id)?.category        || '',
      record_type:  acctMap.get(r.account_id)?.record_type     || '',
      grant_name:   grantMap.get(r.grant_id)?.grant_name       || '',
      _warnings,
    }
  }), [rows, deptMap, acctMap, grantMap])

  // ── Client-side filters + sort ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = enriched
    if (recordType !== 'all') result = result.filter(r => r.record_type === recordType)
    const q = search.trim().toLowerCase()
    if (q) result = result.filter(r =>
      [r.vendor, r.description, r.account_name, r.dept_name, r.category, r.grant_name, r.account_code, r.dept_code]
        .some(v => String(v || '').toLowerCase().includes(q))
    )
    if (deptFilter.size > 0)  result = result.filter(r => deptFilter.has(r.department_id))
    if (catFilter.size > 0)   result = result.filter(r => catFilter.has(r.category))
    if (acctFilter.size > 0)  result = result.filter(r => acctFilter.has(r.account_id))
    if (grantFilter.size > 0) result = result.filter(r => {
      if (grantFilter.has('none')) return !r.grant_id || grantFilter.has(r.grant_id)
      return grantFilter.has(r.grant_id)
    })
    if (vendorFilter.size > 0) result = result.filter(r => vendorFilter.has(r.vendor || ''))
    if (amtMin !== '') result = result.filter(r => Math.abs(r.amount || 0) >= parseFloat(amtMin))
    if (amtMax !== '') result = result.filter(r => Math.abs(r.amount || 0) <= parseFloat(amtMax))

    // Sort
    result = [...result].sort((a, b) => {
      let av, bv
      if (sortCol === 'date')   { av = a.date; bv = b.date; return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (sortCol === 'vendor') { av = (a.vendor||''); bv = (b.vendor||''); return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (sortCol === 'dept')   { av = (a.dept_name||''); bv = (b.dept_name||''); return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (sortCol === 'cat')    { av = (a.category||''); bv = (b.category||''); return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (sortCol === 'acct')   { av = (a.account_name||''); bv = (b.account_name||''); return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av) }
      if (sortCol === 'amount') { av = Math.abs(a.amount||0); bv = Math.abs(b.amount||0); return sortDir==='asc'?av-bv:bv-av }
      return 0
    })
    return result
  }, [enriched, search, recordType, deptFilter, catFilter, acctFilter, grantFilter, vendorFilter, amtMin, amtMax, sortCol, sortDir])

  // ── Dynamic cascade options — each shows only values present after all OTHER filters ──
  const fs = { search, recordType, deptFilter, catFilter, acctFilter, grantFilter, vendorFilter, amtMin, amtMax }

  const dynamicDeptGroups = useMemo(() => {
    const pool = applyActualsFilters(enriched, 'dept', fs)
    const teamMapping = new Map(teams.map(t => [t.id, t.team_name]))
    const byTeam = {}
    const seen = new Set()
    for (const r of pool) {
      if (!r.department_id || seen.has(r.department_id)) continue
      seen.add(r.department_id)
      const dept = deptMap.get(r.department_id)
      const tName = dept ? (teamMapping.get(dept.team_id) || 'Unassigned') : 'Unassigned'
      if (!byTeam[tName]) byTeam[tName] = []
      byTeam[tName].push({ value: r.department_id, label: r.dept_name || r.dept_code || r.department_id })
    }
    return Object.entries(byTeam).sort(([a],[b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items: items.sort((a,b) => a.label.localeCompare(b.label)) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, recordType, catFilter, acctFilter, grantFilter, vendorFilter, amtMin, amtMax, teams, deptMap])

  const dynamicCatOptions = useMemo(() => {
    const pool = applyActualsFilters(enriched, 'cat', fs)
    const seen = new Set()
    for (const r of pool) if (r.category) seen.add(r.category)
    return [...seen].sort().map(c => ({ value: c, label: c }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, recordType, deptFilter, acctFilter, grantFilter, vendorFilter, amtMin, amtMax])

  const dynamicAcctOptions = useMemo(() => {
    const pool = applyActualsFilters(enriched, 'acct', fs)
    const seen = new Map()
    for (const r of pool) if (r.account_id && !seen.has(r.account_id)) seen.set(r.account_id, r.account_name || r.account_code || r.account_id)
    return [...seen.entries()].sort(([,a],[,b]) => a.localeCompare(b)).map(([id, label]) => ({ value: id, label }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, recordType, deptFilter, catFilter, grantFilter, vendorFilter, amtMin, amtMax])

  const dynamicVendorOptions = useMemo(() => {
    const pool = applyActualsFilters(enriched, 'vendor', fs)
    const seen = new Set()
    for (const r of pool) if (r.vendor) seen.add(r.vendor)
    return [...seen].sort().map(v => ({ value: v, label: v }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, recordType, deptFilter, catFilter, acctFilter, grantFilter, amtMin, amtMax])

  const dynamicGrantOptions = useMemo(() => {
    const pool = applyActualsFilters(enriched, 'grant', fs)
    const seen = new Map()
    for (const r of pool) if (r.grant_id) seen.set(r.grant_id, r.grant_name || r.grant_id)
    const hasNone = pool.some(r => !r.grant_id)
    const opts = hasNone ? [{ value: 'none', label: 'No grant (N/A)' }] : []
    for (const [id, label] of [...seen.entries()].sort(([,a],[,b]) => a.localeCompare(b))) opts.push({ value: id, label })
    return opts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, recordType, deptFilter, catFilter, acctFilter, vendorFilter, amtMin, amtMax])

  // Base amounts for histogram — all filters except amount applied
  const baseAmounts = useMemo(() =>
    applyActualsFilters(enriched, 'amount', fs).map(r => Math.abs(r.amount || 0))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [enriched, search, recordType, deptFilter, catFilter, acctFilter, grantFilter, vendorFilter])

  // Unresolved warning map — aggregate across all filtered rows
  const unresolvedMap = useMemo(() => {
    const map = {}
    for (const r of filtered) {
      for (const w of (r._warnings || [])) {
        if (!map[w]) map[w] = { actual: 0, count: 0 }
        map[w].actual += Math.abs(r.amount || 0)
        map[w].count++
      }
    }
    return map
  }, [filtered])

  // ── Budget filter state and filtered rows ───────────────────────────────────
  const budgetFilterState = { budgetDeptFilter, budgetCatFilter, budgetScenarioFilter, budgetStartPeriod, budgetEndPeriod }

  const filteredBudget = useMemo(() => {
    let rows = applyBudgetFilters(budgetFlat || [], null, budgetFilterState)
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
  }, [budgetFlat, budgetDeptFilter, budgetCatFilter, budgetScenarioFilter, budgetStartPeriod, budgetEndPeriod, budgetSortCol, budgetSortDir])

  const filteredBudgetTotal = useMemo(() => filteredBudget.reduce((s, b) => s + (b.amount||0), 0), [filteredBudget])

  // Budget cascade options
  const budgetDeptOptions = useMemo(() => {
    const pool = applyBudgetFilters(budgetFlat || [], 'dept', budgetFilterState)
    const seen = new Set()
    for (const b of pool) { const n = b.dept_name || b.department; if (n) seen.add(n) }
    return [...seen].sort().map(n => ({ value: n, label: n }))
  }, [budgetFlat, budgetCatFilter, budgetScenarioFilter, budgetStartPeriod, budgetEndPeriod])

  const budgetCatOptions = useMemo(() => {
    const pool = applyBudgetFilters(budgetFlat || [], 'cat', budgetFilterState)
    const seen = new Set()
    for (const b of pool) if (b.category) seen.add(b.category)
    return [...seen].sort().map(c => ({ value: c, label: c }))
  }, [budgetFlat, budgetDeptFilter, budgetScenarioFilter, budgetStartPeriod, budgetEndPeriod])

  const budgetScenarioOptions = useMemo(() => {
    const pool = applyBudgetFilters(budgetFlat || [], 'scenario', budgetFilterState)
    const seen = new Set()
    for (const b of pool) if (b.scenario) seen.add(b.scenario)
    return [...seen].sort().map(s => ({ value: s, label: s }))
  }, [budgetFlat, budgetDeptFilter, budgetCatFilter, budgetStartPeriod, budgetEndPeriod])

  const BUDGET_PAGE_SIZE = 100
  const budgetTotalPages = Math.max(1, Math.ceil(filteredBudget.length / BUDGET_PAGE_SIZE))
  const budgetPageRows   = filteredBudget.slice((budgetPage - 1) * BUDGET_PAGE_SIZE, budgetPage * BUDGET_PAGE_SIZE)

  // Running total of filtered rows
  const filteredTotal = useMemo(() => filtered.reduce((s,r) => s + Math.abs(r.amount||0), 0), [filtered])

  // Period-filtered patron / cashflow (reuse budget period range)
  const filteredPatron = useMemo(() => {
    let r = patronData || []
    if (budgetStartPeriod) r = r.filter(p => p.period >= budgetStartPeriod)
    if (budgetEndPeriod)   r = r.filter(p => p.period <= budgetEndPeriod)
    return [...r].sort((a, b) => b.period.localeCompare(a.period))
  }, [patronData, budgetStartPeriod, budgetEndPeriod])

  const filteredCashFlow = useMemo(() => {
    let r = cashFlowData || []
    if (budgetStartPeriod) r = r.filter(c => c.period >= budgetStartPeriod)
    if (budgetEndPeriod)   r = r.filter(c => c.period <= budgetEndPeriod)
    return [...r].sort((a, b) => b.period.localeCompare(a.period))
  }, [cashFlowData, budgetStartPeriod, budgetEndPeriod])

  // ── Edit handler ─────────────────────────────────────────────────────────────
  async function handleEdit(row, field, newVal) {
    const original = { ...row }
    let changes = {}
    let logField = field
    let logOld, logNew

    // Special handling for FK fields — store codes in edit_log, IDs in DB
    if (field === 'department_id') {
      changes = { department_id: newVal || null }
      const oldDept = deptMap.get(original.department_id)
      const newDept = deptMap.get(newVal)
      logField = 'department'
      logOld = oldDept?.dept_code || original.dept_code || null
      logNew = newDept?.dept_code || null
    } else if (field === 'account_id') {
      changes = { account_id: newVal || null }
      const oldAcct = acctMap.get(original.account_id)
      const newAcct = acctMap.get(newVal)
      logField = 'account'
      logOld = oldAcct?.account_code || null
      logNew = newAcct?.account_code || null
    } else if (field === 'grant_id') {
      changes = { grant_id: newVal || null }
      const oldGrant = grantMap.get(original.grant_id)
      const newGrant = grantMap.get(newVal)
      logField = 'grant'
      logOld = oldGrant?.grant_code || null
      logNew = newGrant?.grant_code || null
    } else if (field === 'date') {
      changes = { date: newVal, fiscal_period: newVal.slice(0, 7) }
      logOld = original.date
      logNew = newVal
    } else {
      changes = { [field]: newVal }
      logOld = original[field] != null ? String(original[field]) : null
      logNew = newVal != null ? String(newVal) : null
    }

    if (JSON.stringify(logOld) === JSON.stringify(logNew)) return

    setSaving(p => ({ ...p, [row.id]: true }))

    // Update transactions row
    const { error: err } = await supabase
      .from('transactions')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('org_id', ORG_ID)

    if (err) {
      setSaving(p => ({ ...p, [row.id]: false }))
      showToast('Save failed: ' + err.message, 'error')
      return
    }

    // Write edit_log entry
    await supabase.from('edit_log').insert([{
      org_id:     ORG_ID,
      table_name: 'transactions',
      record_id:  row.id,
      field:      logField,
      old_value:  logOld != null ? String(logOld) : null,
      new_value:  logNew != null ? String(logNew) : null,
      edited_by:  'system',
    }])

    setSaving(p => ({ ...p, [row.id]: false }))
    setEditedIds(p => new Set([...p, row.id]))

    // Optimistic update in local rows
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...changes } : r))
  }

  // ── Delete / restore ────────────────────────────────────────────────────────
  async function handleDelete(row) {
    const label = row.vendor || row.description || formatDate(row.date)
    if (!confirm(`Archive this transaction ("${label}", ${formatCurrency(row.amount)})?\nIt will be hidden but can be restored.`)) return
    const { error: err } = await dbSoftDelete('transactions', row.id)
    if (err) { showToast('Delete failed: ' + err.message, 'error'); return }
    showToast('Transaction archived')
    setRows(prev => prev.filter(r => r.id !== row.id))
    setTotalCount(p => p - 1)
    if (showDeleted) loadDeleted()
  }

  // ── Budget inline edit / delete ─────────────────────────────────────────────
  async function handleBudgetFieldEdit(row, field, newVal) {
    const changes = { [field]: newVal }
    const { error: err } = await dbUpdate('budgets', row.id, changes, row)
    if (err) { showToast('Save failed: ' + err.message, 'error'); return }
    updateBudgetRow(row.id, changes, row)
    showToast('Budget line updated')
  }

  async function handleBudgetDelete(row) {
    const label = `${row.category || '—'} · ${row.period || '—'}`
    if (!confirm(`Delete this budget line (${label}, ${formatCurrency(row.amount)})?\nIt will be soft-deleted and hidden.`)) return
    await deleteBudgetRow(row.id)
    showToast('Budget line deleted')
  }

  // ── Patron inline edit / delete ──────────────────────────────────────────────
  async function handlePatronFieldEdit(row, field, newVal) {
    const changes = { [field]: newVal }
    const { error: err } = await dbUpdate('patron_data', row.id, changes, row)
    if (err) { showToast('Save failed: ' + err.message, 'error'); return }
    updatePatronRow(row.id, changes, row)
    showToast('Patron data updated')
  }

  async function handlePatronDelete(row) {
    if (!confirm(`Delete patron data for ${row.period}?`)) return
    await deletePatronRow(row.id)
    showToast('Patron data deleted')
  }

  // ── Cash flow inline edit / delete ────────────────────────────────────────────
  async function handleCashFlowFieldEdit(row, field, newVal) {
    const changes = { [field]: newVal }
    const { error: err } = await dbUpdate('cash_flow', row.id, changes, row)
    if (err) { showToast('Save failed: ' + err.message, 'error'); return }
    updateCashFlowRow(row.id, changes, row)
    showToast('Cash flow updated')
  }

  async function handleCashFlowDelete(row) {
    if (!confirm(`Delete cash flow data for ${row.period}?`)) return
    await deleteCashFlowRow(row.id)
    showToast('Cash flow deleted')
  }

  async function handleRestore(row) {
    const { error: err } = await supabase
      .from('transactions')
      .update({ deleted: false, updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('org_id', ORG_ID)
    if (err) { showToast('Restore failed: ' + err.message, 'error'); return }
    showToast('Transaction restored')
    setDeletedRows(prev => prev.filter(r => r.id !== row.id))
    loadRows(page)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  function handleExport() {
    if (viewMode === 'budget') {
      downloadCSV(`budget-${budgetStartPeriod}-to-${budgetEndPeriod}.csv`, filteredBudget, [
        { key: 'period',      label: 'period'      },
        { key: 'department',  label: 'department'  },
        { key: 'category',    label: 'category'    },
        { key: 'scenario',    label: 'scenario'    },
        { key: 'amount',      label: 'amount'      },
        { key: 'period_type', label: 'period_type' },
      ])
      return
    }
    downloadCSV(`transactions-${startDate}-to-${endDate}.csv`, filtered, [
      { key: 'date',         label: 'date'         },
      { key: 'fiscal_period',label: 'fiscal_period' },
      { key: 'amount',       label: 'amount'        },
      { key: 'dept_code',    label: 'dept_code'     },
      { key: 'dept_name',    label: 'dept_name'     },
      { key: 'account_code', label: 'account_code'  },
      { key: 'account_name', label: 'account_name'  },
      { key: 'category',     label: 'category'      },
      { key: 'record_type',  label: 'record_type'   },
      { key: 'vendor',       label: 'vendor'        },
      { key: 'grant_name',   label: 'grant_name'    },
      { key: 'description',  label: 'description'   },
      { key: 'source',       label: 'source'        },
    ])
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <>
    <div className="flex flex-col min-h-0 flex-1">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {toast.type === 'error' ? <AlertTriangle size={14}/> : <Check size={14}/>}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100"><X size={12}/></button>
        </div>
      )}

      {/* Registry load error */}
      {regError && (
        <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <AlertTriangle size={14} className="shrink-0"/>
          {regError}
        </div>
      )}

      {/* History panel */}
      {historyId && <HistoryPanel txId={historyId} onClose={() => setHistoryId(null)}/>}

      {/* ── Toolbar row 1: date range + quick presets + type toggle + view toggle + actions ── */}
      <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-b border-gray-100 bg-gray-50">
        {viewMode === 'actuals' ? (
          <>
            {/* Date pickers */}
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            {/* Quick presets */}
            {quickPresets().map(p => (
              <button key={p.label} onClick={() => { setStartDate(p.start); setEndDate(p.end) }}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-white hover:border-gray-400 transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
            <div className="w-px h-5 bg-gray-200"/>
            {/* Record type */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['all','All'],['expense','Expense'],['income','Income']].map(([val, lbl]) => (
                <button key={val} onClick={() => setRecordType(val)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${recordType === val ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </>
        ) : viewMode !== 'audit' ? (
          /* Period range for budget / patron / cashflow */
          <>
            <input type="month" value={budgetStartPeriod}
              onChange={e => { setBudgetStartPeriod(e.target.value); setBudgetPage(1) }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            <span className="text-xs text-gray-400">to</span>
            <input type="month" value={budgetEndPeriod}
              onChange={e => { setBudgetEndPeriod(e.target.value); setBudgetPage(1) }}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            {monthPresets().map(p => (
              <button key={p.label}
                onClick={() => { setBudgetStartPeriod(p.start); setBudgetEndPeriod(p.end); setBudgetPage(1) }}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-white hover:border-gray-400 transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </>
        ) : null}

        {/* Tab toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-0.5 flex-shrink-0">
          {[['actuals','Actuals'],['budget','Budget'],['patron','Patron'],['cashflow','Cash Flow'],['audit','Audit Log']].map(([id, lbl]) => (
            <button key={id} onClick={() => setViewMode(id)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                viewMode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1"/>
        {/* Deleted toggle — actuals only */}
        {viewMode === 'actuals' && (
          <button onClick={() => setShowDeleted(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${showDeleted ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {showDeleted ? <EyeOff size={12}/> : <Eye size={12}/>}
            Deleted ({deletedRows.length || '?'})
          </button>
        )}
        {/* Export — actuals and budget */}
        {(viewMode === 'actuals' || viewMode === 'budget') && (
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={12}/> Export
          </button>
        )}
        {/* Add — all data tabs */}
        {viewMode !== 'audit' && (
          <button
            onClick={() => {
              if (viewMode === 'actuals') setShowAdd(p => !p)
              else setEditModal({ mode: viewMode, row: null })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            <Plus size={12}/> Add
          </button>
        )}
      </div>

      {/* ── Toolbar row 2: filters ── */}
      {viewMode === 'actuals' && (
      <div className="flex items-center gap-2 flex-wrap px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        <div className="relative min-w-[180px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"/>
        </div>
        <MultiCheckFilter label="Vendor" selected={vendorFilter}
          options={dynamicVendorOptions}
          onToggle={v => setVendorFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n })}
          onClear={() => setVendorFilter(new Set())}/>
        <MultiCheckFilter label="Department" selected={deptFilter}
          options={dynamicDeptGroups.flatMap(g => g.items)}
          groups={dynamicDeptGroups.length > 0 ? dynamicDeptGroups : null}
          onToggle={id => setDeptFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
          onClear={() => setDeptFilter(new Set())}/>
        <MultiCheckFilter label="Category" selected={catFilter}
          options={dynamicCatOptions}
          onToggle={c => setCatFilter(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })}
          onClear={() => setCatFilter(new Set())}/>
        <MultiCheckFilter label="Account" selected={acctFilter}
          options={dynamicAcctOptions}
          onToggle={id => setAcctFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
          onClear={() => setAcctFilter(new Set())}/>
        <MultiCheckFilter label="Grant" selected={grantFilter}
          options={dynamicGrantOptions}
          onToggle={id => setGrantFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
          onClear={() => setGrantFilter(new Set())}/>
        <AmountRangeFilter amtMin={amtMin} amtMax={amtMax}
          onMin={setAmtMin} onMax={setAmtMax}
          onClear={() => { setAmtMin(''); setAmtMax('') }}
          baseAmounts={baseAmounts}/>
        {activeFilterCount() > 0 && (
          <>
            <span className="text-[10px] font-bold bg-gray-900 text-white px-2 py-0.5 rounded-full">
              {activeFilterCount()} filter{activeFilterCount() !== 1 ? 's' : ''}
            </span>
            <button onClick={clearAllFilters} className="text-xs text-red-600 hover:underline font-medium">Clear all</button>
          </>
        )}
      </div>
      )}
      {viewMode === 'budget' && (
      <div className="flex items-center gap-2 flex-wrap px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        <MultiCheckFilter label="Department" selected={budgetDeptFilter}
          options={budgetDeptOptions}
          onToggle={v => { setBudgetDeptFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setBudgetPage(1) }}
          onClear={() => { setBudgetDeptFilter(new Set()); setBudgetPage(1) }}/>
        <MultiCheckFilter label="Category" selected={budgetCatFilter}
          options={budgetCatOptions}
          onToggle={v => { setBudgetCatFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setBudgetPage(1) }}
          onClear={() => { setBudgetCatFilter(new Set()); setBudgetPage(1) }}/>
        <MultiCheckFilter label="Scenario" selected={budgetScenarioFilter}
          options={budgetScenarioOptions}
          onToggle={v => { setBudgetScenarioFilter(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n }); setBudgetPage(1) }}
          onClear={() => { setBudgetScenarioFilter(new Set()); setBudgetPage(1) }}/>
        {(budgetDeptFilter.size + budgetCatFilter.size + budgetScenarioFilter.size) > 0 && (
          <>
            <span className="text-[10px] font-bold bg-gray-900 text-white px-2 py-0.5 rounded-full">
              {budgetDeptFilter.size + budgetCatFilter.size + budgetScenarioFilter.size} filter{(budgetDeptFilter.size + budgetCatFilter.size + budgetScenarioFilter.size) !== 1 ? 's' : ''}
            </span>
            <button onClick={() => { setBudgetDeptFilter(new Set()); setBudgetCatFilter(new Set()); setBudgetScenarioFilter(new Set()); setBudgetPage(1) }}
              className="text-xs text-red-600 hover:underline font-medium">Clear all</button>
          </>
        )}
      </div>
      )}
      {(viewMode === 'patron' || viewMode === 'cashflow') && (
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        <span className="text-xs text-gray-400">
          {viewMode === 'patron'
            ? `${filteredPatron.length} of ${(patronData || []).length} record${(patronData || []).length !== 1 ? 's' : ''}`
            : `${filteredCashFlow.length} of ${(cashFlowData || []).length} record${(cashFlowData || []).length !== 1 ? 's' : ''}`}
        </span>
      </div>
      )}

      {/* ── Add form ── */}
      {showAdd && (
        <div className="px-6 pt-4">
          <AddTransactionForm
            departments={departments}
            accounts={accounts}
            grants={grants}
            onAdd={() => { setShowAdd(false); loadRows(0); showToast('Transaction added') }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {/* Stats bar */}
        {viewMode !== 'audit' && (
        <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-400">
          {viewMode === 'actuals' && (
            <>
              <span className="font-medium text-gray-600">{filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''}</span>
              {filtered.length < totalCount && <span className="text-gray-400">of {totalCount.toLocaleString()} in range</span>}
              <span className="font-semibold text-gray-700">{formatCurrency(filteredTotal)}</span>
              <span className="flex-1"/>
              <span>{totalPages > 1 && `Page ${page + 1} of ${totalPages}`}</span>
            </>
          )}
          {viewMode === 'budget' && (
            <>
              <span className="font-medium text-gray-600">{filteredBudget.length.toLocaleString()} budget line{filteredBudget.length !== 1 ? 's' : ''}</span>
              <span className="font-semibold text-gray-700">{formatCurrency(filteredBudgetTotal)} total budgeted</span>
              <span className="flex-1"/>
              <span>{budgetTotalPages > 1 && `Page ${budgetPage} of ${budgetTotalPages}`}</span>
            </>
          )}
          {viewMode === 'patron' && (
            <>
              <span className="font-medium text-gray-600">{filteredPatron.length.toLocaleString()} patron record{filteredPatron.length !== 1 ? 's' : ''}</span>
              <span className="font-semibold text-gray-700">
                {formatCurrency(filteredPatron.reduce((s, r) => s + (r.recurring_giving_total || 0) + (r.spontaneous_giving_total || 0), 0))} total giving
              </span>
            </>
          )}
          {viewMode === 'cashflow' && (
            <>
              <span className="font-medium text-gray-600">{filteredCashFlow.length.toLocaleString()} cash flow record{filteredCashFlow.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
        )}

        {/* ── Actuals table ── */}
        {viewMode === 'actuals' && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <Loader2 size={20} className="animate-spin"/> Loading transactions…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-6 py-4 text-sm text-red-600 bg-red-50">
                <AlertTriangle size={14}/> {error}
              </div>
            )}

            {!loading && !error && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  {(() => {
                    function SH({ col, right, className: cls, children }) {
                      const active = sortCol === col
                      return (
                        <th onClick={() => toggleSort(col)}
                          className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none
                            ${right ? 'text-right' : 'text-left'} ${active ? 'text-gray-900 bg-gray-100' : 'text-gray-400 hover:text-gray-600'} ${cls||''}`}>
                          <span className={`inline-flex items-center gap-1 ${right?'justify-end':''}`}>
                            {children}
                            {active ? (sortDir==='asc'?<ArrowUp size={8}/>:<ArrowDown size={8}/>) : <ArrowUpDown size={8} className="opacity-30"/>}
                          </span>
                        </th>
                      )
                    }
                    return (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <SH col="date">Date</SH>
                        <SH col="acct">Account</SH>
                        <SH col="cat">Category</SH>
                        <SH col="dept">Department</SH>
                        <SH col="vendor">Vendor</SH>
                        <SH col="amount" right>Amount</SH>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Description</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 w-20">Actions</th>
                      </tr>
                    )
                  })()}
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      {search || recordType !== 'all' ? 'No transactions match your filters.' : 'No transactions in this date range.'}
                    </td></tr>
                  )}

                  {filtered.map(row => {
                    const isEdited = editedIds.has(row.id)
                    const isManual = row.source === 'manual'
                    return (
                      <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group">
                        {/* Date */}
                        <td className="px-3 py-1.5">
                          <EditCell value={row.date} type="date"
                            displayValue={<span className="text-xs">{formatDate(row.date)}</span>}
                            onChange={v => handleEdit(row, 'date', v)}/>
                        </td>

                        {/* Account */}
                        <td className="px-3 py-1.5">
                          <EditCell value={row.account_id || ''}
                            displayValue={<span className="text-xs">{row.account_name || <span className="text-gray-300">—</span>}</span>}
                            type="select" options={acctOpts}
                            onChange={v => handleEdit(row, 'account_id', v || null)}/>
                        </td>

                        {/* Category (read-only — change in Chart of Accounts) */}
                        <td className="px-4 py-1.5">
                          <span className="text-xs text-gray-500">{row.category || '—'}</span>
                        </td>

                        {/* Department */}
                        <td className="px-3 py-1.5">
                          <EditCell value={row.department_id || ''}
                            displayValue={<span className="text-xs">{row.dept_name || <span className="text-gray-300">—</span>}</span>}
                            type="select" options={deptOpts}
                            onChange={v => handleEdit(row, 'department_id', v || null)}/>
                        </td>

                        {/* Vendor */}
                        <td className="px-3 py-1.5">
                          <EditCell value={row.vendor || ''} placeholder="—"
                            displayValue={<span className="text-xs">{row.vendor || <span className="text-gray-300">—</span>}</span>}
                            onChange={v => handleEdit(row, 'vendor', v)}/>
                        </td>

                        {/* Amount */}
                        <td className="px-3 py-1.5 text-right">
                          <EditCell value={row.amount} numeric
                            displayValue={
                              <span className={`text-xs font-medium tabular-nums ${row.amount < 0 ? 'text-emerald-600' : 'text-gray-800'}`}>
                                {formatCurrency(row.amount)}
                              </span>
                            }
                            onChange={v => handleEdit(row, 'amount', parseFloat(v) || 0)}/>
                        </td>

                        {/* Description */}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <EditCell value={row.description || ''} placeholder="—"
                              displayValue={<span className="text-xs text-gray-500 truncate max-w-[160px]">{row.description || <span className="text-gray-300">—</span>}</span>}
                              onChange={v => handleEdit(row, 'description', v)}/>
                            {/* Badges */}
                            {isManual && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">manual</span>
                            )}
                            {isEdited && !isManual && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">edited</span>
                            )}
                            {/* Warning chips */}
                            {(row._warnings || []).map(w => (
                              <UnresolvedChip key={w} warnType={w} />
                            ))}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {saving[row.id] && <span className="text-[10px] text-teal-500">Saving…</span>}
                            <button onClick={() => setHistoryId(row.id)} title="Change history"
                              className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg">
                              <Clock size={13}/>
                            </button>
                            <button onClick={() => handleDelete(row)} title="Archive"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination (Actuals) */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4 border-t border-gray-100">
                <button disabled={page === 0} onClick={() => loadRows(page - 1)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft size={14}/>
                </button>
                <span className="text-xs text-gray-500">Page {page + 1} of {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => loadRows(page + 1)}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronRight size={14}/>
                </button>
              </div>
            )}

            {/* Unresolved warnings summary */}
            {!loading && Object.keys(unresolvedMap).length > 0 && (
              <div className="px-4 pb-4 pt-2">
                <UnresolvedSection warnMap={unresolvedMap} />
              </div>
            )}
          </>
        )}

        {/* ── Budget table ── */}
        {viewMode === 'budget' && (
          <>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {(() => {
                  function BH({ col, right, children }) {
                    const active = budgetSortCol === col
                    return (
                      <th onClick={() => { setBudgetSortCol(col); setBudgetSortDir(d => budgetSortCol === col ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); setBudgetPage(1) }}
                        className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none
                          ${right ? 'text-right' : 'text-left'} ${active ? 'text-gray-900 bg-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
                        <span className={`inline-flex items-center gap-1 ${right?'justify-end':''}`}>
                          {children}
                          {active ? (budgetSortDir==='asc'?<ArrowUp size={8}/>:<ArrowDown size={8}/>) : <ArrowUpDown size={8} className="opacity-30"/>}
                        </span>
                      </th>
                    )
                  }
                  return (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <BH col="period">Period</BH>
                      <BH col="dept">Department</BH>
                      <BH col="cat">Category</BH>
                      <BH col="scenario">Scenario</BH>
                      <BH col="amount" right>Amount</BH>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Period Type</th>
                      <th className="w-10"/>
                    </tr>
                  )
                })()}
              </thead>
              <tbody>
                {budgetPageRows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    No budget lines match your filters.
                  </td></tr>
                )}
                {budgetPageRows.map((row, i) => (
                  <tr key={row.id || i} className={`border-b border-gray-100 group ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-1 text-xs">
                      <EditCell value={row.period} type="month"
                        onChange={v => handleBudgetFieldEdit(row, 'period', v)}/>
                    </td>
                    <td className="px-3 py-1 text-xs text-gray-500">{row.dept_name || row.department || '—'}</td>
                    <td className="px-3 py-1 text-xs">
                      <EditCell value={row.category || ''} placeholder="Category"
                        onChange={v => handleBudgetFieldEdit(row, 'category', v)}/>
                    </td>
                    <td className="px-3 py-1 text-xs">
                      <EditCell value={row.scenario || ''} placeholder="Scenario"
                        onChange={v => handleBudgetFieldEdit(row, 'scenario', v)}/>
                    </td>
                    <td className="px-3 py-1 text-xs">
                      <EditCell value={row.amount ?? ''} numeric type="number"
                        displayValue={<span className="font-mono font-semibold tabular-nums">{formatCurrency(row.amount || 0)}</span>}
                        onChange={v => handleBudgetFieldEdit(row, 'amount', v)}/>
                    </td>
                    <td className="px-3 py-1 text-xs">
                      <EditCell value={row.period_type || 'monthly'} type="select"
                        options={[{value:'monthly',label:'monthly'},{value:'quarterly',label:'quarterly'},{value:'annual',label:'annual'}]}
                        onChange={v => handleBudgetFieldEdit(row, 'period_type', v)}/>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button onClick={() => handleBudgetDelete(row)} title="Delete"
                        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-100 text-red-400">
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination (Budget) */}
            {budgetTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4 border-t border-gray-100">
                <button disabled={budgetPage === 1} onClick={() => setBudgetPage(p => Math.max(1, p-1))}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft size={14}/>
                </button>
                <span className="text-xs text-gray-500">Page {budgetPage} of {budgetTotalPages}</span>
                <button disabled={budgetPage >= budgetTotalPages} onClick={() => setBudgetPage(p => Math.min(budgetTotalPages, p+1))}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronRight size={14}/>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Deleted rows ── */}
        {showDeleted && (
          <div className="border-t-2 border-red-200 mt-4">
            <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-b border-red-200">
              <EyeOff size={14} className="text-red-500"/>
              <span className="text-sm font-semibold text-red-700">Archived Transactions</span>
              <span className="text-xs text-red-500">({deletedRows.length})</span>
            </div>
            {deletedRows.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-gray-400">No archived transactions in this date range.</div>
            )}
            {deletedRows.map(row => {
              const dept  = deptMap.get(row.department_id)
              const acct  = acctMap.get(row.account_id)
              const grant = grantMap.get(row.grant_id)
              return (
                <div key={row.id} className="flex items-center gap-4 px-6 py-3 border-b border-red-100 bg-red-50/50">
                  <span className="text-xs text-gray-400 w-24">{formatDate(row.date)}</span>
                  <span className="text-xs text-gray-400 line-through w-36">{acct?.account_name || '—'}</span>
                  <span className="text-xs text-gray-400 line-through w-32">{dept?.dept_name || '—'}</span>
                  <span className="text-xs text-gray-400 line-through w-32">{row.vendor || '—'}</span>
                  <span className="text-xs text-gray-400 line-through w-24 text-right">{formatCurrency(row.amount)}</span>
                  <span className="flex-1"/>
                  <button onClick={() => handleRestore(row)}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium">
                    <RotateCcw size={12}/> Restore
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Patron Data tab ── */}
        {viewMode === 'patron' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Period','Active','New Total','New Rec.','New Spon.','Rec. Count','Rec. Giving','Spon. Giving','Avg Gift','Retention',''].map((h, i) => (
                    <th key={i} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-left whitespace-nowrap text-gray-400 ${i === 10 ? 'w-10' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPatron.length === 0 ? (
                  <tr><td colSpan={11} className="px-5 py-12 text-center text-gray-400 text-sm">No patron data in this period. Click Add or adjust the date range.</td></tr>
                ) : filteredPatron.map((row, i) => (
                  <tr key={row.id || i} className={`border-b border-gray-100 group ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.period} type="month" onChange={v => handlePatronFieldEdit(row, 'period', v)}/>
                    </td>
                    {[
                      ['total_active_patrons','integer'],['new_patrons_total','integer'],
                      ['new_patrons_recurring','integer'],['new_patrons_spontaneous','integer'],
                      ['recurring_patron_count','integer'],
                    ].map(([field]) => (
                      <td key={field} className="px-3 py-2 text-sm">
                        <EditCell value={row[field] ?? ''} numeric type="number"
                          displayValue={<span className="tabular-nums">{row[field] ?? '—'}</span>}
                          onChange={v => handlePatronFieldEdit(row, field, parseInt(v, 10))}/>
                      </td>
                    ))}
                    {['recurring_giving_total','spontaneous_giving_total','avg_gift_size'].map(field => (
                      <td key={field} className="px-3 py-2 text-sm">
                        <EditCell value={row[field] ?? ''} numeric type="number"
                          displayValue={<span className="font-mono tabular-nums">{row[field] != null ? formatCurrency(row[field]) : '—'}</span>}
                          onChange={v => handlePatronFieldEdit(row, field, parseFloat(v))}/>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.retention_rate ?? ''} numeric type="number"
                        displayValue={<span className="tabular-nums">{row.retention_rate != null ? `${(row.retention_rate*100).toFixed(1)}%` : '—'}</span>}
                        onChange={v => handlePatronFieldEdit(row, 'retention_rate', parseFloat(v))}/>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handlePatronDelete(row)} title="Delete"
                        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-100 text-red-400">
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Cash Flow tab ── */}
        {viewMode === 'cashflow' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 520 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Period','Cash Balance','Prior Month','Prior Year','Reserve Floor',''].map((h, i) => (
                    <th key={i} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-left whitespace-nowrap text-gray-400 ${i === 5 ? 'w-10' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCashFlow.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No cash flow data in this period. Click Add or adjust the date range.</td></tr>
                ) : filteredCashFlow.map((row, i) => (
                  <tr key={row.id || i} className={`border-b border-gray-100 group ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.period} type="month" onChange={v => handleCashFlowFieldEdit(row, 'period', v)}/>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.cash_balance ?? ''} type="number"
                        displayValue={<span className="font-mono tabular-nums font-semibold">{formatCurrency(row.cash_balance)}</span>}
                        onChange={v => handleCashFlowFieldEdit(row, 'cash_balance', parseFloat(v))}/>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.prior_month_balance ?? ''} type="number"
                        displayValue={<span className="font-mono tabular-nums">{row.prior_month_balance != null ? formatCurrency(row.prior_month_balance) : '—'}</span>}
                        onChange={v => handleCashFlowFieldEdit(row, 'prior_month_balance', parseFloat(v))}/>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.prior_year_balance ?? ''} type="number"
                        displayValue={<span className="font-mono tabular-nums">{row.prior_year_balance != null ? formatCurrency(row.prior_year_balance) : '—'}</span>}
                        onChange={v => handleCashFlowFieldEdit(row, 'prior_year_balance', parseFloat(v))}/>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <EditCell value={row.reserve_floor ?? ''} type="number"
                        displayValue={<span className="font-mono tabular-nums">{row.reserve_floor != null ? formatCurrency(row.reserve_floor) : <span className="text-gray-400 italic">org default</span>}</span>}
                        onChange={v => handleCashFlowFieldEdit(row, 'reserve_floor', v === '' ? null : parseFloat(v))}/>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleCashFlowDelete(row)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-6 h-6 rounded hover:bg-red-100 text-red-400">
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Audit Log tab ── */}
        {viewMode === 'audit' && <AuditLogPanel/>}

      </div>
    </div>
    {editModal && (
      <DataEditModal
        mode={editModal.mode}
        row={editModal.row}
        onClose={() => setEditModal(null)}
        onSave={async (formData, isNew) => {
          if (editModal.mode === 'budget') {
            if (isNew) await addBudgetRow(formData)
            else await updateBudgetRow(editModal.row.id, formData, editModal.row)
          } else if (editModal.mode === 'patron') {
            if (isNew) await addPatronRow(formData)
            else await updatePatronRow(editModal.row.id, formData, editModal.row)
          } else if (editModal.mode === 'cashflow') {
            if (isNew) await addCashFlowRow(formData)
            else await updateCashFlowRow(editModal.row.id, formData, editModal.row)
          }
          setEditModal(null)
        }}
        onDelete={async (id) => {
          if (editModal.mode === 'budget')        await deleteBudgetRow(id)
          else if (editModal.mode === 'patron')   await deletePatronRow(id)
          else if (editModal.mode === 'cashflow') await deleteCashFlowRow(id)
          setEditModal(null)
        }}
      />
    )}
    </>
  )
}
