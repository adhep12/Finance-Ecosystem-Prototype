import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Ban, X, ChevronRight, Check, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const PIN_TYPES = [
  { type: 'question',             label: 'Question',             color: '#0EA5A0', placeholder: 'What are you wondering about?' },
  { type: 'variance-explanation', label: 'Variance Explanation', color: '#F97316', placeholder: 'Explain the variance…' },
  { type: 'reclassification',     label: 'Reclassify',           color: '#F59E0B', placeholder: 'Describe the reclassification needed…' },
  { type: 'financial-highlight',  label: 'Financial Highlight',  color: '#10B981', placeholder: 'Share a financial insight…' },
  { type: 'budget-request',       label: 'Budget Request',       color: '#8B5CF6', placeholder: 'Describe the budget request…' },
]

const STATUS_COLORS = {
  open:     '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  resolved: '#9CA3AF',
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Pin hover card ───────────────────────────────────────────────────────────
function PinHoverCard({ pin, onResolve, onDelete, onOpenComments, style }) {
  const cfg = PIN_TYPES.find(t => t.type === pin.type) || PIN_TYPES[0]
  const status = pin.status || (pin.resolved ? 'resolved' : 'open')
  return (
    <div
      className="absolute z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 w-64 p-0 overflow-hidden pointer-events-auto"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: cfg.color }}
        >
          {pin.avatar || (pin.author || 'A')[0].toUpperCase()}
        </div>
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate uppercase tracking-wide">{pin.page?.toUpperCase() || 'PAGE'}</span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 px-4 pb-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{ backgroundColor: cfg.color + '20', color: cfg.color }}
        >
          {cfg.label}
        </span>
        <span className="text-[10px] text-gray-400">{fmtDate(pin.timestamp)}</span>
        <span
          className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase"
          style={{ backgroundColor: STATUS_COLORS[status] + '20', color: STATUS_COLORS[status] }}
        >
          {status}
        </span>
      </div>

      {/* Author + text */}
      <div className="px-4 pb-3">
        <div className="text-[11px] font-semibold text-gray-500 mb-0.5">{pin.author}</div>
        <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{pin.text}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 pb-3 border-t border-gray-50 pt-2">
        <button
          onClick={onResolve}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-green-600 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
        >
          <Check size={11} /> Resolve
        </button>
        <button
          onClick={onOpenComments}
          className="flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors flex-1"
        >
          Open in Comments <ChevronRight size={10} />
        </button>
        <button
          onClick={onDelete}
          className="text-gray-300 hover:text-red-400 p-1 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Single positioned pin circle ────────────────────────────────────────────
function PinCircle({ pin }) {
  const [hovering, setHovering] = useState(false)
  const { updateCommentStatus, deleteComment } = useApp()
  const navigate = useNavigate()
  const cfg = PIN_TYPES.find(t => t.type === pin.type) || PIN_TYPES[0]
  const initials = (pin.author || 'A')[0].toUpperCase()

  // Determine card position: if pin is in right half, show card to the left; else right
  const xPct = pin.pinPosition?.xPct ?? 50
  const yPct = pin.pinPosition?.yPct ?? 50
  const cardLeft  = xPct > 60 ? 'auto' : '110%'
  const cardRight = xPct > 60 ? '110%' : 'auto'
  const cardTop   = yPct > 70 ? 'auto' : '0'
  const cardBottom = yPct > 70 ? '0' : 'auto'

  return (
    <div
      className="fixed z-30 pointer-events-auto"
      style={{
        left:      `${xPct}%`,
        top:       `${yPct}%`,
        transform: 'translate(-50%, -50%)',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Circle */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg cursor-pointer border-2 border-white select-none"
        style={{ backgroundColor: cfg.color }}
        title={pin.author}
      >
        {initials}
      </div>

      {/* Hover card */}
      {hovering && (
        <PinHoverCard
          pin={pin}
          style={{ left: cardLeft, right: cardRight, top: cardTop, bottom: cardBottom }}
          onResolve={() => updateCommentStatus(pin.id, 'resolved')}
          onDelete={() => deleteComment(pin.id)}
          onOpenComments={() => navigate('/comments')}
        />
      )}
    </div>
  )
}

// ─── Comment post modal ───────────────────────────────────────────────────────
function CommentPinModal({ page, pinPosition, onClose }) {
  const { addComment } = useApp()
  const [selectedType, setSelectedType] = useState('question')
  const [text,   setText]   = useState('')
  const [author, setAuthor] = useState('')
  const [saved,  setSaved]  = useState(false)

  const cfg = PIN_TYPES.find(t => t.type === selectedType) || PIN_TYPES[0]

  function handlePost() {
    if (!text.trim() || !author.trim()) return
    addComment({
      author,
      avatar: author.charAt(0).toUpperCase(),
      type:   selectedType,
      text,
      page,
      category: null,
      anchor:   null,
      status:   'open',
      pinPosition,
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="pointer-events-auto absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative pointer-events-auto bg-white rounded-2xl shadow-2xl w-80 mr-6 mb-20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div>
            <h3 className="font-semibold text-gray-900 capitalize">Add comment</h3>
            {pinPosition && (
              <p className="text-[11px] text-teal-600 font-medium">📍 Pinned at this spot</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={15} />
          </button>
        </div>

        {/* Type pills */}
        <div className="px-4 py-3 flex flex-wrap gap-1.5">
          {PIN_TYPES.map(t => (
            <button
              key={t.type}
              onClick={() => setSelectedType(t.type)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                selectedType === t.type
                  ? 'text-white border-transparent'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
              style={selectedType === t.type ? { backgroundColor: t.color, borderColor: t.color } : {}}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedType === t.type ? 'rgba(255,255,255,0.7)' : t.color }}
              />
              {t.label}
            </button>
          ))}
        </div>

        {/* Text */}
        <div className="px-4 pb-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={cfg.placeholder}
            rows={3}
            autoFocus
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
          />
        </div>

        {/* Author */}
        <div className="px-4 pb-4">
          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Your name"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
          {saved && <span className="text-xs text-green-600 font-medium flex-1">Posted!</span>}
          {!saved && <div className="flex-1" />}
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={!text.trim() || !author.trim()}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-colors"
            style={{ backgroundColor: cfg.color }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main FAB export ──────────────────────────────────────────────────────────
export default function CommentPinFAB({ page, rightClassName = 'right-6' }) {
  const { comments, updateCommentStatus, deleteComment } = useApp()
  const [showPins,   setShowPins]   = useState(true)
  const [placing,    setPlacing]    = useState(false)   // placement mode
  const [pinPos,     setPinPos]     = useState(null)    // { xPct, yPct }
  const [showModal,  setShowModal]  = useState(false)

  const pagePins = comments.filter(c => c.page === page)
  const placedPins = pagePins.filter(c => c.pinPosition)

  // Placement: record click position as viewport %
  function handlePlacementClick(e) {
    if (!placing) return
    const xPct = (e.clientX / window.innerWidth)  * 100
    const yPct = (e.clientY / window.innerHeight) * 100
    setPinPos({ xPct, yPct })
    setPlacing(false)
    setShowModal(true)
  }

  function handleStartPlacing() {
    setPlacing(true)
  }

  function handleCancelPlacing() {
    setPlacing(false)
    setPinPos(null)
  }

  function handleCloseModal() {
    setShowModal(false)
    setPinPos(null)
  }

  return (
    <>
      {/* Placement overlay — fullscreen crosshair */}
      {placing && (
        <div
          className="fixed inset-0 z-40"
          style={{ cursor: 'crosshair', backgroundColor: 'rgba(0,0,0,0.08)' }}
          onClick={handlePlacementClick}
        >
          {/* Instruction banner */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl flex items-center gap-3 pointer-events-none">
            <MessageSquare size={14} />
            Click anywhere to drop your comment pin
            <button
              className="pointer-events-auto text-gray-300 hover:text-white ml-2 transition-colors"
              onClick={e => { e.stopPropagation(); handleCancelPlacing() }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Positioned pin circles */}
      {showPins && placedPins.map(pin => (
        <PinCircle key={pin.id} pin={pin} />
      ))}

      {/* FAB buttons */}
      {!placing && (
        <div className={`fixed bottom-6 ${rightClassName} flex items-center gap-2 z-20`}>
          {pagePins.length > 0 && (
            <button
              onClick={() => setShowPins(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-full text-xs font-medium text-gray-600 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Ban size={13} className="text-gray-400" />
              {showPins ? 'Hide pins' : `Show ${pagePins.length} pins`}
            </button>
          )}
          <button
            onClick={handleStartPlacing}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold shadow-lg hover:bg-gray-800 transition-colors"
          >
            <MessageSquare size={14} />
            Drop a comment pin
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CommentPinModal
          page={page}
          pinPosition={pinPos}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
