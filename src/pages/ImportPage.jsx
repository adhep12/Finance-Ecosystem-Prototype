import React, { useState, useRef } from 'react'
import {
  Upload, CheckCircle2, X, Download, FileDown,
  AlertTriangle, Calendar,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { parseAmount, parseDateStr } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const cells = []
    let cur = '', inQuote = false
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').replace(/^"|"$/g, '') })
    return obj
  })
  return { headers, rows }
}

function findCol(row, ...names) {
  const keys = Object.keys(row)
  for (const n of names) {
    const match = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes(n))
    if (match) return row[match]
  }
  return ''
}

function mapActualsRow(row) {
  const batchRaw = findCol(row, 'batch', 'batchnumber', 'batchnum')
  return {
    date:        parseDateStr(findCol(row, 'date')) || findCol(row, 'date'),
    amount:      parseAmount(findCol(row, 'amount')),
    department:  findCol(row, 'dept', 'department') || '000',
    vendor:      findCol(row, 'vendor', 'payee', 'merchant') || 'Unknown',
    category:    findCol(row, 'category', 'cat', 'type') || 'Uncategorized',
    account:     findCol(row, 'account', 'glaccount', 'gl') || '',
    grant:       findCol(row, 'grant', 'fund') || null,
    description: findCol(row, 'description', 'memo', 'desc', 'note') || '',
    batchNumber: batchRaw || '',
  }
}

