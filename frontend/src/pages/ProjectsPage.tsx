import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, Trash2, MessageSquare, LayoutDashboard } from 'lucide-react'
import api from '../lib/api'
import type { Project } from '../lib/types'
import ConfirmDialog from '../components/shared/ConfirmDialog'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Dialog state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const navigate = useNavigate()

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setError(null)
      const { data } = await api.get('/api/projects')
      setProjects(data)
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach the backend. Make sure the server is running.')
      } else {
        setError(err.response?.data?.detail || 'Failed to load projects')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      await api.post('/api/projects', { name, description })
      setName('')
      setDescription('')
      setShowCreate(false)
      fetchProjects()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation()
    setDeleteTarget(project)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/projects/${deleteTarget._id}`)
      fetchProjects()
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
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 text-red-400 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={() => { setLoading(true); fetchProjects() }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-medium transition-all"
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Projects</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Each project groups your data sources, agents, chats, and dashboards.
          </p>
        </div>
        <button
          id="create-project-btn"
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/25"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="card p-5 mb-6 animate-[slide-up_0.3s_ease-out]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              required
            />
            <input
              id="project-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="px-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[#e94560]/30"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
          {createError && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{createError}</div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              id="project-submit"
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="card p-16 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No projects yet</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Get started in 3 steps:
          </p>
          <div className="flex flex-col items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>1. Create a project</span>
            <span>2. Add a data source</span>
            <span>3. Create an agent and start chatting</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 px-4 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#e94560]/90 transition-all"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project._id}
              className="card p-5 cursor-pointer group"
              onClick={() => navigate(`/projects/${project._id}/chat`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#0f3460]/20 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-[#0f3460]" />
                </div>
                <button
                  onClick={(e) => handleDeleteClick(e, project)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-[var(--text-secondary)] transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
                {project.name}
              </h3>
              <p className="text-xs mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                {project.description || 'No description'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project._id}/chat`) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[#e94560]/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project._id}/dashboards`) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[#e94560]/10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboards
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone and will delete all associated chats, agents, and dashboards.`}
        confirmText="Delete Project"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}
