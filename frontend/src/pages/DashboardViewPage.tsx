/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Plus, Share2, Download, RefreshCw, Settings2, X, BarChart3,
  Table2, Pencil, GripVertical, ChevronDown, Wifi, WifiOff,
  ArrowLeft, EyeOff, Maximize2, History, FileSliders, Sparkles,
  Minimize2, Loader2,
} from 'lucide-react'
import api from '../lib/api'
import { cn } from '../lib/utils'
import { useLayout } from '../lib/layout'
import type { Widget, Dashboard } from '../lib/types'
import AntVG2Chart from '../components/dashboard/AntVG2Chart'
import AntVS2Table from '../components/dashboard/AntVS2Table'
import KPICard from '../components/dashboard/KPICard'
import AISummaryCard from '../components/dashboard/AISummaryCard'
import DashboardFilters from '../components/dashboard/DashboardFilters'
import DashboardChat from '../components/dashboard/DashboardChat'
import PPTXExportModal from '../components/dashboard/PPTXExportModal'
import ConfirmDialog from '../components/shared/ConfirmDialog'
import ShareDashboardModal from '../components/dashboard/ShareDashboardModal'
import VersionHistoryDrawer from '../components/dashboard/VersionHistoryDrawer'
import AddWidgetModal from '../components/dashboard/AddWidgetModal'
import WidgetEditorDrawer from '../components/dashboard/WidgetEditorDrawer'
import { useWebSocket } from '../hooks/useWebSocket'


declare global {
  interface Window { GridStack: any }
}

