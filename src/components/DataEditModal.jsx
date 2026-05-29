import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Field definitions per data type
// ─────────────────────────────────────────────────────────────────────────────

const ACTUALS_FIELDS = [
  { key: 'date',        label: 'Date',        type: 'date',   required: true },
  { key: 'amount',      label: 'Amount',      type: 'number', required: true, placeholder: 'e.g. 1500.00 (negative = income)' },
  { key: 'vendor',      label: 'Vendor',      type: 'text',   placeholder: 'Vendor or payee name' },
  { key: 'description', label: 'Description', type: 'text',   placeholder: 'Transaction description' },
  { key: 'category',    label: 'Category',    type: 'text',   placeholder: 'e.g. Salaries, Software' },
]

const BUDGET_FIELDS = [
  { key: 'period',      label: 'Period (YYYY-MM)', type: 'month',  required: true },
  { key: 'category',    label: 'Category',         type: 'text',   required: true, placeholder: 'e.g. Salaries, Software' },
  { key: 'scenario',    label: 'Scenario',         type: 'text',   required: true, placeholder: 'e.g. Annual Plan' },
  { key: 'amount',      label: 'Amount',           type: 'number', required: true, placeholder: 'e.g. 5000.00' },
  { key: 'period_type', label: 'Period Type',      type: 'select', options: ['monthly','quarterly','annual'], required: true },
]

const PATRON_FIELDS = [
  { key: 'period',                   label: 'Period (YYYY-MM)',      type: 'month',  required: true },
  { key: 'total_active_patrons',     label: 'Total Active Patrons',  type: 'integer', placeholder: '0' },
  { key: 'new_patrons_total',        label: 'New Patrons (Total)',   type: 'integer', placeholder: '0' },
  { key: 'new_patrons_recurring',    label: 'New Patrons (Recurring)', type: 'integer', placeholder: '0' },
  { key: 'new_patrons_spontaneous',  label: 'New Patrons (Spontaneous)', type: 'integer', placeholder: '0' },
  { key: 'recurring_patron_count',   label: 'Recurring Patron Count', type: 'integer', placeholder: '0' },
  { key: 'recurring_giving_total',   label: 'Recurring Giving Total', type: 'number', placeholder: '0.00' },
  { key: 'spontaneous_giving_total', label: 'Spontaneous Giving Total', type: 'number', placeholder: '0.00' },
  { key: 'avg_gift_size',            label: 'Avg Gift Size',         type: 'number', placeholder: '0.00' },
  { key: 'retention_rate',           label: 'Retention Rate (0–1)',  type: 'number', placeholder: 'e.g. 0.82' },
]

const CASHFLOW_FIELDS = [
  { key: 'period',              label: 'Period (YYYY-MM)',     type: 'month',  required: true },
  { key: 'cash_balance',        label: 'Cash Balance',        type: 'number', required: true, placeholder: '0.00' },
  { key: 'prior_month_balance', label: 'Prior Month Balance', type: 'number', placeholder: '0.00' },
  { key: 'prior_year_balance',  label: 'Prior Year Balance',  type: 'number', placeholder: '0.00' },
  { key: 'reserve_floor',       label: 'Reserve Floor Override', type: 'number', placeholder: 'Leave blank to use org default' },
]

const FIELDS_BY_MODE = {
  actuals:  ACTUALS_FIELDS,
  budget:   BUDGET_FIELDS,
  patron:   PATRON_FIELDS,
  cashflow: CASHFLOW_FIELDS,
}

const TITLES = {
  actuals:  'Transaction',
  budget:   'Budget Line',
  patron:   'Patron Data',
  cashflow: 'Cash Flow Entry',
}

function fieldVal(row, field) {
  const v = row?.[field.key]
  if (v == null || v === '') return ''
  if (field.type === 'month') return String(v).substring(0, 7)
  return String(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// DataEditModal
// Props:
//   mode      — 'actuals' | 'budget' | 'patron' | 'cashflow'
//   row       — existing row to edit, or null for add
//   onSave    — async (formData, isNew) => void
//   onDelete  — async (id) => void — only shown when editing existing row
//   onClose   — () => void
// ─────────────────────────────────────────────────────────────────────────────
export default function DataEditModal({ mode, row, onSave, onDelete, onClose }) {
  const fields = FIELDS_BY_MODE[mode] || []
  const isNew  = !row

  const [form,    setForm]    = useState(() => {
    const init = {}
    for (const f of fields) init[f.key] = fieldVal(row, f)
    return init
  })
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  function set(key, value) { setForm(prev => ({ ...prev, [key]: value })) }

  async function handleSave() {
    setError(null)
    // Basic required check
    for (const f of fields) {
      if (f.required && !form[f.key]?.toString().trim()) {
        setError(`${f.label} is required`)
        return
      }
    }
    // Coerce types
    const out = {}
    for (const f of fields) {
      const raw = form[f.key]
      if (raw === '' || raw == null) { out[f.key] = null; continue }
      if (f.type === 'number') out[f.key] = parseFloat(raw)
      else if (f.type === 'integer') out[f.key] = parseInt(raw, 10)
      else out[f.key] = raw
    }
    setSaving(true)
    try { await onSave(out, isNew) } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try { await onDelete(row.id) } catch (e) { setError(e.message) }
    setDeleting(false)
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white'
  const labelCls = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {isNew ? 'Add' : 'Edit'} {TITLES[mode]}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className={labelCls}>
                {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {f.type === 'select' ? (
                <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'integer' ? 'number' : f.type}
                  step={f.type === 'number' ? 'any' : undefined}
                  value={form[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  placeholder={f.placeholder || ''}
                  className={inputCls}
                />
              )}
            </div>
          ))}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          {!isNew && onDelete ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                confirmDel
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-red-200 text-red-600 hover:bg-red-50'
              }`}>
              {deleting ? 'Deleting…' : confirmDel ? 'Confirm delete?' : 'Delete'}
            </button>
          ) : <div/>}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : isNew ? 'Add' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
