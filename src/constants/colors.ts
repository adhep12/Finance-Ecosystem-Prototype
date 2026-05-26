// ─── MULTI-TENANT COLOR GUIDE ──────────────────────────────────
// To change org brand colors for a different tenant:
//   1. Update ORG_COLORS.primary and ORG_COLORS.accent only
//   2. DATA_COLORS, TEAM_COLORS, and STATUS_COLORS never change
//   3. All charts will remain visually consistent automatically
//
// Org colors come from the `org_settings` table (Supabase):
//   primary_color, primary_light, accent_color
// At app init, AppContext reads these values and:
//   a) Sets CSS variables: --color-primary, --color-primary-light, --color-accent
//   b) Sets orgConfig.primaryColor / accentColor in React context
// ORG_COLORS below are the defaults; the live values come from the DB.
// TODO: patch ORG_COLORS at runtime from orgConfig for full dynamic support.

// ─── ORG BRAND COLORS ──────────────────────────────────────────
// Used for: nav active state, buttons, links, tab indicators,
// active toggles, focus rings, badges, progress indicators.
// NEVER used for chart data series or team/category identifiers.

export const ORG_COLORS = {
  primary:      '#00B3E5', // main brand color
  primaryLight: '#E6F7FD', // 10% tint for backgrounds
  primaryDark:  '#0090B8', // hover/pressed state
  accent:       '#FF7A59', // secondary actions, CTAs
  accentLight:  '#FFF0EC', // accent background tint
}

// ─── DATA PALETTE ──────────────────────────────────────────────
// Used for: all chart series, team colors, category colors,
// any visual encoding of data dimensions.
// Fixed order — never changes regardless of org brand colors.
// Assign by index: teams[0], teams[1], etc. always the same color.

export const DATA_COLORS = [
  '#4E79A7', // [0] steel blue
  '#F28E2B', // [1] warm orange
  '#59A14F', // [2] muted green
  '#B07AA1', // [3] soft purple
  '#76B7B2', // [4] teal
  '#E15759', // [5] muted red
  '#9C755F', // [6] warm brown
  '#BAB0AC', // [7] warm gray
]

// ─── TEAM COLOR MAP ────────────────────────────────────────────
// Teams are always assigned the same color across every chart,
// every page, every dashboard. Add teams alphabetically to keep
// assignment stable as new teams are added.

export const TEAM_COLORS: Record<string, string> = {
  'Content':    DATA_COLORS[0], // steel blue
  'Finance':    DATA_COLORS[1], // warm orange
  'Leadership': DATA_COLORS[2], // muted green
  'Marketing':  DATA_COLORS[3], // soft purple
  'Operations': DATA_COLORS[4], // teal
  'People':     DATA_COLORS[5], // muted red
  'Production': DATA_COLORS[6], // warm brown
  'Technology': DATA_COLORS[7], // warm gray
}

// Helper: get team color by name, fallback to first data color
export const getTeamColor = (teamName: string): string =>
  TEAM_COLORS[teamName] ?? DATA_COLORS[0]

// ─── SEMANTIC / STATUS COLORS ──────────────────────────────────
// Used for: positive/negative indicators, warnings, status badges.
// These are fixed regardless of org.

export const STATUS_COLORS = {
  positive:      '#3D9970', // green — under budget, positive variance
  positiveLight: '#EBF7F2',
  negative:      '#C0392B', // red — over budget, negative variance
  negativeLight: '#FAEAE8',
  warning:       '#E8A838', // amber — approaching threshold
  warningLight:  '#FDF6E3',
  neutral:       '#6B7384', // gray — neutral/secondary info
  neutralLight:  '#F0F2F5',
}

// ─── CHART DEFAULTS ────────────────────────────────────────────
// Shared config for all Recharts instances

export const CHART_DEFAULTS = {
  gridColor:        'rgba(0,0,0,0.06)',
  tickColor:        '#9CA3AF',
  tooltipBackground: '#1F2937',
  tooltipTitle:     '#F9FAFB',
  tooltipBody:      '#D1D5DB',
}