function mapBudgetRow(row) {
  const amount      = parseAmount(findCol(row, 'amount', 'monthly', 'annual'))
  const isAnnual    = Object.keys(row).some(k => k.toLowerCase().includes('annual'))
  const monthlyAmt  = isAnnual ? amount / 12 : amount
  const batchRaw    = findCol(row, 'batch', 'batchnumber', 'batchnum')
  return {
    department:    findCol(row, 'dept', 'department') || '000',
    category:      findCol(row, 'category', 'cat') || 'Uncategorized',
    scenario:      findCol(row, 'scenario', 'type', 'budget') || 'Imported Budget',
    monthlyAmount: monthlyAmt,
    date:          parseDateStr(findCol(row, 'date')) || null,
    batchNumber:   batchRaw || '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV download helpers
// ─────────────────────────────────────────────────────────────────────────────

function downloadCSV(filename, rows2d) {
  const csv = rows2d.map(r => r.map(v => (String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadActualsTemplate() {
  downloadCSV('actuals-template.csv', [
    ['date','amount','department','vendor','category','account','grant','description','batch_number'],
    ['2026-01-15','1250.00','001','Adobe Inc.','Software','6100','','Annual subscription renewal','BP-2026-001'],
    ['2026-01-20','850.50','002','Microsoft','Software','6100','','Microsoft 365 licenses','BP-2026-001'],
    ['2026-02-03','4200.00','001','Dell Technologies','Computers','6200','','Laptop purchase','BP-2026-001'],
  ])
}

function downloadBudgetTemplate() {
  downloadCSV('budget-template.csv', [
    ['department','category','scenario','amount','date','batch_number'],
    ['001','Software','Planned Spend','2000.00','2026-01','BP-2026-001'],
    ['001','Computers','Planned Spend','5000.00','2026-01','BP-2026-001'],
    ['002','Software','Planned Spend','1500.00','2026-01','BP-2026-001'],
    ['001','Software','Annual Plan','1800.00','2026-01','BP-2026-001'],
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// UI sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DropZone({ label, hint, onFile, status }) {
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
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
        dragging
          ? 'border-teal-400 bg-teal-50'
          : status === 'loaded'
          ? 'border-green-300 bg-green-50'
          : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
      }`}
    >
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => handleFiles(e.target.files)} />
      {status === 'loaded'
        ? <CheckCircle2 size={28} className="mx-auto mb-2 text-green-500" />
        : <Upload size={28} className="mx-auto mb-2 text-gray-300" />
      }
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{hint || 'or choose a file from your computer'}</p>
    </div>
  )
}

function PreviewTable({ headers, rows }) {
  if (!headers.length || !rows.length) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 mt-4">
      <table className="text-xs w-full">
        <thead className="bg-gray-50 text-gray-400 uppercase tracking-wider text-[10px] font-bold">
          <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {headers.map(h => <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[140px] truncate">{row[h]}</td>)}
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

function ModeCard({ value, selected, onSelect, title, description }) {
  return (
    <div
      onClick={onSelect}
      className={`relative flex-1 border-2 rounded-2xl p-5 cursor-pointer transition-all ${
        selected ? 'border-teal-500 bg-teal-50/40' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">MODE</div>
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          selected ? 'border-teal-500' : 'border-gray-300'
        }`}>
          {selected && <div className="w-2 h-2 rounded-full bg-teal-500" />}
        </div>
      </div>
      <div className="font-bold text-gray-900 text-base mb-1">{title}</div>
      <div className="text-xs text-gray-500 leading-relaxed">{description}</div>
    </div>
  )
}

function DateRangePicker({ startDate, endDate, onChangeStart, onChangeEnd }) {
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={13} className="text-teal-500" />
        <span className="text-xs font-semibold text-gray-700">Replace data for this period only</span>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => onChangeStart(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => onChangeEnd(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>
    </div>
  )
}

function ColumnSchema({ fields }) {
  return (
    <div className="flex flex-wrap gap-3">
      {fields.map((f, i) => (
        <div key={f.name} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{String.fromCharCode(65 + i)}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              f.req ? 'text-teal-700 bg-teal-50 border border-teal-200' : 'text-gray-500 bg-gray-100'
            }`}>
              {f.name}
              {!f.req && <span className="ml-1 opacity-60">opt</span>}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 pl-4">{f.note}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Actuals import section
// ─────────────────────────────────────────────────────────────────────────────

function ActualsSection({ onSuccess }) {
  const {
    actuals, previousActuals,
    appendActuals, replaceActuals, replaceActualsByRange,
    restorePreviousActuals,
  } = useApp()

  const [file,        setFile]        = useState(null)
  const [data,        setData]        = useState(null)   // { headers, rows, mapped }
  const [mode,        setMode]        = useState('replace') // 'append' | 'replace'
  const [rangeMode,   setRangeMode]   = useState('all')  // 'all' | 'range'
  const [startDate,   setStartDate]   = useState('')
  const [endDate,     setEndDate]     = useState('')
  const [committed,   setCommitted]   = useState(false)
  const [viewingPrev, setViewingPrev] = useState(false)

  function handleFile(name, text) {
    const { headers, rows } = parseCSV(text)
    setFile(name)
    setData({ headers, rows, mapped: rows.map(mapActualsRow) })
    setCommitted(false)
  }

  function handleCommit() {
    if (!data) return
    if (mode === 'append') {
      appendActuals(data.mapped)
    } else if (rangeMode === 'range' && startDate && endDate) {
      replaceActualsByRange(data.mapped, startDate, endDate)
    } else {
      replaceActuals(data.mapped)
    }
    setCommitted(true)
    onSuccess(`✓ ${mode === 'append' ? 'Appended' : 'Loaded'} ${data.mapped.length} actuals transactions`)
  }

  const issues = data ? data.mapped.filter(r => !r.date || r.amount === 0).length : 0
  const batches = data ? [...new Set(data.mapped.map(r => r.batchNumber).filter(Boolean))] : []

  return (
    <div className="bg-white rounded-2xl p-6 space-y-5">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">Upload transactions</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Drop a CSV to refresh actuals — same format every team uses.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
        <span className="font-semibold text-gray-700">How Actuals import works</span>
        <br />
        Upload a CSV of transactions. The file is parsed in your browser — nothing leaves the page —
        and you'll see a preview before anything commits. Your{' '}
        <strong>comments, flags, KPI picks, and budgets</strong> are always kept (they live separately)
        so toggling between original data and a new upload won't lose context.
      </div>

      {/* Mode selection */}
      <div className="flex gap-3">
        <ModeCard
          value="append"
          selected={mode === 'append'}
          onSelect={() => setMode('append')}
          title="Append"
          description="Add the uploaded rows on top of the original data. Useful for catching the dashboard up with the latest month."
        />
        <ModeCard
          value="replace"
          selected={mode === 'replace'}
          onSelect={() => setMode('replace')}
          title="Replace"
          description={'Show only the uploaded rows; hide the original data. You can flip back any time with “Restore original data” — nothing is deleted.'}
        />
      </div>

      {/* Replace sub-options */}
      {mode === 'replace' && (
        <div className="pl-2">
          <div className="flex gap-4">
            {[['all', 'Replace all data'], ['range', 'Replace data for a specific period']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="radio"
                  checked={rangeMode === v}
                  onChange={() => setRangeMode(v)}
                  className="accent-teal-500"
                />
                {l}
              </label>
            ))}
          </div>
          {rangeMode === 'range' && (
            <DateRangePicker
              startDate={startDate} endDate={endDate}
              onChangeStart={setStartDate} onChangeEnd={setEndDate}
            />
          )}
        </div>
      )}

      {/* Drop zone */}
      <DropZone
        label="Drop an actuals CSV here"
        hint={`CSV · max 50MB · expects columns: date, amount, department, vendor, category, account, grant, description, batch_number`}
        onFile={handleFile}
        status={file ? 'loaded' : null}
      />

      {/* Preview */}
      {data && (
        <>
          <PreviewTable headers={data.headers} rows={data.rows} />
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-0.5">
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{data.mapped.length}</span> rows parsed
                {issues > 0 && <span className="text-amber-600 ml-2">· {issues} rows with issues (missing date or $0)</span>}
              </div>
              {batches.length > 0 && (
                <div className="text-[10px] text-gray-400">
                  Batch{batches.length > 1 ? 'es' : ''}: <span className="font-mono">{batches.join(', ')}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleCommit}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {mode === 'append' ? 'Append to Dashboard' : 'Load into Dashboard'}
            </button>
          </div>

          {committed && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-800">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
              <span className="font-medium flex-1">Import successful.</span>
              {previousActuals && (
                <button
                  onClick={() => { restorePreviousActuals(); setCommitted(false); setData(null); setFile(null) }}
                  className="text-xs font-medium underline text-green-700 hover:text-green-900"
                >
                  Restore original data
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Previous data toggle */}
      {previousActuals && !committed && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-800 font-medium flex-1">
            You replaced actuals data. Original data is preserved.
          </span>
          <button
            onClick={restorePreviousActuals}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
          >
            Restore original
          </button>
        </div>
      )}

      {/* Column schema */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Required columns (header row, case-insensitive)</div>
        <ColumnSchema fields={[
          { name: 'date',         req: true,  note: 'YYYY-MM-DD or M/D/YYYY' },
          { name: 'amount',       req: true,  note: '$ or plain number; (parentheses) = negative' },
          { name: 'department',   req: true,  note: '3-digit dept code, e.g. 001, 014' },
          { name: 'vendor',       req: false, note: 'Free text payee name' },
          { name: 'category',     req: false, note: 'Spend category' },
          { name: 'account',      req: false, note: 'GL account' },
          { name: 'grant',        req: false, note: 'Optional grant / fund code' },
          { name: 'description',  req: false, note: 'Memo line' },
          { name: 'batch_number', req: false, note: 'Import batch ID (future: routes to team)' },
        ]} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={downloadActualsTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download size={14} /> Download blank template
        </button>
        <button
          onClick={() => downloadCSV('actuals-export.csv', [
            ['date','amount','department','vendor','category','account','grant','description','batch_number'],
            ...actuals.map(r => [r.date, r.amount, r.department, r.vendor, r.category, r.account||'', r.grant||'', r.description||'', r.batchNumber||'']),
          ])}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FileDown size={14} /> Export all transactions
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget import section
// ─────────────────────────────────────────────────────────────────────────────

function BudgetSection({ onSuccess }) {
  const {
    budgetFlat, previousBudget,
    appendBudget, replaceBudget, replaceBudgetByRange,
    restorePreviousBudget,
  } = useApp()

  const [file,      setFile]      = useState(null)
  const [data,      setData]      = useState(null)
  const [mode,      setMode]      = useState('replace')
  const [rangeMode, setRangeMode] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [committed, setCommitted] = useState(false)

  function handleFile(name, text) {
    const { headers, rows } = parseCSV(text)
    setFile(name)
    setData({ headers, rows, mapped: rows.map(mapBudgetRow) })
    setCommitted(false)
  }

  function handleCommit() {
    if (!data) return
    if (mode === 'append') {
      appendBudget(data.mapped)
    } else if (rangeMode === 'range' && startDate && endDate) {
      replaceBudgetByRange(data.mapped, startDate, endDate)
    } else {
      replaceBudget(data.mapped)
    }
    setCommitted(true)
    const scenarios = [...new Set(data.mapped.map(r => r.scenario))]
    onSuccess(`✓ ${mode === 'append' ? 'Appended' : 'Loaded'} ${data.mapped.length} budget rows — ${scenarios.length} scenario${scenarios.length !== 1 ? 's' : ''}: ${scenarios.join(', ')}`)
  }

  const scenarios = data ? [...new Set(data.mapped.map(r => r.scenario))] : []
  const batches   = data ? [...new Set(data.mapped.map(r => r.batchNumber).filter(Boolean))] : []

  return (
    <div className="bg-white rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Upload budget</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload a CSV where each row carries a scenario — amounts are summed per dept × category × scenario.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
        <span className="font-semibold text-gray-700">How Budget import works</span>
        <br />
        Upload a CSV where each row carries the <strong>scenario</strong> column — e.g. <code className="bg-gray-200 px-1 rounded">Planned Spend</code> or <code className="bg-gray-200 px-1 rounded">Annual Plan</code>.
        Amounts are summed per <em>dept × category × scenario</em>, so a monthly grain file rolls up into the annual budget the dashboard uses.
        Actuals are never affected by this import.
      </div>

      {/* Mode */}
      <div className="flex gap-3">
        <ModeCard
          value="append"
          selected={mode === 'append'}
          onSelect={() => setMode('append')}
          title="Append"
          description="Add the uploaded budget rows on top of existing budget data."
        />
        <ModeCard
          value="replace"
          selected={mode === 'replace'}
          onSelect={() => setMode('replace')}
          title="Replace"
          description="Wipes existing budget data first, then loads only what's in the file. Use for a clean reset."
        />
      </div>

      {mode === 'replace' && (
        <div className="pl-2">
          <div className="flex gap-4">
            {[['all', 'Replace all budget data'], ['range', 'Replace data for a specific period']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" checked={rangeMode === v} onChange={() => setRangeMode(v)} className="accent-teal-500" />
                {l}
              </label>
            ))}
          </div>
          {rangeMode === 'range' && (
            <DateRangePicker
              startDate={startDate} endDate={endDate}
              onChangeStart={setStartDate} onChangeEnd={setEndDate}
            />
          )}
        </div>
      )}

      <DropZone
        label="Drop a Budget CSV here"
        hint="CSV · expects columns: department, category, scenario, amount, date (optional), batch_number"
        onFile={handleFile}
        status={file ? 'loaded' : null}
      />

      {data && (
        <>
          <PreviewTable headers={data.headers} rows={data.rows} />
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-0.5">
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{data.mapped.length}</span> rows parsed ·{' '}
                <span className="font-semibold text-gray-800">{scenarios.length}</span>{' '}
                scenario{scenarios.length !== 1 ? 's' : ''}: {scenarios.join(', ')}
              </div>
              {batches.length > 0 && (
                <div className="text-[10px] text-gray-400">
                  Batch{batches.length > 1 ? 'es' : ''}: <span className="font-mono">{batches.join(', ')}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleCommit}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {mode === 'append' ? 'Append to Dashboard' : 'Load into Dashboard'}
            </button>
          </div>

          {committed && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-800">
              <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
              <span className="font-medium flex-1">Budget import successful.</span>
              {previousBudget && (
                <button
                  onClick={() => { restorePreviousBudget(); setCommitted(false); setData(null); setFile(null) }}
                  className="text-xs font-medium underline text-green-700 hover:text-green-900"
                >
                  Restore original data
                </button>
              )}
            </div>
          )}
        </>
      )}

      {previousBudget && !committed && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-800 font-medium flex-1">You replaced budget data. Original data is preserved.</span>
          <button onClick={restorePreviousBudget} className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
            Restore original
          </button>
        </div>
      )}

      {/* Column schema */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Required columns</div>
        <ColumnSchema fields={[
          { name: 'department',   req: true,  note: '3-digit dept code, e.g. 002' },
          { name: 'category',     req: true,  note: 'Same category names you use in actuals' },
          { name: 'scenario',     req: true,  note: '"Planned Spend" or "Annual Plan"' },
          { name: 'amount',       req: true,  note: 'Annual or monthly $ — same dept/cat/scenario rows get summed' },
          { name: 'date',         req: false, note: 'Optional, ignored on commit' },
          { name: 'batch_number', req: false, note: 'Import batch ID (future: routes to team)' },
        ]} />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={downloadBudgetTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download size={14} /> Download blank template
        </button>
        <button
          onClick={() => downloadCSV('budget-export.csv', [
            ['department','category','scenario','amount','date','batch_number'],
            ...budgetFlat.map(r => [r.department, r.category, r.scenario, r.monthlyAmount, r.date||'', r.batchNumber||'']),
          ])}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <FileDown size={14} /> Export all budget data
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ImportPage
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [tab,        setTab]        = useState('actuals')
  const [successMsg, setSuccessMsg] = useState(null)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-1">DATA IMPORT</div>
        <h1 className="text-2xl font-bold text-gray-900">Upload transactions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop a CSV to refresh actuals — same format every team uses.
        </p>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
          <span className="text-sm text-green-800 font-medium flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[['actuals', '• Actuals'], ['budget', '◦ Budget']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'actuals' && <ActualsSection onSuccess={msg => setSuccessMsg(msg)} />}
      {tab === 'budget'  && <BudgetSection  onSuccess={msg => setSuccessMsg(msg)} />}
    </div>
  )
}
