import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BarChart2, Users, ChevronLeft, ChevronRight } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'executive', label: 'Executive', icon: BarChart2, path: '/elt' },
  { id: 'teams',     label: 'Teams',     icon: Users,     path: '/briefing' },
]

export default function FloatingNav({ currentPage }) {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-center select-none">
      {open ? (
        <div className="bg-white border border-gray-200 border-l-0 rounded-r-xl shadow-lg flex flex-col overflow-hidden"
             style={{ boxShadow: '2px 0 16px -2px rgba(0,0,0,0.10)' }}>
          {/* Collapse button row */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-300">Navigate</span>
            <button onClick={() => setOpen(false)}
              className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <ChevronLeft size={12}/>
            </button>
          </div>
          {/* Nav items */}
          <div className="px-2 pb-3 space-y-0.5">
            {NAV_ITEMS.map(item => {
              const active = item.id === currentPage
              return (
                <button key={item.id} onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                    ${active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
                  <item.icon size={12}/>
                  {item.label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60"/>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        /* Collapsed: thin tab */
        <button onClick={() => setOpen(true)}
          className="bg-white border border-gray-200 border-l-0 rounded-r-lg shadow-md px-1.5 py-3 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          style={{ boxShadow: '2px 0 10px -2px rgba(0,0,0,0.08)' }}>
          <ChevronRight size={13}/>
        </button>
      )}
    </div>
  )
}
