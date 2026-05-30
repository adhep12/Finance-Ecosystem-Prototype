/**
 * BudgetImportFlow.jsx — Step 5: Budget Import
 *
 * Key differences from Transaction Import:
 *  - category is denormalized from chart_of_accounts at import time (stored on budget rows)
 *  - period can be YYYY-MM (monthly), YYYY-Q1..Q4 (quarterly), YYYY (annual), or blank (annual)
 *  - Monthly distribution: annual ÷ 12, quarterly ÷ 3; always stored as monthly grain
 *  - "More granular wins": monthly overrides quarterly overrides annual for same key
 *  - Default scenario = "Planned Spend" when column is absent
 *  - Write target: `budgets` table (not `transactions`)
 *
 * Validation (9 checks):
 *  Hard:  1. Amount numeric  2. Either account_code or category present  3. Period parseable
 *  Warn:  4. Unknown dept codes  5. Unknown account codes  6. Rows with neither account nor category
 *  Info:  7. Scenarios detected  8. Distribution breakdown  9. Row counts after expansion
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Upload, ArrowRight, Check, X, AlertTriangle, Info,
  Download, Loader2, CheckCircle2, XCircle, AlertCircle,
  FileText, TrendingUp,
} from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import LastImportSummary from '../components/LastImportSummary'
import PeriodMultiPicker from '../components/PeriodMultiPicker'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  {
    id: 'append',
    label: 'Append',
    icon: '＋',
    desc: 'Add budget rows on top of existing data. Duplicate period/scenario/dept combinations are left as-is.',
  },
  {
    id: 'replace_full',
    label: 'Replace — All',
    icon: '↻',
    desc: 'Wipes ALL budget data for every scenario and loads only what\'s in this file.',
    warn: true,
  },
  {
    id: 'replace_period',
    label: 'Replace — Period',
    icon: '⊘',
    desc: 'Wipes budget rows for one specific calendar month and replaces with this file. Use after mid-year revisions.',
  },
  {
    id: 'replace_scenario',
    label: 'Replace — Scenario',
    icon: '↺',
    desc: 'Wipes all rows for one named scenario and replaces with this file. Safe way to update a single budget version.',
  },
]

// Calendar quarter → 3 months (1-based)
const QUARTER_MONTHS = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] }

// ─────────────────────────────────────────────────────────────────────────────
// Period parsing & distribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a period string into a typed descriptor.
 * Supported formats: YYYY-MM (monthly), YYYY-Q1..Q4 (quarterly), YYYY (annual), '' (annual)
 */
function parsePeriod(str) {
  if (!str || String(str).trim() === '') return { type: 'annual', year: null }
  str = String(str).trim()
  if (/^\d{4}-\d{2}$/.test(str)) return { type: 'monthly', period: str }
  const qm = str.match(/^(\d{4})-?Q([1-4])$/i)
  if (qm) return { type: 'quarterly', year: parseInt(qm[1]), quarter: parseInt(qm[2]) }
  if (/^\d{4}$/.test(str)) return { type: 'annual', year: parseInt(str) }
  return { type: 'unknown', raw: str }
}

/**
 * Compute current fiscal year label from today + fyStartMonth.
 * e.g. today=May 2026, fyStart=10 → FY2026 (Oct 2025–Sep 2026, we're inside it)
 */
function currentFYYear(fyStartMonth) {
  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  return m >= fyStartMonth ? y + 1 : y
}

/**
 * Distribute a single budget row into monthly periods.
 * Returns array of { period:'YYYY-MM', amount, period_type }
 */
function distributeToPeriods(periodStr, amount, fyStartMonth, defaultFYYear) {
  const parsed = parsePeriod(periodStr)

  if (parsed.type === 'monthly') {
    return [{ period: parsed.period, amount, period_type: 'monthly' }]
  }

  if (parsed.type === 'quarterly') {
    const months = QUARTER_MONTHS[parsed.quarter] || []
    const monthlyAmt = Math.round((amount / 3) * 100) / 100
    // Adjust last month for rounding
    const rows = months.map((m, i) => ({
      period: `${parsed.year}-${String(m).padStart(2,'0')}`,
      amount: i === 2 ? Math.round((amount - monthlyAmt * 2) * 100) / 100 : monthlyAmt,
      period_type: 'quarterly',
    }))
    return rows
  }

  if (parsed.type === 'annual' || parsed.type === 'unknown') {
    const fyYear = parsed.year || defaultFYYear
    const monthlyAmt = Math.round((amount / 12) * 100) / 100
    const rows = []
    for (let i = 0; i < 12; i++) {
      const calMonth = ((fyStartMonth - 1 + i) % 12) + 1
      const calYear  = calMonth >= fyStartMonth ? fyYear - 1 : fyYear
      const adj = i === 11 ? Math.round((amount - monthlyAmt * 11) * 100) / 100 : monthlyAmt
      rows.push({
        period: `${calYear}-${String(calMonth).padStart(2,'0')}`,
        amount: adj,
        period_type: 'annual',
      })
    }
    return rows
  }

  return []
}

