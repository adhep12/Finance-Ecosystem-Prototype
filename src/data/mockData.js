// ─────────────────────────────────────────────────────────────────────────────
// Org / department metadata — kept as static fallback.
// Real dept names are now derived from v_transactions_enriched at runtime.
// ─────────────────────────────────────────────────────────────────────────────

export const DEPT_NAMES = {}        // replaced at runtime from AppContext.deptNames
export const DEPT_TEAM_GROUPS = {}  // replaced at runtime when multi-team support is wired

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — cleared; all financial data now lives in Supabase.
// Run supabase/migrations/001_initial_schema.sql then import via the Import tab.
// ─────────────────────────────────────────────────────────────────────────────

export const mockActuals     = []
export const mockBudgetFlat  = []
export const mockComments    = []
