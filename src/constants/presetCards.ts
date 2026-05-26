// ─── OPTIONAL PRESET CARDS FOR THE OVERVIEW DASHBOARD ───────────────────────
// Cards in this list can be added per-org via the "Edit Layout" button.
// The default cards (Tier 1/2/3, Supporter Health core) are NOT here —
// they always display and cannot be removed.
//
// DB storage: org_dashboard_layout (section, card_key, display_order)
// Sections map:
//   'financial_health'  → Financial Health section
//   'supporter_health'  → Supporter Health section
//   'charts'            → Charts section

export type PresetCardSection = 'financial_health' | 'supporter_health' | 'charts'

export type PresetCardDef = {
  key: string
  section: PresetCardSection
  label: string
  description: string
}

export const PRESET_CARDS: PresetCardDef[] = [
  // ── Financial Health ──────────────────────────────────────────────────────
  {
    key: 'budget_burn_rate',
    section: 'financial_health',
    label: 'Budget Burn Rate',
    description: 'Monthly spend rate vs remaining budget',
  },
  {
    key: 'prior_year_net',
    section: 'financial_health',
    label: 'Prior Year Net Position',
    description: 'Net position same period last year',
  },
  {
    key: 'expense_ratio',
    section: 'financial_health',
    label: 'Expense Ratio',
    description: 'Total expenses as % of total income',
  },
  {
    key: 'largest_variance',
    section: 'financial_health',
    label: 'Largest Budget Variance',
    description: 'Single category furthest over budget',
  },

  // ── Supporter Health ─────────────────────────────────────────────────────
  {
    key: 'recurring_vs_onetime',
    section: 'supporter_health',
    label: 'Recurring vs One-Time Split',
    description: '% of total giving from recurring donors',
  },
  {
    key: 'avg_gift_trend',
    section: 'supporter_health',
    label: 'Avg Gift 6-Month Trend',
    description: 'Sparkline of average gift size over 6 months',
  },
  {
    key: 'new_supporter_trend',
    section: 'supporter_health',
    label: 'New Supporter Trend',
    description: 'New supporters vs same period last year',
  },

  // ── Charts ───────────────────────────────────────────────────────────────
  {
    key: 'giving_trend_chart',
    section: 'charts',
    label: 'Giving Trend Chart',
    description: 'Monthly giving over the fiscal year',
  },
  {
    key: 'expense_by_category',
    section: 'charts',
    label: 'Expense by Category',
    description: 'Breakdown of expenses by category YTD',
  },
  {
    key: 'yoy_comparison',
    section: 'charts',
    label: 'Year-over-Year Comparison',
    description: 'Current vs prior year by month',
  },
  {
    key: 'team_variance_chart',
    section: 'charts',
    label: 'Team Variance Chart',
    description: 'Budget variance by team as a bar chart',
  },
]

// Helper: get preset defs for a specific section
export const getPresetsForSection = (section: PresetCardSection): PresetCardDef[] =>
  PRESET_CARDS.filter(c => c.section === section)
