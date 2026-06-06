import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutDashboard, Plus, Trash2, Share2, Clock, Users } from 'lucide-react'
import api from '../lib/api'
import type { Dashboard } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'

export default function DashboardsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboards()
  }, [projectId])

  const fetchDashboards = async () => {
    try {
      setError(null)
      const { data } = await api.get(`/api/projects/${projectId}/dashboards`)
      setDashboards(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load dashboards')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const { data } = await api.post(`/api/projects/${projectId}/dashboards`, { name, description })
      navigate(`/projects/${projectId}/dashboards/${data._id}`)
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Failed to create dashboard')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, dashboard: Dashboard) => {
    e.stopPropagation()
    setDeleteTarget(dashboard)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${projectId}/dashboards/${deleteTarget._id}`)
      fetchDashboards()
    } catch { /* ignore */ }
    setIsDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto animate-[fade-in_0.5s_ease-out]">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: 'rgba(233,69,96,0.1)', border: '1px solid rgba(233,69,96,0.2)' }}>
            <LayoutDashboard className="w-6 h-6 text-[#e94560]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboards</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Build interactive dashboards from your chat insights.
            </p>
          </div>
        </div>
        <button
          id="create-dashboard-btn"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/20 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Dashboard
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              id="dashboard-name"
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Dashboard name" required
              className="px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          {createError && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{createError}</div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {dashboards.length === 0 ? (
        <div className="card p-16 text-center">
          <LayoutDashboard className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No dashboards yet</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Create a dashboard and add widgets from your chat sessions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((d) => (
            <div
              key={d._id}
              className="card p-5 cursor-pointer group"
              onClick={() => navigate(`/projects/${projectId}/dashboards/${d._id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#e94560]/10 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-[#e94560]" />
                </div>
                <div className="flex transition-all">
                  {d.is_shared && (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[#0f3460]">
                      <Share2 className="w-4 h-4" />
                    </div>
                  )}
                  <button
                    onClick={(e) => handleDeleteClick(e, d)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-[var(--text-secondary)] transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>{d.name}</h3>
              <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{d.description || 'No description'}</p>
              <div className="flex items-center gap-3 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(d.updated_at).toLocaleDateString()}</span>
                {d.is_shared && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Shared</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Dashboard"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All contained widgets will be permanently removed.`}
        confirmText="Delete Dashboard"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
