import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, X, ChevronRight, Check, Trash2, Send } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate, useLocation, useParams } from 'react-router-dom'

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

function getStatus(c) { return c.status || (c.resolved ? 'resolved' : 'open') }

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Conversation Panel (slide-in from right) ─────────────────────────────────
function ConversationPanel({ pin, onClose, onOpenInComments }) {
  const { comments, updateCommentStatus, deleteComment, addReply } = useApp()
  const cfg     = PIN_TYPES.find(t => t.type === pin.type) || PIN_TYPES[0]
  const status  = getStatus(pin)
  const replies = comments.filter(r => r.parentId === pin.id)

  const [replyText,   setReplyText]   = useState('')
  const [replyAuthor, setReplyAuthor] = useState('')
  const [sending,     setSending]     = useState(false)
  const bottomRef = useRef(null)

  // Scroll to bottom when replies load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies.length])

  async function handleReply() {
    if (!replyText.trim() || !replyAuthor.trim() || sending) return
    setSending(true)
    await addReply(pin.id, {
      text:   replyText.trim(),
      author: replyAuthor.trim(),
      avatar: replyAuthor.trim().charAt(0).toUpperCase(),
      page:   pin.page,
      type:   'comment',
    })
    setReplyText('')
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative pointer-events-auto w-80 bg-white shadow-2xl flex flex-col"
        style={{ borderLeft: '1px solid rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ backgroundColor: cfg.color + '20', color: cfg.color }}
            >
              {cfg.label}
            </span>
            <div className="flex items-center gap-1">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                style={{ backgroundColor: STATUS_COLORS[status] + '20', color: STATUS_COLORS[status] }}
              >
                {status}
              </span>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 ml-1">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: cfg.color }}
            >
              {(pin.author || 'A')[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-800">{pin.author}</div>
              <div className="text-[10px] text-gray-400">{fmtDate(pin.timestamp)} · {fmtTime(pin.timestamp)}</div>
            </div>
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Original comment */}
          <div className="bg-gray-50 rounded-xl px-3 py-2.5">
            <p className="text-sm text-gray-800 leading-relaxed">{pin.text}</p>
          </div>

          {/* Replies */}
          {replies.map(r => (
            <div key={r.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 flex-shrink-0 mt-0.5">
                {(r.author || 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold text-gray-700">{r.author}</span>
                  <span className="text-[10px] text-gray-400">{fmtDate(r.timestamp)}</span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{r.text}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Reply input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex-shrink-0 space-y-2">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply… (⌘↵ to send)"
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          <div className="flex gap-2 items-center">
            <input
              value={replyAuthor}
              onChange={e => setReplyAuthor(e.target.value)}
              placeholder="Your name"
              className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || !replyAuthor.trim() || sending}
              className="p-2 bg-gray-900 text-white rounded-xl disabled:opacity-40 hover:bg-gray-700 transition-colors flex-shrink-0"
              title="Send reply"
            >
              <Send size={12} />
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-4 pb-4 flex items-center gap-2 border-t border-gray-100 pt-3 flex-shrink-0">
          {status !== 'resolved' && (
            <button
              onClick={() => updateCommentStatus(pin.id, 'resolved')}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
            >
              <Check size={11} /> Resolve
            </button>
          )}
          <button
            onClick={onOpenInComments}
            className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors flex-1 justify-end"
          >
            Open in Comments <ChevronRight size={11} />
          </button>
          <button
            onClick={() => { deleteComment(pin.id); onClose() }}
            className="text-gray-300 hover:text-red-400 p-1.5 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single positioned pin circle ────────────────────────────────────────────
function PinCircle({ pin, highlight, onOpen }) {
  const cfg     = PIN_TYPES.find(t => t.type === pin.type) || PIN_TYPES[0]
  const initials = (pin.author || 'A')[0].toUpperCase()
  const xPct    = pin.pinPosition?.xPct ?? 50
  const yPct    = pin.pinPosition?.yPct ?? 50
  const replyCount = pin._replyCount || 0

  return (
    <div
      className="absolute pointer-events-auto"
      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}
      onClick={() => onOpen(pin)}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg cursor-pointer border-2 border-white select-none transition-all hover:scale-110 ${highlight ? 'ring-4 ring-offset-1 animate-pulse scale-125' : ''}`}
        style={{ backgroundColor: cfg.color, ringColor: cfg.color }}
        title={`${pin.author}: ${pin.text}`}
      >
        {initials}
      </div>
      {replyCount > 0 && (
        <div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center border border-white"
        >
          {replyCount > 9 ? '9+' : replyCount}
        </div>
      )}
    </div>
  )
}

// ─── Comment post modal ───────────────────────────────────────────────────────
function CommentPinModal({ page, sourceDashboard, sourcePage, sourcePeriod, pinPosition, onClose }) {
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
      source_dashboard: sourceDashboard || null,
      source_page:      sourcePage      || null,
      source_period:    sourcePeriod    || null,
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
                selectedType === t.type ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
              style={selectedType === t.type ? { backgroundColor: t.color, borderColor: t.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: selectedType === t.type ? 'rgba(255,255,255,0.7)' : t.color }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Text */}
        <div className="px-4 pb-3">
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={cfg.placeholder}
            rows={3} autoFocus
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
        </div>

        {/* Author */}
        <div className="px-4 pb-4">
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
          {saved && <span className="text-xs text-green-600 font-medium flex-1">Posted!</span>}
          {!saved && <div className="flex-1" />}
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={handlePost} disabled={!text.trim() || !author.trim()}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-colors"
            style={{ backgroundColor: cfg.color }}>
            Post
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main FAB export ──────────────────────────────────────────────────────────
export default function CommentPinFAB({ page, sourceDashboard, sourcePage, sourcePeriod, rightClassName = 'right-6' }) {
  const { comments } = useApp()
  const navigate     = useNavigate()
  const location     = useLocation()
  const { teamId }   = useParams()

  const [showPins,    setShowPins]    = useState(true)
  const [placing,     setPlacing]     = useState(false)
  const [pinPos,      setPinPos]      = useState(null)
  const [showModal,   setShowModal]   = useState(false)
  const [openPin,     setOpenPin]     = useState(null)   // which pin's conversation is open
  const [highlightId, setHighlightId] = useState(location.state?.highlightCommentId || null)

  // Flash highlight for 3s then clear
  useEffect(() => {
    if (!highlightId) return
    setShowPins(true)
    const t = setTimeout(() => setHighlightId(null), 3000)
    return () => clearTimeout(t)
  }, [highlightId])

  // Top-level comments for this page (exclude replies)
  const pagePins = comments.filter(c => c.page === page && !c.parentId)

  // Attach reply count to each pin for the badge
  const replyCountMap = {}
  comments.forEach(c => { if (c.parentId) replyCountMap[c.parentId] = (replyCountMap[c.parentId] || 0) + 1 })

  // Only show unresolved pins on the page overlay
  const placedPins = pagePins.filter(c => c.pinPosition && getStatus(c) !== 'resolved')

  // Keep openPin in sync with live comment data (e.g. after status change)
  const liveOpenPin = openPin ? comments.find(c => c.id === openPin.id) || openPin : null

  // Placement: record click as document-relative %
  function handlePlacementClick(e) {
    if (!placing) return
    const scrollEl = document.documentElement
    const xPct = (e.clientX / window.innerWidth) * 100
    const yPct = ((e.clientY + scrollEl.scrollTop) / scrollEl.scrollHeight) * 100
    setPinPos({ xPct, yPct })
    setPlacing(false)
    setShowModal(true)
  }

  // Navigate to the correct Comments & Requests page and auto-open the comment
  function openInComments(pin) {
    const sd = pin.source_dashboard
    const state = { openCommentId: pin.id }

    if (sd === 'Executive') {
      navigate('/elt', { state: { ...state, switchToComments: true } })
    } else if (sd === 'Admin') {
      navigate('/master?tab=comments', { state })
    } else if (teamId) {
      navigate(`/team/${teamId}/comments`, { state })
    } else {
      // Fallback: determine from current path
      const path = location.pathname
      if (path.startsWith('/elt'))    navigate('/elt',    { state: { ...state, switchToComments: true } })
      else if (path.startsWith('/master')) navigate('/master?tab=comments', { state })
      else navigate(`${path.replace(/\/[^/]+$/, '')}/comments`, { state })
    }
    setOpenPin(null)
  }

  return (
    <>
      {/* Placement overlay */}
      {placing && (
        <div className="fixed inset-0 z-40" style={{ cursor: 'crosshair', backgroundColor: 'rgba(0,0,0,0.08)' }}
          onClick={handlePlacementClick}>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-xl flex items-center gap-3 pointer-events-none">
            <MessageSquare size={14} />
            Click anywhere to drop your comment pin
            <button className="pointer-events-auto text-gray-300 hover:text-white ml-2 transition-colors"
              onClick={e => { e.stopPropagation(); setPlacing(false); setPinPos(null) }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Positioned pin circles — absolute within page */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 28 }}>
        {showPins && placedPins.map(pin => (
          <PinCircle
            key={pin.id}
            pin={{ ...pin, _replyCount: replyCountMap[pin.id] || 0 }}
            highlight={highlightId === pin.id}
            onOpen={p => setOpenPin(p)}
          />
        ))}
      </div>

      {/* FAB buttons */}
      {!placing && (
        <div className={`fixed bottom-6 ${rightClassName} flex items-center gap-2 z-20`}>
          {pagePins.length > 0 && (
            <button onClick={() => setShowPins(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-full text-xs font-medium text-gray-600 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors">
              <MessageSquare size={13} className="text-gray-400" />
              {showPins ? 'Hide pins' : `Show ${pagePins.length} pin${pagePins.length !== 1 ? 's' : ''}`}
            </button>
          )}
          <div className="relative">
            <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: 'var(--color-primary)' }} />
            <button onClick={() => setPlacing(true)}
              className="relative flex items-center gap-2 px-5 py-3 text-white rounded-full text-sm font-semibold shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
              style={{ backgroundColor: 'var(--color-primary)' }}>
              <MessageSquare size={15} />
              Add a comment
            </button>
          </div>
        </div>
      )}

      {/* Conversation panel — opens on pin click */}
      {liveOpenPin && (
        <ConversationPanel
          pin={liveOpenPin}
          onClose={() => setOpenPin(null)}
          onOpenInComments={() => openInComments(liveOpenPin)}
        />
      )}

      {/* New comment modal */}
      {showModal && (
        <CommentPinModal
          page={page}
          sourceDashboard={sourceDashboard}
          sourcePage={sourcePage}
          sourcePeriod={sourcePeriod}
          pinPosition={pinPos}
          onClose={() => { setShowModal(false); setPinPos(null) }}
        />
      )}
    </>
  )
}
