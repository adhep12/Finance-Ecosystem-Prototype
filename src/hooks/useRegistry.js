import { useState, useEffect, useCallback } from 'react'
import { supabase, db, dbInsert, dbSoftDelete, dbUpdate, ORG_ID } from '../lib/supabase'

/**
 * Generic hook for any registry table (teams, departments, chart_of_accounts, grants).
 * Handles fetch, add, inline edit, soft delete, restore, and change history.
 */
export function useRegistry(tableName, orderBy = 'created_at') {
  const [rows,        setRows]        = useState([])
  const [deletedRows, setDeletedRows] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [showDeleted, setShowDeleted] = useState(false)

  const fetchActive = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from(tableName)
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('deleted', false)
      .order(orderBy, { ascending: true })
    if (err) setError(err.message)
    else setRows(data || [])
    setLoading(false)
  }, [tableName, orderBy])

  const fetchDeleted = useCallback(async () => {
    const { data } = await supabase
      .from(tableName)
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('deleted', true)
      .order('updated_at', { ascending: false })
    setDeletedRows(data || [])
  }, [tableName])

  useEffect(() => {
    fetchActive()
    fetchDeleted()
  }, [fetchActive, fetchDeleted])

  async function addRow(fields) {
    const { data, error: err } = await dbInsert(tableName, { ...fields, active: true })
    if (!err) await fetchActive()
    return { data, error: err }
  }

  async function updateRow(id, changes, original) {
    const { data, error: err } = await dbUpdate(tableName, id, changes, original)
    if (!err) await fetchActive()
    return { data, error: err }
  }

  async function softDelete(id) {
    const { error: err } = await dbSoftDelete(tableName, id)
    if (!err) { await fetchActive(); await fetchDeleted() }
    return { error: err }
  }

  async function restore(id) {
    const { error: err } = await supabase
      .from(tableName)
      .update({ deleted: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', ORG_ID)
    if (!err) { await fetchActive(); await fetchDeleted() }
    return { error: err }
  }

  async function getHistory(recordId) {
    const { data } = await supabase
      .from('edit_log')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('edited_at', { ascending: false })
      .limit(50)
    return data || []
  }

  return {
    rows, deletedRows, loading, error,
    showDeleted, setShowDeleted,
    addRow, updateRow, softDelete, restore, getHistory,
    refresh: fetchActive,
  }
}

/**
 * Hook for org_settings — single row fetch + update.
 */
export function useOrgSettings() {
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [saving,   setSaving]   = useState(false)

  async function fetch() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('org_settings')
      .select('*')
      .limit(1)
      .single()
    if (err && err.code !== 'PGRST116') setError(err.message)
    else setSettings(data)
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  async function save(changes) {
    if (!settings?.id) return { error: 'No settings row found' }
    setSaving(true)
    const { data, error: err } = await supabase
      .from('org_settings')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', settings.id)
      .select()
      .single()
    if (!err) setSettings(data)
    setSaving(false)
    return { data, error: err }
  }

  return { settings, loading, error, saving, save, refresh: fetch }
}
