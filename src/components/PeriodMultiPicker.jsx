/**
 * PeriodMultiPicker — year tabs + month grid for selecting one or more YYYY-MM periods.
 *
 * Props:
 *   value    {string[]}  — currently selected periods, e.g. ['2026-01', '2026-03']
 *   onChange {fn}        — called with new string[] on every toggle
 */

import { useState } from 'react'
import { X } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildYears() {
  const cur = new Date().getFullYear()
  return [cur - 3, cur - 2, cur - 1, cur, cur + 1, cur + 2]
}

export default function PeriodMultiPicker({ value = [], onChange }) {
  const years = buildYears()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  function toggle(period) {
    if (value.includes(period)) {
      onChange(value.filter(p => p !== period))
    } else {
      onChange([...value, period].sort())
    }
  }

  return (
    <div>
      {/* Year row */}
      <div className="flex gap-1.5 mb-3">
        {years.map(y => (
          <button
            key={y}
            type="button"
            onClick={() => setSelectedYear(y)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              selectedYear === y
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {MONTHS.map((m, i) => {
          const period = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
          const isSelected = value.includes(period)
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggle(period)}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                isSelected
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(p => (
            <span
              key={p}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded-full"
            >
              {p}
              <button
                type="button"
                onClick={() => onChange(value.filter(x => x !== p))}
                className="text-teal-400 hover:text-teal-700 leading-none"
              >
                <X size={10}/>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
