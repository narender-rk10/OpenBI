/**
 * Global error-modal system.
 *
 * Wrap the app in <ErrorModalProvider> and call `useErrorModal().showError(...)`
 * (or the helper `showApiError(err)`) from anywhere to surface a consistent,
 * themed error dialog instead of `alert()` or silent failures.
 */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from 'react'
import { AlertCircle, Copy, Check, X } from 'lucide-react'

export interface ErrorDetails {
  title?: string
  /** Short, human-readable description shown to the user. */
  description: string
  /** Raw/technical detail shown behind a "Copy details" affordance. */
  details?: string
}

interface ErrorModalContextType {
  showError: (e: ErrorDetails) => void
  /** Convenience for Axios/fetch errors — extracts backend `detail`. */
  showApiError: (err: unknown, fallback?: string) => void
}

const ErrorModalContext = createContext<ErrorModalContextType | undefined>(undefined)

/** Pull the most useful message out of an Axios error / Error / unknown. */
export function extractApiError(err: unknown, fallback = 'Something went wrong.'): ErrorDetails {
  // Axios-style error
  const anyErr = err as any
  const resp = anyErr?.response
  if (resp) {
    const detail = resp.data?.detail ?? resp.data?.message
    const description = typeof detail === 'string'
      ? detail
      : `Request failed with status ${resp.status}.`
    return {
      title: `Error ${resp.status}`,
      description,
      details: JSON.stringify(
        { status: resp.status, url: anyErr?.config?.url, data: resp.data },
        null, 2,
      ),
    }
  }
  if (anyErr?.message) {
    return { description: String(anyErr.message), details: anyErr.stack }
  }
  return { description: fallback }
}

export function ErrorModalProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<ErrorDetails | null>(null)
  const [copied, setCopied] = useState(false)

  const showError = useCallback((e: ErrorDetails) => {
    setCopied(false)
    setError(e)
  }, [])

  const showApiError = useCallback((err: unknown, fallback?: string) => {
    setCopied(false)
    setError(extractApiError(err, fallback))
    // eslint-disable-next-line no-console
    console.error('[error-modal]', err)
  }, [])

  const close = useCallback(() => setError(null), [])

  useEffect(() => {
    if (!error) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [error, close])

  const copyDetails = async () => {
    const text = error?.details || error?.description || ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <ErrorModalContext.Provider value={{ showError, showApiError }}>
      {children}
      {error && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-fade-up"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {error.title || 'Something went wrong'}
                  </h3>
                </div>
                <button onClick={close} className="p-1 transition-colors"
                  style={{ color: 'var(--text-muted)' }}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm leading-relaxed mb-5 ml-1" style={{ color: 'var(--text-secondary)' }}>
                {error.description}
              </p>

              {error.details && (
                <pre className="text-[11px] p-3 rounded-lg overflow-auto max-h-40 mb-5"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                  {error.details}
                </pre>
              )}

              <div className="flex gap-3 justify-end">
                {(error.details || error.description) && (
                  <button onClick={copyDetails}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-all flex items-center gap-1.5"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy details'}
                  </button>
                )}
                <button onClick={close}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#e94560] hover:bg-[#e94560]/90 transition-all">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ErrorModalContext.Provider>
  )
}

export function useErrorModal() {
  const ctx = useContext(ErrorModalContext)
  if (!ctx) throw new Error('useErrorModal must be used within ErrorModalProvider')
  return ctx
}
