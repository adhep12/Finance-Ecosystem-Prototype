import React, { useState, useEffect, useCallback } from 'react'
import { RotateCcw, ChevronLeft, ChevronRight, SlidersHorizontal, X, ArrowRight, Clock } from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const PAGE_SIZE = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Fields that store FK UUIDs and what table/format they resolve to
const FK_FIELD_TABLE = {
  department:    'dept',
  department_id: 'dept',
  account:       'acct',
  account_id:    'acct',
  grant:         'grant',
  grant_id:      'grant',
  team_id:       'team',
}

const TABLE_LABELS = {
  transactions: 'Transaction',
  budgets:      'Budget',
  patron_data:  'Patron',
  cash_flow:    'Cash Flow',
}

// Human-readable field labels
const FIELD_LABELS = {
  date: 'Date', vendor: 'Vendor', amount: 'Amount', category: 'Category',
  department: 'Department', team_name: 'Team', record_type: 'Record Type',
  description: 'Description', grant_code: 'Grant Code', notes: 'Notes',
  period: 'Period', scenario: 'Scenario', team_code: 'Team Code',
  cash_balance: 'Cash Balance', reserve_floor: 'Reserve Floor',
  prior_month_balance: 'Prior Month Balance', prior_year_balance: 'Prior Year Balance',
  total_active_patrons: 'Total Active Patrons', new_patrons_total: 'New Patrons',
  new_patrons_recurring: 'New Recurring', recurring_patron_count: 'Recurring Count',
  recurring_giving_total: 'Recurring Giving', spontaneous_giving_total: 'Spontaneous Giving',
  avg_gift_size: 'Avg Gift Size', retention_rate: 'Retention Rate',
}

const CURRENCY_FIELDS = new Set(['amount','cash_balance','reserve_floor','prior_month_balance',
  'prior_year_balance','recurring_giving_total','spontaneous_giving_total','avg_gift_size'])

const PERCENT_FIELDS = new Set(['retention_rate'])

// Fields to show for each table type (in display order)
const TABLE_FIELDS = {
  transactions: ['date','vendor','amount','category','department','team_name','record_type','grant_code','description','notes'],
  budgets:      ['period','scenario','team_name','category','record_type','amount','notes'],
  patron_data:  ['period','total_active_patrons','new_patrons_total','new_patrons_recurring',
                 'new_patrons_spontaneous','recurring_patron_count','recurring_giving_total',
                 'spontaneous_giving_total','avg_gift_size','retention_rate'],
  cash_flow:    ['period','cash_balance','reserve_floor','prior_month_balance','prior_year_balance'],
}

function fmt(val) {
  if (val == null || val === '') return <span className="text-gray-400 italic">empty</span>
  return String(val)
}

