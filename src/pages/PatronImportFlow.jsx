/**
 * PatronImportFlow.jsx — Step 7: Patron Data Import
 *
 * Accepts individual gift-level CSV exports from a CRM (date, amount,
 * patron_id, patron_name, campaign, gift_type), applies saved field mappings,
 * validates rows, aggregates to monthly metrics, and writes to patron_data.
 *
 * Spec rules enforced:
 *  - Validation step runs ENTIRELY before any data is written to Supabase
 *  - All deletes are soft (deleted=true, never hard delete)
 *  - Field mapping saved per data source, reused on every future upload
 *  - import_log entry written for every import run
 *  - Metrics that require multi-period history (new_patrons, retention_rate)
 *    default to NULL and are noted in the UI
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Upload, ChevronRight, ChevronLeft, AlertTriangle, Check,
  X, Download, Loader2, Info, RefreshCw, BarChart2, Users,
} from 'lucide-react'
import { supabase, ORG_ID, dbInsert } from '../lib/supabase'

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
  { field: 'date',        label: 'Date',        required: true,  description: 'Gift date (YYYY-MM-DD or MM/DD/YYYY)' },
  { field: 'amount',      label: 'Amount',       required: true,  description: 'Gift amount in USD' },
  { field: 'patron_id',   label: 'Patron ID',   required: false, description: 'Unique patron/donor identifier' },
  { field: 'patron_name', label: 'Patron Name', required: false, description: 'Full donor name' },
  { field: 'campaign',    label: 'Campaign',    required: false, description: 'Campaign or fund code' },
  { field: 'gift_type',   label: 'Gift Type',   required: false, description: 'e.g. Recurring, One-time, Grant' },
]

const RECURRING_KEYWORDS = ['recurring', 'sustaining', 'monthly', 'subscription', 'regular', 'pledge']

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCalendarDate(str) {
  if (!str) return null
  const s = String(str).trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  // DD-Mon-YYYY (e.g. 15-Jan-2026)
  const dmy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dmy) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    const m = months[dmy[2].toLowerCase()]
    if (m) return `${dmy[3]}-${m}-${dmy[1].padStart(2,'0')}`
  }
  // MM-DD-YYYY
  const mdy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdy2) return `${mdy2[3]}-${mdy2[1].padStart(2,'0')}-${mdy2[2].padStart(2,'0')}`
  return null
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

function toYYYYMM(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : null
}

function isRecurring(giftType) {
  if (!giftType) return false
  const lower = String(giftType).toLowerCase()
  return RECURRING_KEYWORDS.some(k => lower.includes(k))
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
// Aggregation: individual gifts → monthly patron_data rows
// ─────────────────────────────────────────────────────────────────────────────

function aggregateToMonthly(validRows) {
  const byPeriod = {}

  for (const row of validRows) {
    const period = toYYYYMM(row._parsedDate)
    if (!period) continue
    if (!byPeriod[period]) {
      byPeriod[period] = {
        period,
        gifts: [],
        patronIds: new Set(),
        recurringPatronIds: new Set(),
      }
    }
    const bucket = byPeriod[period]
    const amt = row._parsedAmount
    const rec = isRecurring(row.gift_type)
    bucket.gifts.push({ amount: amt, recurring: rec, patronId: row.patron_id })
    if (row.patron_id) {
      bucket.patronIds.add(row.patron_id)
      if (rec) bucket.recurringPatronIds.add(row.patron_id)
    }
  }

  return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period)).map(bucket => {
    const totalAmt  = bucket.gifts.reduce((s, g) => s + (g.amount || 0), 0)
    const recAmt    = bucket.gifts.filter(g => g.recurring).reduce((s, g) => s + (g.amount || 0), 0)
    const spontAmt  = totalAmt - recAmt
    const avgGift   = bucket.gifts.length ? Math.round((totalAmt / bucket.gifts.length) * 100) / 100 : null
    const hasPatronIds = bucket.patronIds.size > 0

    return {
      period: bucket.period,
      total_active_patrons:     hasPatronIds ? bucket.patronIds.size : null,
      new_patrons_total:        null,   // requires historical data
      new_patrons_recurring:    null,   // requires historical data
      new_patrons_spontaneous:  null,   // requires historical data
      recurring_patron_count:   hasPatronIds ? bucket.recurringPatronIds.size : null,
      recurring_giving_total:   Math.round(recAmt * 100) / 100,
      spontaneous_giving_total: Math.round(spontAmt * 100) / 100,
      avg_gift_size:            avgGift,
      retention_rate:           null,   // requires multi-period history
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Template download
// ─────────────────────────────────────────────────────────────────────────────

function downloadTemplate() {
  const headers = 'date,amount,patron_id,patron_name,campaign,gift_type'
  const example = '2026-01-15,250.00,PAT-001,Jane Smith,Annual Fund,Recurring'
  const blob = new Blob([headers + '\n' + example + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'patron_import_template.csv'; a.click()
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
      <p className="text-xs text-gray-400 mb-4">Individual gift records from your CRM, one row per gift</p>
      <input type="file" accept=".csv" className="hidden" ref={ref} onChange={e => handle(e.target.files[0])}/>
      <button
        onClick={() => ref.current?.click?.() || document.querySelector('input[type=file]')?.click()}
        className="px-4 py-2 text-xs font-medium bg-pink-600 text-white rounded-lg hover:bg-pink-700 mr-2"
      >
        Choose File
      </button>
      <button onClick={downloadTemplate} className="px-4 py-2 text-xs font-medium border border-pink-300 text-pink-600 rounded-lg hover:bg-pink-50">
        Download Template
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

  // ── Monthly aggregates (computed from validRows) ─────────────────────────────
  const [monthlyRows, setMonthlyRows] = useState([])

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
    const checks = []
    const valid  = []
    const errors = []

    let missingDate   = 0
    let badDate       = 0
    let missingAmount = 0
    let badAmount     = 0
    let missingPatronId = 0
    let unknownGiftTypes = new Set()
    let campaigns = new Set()
    let giftTypes = new Set()
    let totalAmount = 0
    let rowsWithPatronId = 0

    rawRows.forEach((raw, idx) => {
      const mapped = applyMapping(raw, mappingDraft)
      const rowNum = idx + 2

      // Parse date
      const dateStr = mapped.date || ''
      const parsedDate = parseCalendarDate(dateStr)
      if (!dateStr.trim()) missingDate++
      else if (!parsedDate) badDate++

      // Parse amount
      const amtStr = mapped.amount ?? ''
      const parsedAmount = parseAmount(String(amtStr))
      if (amtStr === '' || amtStr == null) missingAmount++
      else if (parsedAmount === null) badAmount++

      const hasHardError = (!parsedDate && (missingDate + badDate > 0)) || parsedAmount === null

      if (parsedDate && parsedAmount !== null) {
        valid.push({ ...mapped, _parsedDate: parsedDate, _parsedAmount: parsedAmount, _rowNum: rowNum })
        totalAmount += parsedAmount
        if (mapped.patron_id) rowsWithPatronId++
        else missingPatronId++
        if (mapped.campaign) campaigns.add(mapped.campaign)
        if (mapped.gift_type) {
          giftTypes.add(mapped.gift_type)
          const lower = mapped.gift_type.toLowerCase()
          const recognized = RECURRING_KEYWORDS.some(k => lower.includes(k)) || lower.includes('one') || lower.includes('single') || lower.includes('spontan')
          if (!recognized) unknownGiftTypes.add(mapped.gift_type)
        }
      } else {
        errors.push({ rowNum, dateStr, parsedDate, amtStr, parsedAmount })
      }
    })

    // Hard checks
    if (missingDate > 0) checks.push({ level:'hard', msg:`${missingDate} row(s) missing date (required)` })
    if (badDate > 0)     checks.push({ level:'hard', msg:`${badDate} row(s) have unparseable date values` })
    if (missingAmount > 0) checks.push({ level:'hard', msg:`${missingAmount} row(s) missing amount (required)` })
    if (badAmount > 0)     checks.push({ level:'hard', msg:`${badAmount} row(s) have non-numeric amounts` })

    // Warning checks
    if (missingPatronId > 0)
      checks.push({ level:'warning', msg:`${missingPatronId} row(s) missing patron_id — active patron counts will be omitted for those gifts` })
    if (unknownGiftTypes.size > 0)
      checks.push({ level:'warning', msg:`Unrecognized gift_type values: ${[...unknownGiftTypes].join(', ')} — will be treated as spontaneous/one-time` })

    // Info checks
    const periodSet = new Set(valid.map(r => toYYYYMM(r._parsedDate)).filter(Boolean))
    checks.push({ level:'info', msg:`${valid.length.toLocaleString()} valid gift rows across ${periodSet.size} month(s)` })
    checks.push({ level:'info', msg:`Total gift volume: $${totalAmount.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}` })
    if (giftTypes.size > 0)
      checks.push({ level:'info', msg:`Gift types detected: ${[...giftTypes].join(', ')}` })
    if (campaigns.size > 0)
      checks.push({ level:'info', msg:`Campaigns/funds: ${[...campaigns].join(', ')}` })
    checks.push({ level:'info', msg:`Note: new_patrons_total and retention_rate require multi-period history and will be blank on first import` })

    setValidationResults({ checks, errorRows: errors, totalRows: rawRows.length, validCount: valid.length })
    setValidRows(valid)

    // Compute monthly aggregates
    const monthly = aggregateToMonthly(valid)
    setMonthlyRows(monthly)

    setStep(STEPS.validate)
  }

  // ── Confirm & import ─────────────────────────────────────────────────────────
  async function handleConfirm() {
    setStep(STEPS.importing)
    setImportError(null)

    try {
      const now = new Date().toISOString()

      // 1. Determine periods in file
      const periodsInFile = [...new Set(monthlyRows.map(r => r.period))]

      // 2. Soft-delete based on mode
      if (importMode === 'replace_full') {
        await supabase.from('patron_data')
          .update({ deleted: true })
          .eq('org_id', ORG_ID)
          .eq('deleted', false)
      } else if (importMode === 'replace_period') {
        for (const period of periodsInFile) {
          await supabase.from('patron_data')
            .update({ deleted: true })
            .eq('org_id', ORG_ID)
            .eq('period', period)
            .eq('deleted', false)
        }
      } else if (importMode === 'append') {
        // Skip periods that already exist
        const { data: existing } = await supabase.from('patron_data')
          .select('period')
          .eq('org_id', ORG_ID)
          .eq('deleted', false)
          .in('period', periodsInFile)
        const existingPeriods = new Set((existing || []).map(r => r.period))
        const newMonthlyRows = monthlyRows.filter(r => !existingPeriods.has(r.period))
        if (newMonthlyRows.length === 0) {
          setImportResult({ skipped: monthlyRows.length, inserted: 0, mode: importMode })
          setStep(STEPS.done)
          return
        }
        // Continue with only new rows
        const rows = newMonthlyRows.map(r => ({
          ...r,
          org_id:      ORG_ID,
          deleted:     false,
          created_at:  now,
          updated_at:  now,
        }))
        const { error } = await supabase.from('patron_data').insert(rows)
        if (error) throw error

        // Write import_log (columns aligned to import_log schema)
        const sortedPeriods = [...periodsInFile].sort()
        const logEntry = {
          org_id:        ORG_ID,
          import_type:   'patron',
          mode:          importMode,
          filename:      fileName,
          row_count:     rawRows.length,
          rows_inserted: newMonthlyRows.length,
          rows_skipped:  monthlyRows.length - newMonthlyRows.length,
          period_start:  sortedPeriods[0] || null,
          period_end:    sortedPeriods[sortedPeriods.length - 1] || null,
          status:        'success',
          imported_by:   'system',
        }
        await supabase.from('import_log').insert([logEntry])

        setImportResult({ inserted: newMonthlyRows.length, skipped: existingPeriods.size, mode: importMode })
        setImportLog(logEntry)
        setStep(STEPS.done)
        return
      }

      // Insert monthly rows (replace_full / replace_period)
      const rows = monthlyRows.map(r => ({
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
        rows_skipped:  rawRows.length - validRows.length,
        period_start:  sortedPeriods[0] || null,
        period_end:    sortedPeriods[sortedPeriods.length - 1] || null,
        status:        'success',
        imported_by:   'system',
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
    setMonthlyRows([])
    setImportResult(null)
    setImportError(null)
    setImportLog(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasHardErrors = validationResults?.checks.some(c => c.level === 'hard')

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Import Patron Data</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gift-level CSV from CRM → aggregated monthly metrics</p>
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
            <p className="text-sm text-gray-600">Upload your CRM gift export CSV.</p>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-pink-600 border border-pink-300 rounded-lg px-3 py-1.5 hover:bg-pink-50">
              <Download size={12}/> Template
            </button>
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

          <div className="flex items-center gap-3">
            <button
              onClick={runValidation}
              disabled={!mappingDraft.date || !mappingDraft.amount}
              className="px-5 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 disabled:opacity-40 flex items-center gap-2"
            >
              Validate <ChevronRight size={16}/>
            </button>
            {(!mappingDraft.date || !mappingDraft.amount) && (
              <p className="text-xs text-red-500">Map Date and Amount fields to continue</p>
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

          {/* Monthly aggregates preview */}
          {!hasHardErrors && monthlyRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <BarChart2 size={14}/> Monthly Aggregates Preview
                <span className="text-xs font-normal text-gray-400">({monthlyRows.length} months)</span>
              </h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Period</th>
                      <th className="px-3 py-2 text-right font-medium">Total Gifts</th>
                      <th className="px-3 py-2 text-right font-medium">Recurring</th>
                      <th className="px-3 py-2 text-right font-medium">One-time</th>
                      <th className="px-3 py-2 text-right font-medium">Avg Gift</th>
                      <th className="px-3 py-2 text-right font-medium">Active Patrons</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthlyRows.slice(0, 12).map(r => (
                      <tr key={r.period} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.period}</td>
                        <td className="px-3 py-2 text-right">${((r.recurring_giving_total||0) + (r.spontaneous_giving_total||0)).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-pink-700">${(r.recurring_giving_total||0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">${(r.spontaneous_giving_total||0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{r.avg_gift_size ? `$${r.avg_gift_size.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.total_active_patrons ?? '—'}</td>
                      </tr>
                    ))}
                    {monthlyRows.length > 12 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-center text-gray-400">
                          … {monthlyRows.length - 12} more month(s) not shown
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <Info size={11}/> Fields left blank (new_patrons, retention_rate) require multi-period history — can be filled later via Setup
              </p>
            </div>
          )}

          {/* Error rows download */}
          {validationResults.errorRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm font-medium text-red-700 mb-1">{validationResults.errorRows.length} rows skipped due to errors</p>
              <button
                onClick={() => {
                  const csv = 'row,date,amount,error\n' +
                    validationResults.errorRows.map(e =>
                      `${e.rowNum},"${e.dateStr}","${e.amtStr}","${!e.parsedDate?'bad date':'bad amount'}"`
                    ).join('\n')
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
              <dt className="text-gray-500">Gift rows (valid)</dt>
              <dd className="font-medium">{validRows.length.toLocaleString()} / {rawRows.length.toLocaleString()}</dd>
              <dt className="text-gray-500">Monthly rows to write</dt>
              <dd className="font-medium">{monthlyRows.length}</dd>
              <dt className="text-gray-500">Periods</dt>
              <dd className="font-medium text-xs">{monthlyRows.map(r=>r.period).join(', ')}</dd>
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
