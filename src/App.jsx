import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import BriefingPage    from './pages/BriefingPage'
import BreakdownPage   from './pages/BreakdownPage'
import CommentsPage    from './pages/CommentsPage'
import ImportPage      from './pages/ImportPage'
import Header          from './components/Header'

function AppShell() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-primary-bg)' }}>
      <Header />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"            element={<Navigate to="/briefing" replace />} />
          <Route path="/briefing"    element={<BriefingPage />} />
          <Route path="/breakdown"   element={<BreakdownPage />} />
          <Route path="/comments"    element={<CommentsPage />} />
          <Route path="/import"      element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </BrowserRouter>
  )
}
