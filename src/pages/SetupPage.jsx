/**
 * SetupPage.jsx — Org Setup & Registries
 *
 * Tabs:
 *   Org Settings  — name, logo, colors, FY/OY start month, reserve floor
 *   Teams         — registry table with add, inline edit, soft delete, restore, export, CSV import, history
 *   Departments   — same + team FK dropdown
 *   Chart of Accounts — same + category autocomplete + record_type select
 *   Grants        — same
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Settings, Users, Building2, BookOpen, Award,
  Plus, Pencil, Trash2, RotateCcw, Download, Upload,
  ChevronDown, ChevronUp, Clock, Check, X, AlertTriangle,
  Save, Eye, EyeOff, Search
} from 'lucide-react'
import { useRegistry, useOrgSettings } from '../hooks/useRegistry'
import { supabase, ORG_ID } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const RECORD_TYPES = ['income', 'expense']

const SETUP_TABS = [
  { id: 'org',        label: 'Org Settings',      icon: Settings   },
  { id: 'teams',      label: 'Teams',              icon: Users      },
  { id: 'departments',label: 'Departments',        icon: Building2  },
  { id: 'accounts',   label: 'Chart of Accounts',  icon: BookOpen   },
  { id: 'grants',     label: 'Grants',             icon: Award      },
]

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(filename, rows, columns) {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(r => columns.map(c => {
    const v = r[c.key] ?? ''
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Toast notification (top-right, auto-dismiss) */
function Toast({ toasts, remove }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-auto transition-all
            ${t.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {t.type === 'error' ? <AlertTriangle size={15}/> : <Check size={15}/>}
          {t.message}
          <button onClick={() => remove(t.id)} className="ml-2 opacity-60 hover:opacity-100"><X size={13}/></button>
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const add = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])
  const remove = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])
  return { toasts, add, remove }
}

