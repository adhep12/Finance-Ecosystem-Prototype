import React, { useState } from 'react'
import { MessageSquare, Ban, X, ChevronRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

const PIN_TYPES = [
  { type: 'question',              label: 'Question',             color: '#0EA5A0', placeholder: 'What are you wondering about?' },
  { type: 'variance-explanation',  label: 'Variance Explanation', color: '#F97316', placeholder: 'Explain the variance...' },
  { type: 'reclassification',      label: 'Reclassify',           color: '#F59E0B', placeholder: 'Describe the reclassification needed...' },
  { type: 'financial-highlight',   label: 'Financial Highlight',  color: '#10B981', placeholder: 'Share a financial insight...' },
  { type: 'budget-request',        label: 'Budget Request',       color: '#8B5CF6', placeholder: 'Describe the budget request...' },
]

const TYPE_LABEL_MAP = {
  'question': 'question',
  'variance-explanation': 'variance explanation',
  'reclassification': 'reclassification',
  'financial-highlight': 'highlight',
  'budget-request': 'budget request',
}

function CommentPinModal({ page, onClose }) {
  const { addComment } = useApp()
  const [selectedType, setSelectedType] = useState('question')
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [saved, setSaved] = useState(false)

  const cfg = PIN_TYPES.find(t => t.type === selectedType) || PIN_TYPES[0]

  function handlePost() {
    if (!text.trim() || !author.trim()) return
    addComment({
      author,
      avatar: author.charAt(0).toUpperCase(),
      type: selectedType,
      text,
      page,
      category: null,
      anchor: null,
      status: 'open',
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div
        className="pointer-events-auto absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <div className="relative pointer-events-auto bg-white rounded-2xl shadow-2xl w-80 mr-6 mb-20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <div>
            <h3 className="font-semibold text-gray-900 capitalize">
              Add {TYPE_LABEL_MAP[selectedType]}
            </h3>
            <p className="text-[11px] text-teal-600 font-medium">Pinned at this spot</p>
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

        {/* Text area */}
        <div className="px-4 pb-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">
            {TYPE_LABEL_MAP[selectedType]}
          </label>
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
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">
            Your Name
          </label>
          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="—"
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
            style={{ backgroundColor: '#111827' }}
          >
            Post {TYPE_LABEL_MAP[selectedType]}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommentPinFAB({ page, rightClassName = 'right-6' }) {
  const { comments } = useApp()
  const navigate = useNavigate()
  const [showPins, setShowPins] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const pagePins = comments.filter(c => c.page === page)

  return (
    <>
      {/* FAB buttons */}
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
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-full text-sm font-semibold shadow-lg hover:bg-gray-800 transition-colors"
        >
          <MessageSquare size={14} />
          Drop a comment pin
        </button>
      </div>

      {/* Pin list — visible when showPins */}
      {showPins && pagePins.length > 0 && (
        <div className={`fixed bottom-20 ${rightClassName} z-20 flex flex-col gap-1.5 max-h-64 overflow-y-auto`}>
          {pagePins.slice(0, 5).map(pin => {
            const TYPE_COLORS = {
              'question': '#0EA5A0',
              'variance-explanation': '#F97316',
              'reclassification': '#F59E0B',
              'financial-highlight': '#10B981',
              'budget-request': '#8B5CF6',
              'comment': '#6B7280',
              'request': '#8B5CF6',
            }
            const color = TYPE_COLORS[pin.type] || '#6B7280'
            return (
              <button
                key={pin.id}
                onClick={() => navigate('/comments')}
                className="flex items-start gap-2 bg-white rounded-xl shadow-md border border-gray-100 px-3 py-2 text-left hover:bg-gray-50 transition-colors max-w-56"
              >
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 line-clamp-2 leading-snug">{pin.text}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{pin.author}</p>
                </div>
                <ChevronRight size={11} className="text-gray-300 mt-1 flex-shrink-0" />
              </button>
            )
          })}
          {pagePins.length > 5 && (
            <button
              onClick={() => navigate('/comments')}
              className="text-[11px] text-teal-600 font-medium px-3 hover:underline"
            >
              +{pagePins.length - 5} more → Comments
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CommentPinModal page={page} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
