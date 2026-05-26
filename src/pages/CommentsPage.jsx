import React, { useState, useMemo, useRef } from 'react'
import {
  Search, Plus, X, ChevronRight, Diamond,
  MessageSquare, List, LayoutGrid,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useTeamOptional } from '../context/TeamContext'
import { useNavigate, useParams } from 'react-router-dom'
import { formatCurrency } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { type: 'question',             label: 'Question',             color: '#00B3E5' },
  { type: 'variance-explanation', label: 'Variance Explanation', color: '#C05A2F' },
  { type: 'reclassification',     label: 'Reclassify',           color: '#E8A838' },
  { type: 'financial-highlight',  label: 'Financial Highlight',  color: '#4E6B3A' },
  { type: 'budget-request',       label: 'Budget Request',       color: '#4A2E5A' },
]

const STATUS_CONFIG = {
  open:     { label: 'OPEN',     dot: '#F59E0B', bg: '#FFF8ED', text: '#B45309' },
  approved: { label: 'APPROVED', dot: '#10B981', bg: '#ECFDF5', text: '#065F46' },
  rejected: { label: 'REJECTED', dot: '#EF4444', bg: '#FEF2F2', text: '#991B1B' },
  resolved: { label: 'RESOLVED', dot: '#6B7280', bg: '#F3F4F6', text: '#374151' },
}

const TYPE_LABEL_MAP = {
  question:             'Question',
  'variance-explanation': 'Variance Explanation',
  reclassification:     'Reclassification',
  'financial-highlight': 'Financial Highlight',
  'budget-request':     'Budget Request',
  comment:              'Comment',
  request:              'Request',
}

const TYPE_COLOR_MAP = {
  question:               '#00B3E5',
  'variance-explanation': '#C05A2F',
  reclassification:       '#E8A838',
  'financial-highlight':  '#4E6B3A',
  'budget-request':       '#4A2E5A',
  comment:                '#89929E',
  request:                '#4A2E5A',
}

function getStatus(c) { return c.status || (c.resolved ? 'resolved' : 'open') }

function timeShort(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }) {
  const label = TYPE_LABEL_MAP[type] || type
  const color = TYPE_COLOR_MAP[type] || '#6B7280'
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest"
      style={{ color, backgroundColor: color + '18' }}
    >
      {label}
    </span>
  )
}

