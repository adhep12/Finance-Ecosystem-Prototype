import React, { useState, useMemo } from 'react'
import {
  ArrowUp, ArrowDown, ChevronsUpDown, FileDown, XCircle, Search,
} from 'lucide-react'
import { useApp } from '../context/AppContext'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TX_COLS = [
  { key: 'date',        label: 'Date',       numeric: false },
  { key: 'department',  label: 'Department', numeric: false },
  { key: 'category',    label: 'Category',   numeric: false },
  { key: 'account',     label: 'Account',    numeric: false },
  { key: 'grant',       label: 'Grant',      numeric: false },
  { key: 'vendor',      label: 'Vendor',     numeric: false },
  { key: 'amount',      label: 'Amount',     numeric: true  },
]

const PAGE_SIZE = 100

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtAmt(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(n)
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

// ─────────────────────────────────────────────────────────────────────────────
// Sort icon
// ─────────────────────────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="text-gray-400 flex-shrink-0" />
  return sortDir === 'asc'
    ? <ArrowUp   size={11} className="text-teal-400 flex-shrink-0" />
    : <ArrowDown size={11} className="text-teal-400 flex-shrink-0" />
}

// ─────────────────────────────────────────────────────────────────────────────
// TransactionsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { actuals } = useApp()

  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('asc')
  const [filters, setFilters] = useState({
    date: '', department: '', category: '', account: '', grant: '', vendor: '', amount: '',
  })
  const [page, setPage] = useState(1)

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'amount' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  function setFilter(col, val) {
    setFilters(prev => ({ ...prev, [col]: val }))
    setPage(1)
  }

  function clearFilters() {
    setFilters({ date: '', department: '', category: '', account: '', grant: '', vendor: '', amount: '' })
    setPage(1)
  }

  const anyFilter = Object.values(filters).some(v => v !== '')

  const filtered = useMemo(() => {
    let rows = [...actuals]
    TX_COLS.forEach(({ key }) => {
      const f = filters[key]
      if (!f) return
      const fl = f.toLowerCase()
      rows = rows.filter(r => String(r[key] ?? '').toLowerCase().includes(fl))
    })
    rows.sort((a, b) => {
      let av = a[sortCol] ?? ''
      let bv = b[sortCol] ?? ''
      if (sortCol === 'amount') { av = Number(av); bv = Number(bv) }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 :  1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return rows
  }, [actuals, filters, sortCol, sortDir])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows    = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-1">Raw Data</div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500 mt-1">
            All imported actuals — filter and sort any column.
          </p>
        </div>
        <button
          onClick={() => {
            const headers = TX_COLS.map(c => c.key)
            downloadCSV('transactions-export.csv', [
              headers,
              ...filtered.map(r => headers.map(h => r[h] ?? '')),
            ])
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm"
        >
          <FileDown size={14} /> Export{anyFilter ? ' filtered view' : ' all'}
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700 flex-1">
            {filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''}
            {anyFilter && (
              <span className="text-gray-400 font-normal ml-1">
                of {actuals.length.toLocaleString()} total
              </span>
            )}
          </span>
          <span className="text-xs text-gray-500 tabular-nums">
            Total: <span className="font-semibold text-gray-800">{fmtAmt(totalAmount)}</span>
          </span>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle size={12} /> Clear filters
            </button>
          )}
        </div>

        {/* Spreadsheet table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 780 }}>
            {/* Column headers */}
            <thead>
              <tr className="bg-gray-900 text-white select-none">
                {TX_COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] cursor-pointer hover:bg-gray-800 transition-colors whitespace-nowrap ${
                      col.numeric ? 'text-right' : 'text-left'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.numeric ? 'flex-row-reverse' : ''}`}>
                      {col.label}
                      <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>

              {/* Filter row */}
              <tr className="bg-gray-50 border-b border-gray-200">
                {TX_COLS.map(col => (
                  <th key={col.key} className="px-2 py-1.5">
                    <div className="relative">
                      <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                      <input
                        value={filters[col.key]}
                        onChange={e => setFilter(col.key, e.target.value)}
                        placeholder="Filter…"
                        className={`w-full text-[11px] border border-gray-200 rounded-md pl-5 pr-2 py-1 focus:outline-none focus:border-teal-400 bg-white placeholder:text-gray-300 ${
                          col.numeric ? 'text-right' : 'text-left'
                        } ${filters[col.key] ? 'border-teal-400 bg-teal-50/30' : ''}`}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Rows */}
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={TX_COLS.length} className="px-5 py-12 text-center text-gray-400 text-sm">
                    {anyFilter
                      ? 'No transactions match your filters.'
                      : 'No transactions loaded yet — import actuals on the Import page.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.date || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.department || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[140px] truncate">{row.category || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.account || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.grant || '—'}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{row.vendor || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                      {fmtAmt(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Totals footer */}
            {pageRows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={TX_COLS.length - 1} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {anyFilter ? `Filtered total (${filtered.length} rows)` : `Total (${actuals.length} rows)`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 tabular-nums">
                    {fmtAmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} · rows {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}
            </span>
            <div className="flex gap-1">
              {[
                ['«', () => setPage(1),            page === 1],
                ['‹', () => setPage(p => Math.max(1, p - 1)), page === 1],
              ].map(([label, fn, disabled]) => (
                <button key={label} onClick={fn} disabled={disabled}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
                >{label}</button>
              ))}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(page - 3, totalPages - 5))
                const p = offset + i + 1
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-2.5 py-1 text-xs border rounded-lg transition-colors ${
                      p === page ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 hover:bg-gray-100'
                    }`}
                  >{p}</button>
                )
              })}
              {[
                ['›', () => setPage(p => Math.min(totalPages, p + 1)), page === totalPages],
                ['»', () => setPage(totalPages),                        page === totalPages],
              ].map(([label, fn, disabled]) => (
                <button key={label} onClick={fn} disabled={disabled}
                  className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
                >{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
