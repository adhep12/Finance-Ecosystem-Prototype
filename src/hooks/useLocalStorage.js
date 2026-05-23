import { useState } from 'react'

/**
 * useState backed by localStorage. Reads initial value from storage,
 * and writes every update back so state survives navigation & page reloads.
 *
 * @param {string} key          localStorage key
 * @param {*}      defaultValue used only when the key is absent
 */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  function set(newValOrFn) {
    setValue(prev => {
      const next = typeof newValOrFn === 'function' ? newValOrFn(prev) : newValOrFn
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }

  return [value, set]
}
