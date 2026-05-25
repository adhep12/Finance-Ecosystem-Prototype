import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart2, Users, LayoutDashboard,
  ChevronLeft, ChevronRight, ChevronDown, GripVertical,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Known teams with hardcoded IDs — used as immediate fallback while the DB
// fetch completes (or if the fetch fails).
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_TEAMS = [
  { id: '693392a0-1978-4b52-9aa6-1d7c0675a95d', name: 'Content' },
  { id: '091d41b8-3e32-40b3-a187-abbe9c147a53', name: 'Finance' },
  { id: '15caa977-a647-472e-a00d-4c0bdce2adaf', name: 'Leadership' },
  { id: '991673f0-0090-4a81-bd2d-2cc6785150d8', name: 'Marketing' },
  { id: 'f6c8185a-378b-406b-8e63-c39141cc7785', name: 'Operations' },
  { id: '33d5d503-4358-41da-a3ab-ffe246ac408e', name: 'People' },
  { id: '90dc3c67-c0a4-4e98-bbc7-e8a6f2122522', name: 'Production' },
  { id: 'f6a66b5d-346f-4834-9f38-74cc7f6495cf', name: 'Technology' },
]

// Generate a deterministic pastel color from a team name for the avatar badge
function teamColor(name) {
  const COLORS = ['#0EA5A0','#6366F1','#F97316','#10B981','#8B5CF6','#EC4899','#C05A2F','#E8A838']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return COLORS[h % COLORS.length]
}

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}

export default function FloatingNav() {
  const [open,           setOpenState]      = useState(() => readLS('fnav-open', true))
  const [yPct,           setYPct]           = useState(() => readLS('fnav-y', 50))
  const [dragging,       setDragging]       = useState(false)
  const [teamsExpanded,  setTeamsExpanded]  = useState(false)
  const [teams,          setTeams]          = useState(FALLBACK_TEAMS)

  const dragRef  = useRef({ startY: 0, startPct: 50 })
  const navigate = useNavigate()
  const location = useLocation()

  // ── Detect section + active team from URL ─────────────────────────────────
  const currentPage = location.pathname.startsWith('/elt')    ? 'executive'
    : location.pathname.startsWith('/master') ? 'finance'
    : 'teams'

  const activeTeamId = location.pathname.match(/\/team\/([^/]+)/)?.[1] || null

  // Auto-expand teams list when browsing a team page
  useEffect(() => {
    if (currentPage === 'teams') setTeamsExpanded(true)
  }, [currentPage])

  // ── Fetch teams from DB; fall back to FALLBACK_TEAMS on error ─────────────
  useEffect(() => {
    supabase.from('teams').select('id, name').order('name')
      .then(({ data }) => { if (data?.length) setTeams(data) })
      .catch(() => { /* keep FALLBACK_TEAMS */ })
  }, [])

  function setOpen(v) {
    setOpenState(v)
    localStorage.setItem('fnav-open', JSON.stringify(v))
  }

  // ── Drag handle ───────────────────────────────────────────────────────────
  function startDrag(e) {
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    dragRef.current = { startY: clientY, startPct: yPct }
    setDragging(true)
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => {
    if (!dragging) return
    function onMove(e) {
      const clientY = e.touches?.[0]?.clientY ?? e.clientY
      const deltaPct = ((clientY - dragRef.current.startY) / window.innerHeight) * 100
      setYPct(Math.max(8, Math.min(92, dragRef.current.startPct + deltaPct)))
    }
    function onUp() {
      setDragging(false)
      setYPct(prev => { localStorage.setItem('fnav-y', JSON.stringify(prev)); return prev })
    }
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchmove',  onMove, { passive: false })
    window.addEventListener('touchend',   onUp)
    return () => {
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend',   onUp)
    }
  }, [dragging])

  const panelShadow = { boxShadow: '2px 0 16px -2px rgba(0,0,0,0.10)' }

  // ── Render expanded nav ───────────────────────────────────────────────────
  return (
    <div className="fixed left-0 z-50 select-none"
         style={{ top: `${yPct}%`, transform: 'translateY(-50%)' }}>
      {open ? (
        <div className="bg-white border border-gray-200 border-l-0 rounded-r-xl flex flex-col overflow-hidden"
             style={panelShadow}>

          {/* Drag handle */}
          <div
            onMouseDown={startDrag} onTouchStart={startDrag}
            className="flex items-center justify-center px-3 pt-2.5 pb-1.5"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            title="Drag to reposition">
            <GripVertical size={13} className="text-gray-300" />
          </div>

          {/* Nav items */}
          <div className="px-2 pb-2 space-y-0.5">

            {/* Executive */}
            <button
              onClick={() => navigate('/elt')}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${currentPage === 'executive' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            >
              <BarChart2 size={12} />
              Executive
              {currentPage === 'executive' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0" />}
            </button>

            {/* Teams — toggle expand */}
            <button
              onClick={() => setTeamsExpanded(v => !v)}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${currentPage === 'teams' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            >
              <Users size={12} />
              Teams
              <span className="ml-auto">
                {teamsExpanded
                  ? <ChevronDown size={10} className={currentPage === 'teams' ? 'text-white/70' : 'text-gray-300'} />
                  : <ChevronRight size={10} className={currentPage === 'teams' ? 'text-white/70' : 'text-gray-300'} />
                }
              </span>
            </button>

            {/* Team sub-list */}
            {teamsExpanded && (
              <div className="ml-2 pl-2 border-l-2 border-gray-100 space-y-0.5 pb-0.5">
                {teams.map(t => {
                  const isActive = t.id === activeTeamId
                  const color    = teamColor(t.name)
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/team/${t.id}/briefing`)}
                      className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                        ${isActive
                          ? 'bg-gray-100 text-gray-900 font-semibold'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                    >
                      {/* Color badge */}
                      <span
                        className="w-4 h-4 rounded-sm flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {t.name.charAt(0)}
                      </span>
                      {t.name}
                      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Finance */}
            <button
              onClick={() => navigate('/master')}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                ${currentPage === 'finance' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            >
              <LayoutDashboard size={12} />
              Admin
              {currentPage === 'finance' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0" />}
            </button>

          </div>

          {/* Collapse */}
          <button onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-0.5 py-1.5 border-t border-gray-100 text-[9px] font-medium text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={9} /> hide
          </button>
        </div>

      ) : (
        /* Collapsed tab */
        <div className="bg-white border border-gray-200 border-l-0 rounded-r-lg flex flex-col items-center overflow-hidden"
             style={{ boxShadow: '2px 0 10px -2px rgba(0,0,0,0.08)' }}>
          <div
            onMouseDown={startDrag} onTouchStart={startDrag}
            className="px-1.5 pt-2 pb-0.5 text-gray-300 hover:text-gray-400"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            title="Drag to reposition">
            <GripVertical size={11} />
          </div>
          <button onClick={() => setOpen(true)}
            className="px-1.5 pb-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
