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
          {activeCount > 0 && (
            <button onClick={() => { onClear(); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-b border-gray-100 font-medium">
              Clear all ({activeCount})
            </button>
          )}
          {renderItems()}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AmountRangeFilter
// ─────────────────────────────────────────────────────────────────────────────

function AmountRangeFilter({ amtMin, amtMax, onMin, onMax, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const active = amtMin !== '' || amtMax !== ''
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors
          ${active ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
        Amount{active ? ' ✓' : ''}
        <ChevronDown size={10}/>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-52">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Amount Range</div>
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

  // Column filters
  const [deptFilter,  setDeptFilter]  = useState(new Set())  // dept IDs
  const [catFilter,   setCatFilter]   = useState(new Set())  // category strings
  const [acctFilter,  setAcctFilter]  = useState(new Set())  // account IDs
  const [grantFilter, setGrantFilter] = useState(new Set())  // grant IDs or 'none'
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')
  const [vendorSearch,setVendorSearch]= useState('')

  // Sort
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
           (vendorSearch ? 1 : 0)
  }
  function clearAllFilters() {
    setDeptFilter(new Set()); setCatFilter(new Set()); setAcctFilter(new Set())
    setGrantFilter(new Set()); setAmtMin(''); setAmtMax(''); setVendorSearch('')
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
    ]).then(([{ data: d }, { data: a }, { data: g }, { data: t }]) => {
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
  const enriched = useMemo(() => rows.map(r => ({
    ...r,
    dept_name:    deptMap.get(r.department_id)?.dept_name    || '',
    dept_code:    deptMap.get(r.department_id)?.dept_code    || '',
    account_name: acctMap.get(r.account_id)?.account_name   || '',
    account_code: acctMap.get(r.account_id)?.account_code   || '',
    category:     acctMap.get(r.account_id)?.category        || '',
    record_type:  acctMap.get(r.account_id)?.record_type     || '',
    grant_name:   grantMap.get(r.grant_id)?.grant_name       || '',
  })), [rows, deptMap, acctMap, grantMap])

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
    if (vendorSearch) {
      const vs = vendorSearch.toLowerCase()
      result = result.filter(r => (r.vendor || '').toLowerCase().includes(vs))
    }
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
  }, [enriched, search, recordType, deptFilter, catFilter, acctFilter, grantFilter, vendorSearch, amtMin, amtMax, sortCol, sortDir])

  // Running total of filtered rows
  const filteredTotal = useMemo(() => filtered.reduce((s,r) => s + Math.abs(r.amount||0), 0), [filtered])

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

      {/* History panel */}
      {historyId && <HistoryPanel txId={historyId} onClose={() => setHistoryId(null)}/>}

      {/* ── Toolbar row 1: date range + quick presets + type toggle + actions ── */}
      <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-b border-gray-100 bg-gray-50">
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
        <div className="flex-1"/>
        {/* Show deleted */}
        <button onClick={() => setShowDeleted(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${showDeleted ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
          {showDeleted ? <EyeOff size={12}/> : <Eye size={12}/>}
          Deleted ({deletedRows.length || '?'})
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
          <Download size={12}/> Export
        </button>
        <button onClick={() => setShowAdd(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
          <Plus size={12}/> Add
        </button>
      </div>
      {/* ── Toolbar row 2: column filters + search ── */}
      <div className="flex items-center gap-2 flex-wrap px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        {/* Search */}
        <div className="relative min-w-[180px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"/>
        </div>
        {/* Vendor search */}
        <div className="relative min-w-[140px]">
          <input value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} placeholder="Vendor…"
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"/>
        </div>
        {/* Department multiselect grouped by team */}
        {(() => {
          const teamMap = new Map(teams.map(t => [t.id, t.team_name]))
          const groups = []
          const byTeam = {}
          for (const d of departments) {
            const tName = teamMap.get(d.team_id) || 'Unassigned'
            if (!byTeam[tName]) byTeam[tName] = []
            byTeam[tName].push({ value: d.id, label: d.dept_name || d.dept_code })
          }
          for (const [tName, items] of Object.entries(byTeam)) groups.push({ label: tName, items })
          return (
            <MultiCheckFilter label="Department" selected={deptFilter}
              options={departments.map(d => ({ value: d.id, label: d.dept_name || d.dept_code }))}
              groups={groups.length > 0 ? groups : null}
              onToggle={id => setDeptFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
              onClear={() => setDeptFilter(new Set())}/>
          )
        })()}
        {/* Category */}
        {(() => {
          const cats = [...new Set(accounts.map(a => a.category).filter(Boolean))].sort()
          return (
            <MultiCheckFilter label="Category" selected={catFilter}
              options={cats.map(c => ({ value: c, label: c }))}
              onToggle={c => setCatFilter(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n })}
              onClear={() => setCatFilter(new Set())}/>
          )
        })()}
        {/* Account */}
        <MultiCheckFilter label="Account" selected={acctFilter}
          options={accounts.map(a => ({ value: a.id, label: a.account_name || a.account_code }))}
          onToggle={id => setAcctFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
          onClear={() => setAcctFilter(new Set())}/>
        {/* Grant */}
        {(() => {
          const grantOpts = [
            { value: 'none', label: 'No grant (N/A)' },
            ...grants.map(g => ({ value: g.id, label: g.grant_name || g.grant_code }))
          ]
          return (
            <MultiCheckFilter label="Grant" selected={grantFilter}
              options={grantOpts}
              onToggle={id => setGrantFilter(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })}
              onClear={() => setGrantFilter(new Set())}/>
          )
        })()}
        {/* Amount range */}
        <AmountRangeFilter amtMin={amtMin} amtMax={amtMax}
          onMin={setAmtMin} onMax={setAmtMax}
          onClear={() => { setAmtMin(''); setAmtMax('') }}/>
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
        <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-400">
          <span className="font-medium text-gray-600">{filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''}</span>
          {filtered.length < totalCount && <span className="text-gray-400">of {totalCount.toLocaleString()} in range</span>}
          <span className="font-semibold text-gray-700">{formatCurrency(filteredTotal)}</span>
          <span className="flex-1"/>
          <span>{totalPages > 1 && `Page ${page + 1} of ${totalPages}`}</span>
        </div>

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
                      <div className="flex items-center gap-1.5">
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

        {/* Pagination */}
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
      </div>
    </div>
  )
}
