import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Guard: don't throw at module load time — let React mount and show the error ──
// Missing env vars = deployment config problem; AppContext will surface a banner.
export const SUPABASE_CONFIGURED = !!(supabaseUrl && supabaseAnon)

// Provide a no-op stub if vars are missing so imports don't crash at module level.
// The stub returns empty data for every query so the app renders (empty) without exploding.
const noopClient = {
  from: () => ({
    select:  () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    insert:  () => Promise.resolve({ data: [], error: null }),
    update:  () => ({ eq: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }) }),
    delete:  () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    eq:      function(){ return this },
    order:   function(){ return this },
    limit:   function(){ return this },
    single:  () => Promise.resolve({ data: null, error: null }),
  }),
  storage: {
    from: () => ({
      upload:       () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
      remove:       () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: null } }),
    }),
  },
  channel: () => ({ on: () => ({ subscribe: () => {} }) }),
  removeChannel: () => {},
}

export const supabase = SUPABASE_CONFIGURED
  ? createClient(supabaseUrl, supabaseAnon, {
      auth: {
        // No auth yet — wire up in a later step
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : noopClient

// ─────────────────────────────────────────────────────────────────────────────
// Typed table helpers — thin wrappers that enforce soft-delete filtering
// and org_id scoping. All dashboard queries go through these, never
// raw `supabase.from('table_name')` in component code.
// ─────────────────────────────────────────────────────────────────────────────

// org_id is a live-binding export — set by AppContext after loading org_settings.
// All files that import { ORG_ID } will read the current value at call time
// because ES module named exports are live bindings.
export let ORG_ID = ''

/**
 * Called once by AppContext after the first org_settings row is fetched.
 * Updates the live binding so every subsequent query uses the real org_id.
 */
export function setOrgId(id) {
  ORG_ID = id
}

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

// ORG_ID is already exported as a live binding above — no re-export needed
