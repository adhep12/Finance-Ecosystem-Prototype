import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { TeamProvider }        from './context/TeamContext'
import { useTeam }             from './context/TeamContext'
import { ChartPreferencesProvider } from './context/ChartPreferencesContext'
import BriefingPage      from './pages/BriefingPage'
import BreakdownPage     from './pages/BreakdownPage'
import CommentsPage      from './pages/CommentsPage'
import TransactionsPage  from './pages/TransactionsPage'
import ELTDashboard      from './pages/ELTDashboard'
import MasterDashboard   from './pages/MasterDashboard'
import Header            from './components/Header'
import Sidebar           from './components/Sidebar'

// ─────────────────────────────────────────────────────────────────────────────
// Team-not-found error screen
// ─────────────────────────────────────────────────────────────────────────────

function TeamNotFound() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F5F2EC', flexDirection: 'column',
      gap: 16, padding: 40,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #E5E2DC',
        padding: 48, maxWidth: 420, textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <h2 style={{ color: '#1A1A1A', marginBottom: 8, fontWeight: 600 }}>Team not found</h2>
        <p style={{ color: '#6B7280', marginBottom: 24, lineHeight: 1.6 }}>
          The team ID in this URL doesn't match any team in the database.
          Check that the URL is correct or navigate back to the Executive dashboard.
        </p>
        <a
          href="/elt"
          style={{
            display: 'inline-block', background: 'var(--color-primary)', color: '#fff',
            borderRadius: 8, padding: '10px 24px', fontWeight: 600,
            fontSize: 15, textDecoration: 'none',
          }}
        >
          ← Back to Executive Dashboard
        </a>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamShellInner — rendered after TeamProvider; gates on loading / not-found
// ─────────────────────────────────────────────────────────────────────────────

function TeamShellInner() {
  const { isLoading: teamLoading, teamNotFound } = useTeam()
  const { isLoading: dataLoading }               = useApp()

  if (teamNotFound) return <TeamNotFound />

  // Gate on BOTH:
  //   teamLoading — team row + dept codes not yet fetched
  //   dataLoading — AppContext still paginating org actuals (13 × 1000-row pages)
  // Without this gate, pages render with teamActuals=[] and show empty dashboards.
  const loading   = teamLoading || dataLoading
  const loadLabel = dataLoading && !teamLoading ? 'Loading transactions…' : 'Loading team…'

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F5F2EC', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid #E5E2DC', borderTopColor: '#0EA5A0',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <span style={{ color: '#6B7280', fontSize: 14 }}>{loadLabel}</span>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
      <Header />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="briefing"     element={<BriefingPage />} />
          <Route path="breakdown"    element={<BreakdownPage />} />
          <Route path="comments"     element={<CommentsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          {/* Default: land on briefing */}
          <Route path="*"            element={<Navigate to="briefing" replace />} />
        </Routes>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamShell — provides TeamContext then delegates to TeamShellInner
// ─────────────────────────────────────────────────────────────────────────────

function TeamShell() {
  return (
    <TeamProvider>
      <TeamShellInner />
    </TeamProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AppRoutes — Sidebar lives here so it never unmounts on route change.
// Content area shifts with sidebar width via CSS custom property --sidebar-w.
// ─────────────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <div className="flex min-h-screen">
      {/* Fixed-position sidebar (sets --sidebar-w CSS variable) */}
      <Sidebar />

      {/* Page content — margin-left tracks sidebar width with matching transition */}
      <div
        className="flex-1 min-w-0"
        style={{
          marginLeft: 'var(--sidebar-w, 220px)',
          transition: 'margin-left 200ms ease',
        }}
      >
        <Routes>
          <Route path="/elt"            element={<ELTDashboard />} />
          <Route path="/master"         element={<MasterDashboard />} />
          {/* All team dashboards: /team/:teamId/briefing|breakdown|... */}
          <Route path="/team/:teamId/*" element={<TeamShell />} />
          {/* Root and legacy flat routes → executive dashboard */}
          <Route path="/"               element={<Navigate to="/elt" replace />} />
          <Route path="*"               element={<Navigate to="/elt" replace />} />
        </Routes>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <ChartPreferencesProvider>
          <AppRoutes />
        </ChartPreferencesProvider>
      </AppProvider>
    </BrowserRouter>
  )
}
