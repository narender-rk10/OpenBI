import { TrendingUp, TrendingDown } from 'lucide-react'

interface KPICardProps {
  title: string
  data?: { columns: string[]; rows: any[][] }
  className?: string
}

/** First-column-of-first-row is the value; first-column-of-second-row (if present)
 *  is the comparison value used to compute the delta. */
export default function KPICard({ title, data, className = '' }: KPICardProps) {
  const value = data?.rows?.[0]?.[0]
  const prev = data?.rows?.[1]?.[0]

  let deltaPct: number | null = null
  if (typeof value === 'number' && typeof prev === 'number' && prev !== 0) {
    deltaPct = ((value - prev) / Math.abs(prev)) * 100
  }

  const display = formatValue(value)

  return (
    <div className={`h-full flex flex-col justify-between p-1.5 ${className}`}>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {display}
          </span>
          {deltaPct !== null && (
            <span className={`text-[10px] font-bold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${deltaPct >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              {deltaPct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {title} Overview
      </span>
    </div>
  )
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
    return v.toLocaleString()
  }
  return String(v)
}
