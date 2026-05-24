import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BarChart2, Users, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'executive', label: 'Executive', icon: BarChart2, path: '/elt' },
  { id: 'teams',     label: 'Teams',     icon: Users,     path: '/briefing' },
]

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}

// No currentPage prop needed — detected from the URL automatically
export default function FloatingNav() {
  // Both pieces of state are seeded from localStorage so they survive page navigation
  const [open,     setOpenState] = useState(() => readLS('fnav-open', true))
  const [yPct,     setYPct]      = useState(() => readLS('fnav-y', 50))
  const [dragging, setDragging]  = useState(false)
  const dragRef   = useRef({ startY: 0, startPct: 50 })
  const navigate  = useNavigate()
  const location  = useLocation()

  const currentPage = location.pathname.startsWith('/elt') ? 'executive' : 'teams'

  function setOpen(v) {
    setOpenState(v)
    localStorage.setItem('fnav-open', JSON.stringify(v))
  }

  // ── drag start (mouse or touch)
  function startDrag(e) {
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    dragRef.current = { startY: clientY, startPct: yPct }
    setDragging(true)
    e.preventDefault()
    e.stopPropagation()
  }

  // ── drag move / end
  useEffect(() => {
    if (!dragging) return
    function onMove(e) {
      const clientY = e.touches?.[0]?.clientY ?? e.clientY
      const deltaPct = ((clientY - dragRef.current.startY) / window.innerHeight) * 100
      setYPct(Math.max(8, Math.min(92, dragRef.current.startPct + deltaPct)))
    }
    function onUp() {
      setDragging(false)
      // Persist final position on drag-end only (not on every mousemove)
      setYPct(prev => { localStorage.setItem('fnav-y', JSON.stringify(prev)); return prev })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [dragging])

  const panelShadow = { boxShadow: '2px 0 16px -2px rgba(0,0,0,0.10)' }

  return (
    <div className="fixed left-0 z-50 select-none"
         style={{ top: `${yPct}%`, transform: 'translateY(-50%)' }}>
      {open ? (
        <div className="bg-white border border-gray-200 border-l-0 rounded-r-xl flex flex-col overflow-hidden"
             style={panelShadow}>

          {/* ── Drag handle ── */}
          <div
            onMouseDown={startDrag} onTouchStart={startDrag}
            className="flex items-center justify-center px-3 pt-2.5 pb-1.5"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            title="Drag to reposition">
            <GripVertical size={13} className="text-gray-300"/>
          </div>

          {/* ── Nav items ── */}
          <div className="px-2 pb-2 space-y-0.5">
            {NAV_ITEMS.map(item => {
              const active = item.id === currentPage
              return (
                <button key={item.id} onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                    ${active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
                  <item.icon size={12}/>
                  {item.label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0"/>}
                </button>
              )
            })}
          </div>

          {/* ── Collapse ── */}
          <button onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-0.5 py-1.5 border-t border-gray-100 text-[9px] font-medium text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={9}/> hide
          </button>
        </div>

      ) : (
        /* ── Collapsed tab ── */
        <div className="bg-white border border-gray-200 border-l-0 rounded-r-lg flex flex-col items-center overflow-hidden"
             style={{ boxShadow: '2px 0 10px -2px rgba(0,0,0,0.08)' }}>
          <div
            onMouseDown={startDrag} onTouchStart={startDrag}
            className="px-1.5 pt-2 pb-0.5 text-gray-300 hover:text-gray-400"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            title="Drag to reposition">
            <GripVertical size={11}/>
          </div>
          <button onClick={() => setOpen(true)}
            className="px-1.5 pb-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
            <ChevronRight size={13}/>
          </button>
        </div>
      )}
    </div>
  )
}
