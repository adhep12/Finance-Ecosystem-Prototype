import React, { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { daysBetween, formatDateInput } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker Dropdown
// ─────────────────────────────────────────────────────────────────────────────

function DateRangePicker({ onClose }) {
  const { orgConfig, dateRange, applyPreset, applyCustomRange } = useApp()
  const [localStart, setLocalStart] = useState(dateRange.startDate)
  const [localEnd,   setLocalEnd]   = useState(dateRange.endDate)

  const fy  = orgConfig.fiscalYearStartMonth
  const fyY = orgConfig.fiscalYearStartYear
  const oy  = orgConfig.operatingYearStartMonth
  const oyY = orgConfig.operatingYearStartYear

  const fye = fy === 1 ? fyY : fyY + 1
  const fyeM = fy === 1 ? 12 : fy - 1
  const oye  = oy === 1 ? oyY : oyY + 1
  const oyeM = oy === 1 ? 12 : oy - 1

  function pad2(n) { return String(n).padStart(2,'0') }
  function monthName(m) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1] }

  const fyLabel  = `${monthName(fy)} ${fyY} → ${monthName(fyeM)} ${fye}`
  const fytLabel = `${monthName(fy)} ${fyY} → Today`
  const oyLabel  = `${monthName(oy)} ${oyY} → ${monthName(oyeM)} ${oye}`
  const oytLabel = `${monthName(oy)} ${oyY} → Today`

  const days = localStart && localEnd ? daysBetween(localStart, localEnd) : 0

  function handlePreset(p) {
    applyPreset(p)
    onClose()
  }

  function handleApply() {
    if (localStart && localEnd && localStart <= localEnd) {
      applyCustomRange(localStart, localEnd)
      onClose()
    }
  }

  const presetBtn = (id, label, sub) => (
    <button
      key={id}
      onClick={() => handlePreset(id)}
      className={`text-left px-3 py-2 rounded-lg border transition-all ${
        dateRange.preset === id
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-800 border-gray-200 hover:border-gray-400'
      }`}
    >
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-[10px] uppercase tracking-wide mt-0.5 opacity-60">{sub}</div>}
    </button>
  )

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Date Range</div>

      {/* Fiscal Year */}
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Fiscal Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {presetBtn('full-fiscal', 'Full fiscal year', fyLabel)}
        {presetBtn('fiscal-ytd', 'Fiscal YTD', fytLabel)}
      </div>

      {/* Operating Year */}
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Operating Year</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {presetBtn('full-operating', 'Full operating year', oyLabel)}
        {presetBtn('operating-ytd', 'Operating YTD', oytLabel)}
      </div>

      {/* Rolling */}
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Rolling</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {presetBtn('last-month', 'Last month', '')}
        {presetBtn('last-3',    'Last 3 months', '')}
        {presetBtn('last-6',    'Last 6 months', '')}
        {presetBtn('last-12',   'Last 12 months', '')}
      </div>

      {/* Custom */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">From</div>
          <input
            type="date"
            value={localStart}
            onChange={e => setLocalStart(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500"
          />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">To</div>
          <input
            type="date"
            value={localEnd}
            onChange={e => setLocalEnd(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{days > 0 ? `${days} days selected` : ''}</span>
        <button
          onClick={handleApply}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Header
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function presetLabel(preset) {
  const map = {
    'full-fiscal':    'Full fiscal year',
    'fiscal-ytd':     'Fiscal YTD',
    'full-operating': 'Full operating year',
    'operating-ytd':  'Operating YTD',
    'last-month':     'Last month',
    'last-3':         'Last 3 months',
    'last-6':         'Last 6 months',
    'last-12':        'Last 12 months',
    'custom':         'Custom range',
  }
  return map[preset] || 'Date range'
}

export default function Header() {
  const { orgConfig, availableScenarios, selectedScenario, setSelectedScenario, dateRange } = useApp()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const pickerRef = useRef(null)

  // Close picker on outside click
  useEffect(() => {
    function handle(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const tabs = [
    { to: '/briefing',  label: 'Briefing' },
    { to: '/breakdown', label: 'Breakdown' },
    { to: '/comments',  label: 'Comments & Requests' },
    { to: '/import',    label: 'Import' },
  ]

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-12 px-4 gap-2">

        {/* Org / team breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          <div
            className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: orgConfig.accentColor || 'var(--color-accent)' }}
          >
            {orgConfig.logoInitial}
          </div>
          <span className="text-sm font-semibold text-gray-800 truncate">{orgConfig.name}</span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm text-gray-500 truncate">{orgConfig.teamName}</span>
        </div>

        {/* Centered tabs */}
        <nav className="flex-1 flex justify-center">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-full px-1 py-1">
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `px-4 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Right: scenario selector + date range */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Scenario buttons */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1 py-1">
            {availableScenarios.map(s => (
              <button
                key={s}
                onClick={() => setSelectedScenario(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  selectedScenario === s
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Date range picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowDatePicker(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors"
            >
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-0.5">
                DATE RANGE
              </span>
              <span>{presetLabel(dateRange.preset)}</span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <DateRangePicker onClose={() => setShowDatePicker(false)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
