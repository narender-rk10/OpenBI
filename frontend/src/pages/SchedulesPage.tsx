/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Clock, Plus, Trash2, Play, Pause, X, Mail, MessageCircle,
  Globe, Loader2, ChevronDown, CheckCircle2, AlertCircle,
  BarChart2, Activity, RefreshCw, Timer, TrendingUp, Pencil,
  CalendarClock, LayoutDashboard, Save,
  ChevronUp, AlertTriangle, Search,
} from 'lucide-react'
import api from '../lib/api'
import type { Dashboard, Schedule } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import ScheduleBuilder, { cronToHuman } from '../components/shared/ScheduleBuilder'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRun {
  _id: string
  project_id: string
  schedule_id: string
  schedule_name: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  status: 'running' | 'success' | 'error'
  error: string | null
  dashboard_id: string | null
}

type FormState = {
  name: string
  dashboard_id: string
  cron: string
  delivery: { channels: { type: string; recipients: string }[] }
}

type SortCol = 'started_at' | 'duration_ms' | 'status' | 'schedule_name'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'running' | 'success' | 'error'

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, any> = {
  email: Mail, telegram: MessageCircle, webhook: Globe,
}

const defaultForm = (): FormState => ({
  name: '', dashboard_id: '',
  cron: '0 8 * * 1',
  delivery: { channels: [{ type: 'email', recipients: '' }] },
})

function scheduleToForm(s: Schedule): FormState {
  const rawChannels: any[] = (s.delivery as any)?.channels || []
  return {
    name: s.name,
    dashboard_id: s.dashboard_id || '',
    cron: s.cron,
    delivery: {
      channels: rawChannels.map(ch => ({
        type: ch.type || 'email',
        recipients: Array.isArray(ch.recipients) ? ch.recipients.join(', ') : (ch.recipients || ''),
      })),
    },
  }
}