function fmtValue(val, field) {
  if (val == null || val === '') return <span className="text-gray-400 italic">—</span>
  if (CURRENCY_FIELDS.has(field)) {
    const n = parseFloat(val)
    if (!isNaN(n)) return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (PERCENT_FIELDS.has(field)) {
    const n = parseFloat(val)
    if (!isNaN(n)) return `${(n * 100).toFixed(1)}%`
  }
  return String(val)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// Build lookup maps from raw arrays
function buildLookups(depts, accts, grants, teams) {
  const deptById  = {}
  const acctById  = {}
  const grantById = {}
  const teamById  = {}
  for (const d of (depts  || [])) deptById[d.id]  = d.dept_code ? `${d.dept_code} - ${d.dept_name || d.dept_code}` : (d.dept_name || d.id)
  for (const a of (accts  || [])) acctById[a.id]  = a.account_code ? `${a.account_code} - ${a.account_name || a.category || a.account_code}` : (a.account_name || a.category || a.id)
  for (const g of (grants || [])) grantById[g.id] = g.grant_code  ? `${g.grant_code} - ${g.grant_name || g.grant_code}` : (g.grant_name || g.id)
  for (const t of (teams  || [])) teamById[t.id]  = t.team_name || t.id
  return { deptById, acctById, grantById, teamById }
}

function makeResolver(lookups) {
  return function resolveValue(val, field) {
    if (!val || !UUID_RE.test(String(val))) return val
    const kind = FK_FIELD_TABLE[field]
    if (!kind) return val
    if (kind === 'dept')  return lookups.deptById[val]  || val
    if (kind === 'acct')  return lookups.acctById[val]  || val
    if (kind === 'grant') return lookups.grantById[val] || val
    if (kind === 'team')  return lookups.teamById[val]  || val
    return val
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function RecordDetailModal({ auditRow, orgId, onClose, onUndo, undoing, resolve }) {
  const [record,   setRecord]   = useState(null)
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const table = auditRow.table_name

      // Fetch current record state
      const { data: rec } = await supabase
        .from(table)
        .select('*')
        .eq('id', auditRow.record_id)
        .maybeSingle()

      // Fetch all audit history for this record
      const { data: hist } = await supabase
        .from('edit_log')
        .select('*')
        .eq('org_id', orgId)
        .eq('record_id', auditRow.record_id)
        .order('edited_at', { ascending: false })

      setRecord(rec)
      setHistory(hist || [])
      setLoading(false)
    }
    fetchData()
  }, [auditRow.record_id, auditRow.table_name, orgId])

  const fields = TABLE_FIELDS[auditRow.table_name] || []
  // Which fields were ever changed for this record
  const changedFields = new Set((history || []).map(h => h.field))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {TABLE_LABELS[auditRow.table_name] || auditRow.table_name}
              </span>
              {record && auditRow.table_name === 'transactions' && (
                <span className="text-sm font-semibold text-gray-800">{record.vendor || '—'}</span>
              )}
            </div>
            <p className="text-xs text-gray-400">Last edited {fmtDate(auditRow.edited_at)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16}/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : (
            <>
              {/* ── This change ── */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">This Change</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="text-xs font-semibold text-gray-600 min-w-[100px]">
                    {FIELD_LABELS[auditRow.field] || auditRow.field}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-red-600 line-through truncate">
                      {auditRow.old_value != null ? fmtValue(resolve(auditRow.old_value, auditRow.field), auditRow.field) : <span className="italic text-gray-400 no-underline" style={{textDecoration:'none'}}>empty</span>}
                    </span>
                    <ArrowRight size={12} className="text-gray-400 flex-shrink-0"/>
                    <span className="text-xs font-semibold text-emerald-700 truncate">
                      {fmtValue(resolve(auditRow.new_value, auditRow.field), auditRow.field)}
                    </span>
                  </div>
                  {auditRow.old_value != null && (
                    <button
                      onClick={() => onUndo(auditRow)}
                      disabled={undoing === auditRow.id}
                      title="Undo this change"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-white hover:bg-amber-100 text-[11px] font-semibold transition-colors disabled:opacity-40 flex-shrink-0">
                      <RotateCcw size={11}/> Undo
                    </button>
                  )}
                </div>
              </section>

              {/* ── Current record state ── */}
              {record && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Current Record</h3>
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    {fields.filter(f => record[f] != null && record[f] !== '').map((f, i) => (
                      <div key={f} className={`flex items-center px-4 py-2.5 ${i !== 0 ? 'border-t border-gray-50' : ''} ${changedFields.has(f) ? 'bg-blue-50/40' : ''}`}>
                        <div className="text-xs text-gray-500 w-36 flex-shrink-0 flex items-center gap-1.5">
                          {FIELD_LABELS[f] || f}
                          {changedFields.has(f) && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500">edited</span>
                          )}
                        </div>
                        <div className={`text-xs font-medium ${f === auditRow.field ? 'text-emerald-700' : 'text-gray-800'}`}>
                          {fmtValue(record[f], f)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Change history for this record ── */}
              {history.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Change History · {history.length} edit{history.length !== 1 ? 's' : ''}
                  </h3>
                  <div className="space-y-1.5">
                    {history.map(h => (
                      <div key={h.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs ${h.id === auditRow.id ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}>
                        <Clock size={10} className="text-gray-300 flex-shrink-0"/>
                        <span className="text-gray-400 font-mono whitespace-nowrap">{fmtDate(h.edited_at)}</span>
                        <span className="text-gray-600 font-semibold flex-shrink-0">{FIELD_LABELS[h.field] || h.field}</span>
                        <span className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-red-500 line-through truncate">{h.old_value != null ? resolve(h.old_value, h.field) : <span className="italic not-italic">—</span>}</span>
                          <ArrowRight size={10} className="text-gray-300 flex-shrink-0"/>
                          <span className="text-emerald-700 font-medium truncate">{h.new_value != null ? resolve(h.new_value, h.field) : '—'}</span>
                        </span>
                        {h.old_value != null && h.id !== auditRow.id && (
                          <button
                            onClick={() => onUndo(h)}
                            disabled={undoing === h.id}
                            className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-amber-600 transition-colors disabled:opacity-40">
                            <RotateCcw size={11}/>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Audit Log Panel
// ─────────────────────────────────────────────────────────────────────────────
export default function AuditLogPanel() {
  const { orgId, updateTransaction, updateBudgetRow, updatePatronRow, updateCashFlowRow, teams } = useApp()
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [undoing,    setUndoing]    = useState(null)
  const [detailRow,  setDetailRow]  = useState(null)
  const [lookups,    setLookups]    = useState({ deptById: {}, acctById: {}, grantById: {}, teamById: {} })

  useEffect(() => {
    async function loadLookups() {
      const [{ data: depts }, { data: accts }, { data: grants }] = await Promise.all([
        supabase.from('departments').select('id, dept_code, dept_name'),
        supabase.from('chart_of_accounts').select('id, account_code, account_name, category').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('grants').select('id, grant_code, grant_name').eq('org_id', ORG_ID).eq('deleted', false),
      ])
      setLookups(buildLookups(depts, accts, grants, teams))
    }
    loadLookups()
  }, [teams])

  const resolve = useCallback(makeResolver(lookups), [lookups])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async (p = 1) => {
    if (!orgId) return
    setLoading(true)
    const from = (p - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const { data, count, error } = await supabase
      .from('edit_log')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('edited_at', { ascending: false })
      .range(from, to)
    if (!error) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [orgId])

  useEffect(() => { load(page) }, [load, page])

  async function handleUndo(row) {
    if (!row.old_value && row.old_value !== '0') return
    setUndoing(row.id)
    try {
      const changes  = { [row.field]: coerce(row.old_value, row.field) }
      const original = { [row.field]: coerce(row.new_value, row.field) }
      if (row.table_name === 'transactions')     await updateTransaction(row.record_id, changes, original)
      else if (row.table_name === 'budgets')     await updateBudgetRow(row.record_id, changes, original)
      else if (row.table_name === 'patron_data') await updatePatronRow(row.record_id, changes, original)
      else if (row.table_name === 'cash_flow')   await updateCashFlowRow(row.record_id, changes, original)
      // Remove the original entry — dbUpdate already wrote a new reversed entry
      await supabase.from('edit_log').delete().eq('id', row.id)
      await load(page)
      setDetailRow(null)
    } catch (e) { console.error('undo error', e) }
    setUndoing(null)
  }

  function coerce(val, field) {
    if (val == null) return null
    const numericFields = ['amount','cash_balance','prior_month_balance','prior_year_balance',
      'reserve_floor','recurring_giving_total','spontaneous_giving_total','avg_gift_size','retention_rate']
    const intFields = ['total_active_patrons','new_patrons_total','new_patrons_recurring',
      'new_patrons_spontaneous','recurring_patron_count']
    if (numericFields.includes(field)) return parseFloat(val)
    if (intFields.includes(field)) return parseInt(val, 10)
    return val
  }

  if (!orgId) return null

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-400">
        <span className="font-medium text-gray-600">
          {loading ? 'Loading…' : `${total.toLocaleString()} change${total !== 1 ? 's' : ''} recorded`}
        </span>
        <span className="flex-1"/>
        <span>{totalPages > 1 && `Page ${page} of ${totalPages}`}</span>
        <button onClick={() => load(page)} className="text-teal-600 hover:underline font-medium">Refresh</button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        <span className="text-xs text-gray-400">All tables · sorted newest first · click any row to view details</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm" style={{ minWidth: 820 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200 select-none">
              {['Date / Time','Table','Field','Old Value','New Value','Undo'].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-left whitespace-nowrap text-gray-400 ${i === 5 ? 'w-16 text-center' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                  No changes recorded yet. Edits made via this page will appear here.
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.id}
                onClick={() => setDetailRow(row)}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group cursor-pointer">
                <td className="px-4 py-2 font-mono text-gray-500 whitespace-nowrap text-xs">
                  {fmtDate(row.edited_at)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                    {TABLE_LABELS[row.table_name] || row.table_name}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">
                  {FIELD_LABELS[row.field] || row.field}
                </td>
                <td className="px-4 py-2 text-xs text-red-600 max-w-[160px] truncate">{fmt(resolve(row.old_value, row.field))}</td>
                <td className="px-4 py-2 text-xs text-emerald-700 max-w-[160px] truncate">{fmt(resolve(row.new_value, row.field))}</td>
                <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                  {row.old_value != null ? (
                    <button
                      onClick={() => handleUndo(row)}
                      disabled={undoing === row.id}
                      title={`Revert ${row.field} back to "${row.old_value}"`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600 transition-colors disabled:opacity-40">
                      <RotateCcw size={11}/>
                    </button>
                  ) : (
                    <span className="text-gray-300 text-[10px]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1">
              <ChevronLeft size={14}/>
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1">
              <ChevronRight size={14}/>
            </button>
          </div>
        </div>
      )}

      {/* Record detail modal */}
      {detailRow && (
        <RecordDetailModal
          auditRow={detailRow}
          orgId={orgId}
          onClose={() => setDetailRow(null)}
          onUndo={handleUndo}
          undoing={undoing}
          resolve={resolve}
        />
      )}
    </div>
  )
}
