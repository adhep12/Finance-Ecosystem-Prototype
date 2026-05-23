import React, { useState, useMemo } from 'react'
import {
  Plus, X, ChevronRight,
  Star, DollarSign, TrendingUp, TrendingDown, HelpCircle, RefreshCw,
  BarChart2, Users, Tag, Award,
  AlertTriangle, Flag, Activity as ActivityIcon, Clock,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useLocalStorage } from '../hooks/useLocalStorage'
import {
  filterActualsByRange,
  calcBudgetByCategory,
  aggregateBy,
  countBy,
  aggregateByMonth,
} from '../utils/dataProcessing'
import { formatCurrency, formatOverUnder } from '../utils/formatters'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function pad2(n) { return String(n).padStart(2, '0') }

const CARD_REGISTRY = [
  // ── Comments ──────────────────────────────────────────────────────────────
  { type: 'financial-highlights',  group: 'Comments',  label: 'Financial Highlights',     commentType: 'financial-highlight',  variant: 'full',  icon: Star       },
  { type: 'budget-requests',       group: 'Comments',  label: 'Budget Requests',           commentType: 'budget-request',       variant: 'full',  icon: DollarSign },
  { type: 'variance-explanations', group: 'Comments',  label: 'Variance Explanations',     commentType: 'variance-explanation', variant: 'full',  icon: TrendingUp },
  { type: 'open-questions',        group: 'Comments',  label: 'Open Questions',            commentType: 'question',             variant: 'mini',  icon: HelpCircle },
  { type: 'reclassifications',     group: 'Comments',  label: 'Reclassifications',         commentType: 'reclassification',     variant: 'mini',  icon: RefreshCw  },
  { type: 'budget-requests-total', group: 'Comments',  label: 'Budget Requests · $ Total', commentType: 'budget-request',       variant: 'total', icon: DollarSign },
  // ── Top Lists ─────────────────────────────────────────────────────────────
  { type: 'top-categories', group: 'Top Lists', label: 'Top categories', field: 'category', defaultN: 5,  icon: BarChart2      },
  { type: 'top-vendors',    group: 'Top Lists', label: 'Top vendors',    field: 'vendor',   defaultN: 10, icon: Users          },
  { type: 'top-accounts',   group: 'Top Lists', label: 'Top accounts',   field: 'account',  defaultN: 5,  icon: Tag            },
  { type: 'top-grants',     group: 'Top Lists', label: 'Top grants',     field: 'grant',    defaultN: 5,  icon: Award          },
  // ── Variance ──────────────────────────────────────────────────────────────
  { type: 'variance-over',    group: 'Variance',  label: 'Biggest Overrun',      icon: TrendingUp   },
  { type: 'variance-under',   group: 'Variance',  label: 'Biggest Underrun',     icon: TrendingDown },
  // ── Pacing ────────────────────────────────────────────────────────────────
  { type: 'pacing',           group: 'Pacing',    label: 'Annual Pacing',        icon: Clock        },
  // ── Outliers ──────────────────────────────────────────────────────────────
  { type: 'outliers-tx',      group: 'Outliers',  label: 'Largest Transaction',  icon: DollarSign   },
  { type: 'outliers-month',   group: 'Outliers',  label: 'Highest-Spend Month',  icon: BarChart2    },
  { type: 'outliers-vendor',  group: 'Outliers',  label: 'Most Frequent Vendor', icon: Users        },
  // ── Review ────────────────────────────────────────────────────────────────
  { type: 'review-open',      group: 'Review',    label: 'Open Items',           icon: Flag         },
  { type: 'review-flagged',   group: 'Review',    label: 'Flagged Spend',        icon: AlertTriangle},
  // ── Activity ──────────────────────────────────────────────────────────────
  { type: 'activity-txns',    group: 'Activity',  label: 'Transactions',         icon: ActivityIcon },
  { type: 'activity-avg',     group: 'Activity',  label: 'Avg Transaction',      icon: BarChart2    },
  { type: 'activity-dept',    group: 'Activity',  label: 'Spend by Department',  icon: Tag          },
]

