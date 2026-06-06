/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ChevronDown, ChevronRight, BarChart3, Code2, Info, Table2,
  Download, LayoutDashboard, ThumbsUp, ThumbsDown, Loader2,
  Copy, Check, ChevronsLeft, ChevronsRight, ChevronLeft, Database, Zap,
} from 'lucide-react'
import AntVG2Chart from '../dashboard/AntVG2Chart'
import api from '../../lib/api'

interface QueryResultCardProps {
  columns: string[]
  rows: any[][]
  sqlQuery?: string
  chartConfig?: any
  agentName?: string
  messageId: string
  onAddToDashboard?: () => void
  generatingChart?: boolean
  aiSummary?: string
  summaryLoading?: boolean
}

type Tab = 'results' | 'chart' | 'sql' | 'description'

export default function QueryResultCard({
  columns,
  rows,
  sqlQuery,
  chartConfig,
  agentName,
  onAddToDashboard,
  generatingChart = false,
  aiSummary,
  summaryLoading,
}: QueryResultCardProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('results')
  const [copiedSql, setCopiedSql] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [detailed, setDetailed] = useState<string | null>(null)
  const [detailedLoading, setDetailedLoading] = useState(false)

  const loadDetailed = async () => {
    if (detailed || detailedLoading) return
    setDetailedLoading(true)
    try {
      const { data } = await api.post('/api/llm/summarize', {
        columns, rows: rows.slice(0, 50), detail: 'detailed',
      })
      setDetailed(data.summary || '')
    } catch { /* surfaced as no-op; brief summary stays */ }
    finally { setDetailedLoading(false) }
  }

  // Auto-switch to chart tab the first time a chart config arrives
  const chartAutoSwitchedRef = useRef(false)
  useEffect(() => {
    if (chartConfig && !chartAutoSwitchedRef.current) {
      chartAutoSwitchedRef.current = true
      setActiveTab('chart')
    }
  }, [chartConfig])

  const sourceName = useMemo(() => {
    if (!sqlQuery) return null
    const m = sqlQuery.match(/FROM\s+[`"']?([\w.]+)[`"']?/i)
    return m ? m[1] : null
  }, [sqlQuery])

  const numericCols = useMemo(() => {
    const s = new Set<number>()
    columns.forEach((_, ci) => {
      const sample = rows.slice(0, 20).map(r => r[ci]).filter(v => v !== null && v !== undefined && v !== '')
      if (!sample.length) return
      const numFrac = sample.filter(v => !isNaN(Number(v))).length / sample.length
      if (numFrac >= 0.8) s.add(ci)
    })
    return s
  }, [columns, rows])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pageEnd = Math.min(page * pageSize, rows.length)
  const pagedRows = rows.slice(pageStart, pageEnd)

  const fmtCell = (val: any, ci: number) => {
    if (val === null || val === undefined) return '—'
    if (numericCols.has(ci)) {
      const n = Number(val)
      if (!isNaN(n)) {
        return n % 1 === 0
          ? n.toLocaleString()
          : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      }
    }
    return String(val)
  }

  const downloadCsv = () => {
    const hdr = columns.join(',')
    const body = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([hdr + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${sourceName || 'query'}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const copySql = async () => {
    if (!sqlQuery) return
    await navigator.clipboard.writeText(sqlQuery)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 2000)
  }

  const tabs: { id: Tab; label: string; Icon: any }[] = [
    { id: 'results',     label: 'Results',     Icon: Table2   },
    { id: 'chart',       label: 'Chart',       Icon: BarChart3 },
    { id: 'sql',         label: 'SQL Query',   Icon: Code2    },
    { id: 'description', label: 'Description', Icon: Info     },
  ]

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden text-left"
      style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
    >
      {/* ── Collapsible header ── */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
        style={{ borderBottom: isOpen ? '1px solid var(--border-color)' : 'none' }}
      >
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />}
        <Database className="w-3.5 h-3.5 shrink-0 text-[#e94560]" />
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {sourceName ? `Queried: ${sourceName}` : 'Query Results'}
        </span>
        <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {rows.length.toLocaleString()} rows · {columns.length} cols
        </span>
        {onAddToDashboard && (
          <button
            onClick={e => { e.stopPropagation(); onAddToDashboard() }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#e94560]/10 text-[#e94560] hover:bg-[#e94560]/20 transition-all ml-2"
          >
            <LayoutDashboard className="w-3 h-3" />
            Add to Dashboard
          </button>
        )}
      </button>

      {isOpen && (
        <>
          {/* ── AI Summary ── */}
          {(aiSummary || summaryLoading) && (
            <div
              className="mx-3 mt-2 px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
              <div className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-[#e94560] shrink-0 mt-0.5" />
                {summaryLoading ? (
                  <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Generating insight...</span>
                ) : (
                  <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>{aiSummary}</p>
                )}
              </div>

              {/* On-demand detailed narrative (exec summary, findings, recommendations) */}
              {aiSummary && !summaryLoading && (
                <div className="mt-1.5 pl-5">
                  {!detailed && (
                    <button
                      onClick={loadDetailed}
                      disabled={detailedLoading}
                      className="text-[11px] font-medium text-[#e94560] hover:underline flex items-center gap-1 disabled:opacity-60"
                    >
                      {detailedLoading
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating detailed insights…</>
                        : 'Detailed insights'}
                    </button>
                  )}
                  {detailed && (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {detailed}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tabs ── */}
          <div
            className="flex items-center gap-0 px-2 border-b mt-2"
            style={{ borderColor: 'var(--border-color)' }}
          >
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
                style={{ color: activeTab === id ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                <Icon className="w-3 h-3" />
                {label}
                {id === 'chart' && generatingChart && (
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-[#e94560]" />
                )}
                {activeTab === id && (
                  <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#e94560] rounded-t-sm" />
                )}
              </button>
            ))}

            {/* Actions in tab bar */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={downloadCsv}
                className="w-7 h-7 rounded-lg flex items-center justify-center border transition-all hover:bg-white/5"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}
                title="Download CSV"
              >
                <Download className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ── Source bar (Results only) ── */}
          {activeTab === 'results' && (agentName || sourceName) && (
            <div
              className="flex items-center px-4 py-1.5 border-b"
              style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-3 text-xs min-w-0">
                {agentName && (
                  <span className="flex items-center gap-1.5 text-green-500 font-medium shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {agentName}
                  </span>
                )}
                {sourceName && (
                  <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                    Source: <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{sourceName}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Tab content ── */}

          {/* Results tab */}
          {activeTab === 'results' && (
            <>
              <div className="overflow-auto" style={{ maxHeight: '360px' }}>
                <table className="w-full border-collapse">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <th
                        className="w-8 px-3 py-2 text-right text-xs font-medium"
                        style={{ color: 'var(--text-muted)', minWidth: '2rem' }}
                      />
                      {columns.map((col, ci) => (
                        <th
                          key={ci}
                          className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${
                            numericCols.has(ci) ? 'text-right' : 'text-left'
                          }`}
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, ri) => (
                      <tr
                        key={ri}
                        className="hover:bg-white/[0.025] transition-colors"
                        style={{
                          borderBottom: ri < pagedRows.length - 1
                            ? '1px solid var(--border-color)'
                            : 'none',
                        }}
                      >
                        <td
                          className="px-3 py-2 text-xs text-right tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {pageStart + ri + 1}
                        </td>
                        {columns.map((_, ci) => (
                          <td
                            key={ci}
                            className={`px-3 py-2 text-xs whitespace-nowrap tabular-nums ${
                              numericCols.has(ci) ? 'text-right' : 'text-left'
                            }`}
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {fmtCell(row[ci], ci)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div
                className="flex items-center justify-between px-4 py-2 border-t"
                style={{ borderColor: 'var(--border-color)' }}
              >
                <div className="flex items-center gap-0.5">
                  <FeedBtn
                    active={feedback === 'up'}
                    activeColor="text-green-500 bg-green-500/10"
                    onClick={() => setFeedback(f => f === 'up' ? null : 'up')}
                    title="Good result"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </FeedBtn>
                  <FeedBtn
                    active={feedback === 'down'}
                    activeColor="text-red-400 bg-red-500/10"
                    onClick={() => setFeedback(f => f === 'down' ? null : 'down')}
                    title="Bad result"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </FeedBtn>
                </div>

                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center gap-1.5">
                    <span>Page Size</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                      className="px-1.5 py-0.5 rounded border text-xs outline-none"
                      style={{
                        background: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <span className="tabular-nums">
                    {(pageStart + 1).toLocaleString()} to {pageEnd.toLocaleString()} of {rows.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <PagBtn onClick={() => setPage(1)} disabled={page === 1} title="First page">
                      <ChevronsLeft className="w-3 h-3" />
                    </PagBtn>
                    <PagBtn onClick={() => setPage(p => p - 1)} disabled={page === 1} title="Previous page">
                      <ChevronLeft className="w-3 h-3" />
                    </PagBtn>
                    <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
                    <PagBtn onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} title="Next page">
                      <ChevronRight className="w-3 h-3" />
                    </PagBtn>
                    <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages} title="Last page">
                      <ChevronsRight className="w-3 h-3" />
                    </PagBtn>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Chart tab */}
          {activeTab === 'chart' && (
            <div className="p-4">
              {generatingChart ? (
                <div className="flex flex-col items-center justify-center h-56 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#e94560]" />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Generating chart…</p>
                </div>
              ) : chartConfig ? (
                <AntVG2Chart config={chartConfig} columns={columns} rows={rows} height={300} />
              ) : (
                <div className="flex flex-col items-center justify-center h-56 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#e94560]" />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Preparing chart…</p>
                </div>
              )}
            </div>
          )}

          {/* SQL tab */}
          {activeTab === 'sql' && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  SQL Query
                </span>
                <button
                  onClick={copySql}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all hover:bg-white/5"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}
                >
                  {copiedSql
                    ? <><Check className="w-3 h-3 text-green-500" /> Copied</>
                    : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              {sqlQuery ? (
                <pre
                  className="text-xs p-3 rounded-xl overflow-x-auto leading-relaxed"
                  style={{
                    background: 'var(--bg-secondary)',
                    color: '#7dd3fc',
                    border: '1px solid var(--border-color)',
                    fontFamily: 'Monaco, Consolas, monospace',
                  }}
                >
                  {sqlQuery}
                </pre>
              ) : (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No SQL query available
                </p>
              )}
            </div>
          )}

          {/* Description tab */}
          {activeTab === 'description' && (
            <div className="p-4">
              <dl className="space-y-2.5">
                {([
                  agentName && { label: 'Agent',   value: agentName },
                  { label: 'Rows',    value: rows.length.toLocaleString() },
                  { label: 'Columns', value: columns.length.toString() },
                  sourceName && { label: 'Source',  value: sourceName },
                  { label: 'Fields',  value: columns.join(', ') },
                ] as any[]).filter(Boolean).map(({ label, value }: any) => (
                  <div key={label} className="flex items-start gap-4">
                    <dt
                      className="text-xs font-medium w-20 shrink-0 pt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {label}
                    </dt>
                    <dd
                      className="text-xs break-words flex-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function PagBtn({
  children, disabled, onClick, title,
}: { children: any; disabled: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-6 h-6 rounded flex items-center justify-center transition-all hover:bg-white/5 disabled:opacity-25"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

function FeedBtn({
  children, active, activeColor, onClick, title,
}: { children: any; active: boolean; activeColor: string; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
        active ? activeColor : 'hover:bg-white/5'
      }`}
      style={!active ? { color: 'var(--text-muted)' } : undefined}
    >
      {children}
    </button>
  )
}