function buildPayload(form: FormState) {
  return {
    name: form.name, cron: form.cron,
    delivery: {
      channels: form.delivery.channels.map(ch => ({
        ...ch,
        recipients: typeof ch.recipients === 'string'
          ? ch.recipients.split(',').map((r: string) => r.trim()).filter(Boolean)
          : ch.recipients,
      })),
    },
    dashboard_id: form.dashboard_id || null,
  }
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtNextRun(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 60_000) return 'in < 1 min'
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ── Status visual config ─────────────────────────────────────────────────────

const STATUS_CFG = {
  success: {
    dot: 'bg-emerald-400',
    pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    bar: 'bg-emerald-500',
    label: 'Succeeded',
    Icon: CheckCircle2,
  },
  error: {
    dot: 'bg-red-400',
    pill: 'bg-red-500/10 text-red-400 border-red-500/20',
    bar: 'bg-red-500',
    label: 'Failed',
    Icon: AlertTriangle,
  },
  running: {
    dot: 'bg-blue-400 animate-pulse',
    pill: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    bar: 'bg-blue-500 animate-pulse',
    label: 'Running',
    Icon: Loader2,
  },
} as const

// ── Shared form body ──────────────────────────────────────────────────────────

function ScheduleFormBody({
  form, setForm, dashboards,
}: {
  form: FormState
  setForm: (f: FormState | ((p: FormState) => FormState)) => void
  dashboards: Dashboard[]
}) {
  const addCh = () => setForm(p => ({ ...p, delivery: { channels: [...p.delivery.channels, { type: 'email', recipients: '' }] } }))
  const rmCh = (i: number) => setForm(p => ({ ...p, delivery: { channels: p.delivery.channels.filter((_, j) => j !== i) } }))
  const updCh = (i: number, k: string, v: string) => setForm(p => ({
    ...p, delivery: { channels: p.delivery.channels.map((c, j) => j === i ? { ...c, [k]: v } : c) },
  }))

  return (
    <>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Name</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Weekly Sales Report" required
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Dashboard</label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Re-runs all widget SQL queries and snapshots the latest data, then delivers it.</p>
        <div className="relative">
          <select value={form.dashboard_id} onChange={e => setForm({ ...form, dashboard_id: e.target.value })} required
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none appearance-none"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="">Select dashboard…</option>
            {dashboards.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-3 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Frequency</label>
        <ScheduleBuilder value={form.cron} onChange={cron => setForm(p => ({ ...p, cron }))} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Delivery Channels</label>
          <button type="button" onClick={addCh} className="text-xs flex items-center gap-1 text-[#e94560] hover:underline">
            <Plus className="w-3 h-3" />Add channel
          </button>
        </div>
        <div className="space-y-2">
          {form.delivery.channels.map((ch, idx) => {
            const Icon = CHANNEL_ICONS[ch.type] || Mail
            return (
              <div key={idx} className="flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                <select value={ch.type} onChange={e => updCh(idx, 'type', e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border outline-none"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                  <option value="webhook">Webhook</option>
                </select>
                <input type="text" value={ch.recipients} onChange={e => updCh(idx, 'recipients', e.target.value)}
                  placeholder={ch.type === 'email' ? 'email@example.com, …' : ch.type === 'webhook' ? 'https://…' : 'Chat ID or @channel (comma-separated)'}
                  className="flex-1 text-xs px-2 py-1 rounded-lg border outline-none"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                {form.delivery.channels.length > 1 && (
                  <button type="button" onClick={() => rmCh(idx)} className="shrink-0 hover:text-red-500 transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Run History Grid (ADF + AG Grid style) ────────────────────────────────────

function RunHistoryGrid({
  runs, schedules, loading, onRefresh, onJumpToSchedule,
}: {
  runs: ScheduleRun[]
  schedules: Schedule[]
  loading: boolean
  onRefresh: () => void
  onJumpToSchedule: (id: string) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [schedFilter, setSchedFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('started_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const handleRefresh = () => { setLastRefreshed(new Date()); onRefresh() }

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let r = runs
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter)
    if (schedFilter !== 'all') r = r.filter(x => x.schedule_id === schedFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(x => x.schedule_name.toLowerCase().includes(q) || (x.error || '').toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      let av: any, bv: any
      if (sortCol === 'started_at') { av = new Date(a.started_at).getTime(); bv = new Date(b.started_at).getTime() }
      else if (sortCol === 'duration_ms') { av = a.duration_ms ?? -1; bv = b.duration_ms ?? -1 }
      else if (sortCol === 'status') { av = a.status; bv = b.status }
      else { av = a.schedule_name; bv = b.schedule_name }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
  }, [runs, statusFilter, schedFilter, search, sortCol, sortDir])

  const maxDuration = useMemo(() =>
    Math.max(1, ...runs.filter(r => r.duration_ms !== null).map(r => r.duration_ms!)), [runs])

  const counts = useMemo(() => ({
    all: runs.length,
    success: runs.filter(r => r.status === 'success').length,
    error: runs.filter(r => r.status === 'error').length,
    running: runs.filter(r => r.status === 'running').length,
  }), [runs])

  const successRate = counts.success + counts.error > 0
    ? Math.round(counts.success / (counts.success + counts.error) * 100) : null
  const avgDur = useMemo(() => {
    const done = runs.filter(r => r.duration_ms !== null)
    return done.length ? Math.round(done.reduce((s, r) => s + r.duration_ms!, 0) / done.length) : null
  }, [runs])

  // Sort icon
  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span className="ml-1 opacity-0 group-hover:opacity-40 transition-opacity"><ChevronDown className="w-3 h-3 inline" /></span>
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1 text-[#e94560]" />
      : <ChevronDown className="w-3 h-3 inline ml-1 text-[#e94560]" />
  }

  const thCls = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider select-none cursor-pointer group transition-colors hover:text-[#e94560]"

  return (
    <div className="space-y-4">

      {/* ── Stats band ── */}
      <div className="flex items-center gap-6 px-4 py-3 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        {[
          { label: 'Total', value: counts.all, color: 'text-[#e94560]' },
          { label: 'Succeeded', value: counts.success, color: 'text-emerald-400' },
          { label: 'Failed', value: counts.error, color: 'text-red-400' },
          { label: 'Running', value: counts.running, color: 'text-blue-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="text-xs opacity-20" style={{ color: 'var(--text-muted)' }}>│</span>
          </div>
        ))}
        {successRate !== null && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className={`text-sm font-bold ${successRate >= 90 ? 'text-emerald-400' : successRate >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
              {successRate}%
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>success rate</span>
            <span className="text-xs opacity-20" style={{ color: 'var(--text-muted)' }}>│</span>
          </div>
        )}
        {avgDur !== null && (
          <div className="flex items-center gap-2">
            <Timer className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-sm font-bold tabular-nums text-blue-400">{fmtDuration(avgDur)}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>avg duration</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="w-3 h-3" />
          Refreshed {fmtRelative(lastRefreshed.toISOString())}
        </div>
      </div>

      {/* ── Toolbar: status chips + filters ── */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Status filter chips (ADF style) */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          {([
            { id: 'all',     label: 'All',       count: counts.all,     dot: 'bg-gray-400' },
            { id: 'running', label: 'Running',   count: counts.running, dot: 'bg-blue-400 animate-pulse' },
            { id: 'success', label: 'Succeeded', count: counts.success, dot: 'bg-emerald-400' },
            { id: 'error',   label: 'Failed',    count: counts.error,   dot: 'bg-red-400' },
          ] as { id: StatusFilter; label: string; count: number; dot: string }[]).map(({ id, label, count, dot }) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === id ? 'bg-[#e94560] text-white shadow-sm' : 'hover:bg-white/5'
              }`}
              style={statusFilter !== id ? { color: 'var(--text-secondary)' } : undefined}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === id ? 'bg-white' : dot}`} />
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${statusFilter === id ? 'bg-white/20' : ''}`}
                style={statusFilter !== id ? { background: 'var(--bg-secondary)' } : undefined}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Schedule filter */}
        <div className="relative">
          <select value={schedFilter} onChange={e => setSchedFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-xl border text-xs outline-none appearance-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            <option value="all">All schedules</option>
            {schedules.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-3 h-3 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-40 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search runs…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-[#e94560]/30"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>

        <button onClick={handleRefresh} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/5 transition-all"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── AG Grid-style table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <Loader2 className="w-6 h-6 animate-spin text-[#e94560]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <Activity className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No runs found</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {statusFilter !== 'all' || schedFilter !== 'all' || search ? 'Try adjusting your filters.' : 'Runs appear here once a schedule executes.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
          {/* Table */}
          <table className="w-full border-collapse text-xs">
            {/* Header */}
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                {/* Row # */}
                <th className="w-10 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>#</th>

                <th className={thCls} style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('status')}>
                  Status <SortIcon col="status" />
                </th>
                <th className={thCls} style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('schedule_name')}>
                  Schedule <SortIcon col="schedule_name" />
                </th>
                <th className={thCls} style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('started_at')}>
                  Start time <SortIcon col="started_at" />
                </th>
                <th className={thCls} style={{ color: 'var(--text-muted)' }}>
                  End time
                </th>
                <th className={`${thCls} w-44`} style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('duration_ms')}>
                  Duration <SortIcon col="duration_ms" />
                </th>
                <th className={thCls} style={{ color: 'var(--text-muted)' }}>Output</th>
                <th className={thCls} style={{ color: 'var(--text-muted)' }}>Trigger</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((run, idx) => {
                const cfg = STATUS_CFG[run.status]
                const pct = run.duration_ms !== null ? Math.max(4, Math.round((run.duration_ms / maxDuration) * 100)) : 0
                const isEven = idx % 2 === 0

                return (
                  <>
                    <tr
                      key={run._id}
                      className="transition-colors"
                      style={{
                        borderBottom: run.error ? 'none' : '1px solid var(--border-color)',
                        background: isEven ? 'var(--bg-card)' : 'rgba(255,255,255,0.015)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                      onMouseLeave={e => (e.currentTarget.style.background = isEven ? 'var(--bg-card)' : 'rgba(255,255,255,0.015)')}
                    >
                      {/* Row number */}
                      <td className="w-10 px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {idx + 1}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border ${cfg.pill}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Schedule name */}
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => onJumpToSchedule(run.schedule_id)}
                          className="font-medium hover:text-[#e94560] transition-colors text-left"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {run.schedule_name}
                        </button>
                      </td>

                      {/* Start time */}
                      <td className="px-3 py-2.5">
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtRelative(run.started_at)}</span>
                        <span className="block text-[10px] tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {fmtAbsolute(run.started_at)}
                        </span>
                      </td>

                      {/* End time */}
                      <td className="px-3 py-2.5">
                        {run.finished_at ? (
                          <>
                            <span style={{ color: 'var(--text-secondary)' }}>{fmtRelative(run.finished_at)}</span>
                            <span className="block text-[10px] tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {fmtAbsolute(run.finished_at)}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* Duration + bar */}
                      <td className="px-3 py-2.5 w-44">
                        <span className="tabular-nums font-medium" style={{ color: 'var(--text-secondary)' }}>{fmtDuration(run.duration_ms)}</span>
                        <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)', width: '100%' }}>
                          {run.duration_ms !== null && (
                            <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
                          )}
                          {run.status === 'running' && (
                            <div className="h-full w-1/3 rounded-full bg-blue-400 animate-[slide-right_1.5s_ease-in-out_infinite]" />
                          )}
                        </div>
                      </td>

                      {/* Output */}
                      <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>
                        {run.dashboard_id ? 'Report generated' : '—'}
                      </td>

                      {/* Trigger */}
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded w-fit" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                          <Clock className="w-2.5 h-2.5" /> Scheduled
                        </span>
                      </td>
                    </tr>

                    {/* Inline error row (always visible when status is error) */}
                    {run.error && (
                      <tr key={`${run._id}-err`} style={{ background: isEven ? 'var(--bg-card)' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border-color)' }}>
                        <td colSpan={8} className="px-6 pb-3">
                          <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-mono whitespace-pre-wrap break-all text-red-300/80">{run.error}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>

          {/* Footer: row count */}
          <div className="px-4 py-2 flex items-center justify-between border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Showing {filtered.length} of {runs.length} runs
            </span>
            {filtered.length !== runs.length && (
              <button onClick={() => { setStatusFilter('all'); setSchedFilter('all'); setSearch('') }}
                className="text-[11px] text-[#e94560] hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [tab, setTab] = useState<'schedules' | 'runs'>('schedules')

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(defaultForm())

  const [editTarget, setEditTarget] = useState<Schedule | null>(null)
  const [editForm, setEditForm] = useState<FormState>(defaultForm())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [runs, setRuns] = useState<ScheduleRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const fetchSchedules = useCallback(async () => {
    const [s, d] = await Promise.all([
      api.get(`/api/projects/${projectId}/schedules`),
      api.get(`/api/projects/${projectId}/dashboards`).catch(() => ({ data: [] })),
    ])
    setSchedules(s.data); setDashboards(d.data)
  }, [projectId])

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true)
    try {
      const { data } = await api.get(`/api/projects/${projectId}/schedules/runs`)
      setRuns(data)
    } finally { setRunsLoading(false) }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    fetchSchedules().finally(() => setLoading(false))
  }, [fetchSchedules])

  useEffect(() => { if (tab === 'runs') fetchRuns() }, [tab, fetchRuns])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true)
    try {
      await api.post(`/api/projects/${projectId}/schedules`, buildPayload(form))
      setShowCreate(false); setForm(defaultForm()); fetchSchedules()
    } finally { setCreating(false) }
  }

  const openEdit = (s: Schedule) => { setEditForm(scheduleToForm(s)); setEditTarget(s); setShowCreate(false) }
  const closeEdit = () => setEditTarget(null)

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editTarget) return; setSaving(true)
    try {
      await api.put(`/api/projects/${projectId}/schedules/${editTarget._id}`, buildPayload(editForm))
      closeEdit(); fetchSchedules()
    } finally { setSaving(false) }
  }

  const toggleActive = async (id: string, active: boolean) => {
    await api.put(`/api/projects/${projectId}/schedules/${id}`, { is_active: !active })
    fetchSchedules()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return; setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/schedules/${deleteTarget._id}`)
      if (editTarget?._id === deleteTarget._id) closeEdit()
      fetchSchedules()
    } catch { /**/ }
    setIsDeleting(false); setDeleteTarget(null)
  }

  const getDashboardName = (id: string | null | undefined) => dashboards.find(d => d._id === id)?.name ?? (id ?? '—')

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto animate-[fade-in_0.5s_ease-out]">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}>
            <Clock className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Schedules</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Automate report delivery via email, Telegram, and webhooks.</p>
          </div>
        </div>
        {tab === 'schedules' && (
          <button onClick={() => { setShowCreate(s => !s); setEditTarget(null) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20 active:scale-95 shrink-0">
            <Plus className="w-4 h-4" /> New Schedule
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        {([
          { id: 'schedules', label: 'Schedules', Icon: Clock },
          { id: 'runs',      label: 'Run History', Icon: Activity },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-[#e94560] text-white shadow-sm' : 'hover:bg-white/5'}`}
            style={tab !== id ? { color: 'var(--text-secondary)' } : undefined}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── SCHEDULES TAB ── */}
      {tab === 'schedules' && (
        <div className="flex gap-5 items-start">
          <div className="flex-1 min-w-0 space-y-3">

            {/* Create form */}
            {showCreate && (
              <form onSubmit={handleCreate} className="card p-6 mb-2 animate-[slide-up_0.25s_ease-out] space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>New Schedule</h3>
                  <button type="button" onClick={() => setShowCreate(false)} style={{ color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
                </div>
                <ScheduleFormBody form={form} setForm={setForm} dashboards={dashboards} />
                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                  <button type="submit" disabled={creating}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e94560]/90 transition-all">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    {creating ? 'Creating…' : 'Create Schedule'}
                  </button>
                </div>
              </form>
            )}

            {/* Empty state */}
            {schedules.length === 0 ? (
              <div className="card p-16 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No schedules yet</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Schedule a dashboard to send reports automatically.</p>
              </div>
            ) : (
              schedules.map(s => {
                const channels: any[] = (s.delivery as any)?.channels || []
                const isEditing = editTarget?._id === s._id
                return (
                  <div key={s._id} className={`card px-5 py-4 transition-all ${isEditing ? 'ring-2 ring-[#e94560]/50' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.is_active ? 'bg-[#e94560]/10' : 'bg-gray-500/10'}`}>
                          <Clock className={`w-5 h-5 ${s.is_active ? 'text-[#e94560]' : 'text-gray-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{s.name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                              {s.is_active ? 'Active' : 'Paused'}
                            </span>
                            {s.last_run_status === 'error' && (
                              <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Last run failed</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                              <RefreshCw className="w-3 h-3" />{cronToHuman(s.cron)}
                            </span>
                            {s.is_active && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <CalendarClock className="w-3 h-3" />Next: {fmtNextRun((s as any).next_run_at)}
                              </span>
                            )}
                            {s.last_run_at && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last: {fmtRelative(s.last_run_at)}</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {s.dashboard_id && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                <LayoutDashboard className="w-2.5 h-2.5" />{getDashboardName(s.dashboard_id)}
                              </span>
                            )}
                            {channels.map((ch, i) => {
                              const Icon = CHANNEL_ICONS[ch.type] || Mail
                              return (
                                <span key={i} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                  <Icon className="w-2.5 h-2.5" />{ch.type}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setTab('runs') }} title="View run history"
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all" style={{ color: 'var(--text-muted)' }}>
                          <BarChart2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => isEditing ? closeEdit() : openEdit(s)} title={isEditing ? 'Close editor' : 'Edit schedule'}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isEditing ? 'bg-[#e94560]/10 text-[#e94560]' : 'hover:bg-white/5'}`}
                          style={!isEditing ? { color: 'var(--text-muted)' } : undefined}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleActive(s._id, s.is_active)} title={s.is_active ? 'Pause' : 'Resume'}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all" style={{ color: 'var(--text-muted)' }}>
                          {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDeleteTarget(s)} title="Delete"
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all" style={{ color: 'var(--text-muted)' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Edit drawer */}
          {editTarget && (
            <div className="w-96 shrink-0 card p-6 space-y-5 animate-[slide-up_0.25s_ease-out] sticky top-6" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Edit Schedule</h3>
                  <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{editTarget.name}</p>
                </div>
                <button onClick={closeEdit} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleUpdate} className="space-y-5">
                <ScheduleFormBody form={editForm} setForm={setEditForm} dashboards={dashboards} />
                <div className="flex items-center justify-between py-3 px-4 rounded-xl border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Active</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Runs automatically when active</p>
                  </div>
                  <button type="button" onClick={() => toggleActive(editTarget._id, editTarget.is_active)}
                    className={`relative rounded-full transition-colors ${editTarget.is_active ? 'bg-green-500' : 'bg-gray-600'}`}
                    style={{ width: 40, height: 22 }}>
                    <span className="absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform"
                      style={{ width: 18, height: 18, transform: editTarget.is_active ? 'translateX(18px)' : 'translateX(0)' }} />
                  </button>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#e94560]/90 transition-all">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(editTarget)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all border"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── RUN HISTORY TAB ── */}
      {tab === 'runs' && (
        <RunHistoryGrid
          runs={runs}
          schedules={schedules}
          loading={runsLoading}
          onRefresh={fetchRuns}
          onJumpToSchedule={id => { setTab('schedules'); setEditTarget(schedules.find(s => s._id === id) || null) }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Schedule"
        message={`Delete "${deleteTarget?.name}"? This will immediately stop all automated delivery.`}
        confirmText="Delete Schedule"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
