/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Activity, Zap, DollarSign, Clock, MessageSquare,
  RefreshCw, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react'
import api from '../lib/api'
import { useTheme } from '../lib/theme'

declare global { interface Window { G2?: any } }
const G2_CDN = 'https://cdn.jsdelivr.net/npm/@antv/g2@5/dist/g2.min.js'
function loadG2(): Promise<void> {
  return new Promise(resolve => {
    if (window.G2) { resolve(); return }
    const s = document.createElement('script')
    s.src = G2_CDN; s.onload = () => resolve()
    document.head.appendChild(s)
  })
}

interface Summary {
  total_calls: number; total_tokens: number; estimated_cost_usd: number
  avg_latency_ms: number; error_count: number; error_rate_pct: number
}
interface AgentStat { agent: string; calls: number; tokens: number; cost: number; errors: number }
interface RoutingStat { source: string; count: number }
interface TsPoint { date: string; queries: number; total_tokens: number; avg_latency_ms: number }
interface Record_ {
  _id: string; timestamp: string; agent_name: string; user_message: string
  assistant_response: string; sql_query?: string; has_data: boolean; row_count: number
  input_tokens: number; output_tokens: number; total_tokens: number
  estimated_cost_usd: number; latency_ms: number; routing_source?: string
  error?: string; provider?: string; model?: string
}

const ROUTING_LABELS: Record<string, string> = {
  at_mention: '@mention', auto_routed: 'Auto-routed', single_agent: 'Single agent',
  continuation: 'Continuation', picker: 'Picker', greeting: 'Greeting', unknown: 'Unknown',
}

