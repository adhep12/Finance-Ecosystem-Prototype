import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // No auth yet — wire up in a later step
    persistSession: false,
    autoRefreshToken: false,
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Typed table helpers — thin wrappers that enforce soft-delete filtering
// and org_id scoping. All dashboard queries go through these, never
// raw `supabase.from('table_name')` in component code.
// ─────────────────────────────────────────────────────────────────────────────

// Placeholder org_id until multi-tenancy is wired in
const ORG_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Returns a query builder pre-scoped to this org and excluding soft-deleted rows.
 * Usage: db('transactions').select('*').eq('fiscal_period', '2025-10')
 */
export function db(table) {
  return supabase
    .from(table)
    .select()
    .eq('org_id', ORG_ID)
    .eq('deleted', false)
}

/**
 * Insert one or more rows into a table, injecting org_id automatically.
 */
export async function dbInsert(table, rows) {
  const data = Array.isArray(rows) ? rows : [rows]
  const withOrg = data.map(r => ({ ...r, org_id: ORG_ID }))
  return supabase.from(table).insert(withOrg).select()
}

/**
 * Soft-delete a record by id.
 */
export async function dbSoftDelete(table, id) {
  return supabase
    .from(table)
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', ORG_ID)
}

/**
 * Update a single record by id and write an edit_log entry for each changed field.
 * @param {string} table
 * @param {string} id
 * @param {object} changes  — { field: newValue }
 * @param {object} original — the original record (to capture old_value)
 */
export async function dbUpdate(table, id, changes, original = {}) {
  // Write the update
  const { data, error } = await supabase
    .from(table)
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', ORG_ID)
    .select()

  if (error) return { data, error }

  // Write one edit_log row per changed field
  const logRows = Object.entries(changes).map(([field, newValue]) => ({
    org_id:     ORG_ID,
    table_name: table,
    record_id:  id,
    field,
    old_value:  original[field] != null ? String(original[field]) : null,
    new_value:  newValue        != null ? String(newValue)         : null,
    edited_by:  'system', // replace with auth user later
  }))

  await supabase.from('edit_log').insert(logRows)

  return { data, error }
}

export { ORG_ID }
