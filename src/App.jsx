import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'

// ── Temporary error boundary to catch blank-screen render errors ─────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff1f0', minHeight: '100vh' }}>
          <h2 style={{ color: '#c0392b', marginBottom: 12 }}>⚠ React render error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#333', background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #fbb' }}>
            {this.state.error.toString()}
            {'\n\nStack:\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
import BriefingPage      from './pages/BriefingPage'
import BreakdownPage     from './pages/BreakdownPage'
import CommentsPage      from './pages/CommentsPage'
import ImportPage        from './pages/ImportPage'
import TransactionsPage  from './pages/TransactionsPage'
import ELTDashboard      from './pages/ELTDashboard'
import MasterDashboard    from './pages/MasterDashboard'
import Header            from './components/Header'
import FloatingNav       from './components/FloatingNav'

function AppShell() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
      <Header />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"            element={<Navigate to="/briefing" replace />} />
          <Route path="/briefing"      element={<BriefingPage />} />
          <Route path="/breakdown"     element={<BreakdownPage />} />
          <Route path="/comments"      element={<CommentsPage />} />
          <Route path="/transactions"  element={<TransactionsPage />} />
          <Route path="/import"        element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  )
}

// FloatingNav lives here — outside both AppShell and ELTDashboard — so it
// never unmounts on route change and its state (open/position) persists.
function AppRoutes() {
  return (
    <>
      <FloatingNav />
      <Routes>
        <Route path="/elt"    element={<ELTDashboard />} />
        <Route path="/master" element={<MasterDashboard />} />
        <Route path="/*"      element={<AppShell />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
