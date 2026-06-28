/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react'
import { Filter, X, RotateCcw, Calendar, Search, ChevronDown, Plus, Check, Loader2 } from 'lucide-react'
import type { DashboardFilter, Widget } from '../../lib/types'
import api from '../../lib/api'

interface DashboardFiltersProps {
  filters: DashboardFilter[]
  projectId: string
  dashboardId: string
  onFilterChange: (filterId: string, value: any) => void
  onResetAll: () => void
  onRemoveFilter?: (filterId: string) => void
  isEditMode?: boolean
  widgets?: Widget[]
  onAddFilterClick?: () => void
}

// ── Custom dropdown (replaces native <select> so dark mode works) ─────────────
function FilterDropdown({
  options,
  value,
  onChange,
  onOpen,
  loading = false,
  placeholder = 'All',
  multi = false,
}: {
  options: string[]
  value: string | string[] | null
  onChange: (v: string | string[] | null) => void
  onOpen?: () => void
  loading?: boolean
  placeholder?: string
  multi?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = multi
    ? (Array.isArray(value) ? value : [])
    : (value as string | null)

  const label = multi
    ? (selected as string[]).length
      ? (selected as string[]).join(', ')
      : placeholder
    : (selected || placeholder)

  const toggle = (opt: string) => {
    if (!multi) {
      onChange(opt === selected ? null : opt)
      setOpen(false)
    } else {
      const arr = selected as string[]
      const next = arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt]
      onChange(next.length ? next : null)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { if (!open) onOpen?.(); setOpen(v => !v) }}
        className="flex items-center gap-1 text-xs font-medium outline-none cursor-pointer"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="max-w-[120px] truncate">{label}</span>
        {loading
          ? <Loader2 className="w-3 h-3 opacity-50 shrink-0 animate-spin" />
          : <ChevronDown className={`w-3 h-3 opacity-50 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl shadow-xl overflow-hidden min-w-[140px] max-w-[220px] max-h-60 overflow-y-auto"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e94560]" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</span>
            </div>
          ) : (
            <>
              {/* Clear / All option */}
              {!multi && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false) }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors border-b"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}
                >
                  <span>All</span>
                  {!selected && <Check className="w-3 h-3 text-[#e94560]" />}
                </button>
              )}
              {options.map(opt => {
                const isSelected = multi
                  ? (selected as string[]).includes(opt)
                  : selected === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-white/5"
                    style={{ color: isSelected ? '#e94560' : 'var(--text-primary)' }}
                  >
                    <span className="truncate text-left">{opt}</span>
                    {isSelected && <Check className="w-3 h-3 shrink-0 ml-2 text-[#e94560]" />}
                  </button>
                )
              })}
              {options.length === 0 && (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No options</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DashboardFilters({
  filters,
  projectId,
  dashboardId,
  onFilterChange,
  onResetAll,
  onRemoveFilter,
  isEditMode,
  widgets = [],
  onAddFilterClick,
}: DashboardFiltersProps) {
  const [localValues, setLocalValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(filters.map(f => [f.id, f.current_value]))
  )
  // Extra options loaded on-demand from backend (fallback when stored options are empty)
  const [refreshedOptions, setRefreshedOptions] = useState<Record<string, string[]>>({})
  const [loadingFilters, setLoadingFilters] = useState<Record<string, boolean>>({})

  const handleDropdownOpen = async (filterId: string, currentOptions: string[]) => {
    if (currentOptions.length > 0 || refreshedOptions[filterId]) return
    setLoadingFilters(prev => ({ ...prev, [filterId]: true }))
    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/dashboards/${dashboardId}/filters/${filterId}/refresh-options`
      )
      if (data.options?.length) {
        setRefreshedOptions(prev => ({ ...prev, [filterId]: data.options }))
      }
    } catch { /* best-effort */ }
    finally { setLoadingFilters(prev => ({ ...prev, [filterId]: false })) }
  }

  // Keep local state in sync when the filters prop changes (e.g. after a reset
  // or when the parent re-fetches the dashboard).
  useEffect(() => {
    setLocalValues(prev => {
      const next: Record<string, any> = {}
      for (const f of filters) {
        // Only adopt the external value when it differs so we don't stomp an
        // in-flight local edit.
        next[f.id] = f.id in prev ? prev[f.id] : f.current_value
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.map(f => f.id).join(',')])

  // When any filter's current_value comes in as null from the parent (reset),
  // clear the matching local value too.
  useEffect(() => {
    const cleared = filters.filter(f => f.current_value === null && localValues[f.id] !== null)
    if (cleared.length) {
      setLocalValues(prev => {
        const next = { ...prev }
        cleared.forEach(f => { next[f.id] = null })
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.map(f => f.current_value).join('|')])

  const handleChange = (filterId: string, value: any) => {
    setLocalValues(prev => ({ ...prev, [filterId]: value }))
    onFilterChange(filterId, value)
  }

  const handleReset = () => {
    const resetValues = Object.fromEntries(filters.map(f => [f.id, null]))
    setLocalValues(resetValues)
    onResetAll()
  }

  const getFilterOptions = (f: DashboardFilter): string[] => {
    // 1. Live widget cached data (most up-to-date; handles both array and object rows)
    const distinct = new Set<string>()
    ;(widgets || []).forEach(w => {
      const data = w.cached_data
      if (data && Array.isArray(data.columns)) {
        const idx = data.columns.findIndex(c => c.toLowerCase() === f.column.toLowerCase())
        if (idx !== -1 && Array.isArray(data.rows)) {
          data.rows.forEach(r => {
            const v = Array.isArray(r) ? r[idx] : (r as any)?.[data.columns[idx]]
            if (v !== null && v !== undefined && v !== '') distinct.add(String(v))
          })
        }
      }
    })
    if (distinct.size > 0) return Array.from(distinct).sort()

    // 2. On-demand refreshed options fetched from backend
    if (refreshedOptions[f.id]?.length) return refreshedOptions[f.id]

    // 3. Options persisted in the dashboard document
    const stored = f.options
    if (Array.isArray(stored) && stored.length > 0) return stored as string[]

    return []
  }

  return (
    <div
      className="flex items-center gap-2.5 px-5 py-2.5 border-b overflow-x-auto shrink-0"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}
    >
      {/* Filter icon */}
      <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />

      {/* Add Filter button (edit mode) */}
      {isEditMode && onAddFilterClick && (
        <button
          onClick={onAddFilterClick}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold hover:bg-white/5 transition-all shrink-0"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Plus className="w-3 h-3 text-[#e94560]" />
          Add filter
        </button>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {filters.map(f => {
          const options = getFilterOptions(f)
          const currentValue = localValues[f.id]
          const isActive = currentValue !== null && currentValue !== undefined &&
            (Array.isArray(currentValue) ? currentValue.length > 0 : currentValue !== '')

          return (
            <div
              key={f.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs shrink-0 transition-all whitespace-nowrap"
              style={{
                borderColor: isActive ? '#e94560' : 'var(--border-color)',
                background: isActive ? 'rgba(233,69,96,0.06)' : 'var(--bg-secondary)',
              }}
            >
              <span className="font-semibold" style={{ color: isActive ? '#e94560' : 'var(--text-muted)' }}>
                {f.column}:
              </span>

              {/* select → custom dropdown */}
              {f.type === 'select' && (
                <FilterDropdown
                  options={options}
                  value={currentValue ?? null}
                  onChange={v => handleChange(f.id, v)}
                  onOpen={() => handleDropdownOpen(f.id, options)}
                  loading={!!loadingFilters[f.id]}
                />
              )}

              {/* multi_select → custom multi dropdown */}
              {f.type === 'multi_select' && (
                <FilterDropdown
                  options={options}
                  value={currentValue ?? []}
                  onChange={v => handleChange(f.id, v)}
                  onOpen={() => handleDropdownOpen(f.id, options)}
                  loading={!!loadingFilters[f.id]}
                  multi
                  placeholder="Any"
                />
              )}

              {/* date_range */}
              {f.type === 'date_range' && (
                <div className="flex items-center gap-1 font-medium">
                  <Calendar className="w-3 h-3 opacity-50" style={{ color: 'var(--text-primary)' }} />
                  <input
                    type="date"
                    value={currentValue?.start ?? ''}
                    onChange={e => handleChange(f.id, { start: e.target.value, end: currentValue?.end ?? '' })}
                    className="bg-transparent border-0 text-xs outline-none w-24 cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <span className="opacity-40" style={{ color: 'var(--text-primary)' }}>→</span>
                  <input
                    type="date"
                    value={currentValue?.end ?? ''}
                    onChange={e => handleChange(f.id, { start: currentValue?.start ?? '', end: e.target.value })}
                    className="bg-transparent border-0 text-xs outline-none w-24 cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              {/* number_range */}
              {f.type === 'number_range' && (
                <div className="flex items-center gap-1 font-medium">
                  <input
                    type="number"
                    placeholder={(f.options as any)?.min ?? 'min'}
                    value={currentValue?.min ?? ''}
                    onChange={e => handleChange(f.id, { min: e.target.value, max: currentValue?.max ?? '' })}
                    className="bg-transparent border-0 text-xs outline-none"
                    style={{
                      color: 'var(--text-primary)',
                      width: `${Math.max(36, String(currentValue?.min ?? (f.options as any)?.min ?? 'min').length * 8)}px`,
                    }}
                  />
                  <span className="opacity-40" style={{ color: 'var(--text-primary)' }}>–</span>
                  <input
                    type="number"
                    placeholder={(f.options as any)?.max ?? 'max'}
                    value={currentValue?.max ?? ''}
                    onChange={e => handleChange(f.id, { min: currentValue?.min ?? '', max: e.target.value })}
                    className="bg-transparent border-0 text-xs outline-none"
                    style={{
                      color: 'var(--text-primary)',
                      width: `${Math.max(36, String(currentValue?.max ?? (f.options as any)?.max ?? 'max').length * 8)}px`,
                    }}
                  />
                </div>
              )}

              {/* search */}
              {f.type === 'search' && (
                <div className="flex items-center gap-1">
                  <Search className="w-3 h-3 opacity-50" style={{ color: 'var(--text-primary)' }} />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={currentValue ?? ''}
                    onChange={e => handleChange(f.id, e.target.value || null)}
                    className="bg-transparent border-0 text-xs font-medium outline-none w-24"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              {/* Remove button (edit mode) */}
              {isEditMode && onRemoveFilter && (
                <button
                  onClick={() => onRemoveFilter(f.id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-red-500/20 text-red-400 ml-0.5 transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset */}
      {filters.length > 0 && (
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium hover:bg-white/5 transition-all shrink-0 ml-auto border"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      )}
    </div>
  )
}
