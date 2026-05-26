/**
 * UnresolvedWarning.jsx — Shared warning components for unresolved rows.
 *
 * Three warning types:
 *   no_account — account_id not found in Chart of Accounts
 *   no_dept    — department_id not found in Departments registry
 *   no_team    — department exists but has no team assigned
 *
 * Exported:
 *   WARN_CONFIG        — raw config object (label, action, url)
 *   UnresolvedChip     — compact amber chip for table cells
 *   UnresolvedSection  — grouped warning block for P&L tables / modals
 */

import { AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export const WARN_CONFIG = {
  no_account: {
    label:     'Uncategorized — account code missing from Chart of Accounts.',
    action:    'Go to Admin → Org Setup → Chart of Accounts to add it.',
    url:       '/master?tab=setup&setup=accounts',
    shortLabel: 'Uncategorized',
  },
  no_dept: {
    label:     'Unknown Department — department code not found in registry.',
    action:    'Go to Admin → Org Setup → Departments to add it.',
    url:       '/master?tab=setup&setup=departments',
    shortLabel: 'Unknown Dept',
  },
  no_team: {
    label:     'Unassigned — department exists but has no team.',
    action:    'Go to Admin → Org Setup → Departments to assign it to a team.',
    url:       '/master?tab=setup&setup=departments',
    shortLabel: 'Unassigned',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// UnresolvedChip — compact inline chip for table cells
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small amber chip shown inside a table cell.
 * Clicking navigates to the relevant setup page.
 *
 * @param {string} warnType  'no_account' | 'no_dept' | 'no_team'
 */
export function UnresolvedChip({ warnType }) {
  const navigate = useNavigate()
  const cfg = WARN_CONFIG[warnType]
  if (!cfg) return null

  return (
    <button
      type="button"
      title={`${cfg.label} ${cfg.action}`}
      onClick={e => { e.stopPropagation(); navigate(cfg.url) }}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-[10px] font-semibold whitespace-nowrap"
    >
      <AlertTriangle size={9} />
      {cfg.shortLabel}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UnresolvedSection — grouped block for P&L tables and modals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders an amber warning block showing all unresolved issues with amounts.
 * Each row is clickable and navigates to the relevant setup page.
 *
 * @param {Object} warnMap
 *   Keys are warnType strings; values are { actual?: number, budget?: number, count?: number }
 * @param {string} [className]  extra Tailwind classes for the outer div
 */
export function UnresolvedSection({ warnMap, className = '' }) {
  const navigate = useNavigate()

  const entries = Object.entries(warnMap || {})
    .filter(([, v]) => v && ((v.actual || 0) + (v.budget || 0)) > 0)

  if (!entries.length) return null

  return (
    <div className={`border border-amber-200 rounded-xl bg-amber-50/60 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-200 bg-amber-50">
        <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
          Unresolved Items
        </span>
        <span className="ml-auto text-[10px] text-amber-500">
          {entries.length} issue{entries.length !== 1 ? 's' : ''} · click to fix
        </span>
      </div>

      {/* Rows */}
      {entries.map(([type, vals]) => {
        const cfg = WARN_CONFIG[type]
        if (!cfg) return null
        const total = (vals.actual || 0) + (vals.budget || 0)
        return (
          <button
            key={type}
            type="button"
            onClick={e => { e.stopPropagation(); navigate(cfg.url) }}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-amber-100 transition-colors border-b border-amber-100 last:border-0 group"
          >
            <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-amber-800 leading-snug">{cfg.label}</div>
              <div className="text-[11px] text-amber-600 underline group-hover:no-underline mt-0.5">
                {cfg.action}
              </div>
            </div>
            {total > 0 && (
              <span className="text-sm font-semibold text-amber-700 tabular-nums whitespace-nowrap flex-shrink-0 mt-0.5">
                {formatCurrency(total, { compact: false })}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
