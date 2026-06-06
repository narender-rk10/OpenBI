/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, RefreshCw, Sparkles, X } from 'lucide-react'
import api from '../../lib/api'

interface AISummaryCardProps {
  title: string
  data?: { columns: string[]; rows: any[][] }
  cachedText?: string
  onSave?: (text: string) => Promise<void>
  className?: string
}

export default function AISummaryCard({
  title,
  data,
  cachedText,
  onSave,
  className = '',
}: AISummaryCardProps) {
  const [summary, setSummary] = useState<string>(cachedText || '')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!summary && data?.rows?.length) generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cachedText) setSummary(cachedText)
  }, [cachedText])

  const generate = async () => {
    if (!data?.columns?.length || !data.rows?.length) {
      setError('No data to summarize.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const sample = data.rows.slice(0, 30)
      const prompt = `You are a business analyst. In 3-4 plain-English sentences, summarize what this data shows.
Be specific with numbers. No bullet points, no headings, no markdown.

Title: ${title}
Columns: ${data.columns.join(', ')}
Rows (first 30): ${JSON.stringify(sample)}`
      const { data: resp } = await api.post('/api/llm/complete', { prompt })
      const text = (resp?.text || resp?.completion || '').trim()
      setSummary(text)
      await onSave?.(text)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Summary generation failed')
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => {
    setEditValue(summary)
    setIsEditing(true)
    setTimeout(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(len, len)
    }, 50)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditValue('')
  }

  const saveEdit = async () => {
    const text = editValue.trim()
    if (!text) return
    setSaving(true)
    setSummary(text)
    setIsEditing(false)
    try {
      await onSave?.(text)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#e94560]" />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            AI Summary
          </span>
          {saving && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saving…</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {isEditing ? (
            <>
              <button
                onClick={saveEdit}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-green-500/10 text-green-500 transition-all"
                title="Save"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={cancelEdit}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-all"
                style={{ color: 'var(--text-muted)' }}
                title="Cancel"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                disabled={loading}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 disabled:opacity-30 transition-all"
                style={{ color: 'var(--text-muted)' }}
                title="Edit summary"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={generate}
                disabled={loading}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 disabled:opacity-30 transition-all"
                style={{ color: 'var(--text-muted)' }}
                title="Regenerate"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="w-full h-full min-h-[80px] text-sm p-2 rounded-lg resize-none outline-none focus:ring-1 focus:ring-[#e94560]"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
          />
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-5 h-5 border-2 border-[#e94560] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : summary ? (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {summary}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
            Click refresh to generate a summary, or use &ldquo;AI Summary&rdquo; in the dashboard toolbar.
          </p>
        )}
      </div>
    </div>
  )
}
