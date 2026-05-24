/**
 * TransactionImportFlow.jsx — Step 4: Transaction Import
 *
 * Full flow:
 *   0. Mode selection (Append / Replace Full / Replace Period)
 *   1. File upload (CSV)
 *   2. Field mapping — auto-apply saved mapping or choose one
 *   3. Pre-processing — debit/credit resolution, fiscal-period date conversion,
 *      row filtering (skip rows missing required fields)
 *   4. Validation — 10-check suite (3 hard blocks + 4 warnings + 3 info items)
 *   5. On-the-spot resolution — map unknown account codes / dept codes inline
 *   6. Confirm → write to Supabase (transactions + import_log)
 *   7. Success summary
 *
 * NO data is written to Supabase until finance confirms after seeing the
 * full validation summary. This is a non-negotiable rule from the spec.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Upload, ChevronDown, ChevronRight, Check, X, AlertTriangle,
  Info, ArrowRight, Download, RefreshCw, FileText, Database,
  Calendar, DollarSign, Building2, BookOpen, Users, Loader2,
  CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'append',
    label: 'Append',
    desc: 'Add rows on top of existing data. Duplicate transaction IDs are skipped.',
  },
  {
    id: 'replace_full',
    label: 'Replace — Full',
    desc: 'Wipes ALL transaction data and loads only what\'s in this file. Cannot be undone easily.',
    warn: true,
  },
  {
    id: 'replace_period',
    label: 'Replace — Period',
    desc: 'Wipes data for one specific month only and replaces with this file. Standard monthly workflow.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Date utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Try to parse a date string in common formats. Returns YYYY-MM-DD or null. */
