/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { X, Search, Table as TableIcon, Loader2, Download } from 'lucide-react'

interface DataTableModalProps {
  title: string
  subtitle?: string
  columns: string[]
  rows: any[][]
  loading?: boolean
  accent?: string
  onClose: () => void
}

function isNumeric(v: any) {
  if (v === null || v === undefined || v === '') return false
  return !isNaN(Number(v))
}

function fmtCell(v: any) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (isNumeric(v) && String(v).trim() !== '' && !/^0\d/.test(String(v)))
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return String(v)
}

export default function DataTableModal({
  title, subtitle, columns, rows, loading, accent = '#0f3460', onClose,
}: DataTableModalProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const downloadCsv = () => {
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [columns.map(esc).join(','), ...filtered.map(r => r.map(esc).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-5xl rounded-xl border flex flex-col shadow-2xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)', maxHeight: '88vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + '22' }}>
                <TableIcon className="w-4 h-4" style={{ color: accent }} />
              </div>
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{title}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: '#10b981' + '15', color: '#10b981' }}>
                Live data
              </span>
            </div>
            {subtitle && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#e94560]/10 transition-colors shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rows…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none focus:ring-2"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {filtered.length.toLocaleString()}{search ? ` / ${rows.length.toLocaleString()}` : ''} rows · {columns.length} cols
            </span>
            <button
              onClick={downloadCsv} disabled={!rows.length}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/5 transition-all disabled:opacity-40"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading data…</span>
            </div>
          ) : columns.length === 0 ? (
            <p className="text-sm text-center py-20" style={{ color: 'var(--text-muted)' }}>No data returned.</p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border-b w-10"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>#</th>
                  {columns.map((c, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, ri) => (
                  <tr key={ri} className="hover:bg-white/[0.03] transition-colors" style={ri % 2 ? { background: 'var(--bg-secondary)' } : undefined}>
                    <td className="px-3 py-1.5 border-b tabular-nums" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci}
                        className={`px-3 py-1.5 border-b whitespace-nowrap max-w-xs truncate ${isNumeric(cell) ? 'text-right tabular-nums' : ''}`}
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                        title={cell === null || cell === undefined ? '' : String(cell)}>
                        {fmtCell(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
