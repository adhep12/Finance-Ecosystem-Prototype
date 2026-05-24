import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import BriefingPage      from './pages/BriefingPage'
import BreakdownPage     from './pages/BreakdownPage'
import CommentsPage      from './pages/CommentsPage'
import ImportPage        from './pages/ImportPage'
import TransactionsPage  from './pages/TransactionsPage'
import ELTDashboard      from './pages/ELTDashboard'
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
        <Route path="/elt" element={<ELTDashboard />} />
        <Route path="/*"   element={<AppShell />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}
