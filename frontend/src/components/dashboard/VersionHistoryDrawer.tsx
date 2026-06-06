/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { X, History, RotateCcw } from 'lucide-react'
import api from '../../lib/api'

interface Version {
  _id: string
  version_number: number
  change_description: string
  changed_by: string | null
  created_at: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  dashboardId: string
  onReverted: () => void
}

export default function VersionHistoryDrawer({ isOpen, onClose, dashboardId, onReverted }: Props) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, dashboardId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/api/dashboards/${dashboardId}/versions`)
      setVersions(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }

  const revert = async (versionId: string, versionNumber: number) => {
    if (!confirm(`Revert dashboard to version ${versionNumber}? Current state will be saved as a new version first.`)) return
    setReverting(versionId)
    try {
      await api.post(`/api/dashboards/${dashboardId}/versions/${versionId}/revert`)
      onReverted()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Revert failed')
    } finally {
      setReverting(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#e94560]" />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Version history</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full" />
            </div>
          )}
          {error && <p className="text-xs text-red-500 px-2">{error}</p>}
          {!loading && versions.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No history yet. Edits will appear here.
            </p>
          )}
          {versions.map((v) => (
            <div
              key={v._id}
              className="rounded-lg p-3 border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#e94560]">v{v.version_number}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-primary)' }}>
                {v.change_description || 'No description'}
              </p>
              <button
                onClick={() => revert(v._id, v.version_number)}
                disabled={reverting === v._id}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:bg-white/5 disabled:opacity-50"
                style={{ color: 'var(--text-secondary)' }}
              >
                <RotateCcw className="w-3 h-3" />
                {reverting === v._id ? 'Reverting…' : 'Revert to this version'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
