import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'

// ─────────────────────────────────────────────────────────────────────────────
// TeamContext
// Fetches team info + dept codes for the :teamId URL param, then exposes
// teamActuals = all org actuals filtered to only that team's departments.
//
// Must be mounted inside a <Route path="/team/:teamId/*"> so useParams()
// always has teamId available.
// ─────────────────────────────────────────────────────────────────────────────

const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const { teamId } = useParams()
  const { actuals } = useApp()

  const [team,          setTeam]          = useState(null)
  const [teamDepts,     setTeamDepts]     = useState([])    // full dept rows
  const [teamDeptCodes, setTeamDeptCodes] = useState([])    // just codes for fast filter
  const [isLoading,     setIsLoading]     = useState(true)
  const [teamNotFound,  setTeamNotFound]  = useState(false)

  useEffect(() => {
    if (!teamId) {
      setTeamNotFound(true)
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function loadTeam() {
      setIsLoading(true)
      setTeamNotFound(false)

      try {
        // Fetch team row + its departments in parallel
        const [
          { data: teamRow,  error: teamErr  },
          { data: deptRows, error: deptErr  },
        ] = await Promise.all([
          supabase.from('teams').select('*').eq('id', teamId).single(),
          supabase.from('departments').select('id, code, name, team_id').eq('team_id', teamId),
        ])

        if (cancelled) return

        if (teamErr || !teamRow) {
          setTeamNotFound(true)
          setIsLoading(false)
          return
        }
        if (deptErr) throw deptErr

        const depts = deptRows || []
        setTeam(teamRow)
        setTeamDepts(depts)
        setTeamDeptCodes(depts.map(d => d.code || d.dept_code).filter(Boolean))
      } catch (err) {
        if (!cancelled) {
          console.error('[TeamContext] load error:', err)
          setTeamNotFound(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadTeam()
    return () => { cancelled = true }
  }, [teamId])

  // teamActuals — org-wide actuals filtered to only this team's dept codes
  const teamActuals = useMemo(() => {
    if (!teamDeptCodes.length) return []
    const codeSet = new Set(teamDeptCodes)
    return actuals.filter(t => codeSet.has(t.dept_code))
  }, [actuals, teamDeptCodes])

  const value = {
    teamId,
    team,
    teamDepts,        // full dept rows (id, code, name) for this team
    teamDeptCodes,    // just the code strings — used by DeptFilterBar
    teamActuals,      // actuals scoped to this team
    isLoading,
    teamNotFound,
  }

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used within TeamProvider')
  return ctx
}