/**
 * Apply "more granular wins" de-duplication.
 * For the same (dept_code, account_code|category, scenario, period),
 * keep monthly over quarterly over annual.
 */
function applyGranularityWins(rows) {
  const PRIORITY = { monthly: 3, quarterly: 2, annual: 1 }
  const map = new Map()
  for (const row of rows) {
    const key = [
      row.dept_code || '',
      row.account_code || row.category || '',
      row.scenario || '',
      row.period,
    ].join('|')
    const existing = map.get(key)
    if (!existing || (PRIORITY[row.period_type] || 0) > (PRIORITY[existing.period_type] || 0)) {
      map.set(key, row)
    }
  }
  return [...map.values()]
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const vals = []; let cur = ''; let inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    vals.push(cur.trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { headers, rows }
}

function parseAmount(str) {
  if (!str && str !== 0) return null
  str = String(str).trim().replace(/,/g, '')
  if (/^\([\d.]+\)$/.test(str)) str = '-' + str.slice(1, -1)
  str = str.replace(/[$]/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

function applyMapping(rawRow, mappingJson) {
  const result = {}
  for (const [src, dst] of Object.entries(mappingJson)) {
    if (dst && dst !== '__skip__') result[dst] = rawRow[src] ?? ''
  }
  return result
}

function detectMapping(headers, savedMappings) {
  let best = null, bestScore = 0
  for (const m of savedMappings) {
    if (m.import_type !== 'budget') continue
    const mCols = Object.keys(m.mapping_json || {})
    const matched = mCols.filter(c => headers.includes(c)).length
    const score = matched / Math.max(mCols.length, 1)
    if (matched > 0 && score > bestScore) { best = m; bestScore = score }
  }
  return best
}

function downloadBudgetTemplate() {
  const headers = 'dept_code,account_code,scenario,period,amount,period_type'
  const example = 'MEDIA,4000,Planned Spend,2025-01,50000,monthly'
  const blob = new Blob([headers + '\n' + example + '\n'], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'budget_import_template.csv' })
  a.click()
}

function downloadBudgetSample() {
  const headers = 'dept_code,account_code,scenario,period,amount,period_type'
  const rows = [
    'MEDIA,4000,Planned Spend,2025-01,50000,monthly',
    'MEDIA,4000,Planned Spend,2025-02,50000,monthly',
    'MEDIA,5000,Planned Spend,2025-01,12000,monthly',
    'DIGITAL,4000,Planned Spend,2025,600000,annual',
    'DIGITAL,5000,Planned Spend,2025-Q1,45000,quarterly',
  ]
  const blob = new Blob([headers + '\n' + rows.join('\n') + '\n'], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'budget_import_sample.csv' })
  a.click()
}

function downloadCSV(filename, rows, columns) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(r => columns.map(c => {
    const v = String(r[c.key] ?? '')
    return v.includes(',') ? `"${v}"` : v
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateBudgetRows(canonicalRows, { accounts, departments }) {
  const errors   = []
  const warnings = []
  const info     = []

  const accountsByCode = new Map(accounts.map(a => [a.account_code, a]))
  const deptsByCode    = new Map(departments.map(d => [d.dept_code, d]))

  const unparseable_amounts  = []
  const unparseable_periods  = []
  const unknown_accounts     = new Map()
  const unknown_depts        = new Map()
  const no_category_rows     = []
  const scenarios            = new Set()
  const period_types         = { monthly: 0, quarterly: 0, annual: 0, unknown: 0 }

  let rowsValid = 0

  for (let i = 0; i < canonicalRows.length; i++) {
    const row = canonicalRows[i]
    const rowNum = i + 2
    let rowOk = true

    // Amount
    const amt = parseAmount(row.amount)
    if (amt === null) { unparseable_amounts.push({ rowNum, value: row.amount }); rowOk = false }

    // Period
    const periodStr = row.period || ''
    const parsed = parsePeriod(periodStr)
    if (parsed.type === 'unknown') {
      unparseable_periods.push({ rowNum, value: periodStr })
      rowOk = false
    } else {
      period_types[parsed.type] = (period_types[parsed.type] || 0) + 1
    }

    // Must have account_code or category
    const hasAccount  = String(row.account_code || '').trim()
    const hasCategory = String(row.category || '').trim()
    if (!hasAccount && !hasCategory) {
      no_category_rows.push({ rowNum, dept: row.dept_code })
    }

    // Account code registry check
    if (hasAccount && !accountsByCode.has(hasAccount)) {
      unknown_accounts.set(hasAccount, (unknown_accounts.get(hasAccount) || 0) + 1)
    }

    // Dept code registry check
    const deptCode = String(row.dept_code || '').trim()
    if (deptCode && !deptsByCode.has(deptCode)) {
      unknown_depts.set(deptCode, (unknown_depts.get(deptCode) || 0) + 1)
    }

    // Scenario
    const scenario = String(row.scenario || '').trim()
    scenarios.add(scenario || '(default: Planned Spend)')

    if (rowOk) rowsValid++
  }

  // Hard blocks
  if (unparseable_amounts.length > 0) {
    errors.push({
      check: 'Amount is numeric',
      detail: `${unparseable_amounts.length} row(s) have non-numeric amounts.`,
      rows: unparseable_amounts.slice(0, 5),
      count: unparseable_amounts.length,
    })
  }
  if (unparseable_periods.length > 0) {
    errors.push({
      check: 'Period format parseable',
      detail: `${unparseable_periods.length} row(s) have unrecognized period formats. Expected: YYYY-MM, YYYY-Q1..Q4, or YYYY.`,
      rows: unparseable_periods.slice(0, 5),
      count: unparseable_periods.length,
    })
  }

  // Warnings
  if (no_category_rows.length > 0) {
    warnings.push({
      check: 'Rows with no account or category',
      detail: `${no_category_rows.length} row(s) have neither account_code nor category — they cannot be categorized and will be skipped.`,
      rows: no_category_rows.slice(0, 5),
      count: no_category_rows.length,
    })
  }
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
      detail: `${unknown_depts.size} dept code(s) not found in Departments registry.`,
    })
  }

  // Info
  info.push({
    check: 'Scenarios detected',
    detail: [...scenarios].join(' · ') || 'None (will default to "Planned Spend")',
  })

  const grainSummary = Object.entries(period_types)
    .filter(([,v]) => v > 0)
    .map(([k,v]) => `${v} ${k}`)
    .join(', ')
  info.push({
    check: 'Period grains in file',
    detail: grainSummary || 'None detected',
    note: 'All rows will be stored as monthly after distribution',
  })

  info.push({
    check: 'Row count',
    detail: `${canonicalRows.length} total rows, ${rowsValid} valid`,
  })

  return {
    errors, warnings, info,
    canProceed: errors.length === 0,
    rowsValid,
    rowsTotal: canonicalRows.length,
    unknownAccountCodes: [...unknown_accounts.entries()].map(([code,count]) => ({ code, count })),
    unknownDeptCodes:    [...unknown_depts.entries()].map(([code,count]) => ({ code, count })),
    noCategoryRows:      no_category_rows,
    periodTypes:         period_types,
    scenarios:           [...scenarios],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function BudgetImportFlow() {
  // ── Registry data ───────────────────────────────────────────────────────────
  const [accounts,    setAccounts]    = useState([])
  const [departments, setDepartments] = useState([])
  const [teams,       setTeams]       = useState([])
  const [savedMappings, setSavedMappings] = useState([])
  const [regLoading,  setRegLoading]  = useState(true)
  const [regError,    setRegError]    = useState(null)

  // ── Flow state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState('mode')

  // Mode step
  const [mode,           setMode]           = useState('replace_scenario')
  const [replacePeriods,  setReplacePeriods]  = useState([])
  const [replaceScenario, setReplaceScenario] = useState('')

  // Upload + mapping step
  const [rawFile,       setRawFile]       = useState(null)
  const [rawHeaders,    setRawHeaders]    = useState([])
  const [rawRows,       setRawRows]       = useState([])
  const [activeMapping, setActiveMapping] = useState(null)
  const [showPicker,    setShowPicker]    = useState(false)

  // Pre-processed rows (canonical, before distribution)
  const [canonicalRows, setCanonicalRows] = useState([])
  const [preSkipped,    setPreSkipped]    = useState([])

  // Validation
  const [validation, setValidation] = useState(null)

  // On-the-spot resolutions
  const [acctRes, setAcctRes] = useState({}) // { code: accountId | 'skip' | 'new' }
  const [deptRes, setDeptRes] = useState({}) // { code: deptId   | 'skip' | 'new' }
  const [newAcctForms, setNewAcctForms] = useState({})
  const [newDeptForms, setNewDeptForms] = useState({})

  // Result
  const [importResult, setImportResult] = useState(null)
  const [importError,  setImportError]  = useState(null)

  const fileRef = useRef()

  // ── Org config from context (avoids re-fetching org_settings) ─────────────
  const { orgConfig } = useApp()

  // ── Load registries ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setRegLoading(true)
      setRegError(null)
      const [
        { data: acc,      error: accErr },
        { data: depts,    error: deptErr },
        { data: tms,      error: tmsErr },
        { data: maps,     error: mapsErr },
      ] = await Promise.all([
        supabase.from('chart_of_accounts').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('departments').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('teams').select('*').eq('org_id', ORG_ID).eq('deleted', false),
        supabase.from('field_mappings').select('*').eq('org_id', ORG_ID).eq('deleted', false).eq('import_type', 'budget'),
      ])
      if (accErr || deptErr || tmsErr || mapsErr) {
        setRegError('Failed to load required data — please refresh and try again')
        setRegLoading(false)
        return
      }
      setAccounts(acc || [])
      setDepartments(depts || [])
      setTeams(tms || [])
      setSavedMappings(maps || [])
      setRegLoading(false)
    }
    load()
  }, [])

  const fyStartMonth  = orgConfig.fiscalYearStartMonth || 10
  const defaultFYYear = currentFYYear(fyStartMonth)

  // ── File handling ───────────────────────────────────────────────────────────
  function processFile(f) {
    setRawFile(f)
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSVText(ev.target.result)
      setRawHeaders(headers)
      setRawRows(rows)
      const detected = detectMapping(headers, savedMappings)
      setActiveMapping(detected)
      setStep('mapping')
    }
    reader.readAsText(f)
  }

  // ── Pre-process + validate ─────────────────────────────────────────────────
  function runValidation() {
    const mappingJson = activeMapping?.mapping_json || buildAutoMap(rawHeaders)
    const canonical = rawRows.map(row => applyMapping(row, mappingJson))

    // Filter empty rows
    const skipped = [], valid = []
    canonical.forEach((row, i) => {
      const hasAmt = String(row.amount || '').trim()
      const hasCat = String(row.account_code || row.category || '').trim()
      if (!hasAmt && !hasCat) { skipped.push({ rowNum: i + 2, reason: 'Empty row' }); return }
      valid.push({ ...row, _rowNum: i + 2 })
    })

    setCanonicalRows(valid)
    setPreSkipped(skipped)

    const result = validateBudgetRows(valid, { accounts, departments })
    setValidation(result)

    // Init resolutions
    const ar = {}; for (const {code} of result.unknownAccountCodes) ar[code] = 'skip'
    setAcctRes(ar)
    const dr = {}; for (const {code} of result.unknownDeptCodes) dr[code] = 'skip'
    setDeptRes(dr)

    setStep('validate')
  }

  // Auto-map by column name similarity
  function buildAutoMap(headers) {
    const KNOWN = ['period','amount','account_code','dept_code','scenario','category','period_type']
    const map = {}
    for (const h of headers) {
      const norm = h.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
      if (KNOWN.includes(norm)) map[h] = norm
    }
    return map
  }

  // ── Confirm + write ─────────────────────────────────────────────────────────
  async function handleConfirm(skipFlagged) {
    setStep('importing')
    setImportError(null)

    try {
      const accountsByCode = new Map(accounts.map(a => [a.account_code, a]))
      const deptsByCode    = new Map(departments.map(d => [d.dept_code, d]))

      // Save new accounts/depts
      for (const [code, res] of Object.entries(acctRes)) {
        if (res === 'new' && newAcctForms[code]) {
          const { data } = await supabase.from('chart_of_accounts').insert([{
            org_id: ORG_ID, account_code: code,
            account_name: newAcctForms[code].account_name || code,
            category:     newAcctForms[code].category     || 'Uncategorized',
            record_type:  newAcctForms[code].record_type  || 'expense',
            active: true,
          }]).select().single()
          if (data) accountsByCode.set(code, data)
        }
      }
      for (const [code, res] of Object.entries(deptRes)) {
        if (res === 'new' && newDeptForms[code]) {
          const { data } = await supabase.from('departments').insert([{
            org_id: ORG_ID, dept_code: code,
            dept_name: newDeptForms[code].dept_name || code,
            team_id:   newDeptForms[code].team_id   || null,
            active: true,
          }]).select().single()
          if (data) deptsByCode.set(code, data)
        }
      }

      // Replace mode: soft-delete existing
      if (mode === 'replace_full') {
        await supabase.from('budgets')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('org_id', ORG_ID).eq('deleted', false)
      } else if (mode === 'replace_period' && replacePeriods.length > 0) {
        await supabase.from('budgets')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('org_id', ORG_ID).in('period', replacePeriods).eq('deleted', false)
      } else if (mode === 'replace_scenario' && replaceScenario) {
        await supabase.from('budgets')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('org_id', ORG_ID).eq('scenario', replaceScenario).eq('deleted', false)
      }

      // Build & distribute all budget rows
      const distributedRows = []
      const errorRows = []

      for (const row of canonicalRows) {
        const amt = parseAmount(row.amount)
        if (amt === null) { errorRows.push({ ...row, _skip_reason: 'Non-numeric amount' }); continue }

        const acctCode  = String(row.account_code || '').trim()
        const deptCode  = String(row.dept_code    || '').trim()
        const catRaw    = String(row.category      || '').trim()
        const scenario  = String(row.scenario      || '').trim() || 'Planned Spend'
        const periodStr = String(row.period        || '').trim()

        // Must have account or category
        if (!acctCode && !catRaw) {
          if (skipFlagged) { errorRows.push({ ...row, _skip_reason: 'No account or category' }); continue }
        }

        // Account resolution
        let accountId = null, category = catRaw
        if (acctCode) {
          const res = acctRes[acctCode]
          if (res === 'skip' || (!accountsByCode.has(acctCode) && res !== 'new')) {
            if (skipFlagged) { errorRows.push({ ...row, _skip_reason: `Unknown account "${acctCode}"` }); continue }
          }
          const acct = accountsByCode.get(acctCode)
          accountId = acct?.id || null
          category  = acct?.category || catRaw || 'Uncategorized'
        }

        // Dept resolution
        let deptId = null
        if (deptCode) {
          const res = deptRes[deptCode]
          if (res === 'skip' || (!deptsByCode.has(deptCode) && res !== 'new')) {
            if (skipFlagged) { errorRows.push({ ...row, _skip_reason: `Unknown dept "${deptCode}"` }); continue }
          }
          const dept = deptsByCode.get(deptCode)
          deptId = dept?.id || null
        }

        // Distribute to monthly periods
        const periods = distributeToPeriods(periodStr, amt, fyStartMonth, defaultFYYear)
        for (const p of periods) {
          distributedRows.push({
            dept_code:   deptCode,  // for granularity-wins key
            account_code: acctCode, // for granularity-wins key
            scenario,
            period:       p.period,
            amount:       p.amount,
            period_type:  p.period_type,
            // DB fields:
            department_id: deptId,
            account_id:    accountId,
            category:      category || 'Uncategorized',
          })
        }
      }

      // Apply granularity-wins de-duplication
      const dedupedRows = applyGranularityWins(distributedRows)
      const rowsSkipped = errorRows.length + preSkipped.length + (distributedRows.length - dedupedRows.length)

      // Create import_log entry
      const periods = dedupedRows.map(r => r.period).sort()
      const { data: logEntry, error: logErr } = await supabase.from('import_log').insert([{
        org_id: ORG_ID,
        import_type: 'budget',
        mode,
        filename: rawFile?.name || null,
        row_count: dedupedRows.length,
        rows_skipped: rowsSkipped,
        period_start: periods[0] || null,
        period_end:   periods[periods.length - 1] || null,
        teams_affected: [],
        status: errorRows.length > 0 ? 'partial' : 'success',
        error_report: errorRows.length > 0
          ? errorRows.slice(0, 200).map(r => ({ row: r._rowNum, reason: r._skip_reason }))
          : null,
      }]).select().single()
      if (logErr || !logEntry?.id) throw new Error('Failed to create import record — please try again')
      const batchId = logEntry.id

      // Insert budget rows in batches of 100
      const toInsert = dedupedRows.map(r => ({
        org_id:        ORG_ID,
        import_batch_id: batchId,
        department_id: r.department_id,
        account_id:    r.account_id,
        category:      r.category,
        scenario:      r.scenario,
        amount:        r.amount,
        period:        r.period,
        period_type:   r.period_type,
        deleted:       false,
      }))

      for (let i = 0; i < toInsert.length; i += 100) {
        const { error: e } = await supabase.from('budgets').insert(toInsert.slice(i, i + 100))
        if (e) throw new Error('Insert failed: ' + e.message)
      }

      setImportResult({
        rowsImported: dedupedRows.length,
        rowsSkipped,
        deduped: distributedRows.length - dedupedRows.length,
        errorRows,
        mode,
        filename: rawFile?.name,
        scenarios: [...new Set(dedupedRows.map(r => r.scenario))],
      })
      setStep('done')

    } catch (err) {
      setImportError(err.message || String(err))
      setStep('error')
    }
  }

  function reset() {
    setStep('mode'); setRawFile(null); setRawHeaders([]); setRawRows([])
    setActiveMapping(null); setCanonicalRows([]); setPreSkipped([])
    setValidation(null); setAcctRes({}); setDeptRes({})
    setNewAcctForms({}); setNewDeptForms({})
    setImportResult(null); setImportError(null)
    setReplacePeriods([]); setReplaceScenario('')
  }

  function downloadErrorReport(errorRows) {
    downloadCSV('budget-errors.csv', errorRows, [
      { key: '_rowNum',      label: 'row_number' },
      { key: '_skip_reason', label: 'reason'     },
      { key: 'period',       label: 'period'     },
      { key: 'amount',       label: 'amount'     },
      { key: 'account_code', label: 'account_code' },
      { key: 'dept_code',    label: 'dept_code'  },
      { key: 'scenario',     label: 'scenario'   },
      { key: 'category',     label: 'category'   },
    ])
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (regLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={24} className="text-teal-600 animate-spin"/>
        <p className="text-sm text-gray-400">Loading registries…</p>
      </div>
    )
  }

  if (regError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle size={24} className="text-red-500"/>
        <p className="text-sm text-red-700 font-medium">{regError}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Last import summary */}
      <LastImportSummary importType="budget" accentColor="blue"/>

      {/* ── Step: Mode ─────────────────────────────────────────────────────── */}
      {step === 'mode' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Import Budget</h3>
            <p className="text-xs text-gray-400">
              Covers income and expense budgets in one file. All rows are stored at monthly grain
              — annual and quarterly amounts are automatically distributed.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Import Mode</label>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`w-full text-left p-4 border-2 rounded-xl transition-colors flex items-start gap-3
                  ${mode === m.id ? (m.warn ? 'border-amber-500 bg-amber-50' : 'border-teal-500 bg-teal-50') : 'border-gray-200 hover:border-gray-300'}`}>
                <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{m.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold ${mode === m.id ? (m.warn ? 'text-amber-800' : 'text-teal-800') : 'text-gray-800'}`}>{m.label}</span>
                    {m.warn && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Destructive</span>}
                    {mode === m.id && <Check size={14} className={`ml-auto ${m.warn ? 'text-amber-600' : 'text-teal-600'}`}/>}
                  </div>
                  <p className="text-xs text-gray-500">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {mode === 'replace_period' && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Period(s) to replace <span className="text-red-400">*</span></label>
              <p className="text-xs text-gray-400">Select one or more months. All budget rows in those months will be soft-deleted before import.</p>
              <PeriodMultiPicker value={replacePeriods} onChange={setReplacePeriods}/>
            </div>
          )}
          {mode === 'replace_scenario' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Scenario to replace <span className="text-red-400">*</span></label>
              <input type="text" value={replaceScenario} onChange={e => setReplaceScenario(e.target.value)}
                placeholder="e.g. Planned Spend"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-64"/>
              <p className="text-xs text-gray-400 mt-1">All existing rows for this scenario will be soft-deleted before import.</p>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Distribution rules</p>
            <p>• <strong>Monthly</strong> (YYYY-MM): stored as-is</p>
            <p>• <strong>Quarterly</strong> (YYYY-Q1..Q4): amount ÷ 3 per month</p>
            <p>• <strong>Annual</strong> (YYYY or blank): amount ÷ 12 across fiscal year months (FY starts {['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][fyStartMonth]}, default year: FY{defaultFYYear})</p>
            <p>• <strong>More granular always wins</strong>: monthly overrides quarterly overrides annual for the same dept/account/scenario/period</p>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Download Template</p>
            <p className="text-xs text-gray-500 mb-3">
              Required columns: <code className="bg-gray-100 px-1 rounded text-gray-700">dept_code</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">account_code</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">scenario</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">period</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">amount</code>,{' '}
              <code className="bg-gray-100 px-1 rounded text-gray-700">period_type</code>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={downloadBudgetTemplate} className="flex items-center gap-1.5 text-xs text-teal-600 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50">
                <Download size={12}/> Blank Template
              </button>
              <button onClick={downloadBudgetSample} className="flex items-center gap-1.5 text-xs text-teal-600 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50">
                <Download size={12}/> Sample Data
              </button>
            </div>
          </div>

          <button
            onClick={() => setStep('upload')}
            disabled={(mode === 'replace_period' && replacePeriods.length === 0) || (mode === 'replace_scenario' && !replaceScenario)}
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

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) processFile(f) }}
            className="flex flex-col items-center gap-4 py-16 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
            <Upload size={32} className="text-gray-300"/>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">Drop your budget CSV here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Expected columns: dept_code, account_code or category, scenario, amount, period</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f=e.target.files[0]; if(f) processFile(f); e.target.value='' }}/>
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
              <p className="text-xs text-gray-400">{rawRows.length} data rows · {rawHeaders.length} columns: <span className="font-mono">{rawHeaders.join(', ')}</span></p>
            </div>
          </div>

          {activeMapping ? (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-teal-600"/>
                <span className="text-sm font-semibold text-teal-800">Mapping: {activeMapping.mapping_name}</span>
                <button onClick={() => setShowPicker(p=>!p)} className="ml-auto text-xs text-teal-600 hover:underline">Change</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(activeMapping.mapping_json).map(([src, dst]) => (
                  <span key={src} className="inline-flex items-center gap-1 text-xs bg-white text-gray-600 px-2 py-0.5 rounded-full border border-teal-200">
                    <span className="font-mono">{src}</span><ArrowRight size={9} className="text-teal-400"/><span className="font-medium">{dst}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-600"/>
                <span className="text-sm font-semibold text-amber-800">No saved budget mapping found</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowPicker(p=>!p)} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">Choose saved mapping</button>
                <button onClick={() => {
                  const map = buildAutoMap(rawHeaders)
                  setActiveMapping({ mapping_name: 'Auto-detected', mapping_json: map, date_format: 'calendar' })
                }} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">Auto-detect by column name</button>
              </div>
            </div>
          )}

          {showPicker && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {savedMappings.length === 0 && <div className="p-4 text-sm text-gray-400 text-center">No budget mappings saved. Create one in Setup → Field Mappings.</div>}
              {savedMappings.map(m => (
                <button key={m.id}
                  onClick={() => { setActiveMapping(m); setShowPicker(false) }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-teal-50 ${activeMapping?.id === m.id ? 'bg-teal-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.mapping_name}</span>
                    {activeMapping?.id === m.id && <Check size={13} className="text-teal-600"/>}
                  </div>
                  <div className="text-xs text-gray-400">{Object.keys(m.mapping_json||{}).length} columns</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">Back</button>
            <button disabled={!activeMapping} onClick={runValidation}
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
              <p className="text-xs text-gray-400 mt-0.5">{rawFile?.name} · {canonicalRows.length} rows</p>
            </div>
            <button onClick={() => setStep('mapping')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          </div>

          {/* Hard blocks */}
          {validation.errors.map(e => (
            <div key={e.check} className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={15} className="text-red-600"/>
                <span className="text-sm font-semibold text-red-800">HARD BLOCK: {e.check}</span>
              </div>
              <p className="text-xs text-red-700 mb-2">{e.detail}</p>
              {e.rows?.length > 0 && (
                <div className="text-xs font-mono bg-red-100 rounded-lg p-2 space-y-0.5">
                  {e.rows.map((r,i) => <div key={i}>Row {r.rowNum}: <span className="text-red-600">{r.value}</span></div>)}
                  {e.count > 5 && <div className="text-red-400">…and {e.count - 5} more</div>}
                </div>
              )}
            </div>
          ))}

          {/* Warnings */}
          {validation.warnings.map(w => (
            <div key={w.check} className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600"/>
                <span className="text-sm font-semibold text-amber-800">Warning: {w.check}</span>
              </div>
              <p className="text-xs text-amber-700">{w.detail}</p>

              {/* Unknown account codes */}
              {w.check === 'Account codes not in registry' && w.codes && (
                <div className="space-y-2">
                  {w.codes.map(({ code, count }) => (
                    <div key={code} className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-semibold">{code} <span className="text-xs text-gray-400 font-sans">{count} row{count!==1?'s':''}</span></span>
                        <select value={acctRes[code]||'skip'} onChange={e => setAcctRes(p=>({...p,[code]:e.target.value}))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white">
                          <option value="skip">Skip these rows</option>
                          <option value="new">Add as new account</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                        </select>
                      </div>
                      {acctRes[code] === 'new' && (
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-100">
                          <input placeholder="Account name" value={newAcctForms[code]?.account_name||''}
                            onChange={e => setNewAcctForms(p=>({...p,[code]:{...p[code],account_name:e.target.value}}))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"/>
                          <input placeholder="Category" value={newAcctForms[code]?.category||''}
                            onChange={e => setNewAcctForms(p=>({...p,[code]:{...p[code],category:e.target.value}}))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"/>
                          <select value={newAcctForms[code]?.record_type||'expense'}
                            onChange={e => setNewAcctForms(p=>({...p,[code]:{...p[code],record_type:e.target.value}}))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white">
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Unknown dept codes */}
              {w.check === 'Dept codes not in registry' && w.codes && (
                <div className="space-y-2">
                  {w.codes.map(({ code, count }) => (
                    <div key={code} className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-semibold">{code} <span className="text-xs text-gray-400 font-sans">{count} row{count!==1?'s':''}</span></span>
                        <select value={deptRes[code]||'skip'} onChange={e => setDeptRes(p=>({...p,[code]:e.target.value}))}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white">
                          <option value="skip">Skip these rows</option>
                          <option value="new">Add as new dept</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code} - {d.dept_name}</option>)}
                        </select>
                      </div>
                      {deptRes[code] === 'new' && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-100">
                          <input placeholder="Dept name" value={newDeptForms[code]?.dept_name||''}
                            onChange={e => setNewDeptForms(p=>({...p,[code]:{...p[code],dept_name:e.target.value}}))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"/>
                          <select value={newDeptForms[code]?.team_id||''}
                            onChange={e => setNewDeptForms(p=>({...p,[code]:{...p[code],team_id:e.target.value||null}}))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white">
                            <option value="">— no team —</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Info */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Import Summary</div>
            {validation.info.map(item => (
              <div key={item.check} className="flex items-start gap-2">
                <Info size={13} className="text-teal-500 mt-0.5 shrink-0"/>
                <div>
                  <span className="text-xs font-medium text-gray-600">{item.check}: </span>
                  <span className="text-xs text-gray-500">{item.detail}</span>
                  {item.note && <p className="text-xs text-teal-600 mt-0.5">→ {item.note}</p>}
                </div>
              </div>
            ))}
            {preSkipped.length > 0 && (
              <div className="flex items-start gap-2">
                <Info size={13} className="text-gray-400 mt-0.5"/>
                <span className="text-xs text-gray-500">{preSkipped.length} blank rows pre-filtered</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {validation.canProceed ? (
            <div className="flex flex-col gap-2">
              <button onClick={() => handleConfirm(false)}
                className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Confirm Import ({validation.rowsValid} rows → distributed to monthly)
              </button>
              {validation.warnings.length > 0 && (
                <button onClick={() => handleConfirm(true)}
                  className="w-full py-2.5 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50">
                  Import anyway — skip all flagged rows
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
              <strong>Cannot import.</strong> Fix the hard block errors above and re-upload.
            </div>
          )}

          <button onClick={reset} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600">Cancel — start over</button>
        </div>
      )}

      {/* ── Step: Importing ─────────────────────────────────────────────────── */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={32} className="text-teal-600 animate-spin"/>
          <p className="text-sm font-semibold text-gray-700">Distributing to monthly periods and writing to Supabase…</p>
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
              <h3 className="text-base font-semibold text-gray-800">Budget import complete</h3>
              <p className="text-xs text-gray-400 mt-0.5">{importResult.filename}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-700">{importResult.rowsImported}</div>
              <div className="text-xs text-emerald-600 mt-0.5">Monthly rows stored</div>
            </div>
            <div className={`border rounded-xl p-4 text-center ${importResult.rowsSkipped > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`text-2xl font-bold ${importResult.rowsSkipped > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{importResult.rowsSkipped}</div>
              <div className={`text-xs mt-0.5 ${importResult.rowsSkipped > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Rows skipped</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="text-sm font-bold text-blue-700 truncate">{importResult.deduped > 0 ? `${importResult.deduped} dedup'd` : 'No dupes'}</div>
              <div className="text-xs text-blue-600 mt-0.5">Granularity wins</div>
            </div>
          </div>

          {importResult.scenarios?.length > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600">
              Scenarios: {importResult.scenarios.join(' · ')}
            </div>
          )}

          <div className="flex gap-3">
            {importResult.rowsSkipped > 0 && importResult.errorRows?.length > 0 && (
              <button onClick={() => downloadErrorReport(importResult.errorRows)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                <Download size={13}/> Error report
              </button>
            )}
            <button onClick={reset} className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700">
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
          <button onClick={reset} className="w-full py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Start over</button>
        </div>
      )}
    </div>
  )
}
