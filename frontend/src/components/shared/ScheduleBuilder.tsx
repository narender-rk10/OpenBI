/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react'
import { Clock, RefreshCw } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type Recurrence = 'minute' | 'hour' | 'day' | 'week' | 'month'

interface ScheduleState {
  recurrence: Recurrence
  every: number       // interval (every N units)
  atMinute: number    // 0–59
  atHour: number      // 0–23
  daysOfWeek: number[] // 0=Sun … 6=Sat
  dayOfMonth: number  // 1–31
}

const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const DAY_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINAL   = (_n: number) => {
  if (_n === 1) return '1st'
  if (_n === 2) return '2nd'
  if (_n === 3) return '3rd'
  return `${_n}th`
}

// ── Cron generation ──────────────────────────────────────────────────────────

function toCron(s: ScheduleState): string {
  const m = s.atMinute.toString()
  const h = s.atHour.toString()
  const { recurrence, every } = s

  switch (recurrence) {
    case 'minute':
      return every <= 1 ? '* * * * *' : `*/${every} * * * *`
    case 'hour':
      return every <= 1 ? `${m} * * * *` : `${m} */${every} * * *`
    case 'day':
      return every <= 1 ? `${m} ${h} * * *` : `${m} ${h} */${every} * *`
    case 'week': {
      const days = s.daysOfWeek.length > 0
        ? [...s.daysOfWeek].sort((a, b) => a - b).join(',')
        : '1'  // default Mon
      // Bi-weekly or more: use day-of-month interval instead (approximate)
      if (every > 1) return `${m} ${h} */${every * 7} * *`
      return `${m} ${h} * * ${days}`
    }
    case 'month':
      return every <= 1
        ? `${m} ${h} ${s.dayOfMonth} * *`
        : `${m} ${h} ${s.dayOfMonth} */${every} *`
  }
}

// ── Cron parsing ─────────────────────────────────────────────────────────────

function parseCron(cron: string): ScheduleState {
  const defaults: ScheduleState = {
    recurrence: 'week', every: 1, atMinute: 0, atHour: 8, daysOfWeek: [1], dayOfMonth: 1,
  }
  try {
    const p = cron.trim().split(/\s+/)
    if (p.length !== 5) return defaults
    const [min, hr, dom, , dow] = p

    const numMin = parseInt(min)
    const numHr  = parseInt(hr)
    const numDom = parseInt(dom)

    // Minute: */N * * * *  or  * * * * *
    if (hr === '*' && dom === '*' && dow === '*') {
      const iMatch = min.match(/^\*\/(\d+)$/)
      return { ...defaults, recurrence: 'minute', every: iMatch ? parseInt(iMatch[1]) : 1 }
    }

    // Hourly: M */N * * *  or  M * * * *
    if (dom === '*' && dow === '*' && !isNaN(numMin)) {
      const iMatch = hr.match(/^\*\/(\d+)$/)
      if (iMatch || hr === '*') {
        return { ...defaults, recurrence: 'hour', every: iMatch ? parseInt(iMatch[1]) : 1, atMinute: numMin }
      }
    }

    // Weekly: M H * * D,D,D
    if (dom === '*' && dow !== '*' && !isNaN(numMin) && !isNaN(numHr)) {
      const days = dow.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6)
      return { ...defaults, recurrence: 'week', every: 1, atMinute: numMin, atHour: numHr, daysOfWeek: days }
    }

    // Monthly: M H D */N *
    if (dow === '*' && !isNaN(numMin) && !isNaN(numHr) && !isNaN(numDom) && numDom >= 1) {
      const mMatch = p[3].match(/^\*\/(\d+)$/)
      return {
        ...defaults,
        recurrence: 'month',
        every: mMatch ? parseInt(mMatch[1]) : 1,
        atMinute: numMin,
        atHour: numHr,
        dayOfMonth: numDom,
      }
    }

    // Daily: M H * * *  or  M H */N * *
    if (dow === '*' && !isNaN(numMin) && !isNaN(numHr)) {
      const iMatch = dom.match(/^\*\/(\d+)$/)
      return {
        ...defaults,
        recurrence: 'day',
        every: iMatch ? parseInt(iMatch[1]) : 1,
        atMinute: numMin,
        atHour: numHr,
      }
    }
  } catch { /* fall through */ }
  return defaults
}

// ── Human-readable label ─────────────────────────────────────────────────────

function toHuman(s: ScheduleState): string {
  const mm = s.atMinute.toString().padStart(2, '0')
  const hh = s.atHour.toString().padStart(2, '0')
  const time = `${hh}:${mm}`
  const { recurrence, every } = s

  switch (recurrence) {
    case 'minute':
      return every <= 1 ? 'Every minute' : `Every ${every} minutes`
    case 'hour':
      return every <= 1
        ? `Every hour at :${mm}`
        : `Every ${every} hours at :${mm}`
    case 'day':
      return every <= 1
        ? `Every day at ${time}`
        : `Every ${every} days at ${time}`
    case 'week': {
      if (every > 1) return `Every ${every} weeks at ${time}`
      const dayNames = [...s.daysOfWeek].sort((a, b) => a - b).map(d => DAY_LONG[d])
      return dayNames.length === 0
        ? `Every week at ${time}`
        : `Every ${dayNames.join(', ')} at ${time}`
    }
    case 'month': {
      const ord = ORDINAL(s.dayOfMonth)
      return every <= 1
        ? `Monthly on the ${ord} at ${time}`
        : `Every ${every} months on the ${ord} at ${time}`
    }
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface ScheduleBuilderProps {
  value: string
  onChange: (cron: string) => void
}

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'minute', label: 'Minute' },
  { value: 'hour',   label: 'Hour'   },
  { value: 'day',    label: 'Day'    },
  { value: 'week',   label: 'Week'   },
  { value: 'month',  label: 'Month'  },
]

