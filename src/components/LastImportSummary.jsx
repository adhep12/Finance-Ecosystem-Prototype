/**
 * LastImportSummary.jsx — Shared "Last Import" panel for all 4 import flows.
 *
 * Shows: date/time, imported_by, filename, row count, period covered,
 * plus type-specific metrics (income/expenses, patron counts, cash balance, etc.)
 *
 * Extra metrics are fetched live from the data tables (patron_data, cash_flow,
 * budgets, v_transactions_enriched) using the period range from the last import_log entry.
 */

import { useEffect, useState } from 'react'
import { Clock, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (isNaN(d)) return 'Unknown'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDollar(v) {
  if (v == null) return '—'
  return '$' + Math.abs(Number(v)).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function fmtNum(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {'transactions'|'budget'|'patron'|'cashflow'} importType
 * @param {string} accentColor  Tailwind color key for the border accent, e.g. 'teal', 'blue', 'pink', 'indigo'
 */
export default function LastImportSummary({ importType, accentColor = 'teal' }) {
  const [log, setLog]           = useState(null)
  const [extra, setExtra]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setExtra(null)

      // 1. Latest successful import_log entry for this type
      const { data: logRow } = await supabase
        .from('import_log')
        .select('*')
        .eq('org_id', ORG_ID)
        .eq('import_type', importType)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      setLog(logRow || null)

      // 2. Fetch type-specific extra stats
      if (logRow) {
        const start = logRow.period_start
        const end   = logRow.period_end || logRow.period_start

        try {
          if (importType === 'transactions' && start && end) {
            const { data } = await supabase
              .from('v_transactions_enriched')
              .select('record_type, amount')
              .eq('org_id', ORG_ID)
              .gte('period', start)
              .lte('period', end)

            if (!cancelled && data) {
              const income   = data.filter(r => r.record_type === 'income').reduce((s, r) => s + (r.amount || 0), 0)
              const expenses = data.filter(r => r.record_type !== 'income').reduce((s, r) => s + (r.amount || 0), 0)
              setExtra({ total_income: income, total_expenses: expenses })
            }

          } else if (importType === 'budget' && start && end) {
            const { data } = await supabase
              .from('budgets')
              .select('scenario')
              .eq('org_id', ORG_ID)
              .gte('period', start)
              .lte('period', end)
              .eq('deleted', false)

            if (!cancelled && data) {
              const scenarios = [...new Set(data.map(r => r.scenario).filter(Boolean))].sort()
              setExtra({ scenarios })
            }

          } else if (importType === 'patron' && end) {
            const { data } = await supabase
              .from('patron_data')
              .select('total_active_patrons, new_patrons_total')
              .eq('org_id', ORG_ID)
              .eq('period', end)
              .eq('deleted', false)
              .maybeSingle()

            if (!cancelled) setExtra(data || null)

          } else if (importType === 'cashflow' && end) {
            const { data } = await supabase
              .from('cash_flow')
              .select('cash_balance, reserve_floor')
              .eq('org_id', ORG_ID)
              .eq('period', end)
              .eq('deleted', false)
              .maybeSingle()

            if (!cancelled) setExtra(data || null)
          }
        } catch {
          // Extra stats failing silently — log entry is still shown
        }
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [importType])

  // Accent border color
  const borderColor = {
    teal:   'border-teal-200',
    blue:   'border-blue-200',
    pink:   'border-pink-200',
    indigo: 'border-indigo-200',
    violet: 'border-violet-200',
  }[accentColor] || 'border-gray-200'

  const textColor = {
    teal:   'text-teal-700',
    blue:   'text-blue-700',
    pink:   'text-pink-700',
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
  }[accentColor] || 'text-gray-700'

  const bgColor = {
    teal:   'bg-teal-50',
    blue:   'bg-blue-50',
    pink:   'bg-pink-50',
    indigo: 'bg-indigo-50',
    violet: 'bg-violet-50',
  }[accentColor] || 'bg-gray-50'

  if (loading) return null

  // ── No imports yet ──────────────────────────────────────────────────────────
  if (!log) {
    return (
      <div className={`border ${borderColor} rounded-xl px-4 py-3 flex items-center gap-2 ${bgColor}`}>
        <FileText size={13} className="text-gray-400 flex-shrink-0"/>
        <span className="text-xs text-gray-400 italic">No imports yet</span>
      </div>
    )
  }

  const periodStr = log.period_start
    ? log.period_start === log.period_end || !log.period_end
      ? log.period_start
      : `${log.period_start} → ${log.period_end}`
    : '—'

  // ── Summary panel ───────────────────────────────────────────────────────────
  return (
    <div className={`border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${bgColor} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <Clock size={13} className={textColor}/>
          <span className={`text-xs font-semibold ${textColor}`}>Last Import</span>
          <span className="text-xs text-gray-400 ml-1">{fmtDateTime(log.created_at || log.imported_at)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{(log.row_count || 0).toLocaleString()} rows · {periodStr}</span>
          {expanded
            ? <ChevronUp size={13} className="text-gray-400"/>
            : <ChevronDown size={13} className="text-gray-400"/>
          }
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">

            <dt className="text-gray-400">Imported by</dt>
            <dd className="text-gray-700 font-medium">{log.imported_by || 'system'}</dd>

            <dt className="text-gray-400">File</dt>
            <dd className="text-gray-700 font-medium truncate max-w-[200px]">{log.filename || '—'}</dd>

            <dt className="text-gray-400">Rows</dt>
            <dd className="text-gray-700 font-medium">
              {(log.row_count || 0).toLocaleString()} imported
              {(log.rows_skipped > 0) && ` · ${log.rows_skipped} skipped`}
            </dd>

            <dt className="text-gray-400">Period covered</dt>
            <dd className="text-gray-700 font-medium">{periodStr}</dd>

            {/* ── Transactions extras ── */}
            {importType === 'transactions' && Array.isArray(log.teams_affected) && log.teams_affected.length > 0 && (
              <>
                <dt className="text-gray-400">Teams affected</dt>
                <dd className="text-gray-700 font-medium">{log.teams_affected.join(', ')}</dd>
              </>
            )}
            {importType === 'transactions' && extra && (
              <>
                <dt className="text-gray-400">Total income (period)</dt>
                <dd className="text-green-700 font-semibold">{fmtDollar(extra.total_income)}</dd>
                <dt className="text-gray-400">Total expenses (period)</dt>
                <dd className="text-red-700 font-semibold">{fmtDollar(extra.total_expenses)}</dd>
              </>
            )}

            {/* ── Budget extras ── */}
            {importType === 'budget' && extra?.scenarios?.length > 0 && (
              <>
                <dt className="text-gray-400">Scenarios imported</dt>
                <dd className="text-gray-700 font-medium">{extra.scenarios.join(', ')}</dd>
              </>
            )}

            {/* ── Patron extras ── */}
            {importType === 'patron' && extra && (
              <>
                <dt className="text-gray-400">Latest active patrons</dt>
                <dd className="text-gray-700 font-semibold">{fmtNum(extra.total_active_patrons)}</dd>
                <dt className="text-gray-400">New patrons (latest month)</dt>
                <dd className="text-gray-700 font-semibold">{fmtNum(extra.new_patrons_total)}</dd>
              </>
            )}

            {/* ── Cash flow extras ── */}
            {importType === 'cashflow' && extra && (
              <>
                <dt className="text-gray-400">Latest cash balance</dt>
                <dd className="text-gray-700 font-semibold">{fmtDollar(extra.cash_balance)}</dd>
                <dt className="text-gray-400">Reserve floor</dt>
                <dd className="text-gray-700 font-semibold">{fmtDollar(extra.reserve_floor)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