export default function ObservabilityPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { isDark } = useTheme()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byAgent, setByAgent] = useState<AgentStat[]>([])
  const [byRouting, setByRouting] = useState<RoutingStat[]>([])
  const [ts, setTs] = useState<TsPoint[]>([])
  const [records, setRecords] = useState<Record_[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterError, setFilterError] = useState(false)

  const queriesRef = useRef<HTMLDivElement>(null)
  const tokensRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)
  const routingRef = useRef<HTMLDivElement>(null)
  const queriesChart = useRef<any>(null)
  const tokensChart = useRef<any>(null)
  const agentChart = useRef<any>(null)
  const routingChart = useRef<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [main, tsSeries] = await Promise.all([
        api.get(`/api/projects/${projectId}/analytics`),
        api.get(`/api/projects/${projectId}/analytics/timeseries`),
      ])
      setSummary(main.data.summary)
      setByAgent(main.data.by_agent || [])
      setByRouting(main.data.by_routing || [])
      setRecords(main.data.records || [])
      setTs(tsSeries.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [projectId])

  const renderChart = (
    container: HTMLDivElement | null, ref: React.MutableRefObject<any>,
    spec: any,
  ) => {
    if (!container || !window.G2) return
    if (ref.current) { try { ref.current.destroy() } catch { /**/ } ref.current = null }
    const chart = new window.G2.Chart({ container, autoFit: true })
    chart.options(spec)
    chart.render()
    ref.current = chart
  }

  const axisStyle = (isDark: boolean) => ({
    labelFill: isDark ? '#94a3b8' : '#374151',
    gridStroke: isDark ? '#334155' : '#e5e7eb',
    lineStroke: isDark ? '#334155' : '#e5e7eb',
  })

  useEffect(() => {
    if (!ts.length) return
    loadG2().then(() => {
      const ax = axisStyle(isDark)
      const lineSpec = (field: string, color: string, label: string) => ({
        type: 'view', data: ts, height: 150,
        theme: { background: 'transparent', color10: [color] },
        axis: {
          x: { ...ax, labelFormatter: (v: string) => v.slice(5) },
          y: { ...ax, title: label, titleFill: ax.labelFill },
        },
        children: [
          { type: 'area', encode: { x: 'date', y: field }, style: { fill: color, fillOpacity: 0.12 } },
          { type: 'line', encode: { x: 'date', y: field }, style: { stroke: color, lineWidth: 2 } },
          { type: 'point', encode: { x: 'date', y: field }, style: { fill: color, r: 3 } },
        ],
      })
      renderChart(queriesRef.current, queriesChart, lineSpec('queries', '#e94560', 'Queries'))
      renderChart(tokensRef.current, tokensChart, lineSpec('total_tokens', '#8b5cf6', 'Tokens'))
    })
  }, [ts, isDark])

  useEffect(() => {
    if (!byAgent.length) return
    loadG2().then(() => {
      const ax = axisStyle(isDark)
      renderChart(agentRef.current, agentChart, {
        type: 'interval', data: [...byAgent].reverse(), height: 200,
        encode: { x: 'agent', y: 'calls', color: 'agent' },
        theme: { background: 'transparent', color10: ['#e94560', '#8b5cf6', '#f59e0b', '#16a34a', '#06b6d4', '#f97316'] },
        axis: { x: { ...ax }, y: { ...ax, title: 'Queries', titleFill: ax.labelFill } },
        legend: false,
      })
    })
  }, [byAgent, isDark])

  useEffect(() => {
    if (!byRouting.length) return
    loadG2().then(() => {
      const ax = axisStyle(isDark)
      renderChart(routingRef.current, routingChart, {
        type: 'interval', data: byRouting, height: 180,
        encode: { x: 'source', y: 'count', color: 'source' },
        theme: { background: 'transparent', color10: ['#e94560', '#8b5cf6', '#f59e0b', '#16a34a', '#06b6d4', '#38bdf8'] },
        axis: { x: { ...ax, labelFormatter: (v: string) => ROUTING_LABELS[v] ?? v }, y: { ...ax } },
        legend: false,
      })
    })
  }, [byRouting, isDark])

  useEffect(() => () => {
    [queriesChart, tokensChart, agentChart, routingChart].forEach(r => {
      if (r.current) { try { r.current.destroy() } catch { /**/ } }
    })
  }, [])

  const fmtCost = (n: number) => n < 0.000001 ? '$0.00' : `$${n.toFixed(6)}`
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const visibleRecords = filterError ? records.filter(r => r.error) : records

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#e94560]/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-[#e94560]" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Chat Analytics</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              All data stored in MongoDB · tokens and cost are word-count estimates
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { icon: MessageSquare, label: 'Total Queries', value: summary?.total_calls?.toLocaleString() ?? '—', color: '#e94560' },
          { icon: Zap, label: 'Est. Tokens', value: summary?.total_tokens?.toLocaleString() ?? '—', color: '#8b5cf6' },
          { icon: DollarSign, label: 'Est. Cost', value: summary ? fmtCost(summary.estimated_cost_usd) : '—', color: '#16a34a' },
          { icon: Clock, label: 'Avg Latency', value: summary ? `${(summary.avg_latency_ms / 1000).toFixed(1)}s` : '—', color: '#f59e0b' },
          { icon: AlertTriangle, label: 'Errors', value: summary?.error_count?.toString() ?? '—', color: '#ef4444' },
          { icon: Activity, label: 'Error Rate', value: summary ? `${summary.error_rate_pct}%` : '—', color: '#f97316' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-2xl p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Time-series charts */}
      {ts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Queries per Day</p>
            <div ref={queriesRef} />
          </div>
          <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Tokens per Day (estimated)</p>
            <div ref={tokensRef} />
          </div>
        </div>
      )}

      {/* Agent + Routing charts */}
      {(byAgent.length > 0 || byRouting.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {byAgent.length > 0 && (
            <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Queries by Agent</p>
              <div ref={agentRef} />
              <div className="mt-2 space-y-1">
                {byAgent.map(a => (
                  <div key={a.agent} className="flex justify-between text-[11px]">
                    <span className="truncate max-w-[55%]" style={{ color: 'var(--text-secondary)' }}>{a.agent}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {a.tokens.toLocaleString()} tok · {fmtCost(a.cost)}
                      {a.errors > 0 && <span className="ml-1 text-red-400">{a.errors} err</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {byRouting.length > 0 && (
            <div className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>How Agent Was Selected</p>
              <div ref={routingRef} />
              <div className="mt-2 space-y-1">
                {byRouting.map(r => (
                  <div key={r.source} className="flex justify-between text-[11px]">
                    <span style={{ color: 'var(--text-secondary)' }}>{ROUTING_LABELS[r.source] ?? r.source}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{r.count} queries</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Query log */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Query Log</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={filterError} onChange={e => setFilterError(e.target.checked)} className="w-3 h-3" />
              Errors only
            </label>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>click row to expand</span>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-muted)' }}>
            {filterError ? 'No errors' : 'No queries yet'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  {['', 'Time', 'Agent', 'How routed', 'User Message', 'Tokens (est.)', 'Cost (est.)', 'Latency', 'Rows', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map(r => (
                  <>
                    <tr key={r._id} onClick={() => setExpanded(expanded === r._id ? null : r._id)}
                      className="cursor-pointer transition-colors hover:bg-white/3"
                      style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {expanded === r._id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtTime(r.timestamp)}</td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{r.agent_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {ROUTING_LABELS[r.routing_source || ''] ?? r.routing_source ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[160px] truncate" style={{ color: 'var(--text-secondary)' }} title={r.user_message}>{r.user_message}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {r.total_tokens.toLocaleString()}
                        <span className="ml-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>({r.input_tokens}↑ {r.output_tokens}↓)</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtCost(r.estimated_cost_usd)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: r.latency_ms > 10000 ? '#f59e0b' : 'var(--text-secondary)' }}>
                        {(r.latency_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: r.has_data ? '#16a34a' : 'var(--text-muted)' }}>
                        {r.has_data ? r.row_count : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.error
                          ? <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Error</span>
                          : <span style={{ color: '#16a34a' }}>OK</span>}
                      </td>
                    </tr>
                    {expanded === r._id && (
                      <tr key={`${r._id}-exp`} style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                        <td colSpan={10} className="px-5 py-3 space-y-2 text-xs">
                          {r.error && (
                            <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[11px]">
                              Error: {r.error}
                            </div>
                          )}
                          <div><span className="font-semibold mr-2" style={{ color: 'var(--text-muted)' }}>Response</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{r.assistant_response || '—'}</span></div>
                          {r.sql_query && (
                            <div><span className="font-semibold mr-2" style={{ color: 'var(--text-muted)' }}>SQL</span>
                              <code style={{ color: '#7dd3fc' }}>{r.sql_query}</code></div>
                          )}
                          <div className="flex gap-4 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {r.provider && <span>Provider: {r.provider}</span>}
                            {r.model && <span>Model: {r.model}</span>}
                            <span>Input: {r.input_tokens} tok</span>
                            <span>Output: {r.output_tokens} tok</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
