/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import AntVG2Chart from '../components/dashboard/AntVG2Chart'
import AntVS2Table from '../components/dashboard/AntVS2Table'

interface PublicWidget {
  _id: string
  widget_id: string
  title: string
  display_type: string
  chart_config?: any
  table_config?: any
  cached_data?: { columns: string[]; rows: any[][] }
  position: { x: number; y: number; w: number; h: number }
}

interface PublicDashboard {
  _id: string
  name: string
  description: string
  global_filters: any[]
}

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>()
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null)
  const [widgets, setWidgets] = useState<PublicWidget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    const apiBase = import.meta.env.VITE_API_URL || ''
    axios
      .get(`${apiBase}/api/public/${token}`)
      .then((resp) => {
        setDashboard(resp.data.dashboard)
        setWidgets(resp.data.widgets || [])
      })
      .catch((err) => {
        if (err.response?.status === 410) setError('This share link has expired.')
        else if (err.response?.status === 404) setError('Share link not found or revoked.')
        else setError(err.response?.data?.detail || 'Failed to load dashboard')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center" style={{ background: 'var(--bg-secondary)' }}>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{error}</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Please contact the dashboard owner for an updated link.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-secondary)' }}>
      <header className="px-6 py-4 border-b" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{dashboard?.name}</h1>
        {dashboard?.description && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{dashboard.description}</p>
        )}
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Powered by OpenBI · Read-only public view</p>
      </header>

      <main className="p-4 grid grid-cols-12 auto-rows-[80px] gap-3">
        {widgets.map((w) => (
          <div
            key={w.widget_id}
            className="rounded-xl border overflow-hidden flex flex-col"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              gridColumn: `span ${Math.max(2, w.position.w)} / span ${Math.max(2, w.position.w)}`,
              gridRow: `span ${Math.max(2, w.position.h)} / span ${Math.max(2, w.position.h)}`,
            }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{w.title}</h3>
            </div>
            <div className="flex-1 overflow-hidden p-2">
              {w.display_type === 'chart' && w.chart_config ? (
                <AntVG2Chart config={w.chart_config} columns={w.cached_data?.columns} rows={w.cached_data?.rows} height={220} />
              ) : w.cached_data?.columns?.length ? (
                <AntVS2Table columns={w.cached_data.columns} rows={w.cached_data.rows} height={220} tableConfig={w.table_config} />
              ) : w.display_type === 'kpi' && w.cached_data?.rows?.[0] ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <p className="text-3xl font-black text-[#e94560]">{w.cached_data.rows[0][0]}</p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>No data</div>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
