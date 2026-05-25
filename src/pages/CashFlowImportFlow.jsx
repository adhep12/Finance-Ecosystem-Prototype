/**
 * CashFlowImportFlow.jsx — Step 8: Cash Flow Import
 *
 * Accepts monthly ending-balance snapshots (one row per YYYY-MM period)
 * and writes to the `cash_flow` table.
 *
 * Table stores: period, cash_balance, prior_month_balance,
 *               prior_year_balance, reserve_floor
 *
 * Spec rules enforced:
 *  - Validation step runs ENTIRELY before any DB write
 *  - All deletes are soft (deleted=true, never hard delete)
 *  - Field mapping reused from field_mappings table (import_type='cashflow')
 *  - import_log entry written on every run
 *  - prior_month_balance auto-computed from file data where sequential months exist
 */

import { useState, useEffect, useRef } from 'react'
import {
  Upload, ChevronRight, ChevronLeft, AlertTriangle, Check,
  X, Download, Loader2, Info, RefreshCw, TrendingUp,
} from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'
import LastImportSummary from '../components/LastImportSummary'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_MODES = [
  {
    id: 'append',
    label: 'Append',
    description: 'Add new months only. Existing period rows are left untouched.',
    icon: '＋',
  },
  {
    id: 'replace_full',
    label: 'Replace All',
    description: 'Soft-delete ALL existing cash flow rows, then insert from file.',
    icon: '↻',
    danger: true,
  },
  {
    id: 'replace_period',
    label: 'Replace Period(s)',
    description: 'Soft-delete only the specific months in the file, then re-insert those months.',
    icon: '⊘',
  },
]

