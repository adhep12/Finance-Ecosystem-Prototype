/**
 * Sidebar.jsx — Fixed left navigation sidebar
 *
 * States:
 *   Expanded:  220px — icon + label
 *   Collapsed:  56px — icon only + hover tooltips (300ms delay)
 *
 * localStorage keys:
 *   sidebar_state        — 'expanded' | 'collapsed'
 *   teams_nav_expanded   — true | false (JSON)
 *   last_team_id         — UUID of last visited team
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart2, Users, LayoutDashboard, Settings,
  ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react'
import { supabase, ORG_ID } from '../lib/supabase'
import { useApp } from '../context/AppContext'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const W_EXPANDED  = 220
const W_COLLAPSED = 56

const FALLBACK_TEAMS = [
  { id: '693392a0-1978-4b52-9aa6-1d7c0675a95d', team_name: 'Content' },
  { id: '091d41b8-3e32-40b3-a187-abbe9c147a53', team_name: 'Finance' },
  { id: '15caa977-a647-472e-a00d-4c0bdce2adaf', team_name: 'Leadership' },
  { id: '991673f0-0090-4a81-bd2d-2cc6785150d8', team_name: 'Marketing' },
  { id: 'f6c8185a-378b-406b-8e63-c39141cc7785', team_name: 'Operations' },
  { id: '33d5d503-4358-41da-a3ab-ffe246ac408e', team_name: 'People' },
  { id: '90dc3c67-c0a4-4e98-bbc7-e8a6f2122522', team_name: 'Production' },
  { id: 'f6a66b5d-346f-4834-9f38-74cc7f6495cf', team_name: 'Technology' },
]

const TEAM_PALETTE = ['#0EA5A0','#6366F1','#F97316','#10B981','#8B5CF6','#EC4899','#C05A2F','#E8A838']

function teamColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return TEAM_PALETTE[h % TEAM_PALETTE.length]
}

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// Sync CSS variable so margin-left on content wrapper updates immediately
function setSidebarCSSVar(expanded, narrow = false) {
  const w = (narrow || !expanded) ? W_COLLAPSED : W_EXPANDED
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  // Read initial expanded state synchronously — prevents margin-left flash
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebar_state')
    const isExpanded = saved !== 'collapsed'
    // Set CSS var immediately so content wrapper already has the right margin
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1024
    setSidebarCSSVar(isExpanded, narrow)
    return isExpanded
  })

  const [teamsOpen, setTeamsOpen] = useState(() => readLS('teams_nav_expanded', false))
  const [teams,     setTeams]     = useState(FALLBACK_TEAMS)

  // Tooltip: { id: string, label: string, top: number } | null
  const [tooltip, setTooltip]     = useState(null)
  const tooltipTimerRef           = useRef(null)

  const navigate = useNavigate()
  const location = useLocation()
  const { orgConfig } = useApp()

  // ── Active state from URL ─────────────────────────────────────────────────
  const pathname     = location.pathname
  const search       = location.search
  const isExecutive  = pathname.startsWith('/elt')
  const isTeams      = pathname.startsWith('/team')
  const isSetup      = pathname.startsWith('/master') && search.includes('tab=setup')
  const isAdmin      = pathname.startsWith('/master') && !search.includes('tab=setup')
  const activeTeamId = pathname.match(/\/team\/([^/]+)/)?.[1] || null

  // ── Fetch teams ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('teams').select('id, team_name').eq('org_id', ORG_ID).order('team_name')
      .then(({ data }) => { if (data?.length) setTeams(data) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-expand teams sub-list when visiting a team page ─────────────────
  useEffect(() => {
    if (isTeams && !teamsOpen) {
      setTeamsOpen(true)
      writeLS('teams_nav_expanded', true)
    }
  }, [isTeams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track last visited team ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTeamId) writeLS('last_team_id', activeTeamId)
  }, [activeTeamId])

  // ── Responsive: sync CSS variable on window resize ───────────────────────
  useEffect(() => {
    function onResize() {
      setSidebarCSSVar(expanded, window.innerWidth < 1024)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [expanded])

  // ── Toggle sidebar ────────────────────────────────────────────────────────
  function toggle() {
    const next = !expanded
    setExpanded(next)
    localStorage.setItem('sidebar_state', next ? 'expanded' : 'collapsed')
    setSidebarCSSVar(next, window.innerWidth < 1024)
  }

  // ── Tooltip helpers (collapsed mode) ─────────────────────────────────────
  function showTooltip(id, label, refEl) {
    if (expanded) return
    clearTimeout(tooltipTimerRef.current)
    tooltipTimerRef.current = setTimeout(() => {
      const rect = refEl.getBoundingClientRect()
      setTooltip({ id, label, top: rect.top + rect.height / 2 })
    }, 300)
  }
  function hideTooltip() {
    clearTimeout(tooltipTimerRef.current)
    setTooltip(null)
  }

  // ── Teams collapsed click — navigate to last or first team ───────────────
  function handleTeamsCollapsedClick() {
    const lastId = readLS('last_team_id', null)
    const target = lastId && teams.find(t => t.id === lastId)
      ? lastId
      : teams[0]?.id
    if (target) navigate(`/team/${target}/briefing`)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function itemCls(active) {
    return [
      'w-full flex items-center rounded-lg transition-colors duration-150 select-none',
      expanded ? 'gap-3 px-3 py-2' : 'justify-center py-2.5 px-0',
      active
        ? 'bg-teal-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    ].join(' ')
  }

  const visualW = window.innerWidth < 1024 ? W_COLLAPSED : (expanded ? W_EXPANDED : W_COLLAPSED)

  return (
    <>
      {/* ── Fixed sidebar ─────────────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 h-screen bg-white border-r border-gray-100 flex flex-col z-50 overflow-hidden"
        style={{
          width: visualW,
          transition: 'width 200ms ease',
          boxShadow: '1px 0 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* ── Org identity ──────────────────────────────────────────────── */}
        <div className={`flex items-center gap-3 border-b border-gray-100 flex-shrink-0
          ${expanded ? 'px-4 py-4' : 'justify-center px-0 py-4'}`}>
          {/* Avatar circle */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: orgConfig.primaryColor || '#D4896A' }}
          >
            {orgConfig.logoInitial || '?'}
          </div>
          {/* Org name — expanded only */}
          {expanded && (
            <span className="text-sm font-semibold text-gray-800 truncate leading-tight">
              {orgConfig.name || 'Organization'}
            </span>
          )}
        </div>

        {/* ── Nav items ─────────────────────────────────────────────────── */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5
          ${expanded ? 'px-2' : 'px-1.5'}`}>

          {/* Executive */}
          <button
            ref={el => el}
            onClick={() => navigate('/elt')}
            onMouseEnter={e => showTooltip('executive', 'Executive', e.currentTarget)}
            onMouseLeave={hideTooltip}
            className={itemCls(isExecutive)}
          >
            <BarChart2 size={16} className="flex-shrink-0" />
            {expanded && <span className="text-sm font-medium flex-1 text-left truncate">Executive</span>}
          </button>

          {/* Teams */}
          <button
            onClick={() => {
              if (!expanded || window.innerWidth < 1024) {
                handleTeamsCollapsedClick()
              } else {
                const next = !teamsOpen
                setTeamsOpen(next)
                writeLS('teams_nav_expanded', next)
              }
            }}
            onMouseEnter={e => showTooltip('teams', 'Teams', e.currentTarget)}
            onMouseLeave={hideTooltip}
            className={itemCls(isTeams)}
          >
            <Users size={16} className="flex-shrink-0" />
            {expanded && (
              <>
                <span className="text-sm font-medium flex-1 text-left truncate">Teams</span>
                <ChevronDown
                  size={12}
                  className={`opacity-60 transition-transform duration-200 flex-shrink-0 ${teamsOpen ? 'rotate-180' : ''}`}
                />
              </>
            )}
          </button>

          {/* Team sub-items — expanded sidebar only */}
          {expanded && teamsOpen && (
            <div className="ml-4 pl-2.5 border-l-2 border-gray-100 space-y-0.5 py-0.5">
              {teams.map(t => {
                const isActive = t.id === activeTeamId
                const color    = teamColor(t.team_name)
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/team/${t.id}/briefing`)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium
                      transition-colors whitespace-nowrap
                      ${isActive
                        ? 'bg-teal-50 text-teal-700 font-semibold'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{t.team_name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Admin */}
          <button
            onClick={() => navigate('/master')}
            onMouseEnter={e => showTooltip('admin', 'Admin', e.currentTarget)}
            onMouseLeave={hideTooltip}
            className={itemCls(isAdmin)}
          >
            <LayoutDashboard size={16} className="flex-shrink-0" />
            {expanded && <span className="text-sm font-medium flex-1 text-left truncate">Admin</span>}
          </button>
        </nav>

        {/* ── Bottom: Settings + Toggle ──────────────────────────────────── */}
        <div className={`border-t border-gray-100 py-2 flex-shrink-0 space-y-0.5
          ${expanded ? 'px-2' : 'px-1.5'}`}>

          {/* Settings */}
          <button
            onClick={() => navigate('/master?tab=setup')}
            onMouseEnter={e => showTooltip('settings', 'Settings', e.currentTarget)}
            onMouseLeave={hideTooltip}
            className={itemCls(isSetup)}
          >
            <Settings size={16} className="flex-shrink-0" />
            {expanded && <span className="text-sm font-medium flex-1 text-left truncate">Settings</span>}
          </button>

          {/* Collapse toggle — desktop only (hidden < 1024px) */}
          <button
            onClick={toggle}
            className="hidden lg:flex w-full items-center justify-center py-2 rounded-lg text-gray-400
              hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded
              ? <><ChevronLeft size={14} /><span className="text-xs ml-1 font-medium">Collapse</span></>
              : <ChevronRight size={14} />
            }
          </button>
        </div>
      </div>

      {/* ── Tooltip (collapsed mode only) ─────────────────────────────────── */}
      {!expanded && tooltip && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{ left: W_COLLAPSED + 8, top: tooltip.top - 13 }}
        >
          <div className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">
            {tooltip.label}
          </div>
        </div>
      )}
    </>
  )
}