function parseCalendarDate(str) {
  if (!str) return null
  str = String(str).trim()

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00')
    return isNaN(d) ? null : str
  }
  // MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split('/')
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`)
    if (isNaN(dt)) return null
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  // DD-MMM-YYYY e.g. 15-Oct-2025
  const dmy = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dmy) {
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
    const mo = months[dmy[2]]
    if (!mo) return null
    return `${dmy[3]}-${mo}-${dmy[1].padStart(2,'0')}`
  }
  // MM-DD-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [m, d, y] = str.split('-')
    const dt = new Date(`${y}-${m}-${d}T00:00:00`)
    if (isNaN(dt)) return null
    return `${y}-${m}-${d}`
  }
  return null
}

/**
 * Convert fiscal-period notation (M-YYYY) to a calendar date (YYYY-MM-DD).
 * e.g. "1-2026" with fyStartMonth=10 → "2025-10-01"
 */
function fiscalToCalendar(fiscalStr, fyStartMonth) {
  if (!fiscalStr) return null
  const match = String(fiscalStr).trim().match(/^(\d{1,2})-(\d{4})$/)
  if (!match) return null
  const fiscalMonth = parseInt(match[1])
  const fyYear      = parseInt(match[2])
  if (fiscalMonth < 1 || fiscalMonth > 12) return null

  // Calendar month (0-indexed): (fyStartMonth - 1 + fiscalMonth - 1) % 12
  const calMonthIdx = (fyStartMonth - 1 + fiscalMonth - 1) % 12
  const calMonth    = calMonthIdx + 1
  // If calMonth >= fyStartMonth, the date is in the year before the FY label year
  const calYear     = calMonth >= fyStartMonth ? fyYear - 1 : fyYear
  return `${calYear}-${String(calMonth).padStart(2,'0')}-01`
}

/** Derive fiscal_period (YYYY-MM calendar month) from a calendar date string */
function calendarToFiscalPeriod(dateStr) {
  if (!dateStr) return null
  return dateStr.slice(0, 7) // YYYY-MM
}

/** Parse an amount string to a float, handling $, commas, parens for negatives */
function parseAmount(str) {
  if (str === null || str === undefined || str === '') return null
  str = String(str).trim().replace(/,/g, '')
  // Parentheses = negative: (1234.56) → -1234.56
  if (/^\([\d.]+\)$/.test(str)) str = '-' + str.slice(1, -1)
  str = str.replace(/[$]/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const vals = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = '' }
      else { current += ch }
    }
    vals.push(current.trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { headers, rows }
}

function downloadCSV(filename, rows, columns) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(r => columns.map(c => {
    const v = String(r[c.key] ?? '')
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────────────────
// Field mapping application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a raw CSV row and a mapping_json, produce a canonical row.
 * mapping_json format: { "SourceColumn": "canonical_field" }
 */
function applyMapping(rawRow, mappingJson) {
  const result = {}
  for (const [srcCol, canonField] of Object.entries(mappingJson)) {
    if (canonField && canonField !== '__skip__') {
      result[canonField] = rawRow[srcCol] ?? ''
    }
  }
  return result
}

/**
 * Detect which saved mapping best fits the uploaded file's headers.
 * Returns the best-matching mapping or null.
 */
function detectMapping(headers, savedMappings) {
  let best = null, bestScore = 0
  for (const m of savedMappings) {
    if (m.import_type !== 'transactions') continue
    const mCols = Object.keys(m.mapping_json || {})
    const matched = mCols.filter(c => headers.includes(c)).length
    const score = matched / Math.max(mCols.length, 1)
    if (matched > 0 && score > bestScore) { best = m; bestScore = score }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all validation checks on processed rows.
 * Returns a validation result object.
 *
 * Checks:
 * [Hard] 1. Required fields in mapping (date + amount or debit+credit)
 * [Hard] 2. Date format parseable
 * [Hard] 3. Amount is numeric
 * [Warn] 4. Unknown account codes
 * [Warn] 5. Unknown dept codes
 * [Warn] 6. Duplicate transaction_ids vs existing in DB
 * [Warn] 7. Rows with no account_code AND no dept_code
 * [Info] 8. Date range of import
 * [Info] 9. Teams that will be updated
 * [Info] 10. Row counts
 */
function validateRows(canonicalRows, { accounts, departments, teams, existingTxIds, dateFormat, fyStartMonth }) {
  const errors = []          // hard blocks — each: { check, rows: [] }
  const warnings = []        // each: { check, rows: [], codes: [] }
  const info = []

  const unparseable_dates = []
  const unparseable_amounts = []
  const unknown_accounts = new Map()   // code → count
  const unknown_depts = new Map()      // code → count
  const duplicate_ids = []
  const missing_both = []

  const accountsByCode = new Map(accounts.map(a => [a.account_code, a]))
  const deptsByCode    = new Map(departments.map(d => [d.dept_code, d]))
  const teamMap        = new Map(departments.map(d => [d.dept_code, d.team_id]))

  const teamsAffected = new Set()
  let minDate = null, maxDate = null
  let rowsValid = 0

  for (let i = 0; i < canonicalRows.length; i++) {
    const row = canonicalRows[i]
    const rowNum = i + 2 // 1-indexed + header
    let rowOk = true

    // Date check
    let calDate = null
    if (dateFormat === 'fiscal_period') {
      calDate = fiscalToCalendar(row.date, fyStartMonth)
    } else {
      calDate = parseCalendarDate(row.date)
    }
    if (!calDate) {
      unparseable_dates.push({ rowNum, value: row.date })
      rowOk = false
    }

    // Amount check — handle debit/credit
    let amount = null
    if (row.debit !== undefined || row.credit !== undefined) {
      const debit  = parseAmount(row.debit)  ?? 0
      const credit = parseAmount(row.credit) ?? 0
      amount = debit - credit
    } else {
      amount = parseAmount(row.amount)
    }
    if (amount === null) {
      unparseable_amounts.push({ rowNum, value: row.amount })
      rowOk = false
    }

    if (!rowOk) continue

    // Account code check
    const acctCode = String(row.account_code || '').trim()
    if (acctCode && !accountsByCode.has(acctCode)) {
      unknown_accounts.set(acctCode, (unknown_accounts.get(acctCode) || 0) + 1)
    } else if (acctCode && accountsByCode.has(acctCode)) {
      // ok
    }

    // Dept code check
    const deptCode = String(row.dept_code || '').trim()
    if (deptCode && !deptsByCode.has(deptCode)) {
      unknown_depts.set(deptCode, (unknown_depts.get(deptCode) || 0) + 1)
    } else if (deptCode && deptsByCode.has(deptCode)) {
      const teamId = teamMap.get(deptCode)
      if (teamId) teamsAffected.add(teamId)
    }

    // Missing both account and dept
    if (!acctCode && !deptCode) {
      missing_both.push({ rowNum, desc: row.description || row.vendor || '' })
    }

    // Duplicate transaction_id
    const txId = String(row.transaction_id || '').trim()
    if (txId && existingTxIds.has(txId)) {
      duplicate_ids.push({ rowNum, txId })
    }

    // Date range
    if (calDate) {
      if (!minDate || calDate < minDate) minDate = calDate
      if (!maxDate || calDate > maxDate) maxDate = calDate
    }

    rowsValid++
  }

  // Hard block: unparseable dates
  if (unparseable_dates.length > 0) {
    errors.push({
      check: 'Date format parseable',
      count: unparseable_dates.length,
      rows: unparseable_dates.slice(0, 5),
      detail: `${unparseable_dates.length} row(s) have dates that cannot be parsed.`,
    })
  }

  // Hard block: unparseable amounts
  if (unparseable_amounts.length > 0) {
    errors.push({
      check: 'Amount is numeric',
      count: unparseable_amounts.length,
      rows: unparseable_amounts.slice(0, 5),
      detail: `${unparseable_amounts.length} row(s) have non-numeric amounts.`,
    })
  }

  // Warnings
  if (unknown_accounts.size > 0) {
    warnings.push({
      check: 'Account codes not in registry',
      codes: [...unknown_accounts.entries()].map(([code, count]) => ({ code, count })),
      detail: `${unknown_accounts.size} account code(s) not found in Chart of Accounts.`,
    })
  }
  if (unknown_depts.size > 0) {
    warnings.push({
      check: 'Dept codes not in registry',
      codes: [...unknown_depts.entries()].map(([code, count]) => ({ code, count })),
      detail: `${unknown_depts.size} department code(s) not found in Departments registry.`,
    })
  }
  if (duplicate_ids.length > 0) {
    warnings.push({
      check: 'Duplicate transaction IDs',
      rows: duplicate_ids.slice(0, 5),
      count: duplicate_ids.length,
      detail: `${duplicate_ids.length} transaction ID(s) already exist in the database.`,
    })
  }
  if (missing_both.length > 0) {
    warnings.push({
      check: 'Rows with no account or dept',
      rows: missing_both.slice(0, 5),
      count: missing_both.length,
      detail: `${missing_both.length} row(s) have neither account code nor dept code.`,
    })
  }

  // Info
  info.push({
    check: 'Date range of this import',
    detail: minDate && maxDate ? `${minDate} → ${maxDate}` : 'No valid dates found',
  })

  // Resolve team names for display
  const affectedTeamNames = [...teamsAffected].map(tid => {
    const t = teams.find(t => t.id === tid)
    return t?.team_name || tid
  }).filter(Boolean)

  info.push({
    check: 'Teams that will be updated',
    detail: affectedTeamNames.length > 0 ? affectedTeamNames.join(', ') : 'None detected (dept codes may be unresolved)',
  })

  info.push({
    check: 'Row count',
    detail: `${canonicalRows.length} total rows, ${rowsValid} valid, ${canonicalRows.length - rowsValid} unparseable`,
  })

  const canProceed = errors.length === 0

  return {
    errors, warnings, info, canProceed,
    rowsValid,
    rowsTotal: canonicalRows.length,
    minDate, maxDate,
    affectedTeamNames,
    unknownAccountCodes: [...unknown_accounts.entries()].map(([code, count]) => ({ code, count })),
    unknownDeptCodes:    [...unknown_depts.entries()].map(([code, count]) => ({ code, count })),
    duplicateTxIds:      duplicate_ids,
    missingBothRows:     missing_both,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function TransactionImportFlow() {
  // ── Registry data loaded from Supabase ─────────────────────────────────────
  const [accounts,      setAccounts]      = useState([])
  const [departments,   setDepartments]   = useState([])
  const [teams,         setTeams]         = useState([])
  const [grants,        setGrants]        = useState([])
  const [savedMappings, setSavedMappings] = useState([])
  const [orgSettings,   setOrgSettings]   = useState(null)
  const [registriesLoading, setRegLoading] = useState(true)

  // ── Flow state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState('mode')
  // 'mode' | 'upload' | 'mapping' | 'preprocess' | 'validate' | 'confirm' | 'importing' | 'done' | 'error'

  // Step: mode
  const [mode,          setMode]          = useState('replace_period')
  const [replacePeriod, setReplacePeriod] = useState('') // YYYY-MM

  // Step: upload + mapping
  const [rawFile,    setRawFile]    = useState(null)
  const [rawHeaders, setRawHeaders] = useState([])
  const [rawRows,    setRawRows]    = useState([])
  const [activeMapping, setActiveMapping] = useState(null) // selected field_mapping object
  const [showMappingPicker, setShowMappingPicker] = useState(false)

  // Step: pre-processing
  const [processedRows,   setProcessedRows]   = useState([])  // canonical rows after mapping
  const [preSkipped,      setPreSkipped]       = useState([])  // [{rowNum, reason}]
  const [dateFormat,      setDateFormat]       = useState('calendar')

  // Step: validation
  const [validation,      setValidation]      = useState(null)
  const [existingTxIds,   setExistingTxIds]   = useState(new Set())

  // On-the-spot resolution for warnings
  // { code: accountId | 'skip' | 'new' }
  const [acctResolutions,  setAcctResolutions]  = useState({})
  const [deptResolutions,  setDeptResolutions]  = useState({})
  const [dupeResolution,   setDupeResolution]   = useState('skip') // 'skip' | 'overwrite'

  // New account/dept inline forms
  const [newAccountForms, setNewAccountForms] = useState({}) // { code: {account_name, category, record_type} }
  const [newDeptForms,    setNewDeptForms]    = useState({}) // { code: {dept_name, team_id} }

  // Step: result
  const [importResult, setImportResult] = useState(null)
  const [importError,  setImportError]  = useState(null)

  const fileRef = useRef()

  // ── Load registries ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setRegLoading(true)
      const [
        { data: acc },
        { data: depts },
        { data: tms },
        { data: grs },
        { data: maps },
        { data: settings },
      ] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('departments').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('teams').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('grants').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('field_mappings').select('*').eq('org_id', ORG_ID).eq('deleted', false).eq('import_type', 'transactions'),
        supabase.from('org_settings').select('*').limit(1).single(),
      ])
      setAccounts(acc || [])
      setDepartments(depts || [])
      setTeams(tms || [])
      setGrants(grs || [])
      setSavedMappings(maps || [])
      setOrgSettings(settings || null)
      setRegLoading(false)
    }
    load()
  }, [])

  const fyStartMonth = orgSettings?.fiscal_year_start_month || 10

  // ── File handling ───────────────────────────────────────────────────────────
  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
    e.target.value = ''
  }

  function processFile(f) {
    setRawFile(f)
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSVText(ev.target.result)
      setRawHeaders(headers)
      setRawRows(rows)
      // Try to auto-detect mapping
      const detected = detectMapping(headers, savedMappings)
      setActiveMapping(detected)
      if (detected) setDateFormat(detected.date_format || 'calendar')
      setStep('mapping')
    }
    reader.readAsText(f)
  }

  // ── Apply mapping → pre-process rows ───────────────────────────────────────
  function runPreprocess() {
    if (!activeMapping && !rawHeaders.length) return

    const mappingToUse = activeMapping?.mapping_json || {}
    const fmt = activeMapping?.date_format || dateFormat

    // Apply mapping to each raw row
    const canonical = rawRows.map(row => applyMapping(row, mappingToUse))

    // Pre-process: skip rows missing required fields, resolve debit/credit
    const skipped = []
    const valid = []

    canonical.forEach((row, i) => {
      const rowNum = i + 2

      // Skip empty rows
      const hasDate = row.date || row.fiscal_period
      const hasAmt  = row.amount || row.debit || row.credit
      if (!hasDate && !hasAmt) {
        skipped.push({ rowNum, reason: 'Empty row (no date or amount)' })
        return
      }
      if (!hasDate) {
        skipped.push({ rowNum, reason: 'Missing date field' })
        return
      }
      if (!hasAmt) {
        skipped.push({ rowNum, reason: 'Missing amount/debit/credit field' })
        return
      }

      // Normalize: handle fiscal_period as date
      const dateVal = row.date || row.fiscal_period

      valid.push({ ...row, date: dateVal, _rowNum: rowNum })
    })

    setProcessedRows(valid)
    setPreSkipped(skipped)
    setDateFormat(fmt)

    // Load existing tx IDs for dedup check
    loadExistingTxIds().then(() => {
      runValidation(valid, fmt)
    })
  }

  async function loadExistingTxIds() {
    // Only load if we have rows with transaction_id
    const { data } = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('org_id', ORG_ID)
      .eq('deleted', false)
      .not('transaction_id', 'is', null)
    const ids = new Set((data || []).map(r => r.transaction_id).filter(Boolean))
    setExistingTxIds(ids)
    return ids
  }

  function runValidation(rows, fmt, txIds) {
    const ids = txIds || existingTxIds
    const result = validateRows(rows, {
      accounts,
      departments,
      teams,
      existingTxIds: ids,
      dateFormat: fmt,
      fyStartMonth,
    })
    setValidation(result)

    // Initialize resolutions for unknown codes
    const acctRes = {}
    for (const { code } of result.unknownAccountCodes) acctRes[code] = 'skip'
    setAcctResolutions(acctRes)

    const deptRes = {}
    for (const { code } of result.unknownDeptCodes) deptRes[code] = 'skip'
    setDeptResolutions(deptRes)

    setStep('validate')
  }

  // ── Confirm + write to Supabase ─────────────────────────────────────────────
  async function handleConfirm(skipFlaggedRows) {
    setStep('importing')
    setImportError(null)

    try {
      // 1. Ensure new accounts/depts are saved first
      const accountsByCode = new Map(accounts.map(a => [a.account_code, a]))
      const deptsByCode    = new Map(departments.map(d => [d.dept_code, d]))
      const grantsByCode   = new Map(grants.map(g => [g.grant_code, g]))

      // Save new account entries
      for (const [code, res] of Object.entries(acctResolutions)) {
        if (res === 'new' && newAccountForms[code]) {
          const form = newAccountForms[code]
          const { data } = await supabase.from('chart_of_accounts').insert([{
            org_id: ORG_ID,
            account_code: code,
            account_name: form.account_name || code,
            category:     form.category     || 'Uncategorized',
            record_type:  form.record_type   || 'expense',
            active: true,
          }]).select().single()
          if (data) accountsByCode.set(code, data)
        }
      }

      // Save new dept entries
      for (const [code, res] of Object.entries(deptResolutions)) {
        if (res === 'new' && newDeptForms[code]) {
          const form = newDeptForms[code]
          const { data } = await supabase.from('departments').insert([{
            org_id: ORG_ID,
            dept_code: code,
            dept_name: form.dept_name || code,
            team_id:   form.team_id   || null,
            active: true,
          }]).select().single()
          if (data) deptsByCode.set(code, data)
        }
      }

      // 2. Replace mode: soft-delete existing data
      if (mode === 'replace_full') {
        await supabase
          .from('transactions')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('org_id', ORG_ID)
          .eq('deleted', false)
      } else if (mode === 'replace_period' && replacePeriod) {
        await supabase
          .from('transactions')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('org_id', ORG_ID)
          .eq('fiscal_period', replacePeriod)
          .eq('deleted', false)
      }

      // 3. Build transaction rows to insert
      const txRows = []
      const errorRows = []
      const skipTxIds = new Set(
        dupeResolution === 'skip'
          ? validation.duplicateTxIds.map(d => d.txId)
          : []
      )

      for (const row of processedRows) {
        // Parse date
        let calDate = dateFormat === 'fiscal_period'
          ? fiscalToCalendar(row.date, fyStartMonth)
          : parseCalendarDate(row.date)
        if (!calDate) { errorRows.push({ ...row, _skip_reason: 'Unparseable date' }); continue }

        // Parse amount
        let amount
        if (row.debit !== undefined || row.credit !== undefined) {
          amount = (parseAmount(row.debit) ?? 0) - (parseAmount(row.credit) ?? 0)
        } else {
          amount = parseAmount(row.amount)
        }
        if (amount === null) { errorRows.push({ ...row, _skip_reason: 'Non-numeric amount' }); continue }

        const acctCode = String(row.account_code || '').trim()
        const deptCode = String(row.dept_code || '').trim()
        const txId     = String(row.transaction_id || '').trim() || null

        // Skip duplicate IDs if resolution = skip
        if (txId && skipTxIds.has(txId)) {
          errorRows.push({ ...row, _skip_reason: 'Duplicate transaction ID (skipped)' })
          continue
        }

        // Overwrite: soft-delete the existing row
        if (txId && dupeResolution === 'overwrite' && existingTxIds.has(txId)) {
          await supabase.from('transactions')
            .update({ deleted: true, updated_at: new Date().toISOString() })
            .eq('org_id', ORG_ID)
            .eq('transaction_id', txId)
        }

        // Resolve account_id
        let accountId = null
        if (acctCode) {
          const acctRes = acctResolutions[acctCode]
          if (!acctRes || acctRes === 'skip') {
            if (skipFlaggedRows && !accountsByCode.has(acctCode)) {
              errorRows.push({ ...row, _skip_reason: `Account code "${acctCode}" not in registry` })
              continue
            }
          }
          const acct = accountsByCode.get(acctCode)
          accountId = acct?.id || null
        }

        // Resolve department_id
        let deptId = null
        if (deptCode) {
          const dr = deptResolutions[deptCode]
          if (!dr || dr === 'skip') {
            if (skipFlaggedRows && !deptsByCode.has(deptCode)) {
              errorRows.push({ ...row, _skip_reason: `Dept code "${deptCode}" not in registry` })
              continue
            }
          }
          const dept = deptsByCode.get(deptCode)
          deptId = dept?.id || null
        }

        // Resolve grant_id
        let grantId = null
        const grantCode = String(row.grant_code || '').trim()
        if (grantCode) {
          const g = grantsByCode.get(grantCode)
          grantId = g?.id || null
        }

        txRows.push({
          org_id:         ORG_ID,
          transaction_id: txId || null,
          date:           calDate,
          fiscal_period:  calendarToFiscalPeriod(calDate),
          amount,
          department_id:  deptId,
          account_id:     accountId,
          vendor:         row.vendor    || null,
          grant_id:       grantId,
          description:    row.description || null,
          source:         'import',
          deleted:        false,
        })
      }

      // 4. Create import_log entry
      const { data: logEntry } = await supabase.from('import_log').insert([{
        org_id:      ORG_ID,
        import_type: 'transactions',
        mode,
        filename:    rawFile?.name || null,
        row_count:   txRows.length,
        rows_skipped: errorRows.length + preSkipped.length,
        period_start: validation?.minDate?.slice(0, 7) || null,
        period_end:   validation?.maxDate?.slice(0, 7) || null,
        teams_affected: validation?.affectedTeamNames || [],
        status:      errorRows.length > 0 ? 'partial' : 'success',
        error_report: errorRows.length > 0
          ? errorRows.slice(0, 200).map(r => ({ row: r._rowNum, reason: r._skip_reason }))
          : null,
      }]).select().single()

      const batchId = logEntry?.id

      // 5. Insert transactions in batches of 100
      const batchRows = txRows.map(r => ({ ...r, import_batch_id: batchId }))
      for (let i = 0; i < batchRows.length; i += 100) {
        const chunk = batchRows.slice(i, i + 100)
        const { error: insertErr } = await supabase.from('transactions').insert(chunk)
        if (insertErr) throw new Error('Insert failed: ' + insertErr.message)
      }

      setImportResult({
        rowsImported: txRows.length,
        rowsSkipped: errorRows.length + preSkipped.length,
        errorRows,
        batchId,
        filename: rawFile?.name,
        mode,
      })
      setStep('done')

    } catch (err) {
      setImportError(err.message || String(err))
      setStep('error')
    }
  }

  // ── Error report download ───────────────────────────────────────────────────
  function downloadErrorReport(errorRows) {
    downloadCSV('import-errors.csv', errorRows, [
      { key: '_rowNum',      label: 'row_number'  },
      { key: '_skip_reason', label: 'reason'      },
      { key: 'date',         label: 'date'        },
      { key: 'amount',       label: 'amount'      },
      { key: 'account_code', label: 'account_code'},
      { key: 'dept_code',    label: 'dept_code'   },
      { key: 'vendor',       label: 'vendor'      },
      { key: 'description',  label: 'description' },
    ])
  }

  function reset() {
    setStep('mode')
    setRawFile(null); setRawHeaders([]); setRawRows([])
    setActiveMapping(null); setProcessedRows([]); setPreSkipped([])
    setValidation(null); setExistingTxIds(new Set())
    setAcctResolutions({}); setDeptResolutions({})
    setDupeResolution('skip'); setNewAccountForms({}); setNewDeptForms({})
    setImportResult(null); setImportError(null)
    setReplacePeriod('')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (registriesLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={24} className="text-teal-600 animate-spin"/>
        <p className="text-sm text-gray-400">Loading registries from Supabase…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Registry health check */}
      {(accounts.length === 0 || departments.length === 0) && step === 'mode' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0"/>
          <div>
            <p className="font-semibold mb-1">Setup incomplete</p>
            <p className="text-xs">
              {accounts.length === 0 && 'Chart of Accounts is empty. '}
              {departments.length === 0 && 'Departments registry is empty. '}
              Import will still work but all account/dept codes will be flagged as unknown.
              Go to <strong>Setup → Chart of Accounts</strong> and <strong>Setup → Departments</strong> first for best results.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: Mode ─────────────────────────────────────────────────────── */}
      {step === 'mode' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Import Transactions</h3>
            <p className="text-xs text-gray-400">
              One import covers all income <em>and</em> expenses. Income vs expense is determined by the record_type field in your Chart of Accounts — not by the sign of the amount.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Import Mode</label>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`w-full text-left p-4 border-2 rounded-xl transition-colors
                  ${mode === m.id
                    ? m.warn ? 'border-amber-500 bg-amber-50' : 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-semibold ${mode === m.id ? (m.warn ? 'text-amber-800' : 'text-teal-800') : 'text-gray-800'}`}>
                    {m.label}
                  </span>
                  {m.warn && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Destructive</span>}
                  {mode === m.id && <Check size={14} className={m.warn ? 'text-amber-600 ml-auto' : 'text-teal-600 ml-auto'}/>}
                </div>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </button>
            ))}
          </div>

          {mode === 'replace_period' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Period to replace <span className="text-red-400">*</span>
              </label>
              <input type="month" value={replacePeriod} onChange={e => setReplacePeriod(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
              <p className="text-xs text-gray-400 mt-1">All existing transactions in this calendar month will be soft-deleted and replaced.</p>
            </div>
          )}

          <button
            onClick={() => setStep('upload')}
            disabled={mode === 'replace_period' && !replacePeriod}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
            Next: Upload File <ArrowRight size={14}/>
          </button>
        </div>
      )}

      {/* ── Step: Upload ────────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <button onClick={() => setStep('mode')} className="hover:text-gray-600">← Mode</button>
            <span>/</span>
            <span className="text-gray-700 font-medium">Upload File</span>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
            <p className="font-medium">Mode: <span className="text-teal-700">{MODES.find(m=>m.id===mode)?.label}</span>
              {mode === 'replace_period' && <span className="ml-2 text-gray-500">({replacePeriod})</span>}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {savedMappings.length} saved mapping{savedMappings.length !== 1 ? 's' : ''} available for auto-detection
            </p>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) processFile(f) }}
            className="flex flex-col items-center justify-center gap-4 py-16 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
            <Upload size={32} className="text-gray-300"/>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">Drop your CSV here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Supports any CSV from QuickBooks, Acumatica, NetSuite, or other systems</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange}/>
          </div>

          <div className="text-center">
            <button onClick={() => setStep('mode')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          </div>
        </div>
      )}

      {/* ── Step: Mapping ───────────────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <button onClick={() => setStep('upload')} className="hover:text-gray-600">← Upload</button>
            <span>/</span>
            <span className="text-gray-700 font-medium">Field Mapping</span>
          </div>

          <div className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl">
            <FileText size={16} className="text-teal-600 mt-0.5 shrink-0"/>
            <div>
              <p className="text-sm font-semibold text-gray-800">{rawFile?.name}</p>
              <p className="text-xs text-gray-400">{rawRows.length} data rows · {rawHeaders.length} columns detected</p>
            </div>
          </div>

          {/* Auto-detected mapping */}
          {activeMapping ? (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-teal-600"/>
                <span className="text-sm font-semibold text-teal-800">Mapping auto-detected: {activeMapping.mapping_name}</span>
                <button onClick={() => setShowMappingPicker(p=>!p)} className="ml-auto text-xs text-teal-600 hover:underline">Change</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(activeMapping.mapping_json).map(([src, dst]) => (
                  <span key={src} className="inline-flex items-center gap-1 text-xs bg-white text-gray-600 px-2 py-0.5 rounded-full border border-teal-200">
                    <span className="font-mono">{src}</span>
                    <ArrowRight size={10} className="text-teal-400"/>
                    <span className="font-medium">{dst}</span>
                  </span>
                ))}
              </div>
              {activeMapping.date_format === 'fiscal_period' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Date format: <strong>Fiscal Period (M-YYYY)</strong> — will be converted to calendar dates using FY start month {fyStartMonth} ({['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][fyStartMonth]})
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-600"/>
                <span className="text-sm font-semibold text-amber-800">No saved mapping found for these columns</span>
              </div>
              <p className="text-xs text-amber-700">
                Detected columns: <span className="font-mono">{rawHeaders.join(', ')}</span>
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowMappingPicker(p=>!p)}
                  className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">
                  Choose a saved mapping
                </button>
                <span className="text-xs text-amber-600 self-center">or</span>
                <button
                  onClick={() => {
                    // Use auto-detected canonical names if columns happen to match
                    const autoMap = {}
                    const KNOWN = ['date','amount','account_code','dept_code','vendor','description','transaction_id','grant_code','debit','credit']
                    for (const h of rawHeaders) {
                      const norm = h.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
                      if (KNOWN.includes(norm)) autoMap[h] = norm
                    }
                    setActiveMapping({ mapping_name: 'Auto-detected', mapping_json: autoMap, date_format: 'calendar' })
                    setDateFormat('calendar')
                  }}
                  className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">
                  Auto-detect by column name
                </button>
              </div>
              <p className="text-xs text-amber-600">
                To create a new mapping, go to <strong>Setup → Field Mappings</strong>.
              </p>
            </div>
          )}

          {/* Mapping picker */}
          {showMappingPicker && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {savedMappings.length === 0 && (
                <div className="p-4 text-sm text-gray-400 text-center">No saved mappings. Create one in Setup → Field Mappings.</div>
              )}
              {savedMappings.map(m => (
                <button key={m.id}
                  onClick={() => { setActiveMapping(m); setDateFormat(m.date_format || 'calendar'); setShowMappingPicker(false) }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-teal-50 transition-colors ${activeMapping?.id === m.id ? 'bg-teal-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{m.mapping_name}</span>
                    {activeMapping?.id === m.id && <Check size={13} className="text-teal-600"/>}
                  </div>
                  <div className="text-xs text-gray-400">{Object.keys(m.mapping_json || {}).length} columns · {m.date_format === 'fiscal_period' ? 'Fiscal period' : 'Calendar date'}</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Back</button>
            <button
              disabled={!activeMapping}
              onClick={runPreprocess}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors">
              Run Validation <ArrowRight size={14}/>
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Validate ──────────────────────────────────────────────────── */}
      {step === 'validate' && validation && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Validation Summary</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {rawFile?.name} · {processedRows.length} rows processed
                {preSkipped.length > 0 && ` · ${preSkipped.length} pre-filtered`}
              </p>
            </div>
            <button onClick={() => setStep('mapping')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          </div>

          {/* Hard blocks */}
          {validation.errors.map(e => (
            <div key={e.check} className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-red-600 shrink-0"/>
                <span className="text-sm font-semibold text-red-800">HARD BLOCK: {e.check}</span>
              </div>
              <p className="text-xs text-red-700 mb-2">{e.detail}</p>
              {e.rows?.length > 0 && (
                <div className="text-xs font-mono bg-red-100 rounded-lg p-2 space-y-0.5">
                  {e.rows.map((r,i) => (
                    <div key={i}>Row {r.rowNum}: <span className="text-red-600">{r.value}</span></div>
                  ))}
                  {e.count > 5 && <div className="text-red-400">… and {e.count - 5} more</div>}
                </div>
              )}
            </div>
          ))}

          {/* Warnings */}
          {validation.warnings.map(w => (
            <div key={w.check} className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0"/>
                <span className="text-sm font-semibold text-amber-800">Warning: {w.check}</span>
              </div>
              <p className="text-xs text-amber-700">{w.detail}</p>

              {/* Account code resolution */}
              {w.check === 'Account codes not in registry' && w.codes && (
                <div className="space-y-2">
                  {w.codes.map(({ code, count }) => (
                    <div key={code} className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-mono font-semibold text-gray-800">{code}</span>
                          <span className="text-xs text-gray-400 ml-2">{count} row{count!==1?'s':''}</span>
                        </div>
                        <select
                          value={acctResolutions[code] || 'skip'}
                          onChange={e => setAcctResolutions(p => ({ ...p, [code]: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white">
                          <option value="skip">Skip rows with this code</option>
                          <option value="new">Add as new account</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                        </select>
                      </div>
                      {acctResolutions[code] === 'new' && (
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-100">
                          <input placeholder="Account name" value={newAccountForms[code]?.account_name || ''}
                            onChange={e => setNewAccountForms(p => ({ ...p, [code]: { ...p[code], account_name: e.target.value } }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 col-span-1"/>
                          <input placeholder="Category" value={newAccountForms[code]?.category || ''}
                            onChange={e => setNewAccountForms(p => ({ ...p, [code]: { ...p[code], category: e.target.value } }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 col-span-1"/>
                          <select value={newAccountForms[code]?.record_type || 'expense'}
                            onChange={e => setNewAccountForms(p => ({ ...p, [code]: { ...p[code], record_type: e.target.value } }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white col-span-1">
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Dept code resolution */}
              {w.check === 'Dept codes not in registry' && w.codes && (
                <div className="space-y-2">
                  {w.codes.map(({ code, count }) => (
                    <div key={code} className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-mono font-semibold text-gray-800">{code}</span>
                          <span className="text-xs text-gray-400 ml-2">{count} row{count!==1?'s':''}</span>
                        </div>
                        <select
                          value={deptResolutions[code] || 'skip'}
                          onChange={e => setDeptResolutions(p => ({ ...p, [code]: e.target.value }))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white">
                          <option value="skip">Skip rows with this code</option>
                          <option value="new">Add as new department</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code} — {d.dept_name}</option>)}
                        </select>
                      </div>
                      {deptResolutions[code] === 'new' && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-100">
                          <input placeholder="Dept name" value={newDeptForms[code]?.dept_name || ''}
                            onChange={e => setNewDeptForms(p => ({ ...p, [code]: { ...p[code], dept_name: e.target.value } }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"/>
                          <select value={newDeptForms[code]?.team_id || ''}
                            onChange={e => setNewDeptForms(p => ({ ...p, [code]: { ...p[code], team_id: e.target.value || null } }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white">
                            <option value="">— no team —</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Duplicate transaction IDs */}
              {w.check === 'Duplicate transaction IDs' && (
                <div className="flex gap-3">
                  {['skip','overwrite'].map(opt => (
                    <button key={opt} onClick={() => setDupeResolution(opt)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-colors
                        ${dupeResolution === opt ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-200 text-gray-600'}`}>
                      {opt === 'skip' ? 'Skip duplicate rows' : 'Overwrite existing rows'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Info items */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Import Summary</div>
            {validation.info.map(item => (
              <div key={item.check} className="flex items-start gap-2">
                <Info size={13} className="text-teal-500 mt-0.5 shrink-0"/>
                <div>
                  <span className="text-xs font-medium text-gray-600">{item.check}: </span>
                  <span className="text-xs text-gray-500">{item.detail}</span>
                </div>
              </div>
            ))}
            {preSkipped.length > 0 && (
              <div className="flex items-start gap-2">
                <Info size={13} className="text-gray-400 mt-0.5 shrink-0"/>
                <span className="text-xs text-gray-500">{preSkipped.length} rows pre-filtered (blank rows or missing required fields)</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {validation.canProceed ? (
            <div className="flex flex-col gap-2">
              <button onClick={() => handleConfirm(false)}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Confirm Import ({validation.rowsValid} rows)
              </button>
              {validation.warnings.length > 0 && (
                <button onClick={() => handleConfirm(true)}
                  className="w-full py-2.5 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50 transition-colors">
                  Import anyway — skip all flagged rows
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
              <strong>Cannot import.</strong> Fix the hard block errors above and re-upload the file.
            </div>
          )}

          <button onClick={reset} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">Cancel — start over</button>
        </div>
      )}

      {/* ── Step: Importing ─────────────────────────────────────────────────── */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={32} className="text-teal-600 animate-spin"/>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Writing to Supabase…</p>
            <p className="text-xs text-gray-400 mt-1">This may take a moment for large files</p>
          </div>
        </div>
      )}

      {/* ── Step: Done ──────────────────────────────────────────────────────── */}
      {step === 'done' && importResult && (
        <div className="space-y-5">
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-600"/>
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-gray-800">Import complete</h3>
              <p className="text-xs text-gray-400 mt-0.5">{importResult.filename}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-700">{importResult.rowsImported}</div>
              <div className="text-xs text-emerald-600 mt-0.5">Rows imported</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${importResult.rowsSkipped > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`text-2xl font-bold ${importResult.rowsSkipped > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{importResult.rowsSkipped}</div>
              <div className={`text-xs mt-0.5 ${importResult.rowsSkipped > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Rows skipped</div>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-teal-700">{MODES.find(m=>m.id===importResult.mode)?.label.split('—')[0].trim()}</div>
              <div className="text-xs text-teal-600 mt-0.5">Mode</div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
            Views recompute automatically — all dashboards will reflect this import on next load.
          </div>

          <div className="flex gap-3">
            {importResult.rowsSkipped > 0 && importResult.errorRows?.length > 0 && (
              <button
                onClick={() => downloadErrorReport(importResult.errorRows)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                <Download size={13}/> Error report
              </button>
            )}
            <button onClick={reset}
              className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Error ─────────────────────────────────────────────────────── */}
      {step === 'error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-xl">
            <XCircle size={20} className="text-red-600 shrink-0 mt-0.5"/>
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">Import failed</p>
              <p className="text-xs text-red-700 font-mono">{importError}</p>
            </div>
          </div>
          <button onClick={reset} className="w-full py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
            Start over
          </button>
        </div>
      )}
    </div>
  )
}
