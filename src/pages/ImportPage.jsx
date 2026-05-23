import React, { useState, useRef } from 'react'
import { Upload, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { parseAmount, parseDateStr } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// CSV parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const cells = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] || '' })
    return obj
  })
  return { headers, rows }
}

// Map CSV row to actuals record — tries to handle varied column names
function mapActualsRow(row) {
  const keys = Object.keys(row)
  function find(...names) {
    for (const n of names) {
      const match = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes(n))
      if (match) return row[match]
    }
    return ''
  }
  const dateRaw   = find('date')
  const amountRaw = find('amount')
  const dept      = find('dept', 'department', 'deptcode', 'departmentcode')
  const vendor    = find('vendor', 'payee', 'merchant')
  const category  = find('category', 'cat', 'type')
  const account   = find('account', 'glaccount', 'gl')
  const grant     = find('grant', 'fund', 'grantcode')
  const desc      = find('description', 'memo', 'desc', 'note')

  return {
    date:       parseDateStr(dateRaw) || dateRaw,
    amount:     parseAmount(amountRaw),
    department: dept || '000',
    vendor:     vendor || 'Unknown',
    category:   category || 'Uncategorized',
    account:    account || '',
    grant:      grant || null,
    description:desc || '',
  }
}

// Map CSV row to budget record
function mapBudgetRow(row) {
  const keys = Object.keys(row)
  function find(...names) {
    for (const n of names) {
      const match = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes(n))
      if (match) return row[match]
    }
    return ''
  }
  const dept     = find('dept', 'department')
  const category = find('category', 'cat')
  const scenario = find('scenario', 'type', 'budget')
  const amount   = find('amount', 'monthly', 'annual')
  const date     = find('date')

  const parsed = parseAmount(amount)
  // If the amount looks annual (no month field, amount > 50K typical), convert
  // We store as monthly: if 'monthly' in header name, use as-is; if 'annual', divide by 12
  const isAnnual = keys.some(k => k.toLowerCase().includes('annual'))
  const monthlyAmount = isAnnual ? parsed / 12 : parsed

  return {
    department:    dept || '000',
    category:      category || 'Uncategorized',
    scenario:      scenario || 'Imported Budget',
    monthlyAmount: monthlyAmount,
    date:          parseDateStr(date) || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drop zone component
// ─────────────────────────────────────────────────────────────────────────────

function DropZone({ label, accept, onFile, status, preview }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFiles(files) {
    const file = files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => onFile(file.name, e.target.result)
    reader.readAsText(file)
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-teal-400 bg-teal-50'
            : status === 'success'
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-teal-300 hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {status === 'success' ? (
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
        ) : (
          <Upload size={32} className="mx-auto mb-2 text-gray-400" />
        )}
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-1">
          {status === 'success' ? 'File loaded — click to replace' : 'Click to browse or drag & drop a .csv file'}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview table
// ─────────────────────────────────────────────────────────────────────────────

function PreviewTable({ headers, rows }) {
  if (!headers.length) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 mt-3">
      <table className="text-xs w-full">
        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold">
          <tr>
            {headers.map(h => (
              <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {headers.map(h => (
                <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">{row[h]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 && (
        <div className="text-center py-2 text-xs text-gray-400 border-t border-gray-100">
          +{rows.length - 5} more rows
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Column mapping section
// ─────────────────────────────────────────────────────────────────────────────

function FieldBadge({ name, required }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
      required ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {name}
      {!required && <span className="opacity-60">optional</span>}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { importActuals, importBudget } = useApp()

  const [actualsFile, setActualsFile]   = useState(null)
  const [budgetFile,  setBudgetFile]    = useState(null)
  const [actualsData, setActualsData]   = useState(null)  // { headers, rows, mapped }
  const [budgetData,  setBudgetData]    = useState(null)
  const [actualsStatus, setActualsStatus] = useState(null) // 'success' | 'error' | null
  const [budgetStatus,  setBudgetStatus]  = useState(null)
  const [confirmMsg,  setConfirmMsg]    = useState(null)
  const [showSchemas, setShowSchemas]   = useState(false)

  function handleActualsFile(name, text) {
    const { headers, rows } = parseCSV(text)
    const mapped = rows.map(mapActualsRow)
    setActualsFile(name)
    setActualsData({ headers, rows, mapped })
    setActualsStatus('success')
  }

  function handleBudgetFile(name, text) {
    const { headers, rows } = parseCSV(text)
    const mapped = rows.map(mapBudgetRow)
    setBudgetFile(name)
    setBudgetData({ headers, rows, mapped })
    setBudgetStatus('success')
  }

  function confirmActuals() {
    if (!actualsData) return
    importActuals(actualsData.mapped)
    setConfirmMsg(`✓ Loaded ${actualsData.mapped.length} actuals transactions`)
  }

  function confirmBudget() {
    if (!budgetData) return
    importBudget(budgetData.mapped)
    setConfirmMsg(`✓ Loaded ${budgetData.mapped.length} budget rows`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload your actuals and budget CSVs to populate the dashboard
        </p>
      </div>

      {confirmMsg && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-800 font-medium">{confirmMsg}</span>
          <button onClick={() => setConfirmMsg(null)} className="ml-auto text-green-600 hover:text-green-800">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Schema reference toggle */}
      <button
        onClick={() => setShowSchemas(v => !v)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
      >
        <Info size={15} className="text-teal-500" />
        View expected column schemas
        {showSchemas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showSchemas && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-5">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Actuals CSV columns</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { name: 'date',        req: true,  note: 'M/D/YYYY or YYYY-MM-DD' },
                { name: 'amount',      req: true,  note: '$ or plain number; (negatives) ok' },
                { name: 'department',  req: true,  note: '3-digit dept code' },
                { name: 'vendor',      req: true,  note: 'Free text' },
                { name: 'category',    req: true,  note: 'Expense category' },
                { name: 'account',     req: true,  note: 'GL account code' },
                { name: 'grant',       req: false, note: 'Optional fund/grant code' },
                { name: 'description', req: false, note: 'Memo line' },
              ].map(f => (
                <span key={f.name} className="flex flex-col gap-0.5">
                  <FieldBadge name={f.name} required={f.req} />
                  <span className="text-[10px] text-gray-400 px-1">{f.note}</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Department codes are typically 3-digit (e.g. 101) but any consistent code works.
              Column names are flexible — the importer will match common variations.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-5">
            <h3 className="font-semibold text-gray-900 mb-3">Budget CSV columns</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { name: 'department', req: true,  note: 'Dept code (e.g. 101)' },
                { name: 'category',   req: true,  note: 'Matches actuals categories' },
                { name: 'scenario',   req: true,  note: 'Budget name (e.g. "Planned Spend")' },
                { name: 'amount',     req: true,  note: 'Annual or monthly dollar amount' },
                { name: 'date',       req: false, note: 'Optional — month the budget applies to' },
              ].map(f => (
                <span key={f.name} className="flex flex-col gap-0.5">
                  <FieldBadge name={f.name} required={f.req} />
                  <span className="text-[10px] text-gray-400 px-1">{f.note}</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Multiple scenarios are supported in one file (just repeat rows with a different scenario name).
              If the "amount" column header contains "annual", it will be divided by 12 automatically.
            </p>
          </div>
        </div>
      )}

      {/* Actuals upload */}
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-900">Actuals</h2>
            <p className="text-xs text-gray-500 mt-0.5">Individual transactions with dates, amounts, vendors & categories</p>
          </div>
          {actualsFile && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 size={14} className="text-green-500" />
              {actualsFile}
            </div>
          )}
        </div>

        <DropZone
          label="Upload actuals CSV"
          accept=".csv"
          onFile={handleActualsFile}
          status={actualsStatus}
        />

        {actualsData && (
          <>
            <PreviewTable headers={actualsData.headers} rows={actualsData.rows} />
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{actualsData.mapped.length}</span> rows parsed
                {actualsData.mapped.filter(r => !r.date || r.amount === 0).length > 0 && (
                  <span className="text-amber-600 ml-2">
                    · {actualsData.mapped.filter(r => !r.date || r.amount === 0).length} rows with issues
                  </span>
                )}
              </div>
              <button
                onClick={confirmActuals}
                className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Load into Dashboard
              </button>
            </div>
          </>
        )}
      </div>

      {/* Budget upload */}
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-900">Budget</h2>
            <p className="text-xs text-gray-500 mt-0.5">Budget amounts by department, category & scenario — supports multiple budget types</p>
          </div>
          {budgetFile && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 size={14} className="text-green-500" />
              {budgetFile}
            </div>
          )}
        </div>

        <DropZone
          label="Upload budget CSV"
          accept=".csv"
          onFile={handleBudgetFile}
          status={budgetStatus}
        />

        {budgetData && (
          <>
            <PreviewTable headers={budgetData.headers} rows={budgetData.rows} />
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{budgetData.mapped.length}</span> rows parsed ·{' '}
                <span className="font-semibold text-gray-700">
                  {[...new Set(budgetData.mapped.map(r => r.scenario))].length}
                </span> scenario{[...new Set(budgetData.mapped.map(r => r.scenario))].length !== 1 ? 's' : ''} detected:{' '}
                {[...new Set(budgetData.mapped.map(r => r.scenario))].join(', ')}
              </div>
              <button
                onClick={confirmBudget}
                className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Load into Dashboard
              </button>
            </div>
          </>
        )}
      </div>

      {/* Future notes */}
      <div className="bg-white rounded-2xl p-5 border border-dashed border-gray-200">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-teal-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-700 text-sm">Coming later</h3>
            <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc list-inside">
              <li>Executive summary connecting all team dashboards</li>
              <li>Forecasted giving & cash flow integration</li>
              <li>Shared import across all team pages in an org</li>
              <li>Direct accounting system integrations (QuickBooks, Sage, etc.)</li>
              <li>Automated period refresh</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
