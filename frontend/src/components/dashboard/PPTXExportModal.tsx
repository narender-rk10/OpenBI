/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import {
  X, FileSliders, Loader2, Sparkles, ExternalLink,
  AlertTriangle, Clock, CheckCircle, XCircle,
} from 'lucide-react'

const PRESENTON_DIRECT = import.meta.env.VITE_PRESENTON_URL ?? 'http://localhost:7771'
const POLL_MS = 5_000

function getToken() { return localStorage.getItem('openbi_token') || '' }

interface PptxJob {
  job_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  feedback: string | null
  edit_path: string | null
  error: string | null
  created_at: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  projectId: string
  dashboardId: string
  dashboardName: string
}

// ── Job row ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.floor(min / 60)}h ago`
}

const STATUS_META = {
  queued:     { label: 'Queued',       cls: 'text-[var(--text-muted)] bg-[var(--bg-card)]',    Icon: Clock },
  processing: { label: 'Generating…', cls: 'text-orange-400 bg-orange-500/10',                  Icon: Loader2 },
  completed:  { label: 'Ready',        cls: 'text-emerald-500 bg-emerald-500/10',                Icon: CheckCircle },
  failed:     { label: 'Failed',       cls: 'text-rose-500 bg-rose-500/10',                      Icon: XCircle },
} as const

function JobRow({ job, dashboardName }: { job: PptxJob; dashboardName: string }) {
  const meta = STATUS_META[job.status] ?? STATUS_META.queued
  const { Icon, label, cls } = meta
  const openUrl = job.edit_path ? `${PRESENTON_DIRECT}${job.edit_path}` : null

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Status badge */}
      <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 ${cls}`}>
        <Icon className={`w-3 h-3 ${job.status === 'processing' ? 'animate-spin' : ''}`} />
        {label}
      </span>

      {/* Label + time */}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {job.feedback ? `"${job.feedback}"` : dashboardName}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {timeAgo(job.created_at)}
        </p>
      </div>

      {/* Action */}
      {job.status === 'completed' && openUrl && (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#e94560] text-white text-[11px] font-semibold hover:bg-[#e94560]/90 transition-all shrink-0"
        >
          <ExternalLink className="w-3 h-3" /> Open
        </a>
      )}
      {job.status === 'failed' && job.error && (
        <span
          className="text-[10px] max-w-[8rem] truncate shrink-0"
          style={{ color: 'var(--text-muted)' }}
          title={job.error}
        >
          {job.error}
        </span>
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function PPTXExportModal({
  isOpen, onClose, projectId, dashboardId, dashboardName,
}: Props) {
  const [jobs, setJobs] = useState<PptxJob[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const base = `/api/projects/${projectId}/dashboards/${dashboardId}/pptx/presenton`

  const fetchJobs = async () => {
    try {
      const resp = await fetch(`${base}/jobs`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (resp.ok) setJobs(await resp.json())
    } catch { /* ignore */ }
  }

  // Load jobs whenever modal opens
  useEffect(() => {
    if (!isOpen) return
    setLoadingJobs(true)
    fetchJobs().finally(() => setLoadingJobs(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Poll while there are active jobs (no time limit — server handles it all)
  const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'processing')
  useEffect(() => {
    if (!isOpen) return
    if (pollRef.current) clearInterval(pollRef.current)
    if (hasActive) pollRef.current = setInterval(fetchJobs, POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasActive])

  if (!isOpen) return null

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const resp = await fetch(`${base}/async`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: instructions.trim() || null }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || resp.statusText)
      }
      const { job_id } = await resp.json()
      // Optimistically prepend the queued job so user sees it immediately
      setJobs(prev => [{
        job_id,
        status: 'queued',
        feedback: instructions.trim() || null,
        edit_path: null,
        error: null,
        created_at: new Date().toISOString(),
      }, ...prev])
      setInstructions('')
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to queue presentation')
    } finally {
      setSubmitting(false)
    }
  }

  const activeCount = jobs.filter(j => j.status === 'queued' || j.status === 'processing').length

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-up"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <FileSliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Export as PPTX</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>AI presentation via Presenton</p>
            </div>
          </div>
          {activeCount > 0 && (
            <span className="ml-3 mr-auto flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {activeCount} generating
            </span>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Submit form */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Special instructions{' '}
            <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.metaKey && submit()}
            rows={3}
            placeholder={`e.g. "Add a key takeaways slide", "Use a dark executive theme"…`}
            className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none transition-all focus:ring-2 focus:ring-[#e94560]/30 focus:border-[#e94560]"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          {submitError && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{submitError}</p>
            </div>
          )}
          <button
            onClick={submit}
            disabled={submitting}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-semibold hover:bg-[#e94560]/90 transition-all disabled:opacity-60"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Queuing…</>
              : <><Sparkles className="w-4 h-4" /> Generate presentation</>
            }
          </button>
          <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Runs in the background — close this and come back anytime to check.
          </p>
        </div>

        {/* Jobs list */}
        <div className="max-h-64 overflow-y-auto">
          {loadingJobs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No presentations yet — generate one above.
            </p>
          ) : (
            <div className="p-3 space-y-2">
              {jobs.map(job => (
                <JobRow key={job.job_id} job={job} dashboardName={dashboardName} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
