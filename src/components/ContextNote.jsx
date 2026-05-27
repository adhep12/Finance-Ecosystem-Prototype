/**
 * ContextNote — inline annotation that persists to localStorage.
 * Renders below any chart or KPI card. Shows a subtle amber note block
 * when content exists; a faint "Add context" ghost on hover when empty.
 *
 * Props:
 *   noteId   {string}  — unique key for this card/chart
 *   dark     {boolean} — true for dark-background cards (inverts color scheme)
 */

import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, MessageSquare } from 'lucide-react'

const STORAGE_KEY = 'exec-context-notes-v1'

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function persist(id, text) {
  const all = loadAll()
  if (text.trim()) all[id] = text.trim()
  else delete all[id]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export default function ContextNote({ noteId, dark = false, editMode = true }) {
  const [text, setText]       = useState(() => loadAll()[noteId] || '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [hovered, setHovered] = useState(false)
  const areaRef = useRef(null)

  useEffect(() => { if (editing) areaRef.current?.focus() }, [editing])

  function startEdit() { setDraft(text); setEditing(true) }

  function save() {
    persist(noteId, draft)
    setText(draft.trim())
    setEditing(false)
  }

  function remove() {
    persist(noteId, '')
    setText('')
    setEditing(false)
  }

  function cancel() { setEditing(false) }

  function onKey(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <div className="mt-2 px-1">
        <textarea
          ref={areaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Add context for this data… (e.g. explains why this looks unusual)"
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none text-gray-700 placeholder-gray-300"
          style={{lineHeight:'1.5'}}
        />
        <div className="flex items-center gap-3 mt-1.5">
          <button onClick={save} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium">
            <Check size={11}/> Save
          </button>
          <button onClick={cancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          {text && (
            <button onClick={remove} className="ml-auto text-xs text-red-400 hover:text-red-600">Remove note</button>
          )}
        </div>
      </div>
    )
  }

  if (text) {
    return (
      <div
        className="mt-2 px-1 group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg"
          style={{backgroundColor:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)'}}>
          <MessageSquare size={11} className="flex-shrink-0 mt-0.5 text-amber-500 opacity-70"/>
          <p className="text-xs text-gray-600 leading-relaxed flex-1 whitespace-pre-line">{text}</p>
          <button
            onClick={startEdit}
            className="flex-shrink-0 text-amber-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil size={11}/>
          </button>
        </div>
      </div>
    )
  }

  if (!editMode) return null

  return (
    <div className="mt-2 px-1">
      <button
        onClick={startEdit}
        className="flex items-center gap-1.5 text-[10px] text-gray-300 hover:text-gray-500 transition-colors py-0.5"
      >
        <MessageSquare size={10}/> Add context note
      </button>
    </div>
  )
}