function AnchorLine({ comment }) {
  const txRef = comment.anchor?.txRef || comment.transactionRef
  if (!txRef && !comment.page) return null
  const dept = txRef?.department || '—'
  const label = txRef ? `Txn · ${dept} · Staff` : (comment.page ? comment.page.charAt(0).toUpperCase() + comment.page.slice(1) : '—')
  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-400">
      <Diamond size={9} className="flex-shrink-0" />
      <span>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Comment Form (modal)
// ─────────────────────────────────────────────────────────────────────────────

function AddCommentModal({ initialType = 'question', onClose }) {
  const { addComment } = useApp()
  const [type,   setType]   = useState(initialType)
  const [text,   setText]   = useState('')
  const [author, setAuthor] = useState('')
  const [page,   setPage]   = useState('briefing')

  function handleSave() {
    if (!text.trim() || !author.trim()) return
    addComment({ author, avatar: author.charAt(0).toUpperCase(), type, text, page, category: null, anchor: null, status: 'open' })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add Comment</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {KANBAN_COLS.map(col => (
                <button
                  key={col.type}
                  onClick={() => setType(col.type)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${type === col.type ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}
                  style={type === col.type ? { backgroundColor: col.color, borderColor: col.color } : {}}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
          {/* Page */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Page</label>
            <select value={page} onChange={e => setPage(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="briefing">Briefing</option>
              <option value="breakdown">Breakdown</option>
            </select>
          </div>
          {/* Text */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Comment</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Write your comment..." className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          {/* Author */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Your Name</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Enter your name" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={!text.trim() || !author.trim()} className="px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40" style={{ backgroundColor: '#111827' }}>Post comment</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment Detail Panel (slide-in from right)
// ─────────────────────────────────────────────────────────────────────────────

function CommentDetailPanel({ comment, onClose }) {
  const { updateCommentStatus, deleteComment } = useApp()
  const { teamId } = useParams()
  const navigate = useNavigate()
  const status   = getStatus(comment)
  const typeColor = TYPE_COLOR_MAP[comment.type] || '#6B7280'
  const txRef     = comment.anchor?.txRef || comment.transactionRef

  const STATUSES = ['open', 'approved', 'rejected', 'resolved']

  function handleDelete() {
    deleteComment(comment.id)
    onClose()
  }

  function handleOpenInContext() {
    const anchor = comment.anchor
    const base   = teamId ? `/team/${teamId}` : ''
    if (anchor?.type === 'tx' && anchor.txRef) {
      navigate(`${base}/breakdown`, { state: { openTx: anchor.txRef } })
    } else {
      navigate(comment.page === 'breakdown' ? `${base}/breakdown` : `${base}/briefing`)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-80 shadow-2xl flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-200" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
          <div className="flex items-start justify-between mb-2">
            <TypeBadge type={comment.type} />
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg text-gray-400 flex-shrink-0"><X size={14} /></button>
          </div>
          <div className="font-semibold text-gray-900">{comment.author} <span className="text-gray-400 font-normal">· {timeShort(comment.timestamp)}</span></div>
          <AnchorLine comment={comment} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Comment text */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Comment</div>
            <p className="text-sm text-gray-800 leading-relaxed">{comment.text}</p>
          </div>

          {/* Status selector */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Status</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s]
                const isActive = status === s
                return (
                  <button
                    key={s}
                    onClick={() => updateCommentStatus(comment.id, s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isActive ? 'text-white border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    style={isActive ? { backgroundColor: '#111827' } : {}}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? 'white' : cfg.dot }} />
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Anchor */}
          {txRef && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Anchor</div>
              <div className="bg-white rounded-xl p-3 text-xs space-y-1 border border-gray-100">
                <div className="flex gap-3">
                  <span className="text-gray-400 w-8">TYPE</span>
                  <span className="text-gray-700 font-medium">tx</span>
                </div>
                {txRef.vendor && (
                  <div className="flex gap-3">
                    <span className="text-gray-400 w-8">TXN</span>
                    <span className="text-gray-700 font-medium truncate">{txRef.vendor}</span>
                  </div>
                )}
                {txRef.amount && (
                  <div className="flex gap-3">
                    <span className="text-gray-400 w-8">AMT</span>
                    <span className="text-gray-700 font-medium">{formatCurrency(txRef.amount)}</span>
                  </div>
                )}
                {txRef.date && (
                  <div className="flex gap-3">
                    <span className="text-gray-400 w-8">DATE</span>
                    <span className="text-gray-700">{txRef.date}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleOpenInContext}
                className="mt-2 inline-flex items-center gap-1 text-xs text-teal-600 font-semibold border border-teal-200 rounded-xl px-3 py-1.5 hover:bg-teal-50 transition-colors"
              >
                Open in context <ChevronRight size={12} />
              </button>
            </div>
          )}
          {!txRef && comment.page && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Source</div>
              <button
                onClick={handleOpenInContext}
                className="inline-flex items-center gap-1 text-xs text-teal-600 font-semibold border border-teal-200 rounded-xl px-3 py-1.5 hover:bg-teal-50 transition-colors"
              >
                Open in context <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-200">
          <button
            onClick={handleDelete}
            className="w-full py-2 text-sm text-red-500 font-medium border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            Delete comment
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban Card
// ─────────────────────────────────────────────────────────────────────────────

function KanbanCard({ comment, colColor, onSelect, onDragStart }) {
  const status = getStatus(comment)
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, comment.id)}
      onClick={() => onSelect(comment)}
      className="bg-white rounded-xl p-3 shadow-sm border-l-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeftColor: colColor }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <AnchorLine comment={comment} />
        <StatusBadge status={status} />
      </div>
      <p className="text-sm text-gray-800 leading-snug line-clamp-3 mb-2">{comment.text}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium">{comment.author}</span>
        <span className="text-[10px] text-gray-400">{timeShort(comment.timestamp)}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban Board
// ─────────────────────────────────────────────────────────────────────────────

function KanbanBoard({ comments, onSelect, onAddToCol, onChangeType }) {
  const [dragId, setDragId] = useState(null)

  function handleDragStart(e, id) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(e, targetType) {
    e.preventDefault()
    if (dragId && onChangeType) {
      onChangeType(dragId, targetType)
    }
    setDragId(null)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 flex-1">
      {KANBAN_COLS.map(col => {
        const colComments = comments.filter(c => c.type === col.type)
        return (
          <div
            key={col.type}
            className="flex-shrink-0 w-64 flex flex-col"
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, col.type)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <span className="text-sm font-semibold text-gray-800 flex-1">{col.label}</span>
              <span className="text-xs text-gray-400 font-medium">{colComments.length}</span>
              <button
                onClick={() => onAddToCol(col.type)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1">
              {colComments.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  No items.
                </div>
              )}
              {colComments.map(c => (
                <KanbanCard
                  key={c.id}
                  comment={c}
                  colColor={col.color}
                  onSelect={onSelect}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// List View
// ─────────────────────────────────────────────────────────────────────────────

function ListView({ comments, onSelect }) {
  const txRef = c => c.anchor?.txRef || c.transactionRef
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
      {/* Table header */}
      <div className="grid grid-cols-[160px_1fr_120px_100px_80px] gap-3 px-5 py-2.5 border-b border-gray-200 bg-gray-50">
        {['KIND', 'COMMENT', 'AUTHOR', 'STATUS', 'DATE'].map(h => (
          <div key={h} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</div>
        ))}
      </div>
      {comments.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No comments match your filters</div>
      )}
      {comments.map(c => {
        const ref = txRef(c)
        const anchor = ref ? `· Txn · ${ref.department || '—'} · Staff` : (c.page ? `· ${c.page.charAt(0).toUpperCase() + c.page.slice(1)}` : '')
        return (
          <div
            key={c.id}
            onClick={() => onSelect(c)}
            className="grid grid-cols-[160px_1fr_120px_100px_80px] gap-3 px-5 py-3.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors last:border-0"
          >
            <div><TypeBadge type={c.type} /></div>
            <div className="text-sm text-gray-800 truncate">
              {anchor && <span className="text-gray-400 mr-2">{anchor}</span>}
              {c.text}
            </div>
            <div className="text-sm text-gray-700 font-medium truncate">{c.author}</div>
            <div><StatusBadge status={getStatus(c)} /></div>
            <div className="text-xs text-gray-500">{timeShort(c.timestamp)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Comments Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommentsPage({ context = 'admin' }) {
  const { comments, orgConfig, updateComment } = useApp()
  const teamCtx  = useTeamOptional()          // null when rendered in MasterDashboard
  const team     = teamCtx?.team || null
  const teamName = team?.team_name || orgConfig.teamName

  const [view,           setView]           = useState('kanban')
  const [statusFilters,  setStatusFilters]  = useState({ open: true, approved: true, rejected: true, resolved: true })
  const [search,         setSearch]         = useState('')
  const [selectedComment, setSelectedComment] = useState(null)
  const [showAddModal,   setShowAddModal]   = useState(false)
  const [addModalType,   setAddModalType]   = useState('question')

  function toggleStatus(s) {
    setStatusFilters(prev => ({ ...prev, [s]: !prev[s] }))
  }

  const filtered = useMemo(() => {
    return comments.filter(c => {
      const status = getStatus(c)
      if (!statusFilters[status]) return false
      if (search && !c.text.toLowerCase().includes(search.toLowerCase()) && !c.author.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [comments, statusFilters, search])

  function handleAddToCol(type) {
    setAddModalType(type)
    setShowAddModal(true)
  }

  function handleChangeType(id, newType) {
    updateComment(id, { type: newType })
    // If the currently selected comment was changed, update it
    if (selectedComment?.id === id) {
      setSelectedComment(prev => prev ? { ...prev, type: newType } : null)
    }
  }

  // Sync selectedComment when comments change (e.g. status update)
  const liveSelected = selectedComment
    ? comments.find(c => c.id === selectedComment.id) || null
    : null

  const totalVisible = filtered.length

  return (
    <>
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden p-5 gap-4">
      {/* Header */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">
          COMMENTS & REQUESTS · {team ? (teamName || 'Team').toUpperCase() : context === 'executive' ? 'EXECUTIVE OVERVIEW' : 'ALL TEAMS'}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Comments & requests</h1>
        <p className="text-sm text-gray-500">{totalVisible} item{totalVisible !== 1 ? 's' : ''} in view</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className="uppercase tracking-widest text-[10px]">View</span>
          <div className="flex rounded-full overflow-hidden border border-gray-200 bg-white">
            {[['kanban', LayoutGrid], ['list', List]].map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold capitalize transition-all ${view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
              >
                <Icon size={12} />
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Status filters */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className="uppercase tracking-widest text-[10px]">Status</span>
          <div className="flex gap-1">
            {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${statusFilters[s] ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusFilters[s] ? 'white' : cfg.dot }} />
                {cfg.label.charAt(0) + cfg.label.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Search */}
        <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 border border-gray-200 w-52">
          <Search size={13} className="text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search comments..."
            className="text-sm bg-transparent outline-none w-full text-gray-700 placeholder-gray-400"
          />
          {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>}
        </div>

        {/* Add button */}
        <button
          onClick={() => { setAddModalType('question'); setShowAddModal(true) }}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#111827' }}
        >
          <Plus size={14} />
          Add Comment
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {view === 'kanban' ? (
          <div className="h-full overflow-x-auto">
            <KanbanBoard
              comments={filtered}
              onSelect={setSelectedComment}
              onAddToCol={handleAddToCol}
              onChangeType={handleChangeType}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <ListView comments={filtered} onSelect={setSelectedComment} />
          </div>
        )}
      </div>

      {/* Detail panel */}
      {liveSelected && (
        <CommentDetailPanel
          comment={liveSelected}
          onClose={() => setSelectedComment(null)}
        />
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddCommentModal
          initialType={addModalType}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
    </>
  )
}
