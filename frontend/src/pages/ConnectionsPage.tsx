/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Database, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, ChevronRight, Search, Loader2, Table, X, Filter, Eye } from 'lucide-react'
import api from '../lib/api'
import { SOURCE_CATALOG } from '../lib/sources'
import type { Connection, SourceDefinition } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import DataTableModal from '../components/shared/DataTableModal'

export default function ConnectionsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [showCatalog, setShowCatalog] = useState(false)
  const [selectedSource, setSelectedSource] = useState<SourceDefinition | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [connName, setConnName] = useState('')
  const [creating, setCreating] = useState(false)
  const [testing, setTesting] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [testDetail, setTestDetail] = useState<string>('')
  const [expandedConn, setExpandedConn] = useState<string | null>(null)
  const [catalogFilter, setCatalogFilter] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [detecting, setDetecting] = useState<string | null>(null)
  const [detectResult, setDetectResult] = useState<{ table: string; filters: any[]; chart: any } | null>(null)
  const [preview, setPreview] = useState<{ title: string; subtitle: string; columns: string[]; rows: any[][] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

  // Look up the catalog definition (icon/colour) for an engine.
  const sourceDef = (engine: string) => SOURCE_CATALOG.find(s => s.engine === engine)

  const openTablePreview = async (conn: Connection, table: string) => {
    setPreviewLoading(`${conn._id}:${table}`)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/sql/query`, {
        query: `SELECT * FROM ${conn.mindsdb_db_name}.${table} LIMIT 100`,
        limit: 100,
      })
      setPreview({
        title: `${conn.name} · ${table}`,
        subtitle: `First ${Math.min(100, (data.rows || []).length)} rows from ${conn.engine}`,
        columns: data.columns || [],
        rows: data.rows || [],
      })
    } catch (err: any) {
      setToast({ message: err.response?.data?.detail || 'Failed to load table data', type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setPreviewLoading(null)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [projectId])

  const [error, setError] = useState<string | null>(null)

  const fetchConnections = async () => {
    try {
      setError(null)
      const { data } = await api.get(`/api/projects/${projectId}/connections`)
      setConnections(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load connections')
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!selectedSource) return
    setTesting(true)
    setTestResult(null)
    setTestDetail('')
    try {
      const { data } = await api.post(`/api/projects/${projectId}/connections/test`, {
        engine: selectedSource.engine,
        parameters: formValues,
      })
      if (data.status === 'success') {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestDetail(data.detail || data.error || 'Connection failed. Check credentials.')
      }
    } catch (err: any) {
      setTestResult('error')
      setTestDetail(err.response?.data?.detail || 'Could not reach the server.')
    } finally {
      setTesting(false)
    }
  }

  const validateForm = (): boolean => {
    if (!selectedSource) return false
    const errors: Record<string, string> = {}
    if (!connName.trim()) errors['connName'] = 'Connection name is required'
    for (const field of selectedSource.fields) {
      if (field.required && !formValues[field.name]?.trim()) {
        errors[field.name] = `${field.label} is required`
      }
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSource || !validateForm()) return
    setCreating(true)
    try {
      await api.post(`/api/projects/${projectId}/connections`, {
        name: connName,
        engine: selectedSource.engine,
        category: selectedSource.category,
        parameters: formValues,
      })
      setSelectedSource(null)
      setFormValues({})
      setConnName('')
      setShowCatalog(false)
      fetchConnections()
    } catch (err: any) {
      setToast({ message: err.response?.data?.detail || 'Connection failed', type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, conn: Connection) => {
    e.stopPropagation()
    setDeleteTarget(conn)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/connections/${deleteTarget._id}`)
      fetchConnections()
    } catch { /* ignore */ }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  const detectFilters = async (connId: string, table: string) => {
    setDetecting(`${connId}:${table}`)
    setDetectResult(null)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/connections/${connId}/detect-filters`, {
        table,
        sample_size: 200,
      })
      setDetectResult({ table, filters: data.filters || [], chart: data.chart_suggestion })
    } catch (err: any) {
      setToast({ message: err.response?.data?.detail || 'Filter detection failed', type: 'error' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setDetecting(null)
    }
  }

  const refreshTables = async (connId: string) => {
    try {
      const { data } = await api.get(`/api/projects/${projectId}/connections/${connId}/tables`)
      setConnections(prev =>
        prev.map(c => c._id === connId ? { ...c, tables: data } : c)
      )
    } catch { /* ignore */ }
  }

  const filteredSources = SOURCE_CATALOG.filter(s =>
    s.name.toLowerCase().includes(catalogFilter.toLowerCase()) ||
    s.category.toLowerCase().includes(catalogFilter.toLowerCase())
  )

  const groupedSources = filteredSources.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, SourceDefinition[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  const totalTables = connections.reduce((s, c) => s + (c.tables?.length || 0), 0)
  const connectedCount = connections.filter(c => c.status === 'connected').length

  return (
    <div className="max-w-5xl mx-auto animate-[fade-in_0.5s_ease-out]">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-[slide-up_0.3s_ease-out] ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Database className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Data Sources</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Connect databases, APIs, and files to query with AI.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Stats chips */}
          {connections.length > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {connectedCount}/{connections.length} connected
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full border font-medium" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                {totalTables} tables
              </span>
            </div>
          )}
          <button
            id="add-connection-btn"
            onClick={() => { setShowCatalog(!showCatalog); setSelectedSource(null) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Source
          </button>
        </div>
      </div>

      {/* Source Catalog */}
      {showCatalog && !selectedSource && (
        <div className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Choose a Data Source</h2>
            <button onClick={() => setShowCatalog(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text" value={catalogFilter} onChange={(e) => setCatalogFilter(e.target.value)}
              placeholder="Search sources..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>

          {Object.entries(groupedSources).map(([category, sources]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{category}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {sources.map((source) => (
                  <button
                    key={source.engine}
                    onClick={() => { setSelectedSource(source); setConnName(source.name) }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border text-left text-sm font-medium transition-all hover:border-[#e94560]/50 hover:bg-[#e94560]/5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <span className="text-xl">{source.icon}</span>
                    {source.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connection Form */}
      {selectedSource && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{selectedSource.icon}</span>
              <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                Connect to {selectedSource.name}
              </h2>
            </div>
            <button type="button" onClick={() => setSelectedSource(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Connection Name</label>
              <input
                type="text" value={connName} onChange={(e) => setConnName(e.target.value)}
                placeholder="My Database" required
                className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              />
            </div>

            {selectedSource.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  {field.label} {field.required && <span className="text-[#e94560]">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={formValues[field.name] || ''}
                    onChange={(e) => { setFormValues({ ...formValues, [field.name]: e.target.value }); setValidationErrors(prev => { const n = {...prev}; delete n[field.name]; return n }) }}
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={3}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none resize-none focus:ring-2 focus:ring-[#e94560]/30 ${validationErrors[field.name] ? 'border-red-500' : ''}`}
                    style={{ background: 'var(--bg-secondary)', borderColor: validationErrors[field.name] ? '#ef4444' : 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                ) : (
                  <input
                    type={field.type} value={formValues[field.name] || ''}
                    onChange={(e) => { setFormValues({ ...formValues, [field.name]: e.target.value }); setValidationErrors(prev => { const n = {...prev}; delete n[field.name]; return n }) }}
                    placeholder={field.placeholder}
                    required={field.required}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30 ${validationErrors[field.name] ? 'border-red-500' : ''}`}
                    style={{ background: 'var(--bg-secondary)', borderColor: validationErrors[field.name] ? '#ef4444' : 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                )}
                {validationErrors[field.name] && (
                  <p className="text-xs text-red-400 mt-1">{validationErrors[field.name]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${
              testResult === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {testResult === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult === 'success' ? 'Connection successful!' : (testDetail || 'Connection failed. Check credentials.')}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={handleTest} disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Test
            </button>
            <button type="submit" disabled={creating}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Connect
            </button>
          </div>
        </form>
      )}

      {/* Connection List */}
      {connections.length === 0 && !showCatalog ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(99,102,241,0.08)' }}>
            <Database className="w-8 h-8 text-indigo-400 opacity-60" />
          </div>
          <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>No data sources yet</h3>
          <p className="text-sm mb-6 text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
            Connect a database, API, or file storage to start querying with AI.
          </p>
          <button
            onClick={() => setShowCatalog(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20"
          >
            <Plus className="w-4 h-4" />
            Add Your First Data Source
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const def = sourceDef(conn.engine)
            const isExpanded = expandedConn === conn._id
            const isOnline = conn.status === 'connected'

            return (
              <div
                key={conn._id}
                className="rounded-2xl border overflow-hidden transition-all duration-200"
                style={{ background: 'var(--bg-card)', borderColor: isExpanded ? 'rgba(99,102,241,0.3)' : 'var(--border-color)' }}
              >
                {/* Card header row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer group/card"
                  onClick={() => setExpandedConn(isExpanded ? null : conn._id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Icon */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl shadow-sm" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                      {def?.icon || <Database className="w-5 h-5 text-indigo-400" />}
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{conn.name}</h3>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                          {conn.engine}
                        </span>
                        <span className={`flex items-center gap-1 text-[11px] font-medium ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {isOnline ? 'Connected' : conn.status}
                        </span>
                        {(conn.tables?.length || 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            <Table className="w-3 h-3" />
                            {conn.tables!.length} {conn.tables!.length === 1 ? 'table' : 'tables'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); refreshTables(conn._id) }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      title="Refresh tables"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(e, conn)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete connection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 mx-1" style={{ background: 'var(--border-color)' }} />
                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </div>
                </div>

                {/* Expanded: table list */}
                {isExpanded && conn.tables && (
                  <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-3" style={{ color: 'var(--text-muted)' }}>Tables</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {conn.tables.map((table) => (
                        <div
                          key={table}
                          onClick={() => openTablePreview(conn, table)}
                          className="flex items-center justify-between gap-1 px-3 py-2.5 rounded-xl text-xs group cursor-pointer transition-all hover:shadow-sm"
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                          title={`Preview ${table}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {previewLoading === `${conn._id}:${table}`
                              ? <Loader2 className="w-3 h-3 shrink-0 animate-spin text-indigo-400" />
                              : <Table className="w-3 h-3 shrink-0 text-indigo-400 opacity-70" />}
                            <span className="truncate font-medium">{table}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            <button
                              onClick={(e) => { e.stopPropagation(); detectFilters(conn._id, table) }}
                              disabled={detecting === `${conn._id}:${table}`}
                              title="Detect filters with AI"
                            >
                              {detecting === `${conn._id}:${table}`
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e94560]" />
                                : <Filter className="w-3.5 h-3.5 text-[#e94560]" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Filter detection result */}
      {detectResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetectResult(null)} />
          <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#e94560]" />
                <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Suggested filters for {detectResult.table}</h3>
              </div>
              <button onClick={() => setDetectResult(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-auto">
              {detectResult.chart && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>SUGGESTED CHART</p>
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{detectResult.chart.chart_type}</p>
                </div>
              )}
              {detectResult.filters.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No filter candidates detected.</p>
              ) : (
                <div className="space-y-2">
                  {detectResult.filters.map((f: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.column}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#e94560]/10 text-[#e94560]">{f.type}</span>
                      </div>
                      {f.options && (
                        <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                          {f.options.length} options: {f.options.slice(0, 5).join(', ')}{f.options.length > 5 ? '…' : ''}
                        </p>
                      )}
                      {(f.min !== undefined && f.max !== undefined) && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Range: {f.min} → {f.max}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Data preview modal */}
      {preview && (
        <DataTableModal
          title={preview.title}
          subtitle={preview.subtitle}
          columns={preview.columns}
          rows={preview.rows}
          accent="#0f3460"
          onClose={() => setPreview(null)}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Connection"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? You will not be able to query this data source anymore.`}
        confirmText="Delete Connection"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