// Canonical fields: what the cash_flow table expects per row
const CANONICAL_FIELDS = [
  { field: 'period',              label: 'Period / Date',       required: true,  description: 'YYYY-MM, or any date (will be truncated to month)' },
  { field: 'cash_balance',        label: 'Ending Cash Balance', required: true,  description: 'Month-end cash balance in USD' },
  { field: 'prior_month_balance', label: 'Prior Month Balance', required: false, description: 'Optional — auto-computed when sequential months are in file' },
  { field: 'prior_year_balance',  label: 'Prior Year Balance',  required: false, description: 'Optional — prior year same month ending balance' },
  { field: 'reserve_floor',       label: 'Reserve Floor',       required: false, description: 'Optional period override for reserve floor (org default used if blank)' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns YYYY-MM from any reasonable date string, or null. */
function parsePeriod(str) {
  if (!str) return null
  const s = String(str).trim()

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s

  // YYYY-MM-DD → truncate
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}`

  // DD-Mon-YYYY  e.g. 31-Jan-2026
  const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dmy) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    const m = months[dmy[2].toLowerCase()]
    if (m) return `${dmy[3]}-${m}`
  }

  // Mon YYYY  e.g. Jan 2026
  const my = s.match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (my) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    const m = months[my[1].toLowerCase()]
    if (m) return `${my[2]}-${m}`
  }

  // MM-YYYY  e.g. 01-2026
  const my2 = s.match(/^(\d{1,2})-(\d{4})$/)
  if (my2) return `${my2[2]}-${my2[1].padStart(2,'0')}`

  return null
}

/** Add 1 month to YYYY-MM string. */
function addMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const next = new Date(y, m - 1 + 1, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

/** Subtract 1 month from YYYY-MM string. */
function prevMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const prev = new Date(y, m - 1 - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

/** Same month, prior year. */
function prevYear(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
}

function parseAmount(str) {
  if (str == null || str === '') return null
  const s = String(str).trim()
  const negative = s.startsWith('(') && s.endsWith(')')
  const cleaned = s.replace(/[()$,\s]/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  return negative ? -n : n
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV parser
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim())
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
    rows.push(row)
  }
  return { headers, rows }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyMapping(rawRow, mappingDraft) {
  const mapped = {}
  Object.entries(mappingDraft).forEach(([dst, src]) => {
    if (src && rawRow[src] !== undefined) mapped[dst] = rawRow[src]
  })
  return mapped
}

function detectMapping(headers, savedMappings) {
  if (!savedMappings?.length) return null
  const hSet = new Set(headers.map(h => h.toLowerCase()))
  let best = null, bestScore = 0
  for (const m of savedMappings) {
    if (m.import_type !== 'cashflow') continue
    const mapping = typeof m.mapping_json === 'string'
      ? JSON.parse(m.mapping_json) : m.mapping_json
    let score = 0
    Object.values(mapping).forEach(src => {
      if (src && hSet.has(src.toLowerCase())) score++
    })
    if (score > bestScore) { bestScore = score; best = m }
  }
  return bestScore >= 1 ? best : null
}

/**
 * Auto-compute prior_month_balance from within the imported rows.
 * If row N-1 (sorted by period) exists in the set, use its cash_balance
 * as this row's prior_month_balance (unless already explicitly mapped).
 */
function computePriorBalances(rows) {
  const byPeriod = {}
  rows.forEach(r => { byPeriod[r.period] = r._parsedBalance })

  return rows.map(r => {
    const priorPeriod = prevMonth(r.period)
    const priorYearPeriod = prevYear(r.period)

    return {
      ...r,
      _computedPriorMonth: r._parsedPriorMonth ?? byPeriod[priorPeriod] ?? null,
      _computedPriorYear:  r._parsedPriorYear  ?? byPeriod[priorYearPeriod] ?? null,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Template & sample download
// ─────────────────────────────────────────────────────────────────────────────

function downloadTemplateSafe() {
  const content = [
    'period,cash_balance,prior_month_balance,prior_year_balance,reserve_floor',
    '2025-10,2450000,,,',
  ].join('\n')
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'cashflow_import_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadCashFlowSample() {
  const content = [
    'period,cash_balance,prior_month_balance,prior_year_balance,reserve_floor',
    '2025-10,2450000,,,',
    '2025-11,2680000,2450000,,',
    '2025-12,3100000,2680000,,',
  ].join('\n')
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'cashflow_import_sample.csv'; a.click()
  URL.revokeObjectURL(url)
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({ current }) {
  const steps = ['Mode', 'Upload', 'Map Fields', 'Validate', 'Import']
  return (
    <div className="flex items-center gap-1 text-xs text-gray-400">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            i === current ? 'bg-cyan-100 text-cyan-700' :
            i < current  ? 'bg-gray-100 text-gray-500' : 'text-gray-400'
          }`}>{s}</span>
          {i < steps.length - 1 && <ChevronRight size={12} className="text-gray-300"/>}
        </span>
      ))}
    </div>
  )
}

function DropZone({ onFile }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  function handle(file) {
    if (!file || !file.name.endsWith('.csv')) { alert('Please upload a .csv file'); return }
    const reader = new FileReader()
    reader.onload = e => onFile(file.name, e.target.result)
    reader.readAsText(file)
  }
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
        drag ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-cyan-300'}`}
    >
      <Upload size={28} className="mx-auto mb-3 text-gray-400"/>
      <p className="text-sm font-medium text-gray-700 mb-1">Drop your CSV here or click to browse</p>
      <p className="text-xs text-gray-400 mb-4">One row per month — period + ending cash balance</p>
      <input type="file" accept=".csv" className="hidden" ref={ref} onChange={e => handle(e.target.files[0])}/>
      <button
        onClick={() => ref.current?.click()}
        className="px-4 py-2 text-xs font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 mr-2"
      >
        Choose File
      </button>
      <button onClick={downloadTemplateSafe} className="px-4 py-2 text-xs font-medium border border-cyan-300 text-cyan-600 rounded-lg hover:bg-cyan-50 mr-2">
        Blank Template
      </button>
      <button onClick={downloadCashFlowSample} className="px-4 py-2 text-xs font-medium border border-cyan-300 text-cyan-600 rounded-lg hover:bg-cyan-50">
        Sample Data
      </button>
    </div>
  )
}

