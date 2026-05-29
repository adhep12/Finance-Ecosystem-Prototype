import React, { useState, useEffect, useCallback } from 'react'
import { RotateCcw, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const PAGE_SIZE = 50

const TABLE_LABELS = {
  transactions: 'Transaction',
  budgets:      'Budget',
  patron_data:  'Patron',
  cash_flow:    'Cash Flow',
}

function fmt(val) {
  if (val == null || val === '') return <span className="text-gray-400 italic">—</span>
  return String(val)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function AuditLogPanel() {
  const { orgId, updateTransaction, updateBudgetRow, updatePatronRow, updateCashFlowRow } = useApp()
  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [undoing, setUndoing] = useState(null)

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
      await load(page)
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
      {/* Stats bar — matches other tabs */}
      <div className="flex items-center gap-4 px-6 py-2 bg-white border-b border-gray-100 text-xs text-gray-400">
        <span className="font-medium text-gray-600">
          {loading ? 'Loading…' : `${total.toLocaleString()} change${total !== 1 ? 's' : ''} recorded`}
        </span>
        <span className="flex-1"/>
        <span>{totalPages > 1 && `Page ${page} of ${totalPages}`}</span>
        <button onClick={() => load(page)} className="text-teal-600 hover:underline font-medium">Refresh</button>
      </div>

      {/* Filter row — matches other tabs */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-white">
        <SlidersHorizontal size={12} className="text-gray-400 flex-shrink-0"/>
        <span className="text-xs text-gray-400">All tables · sorted newest first</span>
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
              <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group">
                <td className="px-4 py-2 font-mono text-gray-500 whitespace-nowrap text-xs">
                  {fmtDate(row.edited_at)}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                    {TABLE_LABELS[row.table_name] || row.table_name}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.field}</td>
                <td className="px-4 py-2 text-xs text-red-600 max-w-[160px] truncate">{fmt(row.old_value)}</td>
                <td className="px-4 py-2 text-xs text-emerald-700 max-w-[160px] truncate">{fmt(row.new_value)}</td>
                <td className="px-3 py-2 text-center">
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
    </div>
  )
}