const DEFAULT_CARDS = [
  { id: 'c1',  type: 'financial-highlights' },
  { id: 'c2',  type: 'budget-requests' },
  { id: 'c3',  type: 'variance-explanations' },
  { id: 'c4',  type: 'open-questions' },
  { id: 'c5',  type: 'reclassifications' },
  { id: 'c6',  type: 'budget-requests-total' },
  { id: 'c7',  type: 'top-categories',  n: 5 },
  { id: 'c8',  type: 'top-vendors',     n: 10 },
  { id: 'c9',  type: 'top-accounts',    n: 5 },
  { id: 'c10', type: 'top-grants',      n: 5 },
]

const COMMENT_TYPE_CONFIG = {
  'financial-highlight':  { color: '#10B981', bg: '#ECFDF5' },
  'budget-request':       { color: '#8B5CF6', bg: '#F5F3FF' },
  'variance-explanation': { color: '#F97316', bg: '#FFF7ED' },
  reclassification:       { color: '#EC4899', bg: '#FDF2F8' },
  question:               { color: '#F59E0B', bg: '#FFFBEB' },
  comment:                { color: '#6B7280', bg: '#F3F4F6' },
  request:                { color: '#8B5CF6', bg: '#F5F3FF' },
}

function timeAgo(ts) {
  const diff  = Date.now() - new Date(ts).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return 'just now'
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${MONTH_SHORT[parseInt(m)-1]} ${parseInt(d)}, ${y}`
}

function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2
}

// ─────────────────────────────────────────────────────────────────────────────
// CardShell
// ─────────────────────────────────────────────────────────────────────────────

function CardShell({ title, count, onRemove, children }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 tabular-nums flex-shrink-0">
            {count}
          </span>
        )}
        <button
          onClick={onRemove}
          className="text-gray-200 hover:text-red-400 transition-colors p-0.5 flex-shrink-0"
          title="Remove card"
        >
          <X size={13} />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineAddForm
// ─────────────────────────────────────────────────────────────────────────────

function InlineAddForm({ commentType, onSave, onCancel }) {
  const [author, setAuthor] = useState('')
  const [text,   setText]   = useState('')

  function handleSave() {
    if (!text.trim() || !author.trim()) return
    onSave({ author, avatar: author.charAt(0).toUpperCase(), type: commentType, text })
    setAuthor(''); setText('')
  }

  return (
    <div className="mt-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <input
        value={author}
        onChange={e => setAuthor(e.target.value)}
        placeholder="Your name"
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mb-1.5 focus:outline-none focus:border-teal-400 bg-white"
      />
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add a note..."
        rows={2}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-teal-400 bg-white"
      />
      <div className="flex gap-1.5 mt-1.5 justify-end">
        <button onClick={onCancel} className="text-[11px] px-2.5 py-1 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim() || !author.trim()}
          className="text-[11px] px-2.5 py-1 text-white rounded-lg disabled:opacity-40 transition-colors"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CommentEntry
// ─────────────────────────────────────────────────────────────────────────────

function CommentEntry({ comment }) {
  const cfg = COMMENT_TYPE_CONFIG[comment.type] || COMMENT_TYPE_CONFIG.comment
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div
          className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: cfg.color }}
        >
          {comment.avatar}
        </div>
        <span className="text-[11px] font-semibold text-gray-700">{comment.author}</span>
        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{timeAgo(comment.timestamp)}</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed pl-6">{comment.text}</p>
      {comment.category && (
        <span className="ml-6 inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
          {comment.category}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FullCommentCard
// ─────────────────────────────────────────────────────────────────────────────

function FullCommentCard({ card, commentType, title, onRemove }) {
  const { comments, addComment } = useApp()
  const [showForm, setShowForm]  = useState(false)
  const relevant = comments.filter(c => c.type === commentType && !c.resolved)

  return (
    <CardShell title={title} count={relevant.length} onRemove={onRemove}>
      {relevant.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 text-center py-2">No {title.toLowerCase()} yet</p>
      )}
      {relevant.map(c => <CommentEntry key={c.id} comment={c} />)}
      {showForm ? (
        <InlineAddForm
          commentType={commentType}
          onSave={data => { addComment({ ...data, page: 'breakdown', category: null, transactionRef: null }); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-teal-600 hover:text-teal-700 font-medium py-1 rounded-lg hover:bg-teal-50 transition-colors"
        >
          <Plus size={11} /> Add note
        </button>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MiniCommentCard
// ─────────────────────────────────────────────────────────────────────────────

function MiniCommentCard({ card, commentType, title, onRemove }) {
  const { comments } = useApp()
  const relevant     = comments.filter(c => c.type === commentType && !c.resolved)
  const preview      = relevant[0]

  return (
    <CardShell title={title} count={relevant.length} onRemove={onRemove}>
      {relevant.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-1">None open</p>
      ) : (
        <div>
          {preview && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 mb-1">{preview.text}</p>
          )}
          {relevant.length > 1 && (
            <p className="text-[10px] text-gray-400">+{relevant.length - 1} more</p>
          )}
          <a href="#/comments" className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 font-medium mt-1.5 hover:underline">
            Open in Comments <ChevronRight size={10} />
          </a>
        </div>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BudgetRequestsTotalCard
// ─────────────────────────────────────────────────────────────────────────────

function BudgetRequestsTotalCard({ card, onRemove }) {
  const { comments } = useApp()
  const requests     = comments.filter(c => c.type === 'budget-request' && !c.resolved)
  const total = requests.reduce((sum, c) => {
    const matches = c.text.match(/\$[\d,]+(?:\.\d+)?(?:\s*[KkMm])?/g) || []
    return matches.reduce((s, m) => {
      let n = parseFloat(m.replace(/[$,]/g, ''))
      if (/[Kk]/.test(m)) n *= 1000
      if (/[Mm]/.test(m)) n *= 1000000
      return s + (isNaN(n) ? 0 : n)
    }, sum)
  }, 0)

  return (
    <CardShell title="Budget Requests · $ Total" onRemove={onRemove}>
      <div className="text-center py-2">
        <div className="text-2xl font-bold text-gray-800 tabular-nums">{requests.length}</div>
        <div className="text-[10px] text-gray-400 mb-0.5">open request{requests.length !== 1 ? 's' : ''}</div>
        {total > 0 && (
          <div className="text-sm font-semibold text-gray-600 tabular-nums mb-1">
            {formatCurrency(total)} requested
          </div>
        )}
        <a href="#/comments" className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 font-medium hover:underline">
          Review & approve <ChevronRight size={10} />
        </a>
      </div>
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TopListCard
// ─────────────────────────────────────────────────────────────────────────────

function TopListCard({ card, actuals, title, field, onRemove }) {
  const [n, setN] = useState(card.n || 5)

  const byField = actuals.reduce((acc, t) => {
    const key = t[field]
    if (key === null || key === undefined || key === '') return acc
    acc[key] = (acc[key] || 0) + (t.amount || 0)
    return acc
  }, {})

  const allEntries = Object.entries(byField).sort(([, a], [, b]) => b - a)
  const topN       = allEntries.slice(0, n)
  const max        = topN[0]?.[1] || 1

  return (
    <CardShell title={title} count={allEntries.length} onRemove={onRemove}>
      <div className="flex items-center gap-1 mb-2.5">
        {[5, 10].map(num => (
          <button
            key={num}
            onClick={() => setN(num)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
              n === num ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {num}
          </button>
        ))}
        <span className="text-[10px] text-gray-400 ml-1">of {allEntries.length}</span>
      </div>
      {topN.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">No data</p>
      ) : (
        <div className="space-y-2">
          {topN.map(([key, amount], i) => (
            <div key={key}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-gray-300 w-3.5 text-right flex-shrink-0">{i + 1}</span>
                <span className="text-xs text-gray-700 font-medium flex-1 truncate">{key}</span>
                <span className="text-[11px] font-semibold text-gray-800 tabular-nums flex-shrink-0">{formatCurrency(amount)}</span>
              </div>
              <div className="ml-5 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(amount / max) * 100}%`, backgroundColor: 'var(--color-accent)' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Variance: two separate cards
// ─────────────────────────────────────────────────────────────────────────────

function BiggestOverrunCard({ card, actuals, budgetByCat, onRemove }) {
  const item = useMemo(() => {
    const byCat = aggregateBy(actuals, 'category')
    return [...new Set([...Object.keys(byCat), ...Object.keys(budgetByCat)])]
      .filter(cat => (budgetByCat[cat] || 0) > 0)
      .map(cat => ({ cat, actual: byCat[cat]||0, budget: budgetByCat[cat]||0, delta: (byCat[cat]||0)-(budgetByCat[cat]||0) }))
      .filter(c => c.delta > 0)
      .sort((a,b) => b.delta - a.delta)[0] || null
  }, [actuals, budgetByCat])

  return (
    <CardShell title="Biggest Overrun" onRemove={onRemove}>
      {!item ? <p className="text-xs text-gray-400 text-center py-2">No overruns</p> : (
        <div>
          <div className="text-sm font-bold text-gray-800 mb-0.5">{item.cat}</div>
          <div className="text-xl font-bold" style={{ color: 'var(--color-over)' }}>{formatOverUnder(item.delta)}</div>
          <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">{formatCurrency(item.actual)} of {formatCurrency(item.budget)}</div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: 'var(--color-over)' }} />
          </div>
        </div>
      )}
    </CardShell>
  )
}

function BiggestUnderrunCard({ card, actuals, budgetByCat, onRemove }) {
  const item = useMemo(() => {
    const byCat = aggregateBy(actuals, 'category')
    return [...new Set([...Object.keys(byCat), ...Object.keys(budgetByCat)])]
      .filter(cat => (budgetByCat[cat] || 0) > 0)
      .map(cat => ({ cat, actual: byCat[cat]||0, budget: budgetByCat[cat]||0, delta: (byCat[cat]||0)-(budgetByCat[cat]||0) }))
      .filter(c => c.delta < 0)
      .sort((a,b) => a.delta - b.delta)[0] || null
  }, [actuals, budgetByCat])

  return (
    <CardShell title="Biggest Underrun" onRemove={onRemove}>
      {!item ? <p className="text-xs text-gray-400 text-center py-2">No underruns</p> : (
        <div>
          <div className="text-sm font-bold text-gray-800 mb-0.5">{item.cat}</div>
          <div className="text-xl font-bold" style={{ color: 'var(--color-under)' }}>{formatOverUnder(item.delta)}</div>
          <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">{formatCurrency(item.actual)} of {formatCurrency(item.budget)}</div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: `${Math.min((item.actual/item.budget)*100,100)}%`, backgroundColor: 'var(--color-under)' }} />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PacingCard — annual budget pacing vs. % of year elapsed
// ─────────────────────────────────────────────────────────────────────────────

function PacingCard({ card, onRemove }) {
  const { actuals, budgetFlat, selectedScenario, orgConfig } = useApp()
  const [yearType, setYearType] = useState('fy')

  const startMonth = yearType === 'fy' ? orgConfig.fiscalYearStartMonth  : orgConfig.operatingYearStartMonth
  const startYear  = yearType === 'fy' ? orgConfig.fiscalYearStartYear   : orgConfig.operatingYearStartYear
  const endYear    = startMonth === 1 ? startYear : startYear + 1
  const endMonth   = startMonth === 1 ? 12 : startMonth - 1
  const lastDay    = new Date(endYear, endMonth, 0).getDate()
  const startDate  = `${startYear}-${pad2(startMonth)}-01`
  const endDate    = `${endYear}-${pad2(endMonth)}-${pad2(lastDay)}`
  const startLabel = MONTH_SHORT[startMonth - 1]
  const endLabel   = MONTH_SHORT[endMonth - 1]

  const today    = new Date()
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`

  // Full-year budget (all depts)
  const yearBudgetByCat = useMemo(
    () => calcBudgetByCategory(budgetFlat, selectedScenario, startDate, endDate),
    [budgetFlat, selectedScenario, startDate, endDate]
  )
  const fullYearBudget = Object.values(yearBudgetByCat).reduce((s, v) => s + v, 0)

  // Actuals YTD (from year start to today, all depts)
  const ytdActuals = useMemo(
    () => filterActualsByRange(actuals, startDate, todayStr),
    [actuals, startDate, todayStr]
  )
  const ytdTotal = ytdActuals.reduce((s, t) => s + t.amount, 0)

  // % calculations
  const pctSpent = fullYearBudget > 0 ? (ytdTotal / fullYearBudget) * 100 : 0
  const yearStart    = new Date(startDate)
  const yearEnd      = new Date(endDate)
  const totalMs      = yearEnd - yearStart
  const elapsedMs    = Math.max(0, Math.min(today - yearStart, totalMs))
  const pctElapsed   = (elapsedMs / totalMs) * 100
  const ppAhead      = pctSpent - pctElapsed
  const isAhead      = ppAhead >= 0
  const remaining    = Math.max(0, fullYearBudget - ytdTotal)

  return (
    <CardShell title="Annual Pacing" onRemove={onRemove}>
      {/* FY / OY toggle */}
      <div className="flex items-center gap-1 mb-3">
        {[['fy','FY'],['oy','OY']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setYearType(v)}
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
              yearType === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {l}
          </button>
        ))}
        <span className="text-[10px] text-gray-400 ml-1 uppercase tracking-wide">· {yearType === 'fy' ? 'Fiscal Year' : 'Operating Year'}</span>
      </div>

      <div className="text-3xl font-bold text-gray-800 tabular-nums">{Math.round(pctSpent)}%</div>
      <div className="text-sm text-gray-600 mt-0.5 tabular-nums">{formatCurrency(ytdTotal)} spent of {formatCurrency(fullYearBudget)}</div>
      <div className="text-xs text-gray-400 mt-0.5">
        {formatCurrency(remaining)} remaining · {startLabel} → {endLabel} · {selectedScenario}
      </div>

      {/* Progress bar: actual spend vs full-year budget; tick = pace marker */}
      <div className="relative h-2 bg-gray-100 rounded-full my-2.5 overflow-hidden">
        <div
          className="absolute h-full rounded-full transition-all"
          style={{
            width: `${Math.min(pctSpent, 100)}%`,
            backgroundColor: isAhead ? 'var(--color-over)' : 'var(--color-under)',
          }}
        />
      </div>
      {/* Pace tick */}
      <div className="relative h-1 mb-1">
        <div
          className="absolute w-px h-3 bg-gray-400 -top-2"
          style={{ left: `${Math.min(pctElapsed, 100)}%` }}
          title={`${Math.round(pctElapsed)}% of year elapsed`}
        />
      </div>

      <div
        className="text-xs font-semibold"
        style={{ color: isAhead ? 'var(--color-over)' : 'var(--color-under)' }}
      >
        {isAhead ? '+' : ''}{Math.round(ppAhead)}pp {isAhead ? 'ahead' : 'behind'} of pace
        <span className="text-gray-400 font-normal"> · {Math.round(pctElapsed)}% of year elapsed</span>
      </div>
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Outliers: three separate cards
// ─────────────────────────────────────────────────────────────────────────────

function LargestTxCard({ card, actuals, onRemove }) {
  const tx = useMemo(() => actuals.reduce((max, t) => (!max || t.amount > max.amount ? t : max), null), [actuals])
  return (
    <CardShell title="Largest Transaction" onRemove={onRemove}>
      {!tx ? <p className="text-xs text-gray-400 text-center py-2">No data</p> : (
        <div>
          <div className="text-xl font-bold text-gray-800 tabular-nums">{formatCurrency(tx.amount, { compact: false })}</div>
          <div className="text-xs font-medium text-gray-700 truncate mt-0.5">{tx.vendor}</div>
          <div className="text-[10px] text-gray-400">{tx.date} · {tx.department} · {tx.category}</div>
        </div>
      )}
    </CardShell>
  )
}

function TopMonthCard({ card, actuals, onRemove }) {
  const { month, amount, txCount, pctAboveAvg } = useMemo(() => {
    const byMonth = aggregateByMonth(actuals)
    if (!byMonth.length) return {}
    const avg = byMonth.reduce((s,m) => s + m.actual, 0) / byMonth.length
    const top = [...byMonth].sort((a,b) => b.actual - a.actual)[0]
    const [y, m] = top.month.split('-')
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return {
      month: `${MONTHS[parseInt(m)-1]} '${y.slice(2)}`,
      amount: top.actual,
      txCount: actuals.filter(t => t.date.startsWith(top.month)).length,
      pctAboveAvg: avg > 0 ? ((top.actual - avg) / avg * 100) : 0,
    }
  }, [actuals])

  return (
    <CardShell title="Highest-Spend Month" onRemove={onRemove}>
      {!month ? <p className="text-xs text-gray-400 text-center py-2">No data</p> : (
        <div>
          <div className="text-xl font-bold text-gray-800 tabular-nums">{formatCurrency(amount)}</div>
          <div className="text-xs font-medium text-gray-700 mt-0.5">{month}</div>
          <div className="text-[10px] text-gray-400">{txCount} txn · {pctAboveAvg >= 0 ? '+' : ''}{Math.round(pctAboveAvg)}% vs monthly avg</div>
        </div>
      )}
    </CardShell>
  )
}

function TopVendorCard({ card, actuals, onRemove }) {
  const { vendor, count, total, avg } = useMemo(() => {
    const counts = countBy(actuals, 'vendor')
    const [topVendor, topCount] = Object.entries(counts).sort(([,a],[,b]) => b-a)[0] || []
    if (!topVendor) return {}
    const total = actuals.filter(t => t.vendor === topVendor).reduce((s,t) => s+t.amount, 0)
    return { vendor: topVendor, count: topCount, total, avg: topCount > 0 ? total/topCount : 0 }
  }, [actuals])

  return (
    <CardShell title="Most Frequent Vendor" onRemove={onRemove}>
      {!vendor ? <p className="text-xs text-gray-400 text-center py-2">No data</p> : (
        <div>
          <div className="text-sm font-bold text-gray-800 truncate">{vendor}</div>
          <div className="text-xs text-gray-600 mt-0.5">{count} transactions</div>
          <div className="text-[10px] text-gray-400 tabular-nums">{formatCurrency(total)} total · {formatCurrency(avg)} avg</div>
        </div>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Review: two separate cards
// ─────────────────────────────────────────────────────────────────────────────

function OpenItemsCard({ card, onRemove }) {
  const { comments } = useApp()
  const open = comments.filter(c => !['resolved','rejected'].includes(c.status || (c.resolved ? 'resolved':'open')) && (c.type === 'request' || c.type === 'budget-request' || c.type === 'question'))
  const withTx = comments.filter(c => c.transactionRef || c.anchor?.txRef)
  return (
    <CardShell title="Open Items" onRemove={onRemove}>
      <div className="text-2xl font-bold text-gray-800 tabular-nums">{open.length}</div>
      <div className="text-[10px] text-gray-400">{open.length} open flags · {withTx.length} commented</div>
      <a href="/comments" className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 font-medium mt-1.5 hover:underline">
        Open in Comments <ChevronRight size={10} />
      </a>
    </CardShell>
  )
}

function FlaggedSpendCard({ card, onRemove }) {
  const { comments } = useApp()
  const flagged = comments.filter(c => (c.transactionRef || c.anchor?.txRef) && !['resolved'].includes(c.status || (c.resolved?'resolved':'open')))
  const total = flagged.reduce((s,c) => s + ((c.transactionRef||c.anchor?.txRef)?.amount||0), 0)
  return (
    <CardShell title="Flagged Spend" onRemove={onRemove}>
      <div className="text-xl font-bold text-gray-800 tabular-nums">{formatCurrency(total)}</div>
      <div className="text-[10px] text-gray-400">{flagged.length} flagged txn</div>
      <a href="/comments" className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 font-medium mt-1.5 hover:underline">
        Open in Comments <ChevronRight size={10} />
      </a>
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity: three separate cards
// ─────────────────────────────────────────────────────────────────────────────

function TxCountCard({ card, actuals, onRemove }) {
  const { deptNames } = useApp()
  const total = actuals.length
  const spend = actuals.reduce((s,t) => s+t.amount, 0)
  const avg = total > 0 ? spend/total : 0
  const uniqueDepts = new Set(actuals.map(t=>t.department)).size
  return (
    <CardShell title="Transactions" onRemove={onRemove}>
      <div className="text-2xl font-bold text-gray-800 tabular-nums">{total.toLocaleString()}</div>
      <div className="text-xs text-gray-500 tabular-nums">{formatCurrency(avg)} average</div>
      <div className="text-[10px] text-gray-400">{uniqueDepts} of {Object.keys(deptNames).length} depts in scope</div>
    </CardShell>
  )
}

function AvgTxCard({ card, actuals, onRemove }) {
  const total = actuals.length
  const spend = actuals.reduce((s,t) => s+t.amount, 0)
  const avg = total > 0 ? spend/total : 0
  const med = median(actuals.map(t=>t.amount))
  return (
    <CardShell title="Avg Transaction" onRemove={onRemove}>
      <div className="text-2xl font-bold text-gray-800 tabular-nums">{formatCurrency(avg)}</div>
      <div className="text-[10px] text-gray-400">median {formatCurrency(med)}</div>
      <div className="text-[10px] text-gray-400">{total.toLocaleString()} txn in scope</div>
    </CardShell>
  )
}

function DeptSpendCard({ card, actuals, onRemove }) {
  const { deptNames } = useApp()
  const byDept = aggregateBy(actuals, 'department')
  const entries = Object.entries(byDept).sort(([,a],[,b]) => b-a)
  const max = entries[0]?.[1] || 1
  return (
    <CardShell title="Spend by Department" onRemove={onRemove}>
      {entries.length === 0 ? <p className="text-xs text-gray-400 text-center py-2">No data</p> : (
        <div className="space-y-2">
          {entries.map(([code, amount]) => (
            <div key={code}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-gray-300 w-6 text-right flex-shrink-0">{code}</span>
                <span className="text-xs text-gray-700 flex-1 truncate">{deptNames[code] || `Dept ${code}`}</span>
                <span className="text-[11px] font-semibold text-gray-800 tabular-nums flex-shrink-0">{formatCurrency(amount)}</span>
              </div>
              <div className="ml-8 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(amount/max)*100}%`, backgroundColor: 'var(--color-accent)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AddCardPanel
// ─────────────────────────────────────────────────────────────────────────────

function AddCardPanel({ activeTypes, onAdd, onClose }) {
  const byGroup = CARD_REGISTRY.reduce((acc, card) => {
    if (!acc[card.group]) acc[card.group] = []
    acc[card.group].push(card)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white h-full w-72 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add Card</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          {Object.entries(byGroup).map(([group, cards]) => (
            <div key={group}>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{group}</div>
              <div className="space-y-1.5">
                {cards.map(card => {
                  const isActive = activeTypes.includes(card.type)
                  const Icon     = card.icon
                  return (
                    <button
                      key={card.type}
                      onClick={() => !isActive && onAdd(card.type)}
                      disabled={isActive}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
                          : 'bg-white border-gray-200 hover:border-teal-400 hover:bg-teal-50 cursor-pointer'
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isActive ? '#F3F4F6' : 'var(--color-primary-light)' }}
                      >
                        <Icon size={13} style={{ color: isActive ? '#9CA3AF' : 'var(--color-primary)' }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 flex-1">{card.label}</span>
                      {isActive && <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">Added</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SpendSummaryCard
// ─────────────────────────────────────────────────────────────────────────────

function SpendSummaryCard({ actual, budget, transactions, selectedScenario }) {
  const delta   = actual - budget
  const pctUsed = budget > 0 ? (actual / budget) * 100 : 0

  return (
    <div className="bg-gray-900 text-white rounded-2xl p-5">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Spend · Whole Team</div>
      <div className="text-3xl font-bold mb-0.5">{formatCurrency(actual)}</div>
      <div className="text-xs text-gray-400">{transactions} transactions</div>
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">vs {selectedScenario}</div>
        <div className="mt-1">
          <span className="text-sm font-bold" style={{ color: delta >= 0 ? '#F87171' : '#34D399' }}>
            {formatOverUnder(delta)}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pctUsed, 100)}%`, backgroundColor: delta >= 0 ? '#F87171' : '#34D399' }}
          />
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          {formatCurrency(budget)} {selectedScenario} · {Math.round(pctUsed)}% used
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIPanel — main export
// ─────────────────────────────────────────────────────────────────────────────

export default function KPIPanel({ actual, budget, transactions, selectedScenario, actuals, budgetByCat }) {
  const [cards,        setCards]        = useLocalStorage('bd-kpi-cards', DEFAULT_CARDS)
  const [showAddPanel, setShowAddPanel] = useState(false)

  function removeCard(id) {
    setCards(prev => prev.filter(c => c.id !== id))
  }

  function addCard(type) {
    const reg = CARD_REGISTRY.find(r => r.type === type)
    if (!reg) return
    setCards(prev => [...prev, { id: 'card-' + Date.now(), type, n: reg.defaultN }])
    setShowAddPanel(false)
  }

  const activeTypes = cards.map(c => c.type)

  function renderCard(card) {
    const reg      = CARD_REGISTRY.find(r => r.type === card.type)
    if (!reg) return null
    const onRemove = () => removeCard(card.id)

    // Comment cards
    if (reg.variant === 'full')  return <FullCommentCard   key={card.id} card={card} commentType={reg.commentType} title={reg.label} onRemove={onRemove} />
    if (reg.variant === 'mini')  return <MiniCommentCard   key={card.id} card={card} commentType={reg.commentType} title={reg.label} onRemove={onRemove} />
    if (reg.variant === 'total') return <BudgetRequestsTotalCard key={card.id} card={card} onRemove={onRemove} />
    // Top Lists
    if (reg.group === 'Top Lists') return <TopListCard key={card.id} card={card} actuals={actuals} title={reg.label} field={reg.field} onRemove={onRemove} />
    // Analytics — individual cards
    if (card.type === 'variance-over')    return <BiggestOverrunCard  key={card.id} card={card} actuals={actuals} budgetByCat={budgetByCat||{}} onRemove={onRemove} />
    if (card.type === 'variance-under')   return <BiggestUnderrunCard key={card.id} card={card} actuals={actuals} budgetByCat={budgetByCat||{}} onRemove={onRemove} />
    if (card.type === 'pacing')           return <PacingCard          key={card.id} card={card} onRemove={onRemove} />
    if (card.type === 'outliers-tx')      return <LargestTxCard       key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    if (card.type === 'outliers-month')   return <TopMonthCard        key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    if (card.type === 'outliers-vendor')  return <TopVendorCard       key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    if (card.type === 'review-open')      return <OpenItemsCard       key={card.id} card={card} onRemove={onRemove} />
    if (card.type === 'review-flagged')   return <FlaggedSpendCard    key={card.id} card={card} onRemove={onRemove} />
    if (card.type === 'activity-txns')    return <TxCountCard         key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    if (card.type === 'activity-avg')     return <AvgTxCard           key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    if (card.type === 'activity-dept')    return <DeptSpendCard       key={card.id} card={card} actuals={actuals} onRemove={onRemove} />
    return null
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <SpendSummaryCard
          actual={actual}
          budget={budget}
          transactions={transactions}
          selectedScenario={selectedScenario}
        />

        {cards.map(renderCard)}

        <button
          onClick={() => setShowAddPanel(true)}
          className="bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-teal-300 hover:bg-teal-50 transition-colors py-6"
        >
          <Plus size={20} className="text-gray-300 mb-1" />
          <span className="text-xs text-gray-400 font-medium">Add card</span>
        </button>
      </div>

      {showAddPanel && (
        <AddCardPanel
          activeTypes={activeTypes}
          onAdd={addCard}
          onClose={() => setShowAddPanel(false)}
        />
      )}
    </>
  )
}
