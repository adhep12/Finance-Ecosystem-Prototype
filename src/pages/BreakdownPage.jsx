import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  ChevronRight, Ban, Plus, X, Search, GripVertical,
  RotateCcw, MessageSquare, Calendar, Tag, Building2,
  ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTeam } from '../context/TeamContext'
import {
  filterActualsByRange,
  calcBudgetByCategory,
  buildVisibleRows,
  getUniqueValues,
} from '../utils/dataProcessing'
import { formatCurrency, formatOverUnder, formatPercent } from '../utils/formatters'
import KPIPanel from '../components/KPIPanel'
import CommentPinFAB from '../components/CommentPinFAB'
import CalendarBreakdownView from '../components/CalendarBreakdownView'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useLocation } from 'react-router-dom'
import { DATA_COLORS, STATUS_COLORS } from '../constants/colors'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_FIELDS = ['category', 'account', 'grant', 'vendor', 'department']

const FIELD_LABELS = {
  category:   'Category',
  account:    'Account',
  grant:      'Grant',
  vendor:     'Vendor',
  department: 'Department',
}

const FIELD_COLORS = {
  category:   DATA_COLORS[1],
  account:    DATA_COLORS[3],
  grant:      DATA_COLORS[2],
  vendor:     DATA_COLORS[7],
  department: DATA_COLORS[5],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function SpendBar({ actual, totalExpenses }) {
  const pct = totalExpenses > 0 ? Math.min((actual / totalExpenses) * 100, 100) : 0
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-14 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-9 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

function fieldColor(field) { return FIELD_COLORS[field] || '#6B7280' }

// ─────────────────────────────────────────────────────────────────────────────
// Department Filter Bar
// ─────────────────────────────────────────────────────────────────────────────

function DeptFilterBar({ allDepts, activeDepts, onToggle, onSelectAll }) {
  const { deptNames } = useApp()
  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-gray-100">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mr-1">Departments</span>
      {allDepts.map(code => {
        const isActive = !activeDepts || activeDepts.has(code)
        return (
          <button
            key={code}
            onClick={() => onToggle(code)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isActive
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
          >
            <span className="opacity-60">{code}</span>
            {deptNames[code] || `Dept ${code}`}
          </button>
        )
      })}
      {activeDepts && (
        <button
          onClick={onSelectAll}
          className="ml-1 text-xs text-teal-600 font-medium hover:underline"
        >
          All
        </button>
      )}
      {activeDepts && (
        <span className="text-xs text-gray-400">
          {activeDepts.size} of {allDepts.length} selected
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill Order Bar (drag-and-drop pills + search)
// ─────────────────────────────────────────────────────────────────────────────

function AddFieldMenu({ inactive, onAdd }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  React.useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  if (inactive.length === 0) return null
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors"
      >
        <Plus size={11} /> Add
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-30 w-36">
          {inactive.map(f => (
            <button
              key={f}
              onClick={() => { onAdd(f); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FIELD_COLORS[f] }} />
              {FIELD_LABELS[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DrillOrderBar({
  drillOrder, setDrillOrder, openPath, setOpenPath,
  searchQuery, setSearchQuery,
  viewMode, setViewMode,
}) {
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  const inactive = ALL_FIELDS.filter(f => !drillOrder.includes(f))

  function handleDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }
  function handleDrop(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDropIdx(null); return }
    const next = [...drillOrder]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    setDrillOrder(next)
    setOpenPath([])
    setDragIdx(null)
    setDropIdx(null)
  }
  function handleDragEnd() { setDragIdx(null); setDropIdx(null) }

  function removeField(field) {
    setDrillOrder(drillOrder.filter(f => f !== field))
    setOpenPath([])
  }

  function addField(field) {
    setDrillOrder([...drillOrder, field])
    setOpenPath([])
  }

  function reset() {
    setDrillOrder(['category', 'account', 'grant', 'vendor'])
    setOpenPath([])
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-white">

      {/* ── Left section: Search + Drill Order + Reset ── */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Search — far left */}
        <div className="flex items-center gap-2 flex-shrink-0 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 w-56">
          <Search size={13} className="text-gray-400 flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search vendor, category..."
            className="text-sm bg-transparent outline-none w-full text-gray-700 placeholder-gray-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex-shrink-0">
          Drill Order
        </span>

        {/* Draggable pills — flex-1 so Reset stays snug against them */}
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {drillOrder.map((field, idx) => (
            <div
              key={field}
              draggable
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className="relative"
            >
              {/* Drop indicator */}
              {dropIdx === idx && dragIdx !== null && dragIdx !== idx && (
                <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-teal-500 rounded-full" />
              )}
              <div
                className={`flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-xs font-semibold border transition-all cursor-grab active:cursor-grabbing ${
                  dragIdx === idx ? 'opacity-40' : 'opacity-100'
                }`}
                style={{
                  backgroundColor: FIELD_COLORS[field] + '20',
                  borderColor: FIELD_COLORS[field] + '60',
                  color: FIELD_COLORS[field],
                }}
              >
                <GripVertical size={10} className="opacity-50" />
                {FIELD_LABELS[field]}
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); removeField(field) }}
                  className="ml-0.5 hover:opacity-70"
                >
                  <X size={9} />
                </button>
              </div>
            </div>
          ))}

          <AddFieldMenu inactive={inactive} onAdd={addField} />
        </div>

        {/* Reset — right next to pills */}
        <button
          onClick={reset}
          className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>

      {/* ── Right section: view toggle — far right ── */}
      {setViewMode && (
        <>
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-0.5 flex-shrink-0">
            {[{id:'summary',label:'Summary'},{id:'calendar',label:'Calendar'}].map(({id, label}) => (
              <button key={id} onClick={() => setViewMode(id)}
                className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hidden items bar
// ─────────────────────────────────────────────────────────────────────────────

function HiddenBar({ hidden, onRestore, onShowAll }) {
  if (hidden.length === 0) return null
  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 border-b border-amber-100 flex-wrap">
      <div className="flex items-center gap-1.5 text-amber-700">
        <Ban size={12} />
        <span className="text-xs font-semibold">{hidden.length} hidden — excluded from totals</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {hidden.map(h => (
          <span key={h.field + h.value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
            <span className="opacity-60 uppercase text-[9px] tracking-wide">{FIELD_LABELS[h.field]}</span>
            {h.value}
            <button onClick={() => onRestore(h.field, h.value)} className="hover:opacity-70">
              <X size={9} />
            </button>
          </span>
        ))}
      </div>
      <button onClick={onShowAll} className="ml-auto text-xs text-amber-700 font-medium hover:underline">
        Show all
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Table header
// ─────────────────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }) {
  if (!active) return <ChevronsUpDown size={10} className="text-gray-300 ml-0.5" />
  return dir === 'desc'
    ? <ArrowDown size={10} className="ml-0.5 text-teal-600" />
    : <ArrowUp   size={10} className="ml-0.5 text-teal-600" />
}

function TableHeader({ drillOrder, selectedScenario, sortCol, sortDir, onSort }) {
  const pathLabel = drillOrder.map(f => FIELD_LABELS[f]).join(' → ')

  const cols = [
    { col: 'actual', label: 'Spend',       width: 96  },
    { col: 'budget', label: selectedScenario, width: 96 },
    { col: 'delta',  label: 'Over/(Under)', width: 110 },
    { col: 'pct',    label: '% of Total',   width: 120 },
  ]

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
      <div className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {pathLabel}
      </div>
      {cols.map(({ col, label, width }) => (
        <button
          key={col}
          onClick={() => onSort(col)}
          className={`flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 transition-colors hover:text-gray-700 ${
            sortCol === col ? 'text-teal-600' : 'text-gray-400'
          }`}
          style={{ width }}
          title={`Sort by ${label}`}
        >
          {label}
          <SortIcon active={sortCol === col} dir={sortDir} />
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group row
// ─────────────────────────────────────────────────────────────────────────────

function GroupRow({ row, onToggle, onHide, totalExpenses }) {
  const delta  = row.budget !== null ? row.actual - row.budget : null
  const isOver = delta !== null && delta >= 0
  const pctUsed = row.budget ? Math.round((row.actual / row.budget) * 100) : null
  const indent = 16 + row.depth * 24

  return (
    <div
      className="flex items-center gap-2 border-b border-gray-100 group cursor-pointer hover:bg-gray-50 transition-all"
      style={{ paddingLeft: indent, paddingRight: 16, paddingTop: 10, paddingBottom: 10, opacity: row.isDimmed ? 0.35 : 1 }}
      onClick={() => onToggle(row.depth, row.value)}
    >
      {/* Expand chevron */}
      <div className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform duration-150 ${row.isExpanded ? 'rotate-90' : ''}`}>
        <ChevronRight size={13} className="text-gray-400" />
      </div>

      {/* Field type label */}
      <span
        className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ backgroundColor: fieldColor(row.field) + '20', color: fieldColor(row.field) }}
      >
        {FIELD_LABELS[row.field]}
      </span>

      {/* Value name + always-visible ban button */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-gray-800 truncate">{row.value}</span>
        <button
          className="flex-shrink-0 p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
          onClick={e => { e.stopPropagation(); onHide(row.field, row.value) }}
          title={`Hide ${row.value}`}
        >
          <Ban size={11} />
        </button>
      </div>

      {/* Spend */}
      <div className="text-right flex-shrink-0 font-semibold text-gray-800 text-sm" style={{ width: 96 }}>
        {formatCurrency(row.actual)}
      </div>

      {/* Budget — show when budget > 0, dash otherwise (data-driven, not type-hardcoded) */}
      <div className="text-right flex-shrink-0 text-gray-500 text-sm" style={{ width: 96 }}>
        {row.budget > 0 ? formatCurrency(row.budget) : <span className="text-gray-300">—</span>}
      </div>

      {/* Over/Under — only meaningful when budget > 0 */}
      <div className="text-right flex-shrink-0" style={{ width: 110 }}>
        {row.budget > 0 && delta !== null ? (
          <>
            <div className="text-sm font-bold" style={{ color: isOver ? 'var(--color-over)' : 'var(--color-under)' }}>
              {formatOverUnder(delta)}
            </div>
            {pctUsed !== null && (
              <div className="text-[10px] text-gray-400">{pctUsed}% used</div>
            )}
          </>
        ) : <span className="text-gray-300">—</span>}
      </div>

      {/* % of Total expenses — mini bar showing this row's share of all spend */}
      <div className="flex-shrink-0" style={{ width: 120 }}>
        <SpendBar actual={row.actual} totalExpenses={totalExpenses} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction row (leaf)
// ─────────────────────────────────────────────────────────────────────────────

function TransactionRow({ row, onSelect }) {
  const t = row.item
  const indent = 16 + row.depth * 24
  return (
    <div
      className="flex items-center gap-3 border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
      style={{ paddingLeft: indent, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}
      onClick={() => onSelect(t)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-800 truncate">{t.vendor}</span>
          {t.grant && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex-shrink-0">
              {t.grant}
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2 truncate">
          <span>{t.date}</span>
          {t.description && <span className="truncate">{t.description}</span>}
        </div>
      </div>
      <div className="text-sm font-semibold text-gray-700 flex-shrink-0" style={{ width: 96, textAlign: 'right' }}>
        {formatCurrency(t.amount)}
      </div>
      {/* Empty placeholders for Budget, Over/Under, % of Total columns */}
      <div style={{ width: 96 }} />
      <div style={{ width: 110 }} />
      <div style={{ width: 120 }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction detail modal
// ─────────────────────────────────────────────────────────────────────────────

const PIN_TYPES = [
  { type: 'question',             label: 'Question',             color: '#0EA5A0' },
  { type: 'variance-explanation', label: 'Variance Explanation', color: '#F97316' },
  { type: 'reclassification',     label: 'Reclassify',           color: '#F59E0B' },
  { type: 'financial-highlight',  label: 'Financial Highlight',  color: '#10B981' },
  { type: 'budget-request',       label: 'Budget Request',       color: '#8B5CF6' },
]

function TransactionModal({ transaction: t, onClose, onAddComment }) {
  const { deptNames } = useApp()
  const { teamId }    = useTeam()
  const [text,   setText]   = useState('')
  const [type,   setType]   = useState('question')
  const [author, setAuthor] = useState('')
  const [saved,  setSaved]  = useState(false)

  function handleSave() {
    if (!text.trim() || !author.trim()) return
    onAddComment({
      author,
      avatar: author.charAt(0).toUpperCase(),
      type,
      page: 'breakdown',
      text,
      category: t.category,
      status: 'open',
      anchor: {
        type: 'tx',
        txRef: {
          date:       t.date,
          vendor:     t.vendor,
          amount:     t.amount,
          department: t.department,
          category:   t.category,
          account:    t.account || '',
        },
      },
    })
    setText('')
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const selectedPin = PIN_TYPES.find(p => p.type === type) || PIN_TYPES[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{t.vendor}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{t.date} · {t.category} · {t.account}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900">{formatCurrency(t.amount)}</span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Transaction fields */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          {[
            { label: 'Date',        value: t.date,        icon: Calendar  },
            { label: 'Amount',      value: formatCurrency(t.amount), icon: null },
            { label: 'Department',  value: deptNames[t.department] || t.department, icon: Building2 },
            { label: 'Category',    value: t.category,    icon: Tag       },
            { label: 'Account',     value: t.account,     icon: null      },
            { label: 'Grant',       value: t.grant || '—', icon: null     },
            { label: 'Description', value: t.description || '—', icon: null, full: true },
          ].map(f => (
            <div key={f.label} className={f.full ? 'col-span-2' : ''}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{f.label}</div>
              <div className="text-sm text-gray-800 mt-0.5 font-medium">{f.value}</div>
            </div>
          ))}
        </div>

        {/* Comment form */}
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            <MessageSquare size={11} className="inline mr-1" /> Leave a comment on this transaction
          </div>

          {/* Type pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PIN_TYPES.map(pt => (
              <button
                key={pt.type}
                onClick={() => setType(pt.type)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  type === pt.type ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
                style={type === pt.type ? { backgroundColor: pt.color, borderColor: pt.color } : {}}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: type === pt.type ? 'rgba(255,255,255,0.7)' : pt.color }}
                />
                {pt.label}
              </button>
            ))}
          </div>

          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Your name"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:border-teal-500"
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Add a ${selectedPin.label.toLowerCase()}…`}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none mb-2 focus:outline-none focus:border-teal-500"
          />
          <div className="flex justify-end gap-2 items-center">
            {saved && (
              <span className="text-xs text-green-600 font-medium flex-1">
                Saved! → <a href={`/team/${teamId}/comments`} className="underline">View in Comments</a>
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!text.trim() || !author.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-40 transition-colors"
              style={{ backgroundColor: selectedPin.color }}
            >
              Post {selectedPin.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Breakdown Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BreakdownPage() {
  const { selectedScenario, dateRange, addComment, deptNames } = useApp()

  // Scope all actuals + budget to this team's departments only
  const { teamActuals: actuals, teamBudget: budgetFlat } = useTeam()

  // ── Persistent state (survives navigation & reload) ───────────────────────
  const [drillOrder,      setDrillOrder]      = useLocalStorage('bd-drill-order',   ['category', 'account', 'grant', 'vendor'])
  const [breakdownHidden, setBreakdownHidden] = useLocalStorage('bd-hidden',        [])

  // ── Transient state ───────────────────────────────────────────────────────
  const [viewMode,      setViewMode]      = useState('summary')  // 'summary' | 'calendar'
  const [activeDepts,   setActiveDepts]   = useState(null)  // null = all active
  const [searchQuery,   setSearchQuery]   = useState('')
  const [openPath,      setOpenPath]      = useState([])
  const [selectedTx,    setSelectedTx]    = useState(null)

  const location = useLocation()
  useEffect(() => {
    const openTx = location.state?.openTx
    if (!openTx) return
    const match = actuals.find(tx =>
      tx.date === openTx.date &&
      tx.vendor === openTx.vendor &&
      Math.abs(tx.amount - openTx.amount) < 0.01
    )
    if (match) setSelectedTx(match)
  }, [location.state, actuals])

  // ── Sort state ────────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState(null)   // 'actual' | 'budget' | 'delta' | 'pct' | null
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const allDepts = useMemo(() => getUniqueValues(actuals, 'department'), [actuals])

  // 1. Date range filter
  const dateFiltered = useMemo(() =>
    filterActualsByRange(actuals, dateRange.startDate, dateRange.endDate),
    [actuals, dateRange]
  )

  // 2. Dept filter
  const deptFiltered = useMemo(() => {
    if (!activeDepts) return dateFiltered
    return dateFiltered.filter(t => activeDepts.has(t.department))
  }, [dateFiltered, activeDepts])

  // 3. Hidden items removed
  const unhidden = useMemo(() =>
    deptFiltered.filter(t =>
      !breakdownHidden.some(h => (t[h.field] ?? 'N/A') === h.value)
    ),
    [deptFiltered, breakdownHidden]
  )

  // 4. Search filter
  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return unhidden
    return unhidden.filter(t =>
      [t.vendor, t.description, t.category, t.account, t.grant]
        .some(v => v?.toLowerCase().includes(q))
    )
  }, [unhidden, searchQuery])

  // 5. Budget (filtered by active depts)
  const budgetByCat = useMemo(() => {
    const depts = activeDepts ? [...activeDepts] : null
    return calcBudgetByCategory(budgetFlat, selectedScenario, dateRange.startDate, dateRange.endDate, depts)
  }, [budgetFlat, selectedScenario, dateRange, activeDepts])

  // 6. Visible rows (with optional sort)
  const sortConfig = useMemo(
    () => sortCol ? { col: sortCol, dir: sortDir } : null,
    [sortCol, sortDir]
  )
  const visibleRows = useMemo(() =>
    buildVisibleRows(searchFiltered, drillOrder, openPath, budgetByCat, sortConfig),
    [searchFiltered, drillOrder, openPath, budgetByCat, sortConfig]
  )

  // ── Summary stats for KPI panel ──────────────────────────────────────────
  const totalActual  = unhidden.reduce((s, t) => s + t.amount, 0)
  const totalBudget  = Object.values(budgetByCat).reduce((s, v) => s + v, 0)

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleRow = useCallback((depth, value) => {
    setOpenPath(prev => {
      if (prev[depth] === value) return prev.slice(0, depth)
      const next = prev.slice(0, depth)
      next[depth] = value
      return next
    })
  }, [])

  function hideRow(field, value) {
    setBreakdownHidden(prev => {
      if (prev.some(h => h.field === field && h.value === value)) return prev
      return [...prev, { field, value }]
    })
    const depth = drillOrder.indexOf(field)
    if (depth !== -1 && openPath[depth] === value) {
      setOpenPath(prev => prev.slice(0, depth))
    }
  }

  function restoreHidden(field, value) {
    setBreakdownHidden(prev => prev.filter(h => !(h.field === field && h.value === value)))
  }

  function toggleDept(code) {
    setActiveDepts(prev => {
      const all = new Set(allDepts)
      const current = prev || all
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      if (next.size === all.size) return null  // all active = null
      return next
    })
  }

  // Open path breadcrumb label
  const openPathLabel = openPath.map((v, i) => {
    const f = drillOrder[i]
    return f ? `${FIELD_LABELS[f]}: ${v}` : v
  }).join(' › ')

  return (
    <>
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">
      {/* ── Left panel: controls + table ────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Department chips */}
        <DeptFilterBar
          allDepts={allDepts}
          activeDepts={activeDepts}
          onToggle={toggleDept}
          onSelectAll={() => setActiveDepts(null)}
        />

        {/* Drill order + search + view toggle */}
        <DrillOrderBar
          drillOrder={drillOrder}
          setDrillOrder={setDrillOrder}
          openPath={openPath}
          setOpenPath={setOpenPath}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* Hidden bar */}
        <HiddenBar
          hidden={breakdownHidden}
          onRestore={restoreHidden}
          onShowAll={() => setBreakdownHidden([])}
        />

        {/* Open path breadcrumb — summary mode only */}
        {viewMode === 'summary' && openPath.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">Drilled into</span>
            <ChevronRight size={11} className="text-gray-300" />
            <span>{openPathLabel}</span>
            <button
              onClick={() => setOpenPath([])}
              className="ml-auto text-teal-600 font-medium hover:underline"
            >
              Collapse all
            </button>
          </div>
        )}

        {/* ── Calendar view ────────────────────────────────────────────────── */}
        {viewMode === 'calendar' && (
          <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
            <CalendarBreakdownView
              transactions={unhidden}
              budgetFlat={budgetFlat}
              selectedScenario={selectedScenario}
              drillOrder={drillOrder}
              dateRange={dateRange}
              deptNames={deptNames}
              activeDepts={activeDepts}
              onHide={hideRow}
            />
          </div>
        )}

        {/* ── Summary table ─────────────────────────────────────────────────── */}
        {viewMode === 'summary' && (
          <div className="flex-1 overflow-y-auto">
            <TableHeader
              drillOrder={drillOrder}
              selectedScenario={selectedScenario}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={handleSort}
            />

            {visibleRows.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">
                {searchQuery ? `No results for "${searchQuery}"` : 'No data in this date range'}
              </div>
            )}

            {visibleRows.map((row, i) => {
              if (row.type === 'transaction') {
                return (
                  <TransactionRow
                    key={`tx-${i}-${row.item.date}-${row.item.vendor}-${row.item.amount}`}
                    row={row}
                    onSelect={setSelectedTx}
                  />
                )
              }
              return (
                <GroupRow
                  key={`grp-${i}-${row.field}-${row.value}`}
                  row={row}
                  onToggle={toggleRow}
                  onHide={hideRow}
                  totalExpenses={totalActual}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right panel: KPI — summary mode only ─────────────────────────── */}
      {viewMode === 'summary' && (
        <div
          className="w-72 flex-shrink-0 border-l border-gray-200 overflow-y-auto p-4"
          style={{ backgroundColor: 'var(--color-primary-bg)' }}
        >
          <KPIPanel
            actual={totalActual}
            budget={totalBudget}
            transactions={unhidden.length}
            selectedScenario={selectedScenario}
            actuals={unhidden}
            budgetByCat={budgetByCat}
          />
        </div>
      )}

      {/* Comment pin FAB */}
      <CommentPinFAB page="breakdown" sourceDashboard="Content Team" sourcePage="Breakdown" rightClassName={viewMode === 'summary' ? 'right-[296px]' : 'right-4'} />

      {/* Transaction modal */}
      {selectedTx && (
        <TransactionModal
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onAddComment={data => {
            addComment({ ...data, source_dashboard: 'Content Team', source_page: 'Breakdown' })
            // leave modal open so user can see "Saved!" message
          }}
        />
      )}
    </div>
    </>
  )
}
