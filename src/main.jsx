import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ── Debug: catch any module-level or mount errors and show them on screen ────
window.addEventListener('error', e => {
  const div = document.getElementById('root')
  if (div && !div.innerHTML.trim()) {
    div.innerHTML = `<div style="padding:40px;font-family:monospace;background:#fff1f0;color:#c0392b">
      <h2>⚠ Uncaught JS error (before React mounted)</h2>
      <pre style="white-space:pre-wrap;margin-top:12px;color:#333;background:#fff;padding:16px;border-radius:8px;border:1px solid #fbb">${
        e.message + '\n\nFile: ' + e.filename + ':' + e.lineno + '\n\nStack:\n' + (e.error?.stack || '')
      }</pre>
    </div>`
  }
})

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (err) {
  document.getElementById('root').innerHTML = `<div style="padding:40px;font-family:monospace;background:#fff1f0;color:#c0392b">
    <h2>⚠ ReactDOM.createRoot error</h2>
    <pre style="white-space:pre-wrap;margin-top:12px;color:#333;background:#fff;padding:16px;border-radius:8px;border:1px solid #fbb">${
      err.toString() + '\n\nStack:\n' + err.stack
    }</pre>
  </div>`
}
