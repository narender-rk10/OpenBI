/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../lib/theme'

interface PlotlyChartProps {
  config: {
    plotly_data?: any[]
    plotly_layout?: any
    plotly_config?: any
    chart_type?: string
  }
  height?: number
  className?: string
}

declare global {
  interface Window {
    Plotly: any
  }
}

export default function PlotlyChart({ config, height = 380, className = '' }: PlotlyChartProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const { isDark } = useTheme()

  const renderChart = useCallback(() => {
    if (!divRef.current || !window.Plotly) return

    const data = config.plotly_data || []
    const baseLayout = config.plotly_layout || {}

    const darkOverrides = isDark
      ? {
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#94a3b8', family: 'Inter, sans-serif', size: 12 },
          xaxis: {
            ...(baseLayout.xaxis || {}),
            gridcolor: '#334155',
            linecolor: '#334155',
            tickcolor: '#94a3b8',
            zerolinecolor: '#334155',
          },
          yaxis: {
            ...(baseLayout.yaxis || {}),
            gridcolor: '#334155',
            linecolor: '#334155',
            tickcolor: '#94a3b8',
            zerolinecolor: '#334155',
          },
          legend: { ...(baseLayout.legend || {}), bgcolor: 'rgba(0,0,0,0)', font: { color: '#94a3b8' } },
        }
      : {
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#475569', family: 'Inter, sans-serif', size: 12 },
        }

    const layout = {
      ...baseLayout,
      ...darkOverrides,
      height,
      margin: baseLayout.margin || { l: 50, r: 20, t: 40, b: 50 },
      autosize: true,
    }

    const plotConfig = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
      modeBarButtonsToAdd: [
        {
          name: 'Download PNG',
          icon: window.Plotly.Icons?.camera || { width: 857, height: 1000, path: '' },
          click: (gd: any) => window.Plotly.downloadImage(gd, { format: 'png', filename: 'chart' }),
        },
      ],
      ...(config.plotly_config || {}),
    }

    window.Plotly.react(divRef.current, data, layout, plotConfig)
  }, [config, height, isDark])

  // Load Plotly from CDN if not already loaded
  useEffect(() => {
    if (window.Plotly) {
      renderChart()
      return
    }
    const existingScript = document.querySelector('script[src*="plotly"]')
    if (existingScript) {
      existingScript.addEventListener('load', renderChart)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.plot.ly/plotly-2.35.2.min.js'
    script.onload = renderChart
    document.head.appendChild(script)
  }, [renderChart])

  useEffect(() => {
    if (window.Plotly) renderChart()
  }, [renderChart])

  // Resize observer
  useEffect(() => {
    if (!divRef.current) return
    const obs = new ResizeObserver(() => {
      if (window.Plotly && divRef.current) {
        window.Plotly.Plots?.resize(divRef.current)
      }
    })
    obs.observe(divRef.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={divRef}
      className={`w-full ${className}`}
      style={{ height, minHeight: height }}
    />
  )
}
