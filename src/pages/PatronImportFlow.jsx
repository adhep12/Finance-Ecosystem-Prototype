/**
 * PatronImportFlow.jsx — Step 7: Patron Data Import
 *
 * Accepts pre-aggregated monthly patron summary CSVs (one row per month),
 * applies saved field mappings, validates rows, and writes directly to
 * patron_data — no individual gift aggregation needed.
 *
 * Required fields: period (YYYY-MM), total_active_patrons, new_patrons_total
 * Optional fields: new_patrons_recurring, new_patrons_spontaneous,
 *   recurring_patron_count, recurring_giving_total, spontaneous_giving_total,
 *   avg_gift_size, retention_rate
 *
 * Spec rules enforced:
 *  - Validation step runs ENTIRELY before any data is written to Supabase
 *  - All deletes are soft (deleted=true, never hard delete)
 *  - Field mapping saved per data source, reused on every future upload
 *  - import_log entry written for every import run
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Upload, ChevronRight, ChevronLeft, AlertTriangle, Check,
  X, Download, Loader2, Info, RefreshCw, BarChart2, Users,
} from 'lucide-react'
import { supabase, ORG_ID, dbInsert } from '../lib/supabase'
import LastImportSummary from '../components/LastImportSummary'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_MODES = [
  {
    id: 'append',
    label: 'Append',
    description: 'Add new months only. Existing monthly rows are untouched.',
    icon: '＋',
  },
  {
    id: 'replace_full',
    label: 'Replace All',
    description: 'Soft-delete ALL existing patron data, then insert from file. Use for full re-imports.',
    icon: '↻',
    danger: true,
  },
  {
    id: 'replace_period',
    label: 'Replace Period(s)',
    description: 'Soft-delete only the specific months present in the file, then re-insert those months.',
    icon: '⊘',
  },
]

const CANONICAL_FIELDS = [
  { field: 'period',                   label: 'Period',                   required: true,  description: 'Month in YYYY-MM format, e.g. 2025-10' },
  { field: 'total_active_patrons',     label: 'Total Active Patrons',     required: true,  description: 'Total active patron count for the month' },
  { field: 'new_patrons_total',        label: 'New Patrons Total',        required: true,  description: 'Total new patrons this month' },
  { field: 'new_patrons_recurring',    label: 'New Patrons Recurring',    required: false, description: 'New recurring patrons this month' },
  { field: 'new_patrons_spontaneous',  label: 'New Patrons Spontaneous',  required: false, description: 'New spontaneous patrons this month' },
  { field: 'recurring_patron_count',   label: 'Recurring Patron Count',   required: false, description: 'Total recurring patrons active this month' },
  { field: 'recurring_giving_total',   label: 'Recurring Giving Total',   required: false, description: 'Total recurring giving this month (no $ symbol)' },
  { field: 'spontaneous_giving_total', label: 'Spontaneous Giving Total', required: false, description: 'Total spontaneous giving this month (no $ symbol)' },
  { field: 'avg_gift_size',            label: 'Avg Gift Size',            required: false, description: 'Average gift size this month (no $ symbol)' },
  { field: 'retention_rate',           label: 'Retention Rate',           required: false, description: 'Patron retention rate as decimal, e.g. 0.82' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Validates and returns a YYYY-MM period string, or null if invalid. */
function parsePeriod(str) {
  if (!str) return null
  const s = String(str).trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  return null
}

/** Parses a whole number (patron counts). Returns null if empty or invalid. */
function parseWholeNumber(str) {
  if (str == null || String(str).trim() === '') return null
  const n = parseInt(String(str).trim(), 10)
  if (isNaN(n) || n < 0) return null
  return n
}

/** Parses a dollar amount with optional symbols/commas. Returns null if empty or invalid. */
function parseDollarAmount(str) {
  if (str == null || String(str).trim() === '') return null
  const cleaned = String(str).trim().replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  return Math.round(n * 100) / 100
}

