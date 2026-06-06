/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { X, Database, BarChart3, Table2, Hash, Sparkles, Play, Loader2 } from 'lucide-react'
import api from '../../lib/api'

interface Connection {
  _id: string
  name: string
  engine: string
  tables?: string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  projectId: string
  dashboardId: string
  onAdded: () => void
}

type Step = 'source' | 'query' | 'preview' | 'type'

export default function AddWidgetModal({ isOpen, onClose, projectId, dashboardId, onAdded }: Props) {
  const [step, setStep] = useState<Step>('source')
  const [connections, setConnections] = useState<Connection[]>([])
  const [conn, setConn] = useState<Connection | null>(null)
  const [sql, setSql] = useState<string>('')
  const [preview, setPreview] = useState<{ columns: string[]; rows: any[][] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [displayType, setDisplayType] = useState<'chart' | 'table' | 'kpi' | 'ai_summary'>('chart')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep('source')
    setConn(null)
    setSql('')
    setPreview(null)
    setPreviewErr(null)
    setTitle('')
    api
      .get(`/api/projects/${projectId}/connections`)
      .then((r) => setConnections(r.data))
      .catch(() => setConnections([]))
  }, [isOpen, projectId])

  if (!isOpen) return null

  const onPickConnection = (c: Connection) => {
    setConn(c)
    setSql(`SELECT * FROM ${c.name}.${c.tables?.[0] || 'your_table'} LIMIT 100`)
    setStep('query')
  }

  const runPreview = async () => {
    if (!sql.trim()) return
    setPreviewing(true)
    setPreviewErr(null)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/sql/query`, { query: sql })
      setPreview({ columns: data.columns || data.column_names || [], rows: data.rows || data.data || [] })
      setStep('preview')
    } catch (err: any) {
      setPreviewErr(err.response?.data?.detail || 'Query failed')
    } finally {
      setPreviewing(false)
    }
  }

  const submit = async () => {
    if (!preview) return
    setSubmitting(true)
    try {
      let chart_config: any = null
      if (displayType === 'chart') {
        try {
          const { data } = await api.post(`/api/projects/${projectId}/charts/generate`, {
            columns: preview.columns,
            rows: preview.rows,
            instruction: 'auto',
          })
          chart_config = data.chart_config || data
        } catch {
          /* generation is best-effort */
        }
      }
      await api.post(`/api/projects/${projectId}/dashboards/${dashboardId}/widgets`, {
        source_type: 'manual',
        data_binding: { query: sql, connection_id: conn?._id },
        display_type: displayType,
        chart_config,
        title: title || `Widget ${Date.now()}`,
        position: { x: 0, y: 100, w: 6, h: 4 },
      })
      // Seed cached_data via refresh so the widget renders immediately
      onAdded()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#e94560]" />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Add widget</h3>
          </div>
          <div className="flex items-center gap-3">
            <StepDots current={step} />
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-auto flex-1">
          {step === 'source' && (
            <div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Pick a data source.</p>
              {connections.length === 0 ? (
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No connections yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {connections.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => onPickConnection(c)}
                      className="text-left p-3 rounded-lg border hover:border-[#e94560] hover:bg-[#e94560]/5 transition-all"
                      style={{ borderColor: 'var(--border-color)' }}
                    >
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {c.engine} · {c.tables?.length || 0} tables
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'query' && conn && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                SQL against <span className="font-mono text-[#e94560]">{conn.name}</span>
              </p>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none resize-none"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              />
              {previewErr && <p className="text-xs text-red-500">{previewErr}</p>}
              <div className="flex justify-between">
                <button onClick={() => setStep('source')} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                  ← back
                </button>
                <button
                  onClick={runPreview}
                  disabled={previewing || !sql.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 disabled:opacity-50"
                >
                  {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Run preview
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {preview.rows.length} rows · {preview.columns.length} columns
              </p>
              <div className="rounded-lg border overflow-auto max-h-64" style={{ borderColor: 'var(--border-color)' }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: 'var(--bg-secondary)' }}>
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                        {r.map((cell, j) => (
                          <td key={j} className="px-2 py-1 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                            {cell === null || cell === undefined ? '—' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep('query')} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                  ← back to SQL
                </button>
                <button
                  onClick={() => setStep('type')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90"
                >
                  Choose display →
                </button>
              </div>
            </div>
          )}

          {step === 'type' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Widget"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Display as</label>
                <div className="grid grid-cols-2 gap-2">
                  <DisplayTypeBtn icon={BarChart3} label="Chart" active={displayType === 'chart'} onClick={() => setDisplayType('chart')} />
                  <DisplayTypeBtn icon={Table2} label="Table" active={displayType === 'table'} onClick={() => setDisplayType('table')} />
                  <DisplayTypeBtn icon={Hash} label="KPI" active={displayType === 'kpi'} onClick={() => setDisplayType('kpi')} />
                  <DisplayTypeBtn icon={Sparkles} label="AI Summary" active={displayType === 'ai_summary'} onClick={() => setDisplayType('ai_summary')} />
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('preview')} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                  ← back
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Add to dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDots({ current }: { current: Step }) {
  const order: Step[] = ['source', 'query', 'preview', 'type']
  return (
    <div className="flex items-center gap-1">
      {order.map((s) => (
        <span
          key={s}
          className={`w-1.5 h-1.5 rounded-full ${s === current ? 'bg-[#e94560]' : 'bg-white/20'}`}
        />
      ))}
    </div>
  )
}

function DisplayTypeBtn({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
        active ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]' : 'hover:bg-white/5'
      }`}
      style={!active ? { borderColor: 'var(--border-color)', color: 'var(--text-primary)' } : undefined}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
