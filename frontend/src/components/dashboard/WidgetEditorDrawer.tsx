/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ReactNode, useEffect, useState } from 'react'
import { X, Settings2, Save, Loader2, Plus, Trash2 } from 'lucide-react'
import api from '../../lib/api'

interface ConditionalRule {
  column: string
  operator: string
  value: string
  bgColor: string
  textColor: string
}

interface LocalFilter {
  column: string
  operator: string
  value: string
}

interface Widget {
  _id: string
  widget_id: string
  title: string
  display_type: string
  chart_config?: any
  table_config?: any
  data_binding?: any
  auto_refresh?: { enabled: boolean; interval_seconds: number }
  cached_data?: { columns: string[]; rows: any[][] }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  widget: Widget | null
  projectId: string
  dashboardId: string
  onSaved: (updated: Widget) => void
}

const OPERATORS = ['>', '<', '>=', '<=', '=', 'contains']
const FILTER_OPS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE']

export default function WidgetEditorDrawer({ isOpen, onClose, widget, projectId, dashboardId, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [displayType, setDisplayType] = useState('chart')
  const [chartType, setChartType] = useState('auto')
  const [refreshEnabled, setRefreshEnabled] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(300)
  const [cfRules, setCfRules] = useState<ConditionalRule[]>([])
  const [localFilters, setLocalFilters] = useState<LocalFilter[]>([])
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // SQL Query editor states
  const [sqlQuery, setSqlQuery] = useState('')
  const [testingQuery, setTestingQuery] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState<string | null>(null)

  // Manual chart axis config states
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')
  const [colorAxis, setColorAxis] = useState('')

  const columns: string[] = widget?.cached_data?.columns || []

  useEffect(() => {
    if (!widget) return
    setTitle(widget.title || '')
    setDisplayType(widget.display_type || 'chart')
    setChartType(widget.chart_config?.chart_type || 'auto')
    setRefreshEnabled(widget.auto_refresh?.enabled || false)
    setRefreshInterval(widget.auto_refresh?.interval_seconds || 300)
    setCfRules(widget.table_config?.conditionalFormatting || [])
    setLocalFilters(widget.data_binding?.parameters?.filters || [])

    // Initialize query
    setSqlQuery(widget.data_binding?.query || '')
    setTestError(null)
    setTestSuccess(null)

    // Initialize chart axis mapping
    const encode = widget.chart_config?.g2_spec?.encode || {}
    setXAxis(encode.x || '')
    setYAxis(encode.y || '')
    setColorAxis(encode.color || '')
  }, [widget])

  if (!isOpen || !widget) return null

  const save = async () => {
    setSaving(true)
    try {
      const updatedTableConfig = {
        ...(widget.table_config || {}),
        conditionalFormatting: cfRules,
      }
      const updatedDataBinding = {
        ...(widget.data_binding || {}),
        query: sqlQuery,
        parameters: {
          ...(widget.data_binding?.parameters || {}),
          filters: localFilters,
        },
      }

      let updatedChartConfig = widget.chart_config || null
      if (updatedChartConfig) {
        updatedChartConfig = {
          ...updatedChartConfig,
          g2_spec: {
            ...(updatedChartConfig.g2_spec || {}),
            encode: {
              ...(updatedChartConfig.g2_spec?.encode || {}),
              x: xAxis || undefined,
              y: yAxis || undefined,
              color: colorAxis || undefined,
            }
          }
        }
      }

      const { data } = await api.put(
        `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${widget.widget_id}`,
        {
          title,
          display_type: displayType,
          auto_refresh: { enabled: refreshEnabled, interval_seconds: refreshInterval },
          table_config: updatedTableConfig,
          data_binding: updatedDataBinding,
          chart_config: updatedChartConfig,
        },
      )
      onSaved(data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const regenerateChart = async () => {
    setRegenerating(true)
    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${widget.widget_id}/chart-agent`,
        { message: chartType === 'auto' ? 'auto' : `change to ${chartType} chart` },
      )
      onSaved({ ...widget, chart_config: data.chart_config, display_type: 'chart' })
    } finally {
      setRegenerating(false)
    }
  }

  const addCfRule = () =>
    setCfRules(prev => [...prev, { column: columns[0] || '', operator: '>', value: '', bgColor: '#16a34a20', textColor: '#16a34a' }])

  const updateCfRule = (i: number, patch: Partial<ConditionalRule>) =>
    setCfRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const removeCfRule = (i: number) =>
    setCfRules(prev => prev.filter((_, idx) => idx !== i))

  const addLocalFilter = () =>
    setLocalFilters(prev => [...prev, { column: columns[0] || '', operator: '=', value: '' }])

  const updateLocalFilter = (i: number, patch: Partial<LocalFilter>) =>
    setLocalFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  const removeLocalFilter = (i: number) =>
    setLocalFilters(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-[#e94560]" />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Edit widget</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {/* ── Basic settings ── */}
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            />
          </Field>

          {/* ── SQL Query Editor ── */}
          {widget.data_binding?.query !== undefined && (
            <Field label="SQL Query">
              <div className="space-y-2">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none resize-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setTestingQuery(true)
                      setTestError(null)
                      setTestSuccess(null)
                      try {
                        const { data } = await api.post(`/api/projects/${projectId}/sql/query`, { query: sqlQuery })
                        setTestSuccess(`Success! Returned ${data.rows?.length || data.data?.length || 0} rows.`)
                      } catch (err: any) {
                        setTestError(err.response?.data?.detail || 'Query failed')
                      } finally {
                        setTestingQuery(false)
                      }
                    }}
                    disabled={testingQuery || !sqlQuery.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border hover:bg-white/5 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                  >
                    {testingQuery && <Loader2 className="w-3 h-3 animate-spin" />}
                    Test Query
                  </button>
                </div>
                {testError && <p className="text-xs text-red-500">{testError}</p>}
                {testSuccess && <p className="text-xs text-green-500">{testSuccess}</p>}
              </div>
            </Field>
          )}

          <Field label="Display type">
            <select
              value={displayType}
              onChange={(e) => setDisplayType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="chart">Chart</option>
              <option value="table">Table</option>
              <option value="kpi">KPI</option>
              <option value="ai_summary">AI Summary</option>
            </select>
          </Field>

          {displayType === 'chart' && (
            <>
              <Field label="Chart type">
                <div className="flex gap-2">
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="auto">Auto</option>
                    <option value="bar">Bar</option>
                    <option value="column">Column</option>
                    <option value="line">Line</option>
                    <option value="pie">Pie</option>
                    <option value="scatter">Scatter</option>
                    <option value="area">Area</option>
                    <option value="histogram">Histogram</option>
                  </select>
                  <button
                    onClick={regenerateChart}
                    disabled={regenerating}
                    className="px-3 py-2 rounded-lg text-xs font-semibold border hover:bg-white/5 disabled:opacity-50 flex items-center gap-1.5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                  >
                    {regenerating && <Loader2 className="w-3 h-3 animate-spin" />}
                    Apply
                  </button>
                </div>
              </Field>

              <Field label="X Axis Column">
                <select
                  value={xAxis}
                  onChange={(e) => setXAxis(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- select column --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Y Axis Column">
                <select
                  value={yAxis}
                  onChange={(e) => setYAxis(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- select column --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Color / Group Column (optional)">
                <select
                  value={colorAxis}
                  onChange={(e) => setColorAxis(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- select column --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </>
          )}

          <Field label="Auto-refresh">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={refreshEnabled}
                onChange={(e) => setRefreshEnabled(e.target.checked)}
                className="accent-[#e94560]"
              />
              Refresh data automatically
            </label>
            {refreshEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  step={30}
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>seconds</span>
              </div>
            )}
          </Field>

          {/* ── Conditional formatting (tables) ── */}
          {displayType === 'table' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Conditional formatting
                </span>
                <button
                  onClick={addCfRule}
                  className="flex items-center gap-1 text-xs text-[#e94560] hover:opacity-80"
                >
                  <Plus className="w-3 h-3" /> Add rule
                </button>
              </div>
              {cfRules.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No rules. Click "Add rule" to highlight cells.</p>
              )}
              <div className="space-y-2">
                {cfRules.map((rule, i) => (
                  <div key={i} className="p-2 rounded-lg space-y-1.5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div className="flex gap-1.5">
                      {/* Column */}
                      <select
                        value={rule.column}
                        onChange={e => updateCfRule(i, { column: e.target.value })}
                        className="flex-1 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        {columns.length === 0 && <option value="">— no data —</option>}
                      </select>
                      {/* Operator */}
                      <select
                        value={rule.operator}
                        onChange={e => updateCfRule(i, { operator: e.target.value })}
                        className="px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                      {/* Value */}
                      <input
                        value={rule.value}
                        onChange={e => updateCfRule(i, { value: e.target.value })}
                        placeholder="value"
                        className="w-20 px-2 py-1 rounded text-xs outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                      />
                      <button onClick={() => removeCfRule(i)} className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>BG</span>
                        <input type="color" value={rule.bgColor || '#16a34a20'} onChange={e => updateCfRule(i, { bgColor: e.target.value })} className="w-6 h-5 rounded cursor-pointer border-0 p-0" />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>Text</span>
                        <input type="color" value={rule.textColor || '#16a34a'} onChange={e => updateCfRule(i, { textColor: e.target.value })} className="w-6 h-5 rounded cursor-pointer border-0 p-0" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Widget-local filters ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Widget filters
              </span>
              <button
                onClick={addLocalFilter}
                className="flex items-center gap-1 text-xs text-[#e94560] hover:opacity-80"
              >
                <Plus className="w-3 h-3" /> Add filter
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Applied as SQL WHERE conditions on next refresh.
            </p>
            {localFilters.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No local filters.</p>
            )}
            <div className="space-y-2">
              {localFilters.map((f, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <select
                    value={f.column}
                    onChange={e => updateLocalFilter(i, { column: e.target.value })}
                    className="flex-1 px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    {columns.length === 0 && <option value="">—</option>}
                  </select>
                  <select
                    value={f.operator}
                    onChange={e => updateLocalFilter(i, { operator: e.target.value })}
                    className="px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    {FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    value={f.value}
                    onChange={e => updateLocalFilter(i, { value: e.target.value })}
                    placeholder="value"
                    className="w-24 px-2 py-1 rounded text-xs outline-none"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => removeLocalFilter(i)} className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
