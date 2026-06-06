/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { X, Copy, Check, Globe, Lock } from 'lucide-react'
import api from '../../lib/api'

interface Props {
  isOpen: boolean
  onClose: () => void
  dashboardId: string
  initialToken?: string | null
  initialExpiresAt?: string | null
}

export default function ShareDashboardModal({ isOpen, onClose, dashboardId, initialToken, initialExpiresAt }: Props) {
  const [token, setToken] = useState<string | null>(initialToken ?? null)
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt ?? null)
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setToken(initialToken ?? null)
      setExpiresAt(initialExpiresAt ?? null)
      setError(null)
      setCopied(false)
    }
  }, [isOpen, initialToken, initialExpiresAt])

  if (!isOpen) return null

  const publicUrl = token ? `${window.location.origin}/public/${token}` : ''

  const enableShare = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post(`/api/dashboards/${dashboardId}/public`, {
        enabled: true,
        expires_in_days: expiresInDays === '' ? null : Number(expiresInDays),
      })
      setToken(data.token)
      setExpiresAt(data.expires_at ?? null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to enable share link')
    } finally {
      setLoading(false)
    }
  }

  const disableShare = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.post(`/api/dashboards/${dashboardId}/public`, { enabled: false })
      setToken(null)
      setExpiresAt(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to disable share link')
    } finally {
      setLoading(false)
    }
  }

  const copyUrl = async () => {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2">
            {token ? <Globe className="w-4 h-4 text-[#e94560]" /> : <Lock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Public share link</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {token ? (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Anyone with this link can view the dashboard read-only.
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicUrl}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-mono"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={copyUrl}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              {expiresAt && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Expires {new Date(expiresAt).toLocaleString()}
                </p>
              )}
              <button
                onClick={disableShare}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                Revoke link
              </button>
            </>
          ) : (
            <>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Generate a read-only public link. No login required to view.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Expires in (days, optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Never"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                onClick={enableShare}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-[#e94560] text-white hover:bg-[#e94560]/90 disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate link'}
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
