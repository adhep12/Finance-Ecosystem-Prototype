import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, ORG_ID } from '../lib/supabase'

// ─── Canonical chart keys ─────────────────────────────────────────────────────
// These keys are stored in org_chart_preferences and shared across admin + exec
// so changing the type on one page immediately reflects on the other.

const DEFAULTS = {
  monthly_giving_vs_budget: 'line',  // exec giving-vs-budget AND admin (after rename)
  new_supporters_by_month:  'line',  // exec new-patrons-yoy
  monthly_supporter_base:   'bar',   // exec patron-base
  team_spend_comparison:    'bar',   // admin TeamSpendCard
}

// Allowed chart types per key — single-type keys never get a switcher
export const ALLOWED_TYPES = {
  monthly_giving_vs_budget: ['line', 'area'],
  new_supporters_by_month:  ['line', 'area'],
  monthly_supporter_base:   ['bar',  'line'],
  team_spend_comparison:    ['bar',  'line'],
  // Fixed-type charts — no switcher
  net_position_by_month:    ['bar'],
  cash_position:            ['line'],
  cash_position_above_floor:['bar'],
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ChartPreferencesContext = createContext(null)

export function ChartPreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULTS)

  // Load org prefs from Supabase on mount
  useEffect(() => {
    if (!ORG_ID) return
    supabase
      .from('org_chart_preferences')
      .select('chart_key, chart_type')
      .eq('org_id', ORG_ID)
      .then(({ data }) => {
        if (data?.length) {
          const map = {}
          data.forEach(r => { map[r.chart_key] = r.chart_type })
          setPrefs(prev => ({ ...prev, ...map }))
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setChartType = useCallback(async (chartKey, chartType) => {
    // Optimistic update
    setPrefs(prev => ({ ...prev, [chartKey]: chartType }))
    if (!ORG_ID) return
    // Persist to Supabase
    supabase.from('org_chart_preferences').upsert(
      { org_id: ORG_ID, chart_key: chartKey, chart_type: chartType, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,chart_key' }
    )
  }, [])

  const getChartType = useCallback((chartKey) => {
    return prefs[chartKey] ?? DEFAULTS[chartKey] ?? 'line'
  }, [prefs])

  return (
    <ChartPreferencesContext.Provider value={{ getChartType, setChartType }}>
      {children}
    </ChartPreferencesContext.Provider>
  )
}

export function useChartPreferences() {
  const ctx = useContext(ChartPreferencesContext)
  if (!ctx) throw new Error('useChartPreferences must be used inside ChartPreferencesProvider')
  return ctx
}
