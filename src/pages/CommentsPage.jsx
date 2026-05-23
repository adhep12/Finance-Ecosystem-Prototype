import React, { useState } from 'react'
import {
  MessageSquare, CheckCircle2, HelpCircle, ClipboardList,
  Plus, X, Check, Star, DollarSign, TrendingUp, RefreshCw,
} from 'lucide-react'
import { useApp } from '../context/AppContext'

const TYPE_CONFIG = {
  comment:               { label: 'Comment',     icon: MessageSquare,  color: '#6B7280',  bg: '#F3F4F6' },
  question:              { label: 'Question',    icon: HelpCircle,     color: '#F59E0B',  bg: '#FFFBEB' },
  request:               { label: 'Request',     icon: ClipboardList,  color: '#8B5CF6',  bg: '#F5F3FF' },
  'financial-highlight': { label: 'Highlight',   icon: Star,           color: '#10B981',  bg: '#ECFDF5' },
  'budget-request':      { label: 'Budget Ask',  icon: DollarSign,     color: '#8B5CF6',  bg: '#F5F3FF' },
  'variance-explanation':{ label: 'Variance',    icon: TrendingUp,     color: '#F97316',  bg: '#FFF7ED' },
  reclassification:      { label: 'Reclass',     icon: RefreshCw,      color: '#EC4899',  bg: '#FDF2F8' },
}

const PAGE_CONFIG = {
  briefing:  'Briefing',
  breakdown: 'Breakdown',
  import:    'Import',
}

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.comment
  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

function AvatarCircle({ initial, color = '#0EA5A0' }) {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

const AVATAR_COLORS = ['#0EA5A0', '#8B5CF6', '#F97316', '#EC4899', '#14B8A6', '#6366F1']
function avatarColor(str) {
  let hash = 0
  for (const c of str) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (mins > 0)  return `${mins}m ago`
  return 'just now'
}

// ─────────────────────────────────────────────────────────────────────────────
// New Comment Form
// ─────────────────────────────────────────────────────────────────────────────

function NewCommentForm({ onSave, onCancel }) {
  const [text,     setText]     = useState('')
  const [type,     setType]     = useState('comment')
  const [page,     setPage]     = useState('briefing')
  const [category, setCategory] = useState('')
  const [author,   setAuthor]   = useState('')

  function handleSave() {
    if (!text.trim() || !author.trim()) return
    onSave({ text, type, page, category: category || null, author, avatar: author.charAt(0).toUpperCase() })
  }

  return (
    <div className="bg-white rounded-2xl p-5 border-2 border-teal-200">
      <h3 className="font-semibold text-gray-900 mb-4">Add Comment / Request</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Name</label>
          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Enter your name..."
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</label>
            <div className="mt-1 flex gap-1">
              {Object.entries(TYPE_CONFIG).map(([t, cfg]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                    type === t
                      ? 'border-transparent text-white'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={type === t ? { backgroundColor: cfg.color } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Page</label>
            <select
              value={page}
              onChange={e => setPage(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            >
              {Object.entries(PAGE_CONFIG).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category (optional)</label>
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g. Computers, Travel..."
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Message</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add your comment, question, or request..."
            rows={3}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-teal-500"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim() || !author.trim()}
            className="px-4 py-1.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment Card
// ─────────────────────────────────────────────────────────────────────────────

function CommentCard({ comment, onResolve, onDelete }) {
  return (
    <div className={`bg-white rounded-xl p-4 transition-opacity ${comment.resolved ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <AvatarCircle initial={comment.avatar} color={avatarColor(comment.author)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{comment.author}</span>
            <TypeBadge type={comment.type} />
            {comment.page && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium uppercase tracking-wide">
                {PAGE_CONFIG[comment.page] || comment.page}
              </span>
            )}
            {comment.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                {comment.category}
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">{timeAgo(comment.timestamp)}</span>
          </div>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{comment.text}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        {comment.resolved ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle2 size={13} />
            Resolved
          </span>
        ) : (
          <button
            onClick={() => onResolve(comment.id)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 transition-colors font-medium"
          >
            <Check size={13} />
            Mark resolved
          </button>
        )}
        <button
          onClick={() => onDelete(comment.id)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors ml-auto"
        >
          <X size={13} />
          Delete
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommentsPage() {
  const { comments, addComment, resolveComment, deleteComment } = useApp()
  const [showForm,   setShowForm]   = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterPage, setFilterPage] = useState('all')
  const [showResolved, setShowResolved] = useState(false)

  const filtered = comments.filter(c => {
    if (!showResolved && c.resolved) return false
    if (filterType !== 'all' && c.type !== filterType) return false
    if (filterPage !== 'all' && c.page !== filterPage) return false
    return true
  })

  const counts = Object.fromEntries(
    Object.keys(TYPE_CONFIG).map(t => [t, comments.filter(c => c.type === t && !c.resolved).length])
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comments & Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">All annotations across every page in one view</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          <Plus size={15} />
          Add Comment
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(counts).map(([t, n]) => {
          const cfg = TYPE_CONFIG[t]
          return (
            <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white">
              <span className="text-base font-bold" style={{ color: cfg.color }}>{n}</span>
              <span className="text-xs text-gray-500 font-medium capitalize">open {t}{n !== 1 ? 's' : ''}</span>
            </div>
          )
        })}
        <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            className="w-3.5 h-3.5 accent-teal-500"
          />
          <span className="text-xs text-gray-500">Show resolved</span>
        </label>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-white rounded-full px-1 py-1 border border-gray-200">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${filterType === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            All types
          </button>
          {Object.entries(TYPE_CONFIG).map(([t, cfg]) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all capitalize ${filterType === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {t}s
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white rounded-full px-1 py-1 border border-gray-200">
          <button
            onClick={() => setFilterPage('all')}
            className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${filterPage === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            All pages
          </button>
          {Object.entries(PAGE_CONFIG).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilterPage(v)}
              className={`px-3 py-0.5 rounded-full text-xs font-medium transition-all ${filterPage === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* New comment form */}
      {showForm && (
        <NewCommentForm
          onSave={data => { addComment(data); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Comment list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl text-gray-400">
            No comments match your filters
          </div>
        )}
        {filtered.map(c => (
          <CommentCard
            key={c.id}
            comment={c}
            onResolve={resolveComment}
            onDelete={deleteComment}
          />
        ))}
      </div>
    </div>
  )
}
