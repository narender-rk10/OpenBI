/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../lib/theme'

interface AntVG2ChartProps {
  /** G2 chart config from chart agent — must contain g2_spec */
  config: {
    chart_type?: string
    g2_spec?: any
    // Legacy Plotly fields (for backward compat detection)
    plotly_data?: any[]
    plotly_layout?: any
    [k: string]: any
  }
  columns?: string[]
  rows?: any[][]
  height?: number
  className?: string
}

declare global {
  interface Window { G2?: any }
}

const G2_CDN = 'https://cdn.jsdelivr.net/npm/@antv/g2@5.2/dist/g2.min.js'

// Relative luminance — returns true when the color is too dark to see on a dark background
function isTooDark(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.15
}

// Bright fallbacks used when a brand color is too dark for dark-mode backgrounds
const DARK_FALLBACKS = ['#e94560', '#38bdf8', '#4ade80', '#facc15', '#a78bfa', '#22d3ee', '#fb923c', '#f472b6']

/**
 * Renders an AntV G2 chart from a g2_spec produced by the Chart Agent.
 * Loads G2 from CDN on first use (cached by browser thereafter).
 * Falls back to a legacy Plotly render path when only plotly_data is present.
 */
export default function AntVG2Chart({
  config,
  columns,
  rows,
  height = 380,
  className = '',
}: AntVG2ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const { isDark } = useTheme()

  const renderChart = () => {
    if (!containerRef.current || !window.G2) return

    const g2Spec = config?.g2_spec
    if (!g2Spec) {
      setRenderError('No chart specification available.')
      return
    }

    setRenderError(null)

    // Destroy existing chart
    if (chartRef.current) {
      try { chartRef.current.destroy() } catch { /* ignore */ }
      chartRef.current = null
    }

    // Build actual data array from columns + rows when available
    let chartData: any[] | undefined
    if (columns?.length && rows?.length) {
      chartData = rows.map(row => {
        const obj: Record<string, any> = {}
        columns.forEach((col, i) => { obj[col] = row[i] })
        return obj
      })
    }

    // Resolve brand colors; replace any too-dark colors when in dark mode
    const rawColors: string[] = g2Spec.theme?.color10 ?? DARK_FALLBACKS
    const chartColors = isDark
      ? rawColors.map((c: string, i: number) => isTooDark(c) ? (DARK_FALLBACKS[i] ?? DARK_FALLBACKS[0]) : c)
      : rawColors

    const textColor = isDark ? '#94a3b8' : '#374151'
    const baseTheme = isDark ? 'classicDark' : 'classic'

    // Axis colors — our theme values win over anything the LLM put in the spec
    const axisStyle = isDark
      ? { labelFill: '#94a3b8', titleFill: '#94a3b8', gridStroke: '#334155', lineStroke: '#334155', tickStroke: '#334155' }
      : { labelFill: '#374151', titleFill: '#374151', gridStroke: '#e5e7eb', lineStroke: '#e5e7eb', tickStroke: '#e5e7eb' }

    const specAxis = g2Spec.axis ?? {}
    const mergedAxis: any = {}
    for (const k of ['x', 'y']) {
      mergedAxis[k] = {
        ...(specAxis[k] ?? {}),
        labelFill: axisStyle.labelFill,
        titleFill: axisStyle.titleFill,
        gridStroke: axisStyle.gridStroke,
        lineStroke: axisStyle.lineStroke,
        tickStroke: axisStyle.tickStroke,
      }
    }

    // Build spec with corrected theme — use `type` key to reference G2 built-in theme
    // while still applying our color/background overrides on top of it.
    const spec: any = {
      ...g2Spec,
      theme: {
        type: baseTheme,         // ← G2 v5: 'type' selects the named base theme
        color10: chartColors,
        background: 'transparent',
      },
      axis: mergedAxis,
      legend: {
        ...(g2Spec.legend ?? {}),
        color: {
          itemLabelFill: textColor,
          itemNameFill: textColor,
          titleFill: textColor,
          itemValueFill: textColor,
          ...((g2Spec.legend as any)?.color ?? {}),
        },
      },
    }

    // Patch chart title — G2 v5 uses `text` key inside title objects
    if (spec.title) {
      if (typeof spec.title === 'string') {
        spec.title = { text: spec.title, style: { fill: isDark ? '#e2e8f0' : '#111827' } }
      } else {
        // Support both 'text' and legacy 'title' key from LLM output
        const titleText = spec.title.text || spec.title.title || ''
        spec.title = {
          ...spec.title,
          text: titleText,
          style: { ...(spec.title.style ?? {}), fill: isDark ? '#e2e8f0' : '#111827' },
        }
        delete spec.title.title  // remove legacy key
      }
    }

    // Inject real data — always overrides sample data from LLM
    if (chartData) {
      spec.data = chartData
    }

    try {
      // Do NOT pass theme to constructor — let chart.options() handle it via spec.theme.type
      const chart = new window.G2.Chart({
        container: containerRef.current,
        autoFit: true,
        height,
      })
      chart.options(spec)
      chart.render()
      chartRef.current = chart
    } catch (err: any) {
      console.error('[AntVG2Chart] render error:', err)
      setRenderError(err?.message || 'Chart rendering failed')
    }
  }

  // Load G2 from CDN, then render
  useEffect(() => {
    if (window.G2) {
      renderChart()
      return
    }
    const existing = document.querySelector(`script[src="${G2_CDN}"]`)
    if (existing) {
      existing.addEventListener('load', renderChart)
      return () => existing.removeEventListener('load', renderChart)
    }
    const script = document.createElement('script')
    script.src = G2_CDN
    script.onload = renderChart
    document.head.appendChild(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, columns, rows, height, isDark])

  // Re-render when theme changes
  useEffect(() => {
    if (window.G2) renderChart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try { chartRef.current.destroy() } catch { /* ignore */ }
        chartRef.current = null
      }
    }
  }, [])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => {
      if (chartRef.current?.forceFit) {
        try { chartRef.current.forceFit() } catch { /* ignore */ }
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // If this is a legacy Plotly config (no g2_spec), render via CDN Plotly
  if (!config?.g2_spec && config?.plotly_data) {
    return <LegacyPlotlyFallback config={config} height={height} className={className} />
  }

  if (renderError) {
    return (
      <div
        className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl ${className}`}
        style={{ height, minHeight: height, background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)' }}
      >
        <span className="text-2xl">📊</span>
        <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Chart render failed</p>
        <p className="text-[10px] text-center max-w-xs px-4" style={{ color: 'var(--text-muted)' }}>{renderError}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`w-full ${className}`}
      style={{ height, minHeight: height }}
    />
  )
}

// ── Legacy fallback for old Plotly-format widgets ─────────────────────────────
function LegacyPlotlyFallback({
  config,
  height,
  className,
}: {
  config: any
  height: number
  className: string
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()

  useEffect(() => {
    const render = () => {
      if (!divRef.current || !(window as any).Plotly) return
      const Plotly = (window as any).Plotly
      const layout = {
        ...(config.plotly_layout || {}),
        height,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: isDark ? '#94a3b8' : '#475569' },
        autosize: true,
      }
      Plotly.react(divRef.current, config.plotly_data || [], layout, { responsive: true, displayModeBar: false })
    }
    if ((window as any).Plotly) { render(); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.plot.ly/plotly-2.35.2.min.js'
    s.onload = render
    document.head.appendChild(s)
  }, [config, height, isDark])

  return <div ref={divRef} className={`w-full ${className}`} style={{ height }} />
}