/** Parses a retention rate decimal (0–1). Returns null if empty or out of range. */
function parseRetentionRate(str) {
  if (str == null || String(str).trim() === '') return null
  const n = parseFloat(String(str).trim())
  if (isNaN(n) || n < 0 || n > 1) return null
  return n
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

function applyMapping(rawRow, mappingJson) {
  const mapped = {}
  const mapping = typeof mappingJson === 'string' ? JSON.parse(mappingJson) : mappingJson
  Object.entries(mapping).forEach(([dst, src]) => {
    if (src && rawRow[src] !== undefined) mapped[dst] = rawRow[src]
  })
  return mapped
}

function detectMapping(headers, savedMappings) {
  if (!savedMappings?.length) return null
  const hSet = new Set(headers.map(h => h.toLowerCase()))
  let best = null, bestScore = 0
  for (const m of savedMappings) {
    if (m.import_type !== 'patron') continue
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

// ─────────────────────────────────────────────────────────────────────────────
// Template & sample download
// ─────────────────────────────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = 'period,total_active_patrons,new_patrons_total,new_patrons_recurring,new_patrons_spontaneous,recurring_patron_count,recurring_giving_total,spontaneous_giving_total,avg_gift_size,retention_rate'
  const example = '2025-10,4821,142,98,44,3102,187432.00,24318.00,47.23,0.82'
  const blob = new Blob([headers + '\n' + example + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'patron_import_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadSample() {
  const headers = 'period,total_active_patrons,new_patrons_total,new_patrons_recurring,new_patrons_spontaneous,recurring_patron_count,recurring_giving_total,spontaneous_giving_total,avg_gift_size,retention_rate'
  const rows = [
    '2025-10,4821,142,98,44,3102,187432.00,24318.00,47.23,0.82',
    '2025-11,4896,143,101,42,3156,191240.00,22875.00,46.88,0.83',
    '2025-12,4973,158,112,46,3224,197810.00,28140.00,48.51,0.84',
  ]
  const blob = new Blob([headers + '\n' + rows.join('\n') + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'patron_import_sample.csv'; a.click()
  URL.revokeObjectURL(url)
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
            i === current ? 'bg-pink-100 text-pink-700' :
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
      ref={ref}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
        drag ? 'border-pink-400 bg-pink-50' : 'border-gray-200 hover:border-pink-300'}`}>
      <Upload size={28} className="mx-auto mb-3 text-gray-400"/>
      <p className="text-sm font-medium text-gray-700 mb-1">Drop your CSV here or click to browse</p>
      <p className="text-xs text-gray-400 mb-4">Pre-aggregated monthly patron summary, one row per month</p>
      <input type="file" accept=".csv" className="hidden" ref={ref} onChange={e => handle(e.target.files[0])}/>
      <button
        onClick={() => ref.current?.click?.() || document.querySelector('input[type=file]')?.click()}
        className="px-4 py-2 text-xs font-medium bg-pink-600 text-white rounded-lg hover:bg-pink-700 mr-2"
      >
        Choose File
      </button>
      <button onClick={downloadTemplate} className="px-4 py-2 text-xs font-medium border border-pink-300 text-pink-600 rounded-lg hover:bg-pink-50 mr-2">
        Blank Template
      </button>
      <button onClick={downloadSample} className="px-4 py-2 text-xs font-medium border border-pink-300 text-pink-600 rounded-lg hover:bg-pink-50">
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

export default function PatronImportFlow() {
  // ── Step state ──────────────────────────────────────────────────────────────
  const STEPS = { mode:0, upload:1, mapping:2, validate:3, confirm:4, importing:5, done:6, error:7 }
  const [step, setStep]             = useState(STEPS.mode)
  const [importMode, setImportMode] = useState('append')

  // ── File / raw data ─────────────────────────────────────────────────────────
  const [fileName, setFileName]     = useState('')
  const [rawHeaders, setRawHeaders] = useState([])
  const [rawRows, setRawRows]       = useState([])

  // ── Mapping ─────────────────────────────────────────────────────────────────
  const [savedMappings, setSavedMappings] = useState([])
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [mappingDraft, setMappingDraft]       = useState({})   // canonical → csv header

  // ── Validation ───────────────────────────────────────────────────────────────
  const [validationResults, setValidationResults] = useState(null)
  const [validRows, setValidRows]                 = useState([])
  const [validateError, setValidateError]         = useState(null)

  // (monthlyRows removed — CSV is already monthly summaries; validRows IS the monthly rows)

  // ── Import result ────────────────────────────────────────────────────────────
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError]   = useState(null)
  const [importLog, setImportLog]       = useState(null)

  // ── Load saved mappings on mount ─────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('field_mappings')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('import_type', 'patron')
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
      // Auto-detect mapping
      const detected = detectMapping(headers, savedMappings)
      if (detected) {
        setSelectedMapping(detected)
        setMappingDraft(typeof detected.mapping_json === 'string'
          ? JSON.parse(detected.mapping_json) : detected.mapping_json)
      } else {
        setSelectedMapping(null)
        // Auto-guess by header name similarity
        const draft = {}
        CANONICAL_FIELDS.forEach(({ field }) => {
          const match = headers.find(h =>
            h.toLowerCase().replace(/[^a-z0-9]/g,'') ===
            field.toLowerCase().replace(/[^a-z0-9]/g,'')
          ) || headers.find(h => h.toLowerCase().includes(field.toLowerCase().split('_')[0]))
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
    setValidateError(null)
    try {
    const checks = []
    const valid  = []
    const errors = []

    let missingPeriod      = 0
    let badPeriod          = 0
    let missingActivePat   = 0
    let badActivePat       = 0
    let missingNewPatrons  = 0
    let badNewPatrons      = 0

    rawRows.forEach((raw, idx) => {
      const mapped = applyMapping(raw, mappingDraft)
      const rowNum = idx + 2

      // Required: period (YYYY-MM)
      const periodStr = String(mapped.period || '').trim()
      const parsedPeriod = parsePeriod(periodStr)
      if (!periodStr) missingPeriod++
      else if (!parsedPeriod) badPeriod++

      // Required: total_active_patrons
      const tapStr = mapped.total_active_patrons ?? ''
      const parsedTap = parseWholeNumber(String(tapStr))
      if (String(tapStr).trim() === '') missingActivePat++
      else if (parsedTap === null) badActivePat++

      // Required: new_patrons_total
      const nptStr = mapped.new_patrons_total ?? ''
      const parsedNpt = parseWholeNumber(String(nptStr))
      if (String(nptStr).trim() === '') missingNewPatrons++
      else if (parsedNpt === null) badNewPatrons++

      if (parsedPeriod && parsedTap !== null && parsedNpt !== null) {
        valid.push({
          period:                   parsedPeriod,
          total_active_patrons:     parsedTap,
          new_patrons_total:        parsedNpt,
          new_patrons_recurring:    parseWholeNumber(mapped.new_patrons_recurring),
          new_patrons_spontaneous:  parseWholeNumber(mapped.new_patrons_spontaneous),
          recurring_patron_count:   parseWholeNumber(mapped.recurring_patron_count),
          recurring_giving_total:   parseDollarAmount(mapped.recurring_giving_total),
          spontaneous_giving_total: parseDollarAmount(mapped.spontaneous_giving_total),
          avg_gift_size:            parseDollarAmount(mapped.avg_gift_size),
          retention_rate:           parseRetentionRate(mapped.retention_rate),
          _rowNum:                  rowNum,
        })
      } else {
        errors.push({ rowNum, periodStr, parsedPeriod, tapStr, parsedTap, nptStr, parsedNpt })
      }
    })

    // Hard checks
    if (missingPeriod > 0)    checks.push({ level:'hard', msg:`${missingPeriod} row(s) missing period (required, format: YYYY-MM)` })
    if (badPeriod > 0)        checks.push({ level:'hard', msg:`${badPeriod} row(s) have invalid period — must be YYYY-MM (e.g. 2025-10)` })
    if (missingActivePat > 0) checks.push({ level:'hard', msg:`${missingActivePat} row(s) missing total_active_patrons (required)` })
    if (badActivePat > 0)     checks.push({ level:'hard', msg:`${badActivePat} row(s) have non-numeric total_active_patrons` })
    if (missingNewPatrons > 0) checks.push({ level:'hard', msg:`${missingNewPatrons} row(s) missing new_patrons_total (required)` })
    if (badNewPatrons > 0)    checks.push({ level:'hard', msg:`${badNewPatrons} row(s) have non-numeric new_patrons_total` })

    // Info
    checks.push({ level:'info', msg:`${valid.length.toLocaleString()} valid row(s) covering ${valid.length} month(s)` })

    setValidationResults({ checks, errorRows: errors, totalRows: rawRows.length, validCount: valid.length })
    setValidRows(valid)
    setStep(STEPS.validate)
    } catch (err) {
      console.error('Validation error:', err)
      setValidateError(err.message || 'Unexpected error during validation. Please check your CSV and try again.')
    }
  }

  // ── Confirm & import ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    setStep(STEPS.importing)
    setImportError(null)

    try {
      const now = new Date().toISOString()

      // 1. Determine periods in file
      // Strip internal _rowNum before writing to DB
      const dbRows = validRows.map(({ _rowNum, ...r }) => r)
      const periodsInFile = [...new Set(dbRows.map(r => r.period))]

      // 2. Remove existing rows for replace modes.
      //    Hard-delete (not soft-delete) because patron_data has a unique constraint on
      //    (org_id, period) — soft-deleting then re-inserting the same period would
      //    violate that constraint even though deleted=true.
      if (importMode === 'replace_full') {
        const { error } = await supabase.from('patron_data')
          .delete()
          .eq('org_id', ORG_ID)
        if (error) throw error
      } else if (importMode === 'replace_period') {
        const { error } = await supabase.from('patron_data')
          .delete()
          .eq('org_id', ORG_ID)
          .in('period', periodsInFile)
        if (error) throw error
      } else if (importMode === 'append') {
        // Skip periods that already exist
        const { data: existing } = await supabase.from('patron_data')
          .select('period')
          .eq('org_id', ORG_ID)
          .eq('deleted', false)
          .in('period', periodsInFile)
        const existingPeriods = new Set((existing || []).map(r => r.period))
        const newDbRows = dbRows.filter(r => !existingPeriods.has(r.period))
        if (newDbRows.length === 0) {
          // Still write import_log so Last Import panel shows something
          const sortedP = [...periodsInFile].sort()
          const skippedLog = {
            org_id:        ORG_ID,
            import_type:   'patron',
            mode:          importMode,
            filename:      fileName,
            row_count:     rawRows.length,
            rows_inserted: 0,
            rows_skipped:  dbRows.length,
            period_start:  sortedP[0] || null,
            period_end:    sortedP[sortedP.length - 1] || null,
            status:        'success',
            imported_by:   'system',
            imported_at:   now,
          }
          await supabase.from('import_log').insert([skippedLog])
          setImportResult({ skipped: dbRows.length, inserted: 0, mode: importMode })
          setImportLog(skippedLog)
          setStep(STEPS.done)
          return
        }
        // Continue with only new rows
        const rows = newDbRows.map(r => ({
          ...r,
          org_id:      ORG_ID,
          deleted:     false,
          created_at:  now,
          updated_at:  now,
        }))
        const { error } = await supabase.from('patron_data').insert(rows)
        if (error) throw error

        // Write import_log
        const sortedPeriods = [...periodsInFile].sort()
        const logEntry = {
          org_id:        ORG_ID,
          import_type:   'patron',
          mode:          importMode,
          filename:      fileName,
          row_count:     rawRows.length,
          rows_inserted: newDbRows.length,
          rows_skipped:  dbRows.length - newDbRows.length,
          period_start:  sortedPeriods[0] || null,
          period_end:    sortedPeriods[sortedPeriods.length - 1] || null,
          status:        'success',
          imported_by:   'system',
          imported_at:   now,
        }
        await supabase.from('import_log').insert([logEntry])

        setImportResult({ inserted: newDbRows.length, skipped: existingPeriods.size, mode: importMode })
        setImportLog(logEntry)
        setStep(STEPS.done)
        return
      }

      // Insert rows (replace_full / replace_period)
      const rows = dbRows.map(r => ({
        ...r,
        org_id:      ORG_ID,
        deleted:     false,
        created_at:  now,
        updated_at:  now,
      }))

      // Batch insert (50 per batch)
      const BATCH = 50
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase.from('patron_data').insert(rows.slice(i, i + BATCH))
        if (error) throw error
      }

      const sortedPeriods = [...periodsInFile].sort()
      const logEntry = {
        org_id:        ORG_ID,
        import_type:   'patron',
        mode:          importMode,
        filename:      fileName,
        row_count:     rawRows.length,
        rows_inserted: rows.length,
        rows_skipped:  rawRows.length - dbRows.length,
        period_start:  sortedPeriods[0] || null,
        period_end:    sortedPeriods[sortedPeriods.length - 1] || null,
        status:        'success',
        imported_by:   'system',
        imported_at:   now,
      }
      await supabase.from('import_log').insert([logEntry])

      setImportResult({ inserted: rows.length, mode: importMode })
      setImportLog(logEntry)
      setStep(STEPS.done)
    } catch (err) {
      console.error('Patron import error:', err)
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
    setValidateError(null)
    setImportResult(null)
    setImportError(null)
    setImportLog(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasHardErrors = validationResults?.checks.some(c => c.level === 'hard')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Last import summary */}
      <LastImportSummary importType="patron" accentColor="pink"/>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Import Patron Data</h2>
          <p className="text-sm text-gray-500 mt-0.5">Pre-aggregated monthly patron summary CSV</p>
        </div>
        <StepIndicator current={step > STEPS.confirm ? 4 : step}/>
      </div>

      {/* ── STEP 0: Mode ─────────────────────────────────────────────────────── */}
      {step === STEPS.mode && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Choose how this import interacts with existing patron data:</p>
          <div className="grid gap-3">
            {IMPORT_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setImportMode(m.id)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  importMode === m.id
                    ? m.danger ? 'border-red-400 bg-red-50' : 'border-pink-500 bg-pink-50'
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
          <button
            onClick={() => setStep(STEPS.upload)}
            className="px-5 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 flex items-center gap-2"
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
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Upload your monthly patron summary CSV.</p>
            <div className="flex items-center gap-2">
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-pink-600 border border-pink-300 rounded-lg px-3 py-1.5 hover:bg-pink-50">
                <Download size={12}/> Blank Template
              </button>
              <button onClick={downloadSample} className="flex items-center gap-1.5 text-xs text-pink-600 border border-pink-300 rounded-lg px-3 py-1.5 hover:bg-pink-50">
                <Download size={12}/> Sample Data
              </button>
            </div>
          </div>
          <DropZone onFile={(name, text) => { setStep(STEPS.upload); handleFile(name, text) }}/>
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
                  <p className="text-xs text-pink-600 mt-0.5">Auto-detected mapping: <strong>{selectedMapping.mapping_name}</strong></p>
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
                  <th className="pb-2 text-left font-medium">Canonical Field</th>
                  <th className="pb-2 text-left font-medium">Your CSV Column</th>
                  <th className="pb-2 text-left font-medium">Sample Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {CANONICAL_FIELDS.map(({ field, label, required }) => {
                  const mappedHeader = mappingDraft[field] || ''
                  const sample = mappedHeader && rawRows[0] ? rawRows[0][mappedHeader] ?? '' : ''
                  return (
                    <tr key={field}>
                      <td className="py-2 pr-4 font-medium text-gray-700">
                        {label}
                        {required && <span className="text-red-500 ml-0.5">*</span>}
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
                      <td className="py-2 text-xs text-gray-400 max-w-[140px] truncate">{String(sample).slice(0,40)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {validateError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5"/>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800 mb-0.5">Validation error</p>
                <p className="text-xs text-red-600">{validateError}</p>
              </div>
              <button onClick={() => setValidateError(null)} className="text-red-400 hover:text-red-600">
                <X size={14}/>
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={runValidation}
              disabled={!mappingDraft.period || !mappingDraft.total_active_patrons || !mappingDraft.new_patrons_total}
              className="px-5 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-40 flex items-center gap-2"
            >
              Validate <ChevronRight size={16}/>
            </button>
            {(!mappingDraft.period || !mappingDraft.total_active_patrons || !mappingDraft.new_patrons_total) && (
              <p className="text-xs text-red-500">Map Period, Total Active Patrons, and New Patrons Total fields to continue</p>
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

          {/* Checks */}
          <div className="space-y-2">
            {validationResults.checks.map((c, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm ${
                c.level==='hard'    ? 'bg-red-50 text-red-800' :
                c.level==='warning' ? 'bg-amber-50 text-amber-800' :
                                      'bg-blue-50 text-blue-800'
              }`}>
                {c.level==='hard'    ? <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/> :
                 c.level==='warning' ? <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/> :
                                       <Info size={14} className="mt-0.5 flex-shrink-0"/>}
                <span>{c.msg}</span>
                <ValidationBadge level={c.level}/>
              </div>
            ))}
          </div>

          {/* Monthly data preview */}
          {!hasHardErrors && validRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <BarChart2 size={14}/> Monthly Data Preview
                <span className="text-xs font-normal text-gray-400">({validRows.length} month{validRows.length !== 1 ? 's' : ''})</span>
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Period</th>
                      <th className="px-3 py-2 text-right font-medium">Active Patrons</th>
                      <th className="px-3 py-2 text-right font-medium">New Patrons</th>
                      <th className="px-3 py-2 text-right font-medium">Recurring $</th>
                      <th className="px-3 py-2 text-right font-medium">Spontaneous $</th>
                      <th className="px-3 py-2 text-right font-medium">Avg Gift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validRows.slice(0, 12).map(r => (
                      <tr key={r.period} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.period}</td>
                        <td className="px-3 py-2 text-right">{(r.total_active_patrons ?? '—').toLocaleString?.() ?? r.total_active_patrons ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-pink-700">{(r.new_patrons_total ?? '—').toLocaleString?.() ?? r.new_patrons_total ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{r.recurring_giving_total != null ? `$${r.recurring_giving_total.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.spontaneous_giving_total != null ? `$${r.spontaneous_giving_total.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.avg_gift_size != null ? `$${r.avg_gift_size.toLocaleString()}` : '—'}</td>
                      </tr>
                    ))}
                    {validRows.length > 12 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-center text-gray-400">
                          … {validRows.length - 12} more month(s) not shown
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error rows download */}
          {validationResults.errorRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-medium text-red-700 mb-1">{validationResults.errorRows.length} rows skipped due to errors</p>
              <button
                onClick={() => {
                  const csv = 'row,period,total_active_patrons,new_patrons_total,error\n' +
                    validationResults.errorRows.map(e => {
                      const err = !e.parsedPeriod ? 'bad period (must be YYYY-MM)'
                        : e.parsedTap === null ? 'bad total_active_patrons (must be whole number)'
                        : 'bad new_patrons_total (must be whole number)'
                      return `${e.rowNum},"${e.periodStr ?? ''}","${e.tapStr ?? ''}","${e.nptStr ?? ''}","${err}"`
                    }).join('\n')
                  const blob = new Blob([csv], { type:'text/csv' })
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                  a.download = 'patron_import_errors.csv'; a.click()
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
                className="px-5 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 flex items-center gap-2"
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

          <div className="bg-pink-50 border border-pink-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={16} className="text-pink-600"/> Confirm Import
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">Mode</dt>
              <dd className="font-medium capitalize">{IMPORT_MODES.find(m=>m.id===importMode)?.label}</dd>
              <dt className="text-gray-500">File</dt>
              <dd className="font-medium truncate">{fileName}</dd>
              <dt className="text-gray-500">Valid rows</dt>
              <dd className="font-medium">{validRows.length.toLocaleString()} / {rawRows.length.toLocaleString()}</dd>
              <dt className="text-gray-500">Monthly rows to write</dt>
              <dd className="font-medium">{validRows.length}</dd>
              <dt className="text-gray-500">Periods</dt>
              <dd className="font-medium text-xs">{validRows.map(r=>r.period).join(', ')}</dd>
            </dl>
            {importMode === 'replace_full' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-medium">
                ⚠ Replace All — ALL existing patron_data rows will be soft-deleted before insert.
              </div>
            )}
          </div>

          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 bg-pink-600 text-white text-sm font-semibold rounded-lg hover:bg-pink-700 flex items-center gap-2"
          >
            <Check size={16}/> Import Patron Data
          </button>
        </div>
      )}

      {/* ── STEP 5: Importing ────────────────────────────────────────────────── */}
      {step === STEPS.importing && (
        <div className="flex flex-col items-center py-16 gap-4">
          <Loader2 size={32} className="text-pink-500 animate-spin"/>
          <p className="text-sm text-gray-600">Writing monthly patron data to Supabase…</p>
        </div>
      )}

      {/* ── STEP 6: Done ─────────────────────────────────────────────────────── */}
      {step === STEPS.done && importResult && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <Check size={32} className="text-green-500 mx-auto mb-3"/>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Import Complete</h3>
            <p className="text-sm text-gray-500">Patron data written successfully</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">{importResult.inserted ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Monthly rows inserted</div>
            </div>
            {importResult.skipped != null && (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{importResult.skipped}</div>
                <div className="text-xs text-gray-500 mt-1">Periods already existed (skipped)</div>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-700">{validRows.length.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">Gift rows processed</div>
            </div>
            {validationResults?.errorRows?.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-500">{validationResults.errorRows.length}</div>
                <div className="text-xs text-gray-500 mt-1">Gift rows skipped (errors)</div>
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