/** Converts a cron expression to a human-readable string without mounting the component */
export function cronToHuman(cron: string): string {
  return toHuman(parseCron(cron))
}

export default function ScheduleBuilder({ value, onChange }: ScheduleBuilderProps) {
  const [state, setState] = useState<ScheduleState>(() => parseCron(value || '0 8 * * 1'))

  // When external value changes (e.g. form reset), re-parse
  useEffect(() => {
    if (value) setState(parseCron(value))
  }, [value])

  // Emit cron whenever internal state changes
  const update = useCallback((patch: Partial<ScheduleState>) => {
    setState(prev => {
      const next = { ...prev, ...patch }
      onChange(toCron(next))
      return next
    })
  }, [onChange])

  const toggleDay = (d: number) => {
    const has = state.daysOfWeek.includes(d)
    const next = has
      ? state.daysOfWeek.filter(x => x !== d)
      : [...state.daysOfWeek, d]
    // Always keep at least one day selected
    if (next.length === 0) return
    update({ daysOfWeek: next })
  }

  const cron   = toCron(state)
  const human  = toHuman(state)
  const { recurrence, every } = state

  const showTime    = recurrence !== 'minute'
  const showMinOnly = recurrence === 'hour'
  const showDays    = recurrence === 'week'
  const showDom     = recurrence === 'month'

  const unitLabel: Record<Recurrence, string> = {
    minute: every === 1 ? 'minute' : 'minutes',
    hour:   every === 1 ? 'hour'   : 'hours',
    day:    every === 1 ? 'day'    : 'days',
    week:   every === 1 ? 'week'   : 'weeks',
    month:  every === 1 ? 'month'  : 'months',
  }

  // Helpers
  const sel = (val: string, change: (v: string) => void, children: React.ReactNode) => (
    <select
      value={val}
      onChange={e => change(e.target.value)}
      className="px-2.5 py-1.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560] cursor-pointer"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
    >
      {children}
    </select>
  )

  const numInput = (val: number, change: (v: number) => void, min = 1, max = 99) => (
    <input
      type="number"
      value={val}
      min={min}
      max={max}
      onChange={e => {
        const n = Math.max(min, Math.min(max, parseInt(e.target.value) || min))
        change(n)
      }}
      className="w-16 px-2.5 py-1.5 rounded-lg border text-sm text-center outline-none focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
    />
  )

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}
    >
      {/* Row 1: Recurrence type + interval */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Recurrence</span>
          {sel(
            recurrence,
            v => update({ recurrence: v as Recurrence }),
            RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Every</span>
          <div className="flex items-center gap-2">
            {numInput(every, v => update({ every: v }), 1, recurrence === 'minute' ? 59 : recurrence === 'hour' ? 23 : 31)}
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{unitLabel[recurrence]}</span>
          </div>
        </div>
      </div>

      {/* Row 2: Time picker */}
      {showTime && (
        <div className="flex flex-wrap items-center gap-3">
          {showMinOnly ? (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>At minute</span>
              {sel(
                state.atMinute.toString(),
                v => update({ atMinute: parseInt(v) }),
                Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>At hour</span>
                {sel(
                  state.atHour.toString(),
                  v => update({ atHour: parseInt(v) }),
                  Array.from({ length: 24 }, (_, i) => {
                    const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
                    return <option key={i} value={i}>{i.toString().padStart(2, '0')}:00 ({label})</option>
                  })
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>At minute</span>
                {sel(
                  state.atMinute.toString(),
                  v => update({ atMinute: parseInt(v) }),
                  [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(i => (
                    <option key={i} value={i}>:{i.toString().padStart(2, '0')}</option>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Row 3: Days of week (weekly) */}
      {showDays && every === 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>On days</span>
          <div className="flex gap-1.5 flex-wrap">
            {DAY_SHORT.map((label, i) => {
              const active = state.daysOfWeek.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all border ${
                    active
                      ? 'bg-[#e94560] text-white border-[#e94560]'
                      : 'hover:border-[#e94560]/50 hover:text-[#e94560]'
                  }`}
                  style={!active ? { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Row 4: Day of month (monthly) */}
      {showDom && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>On day of month</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => {
              const active = state.dayOfMonth === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => update({ dayOfMonth: d })}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-all border ${
                    active
                      ? 'bg-[#e94560] text-white border-[#e94560]'
                      : 'hover:border-[#e94560]/50 hover:text-[#e94560]'
                  }`}
                  style={!active ? { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : undefined}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview bar */}
      <div
        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-[#e94560] shrink-0" />
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{human}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RefreshCw className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <code
            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'var(--bg-secondary)', color: '#7dd3fc', border: '1px solid var(--border-color)' }}
          >
            {cron}
          </code>
        </div>
      </div>
    </div>
  )
}
