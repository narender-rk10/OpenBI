/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface S2TableProps {
  columns: string[]
  rows: any[][]
  height?: number
  tableConfig?: S2TableConfig
  className?: string
}

interface S2TableConfig {
  fields?: { rows?: string[]; columns?: string[]; values?: string[] }
  hiddenColumns?: string[]
  sortParams?: Array<{ sortFieldId: string; sortMethod: 'ASC' | 'DESC' }>
  conditions?: {
    background?: ConditionRule[]
    text?: ConditionRule[]
  }
  meta?: Array<{ field: string; name?: string; formatter?: string }>
  isPivot?: boolean
  changes_made?: string
}

interface ConditionRule {
  field: string
  operator: '>' | '<' | '>=' | '<=' | '=' | 'contains'
  value: number | string
  fill?: string
  textColor?: string
}

function evalRule(rule: ConditionRule, value: any): boolean {
  const nv = Number(value), nr = Number(rule.value), sv = String(value ?? '')
  switch (rule.operator) {
    case '>':  return !isNaN(nv) && !isNaN(nr) && nv > nr
    case '<':  return !isNaN(nv) && !isNaN(nr) && nv < nr
    case '>=': return !isNaN(nv) && !isNaN(nr) && nv >= nr
    case '<=': return !isNaN(nv) && !isNaN(nr) && nv <= nr
    case '=':  return sv === String(rule.value)
    case 'contains': return sv.toLowerCase().includes(String(rule.value).toLowerCase())
    default: return false
  }
}

function formatValue(value: any, formatter?: string): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (formatter === 'currency' && !isNaN(num))
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
  if (formatter === 'percent' && !isNaN(num)) return `${(num * 100).toFixed(1)}%`
  if (formatter === 'number' && !isNaN(num)) return num.toLocaleString()
  return String(value)
}

export default function AntVS2Table({
  columns,
  rows,
  height = 360,
  tableConfig,
  className = '',
}: S2TableProps) {
  const [sortCol, setSortCol] = useState<string | null>(
    tableConfig?.sortParams?.[0]?.sortFieldId ?? null,
  )
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(
    tableConfig?.sortParams?.[0]?.sortMethod ?? 'ASC',
  )

  const hiddenSet = useMemo(() => new Set(tableConfig?.hiddenColumns ?? []), [tableConfig])
  const metaMap = useMemo(() => {
    const m: Record<string, NonNullable<S2TableConfig['meta']>[number]> = {}
    for (const e of tableConfig?.meta ?? []) m[e.field] = e
    return m
  }, [tableConfig])

  const visibleCols = useMemo(() => columns.filter(c => !hiddenSet.has(c)), [columns, hiddenSet])

  const dataObjects = useMemo(
    () => rows.map(row => {
      const obj: Record<string, any> = {}
      columns.forEach((c, i) => { obj[c] = row[i] })
      return obj
    }),
    [rows, columns],
  )

  const sorted = useMemo(() => {
    if (!sortCol) return dataObjects
    return [...dataObjects].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      const an = Number(av), bn = Number(bv)
      const cmp = !isNaN(an) && !isNaN(bn)
        ? an - bn
        : String(av ?? '').localeCompare(String(bv ?? ''))
      return sortDir === 'ASC' ? cmp : -cmp
    })
  }, [dataObjects, sortCol, sortDir])

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortCol(col)
      setSortDir('ASC')
    }
  }

  const bgRules  = tableConfig?.conditions?.background ?? []
  const txtRules = tableConfig?.conditions?.text ?? []

  const getCellStyle = (col: string, val: any): React.CSSProperties => {
    const style: React.CSSProperties = {}
    for (const r of bgRules)  if (r.field === col && evalRule(r, val)) style.background = r.fill ?? 'rgba(239,68,68,0.15)'
    for (const r of txtRules) if (r.field === col && evalRule(r, val)) style.color = r.textColor ?? '#dc2626'
    return style
  }

  const exportCSV = () => {
    const lines = [
      visibleCols.join(','),
      ...sorted.map(obj =>
        visibleCols.map(c => {
          const v = obj[c]; if (v === null || v === undefined) return ''
          const s = String(v)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }).join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'export.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`} style={{ height }}>
      {/* Toolbar */}
      <div className="flex justify-end shrink-0">
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-white/5 transition-all"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
        >
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg" style={{ minHeight: 0 }}>
        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
              {visibleCols.map(col => {
                const m    = metaMap[col]
                const name = m?.name ?? col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                const isS  = sortCol === col
                return (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="px-3 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap group"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}
                  >
                    <span className="flex items-center gap-1">
                      {name}
                      {isS
                        ? sortDir === 'ASC'
                          ? <ChevronUp   className="w-3 h-3 text-[#e94560]" />
                          : <ChevronDown className="w-3 h-3 text-[#e94560]" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-30 transition-opacity" />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((obj, ri) => (
              <tr
                key={ri}
                className="transition-colors hover:bg-white/[0.03]"
                style={{
                  background: ri % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                {visibleCols.map(col => {
                  const m   = metaMap[col]
                  const raw = obj[col]
                  const fmt = formatValue(raw, m?.formatter)
                  const cs  = getCellStyle(col, raw)
                  const isNum = !isNaN(Number(raw)) && raw !== null && raw !== ''
                  return (
                    <td
                      key={col}
                      className="px-3 py-2 whitespace-nowrap tabular-nums"
                      style={{
                        color: cs.color ?? 'var(--text-primary)',
                        background: cs.background ?? undefined,
                        textAlign: isNum ? 'right' : 'left',
                      }}
                    >
                      {fmt}
                    </td>
                  )
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