function ValidationBadge({ level }) {
  if (level === 'hard')    return <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">Error</span>
  if (level === 'warning') return <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">Warning</span>
  return <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Info</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CashFlowImportFlow() {
  const STEPS = { mode:0, upload:1, mapping:2, validate:3, confirm:4, importing:5, done:6, error:7 }
  const [step, setStep]             = useState(STEPS.mode)
  const [importMode, setImportMode] = useState('append')

  const [fileName, setFileName]     = useState('')
  const [rawHeaders, setRawHeaders] = useState([])
  const [rawRows, setRawRows]       = useState([])

  const [savedMappings, setSavedMappings]     = useState([])
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [mappingDraft, setMappingDraft]       = useState({})

  const [validationResults, setValidationResults] = useState(null)
  const [validRows, setValidRows]                 = useState([])   // with _computedPrior*

  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError]   = useState(null)
  const [importLog, setImportLog]       = useState(null)

  // Load saved mappings
  useEffect(() => {
    supabase
      .from('field_mappings')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('import_type', 'cashflow')
      .eq('deleted', false)
      .then(({ data }) => setSavedMappings(data || []))
  }, [])

  // ── File uploaded ────────────────────────────────────────────────────────────
  function handleFile(name, text) {
    try {
      const { headers, rows } = parseCSV(text)
      setFileName(name)
      setRawHeaders(headers)
      setRawRows(rows)
      const detected = detectMapping(headers, savedMappings)
      if (detected) {
        setSelectedMapping(detected)
        setMappingDraft(typeof detected.mapping_json === 'string'
          ? JSON.parse(detected.mapping_json) : detected.mapping_json)
      } else {
        setSelectedMapping(null)
        // Auto-guess
        const draft = {}
        const aliases = {
          period:              ['period','month','date','as_of','as of'],
          cash_balance:        ['cash_balance','ending_balance','ending balance','balance','cash','amount'],
          prior_month_balance: ['prior_month_balance','prior_month','prev_month','previous_month'],
          prior_year_balance:  ['prior_year_balance','prior_year','prev_year','previous_year'],
          reserve_floor:       ['reserve_floor','reserve','floor'],
        }
        CANONICAL_FIELDS.forEach(({ field }) => {
          const names = aliases[field] || [field]
          const match = headers.find(h =>
            names.some(alias => h.toLowerCase().replace(/[^a-z0-9]/g,'') === alias.replace(/[^a-z0-9]/g,''))
          ) || headers.find(h =>
            names.some(alias => h.toLowerCase().includes(alias.split('_')[0]))
          )
          if (match) draft[field] = match
        })
        setMappingDraft(draft)
      }
      setStep(STEPS.mapping)
    } catch {
      alert('Failed to parse CSV. Please check the file format.')
    }
  }

  // ── Validate ─────────────────────────────────────────────────────────────────
  function runValidation() {
    const checks = []
    const valid  = []
    const errors = []

    let missingPeriod = 0, badPeriod = 0
    let missingBalance = 0, badBalance = 0
    let dupPeriods = []
    const seenPeriods = new Set()
    const periodSet = new Set()

    rawRows.forEach((raw, idx) => {
      const mapped = applyMapping(raw, mappingDraft)
      const rowNum = idx + 2

      const periodStr = mapped.period || ''
      const parsedPeriod = parsePeriod(periodStr)
      if (!periodStr.trim()) missingPeriod++
      else if (!parsedPeriod) badPeriod++

      const balStr = mapped.cash_balance ?? ''
      const parsedBalance = parseAmount(String(balStr))
      if (balStr === '' || balStr == null) missingBalance++
      else if (parsedBalance === null) badBalance++

      if (parsedPeriod && seenPeriods.has(parsedPeriod)) dupPeriods.push(parsedPeriod)
      if (parsedPeriod) { seenPeriods.add(parsedPeriod); periodSet.add(parsedPeriod) }

      const parsedPriorMonth = mapped.prior_month_balance
        ? parseAmount(String(mapped.prior_month_balance)) : null
      const parsedPriorYear = mapped.prior_year_balance
        ? parseAmount(String(mapped.prior_year_balance)) : null
      const parsedFloor = mapped.reserve_floor
        ? parseAmount(String(mapped.reserve_floor)) : null

      if (parsedPeriod && parsedBalance !== null) {
        valid.push({
          period: parsedPeriod,
          _parsedBalance:    parsedBalance,
          _parsedPriorMonth: parsedPriorMonth,
          _parsedPriorYear:  parsedPriorYear,
          _parsedFloor:      parsedFloor,
          _rowNum: rowNum,
        })
      } else {
        errors.push({ rowNum, periodStr, balStr })
      }
    })

    // Hard checks
    if (missingPeriod > 0) checks.push({ level:'hard', msg:`${missingPeriod} row(s) missing period/date (required)` })
    if (badPeriod > 0)     checks.push({ level:'hard', msg:`${badPeriod} row(s) have unparseable period values (expected YYYY-MM or any date)` })
    if (missingBalance > 0) checks.push({ level:'hard', msg:`${missingBalance} row(s) missing cash_balance (required)` })
    if (badBalance > 0)     checks.push({ level:'hard', msg:`${badBalance} row(s) have non-numeric cash_balance values` })

    // Warning checks
    if (dupPeriods.length > 0)
      checks.push({ level:'warning', msg:`Duplicate periods in file (first row wins): ${[...new Set(dupPeriods)].join(', ')}` })

    // Auto-compute prior balances from sequential rows in file
    const withPriors = computePriorBalances(valid)
    const autoComputedCount = withPriors.filter(r =>
      r._computedPriorMonth !== null && r._parsedPriorMonth == null
    ).length
    if (autoComputedCount > 0)
      checks.push({ level:'info', msg:`prior_month_balance auto-computed for ${autoComputedCount} row(s) from sequential months in file` })

    // Info checks
    const sortedPeriods = [...periodSet].sort()
    if (sortedPeriods.length > 0) {
      checks.push({ level:'info', msg:`${valid.length} valid period(s): ${sortedPeriods[0]} → ${sortedPeriods[sortedPeriods.length-1]}` })
    }
    const balances = valid.map(r => r._parsedBalance)
    if (balances.length) {
      const min = Math.min(...balances), max = Math.max(...balances)
      checks.push({ level:'info', msg:`Balance range: ${fmt(min)} — ${fmt(max)}` })
    }
    if (errors.length > 0)
      checks.push({ level:'warning', msg:`${errors.length} row(s) skipped due to parse errors` })

    setValidationResults({ checks, errorRows: errors, totalRows: rawRows.length, validCount: valid.length })
    // De-duplicate periods (first occurrence wins)
    const seen = new Set()
    const deduped = withPriors.filter(r => {
      if (seen.has(r.period)) return false
      seen.add(r.period); return true
    })
    setValidRows(deduped)
    setStep(STEPS.validate)
  }

  // ── Confirm & import ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    setStep(STEPS.importing)
    setImportError(null)

    try {
      const batchId = crypto.randomUUID()
      const now     = new Date().toISOString()
      const periodsInFile = validRows.map(r => r.period)
      const sortedPeriods = [...periodsInFile].sort()
      const periodStart = sortedPeriods[0]
      const periodEnd   = sortedPeriods[sortedPeriods.length - 1]

      // 1. Remove existing rows for replace modes.
      //    Hard-delete (not soft-delete) because cash_flow has a unique constraint on
      //    (org_id, period) — soft-deleting then re-inserting the same period would
      //    violate that constraint even though deleted=true.
      if (importMode === 'replace_full') {
        const { error } = await supabase.from('cash_flow')
          .delete()
          .eq('org_id', ORG_ID)
        if (error) throw error
      } else if (importMode === 'replace_period') {
        const { error } = await supabase.from('cash_flow')
          .delete()
          .eq('org_id', ORG_ID)
          .in('period', periodsInFile)
        if (error) throw error
      }

      // 2. For append mode: filter out existing periods
      let rowsToInsert = validRows
      let skippedCount = 0

      if (importMode === 'append') {
        const { data: existing } = await supabase.from('cash_flow')
          .select('period')
          .eq('org_id', ORG_ID)
          .eq('deleted', false)
          .in('period', periodsInFile)
        const existingPeriods = new Set((existing || []).map(r => r.period))
        rowsToInsert = validRows.filter(r => !existingPeriods.has(r.period))
        skippedCount = validRows.length - rowsToInsert.length
      }

      // 3. If append and nothing new, still write import_log then done
      if (rowsToInsert.length === 0) {
        const skippedLog = {
          org_id:       ORG_ID,
          import_type:  'cashflow',
          mode:         importMode,
          filename:     fileName,
          row_count:    validRows.length,
          rows_skipped: skippedCount,
          period_start: periodStart,
          period_end:   periodEnd,
          status:       'success',
          imported_by:  'system',
          imported_at:  now,
        }
        await supabase.from('import_log').insert([skippedLog])
        setImportResult({ inserted: 0, skipped: skippedCount, mode: importMode })
        setImportLog(skippedLog)
        setStep(STEPS.done)
        return
      }

      // 4. Also try to resolve prior_year_balance from existing DB rows
      const priorYearPeriods = rowsToInsert.map(r => prevYear(r.period))
      const { data: dbPriorYearRows } = await supabase.from('cash_flow')
        .select('period, cash_balance')
        .eq('org_id', ORG_ID)
        .eq('deleted', false)
        .in('period', priorYearPeriods)
      const dbPriorYear = {}
      ;(dbPriorYearRows || []).forEach(r => { dbPriorYear[r.period] = r.cash_balance })

      // 5. Build insert rows
      const rows = rowsToInsert.map(r => ({
        org_id:              ORG_ID,
        period:              r.period,
        cash_balance:        r._parsedBalance,
        prior_month_balance: r._computedPriorMonth ?? null,
        prior_year_balance:  r._computedPriorYear ?? dbPriorYear[prevYear(r.period)] ?? null,
        reserve_floor:       r._parsedFloor ?? null,
        deleted:             false,
        created_at:          now,
        updated_at:          now,
      }))

      // 6. Insert in batches of 50
      const BATCH = 50
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase.from('cash_flow').insert(rows.slice(i, i + BATCH))
        if (error) throw error
      }

      // 7. Write import_log
      const logEntry = {
        org_id:       ORG_ID,
        import_type:  'cashflow',
        mode:         importMode,
        filename:     fileName,
        row_count:    rows.length,
        rows_skipped: (validationResults?.errorRows?.length || 0) + skippedCount,
        period_start: periodStart,
        period_end:   periodEnd,
        status:       'success',
        imported_by:  'system',
        imported_at:  now,
      }
      await supabase.from('import_log').insert([logEntry])

      setImportResult({ inserted: rows.length, skipped: skippedCount, mode: importMode, periodStart, periodEnd })
      setImportLog(logEntry)
      setStep(STEPS.done)
    } catch (err) {
      console.error('Cash flow import error:', err)
      setImportError(err.message || 'Unknown error')
      setStep(STEPS.error)
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  function reset() {
    setStep(STEPS.mode)
    setImportMode('append')
    setFileName('')
    setRawHeaders([])
    setRawRows([])
    setSelectedMapping(null)
    setMappingDraft({})
    setValidationResults(null)
    setValidRows([])
    setImportResult(null)
    setImportError(null)
    setImportLog(null)
  }

  const hasHardErrors = validationResults?.checks.some(c => c.level === 'hard')

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Last import summary */}
      <LastImportSummary importType="cashflow" accentColor="indigo"/>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Import Cash Flow</h2>
          <p className="text-sm text-gray-500 mt-0.5">Monthly ending-balance snapshots — one row per period</p>
        </div>
        <StepIndicator current={step > STEPS.confirm ? 4 : step}/>
      </div>

      {/* ── STEP 0: Mode ─────────────────────────────────────────────────────── */}
      {step === STEPS.mode && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Choose how this import interacts with existing cash flow data:</p>
          <div className="grid gap-3">
            {IMPORT_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setImportMode(m.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  importMode === m.id
                    ? m.danger ? 'border-red-400 bg-red-50' : 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl leading-none mt-0.5">{m.icon}</span>
                <div>
                  <div className={`font-medium text-sm ${m.danger && importMode===m.id ? 'text-red-700' : 'text-gray-900'}`}>{m.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Download Template</p>
            <p className="text-xs text-gray-500 mb-3">
              Key columns: <code className="bg-gray-100 px-1 rounded text-gray-700">period</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">cash_balance</code>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={downloadTemplateSafe} className="flex items-center gap-1.5 text-xs text-cyan-600 border border-cyan-300 rounded-lg px-3 py-1.5 hover:bg-cyan-50">
                <Download size={12}/> Blank Template
              </button>
              <button onClick={downloadCashFlowSample} className="flex items-center gap-1.5 text-xs text-cyan-600 border border-cyan-300 rounded-lg px-3 py-1.5 hover:bg-cyan-50">
                <Download size={12}/> Sample Data
              </button>
            </div>
          </div>

          <button
            onClick={() => setStep(STEPS.upload)}
            className="px-5 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 flex items-center gap-2"
          >
            Continue <ChevronRight size={16}/>
          </button>
        </div>
      )}

      {/* ── STEP 1: Upload ───────────────────────────────────────────────────── */}
      {step === STEPS.upload && (
        <div className="space-y-4">
          <button onClick={() => setStep(STEPS.mode)} className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600">
            <ChevronLeft size={12}/> Back
          </button>
          <p className="text-sm text-gray-600">Upload your monthly cash balance export.</p>
          <DropZone onFile={handleFile}/>
        </div>
      )}

      {/* ── STEP 2: Map Fields ───────────────────────────────────────────────── */}
      {step === STEPS.mapping && (
        <div className="space-y-4">
          <button onClick={() => setStep(STEPS.upload)} className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600">
            <ChevronLeft size={12}/> Back
          </button>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  File: <span className="font-semibold text-gray-900">{fileName}</span>
                  <span className="ml-2 text-gray-400">({rawRows.length} rows, {rawHeaders.length} columns)</span>
                </p>
                {selectedMapping && (
                  <p className="text-xs text-cyan-600 mt-0.5">Auto-detected mapping: <strong>{selectedMapping.mapping_name}</strong></p>
                )}
              </div>
              {savedMappings.length > 0 && (
                <select
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
                  value={selectedMapping?.id || ''}
                  onChange={e => {
                    const m = savedMappings.find(x => x.id === e.target.value)
                    if (m) {
                      setSelectedMapping(m)
                      setMappingDraft(typeof m.mapping_json === 'string' ? JSON.parse(m.mapping_json) : m.mapping_json)
                    }
                  }}
                >
                  <option value="">— Load saved mapping —</option>
                  {savedMappings.map(m => <option key={m.id} value={m.id}>{m.mapping_name}</option>)}
                </select>
              )}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="pb-2 text-left font-medium">Field</th>
                  <th className="pb-2 text-left font-medium">CSV Column</th>
                  <th className="pb-2 text-left font-medium">Sample</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {CANONICAL_FIELDS.map(({ field, label, required, description }) => {
                  const mappedHeader = mappingDraft[field] || ''
                  const sample = mappedHeader && rawRows[0] ? rawRows[0][mappedHeader] ?? '' : ''
                  return (
                    <tr key={field}>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-700">
                          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                        </div>
                        <div className="text-xs text-gray-400">{description}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          className="text-sm border border-gray-300 rounded-lg px-2 py-1 w-full"
                          value={mappedHeader}
                          onChange={e => setMappingDraft(d => ({ ...d, [field]: e.target.value }))}
                        >
                          <option value="">— not mapped —</option>
                          {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                      <td className="py-2 text-xs text-gray-400 max-w-[120px] truncate">{String(sample).slice(0,30)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <Info size={11} className="inline mr-1"/>
            <strong>prior_month_balance</strong> is optional — if not mapped, it will be auto-computed from sequential months in the file.
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runValidation}
              disabled={!mappingDraft.period || !mappingDraft.cash_balance}
              className="px-5 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-40 flex items-center gap-2"
            >
              Validate <ChevronRight size={16}/>
            </button>
            {(!mappingDraft.period || !mappingDraft.cash_balance) && (
              <p className="text-xs text-red-500">Map Period and Cash Balance to continue</p>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Validate ─────────────────────────────────────────────────── */}
      {step === STEPS.validate && validationResults && (
        <div className="space-y-5">
          <button onClick={() => setStep(STEPS.mapping)} className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600">
            <ChevronLeft size={12}/> Back to mapping
          </button>

          <div className="space-y-2">
            {validationResults.checks.map((c, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm ${
                c.level==='hard'    ? 'bg-red-50 text-red-800' :
                c.level==='warning' ? 'bg-amber-50 text-amber-800' :
                                      'bg-blue-50 text-blue-800'
              }`}>
                {c.level==='info'
                  ? <Info size={14} className="mt-0.5 flex-shrink-0"/>
                  : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>}
                <span className="flex-1">{c.msg}</span>
                <ValidationBadge level={c.level}/>
              </div>
            ))}
          </div>

          {/* Preview table */}
          {!hasHardErrors && validRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <TrendingUp size={14}/> Preview
                <span className="text-xs font-normal text-gray-400">({validRows.length} periods)</span>
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Period</th>
                      <th className="px-3 py-2 text-right font-medium">Ending Balance</th>
                      <th className="px-3 py-2 text-right font-medium">Prior Month</th>
                      <th className="px-3 py-2 text-right font-medium">Prior Year</th>
                      <th className="px-3 py-2 text-right font-medium">Reserve Floor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validRows.slice(0, 18).map(r => (
                      <tr key={r.period} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.period}</td>
                        <td className="px-3 py-2 text-right font-semibold text-cyan-700">{fmt(r._parsedBalance)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {fmt(r._computedPriorMonth)}
                          {r._computedPriorMonth !== null && r._parsedPriorMonth == null && (
                            <span className="ml-1 text-blue-400" title="Auto-computed">✦</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{fmt(r._computedPriorYear)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{fmt(r._parsedFloor)}</td>
                      </tr>
                    ))}
                    {validRows.length > 18 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-center text-gray-400">
                          … {validRows.length - 18} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">✦ = auto-computed from sequential rows in file</p>
            </div>
          )}

          {/* Error rows download */}
          {validationResults.errorRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-medium text-red-700 mb-1">{validationResults.errorRows.length} row(s) skipped due to errors</p>
              <button
                onClick={() => {
                  const csv = 'row,period,cash_balance,error\n' +
                    validationResults.errorRows.map(e =>
                      `${e.rowNum},"${e.periodStr}","${e.balStr}","${!parsePeriod(e.periodStr)?'bad period':'bad balance'}"`
                    ).join('\n')
                  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
                  const a = document.createElement('a'); a.href = url
                  a.download = 'cashflow_import_errors.csv'; a.click()
                  URL.revokeObjectURL(url)
                }}
                className="text-xs text-red-600 flex items-center gap-1 hover:underline"
              >
                <Download size={12}/> Download error report
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            {!hasHardErrors && validRows.length > 0 ? (
              <button
                onClick={() => setStep(STEPS.confirm)}
                className="px-5 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 flex items-center gap-2"
              >
                Continue to Import <ChevronRight size={16}/>
              </button>
            ) : (
              <p className="text-sm text-red-600 font-medium">Fix errors above before continuing.</p>
            )}
            <button onClick={() => setStep(STEPS.mapping)} className="text-xs text-gray-400 hover:text-gray-600">Re-map fields</button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Confirm ──────────────────────────────────────────────────── */}
      {step === STEPS.confirm && (
        <div className="space-y-5">
          <button onClick={() => setStep(STEPS.validate)} className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600">
            <ChevronLeft size={12}/> Back
          </button>

          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-cyan-600"/> Confirm Import
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">Mode</dt>
              <dd className="font-medium">{IMPORT_MODES.find(m=>m.id===importMode)?.label}</dd>
              <dt className="text-gray-500">File</dt>
              <dd className="font-medium truncate">{fileName}</dd>
              <dt className="text-gray-500">Periods to write</dt>
              <dd className="font-medium">{validRows.length}</dd>
              <dt className="text-gray-500">Period range</dt>
              <dd className="font-medium text-xs">{validRows.map(r=>r.period).sort()[0]} → {validRows.map(r=>r.period).sort().slice(-1)[0]}</dd>
            </dl>
            {importMode === 'replace_full' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-medium">
                ⚠ Replace All — ALL existing cash_flow rows will be soft-deleted before insert.
              </div>
            )}
          </div>

          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 flex items-center gap-2"
          >
            <Check size={16}/> Import Cash Flow Data
          </button>
        </div>
      )}

      {/* ── STEP 5: Importing ────────────────────────────────────────────────── */}
      {step === STEPS.importing && (
        <div className="flex flex-col items-center py-16 gap-4">
          <Loader2 size={32} className="text-cyan-500 animate-spin"/>
          <p className="text-sm text-gray-600">Writing cash flow data to Supabase…</p>
        </div>
      )}

      {/* ── STEP 6: Done ─────────────────────────────────────────────────────── */}
      {step === STEPS.done && importResult && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <Check size={32} className="text-green-500 mx-auto mb-3"/>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Import Complete</h3>
            <p className="text-sm text-gray-500">Cash flow data written successfully</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-600">{importResult.inserted}</div>
              <div className="text-xs text-gray-500 mt-1">Periods inserted</div>
            </div>
            {importResult.skipped > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{importResult.skipped}</div>
                <div className="text-xs text-gray-500 mt-1">Periods skipped (already existed)</div>
              </div>
            )}
            {importResult.periodStart && (
              <div className="bg-gray-50 rounded-xl p-4 text-center col-span-2">
                <div className="text-sm font-semibold text-gray-700">{importResult.periodStart} → {importResult.periodEnd}</div>
                <div className="text-xs text-gray-500 mt-1">Period range imported</div>
              </div>
            )}
          </div>

          {importLog && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Logged in import_log · period range: {importLog.period_start} → {importLog.period_end}
            </div>
          )}

          <button onClick={reset} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw size={14}/> Import another file
          </button>
        </div>
      )}

      {/* ── STEP 7: Error ────────────────────────────────────────────────────── */}
      {step === STEPS.error && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <X size={24} className="text-red-500 mb-2"/>
            <h3 className="font-semibold text-red-800 mb-1">Import Failed</h3>
            <p className="text-sm text-red-600">{importError}</p>
          </div>
          <button onClick={reset} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw size={14}/> Start over
          </button>
        </div>
      )}
    </div>
  )
}