/** History drawer — shows edit_log for one record */
function HistoryDrawer({ recordId, getHistory, onClose }) {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHistory(recordId).then(rows => { setLog(rows); setLoading(false) })
  }, [recordId, getHistory])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20" onClick={onClose}/>
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <Clock size={16} className="text-teal-600"/>
            Change History
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
          {!loading && log.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No changes recorded yet.</p>
          )}
          {log.map(entry => (
            <div key={entry.id} className="mb-4 pb-4 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">{entry.field}</span>
                <span className="text-xs text-gray-400">{formatDate(entry.edited_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="line-through text-gray-400 max-w-[120px] truncate">{entry.old_value ?? '—'}</span>
                <span className="text-gray-300">→</span>
                <span className="text-gray-700 font-medium max-w-[120px] truncate">{entry.new_value ?? '—'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">by {entry.edited_by}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Section header with count badge */
function SectionHeader({ title, count, children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      {count != null && (
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">{count}</span>
      )}
      <div className="flex-1"/>
      {children}
    </div>
  )
}

/** CSV upload button */
function CSVUploadButton({ onData }) {
  const ref = useRef()
  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => { onData(parseCSV(ev.target.result)) }
    reader.readAsText(f)
    e.target.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept=".csv" className="hidden" onChange={handleFile}/>
      <button onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
        <Upload size={13}/> Import CSV
      </button>
    </>
  )
}

/** Deleted-rows toggle + restore list */
function DeletedSection({ deletedRows, onRestore, labelKey }) {
  const [open, setOpen] = useState(false)
  if (deletedRows.length === 0) return null
  return (
    <div className="mt-4">
      <button onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        {deletedRows.length} deleted record{deletedRows.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-red-100 overflow-hidden">
          {deletedRows.map(row => (
            <div key={row.id} className="flex items-center justify-between px-4 py-2.5 bg-red-50/50 border-b border-red-100 last:border-0">
              <span className="text-sm text-gray-500 line-through">{row[labelKey]}</span>
              <button onClick={() => onRestore(row.id)}
                className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium">
                <RotateCcw size={12}/> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline-editable cell
// ─────────────────────────────────────────────────────────────────────────────

function EditableCell({ value, onChange, type = 'text', options, placeholder, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef()

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  function cancel() { setEditing(false); setDraft(value) }

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true) }}
        className={`cursor-pointer hover:bg-teal-50 rounded px-1 py-0.5 min-h-[22px] text-sm transition-colors group ${className}`}
        title="Click to edit">
        <span className={value ? 'text-gray-800' : 'text-gray-300 italic'}>{value || placeholder || '—'}</span>
      </div>
    )
  }

  if (type === 'select' && options) {
    return (
      <select ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        className="text-sm border border-teal-400 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-full">
        <option value="">— select —</option>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input ref={inputRef} type={type} value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        onBlur={commit}
        className="text-sm border border-teal-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500 w-full"/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add-row form (generic)
// ─────────────────────────────────────────────────────────────────────────────

function AddRowForm({ fields, onAdd, onCancel, loading }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.key, f.default ?? ''])))

  function set(key, val) { setValues(p => ({ ...p, [key]: val })) }

  async function submit(e) {
    e.preventDefault()
    await onAdd(values)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-4 bg-teal-50 rounded-xl border border-teal-200 mb-4">
      {fields.map(f => (
        <div key={f.key} className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">{f.label}{f.required && <span className="text-red-400"> *</span>}</label>
          {f.type === 'select' ? (
            <select value={values[f.key]} onChange={e => set(f.key, e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white min-w-[140px]">
              <option value="">— select —</option>
              {(f.options || []).map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} value={values[f.key]} placeholder={f.placeholder || ''}
              onChange={e => set(f.key, e.target.value)}
              required={f.required}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white min-w-[140px]"
              list={f.datalist ? f.datalist + '-list' : undefined}/>
          )}
          {f.datalist && (
            <datalist id={f.datalist + '-list'}>
              {(f.datalistOptions || []).map(o => <option key={o} value={o}/>)}
            </datalist>
          )}
        </div>
      ))}
      <div className="flex gap-2 pb-0.5">
        <button type="submit" disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
          <Plus size={14}/> {loading ? 'Adding…' : 'Add Row'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Registry Table
// ─────────────────────────────────────────────────────────────────────────────

function RegistryTable({
  title,
  tableName,
  orderBy,
  columns,       // [{ key, label, editable?, type?, options?, width? }]
  addFields,     // [{ key, label, required?, type?, options?, default?, placeholder?, datalist?, datalistOptions? }]
  exportColumns, // columns for CSV export (key + label)
  labelKey,      // which column is the display label (for deleted section)
  csvImportMap,  // function(rawRow) → fields object or null to skip
}) {
  const {
    rows, deletedRows, loading, error,
    showDeleted, setShowDeleted,
    addRow, updateRow, softDelete, restore, getHistory, refresh,
  } = useRegistry(tableName, orderBy)

  const { toasts, add: toast, remove: removeToast } = useToast()

  const [showAdd, setShowAdd]       = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [historyId, setHistoryId]   = useState(null)
  const [search, setSearch]         = useState('')
  const [saving, setSaving]         = useState({}) // id → bool

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)))
  }, [rows, columns, search])

  async function handleAdd(values) {
    setAddLoading(true)
    const { error: err } = await addRow(values)
    setAddLoading(false)
    if (err) toast('Error: ' + err, 'error')
    else { toast(`${title.replace(/s$/, '')} added`); setShowAdd(false) }
  }

  async function handleUpdate(id, field, newVal, original) {
    if (String(original[field] ?? '') === String(newVal ?? '')) return
    setSaving(p => ({ ...p, [id]: true }))
    const { error: err } = await updateRow(id, { [field]: newVal }, original)
    setSaving(p => ({ ...p, [id]: false }))
    if (err) toast('Save failed: ' + err, 'error')
  }

  async function handleDelete(id, label) {
    if (!confirm(`Archive "${label}"? It will be hidden but can be restored.`)) return
    const { error: err } = await softDelete(id)
    if (err) toast('Delete failed: ' + err, 'error')
    else toast(`"${label}" archived`)
  }

  async function handleRestore(id) {
    const { error: err } = await restore(id)
    if (err) toast('Restore failed: ' + err, 'error')
    else toast('Record restored')
  }

  async function handleCSVImport(rawRows) {
    if (!csvImportMap) return
    let added = 0, skipped = 0
    for (const raw of rawRows) {
      const fields = csvImportMap(raw)
      if (!fields) { skipped++; continue }
      const { error: err } = await addRow(fields)
      if (err) skipped++; else added++
    }
    await refresh()
    toast(`Imported ${added} rows${skipped ? `, ${skipped} skipped` : ''}`)
  }

  function handleExport() {
    exportCSV(`${tableName}-${new Date().toISOString().slice(0,10)}.csv`, rows, exportColumns || columns)
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading {title}…</div>
  if (error)   return <div className="py-12 text-center text-sm text-red-500">Error: {error}</div>

  return (
    <div>
      <Toast toasts={toasts} remove={removeToast}/>

      <SectionHeader title={title} count={rows.length}>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-48"/>
          </div>
          {csvImportMap && <CSVUploadButton onData={handleCSVImport}/>}
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={13}/> Export CSV
          </button>
          <button onClick={() => setShowAdd(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            <Plus size={13}/> Add Row
          </button>
        </div>
      </SectionHeader>

      {showAdd && (
        <AddRowForm fields={addFields} onAdd={handleAdd} onCancel={() => setShowAdd(false)} loading={addLoading}/>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(c => (
                <th key={c.key} className={`text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide ${c.width || ''}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-gray-400">
                  {search ? 'No matches found.' : `No ${title.toLowerCase()} yet. Click "Add Row" to get started.`}
                </td>
              </tr>
            )}
            {filteredRows.map(row => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2">
                    {c.editable !== false ? (
                      <EditableCell
                        value={row[c.key] ?? ''}
                        type={c.type}
                        options={c.options}
                        placeholder={c.placeholder}
                        onChange={val => handleUpdate(row.id, c.key, val, row)}
                      />
                    ) : (
                      <span className="text-sm text-gray-600 px-1">{row[c.key] ?? '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {saving[row.id] && <span className="text-xs text-teal-500">Saving…</span>}
                    <button onClick={() => setHistoryId(row.id)} title="Change history"
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                      <Clock size={14}/>
                    </button>
                    <button onClick={() => handleDelete(row.id, row[labelKey])} title="Archive"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeletedSection deletedRows={deletedRows} onRestore={handleRestore} labelKey={labelKey}/>

      {historyId && (
        <HistoryDrawer recordId={historyId} getHistory={getHistory} onClose={() => setHistoryId(null)}/>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Registry
// ─────────────────────────────────────────────────────────────────────────────

function TeamsRegistry() {
  const columns = [
    { key: 'team_name',    label: 'Team Name',    width: 'w-1/3' },
    { key: 'team_code',    label: 'Code',         width: 'w-24'  },
    { key: 'manager_name', label: 'Manager',      width: 'w-1/4' },
    { key: 'active',       label: 'Active', type: 'select',
      options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
      width: 'w-24' },
  ]

  const addFields = [
    { key: 'team_name',    label: 'Team Name',    required: true,  placeholder: 'e.g. Content' },
    { key: 'team_code',    label: 'Code',         placeholder: 'e.g. CONT' },
    { key: 'manager_name', label: 'Manager',      placeholder: 'Name' },
  ]

  const exportColumns = [
    { key: 'team_name',    label: 'team_name'    },
    { key: 'team_code',    label: 'team_code'    },
    { key: 'manager_name', label: 'manager_name' },
    { key: 'active',       label: 'active'       },
  ]

  function csvImportMap(raw) {
    const name = raw.team_name || raw['Team Name'] || raw['Name']
    if (!name) return null
    return {
      team_name:    name,
      team_code:    raw.team_code    || raw['Code']    || '',
      manager_name: raw.manager_name || raw['Manager'] || '',
    }
  }

  return (
    <RegistryTable
      title="Teams"
      tableName="teams"
      orderBy="team_name"
      columns={columns}
      addFields={addFields}
      exportColumns={exportColumns}
      labelKey="team_name"
      csvImportMap={csvImportMap}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Departments Registry
// ─────────────────────────────────────────────────────────────────────────────

function DepartmentsRegistry() {
  // Fetch teams for the dropdown
  const [teams, setTeams] = useState([])
  useEffect(() => {
    supabase.from('teams').select('id,team_name').eq('org_id', ORG_ID).eq('deleted', false).order('team_name')
      .then(({ data }) => setTeams(data || []))
  }, [])

  const teamOptions = teams.map(t => ({ value: t.id, label: t.team_name }))

  const columns = [
    { key: 'dept_code', label: 'Dept Code', width: 'w-28' },
    { key: 'dept_name', label: 'Dept Name', width: 'w-1/3' },
    {
      key: 'team_id', label: 'Team', type: 'select',
      options: teamOptions,
      width: 'w-40',
      // Display: resolve team_id → team_name
    },
    { key: 'active', label: 'Active', type: 'select',
      options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
      width: 'w-24' },
  ]

  // We need a custom cell renderer for team_id → name display
  const columnsWithTeamLabel = columns.map(c => {
    if (c.key === 'team_id') {
      return {
        ...c,
        renderDisplay: (row) => teams.find(t => t.id === row.team_id)?.team_name ?? '—',
      }
    }
    return c
  })

  const addFields = [
    { key: 'dept_code', label: 'Dept Code', required: true, placeholder: 'e.g. 1100' },
    { key: 'dept_name', label: 'Dept Name', required: true, placeholder: 'e.g. Leadership' },
    { key: 'team_id',   label: 'Team',      type: 'select', options: teamOptions },
  ]

  const exportColumns = [
    { key: 'dept_code', label: 'dept_code' },
    { key: 'dept_name', label: 'dept_name' },
    { key: 'team_id',   label: 'team_id'   },
    { key: 'active',    label: 'active'    },
  ]

  function csvImportMap(raw) {
    const code = raw.dept_code || raw['Dept Code'] || raw['Code']
    const name = raw.dept_name || raw['Dept Name'] || raw['Name']
    if (!code || !name) return null
    const teamMatch = raw.team_id || raw['Team'] || ''
    const teamId = teams.find(t => t.team_name === teamMatch || t.id === teamMatch)?.id || null
    return { dept_code: code, dept_name: name, team_id: teamId }
  }

  return (
    <DepartmentsTable
      teamOptions={teamOptions}
      teams={teams}
      addFields={addFields}
      exportColumns={exportColumns}
      csvImportMap={csvImportMap}
    />
  )
}

/** Departments table — uses RegistryTable internally but resolves team FK display */
function DepartmentsTable({ teamOptions, teams, addFields, exportColumns, csvImportMap }) {
  const {
    rows, deletedRows, loading, error,
    addRow, updateRow, softDelete, restore, getHistory, refresh,
  } = useRegistry('departments', 'dept_code')

  const { toasts, add: toast, remove: removeToast } = useToast()
  const [showAdd, setShowAdd]       = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [historyId, setHistoryId]   = useState(null)
  const [search, setSearch]         = useState('')
  const [saving, setSaving]         = useState({})

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      [r.dept_code, r.dept_name, teams.find(t => t.id === r.team_id)?.team_name]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    )
  }, [rows, teams, search])

  async function handleAdd(values) {
    setAddLoading(true)
    const { error: err } = await addRow(values)
    setAddLoading(false)
    if (err) toast('Error: ' + err, 'error')
    else { toast('Department added'); setShowAdd(false) }
  }

  async function handleUpdate(id, field, newVal, original) {
    if (String(original[field] ?? '') === String(newVal ?? '')) return
    setSaving(p => ({ ...p, [id]: true }))
    const { error: err } = await updateRow(id, { [field]: newVal }, original)
    setSaving(p => ({ ...p, [id]: false }))
    if (err) toast('Save failed: ' + err, 'error')
  }

  async function handleDelete(id, label) {
    if (!confirm(`Archive "${label}"?`)) return
    const { error: err } = await softDelete(id)
    if (err) toast('Delete failed: ' + err, 'error')
    else toast(`"${label}" archived`)
  }

  async function handleRestore(id) {
    const { error: err } = await restore(id)
    if (err) toast('Restore failed: ' + err, 'error')
    else toast('Restored')
  }

  async function handleCSVImport(rawRows) {
    let added = 0, skipped = 0
    for (const raw of rawRows) {
      const fields = csvImportMap(raw)
      if (!fields) { skipped++; continue }
      const { error: err } = await addRow(fields)
      if (err) skipped++; else added++
    }
    await refresh()
    toast(`Imported ${added} rows${skipped ? `, ${skipped} skipped` : ''}`)
  }

  function handleExport() {
    exportCSV(`departments-${new Date().toISOString().slice(0,10)}.csv`, rows, exportColumns)
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading departments…</div>
  if (error)   return <div className="py-12 text-center text-sm text-red-500">Error: {error}</div>

  return (
    <div>
      <Toast toasts={toasts} remove={removeToast}/>
      <SectionHeader title="Departments" count={rows.length}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-48"/>
          </div>
          <CSVUploadButton onData={handleCSVImport}/>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Download size={13}/> Export CSV
          </button>
          <button onClick={() => setShowAdd(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
            <Plus size={13}/> Add Row
          </button>
        </div>
      </SectionHeader>

      {showAdd && <AddRowForm fields={addFields} onAdd={handleAdd} onCancel={() => setShowAdd(false)} loading={addLoading}/>}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Dept Code</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Dept Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-44">Team</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-24">Active</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                {search ? 'No matches.' : 'No departments yet. Click "Add Row" to start.'}
              </td></tr>
            )}
            {filteredRows.map(row => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2"><EditableCell value={row.dept_code??''} onChange={v => handleUpdate(row.id,'dept_code',v,row)}/></td>
                <td className="px-3 py-2"><EditableCell value={row.dept_name??''} onChange={v => handleUpdate(row.id,'dept_name',v,row)}/></td>
                <td className="px-3 py-2">
                  <select value={row.team_id ?? ''} onChange={e => handleUpdate(row.id, 'team_id', e.target.value || null, row)}
                    className="text-sm border border-gray-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-full">
                    <option value="">— none —</option>
                    {teamOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <EditableCell value={String(row.active ?? true)} type="select"
                    options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                    onChange={v => handleUpdate(row.id, 'active', v === 'true', row)}/>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {saving[row.id] && <span className="text-xs text-teal-500">Saving…</span>}
                    <button onClick={() => setHistoryId(row.id)} title="History"
                      className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"><Clock size={14}/></button>
                    <button onClick={() => handleDelete(row.id, row.dept_name)} title="Archive"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeletedSection deletedRows={deletedRows} onRestore={handleRestore} labelKey="dept_name"/>
      {historyId && <HistoryDrawer recordId={historyId} getHistory={getHistory} onClose={() => setHistoryId(null)}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart of Accounts Registry
// ─────────────────────────────────────────────────────────────────────────────

function AccountsRegistry() {
  // Collect existing categories for autocomplete
  const [categoryHints, setCategoryHints] = useState([])
  const [txCounts, setTxCounts] = useState({}) // account_code → count

  useEffect(() => {
    // Gather category suggestions from existing accounts
    supabase.from('chart_of_accounts').select('category').eq('org_id', ORG_ID).eq('deleted', false)
      .then(({ data }) => {
        const cats = [...new Set((data || []).map(r => r.category).filter(Boolean))]
        setCategoryHints(cats.sort())
      })

    // Transaction counts per account_code
    supabase.from('transactions').select('account_code').eq('org_id', ORG_ID).eq('deleted', false)
      .then(({ data }) => {
        const counts = {}
        for (const r of (data || [])) counts[r.account_code] = (counts[r.account_code] || 0) + 1
        setTxCounts(counts)
      })
  }, [])

  const {
    rows, deletedRows, loading, error,
    addRow, updateRow, softDelete, restore, getHistory, refresh,
  } = useRegistry('chart_of_accounts', 'account_code')

  const { toasts, add: toast, remove: removeToast } = useToast()
  const [showAdd, setShowAdd]       = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [historyId, setHistoryId]   = useState(null)
  const [search, setSearch]         = useState('')
  const [saving, setSaving]         = useState({})

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      [r.account_code, r.account_name, r.category, r.record_type].some(v => String(v ?? '').toLowerCase().includes(q))
    )
  }, [rows, search])

  const addFields = [
    { key: 'account_code', label: 'Account Code', required: true, placeholder: 'e.g. 4010' },
    { key: 'account_name', label: 'Account Name', required: true, placeholder: 'e.g. Contributions' },
    { key: 'category',     label: 'Category',     required: true, placeholder: 'e.g. Income',
      datalist: 'category', datalistOptions: categoryHints },
    { key: 'record_type',  label: 'Record Type',  required: true, type: 'select',
      options: RECORD_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) },
  ]

  async function handleAdd(values) {
    setAddLoading(true)
    const { error: err } = await addRow(values)
    setAddLoading(false)
    if (err) toast('Error: ' + err, 'error')
    else {
      // Refresh category hints
      const cats = [...new Set([...categoryHints, values.category].filter(Boolean))]
      setCategoryHints(cats.sort())
      toast('Account added')
      setShowAdd(false)
    }
  }

  async function handleUpdate(id, field, newVal, original) {
    if (String(original[field] ?? '') === String(newVal ?? '')) return
    setSaving(p => ({ ...p, [id]: true }))
    const { error: err } = await updateRow(id, { [field]: newVal }, original)
    setSaving(p => ({ ...p, [id]: false }))
    if (err) toast('Save failed: ' + err, 'error')
    else if (field === 'category') {
      const cats = [...new Set([...categoryHints, newVal].filter(Boolean))].sort()
      setCategoryHints(cats)
    }
  }

  async function handleDelete(id, label) {
    const txCount = txCounts[rows.find(r => r.id === id)?.account_code] || 0
    const warn = txCount > 0 ? ` This account has ${txCount} transaction(s) — they'll lose their category mapping until restored.` : ''
    if (!confirm(`Archive "${label}"?${warn}`)) return
    const { error: err } = await softDelete(id)
    if (err) toast('Delete failed: ' + err, 'error')
    else toast(`"${label}" archived`)
  }

  async function handleRestore(id) {
    const { error: err } = await restore(id)
    if (err) toast('Restore failed: ' + err, 'error')
    else toast('Restored')
  }

  async function handleCSVImport(rawRows) {
    let added = 0, skipped = 0
    for (const raw of rawRows) {
      const code = raw.account_code || raw['Account Code'] || raw['Code']
      const name = raw.account_name || raw['Account Name'] || raw['Name']
      const cat  = raw.category     || raw['Category']     || ''
      const rt   = raw.record_type  || raw['Record Type']  || ''
      if (!code || !name || !cat || !RECORD_TYPES.includes(rt.toLowerCase())) { skipped++; continue }
      const { error: err } = await addRow({ account_code: code, account_name: name, category: cat, record_type: rt.toLowerCase() })
      if (err) skipped++; else added++
    }
    await refresh()
    toast(`Imported ${added} accounts${skipped ? `, ${skipped} skipped` : ''}`)
  }

  function handleExport() {
    exportCSV(`chart_of_accounts-${new Date().toISOString().slice(0,10)}.csv`, rows, [
      { key: 'account_code', label: 'account_code' },
      { key: 'account_name', label: 'account_name' },
      { key: 'category',     label: 'category'     },
      { key: 'record_type',  label: 'record_type'  },
      { key: 'active',       label: 'active'        },
    ])
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading accounts…</div>
  if (error)   return <div className="py-12 text-center text-sm text-red-500">Error: {error}</div>

  return (
    <div>
      <Toast toasts={toasts} remove={removeToast}/>

      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0"/>
        <span>
          <strong>Category and Record Type live here only.</strong>{' '}
          Transactions never store category — they're derived at query time by joining to this table.
          Renaming a category here retroactively updates all reports.
        </span>
      </div>

      <SectionHeader title="Chart of Accounts" count={rows.length}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-48"/>
          </div>
          <CSVUploadButton onData={handleCSVImport}/>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            <Download size={13}/> Export CSV
          </button>
          <button onClick={() => setShowAdd(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700">
            <Plus size={13}/> Add Row
          </button>
        </div>
      </SectionHeader>

      {showAdd && <AddRowForm fields={addFields} onAdd={handleAdd} onCancel={() => setShowAdd(false)} loading={addLoading}/>}

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-32">Account Code</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Account Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-40">Category</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Record Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-20 text-center">Tx Count</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                {search ? 'No matches.' : 'No accounts yet. Add manually or import a CSV.'}
              </td></tr>
            )}
            {filteredRows.map(row => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2"><EditableCell value={row.account_code??''} onChange={v => handleUpdate(row.id,'account_code',v,row)}/></td>
                <td className="px-3 py-2"><EditableCell value={row.account_name??''} onChange={v => handleUpdate(row.id,'account_name',v,row)}/></td>
                <td className="px-3 py-2">
                  {/* Category with datalist autocomplete */}
                  <div className="flex items-center">
                    <input
                      type="text"
                      defaultValue={row.category ?? ''}
                      onBlur={e => handleUpdate(row.id, 'category', e.target.value, row)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                      list="category-hints-list"
                      className="text-sm border border-transparent hover:border-gray-200 focus:border-teal-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500 w-full bg-transparent focus:bg-white transition-colors"
                    />
                    <datalist id="category-hints-list">
                      {categoryHints.map(c => <option key={c} value={c}/>)}
                    </datalist>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select value={row.record_type ?? ''} onChange={e => handleUpdate(row.id, 'record_type', e.target.value, row)}
                    className="text-sm border border-gray-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-full">
                    {RECORD_TYPES.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${txCounts[row.account_code] ? 'bg-teal-50 text-teal-700' : 'text-gray-300'}`}>
                    {txCounts[row.account_code] || 0}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {saving[row.id] && <span className="text-xs text-teal-500">Saving…</span>}
                    <button onClick={() => setHistoryId(row.id)} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"><Clock size={14}/></button>
                    <button onClick={() => handleDelete(row.id, row.account_name)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeletedSection deletedRows={deletedRows} onRestore={handleRestore} labelKey="account_name"/>
      {historyId && <HistoryDrawer recordId={historyId} getHistory={getHistory} onClose={() => setHistoryId(null)}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Grants Registry
// ─────────────────────────────────────────────────────────────────────────────

function GrantsRegistry() {
  const columns = [
    { key: 'grant_code',  label: 'Grant Code',  width: 'w-32' },
    { key: 'grant_name',  label: 'Grant Name',  width: 'flex-1' },
    { key: 'description', label: 'Description', width: 'flex-1', placeholder: 'Optional' },
    { key: 'active',      label: 'Active', type: 'select',
      options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
      width: 'w-24' },
  ]

  const addFields = [
    { key: 'grant_code',  label: 'Grant Code',  required: true, placeholder: 'e.g. GR-001' },
    { key: 'grant_name',  label: 'Grant Name',  required: true, placeholder: 'e.g. Lilly Endowment' },
    { key: 'description', label: 'Description', placeholder: 'Optional' },
  ]

  const exportColumns = [
    { key: 'grant_code',  label: 'grant_code'  },
    { key: 'grant_name',  label: 'grant_name'  },
    { key: 'description', label: 'description' },
    { key: 'active',      label: 'active'       },
  ]

  function csvImportMap(raw) {
    const code = raw.grant_code || raw['Grant Code'] || raw['Code']
    const name = raw.grant_name || raw['Grant Name'] || raw['Name']
    if (!code || !name) return null
    return { grant_code: code, grant_name: name, description: raw.description || raw['Description'] || '' }
  }

  return (
    <RegistryTable
      title="Grants"
      tableName="grants"
      orderBy="grant_code"
      columns={columns}
      addFields={addFields}
      exportColumns={exportColumns}
      labelKey="grant_name"
      csvImportMap={csvImportMap}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Org Settings Form
// ─────────────────────────────────────────────────────────────────────────────

function OrgSettingsForm() {
  const { settings, loading, error, saving, save, refresh } = useOrgSettings()
  const { toasts, add: toast, remove: removeToast } = useToast()

  const [draft, setDraft] = useState(null)

  useEffect(() => {
    if (settings && !draft) setDraft({ ...settings })
  }, [settings])

  function set(key, val) { setDraft(p => ({ ...p, [key]: val })) }

  async function handleSave() {
    const changes = {}
    for (const key of Object.keys(draft)) {
      if (draft[key] !== settings[key]) changes[key] = draft[key]
    }
    if (Object.keys(changes).length === 0) { toast('No changes to save'); return }
    const { error: err } = await save(changes)
    if (err) toast('Save failed: ' + (err.message || err), 'error')
    else toast('Settings saved')
  }

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading settings…</div>
  if (error)   return <div className="py-12 text-center text-sm text-red-500">Error: {error}</div>
  if (!draft)  return null

  return (
    <div className="max-w-2xl">
      <Toast toasts={toasts} remove={removeToast}/>

      {/* Identity */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Organization Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name</label>
            <input type="text" value={draft.org_name ?? ''} onChange={e => set('org_name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo Initial</label>
            <input type="text" maxLength={3} value={draft.logo_initial ?? ''} onChange={e => set('logo_initial', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
            <p className="text-xs text-gray-400 mt-1">1–3 chars shown in the nav avatar</p>
          </div>
          <div>
            {/* Preview */}
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Preview</label>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: draft.primary_color || '#D4896A' }}>
                {draft.logo_initial || '?'}
              </div>
              <span className="text-sm text-gray-600">{draft.org_name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Brand Colors</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'primary_color',  label: 'Primary Color'      },
            { key: 'primary_light',  label: 'Primary Light'      },
            { key: 'accent_color',   label: 'Accent Color'       },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={draft[key] ?? '#000000'} onChange={e => set(key, e.target.value)}
                  className="w-10 h-9 border border-gray-200 rounded-lg cursor-pointer p-0.5"/>
                <input type="text" value={draft[key] ?? ''} onChange={e => set(key, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono text-xs"/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Year settings */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Year Configuration</h3>
        <p className="text-xs text-gray-400 mb-4">
          Only the start <em>month</em> is stored. The year is computed dynamically from today's date — the dashboard rolls automatically when today crosses your start month.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Fiscal Year Start Month</label>
            <select value={draft.fiscal_year_start_month ?? 10} onChange={e => set('fiscal_year_start_month', parseInt(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m} ({i+1})</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              FY runs {MONTH_NAMES[draft.fiscal_year_start_month || 10]} → {MONTH_NAMES[((draft.fiscal_year_start_month || 10) + 10) % 12 + 1]}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Operating Year Start Month</label>
            <select value={draft.operating_year_start_month ?? 5} onChange={e => set('operating_year_start_month', parseInt(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              {MONTH_NAMES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m} ({i+1})</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              OY runs {MONTH_NAMES[draft.operating_year_start_month || 5]} → {MONTH_NAMES[((draft.operating_year_start_month || 5) + 10) % 12 + 1]}
            </p>
          </div>
        </div>
      </div>

      {/* Finance */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Finance Settings</h3>
        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Cash Reserve Floor</label>
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-teal-400">
            <span className="px-3 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 py-2">$</span>
            <input type="number" min={0} step={1000}
              value={draft.reserve_floor ?? 0}
              onChange={e => set('reserve_floor', parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2 text-sm focus:outline-none"/>
          </div>
          <p className="text-xs text-gray-400 mt-1">Minimum cash balance for Cash Position KPI</p>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm">
        <Save size={15}/> {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SetupPage — top-level component
// ─────────────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const [activeTab, setActiveTab] = useState('org')

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Sub-nav */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-8">
        <div className="flex items-center gap-0 h-12">
          {SETUP_TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2
                  ${activeTab === t.id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <Icon size={14}/>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 py-6">
        {activeTab === 'org'         && <OrgSettingsForm/>}
        {activeTab === 'teams'       && <TeamsRegistry/>}
        {activeTab === 'departments' && <DepartmentsRegistry/>}
        {activeTab === 'accounts'    && <AccountsRegistry/>}
        {activeTab === 'grants'      && <GrantsRegistry/>}
      </div>
    </div>
  )
}