export default function DashboardViewPage() {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>()
  const { isDashboardFullView, setDashboardFullView } = useLayout()
  const [isWidgetFullscreen, setIsWidgetFullscreen] = useState(false)

  // Sync full-view states with browser fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setDashboardFullView(false)
        setIsWidgetFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [setDashboardFullView])

  const toggleFullscreen = () => {
    if (!isDashboardFullView) {
      setDashboardFullView(true)
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    } else {
      setDashboardFullView(false)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [widgets, setWidgets] = useState<Widget[]>([])

  const [loading, setLoading] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)

  const [deleteTargetWidgetId, setDeleteTargetWidgetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null)
  const [pptxEditorOpen, setPptxEditorOpen] = useState(false)
  const [addingSummary, setAddingSummary] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshingWidgets, setRefreshingWidgets] = useState<Set<string>>(new Set())
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Add global filter states
  const [addFilterOpen, setAddFilterOpen] = useState(false)
  const [newFilterColumn, setNewFilterColumn] = useState('')
  const [newFilterType, setNewFilterType] = useState<'select' | 'multi_select' | 'date_range' | 'number_range' | 'search'>('select')
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  const [addingFilter, setAddingFilter] = useState(false)
  const [filterSuggestions, setFilterSuggestions] = useState<{ column: string; type: string; reason?: string }[]>([])
  const [suggestingFilters, setSuggestingFilters] = useState(false)

  const handleSuggestFilters = async () => {
    setSuggestingFilters(true)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/dashboards/${dashboardId}/suggest-filters`)
      setFilterSuggestions(data.suggestions || [])
    } catch {
      setFilterSuggestions([])
    } finally {
      setSuggestingFilters(false)
    }
  }

  const applySuggestedFilter = async (s: { column: string; type: string }) => {
    setAddingFilter(true)
    try {
      await api.post(`/api/projects/${projectId}/dashboards/${dashboardId}/filters`, {
        column: s.column,
        type: s.type,
        bound_widget_ids: widgets.map(w => w.widget_id),
      })
      await fetchDashboard()
      setFilterSuggestions(prev => prev.filter(p => p.column !== s.column))
    } catch { /* ignore */ }
    finally { setAddingFilter(false) }
  }

  const handleAddFilter = async () => {
    if (!newFilterColumn) return
    setAddingFilter(true)
    try {
      await api.post(`/api/projects/${projectId}/dashboards/${dashboardId}/filters`, {
        column: newFilterColumn,
        type: newFilterType,
        bound_widget_ids: selectedWidgets.length > 0 ? selectedWidgets : widgets.map(w => w.widget_id),
      })
      await fetchDashboard()
      setAddFilterOpen(false)
      setNewFilterColumn('')
      setSelectedWidgets([])
    } catch {
      /* ignore */
    } finally {
      setAddingFilter(false)
    }
  }

  const handleRemoveFilter = async (filterId: string) => {
    try {
      await api.delete(`/api/projects/${projectId}/dashboards/${dashboardId}/filters/${filterId}`)
      await fetchDashboard()
    } catch {
      /* ignore */
    }
  }

  const allDashboardColumns = Array.from(
    new Set(widgets.flatMap(w => w.cached_data?.columns || []))
  ).sort()

  const gridRef = useRef<HTMLDivElement>(null)
  const gsRef = useRef<any>(null)
  const { isConnected, connect, disconnect, sendMessage: wsSend, lastMessage } = useWebSocket()

  useEffect(() => {
    fetchDashboard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId])

  useEffect(() => {
    if (dashboardId) {
      connect(dashboardId)
      return () => disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId])

  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage
    if (msg.type === 'widget_update') {
      setWidgets(prev => prev.map(w =>
        w.widget_id === msg.widget_id
          ? { ...w, cached_data: msg.data || w.cached_data, chart_config: msg.chart_config || w.chart_config }
          : w
      ))
    }
  }, [lastMessage])

  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async () => {
    try {
      setIsRefreshing(true)
      setRefreshingWidgets(new Set())
      setError(null)
      const { data } = await api.get(`/api/projects/${projectId}/dashboards/${dashboardId}`)
      setDashboard(data)
      const widgetList: Widget[] = data.widgets || []
      setWidgets(widgetList)
      // Auto-refresh widgets that have no cached data (e.g. created via API/script with SQL binding)
      widgetList
        .filter(w => !w.cached_data?.columns?.length && (w.data_binding as any)?.query)
        .forEach(w => refreshWidget(w))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!gridRef.current || !widgets.length) return
    const loadGridstack = async () => {
      if (!window.GridStack) {
        const existing = document.querySelector('script[src*="gridstack"]')
        if (existing) { existing.addEventListener('load', initGrid); return }
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/gridstack@12.5.0/dist/gridstack-all.js'
        script.onload = () => initGrid()
        document.head.appendChild(script)
        if (!document.querySelector('link[href*="gridstack"]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = 'https://cdn.jsdelivr.net/npm/gridstack@12.5.0/dist/gridstack.min.css'
          document.head.appendChild(link)
        }
      } else {
        initGrid()
      }
    }
    loadGridstack()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, isEditMode])

  const initGrid = () => {
    if (gsRef.current) { gsRef.current.destroy(false); gsRef.current = null }
    if (!window.GridStack || !gridRef.current) return

    const gs = window.GridStack.init({
      column: 12, cellHeight: 80, margin: 8, float: false,
      animate: true,
      staticGrid: !isEditMode,
      draggable: { handle: '.widget-drag-handle' },
      resizable: { handles: 'se,sw' },
      disableOneColumnMode: true,
    }, gridRef.current)

    gsRef.current = gs
    gs.batchUpdate()
    widgets.forEach(w => {
      const el = document.getElementById(`gs-${w.widget_id}`)
      if (el) gs.makeWidget(el)
    })
    gs.commit()

    gs.on('resizestop', () => {
      gs.compact()
    })

    gs.on('change', (_: any, items: any[]) => {
      const layout = items.map((item: any) => ({
        widget_id: item.id, x: item.x, y: item.y, w: item.w, h: item.h,
      }))
      api.put(`/api/projects/${projectId}/dashboards/${dashboardId}/layout`, { layout }).catch(() => {})
    })
  }

  const handleFilterChange = async (filterId: string, value: any) => {
    try {
      const { data } = await api.put(
        `/api/projects/${projectId}/dashboards/${dashboardId}/filters/${filterId}`,
        { value }
      )
      if (Array.isArray(data)) {
        setWidgets(prev => prev.map(w => {
          const updated = data.find((u: any) => u.widget_id === w.widget_id)
          if (!updated) return w
          return {
            ...w,
            cached_data: { columns: updated.columns, rows: updated.rows, fetched_at: new Date().toISOString() },
            chart_config: updated.chart_config || w.chart_config,
          }
        }))
      }
      wsSend({ type: 'filter_change', filter_id: filterId, value })
    } catch { /* ignore */ }
  }

  const handleResetFilters = async () => {
    if (!dashboard?.global_filters) return
    for (const f of dashboard.global_filters) await handleFilterChange(f.id, null)
  }

  const handleWidgetUpdated = (widgetId: string, update: any) => {
    setWidgets(prev => prev.map(w => w.widget_id === widgetId ? { ...w, ...update } : w))
  }

  const confirmDeleteWidget = async () => {
    if (!deleteTargetWidgetId) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${deleteTargetWidgetId}`)
      setWidgets(prev => prev.filter(w => w.widget_id !== deleteTargetWidgetId))
    } catch { /* ignore */ }
    setIsDeleting(false)
    setDeleteTargetWidgetId(null)
  }

  const refreshWidget = async (w: Widget) => {
    setRefreshingWidgets(prev => new Set(prev).add(w.widget_id))
    try {
      const { data } = await api.post(
        `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${w.widget_id}/refresh`, {}
      )
      setWidgets(prev => prev.map(ww =>
        ww.widget_id === w.widget_id
          ? { ...ww, cached_data: data.cached_data, chart_config: data.chart_config || ww.chart_config }
          : ww
      ))
    } catch { /* ignore */ } finally {
      setRefreshingWidgets(prev => { const s = new Set(prev); s.delete(w.widget_id); return s })
    }
  }

  const exportPDF = async () => {
    try {
      setIsExportingPDF(true)
      setError(null)
      const fileName = `${dashboard?.name || 'dashboard'}.pdf`

      // Wait for any pending G2 chart animations to finish before capturing canvases.
      // G2 default animation duration is 300ms — 500ms gives a safe margin.
      await new Promise(resolve => setTimeout(resolve, 500))

      // Capture each chart widget's AntV <canvas> directly. We avoid html2canvas on
      // the whole page because Tailwind v4 emits oklch()/color-mix() colors it can't
      // parse (that was the "Failed to generate PDF" error). The canvas pixels are
      // theme-independent, so toDataURL works; the server composes the final PDF
      // (tables, KPIs and the AI summary are rendered server-side from cached data).
      const chartImages: Record<string, string> = {}
      // Capture the *actual* on-screen layout. GridStack compacts/repositions
      // widgets live (float:false) and never persists that back to the DB, so
      // the stored positions can overlap. Reading el.gridstackNode gives the
      // exact grid coordinates currently rendered — the PDF then matches screen.
      const layout: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const w of widgets) {
        const el = document.getElementById(`gs-${w.widget_id}`) as (HTMLElement & { gridstackNode?: { x: number; y: number; w: number; h: number } }) | null
        if (el) {
          const node = el.gridstackNode
          layout[w.widget_id] = node && typeof node.x === 'number'
            ? { x: node.x, y: node.y, w: node.w, h: node.h }
            : {
                x: Number(el.getAttribute('gs-x')) || 0,
                y: Number(el.getAttribute('gs-y')) || 0,
                w: Number(el.getAttribute('gs-w')) || w.position.w,
                h: Number(el.getAttribute('gs-h')) || w.position.h,
              }
        }
        if (w.display_type !== 'chart') continue
        const canvas = el?.querySelector('canvas') as HTMLCanvasElement | null
        if (!canvas) continue
        try {
          chartImages[w.widget_id] = canvas.toDataURL('image/png').split(',')[1]
        } catch { /* tainted canvas — let the server re-render this one */ }
      }

      // Mirror the on-screen theme + layout so the PDF matches what the user
      // sees: dark export stays dark, light stays light, and the page is sized
      // to the dashboard's own aspect (preserving orientation, no clipping).
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      const gridWidthPx = gridRef.current?.clientWidth || undefined

      const resp = await api.post(
        `/api/projects/${projectId}/dashboards/${dashboardId}/pdf`,
        { chart_images: chartImages, theme, grid_width_px: gridWidthPx, columns: 12, layout },
        { responseType: 'blob' },
      )
      const blob = new Blob([resp.data], { type: 'application/pdf' })

      // Trigger the download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setIsExportingPDF(false)
    }
  }

  const addAISummary = async () => {
    setAddingSummary(true)
    try {
      await api.post(`/api/projects/${projectId}/dashboards/${dashboardId}/summary-widget`, {})
      await fetchDashboard()
    } catch { /* ignore */ } finally {
      setAddingSummary(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div id="dashboard-capture-container" className={cn("flex flex-col h-full overflow-hidden transition-all duration-300", isDashboardFullView ? "m-0 rounded-none h-screen w-screen" : "-m-6")} style={{ background: 'var(--bg-secondary)' }}>
      {/* ── Header ── */}
      <div className="h-20 flex items-center justify-between px-6 border-b shrink-0 relative z-30 transition-all duration-300"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        
        {/* Left Section */}
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to={`/projects/${projectId}/dashboards`}
            className="w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--border-color)] hover:bg-[var(--border-highlight)] transition-all duration-200 shrink-0 hover:scale-105 active:scale-95 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold truncate leading-none text-[var(--text-primary)]">
                {dashboard?.name}
              </h1>
              
              <div className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border transition-all duration-300 shrink-0",
                isConnected 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                  : "bg-amber-500/10 border-amber-500/20 text-amber-500"
              )}>
                {isConnected ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
              </div>
            </div>
            {dashboard?.description && (
              <p className="text-[11px] truncate text-[var(--text-muted)] mt-1.5 max-w-[400px]">
                {dashboard.description}
              </p>
            )}
          </div>
        </div>

        {/* Right Section (Controls Toolbar) */}
        <div className="flex items-center gap-2.5" data-html2canvas-ignore>
          
          {/* Group 1: Utility View Settings (Glass Pill Container) */}
          <div className="flex items-center bg-[var(--bg-secondary)]/80 border border-[var(--border-color)] rounded-xl p-1 shadow-sm">
            {/* Full View Toggle */}
            <button
              onClick={toggleFullscreen}
              className={cn(
                "w-8.5 h-8.5 rounded-lg flex items-center justify-center transition-all duration-200 hover:bg-[var(--border-color)]/50",
                isDashboardFullView ? "text-[#e94560] bg-[#e94560]/10" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
              title={isDashboardFullView ? "Exit Full View (Esc)" : "Full View Mode (Fullscreen)"}
            >
              {isDashboardFullView ? (
                <Minimize2 className="w-4 h-4 text-[#e94560]" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            {/* Version History */}
            <button
              onClick={() => setVersionDrawerOpen(true)}
              className="w-8.5 h-8.5 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/50 transition-all duration-200"
              title="Version history"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Refresh */}
            <button
              onClick={() => fetchDashboard()}
              className="w-8.5 h-8.5 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/50 transition-all duration-200"
              title="Refresh dashboard widgets"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing ? "animate-spin" : "")} />
            </button>
          </div>

          <div className="w-px h-6 bg-[var(--border-color)]" />

          {/* Group 2: Share Action */}
          <button
            onClick={() => setShareModalOpen(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 border hover:scale-[1.02] active:scale-[0.98]",
              (dashboard as any)?.public_token 
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.05)]' 
                : 'bg-[var(--border-highlight)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/20'
            )}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>

          {/* Group 3: Export Actions Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => !isExportingPDF && setIsExportOpen(!isExportOpen)}
              disabled={isExportingPDF}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50",
                isExportOpen
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)] border-[var(--text-primary)]"
                  : "bg-[var(--border-highlight)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/20"
              )}
            >
              {isExportingPDF ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isExportingPDF ? 'Exporting...' : 'Export'}</span>
              {!isExportingPDF && <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isExportOpen ? "rotate-180" : "")} />}
            </button>

            {isExportOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-2xl shadow-xl border border-[var(--border-color)] bg-[var(--bg-card)] backdrop-blur-xl p-2 z-50 animate-fade-in"
                style={{ transformOrigin: 'top right' }}
              >
                <button
                  onClick={() => {
                    setIsExportOpen(false)
                    exportPDF()
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--border-highlight)] transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Download className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Export as PDF</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">High-quality printer-ready page capture</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsExportOpen(false)
                    setPptxEditorOpen(true)
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--border-highlight)] transition-all text-left group mt-1"
                >
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileSliders className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Export as PPTX</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Presenton AI deck — generate & edit in a new tab</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-[var(--border-color)]" />

          {/* Group 4: AI Summary + Add Widget + Edit Layout */}
          <button
            onClick={addAISummary}
            disabled={addingSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-[0_4px_14px_rgba(99,102,241,0.25)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.35)] disabled:opacity-50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border border-indigo-500/30 shrink-0"
            title="Add an AI executive summary widget"
          >
            <Sparkles className={cn("w-3.5 h-3.5", addingSummary ? 'animate-spin' : 'animate-pulse')} />
            <span className="hidden sm:inline">AI Summary</span>
          </button>

          <button
            onClick={() => setAddWidgetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
            title="Add widget"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Widget</span>
          </button>

          {/* Group 5: Edit Mode */}
          <button
            onClick={() => setIsEditMode(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0",
              isEditMode
                ? "bg-rose-500 text-white shadow-[0_4px_12px_rgba(244,63,94,0.3)]"
                : "bg-[var(--border-highlight)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/20"
            )}
            title={isEditMode ? "Exit edit mode" : "Edit layout"}
          >
            {isEditMode ? (
              <>
                <EyeOff className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Done</span>
              </>
            ) : (
              <Pencil className="w-3.5 h-3.5" />
            )}
          </button>

        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-5 py-2.5 text-xs flex items-center justify-between mx-4 mt-4 rounded-xl">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-80 transition-opacity">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      {(((dashboard?.global_filters && dashboard.global_filters.length > 0) || isEditMode)) && (
        <DashboardFilters
          filters={dashboard?.global_filters || []}
          onFilterChange={handleFilterChange}
          onResetAll={handleResetFilters}
          isEditMode={isEditMode}
          widgets={widgets}
          onRemoveFilter={handleRemoveFilter}
          onAddFilterClick={() => setAddFilterOpen(true)}
        />
      )}

      {/* ── Widgets grid ── */}
      <div className="flex-1 overflow-auto p-4">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BarChart3 className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No widgets yet</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Add widgets from Chat using the &ldquo;Add to Dashboard&rdquo; button
            </p>
            <Link
              to={`/projects/${projectId}/chat`}
              className="px-4 py-2 rounded-xl bg-[#e94560] text-white font-medium text-sm hover:bg-[#e94560]/90 transition-all"
            >
              Go to Chat
            </Link>
          </div>
        ) : (
          <div className="grid-stack" ref={gridRef}>
            {widgets.map(w => (
              <div
                key={w.widget_id}
                id={`gs-${w.widget_id}`}
                className="grid-stack-item"
                gs-id={w.widget_id}
                gs-x={String(w.position.x)}
                gs-y={String(w.position.y)}
                gs-w={String(w.position.w)}
                gs-h={String(w.position.h)}
                gs-min-w="2"
                gs-min-h="2"
              >
                <div className="grid-stack-item-content">
                  <WidgetCard
                    widget={w}
                    isEditMode={isEditMode}
                    isSelected={selectedWidgetId === w.widget_id}
                    isRefreshing={refreshingWidgets.has(w.widget_id) || isRefreshing}
                    onSelect={() => setSelectedWidgetId(prev => prev === w.widget_id ? null : w.widget_id)}
                    onDelete={() => setDeleteTargetWidgetId(w.widget_id)}
                    onRefresh={() => refreshWidget(w)}
                    onExpand={() => setExpandedWidget(prev => prev === w.widget_id ? null : w.widget_id)}
                    onEdit={() => setEditingWidget(w)}
                    onUpdate={(upd) => handleWidgetUpdated(w.widget_id, upd)}
                    projectId={projectId!}
                    dashboardId={dashboardId!}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dashboard Chat ── */}
      <DashboardChat
        projectId={projectId!}
        dashboardId={dashboardId!}
        selectedWidgetId={selectedWidgetId}
        onWidgetUpdated={handleWidgetUpdated}
      />

      {/* ── Expanded widget modal ── */}
      {expandedWidget && (() => {
        const w = widgets.find(ww => ww.widget_id === expandedWidget)
        if (!w) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setExpandedWidget(null)} />
            <div
              id="expanded-widget-container"
              className={cn(
                "relative rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 ease-out",
                isWidgetFullscreen ? "w-screen h-screen max-w-none max-h-none border-none rounded-none" : "w-full max-w-5xl animate-[slide-up_0.3s_ease-out]"
              )}
              style={{ 
                background: 'var(--bg-card)', 
                border: isWidgetFullscreen ? 'none' : '1px solid var(--border-color)',
                maxHeight: isWidgetFullscreen ? '100vh' : '90vh',
                height: isWidgetFullscreen ? '100vh' : 'auto'
              }}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
                <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{w.title}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const el = document.getElementById('expanded-widget-container')
                      if (el) {
                        if (!document.fullscreenElement) {
                          el.requestFullscreen().catch(() => {})
                          setIsWidgetFullscreen(true)
                        } else {
                          document.exitFullscreen().catch(() => {})
                          setIsWidgetFullscreen(false)
                        }
                      }
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all"
                    style={{ color: 'var(--text-muted)' }}
                    title={isWidgetFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isWidgetFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => setExpandedWidget(null)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div 
                className="p-6 overflow-auto" 
                style={{ 
                  height: isWidgetFullscreen ? 'calc(100vh - 53px)' : '70vh' 
                }}
              >
                {w.display_type === 'kpi' ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-full max-w-md transform scale-125 origin-center">
                      <KPICard title={w.title} data={w.cached_data} />
                    </div>
                  </div>
                ) : w.display_type === 'ai_summary' ? (
                  <div className="h-full overflow-auto pr-2">
                    <AISummaryCard
                      title={w.title}
                      data={w.cached_data}
                      cachedText={w.cached_text}
                      onSave={async (text) => {
                        await api.put(
                          `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${w.widget_id}`,
                          { cached_text: text }
                        )
                        handleWidgetUpdated(w.widget_id, { cached_text: text })
                      }}
                    />
                  </div>
                ) : w.display_type === 'chart' && w.chart_config ? (
                  <AntVG2Chart
                    config={w.chart_config}
                    columns={w.cached_data?.columns}
                    rows={w.cached_data?.rows}
                    height={isWidgetFullscreen ? window.innerHeight - 150 : 550}
                  />
                ) : w.cached_data?.columns ? (
                  <AntVS2Table
                    columns={w.cached_data.columns}
                    rows={w.cached_data.rows}
                    height={isWidgetFullscreen ? window.innerHeight - 150 : 550}
                    tableConfig={w.table_config}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                    No data
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}


      {/* ── PPTX Export ── */}
      <PPTXExportModal
        isOpen={pptxEditorOpen}
        onClose={() => setPptxEditorOpen(false)}
        projectId={projectId!}
        dashboardId={dashboardId!}
        dashboardName={dashboard?.name || 'Dashboard'}
      />

      <ConfirmDialog
        isOpen={!!deleteTargetWidgetId}
        title="Delete Widget"
        message="Are you sure you want to delete this widget? It will be removed from the dashboard."
        confirmText="Delete Widget"
        onConfirm={confirmDeleteWidget}
        onCancel={() => setDeleteTargetWidgetId(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />

      <ShareDashboardModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        dashboardId={dashboardId!}
        initialToken={(dashboard as any)?.public_token ?? null}
        initialExpiresAt={(dashboard as any)?.public_expires_at ?? null}
      />

      <VersionHistoryDrawer
        isOpen={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        dashboardId={dashboardId!}
        onReverted={() => fetchDashboard()}
      />

      <AddWidgetModal
        isOpen={addWidgetOpen}
        onClose={() => setAddWidgetOpen(false)}
        projectId={projectId!}
        dashboardId={dashboardId!}
        onAdded={() => fetchDashboard()}
      />

      <WidgetEditorDrawer
        isOpen={!!editingWidget}
        onClose={() => setEditingWidget(null)}
        widget={editingWidget}
        projectId={projectId!}
        dashboardId={dashboardId!}
        onSaved={(updated) => {
          handleWidgetUpdated(updated.widget_id, updated)
          setEditingWidget(null)
        }}
      />

      {/* ── Add Filter Modal ── */}
      {addFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddFilterOpen(false)} />
          <div
            className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Add Global Filter</h3>
              <button onClick={() => setAddFilterOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 overflow-auto">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Filter Column
                </label>
                <select
                  value={newFilterColumn}
                  onChange={e => setNewFilterColumn(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- select column --</option>
                  {allDashboardColumns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Filter Type
                </label>
                <select
                  value={newFilterType}
                  onChange={e => setNewFilterType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                >
                  <option value="select">Dropdown Select</option>
                  <option value="multi_select">Multi-Select Dropdown</option>
                  <option value="date_range">Date Range</option>
                  <option value="number_range">Number Range</option>
                  <option value="search">Text Search</option>
                </select>
              </div>

              {/* AI filter suggestions */}
              <div>
                <button
                  onClick={handleSuggestFilters}
                  disabled={suggestingFilters}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#e94560] hover:underline disabled:opacity-60"
                >
                  {suggestingFilters
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing data…</>
                    : <><Sparkles className="w-3 h-3" /> Suggest filters from data</>}
                </button>
                {filterSuggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {filterSuggestions.map(s => (
                      <div key={s.column} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.column}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>{s.type}</span>
                        {s.reason && <span className="truncate flex-1" style={{ color: 'var(--text-muted)' }}>{s.reason}</span>}
                        <button
                          onClick={() => applySuggestedFilter(s)}
                          disabled={addingFilter}
                          className="ml-auto px-2 py-0.5 rounded bg-[#e94560]/10 text-[#e94560] font-medium hover:bg-[#e94560]/20 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Apply to widgets (default: all)
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
                  {widgets.map(w => (
                    <label key={w.widget_id} className="flex items-center gap-2 text-xs font-medium cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={selectedWidgets.includes(w.widget_id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedWidgets(prev => [...prev, w.widget_id])
                          } else {
                            setSelectedWidgets(prev => prev.filter(id => id !== w.widget_id))
                          }
                        }}
                        className="accent-[#e94560]"
                      />
                      {w.title || w.widget_id}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border-color)' }}>
              <button
                onClick={() => setAddFilterOpen(false)}
                className="px-3 py-2 rounded-lg text-xs font-medium hover:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddFilter}
                disabled={addingFilter || !newFilterColumn}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 disabled:opacity-50"
              >
                {addingFilter && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Filter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Widget Card ──────────────────────────────────────────────────────────────
interface WidgetCardProps {
  widget: Widget
  isEditMode: boolean
  isSelected: boolean
  isRefreshing?: boolean
  onSelect: () => void
  onDelete: () => void
  onRefresh: () => void
  onExpand: () => void
  onEdit: () => void
  onUpdate: (update: any) => void
  projectId: string
  dashboardId: string
}

function WidgetCard({
  widget: w, isEditMode, isSelected, isRefreshing, onSelect, onDelete,
  onRefresh, onExpand, onEdit, onUpdate, projectId, dashboardId,
}: WidgetCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [displayType, setDisplayType] = useState<string>(w.display_type)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setDisplayType(w.display_type) }, [w.display_type])

  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const toggleDisplayType = async (newType: string) => {
    setDisplayType(newType)
    try {
      await api.put(`/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${w.widget_id}`, { display_type: newType })
      onUpdate({ display_type: newType })
    } catch { /* ignore */ }
  }

  return (
    <div
      className={`flex flex-col h-full rounded-xl overflow-hidden border cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-[#e94560] border-[#e94560]' : 'hover:border-[#e94560]/30'
      }`}
      style={{ background: 'var(--bg-card)', borderColor: isSelected ? '#e94560' : 'var(--border-color)' }}
      onClick={onSelect}
    >
      {/* Widget header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        {isEditMode && (
          <span className="widget-drag-handle cursor-grab mr-1 text-[var(--text-muted)]">
            <GripVertical className="w-4 h-4" />
          </span>
        )}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {displayType === 'chart'
            ? <BarChart3 className="w-3.5 h-3.5 text-[#e94560] shrink-0" />
            : <Table2 className="w-3.5 h-3.5 text-[#0f3460] shrink-0" />}
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{w.title}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onExpand() }}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-all"
            style={{ color: 'var(--text-muted)' }}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v) }}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-all"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-xl w-40 overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                onClick={e => e.stopPropagation()}
              >
                {[
                  { label: 'Edit settings', icon: Settings2, action: onEdit },
                  { label: 'Switch to Chart', icon: BarChart3, action: () => toggleDisplayType('chart') },
                  { label: 'Switch to Table', icon: Table2, action: () => toggleDisplayType('table') },
                  { label: 'Refresh', icon: RefreshCw, action: onRefresh },
                  { label: 'Expand', icon: Maximize2, action: onExpand },
                ].map(({ label, icon: Icon, action }) => (
                  <button
                    key={label}
                    onClick={() => { action(); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-all"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
                {isEditMode && (
                  <button
                    onClick={() => { onDelete(); setShowMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-all border-t"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    <X className="w-3 h-3" />
                    Remove Widget
                  </button>
                )}
              </div>
            )}
          </div>
          {isEditMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Widget content */}
      <div className="flex-1 overflow-hidden p-2 relative" onClick={e => e.stopPropagation()}>
        {isRefreshing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}>
            <Loader2 className="w-6 h-6 animate-spin text-[#e94560]" />
          </div>
        )}
        {displayType === 'kpi' ? (
          <KPICard title={w.title} data={w.cached_data} />
        ) : displayType === 'ai_summary' ? (
          <AISummaryCard
            title={w.title}
            data={w.cached_data}
            cachedText={w.cached_text}
            onSave={async (text) => {
              await api.put(
                `/api/projects/${projectId}/dashboards/${dashboardId}/widgets/${w.widget_id}`,
                { cached_text: text }
              )
              onUpdate({ cached_text: text })
            }}
          />
        ) : displayType === 'chart' && w.chart_config ? (
          <AntVG2Chart
            config={w.chart_config}
            columns={w.cached_data?.columns}
            rows={w.cached_data?.rows}
            height={220}
          />
        ) : w.cached_data?.columns && w.cached_data.columns.length > 0 ? (
          <AntVS2Table
            columns={w.cached_data.columns}
            rows={w.cached_data.rows}
            height={220}
            tableConfig={w.table_config}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
            No data
          </div>
        )}
      </div>
    </div>
  )
}
